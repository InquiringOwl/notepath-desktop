// NotePath desktop shell: serves the app from a private notepath:// scheme and keeps itself up to date.
// Source code, installers and update files all live in the public repo InquiringOwl/notepath-desktop.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, dialog, session, Notification, Tray, nativeImage } = require('electron');
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };

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

/* ---------------- staying in the tray (Windows and Linux) ----------------
   So My Tasks reminders still arrive, closing the window hides it and NotePath stays in the system tray (notification area)
   until Quit NotePath (tray menu or File → Quit). macOS already keeps NotePath running in the Dock when its window closes.
   prefs.json in the userData folder (Settings → Usage): { tray: true, login: false }. "Start when I sign in" opens NotePath
   hidden in the tray on Windows (--hidden), normally on macOS. */
const PREFS_FILE = () => path.join(app.getPath('userData'), 'prefs.json');
function readPrefs() { let p = {}; try { p = JSON.parse(fs.readFileSync(PREFS_FILE(), 'utf8')) || {}; } catch (e) {} return { tray: p.tray !== false, login: !!p.login, hinted: !!p.hinted }; }
function writePrefs(p) { try { fs.writeFileSync(PREFS_FILE(), JSON.stringify(p)); } catch (e) { log.warn('prefs', e); } }
const USE_TRAY = () => !IS_MAC && readPrefs().tray;
let tray = null, quitting = false, nextRem = [];
const startHidden = process.argv.includes('--hidden');
/* v0.5.7 (memory): a window hidden in the tray gives its renderer back after a short while (a hidden page still holds ~150–300 MB);
   reminders live here in the main process, so they still arrive, and one that fires with no window wakes it hidden for a moment so
   the page can plan the next ones (repeats, reminders more than 24 days away). Opening NotePath again rebuilds the window (~1 s). */
let idleKill = null, bgLoad = false;
function cancelIdleKill() { if (idleKill) { clearTimeout(idleKill); idleKill = null; } }
function scheduleIdleKill(ms) { cancelIdleKill(); idleKill = setTimeout(() => { idleKill = null; if (quitting || !win || win.isDestroyed() || win.isVisible()) return; flushStorage(); try { win.destroy(); } catch (e) {} win = null; }, ms); }
function wakeHidden() { if (win && !win.isDestroyed()) return; bgLoad = true; createWindow(); scheduleIdleKill(25000); }
function showWin() { cancelIdleKill(); bgLoad = false; if (!win || win.isDestroyed()) createWindow(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function openIn(route) { showWin(); const go = () => win.webContents.send('app:route', route); if (win.webContents.isLoading()) win.webContents.once('did-finish-load', go); else go(); }
/* ---------------- note links (v0.5.4): Share → Copy link gives notepath://note/<id>; clicked in another file, an email to
   yourself or a calendar, it opens that note here. Notes live only on this computer, so on someone else's computer the link
   only opens NotePath (it says the note is not there); Share → Send a copy is for associates. */
const NOTE_LINK = /^notepath:\/\/note\/([a-z0-9]+)/i;
let pendingNote = null;
function openNoteLink(url) {
  const m = String(url || '').match(NOTE_LINK); if (!m) return false;
  if (!app.isReady() || !win) { pendingNote = m[1]; return true; }
  openIn({ view: 'notes', note: m[1] }); return true;
}
app.on('open-url', (e, url) => { if (NOTE_LINK.test(url)) { e.preventDefault(); openNoteLink(url); } }); // macOS
{ const a = process.argv.find(x => NOTE_LINK.test(x)); if (a) pendingNote = a.match(NOTE_LINK)[1]; } // Windows / Linux: opened by a link
function trayIcon() { const img = nativeImage.createFromPath(path.join(APP_DIR, 'brand', 'np-mark-64.png')); return img.isEmpty() ? img : img.resize({ width: 16, height: 16, quality: 'best' }); }
function updateTray() {
  if (!USE_TRAY()) { if (tray) { tray.destroy(); tray = null; } return; }
  if (!tray) {
    try { tray = new Tray(trayIcon()); } catch (e) { log.warn('tray', e); tray = null; return; }
    tray.on('click', showWin); tray.on('double-click', showWin);
  }
  const soon = nextRem.filter(r => r.at > Date.now()).sort((a, b) => a.at - b.at), first = soon[0];
  const when = r => new Date(r.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  tray.setToolTip(soon.length ? `NotePath · ${soon.length} reminder${soon.length === 1 ? '' : 's'} coming up` : 'NotePath');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open NotePath', click: showWin },
    { label: 'My Tasks', click: () => openIn({ view: 'tasks' }) },
    { type: 'separator' },
    { label: first ? `Next: ${String(first.title).replace(/^(Coming up|Due now): /, '').slice(0, 50)} · ${when(first)}` : 'No reminders coming up', enabled: !!first, click: () => first && openIn({ view: 'tasks', sel: first.id }) },
    { type: 'separator' },
    { label: 'Quit NotePath', click: () => { quitting = true; app.quit(); } }
  ]));
}

