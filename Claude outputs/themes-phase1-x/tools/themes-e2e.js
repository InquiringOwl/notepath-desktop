// End-to-end check of theme packs in the real desktop app (main.js + the page), with a throwaway key and a test pack made here:
// install (a tampered pack is refused), the notepath://theme/ handler and its path checks, Settings → Appearance, apply, a pack whose
// files went missing (fallback + message), remove. Nothing touches your real NotePath data (a temporary userData folder).
// Run: npm run theme:e2e   (needs Electron, i.e. npm install; on Linux without a screen: xvfb-run -a npx electron --no-sandbox tools/themes-e2e.js)
const path = require('path'), fs = require('fs'), os = require('os');
const R = path.join(__dirname, '..'), T = require('../themes-core.js');
const { app, dialog, BrowserWindow } = require('electron');
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'np-e2e-')); app.setPath('userData', ud);
// a throwaway key and two packs (good, tampered), made fresh each run
const k = T.keyPair(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'np-e2e-pack-'));
const png = (w, h) => { const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ih = Buffer.alloc(25); ih.writeUInt32BE(13, 0); ih.write('IHDR', 4); ih.writeUInt32BE(w, 8); ih.writeUInt32BE(h, 12); ih[16] = 8; ih[17] = 2;
  const zlib = require('zlib'), crc = b => { let c = -1; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 25; raw[o + 1] = 40; raw[o + 2] = 70; }
  return Buffer.concat([sig, chunk('IHDR', ih.subarray(8, 21)), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const files = new Map([['preview.png', png(640, 360)], ['manifest.json', Buffer.from(JSON.stringify({ schema: 1, id: 'demo-dusk', name: 'Demo Dusk', author: 'NotePath', version: '1.0.0', weight: 'light', family: 'Dark', license: { type: 'free' }, preview: 'preview.png',
  colors: { bg: '#14121C', surface: '#1E1B2A', accent: '#E0A458', tint: '#8C7AE6', text: '#ECE8F4', muted: '#B5AEC8', faint: '#8E87A3' } }))]]);
files.set('signature.json', T.sign(files, k.privateKeyPem));
const GOOD = path.join(tmp, 'demo-dusk.nptheme'), BAD = path.join(tmp, 'tampered.nptheme');
fs.writeFileSync(GOOD, T.writeZip(files));
{ const b = new Map(files); b.set('preview.png', Buffer.concat([files.get('preview.png'), Buffer.from([0])])); fs.writeFileSync(BAD, T.writeZip(b)); }
const keyFile = require.resolve('../theme-key.json');
require.cache[keyFile] = { id: keyFile, filename: keyFile, loaded: true, exports: { publicKey: k.publicKey } };
let next = GOOD;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [next] });
require('../main.js');
const out = [];
const ok = (c, n, g) => out.push((c ? '✓ ' : '✗ ') + n + (c ? '' : ' → ' + JSON.stringify(g)));
app.whenReady().then(async () => {
  await new Promise(r => setTimeout(r, 4000));
  const w = BrowserWindow.getAllWindows()[0];
  const js = s => w.webContents.executeJavaScript(s);
  try {
    let r = await js('inquireDesktop.themes.list()');
    ok(r.ok && r.packs.length === 0 && r.signing === true, 'list: none installed, signing key present', r);
    next = BAD;
    r = await js('inquireDesktop.themes.installFile()');
    ok(!r.ok && /verify/.test(r.error), 'a tampered pack is refused', r);
    next = GOOD;
    r = await js('inquireDesktop.themes.installFile()');
    ok(r.ok && r.pack.id === 'demo-dusk', 'the signed pack installs', r);
    ok(fs.existsSync(path.join(ud, 'themes/demo-dusk/1.0.0/preview.png')), 'it lands in <userData>/themes/demo-dusk/1.0.0/');
    r = await js(`fetch('notepath://theme/demo-dusk/preview.png').then(x => [x.status, x.headers.get('content-type')])`);
    ok(r[0] === 200 && r[1] === 'image/png', 'notepath://theme/demo-dusk/preview.png is served', r);
    r = await js(`Promise.all(['notepath://theme/demo-dusk/../index.json','notepath://theme/demo-dusk/%2e%2e/index.json','notepath://theme/demo-dusk/manifest.js','notepath://theme/nope/preview.png'].map(u => fetch(u).then(x => x.status).catch(() => 'err')))`);
    ok(r.every(s => s === 404 || s === 'err'), 'the handler refuses climbing paths, other types and unknown packs', r);
    r = await js(`new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res('error'); i.src = 'notepath://theme/demo-dusk/preview.png'; })`);
    ok(r === 640, 'the page can show pack art through the CSP (img-src notepath:)', r);
    // the app sees it: Settings → Appearance
    await js(`InquireSettings.open('look')`); await new Promise(r => setTimeout(r, 1200));
    r = await js(`!!document.querySelector('.set-packs .set-th[data-id="pack:demo-dusk"]')`);
    ok(r, 'Settings → Appearance lists the installed pack');
    await js(`document.querySelector('.set-packs .set-th[data-id="pack:demo-dusk"]').click()`); await new Promise(r => setTimeout(r, 500));
    r = await js(`[document.documentElement.dataset.theme, getComputedStyle(document.documentElement).getPropertyValue('--frame').trim(), document.documentElement.dataset.style]`);
    ok(r[0] === 'pack:demo-dusk' && r[1].toLowerCase() === '#e0a458' && r[2] === 'plain', 'picking it applies its colours (plain style)', r);
    // a reload keeps it (the copy in settings), then the folder goes missing → falls back with a message
    fs.rmSync(path.join(ud, 'themes/demo-dusk'), { recursive: true, force: true });
    w.webContents.reload(); await new Promise(r => setTimeout(r, 3500));
    r = await js(`[document.documentElement.dataset.theme, !!document.querySelector('.tm-toast') && document.querySelector('.tm-toast').textContent]`);
    ok(r[0] !== 'pack:demo-dusk' && /couldn’t be loaded/.test(r[1] || ''), 'a pack whose files are gone falls back to a built-in theme and says so', r);
    r = await js('inquireDesktop.themes.list()');
    ok(r.packs.length === 1 && r.packs[0].broken, 'list marks it as needing a reinstall', r);
    r = await js(`inquireDesktop.themes.remove('demo-dusk')`);
    r = await js('inquireDesktop.themes.list()');
    ok(r.packs.length === 0 && !fs.existsSync(path.join(ud, 'themes/demo-dusk')), 'remove takes it out of index.json', r);
  } catch (e) { out.push('✗ threw ' + (e && e.stack || e)); }
  console.log(out.join('\n'));
  const failed = out.some(x => x.startsWith('✗'));
  console.log(failed ? 'THEME E2E FAILED' : `Theme e2e passed (${out.length} checks).`);
  fs.rmSync(ud, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
});
