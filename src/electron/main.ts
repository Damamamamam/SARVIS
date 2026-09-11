/**
 * Main process for SARVIS Windows Desktop Application.
 *
 * Runs the Electron window, system tray, local JarvisBrain orchestrator,
 * 8-Key API Rotator, Windows native controls, and IPC bridge.
 */
import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Path to the persistent config file that tracks first-run state. */
function getConfigFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig(): Record<string, unknown> {
  const p = getConfigFilePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(data: Record<string, unknown>): void {
  const p = getConfigFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function isFirstRun(): boolean {
  const cfg = readConfig();
  return cfg.setupComplete !== true;
}

function markSetupComplete(): void {
  const cfg = readConfig();
  cfg.setupComplete = true;
  writeConfig(cfg);
}

import { JarvisBrain } from '../agent/brain.js';
import { loadKeysFromEnv } from '../config/load_keys.js';
import { WinControlService } from '../services/win_control.js';
import { WinScreenGuard } from '../services/win_screen_guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let jarvisBrain: JarvisBrain | null = null;
let winControl: WinControlService | null = null;
let winGuard: WinScreenGuard | null = null;

function getEnvFilePath(): string {
  return path.join(app.getAppPath(), '.env');
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

function updateEnvFile(filePath: string, updates: Record<string, string>): void {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const lines = content.split('\n');
  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (key in updates) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!updatedKeys.has(k)) {
      newLines.push(`${k}=${v}`);
    }
  }

  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
  // Also update process.env
  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = v;
  }
}

function initJarvis(): void {
  const keys = loadKeysFromEnv();
  jarvisBrain = new JarvisBrain({ keys });
  winControl = new WinControlService();
  winGuard = new WinScreenGuard();

  winGuard.onNudge((nudge) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('brain:nudge', nudge);
    }
  });
  winGuard.start();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SARVIS Windows Desktop',
    backgroundColor: '#0B0F19',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const uiPath = path.join(__dirname, '../ui/index.html');
  mainWindow.loadFile(uiPath);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('app:first-run-state', isFirstRun());
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send('app:first-run-state', isFirstRun());
  });

  mainWindow.on('close', (event: Electron.Event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
    return false;
  });
}

function createTray(): void {
  try {
    // 16x16 circular indigo icon PNG data URL
    const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAkG9G/v//z0CcmZl5P1EGMTAwMCw/9P8fUQMIPAZV44cNgA0lZgNIMoFkA6D2oBsA0wQ3gGAY0AygmwGjBhA7DEB2E90AkgNA5kBqB5BsAFIJAEt7Fj40q6Z2AAAAAElFTkSuQmCC';
    const icon = nativeImage.createFromDataURL(pngDataUrl);

    tray = new Tray(icon);
    tray.setToolTip('SARVIS Windows Assistant');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open SARVIS',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: 'Rotator Status',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('navigate', 'rotator');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit SARVIS',
        click: () => {
          (app as any).isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (err) {
    console.error('Tray creation failed (non-fatal):', err);
  }
}

function registerIpc(): void {
  ipcMain.handle('brain:hear', async (_event: Electron.IpcMainInvokeEvent, utterance: string) => {
    if (!jarvisBrain) return { reply: 'SARVIS brain initializing...' };
    return await jarvisBrain.hear(utterance);
  });

  ipcMain.handle('brain:get-status', () => {
    if (!jarvisBrain) return null;
    return {
      rotator: jarvisBrain.rotator.status(),
      pendingReminders: jarvisBrain.brain.pendingReminders(),
      profile: jarvisBrain.brain.profileSnapshot,
      screenGuard: winGuard?.snapshot() ?? [],
    };
  });

  ipcMain.handle('config:load-keys', () => {
    const envPath = getEnvFilePath();
    return parseEnvFile(envPath);
  });

  ipcMain.handle('config:save-keys', (_event: Electron.IpcMainInvokeEvent, updates: Record<string, string>) => {
    const envPath = getEnvFilePath();
    updateEnvFile(envPath, updates);
    // Re-initialize JarvisBrain with updated keys
    initJarvis();
    return { success: true };
  });

  ipcMain.handle('config:is-first-run', () => {
    return isFirstRun();
  });

  ipcMain.handle('config:complete-setup', () => {
    markSetupComplete();
    return { success: true };
  });

  ipcMain.handle('win:execute-command', async (_event: Electron.IpcMainInvokeEvent, cmd: any) => {
    if (!winControl) return { success: false, error: 'WinControl not initialized' };
    return await winControl.executeCommand(cmd);
  });

  ipcMain.handle('win:get-active-app', async () => {
    if (!winControl) return null;
    return await winControl.getActiveWindow();
  });

  ipcMain.on('app:minimize-to-tray', () => {
    mainWindow?.hide();
  });

  ipcMain.on('app:close', () => {
    (app as any).isQuitting = true;
    app.quit();
  });
}

app.whenReady().then(() => {
  try {
    initJarvis();
    registerIpc();
    createWindow();
    createTray();
  } catch (err) {
    console.error('Fatal initialization error in Electron app:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('Error during app.whenReady:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  winGuard?.stop();
  jarvisBrain?.dispose();
});