function createWindow() {
  win = new BrowserWindow({ show: false,
    width: 1480, height: 940, minWidth: 900, minHeight: 620,
    backgroundColor: "#070A10", title: 'NotePath',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadURL('notepath://app/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (NOTE_LINK.test(url)) openNoteLink(url); else if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (NOTE_LINK.test(url)) { e.preventDefault(); openNoteLink(url); return; } if (!url.startsWith('notepath://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('did-finish-load', () => send({}));
  win.on('close', flushStorage); // write localStorage (remembered username, progress, settings) to disk before the window goes
  // Windows / Linux: the ✕ hides NotePath to the tray instead of quitting (Settings → Usage can turn this off)
  win.on('close', e => {
    if (quitting || !USE_TRAY() || !tray) return;
    e.preventDefault(); win.hide(); scheduleIdleKill(15000);
    const p = readPrefs();
    if (!p.hinted && Notification.isSupported()) { writePrefs(Object.assign(p, { hinted: true })); new Notification({ title: 'NotePath is still running', body: 'It stays in the notification area so task reminders still arrive. Right-click its icon to quit.' }).show(); }
  });
  win.once('ready-to-show', () => { if (!(startHidden && USE_TRAY()) && !bgLoad) win.show(); else if (USE_TRAY() && tray) scheduleIdleKill(25000); });
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
    // a folder or a missing file is a plain 404 (Chromium's file loader answers a folder with ERR_ACCESS_DENIED, which
    // would surface as an unhandled error in the terminal); a file the loader cannot open is read directly instead
    let st = null; try { st = fs.statSync(file); } catch (e) { /* missing */ }
    if (!st || !st.isFile()) { log.info('notepath:// not found', rel); return new Response('Not found', { status: 404 }); }
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers }) // headers carry Range requests (video)
      .catch(err => {
        log.warn('notepath:// could not load', rel, String(err && err.message || err));
        try { return new Response(fs.readFileSync(file), { headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } }); }
        catch (e) { return new Response('Not readable', { status: 403 }); }
      });
  });
  const check = setupUpdates();
  ipcMain.handle('update:check', () => { check(true); return updateState; });
  ipcMain.handle('update:install', () => {
    if (updateState.status !== 'ready') return false;
    if (mac) return mac.install();
    quitting = true; autoUpdater.quitAndInstall(); return true;
  });
  ipcMain.handle('update:state', () => updateState);
  // Right-click → dictionary: textmenu.js decides what to ask (Wiktionary, then Wikipedia, then dictionaryapi.dev); this only
  // fetches, here in the main process (no CORS, no CSP), and only from those hosts. No keys or setup needed.
  const DICT_HOSTS = ['en.wiktionary.org', 'en.wikipedia.org', 'api.dictionaryapi.dev', 'api.mymemory.translated.net', 'nominatim.openstreetmap.org']; // + Translate (textmenu.js), + My Tasks places (OpenStreetMap)
  ipcMain.handle('dict:lookup', async (_e, q) => {
    let u; try { u = new URL(String(q && q.url || '')); } catch (err) { return { status: 0 }; }
    if (u.protocol !== 'https:' || !DICT_HOSTS.includes(u.hostname)) return { status: 0 };
    try {
      const r = await net.fetch(u.href, { headers: { Accept: 'application/json', 'User-Agent': `NotePath/${app.getVersion()} (https://github.com/InquiringOwl/notepath-desktop)` } });
      return { status: r.status, body: r.status === 200 ? await r.json() : null };
    } catch (err) { return { status: 0 }; }
  });
  // Code tab ▶ Run (web/src/code.js): one HTTPS request to the run service chosen in Settings → Code (Judge0, Piston…), made
  // here so the page's CSP stays closed. HTTPS only, GET or POST, small bodies.
  ipcMain.handle('code:http', async (_e, q) => {
    let u; try { u = new URL(String(q && q.url || '')); } catch (err) { return { status: 0 }; }
    const method = q.method === 'POST' ? 'POST' : 'GET', body = typeof q.body === 'string' ? q.body : undefined;
    if (u.protocol !== 'https:' || (body && body.length > 1_000_000)) return { status: 0 };
    const headers = {}; Object.entries(q.headers || {}).forEach(([k, v]) => { if (/^[\w-]{1,40}$/.test(k) && typeof v === 'string' && v.length < 500) headers[k] = v; });
    headers['User-Agent'] = `NotePath/${app.getVersion()} (https://github.com/${OWNER}/${RELEASES_REPO})`;
    try {
      const r = await net.fetch(u.href, { method, headers, body });
      let json = null; try { json = await r.json(); } catch (err) {}
      return { status: r.status, body: json };
    } catch (err) { return { status: 0 }; }
  });
  // AI (Code tab ⇄ Translate, and later features): the key never reaches the page. It comes from the environment
  // (NOTEPATH_AI_KEY, NOTEPATH_AI_PROVIDER, NOTEPATH_AI_MODEL) or from ai.config.json beside main.js (not in git; see ai.config.example.json).
  ipcMain.handle('ai:status', () => { const c = aiConfig(); return { configured: !!c.key, provider: c.provider, model: c.model }; });
  ipcMain.handle('ai:ask', async (_e, q) => {
    const c = aiConfig(); if (!c.key) return { error: 'AI is not set up in this copy of NotePath.' };
    const system = String(q && q.system || '').slice(0, 40000), prompt = String(q && q.prompt || '').slice(0, 120000);
    // v0.5.6: AI Chat sends the whole conversation ({ role: user | assistant, content }); one-off asks send only the prompt
    let msgs = Array.isArray(q && q.messages) ? q.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content).slice(-40).map(m => ({ role: m.role, content: m.content.slice(0, 20000) })) : [];
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length) msgs = [{ role: 'user', content: prompt }];
    try {
      if (c.provider === 'openai') {
        const r = await net.fetch(c.url || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
          body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: system }, ...msgs] }) });
        const j = await r.json().catch(() => null);
        if (r.status !== 200 || !j) return { error: `The AI service answered ${r.status}.` };
        return { text: j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '' };
      }
      const r = await net.fetch(c.url || 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: c.model, max_tokens: c.maxTokens || 8000, system, messages: msgs }) });
      const j = await r.json().catch(() => null);
      if (r.status !== 200 || !j) return { error: `The AI service answered ${r.status}${j && j.error && j.error.message ? ': ' + j.error.message : ''}.` };
      return { text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('') };
    } catch (err) { return { error: 'Could not reach the AI service. Check your internet connection.' }; }
  });
  // My notes' Grammar check (v0.5.6, web/src/assist.js): one form POST to LanguageTool's free public service, made here so the
  // page's CSP stays closed. Only that address; the page builds the form (text, language, level, categories left out).
  ipcMain.handle('grammar:check', async (_e, q) => {
    const body = String(q && q.body || ''); if (!body || body.length > 80000) return { status: 0 };
    try {
      const r = await net.fetch('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': `NotePath/${app.getVersion()} (https://github.com/${OWNER}/${RELEASES_REPO})` }, body });
      let json = null; try { json = await r.json(); } catch (err) {}
      return { status: r.status, body: json };
    } catch (err) { return { status: 0 }; }
  });
  // My Tasks reminders (web/src/tasks.js): the page sends every reminder still to come; they show as system notifications
  // here, so they still appear while the window is closed (macOS keeps NotePath running). A click opens the task.
  const remTimers = new Map(), remFired = new Set();
  ipcMain.handle('tasks:schedule', (_e, list) => {
    remTimers.forEach(t => clearTimeout(t)); remTimers.clear();
    (Array.isArray(list) ? list : []).slice(0, 500).forEach(r => {
      if (!r || typeof r.key !== 'string' || remFired.has(r.key)) return;
      const wait = Math.max(0, Number(r.at) - Date.now()); if (!Number.isFinite(wait) || wait > 24 * 24 * 3600e3) return; // setTimeout's limit; nearer the time the page sends it again
      remTimers.set(r.key, setTimeout(() => fireReminder(r), wait));
    });
    nextRem = (Array.isArray(list) ? list : []).filter(r => r && typeof r.key === 'string' && !remFired.has(r.key)).map(r => ({ id: String(r.id), title: String(r.title || ''), at: Number(r.at) }));
    updateTray();
    return true;
  });
  ipcMain.handle('tasks:fired', () => [...remFired]);
  function fireReminder(r) {
    remTimers.delete(r.key); remFired.add(r.key);
    try {
      if (Notification.isSupported()) {
        const n = new Notification({ title: String(r.title || 'Task').slice(0, 200), body: String(r.body || '').slice(0, 300), silent: false });
        n.on('click', () => { showWin(); const go = () => win.webContents.send('tasks:open', r.id); if (win.webContents.isLoading()) win.webContents.once('did-finish-load', go); else go(); });
        n.show();
      }
    } catch (err) { log.warn('reminder', err); }
    if (win && !win.isDestroyed()) win.webContents.send('tasks:fired', { key: r.key, id: r.id, title: r.title, body: r.body });
    else if (USE_TRAY() && tray) wakeHidden();
  }
  // Settings → Usage: keep running in the tray (Windows/Linux), start when you sign in (Windows/macOS)
  ipcMain.handle('app:prefs', () => { const p = readPrefs(); return { tray: p.tray, login: p.login, trayAvailable: !IS_MAC, loginAvailable: IS_MAC || process.platform === 'win32' }; });
  ipcMain.handle('app:setPrefs', (_e, q) => {
    const p = readPrefs();
    if (q && typeof q.tray === 'boolean') p.tray = q.tray;
    if (q && typeof q.login === 'boolean') { p.login = q.login; try { app.setLoginItemSettings(Object.assign({ openAtLogin: p.login }, IS_MAC ? {} : { args: ['--hidden'] })); } catch (e) { log.warn('login item', e); } }
    writePrefs(p); updateTray(); return { tray: p.tray, login: p.login };
  });
  // My notes › Import & Export › PDF: the page (HTML with its photos inside) is printed to a PDF by a hidden window
  ipcMain.handle('export:pdf', async (_e, html) => {
    if (typeof html !== 'string' || html.length > 200e6) return null;
    const tmp = path.join(app.getPath('temp'), `notepath-export-${process.pid}-${Date.now()}.html`);
    const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, offscreen: false } });
    try {
      fs.writeFileSync(tmp, html); await pw.loadFile(tmp);
      return await pw.webContents.printToPDF({ printBackground: true, pageSize: 'Letter', margins: { marginType: 'default' } });
    } catch (err) { log.warn('pdf', err); return null; }
    finally { pw.destroy(); try { fs.unlinkSync(tmp); } catch (e) {} }
  });
  // Share → Email / Print (v0.5.6, Devon). mail: only mailto: links, opened in the person's mail app. file: a PDF kept in
  // Downloads/NotePath (a new name if one is there) and shown in Finder / File Explorer, to drag into the message.
  // print: the note as a page in a hidden window, then the system print window.
  ipcMain.handle('share:mail', (_e, url) => { if (typeof url !== 'string' || !/^mailto:/i.test(url) || url.length > 8000) return false; shell.openExternal(url); return true; });
  ipcMain.handle('share:file', (_e, q) => {
    try {
      const name = String(q && q.name || 'note.pdf').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 120) || 'note.pdf', bytes = q && q.bytes;
      if (!bytes || !bytes.length || bytes.length > 300e6) return null;
      const dir = path.join(app.getPath('downloads'), 'NotePath'); fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(name), stem = name.slice(0, name.length - ext.length); let p = path.join(dir, name), i = 2;
      while (fs.existsSync(p)) p = path.join(dir, `${stem} (${i++})${ext}`);
      fs.writeFileSync(p, Buffer.from(bytes)); shell.showItemInFolder(p); return p;
    } catch (err) { log.warn('share file', err); return null; }
  });
  ipcMain.handle('share:print', async (_e, html) => {
    if (typeof html !== 'string' || html.length > 200e6) return false;
    const tmp = path.join(app.getPath('temp'), `notepath-print-${process.pid}-${Date.now()}.html`);
    const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
    try {
      fs.writeFileSync(tmp, html); await pw.loadFile(tmp);
      return await new Promise(res => pw.webContents.print({ silent: false, printBackground: true }, ok => res(!!ok)));
    } catch (err) { log.warn('print', err); return false; }
    finally { pw.destroy(); try { fs.unlinkSync(tmp); } catch (e) {} }
  });
  ipcMain.handle('update:reveal', () => { if (updateState.fallback) shell.showItemInFolder(updateState.fallback); });
  ipcMain.handle('app:version', () => app.getVersion());
  /* v0.5.7 automatic backups: the page (settings.js autoBackup) sends the backup text once a day; it is kept as
     <userData>/backups/notepath-auto-YYYY-MM-DD.json, the newest 7 stay. Written to a temp file first, so a full disk never leaves half a backup. */
  const BK_DIR = () => path.join(app.getPath('userData'), 'backups');
  const BK_RE = /^notepath-auto-\d{4}-\d{2}-\d{2}\.json$/;
  ipcMain.handle('backup:save', async (_e, q) => {
    try {
      if (!q || typeof q.name !== 'string' || !BK_RE.test(q.name) || typeof q.data !== 'string' || q.data.length > 900e6) return { error: 'bad' };
      fs.mkdirSync(BK_DIR(), { recursive: true });
      const f = path.join(BK_DIR(), q.name), tmp = f + '.tmp';
      await fs.promises.writeFile(tmp, q.data, 'utf8'); await fs.promises.rename(tmp, f);
      const all = fs.readdirSync(BK_DIR()).filter(n => BK_RE.test(n)).sort();
      all.slice(0, Math.max(0, all.length - 7)).forEach(n => { try { fs.unlinkSync(path.join(BK_DIR(), n)); } catch (e) {} });
      return { file: q.name, bytes: Buffer.byteLength(q.data), kept: Math.min(all.length, 7) };
    } catch (err) { try { fs.unlinkSync(path.join(BK_DIR(), q.name + '.tmp')); } catch (e) {} return { error: err && err.code === 'ENOSPC' ? 'disk-full' : 'failed' }; }
  });
  ipcMain.handle('backup:open', async () => { try { fs.mkdirSync(BK_DIR(), { recursive: true }); await shell.openPath(BK_DIR()); return true; } catch (e) { return false; } });
  ipcMain.handle('backup:list', () => { try { return fs.readdirSync(BK_DIR()).filter(n => BK_RE.test(n)).sort().reverse().map(n => ({ name: n, bytes: fs.statSync(path.join(BK_DIR(), n)).size })); } catch (e) { return []; } });

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
  // My Tasks maps: OpenStreetMap's tile servers ask every app to say who it is (Referer + User-Agent).
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://player.vimeo.com/*', 'https://tile.openstreetmap.org/*'] }, (d, cb) => {
    if (/^https:\/\/tile\.openstreetmap\.org\//.test(d.url)) { d.requestHeaders.Referer = `https://github.com/${OWNER}/${RELEASES_REPO}`; d.requestHeaders['User-Agent'] = `NotePath/${app.getVersion()} (https://github.com/${OWNER}/${RELEASES_REPO})`; cb({ requestHeaders: d.requestHeaders }); return; }
    if (d.resourceType === 'subFrame' && !d.requestHeaders.Referer) d.requestHeaders.Referer = `https://github.com/${OWNER}/${RELEASES_REPO}`;
    cb({ requestHeaders: d.requestHeaders });
  });
  createWindow(); updateTray();
  // note links: NotePath opens notepath://note/… links from other apps (packaged app; from source it passes this script)
  try { if (process.defaultApp) { if (process.argv.length >= 2) app.setAsDefaultProtocolClient('notepath', process.execPath, [path.resolve(process.argv[1])]); } else app.setAsDefaultProtocolClient('notepath'); } catch (e) { log.warn('note links', e); }
  if (pendingNote) { const id = pendingNote; pendingNote = null; openIn({ view: 'notes', note: id }); }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWin(); });
});
// one NotePath at a time: opening it again (Start menu, desktop icon) brings the hidden window back instead of a second copy
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', (_e, argv) => { if (!app.isReady()) return; const l = (argv || []).find(x => NOTE_LINK.test(x)); if (l) openNoteLink(l); else showWin(); });
/* AI settings: environment first, then ai.config.json beside main.js (packaged with the app; keep it out of git). */
function aiConfig() {
  let f = {}; try { f = JSON.parse(fs.readFileSync(path.join(__dirname, 'ai.config.json'), 'utf8')) || {}; } catch (e) { /* not set up */ }
  return { provider: process.env.NOTEPATH_AI_PROVIDER || f.provider || 'anthropic', model: process.env.NOTEPATH_AI_MODEL || f.model || '',
    key: process.env.NOTEPATH_AI_KEY || f.key || '', url: f.url || '', maxTokens: f.maxTokens };
}
/* Chromium writes localStorage to disk lazily; flush it so nothing set just before quitting is lost. */
function flushStorage() { try { session.defaultSession.flushStorageData(); } catch (e) { /* not ready yet */ } }
app.on('before-quit', () => { quitting = true; flushStorage(); });
app.on('window-all-closed', () => { if (!IS_MAC && !(USE_TRAY() && tray)) app.quit(); });
