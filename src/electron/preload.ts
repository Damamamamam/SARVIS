/**
 * Preload script exposing safe Electron IPC bindings to the Renderer UI.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('jarvisAPI', {
  hear: (utterance: string) => ipcRenderer.invoke('brain:hear', utterance),
  getStatus: () => ipcRenderer.invoke('brain:get-status'),
  loadKeys: () => ipcRenderer.invoke('config:load-keys'),
  saveKeys: (keys: Record<string, string>) => ipcRenderer.invoke('config:save-keys', keys),
  executeWinCommand: (cmd: any) => ipcRenderer.invoke('win:execute-command', cmd),
  getActiveWindow: () => ipcRenderer.invoke('win:get-active-app'),
  minimizeToTray: () => ipcRenderer.send('app:minimize-to-tray'),
  closeApp: () => ipcRenderer.send('app:close'),
  isFirstRun: () => ipcRenderer.invoke('config:is-first-run'),
  completeSetup: () => ipcRenderer.invoke('config:complete-setup'),
  onNudge: (callback: (nudge: any) => void) => {
    ipcRenderer.on('brain:nudge', (_event: Electron.IpcRendererEvent, value: any) => callback(value));
  },
  onFirstRunState: (callback: (isFirst: boolean) => void) => {
    ipcRenderer.on('app:first-run-state', (_event: Electron.IpcRendererEvent, value: boolean) => callback(value));
  },
});
