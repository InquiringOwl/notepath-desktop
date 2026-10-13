const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('inquireDesktop', {
  platform: process.platform,
  onUpdate: cb => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  updateState: () => ipcRenderer.invoke('update:state'),
  lookupWord: q => ipcRenderer.invoke('dict:lookup', q),
  codeHttp: q => ipcRenderer.invoke('code:http', q),
  exportPDF: html => ipcRenderer.invoke('export:pdf', html),
  prefs: () => ipcRenderer.invoke('app:prefs'), setPrefs: p => ipcRenderer.invoke('app:setPrefs', p), onRoute: cb => ipcRenderer.on('app:route', (_e, r) => cb(r)),
  tasks: { schedule: list => ipcRenderer.invoke('tasks:schedule', list), fired: () => ipcRenderer.invoke('tasks:fired'), onFired: cb => ipcRenderer.on('tasks:fired', (_e, r) => cb(r)), onOpen: cb => ipcRenderer.on('tasks:open', (_e, id) => cb(id)) },
  ai: { status: () => ipcRenderer.invoke('ai:status'), ask: q => ipcRenderer.invoke('ai:ask', q) },
  grammar: q => ipcRenderer.invoke('grammar:check', q), // v0.5.6: My notes' Grammar check (LanguageTool)
  installUpdate: () => ipcRenderer.invoke('update:install'),
  revealUpdate: () => ipcRenderer.invoke('update:reveal'),
  version: () => ipcRenderer.invoke('app:version')
});
