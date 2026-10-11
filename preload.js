const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('inquireDesktop', {
  platform: process.platform,
  onUpdate: cb => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  updateState: () => ipcRenderer.invoke('update:state'),
  lookupWord: q => ipcRenderer.invoke('dict:lookup', q),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  revealUpdate: () => ipcRenderer.invoke('update:reveal'),
  version: () => ipcRenderer.invoke('app:version')
});
