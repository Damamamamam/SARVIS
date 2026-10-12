const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const port = Number(process.env.SARVIS_APP_PORT || 9743);
let serverProcess;
let mainWindow;

function startBrain() {
  const serverPath = path.join(root, 'dist', 'src', 'server', 'webapp.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: { ...process.env, SARVIS_PORT: String(port), SARVIS_BIND: '127.0.0.1' },
    stdio: 'inherit',
    windowsHide: true,
  });
  serverProcess.on('exit', (code) => {
    if (code && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(`data:text/html,<h2>SARVIS stopped</h2><p>Brain exited with code ${code}.</p>`);
  });
}

async function waitForBrain() {
  const url = `http://127.0.0.1:${port}/api/health`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return url.replace('/api/health', ''); } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('SARVIS brain did not start in time');
}

async function createWindow() {
  startBrain();
  const baseUrl = await waitForBrain();
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f7f8f4',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await mainWindow.loadURL(baseUrl);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (serverProcess && !serverProcess.killed) serverProcess.kill(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
