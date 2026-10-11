// NotePath desktop shell: serves the app from a private notepath:// scheme and keeps itself up to date.
// Source code, installers and update files all live in the public repo InquiringOwl/notepath-desktop.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const log = require('electron-log');
const { MacUpdater } = require('./updater-mac');

const OWNER = 'InquiringOwl';
const RELEASES_REPO = 'notepath-desktop';
const APP_DIR = path.join(__dirname, 'app');
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000; // every 4 hours while NotePath is open
const IS_MAC = process.platform === 'darwin';

// NotePath keeps its own data folder (named after productName "NotePath"), separate from Inquire's.

protocol.registerSchemesAsPrivileged([
  { scheme: 'notepath', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;
let updateState = { status: 'idle' };
let interactive = false; // true while a Help → Check for Updates… request is pending

function send(state) {
  updateState = { ...updateState, ...state };
  if (win && !win.isDestroyed()) win.webContents.send('update:status', updateState);
}
function tell(message, detail, buttons) {
  if (!win || win.isDestroyed()) return Promise.resolve({ response: 0 });
  return dialog.showMessageBox(win, { type: 'info', message, detail, buttons: buttons || ['OK'], defaultId: 0, cancelId: buttons ? buttons.length - 1 : 0 });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 900, minHeight: 620,
    backgroundColor: "#070A10", title: 'NotePath',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadURL('notepath://app/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('notepath://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('did-finish-load', () => send({}));
  win.on('close', flushStorage); // write localStorage (remembered username, progress, settings) to disk before the window goes
}

/* ---------------- automatic updates ---------------- */
let mac = null, autoUpdater = null;

function setupUpdates() {
  if (IS_MAC) {
    mac = new MacUpdater({ app, net, owner: OWNER, repo: RELEASES_REPO, log, notify: s => {
      send(s);
      if (!interactive) return;
      if (s.status === 'current') { interactive = false; tell('NotePath is up to date', `You have version ${app.getVersion()}.`); }
      else if (s.status === 'downloading' && s.percent === 0) tell(`NotePath ${s.version} is downloading`, 'A banner appears when it is ready to install. You can keep working.');
      else if (s.status === 'ready') { interactive = false; tell(`NotePath ${s.version} is ready`, 'Choose Install & Relaunch in the banner, or it waits until you do.'); }
      else if (s.status === 'error') { interactive = false; tell('Could not update NotePath', s.message || 'Check your internet connection and try again.'); }
    } });
    const r = mac.lastResult();
    if (r && r.ok) setTimeout(() => send({ status: 'installed', version: r.version }), 1500);
    if (r && !r.ok) setTimeout(() => send({ status: 'blocked', version: r.version, fallback: r.fallback }), 1500);
  } else {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => send({ status: 'checking' }));
    autoUpdater.on('update-available', i => { send({ status: 'downloading', version: i.version, percent: 0 }); if (interactive) { interactive = false; tell(`NotePath ${i.version} is downloading`, 'It installs when you restart. You can keep working.'); } });
    autoUpdater.on('update-not-available', () => { send({ status: 'current' }); if (interactive) { interactive = false; tell('NotePath is up to date', `You have version ${app.getVersion()}.`); } });
    autoUpdater.on('download-progress', p => send({ status: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', i => send({ status: 'ready', version: i.version }));
    autoUpdater.on('error', err => { log.warn('autoUpdater error', err); send({ status: 'error', message: String(err && err.message || err) }); if (interactive) { interactive = false; tell('Could not check for updates', 'Check your internet connection and try again.'); } });
  }
  const check = (fromMenu) => {
    if (fromMenu) interactive = true;
    if (!app.isPackaged) { if (fromMenu) tell('Updates are checked in installed copies only', 'This copy was started with npm start.'); interactive = false; return; }
    if (mac) mac.check(); else autoUpdater.checkForUpdates().catch(e => log.warn(e));
  };
  if (app.isPackaged) { setTimeout(() => check(false), 4000); setInterval(() => check(false), CHECK_EVERY_MS); }
  return check;
}

/* ---------------- app lifecycle ---------------- */
app.whenReady().then(() => {
  protocol.handle('notepath', req => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers }); // headers carry Range requests, which the intro video needs
  });
  const check = setupUpdates();
  ipcMain.handle('update:check', () => { check(true); return updateState; });
  ipcMain.handle('update:install', () => {
    if (updateState.status !== 'ready') return false;
    if (mac) return mac.install();
    autoUpdater.quitAndInstall(); return true;
  });
  ipcMain.handle('update:state', () => updateState);
  // Right-click → dictionary: textmenu.js decides what to ask (Wiktionary, then Wikipedia, then dictionaryapi.dev); this only
  // fetches, here in the main process (no CORS, no CSP), and only from those hosts. No keys or setup needed.
  const DICT_HOSTS = ['en.wiktionary.org', 'en.wikipedia.org', 'api.dictionaryapi.dev', 'api.mymemory.translated.net']; // + Translate (textmenu.js)
  ipcMain.handle('dict:lookup', async (_e, q) => {
    let u; try { u = new URL(String(q && q.url || '')); } catch (err) { return { status: 0 }; }
    if (u.protocol !== 'https:' || !DICT_HOSTS.includes(u.hostname)) return { status: 0 };
    try {
      const r = await net.fetch(u.href, { headers: { Accept: 'application/json', 'User-Agent': `NotePath/${app.getVersion()} (https://github.com/InquiringOwl/notepath-desktop)` } });
      return { status: r.status, body: r.status === 200 ? await r.json() : null };
    } catch (err) { return { status: 0 }; }
  });
  ipcMain.handle('update:reveal', () => { if (updateState.fallback) shell.showItemInFolder(updateState.fallback); });
  ipcMain.handle('app:version', () => app.getVersion());

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{ label: 'NotePath', submenu: [
      { role: 'about' },
      { label: 'Check for Updates…', click: () => check(true) },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
    ] }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [
      { label: 'Check for Updates…', click: () => check(true) },
      { label: 'Release notes', click: () => shell.openExternal(`https://github.com/${OWNER}/${RELEASES_REPO}/releases`) }
    ] }
  ]));
  // Video embeds in notes: the page runs on notepath://, which sends no Referer, and YouTube refuses embeds without one (error 153). Name the app instead.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://player.vimeo.com/*'] }, (d, cb) => {
    if (d.resourceType === 'subFrame' && !d.requestHeaders.Referer) d.requestHeaders.Referer = `https://github.com/${OWNER}/${RELEASES_REPO}`;
    cb({ requestHeaders: d.requestHeaders });
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
/* Chromium writes localStorage to disk lazily; flush it so nothing set just before quitting is lost. */
function flushStorage() { try { session.defaultSession.flushStorageData(); } catch (e) { /* not ready yet */ } }
app.on('before-quit', flushStorage);
app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
