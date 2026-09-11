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
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const uiPath = path.join(__dirname, '../ui/index.html');
  mainWindow.loadFile(uiPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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
  // Create 16x16 canvas/svg icon for tray
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236366F1" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><circle cx="12" cy="12" r="3" fill="%2310B981"/></svg>`;
  const iconBuffer = Buffer.from(iconSvg);
  const icon = nativeImage.createFromBuffer(iconBuffer);

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
  initJarvis();
  registerIpc();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
