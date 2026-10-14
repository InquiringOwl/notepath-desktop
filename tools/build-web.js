// Builds the NotePath page from web/.
//   app/index.html            desktop app page (fonts bundled, works offline)
//   dist-web/notepath.html    the same page for a browser preview (fonts from Google Fonts)
// Run: node tools/build-web.js   (fails on any syntax error)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(R, p), 'utf8');

const css = ['web/src/style.css', 'web/src/settings.css', 'web/src/menu.css', 'web/src/notepath.css'].map(read).join('\n');
// Top-bar mark, inlined so the page works anywhere.
const markUri = 'data:image/png;base64,' + fs.readFileSync(path.join(R, 'app/brand/np-mark-64.png')).toString('base64');
// Order matters: helper rules (Python highlighting, music theory) → notes engine → widgets → app → right-click menu → documents → settings.
const files = ['web/lib/lazy.js', 'web/lib/diag.js', 'web/lib/python-tokens.js', 'web/lib/music-theory.js', 'web/src/notes.js', 'web/src/notes-widgets.js', 'web/src/notes-graph.js', 'web/src/notes-sheet.js', 'web/src/notes-map.js', 'web/src/code.js', 'web/src/tasks.js', 'web/src/io.js', 'web/src/assist.js', 'web/src/app.js', 'web/src/office.js', 'web/src/textmenu.js', 'web/src/eula.js', 'web/src/settings.js'];
// v0.5.7: these run on first use (web/lib/lazy.js); the rest run at start. [name, the window global that wakes it]
const LAZY = { 'web/src/office.js': ['office', 'NoteOffice'], 'web/src/io.js': ['io', 'NPIO'], 'web/src/notes-sheet.js': ['sheet', 'NPSheet'], 'web/src/notes-graph.js': ['graph', 'NPGraph'], 'web/src/notes-map.js': ['map', 'NPMap'], 'web/src/assist.js': ['assist', 'NPAssist'] };
const scripts = files.map(f => {
  const src = read(f);
  if (/<\/script/i.test(src)) throw new Error(f + ' contains </script>, which would break the page.');
  try { new vm.Script(src, { filename: f }); } catch (e) { throw new Error(f + ': ' + e.message); }
  if (LAZY[f]) return `<script type="text/plain" data-np-lazy="${LAZY[f][0]}" data-np-global="${LAZY[f][1]}">/* ${f} */\n${src}\n</script>`;
  const reg = f === 'web/lib/lazy.js' ? `\n<script>${Object.values(LAZY).map(([n, g]) => `NPLazy.lazy(${JSON.stringify(n)}, ${JSON.stringify(g)});`).join(' ')}</script>` : '';
  return `<script>/* ${f} */\n${src}\n</script>` + reg;
}).join('\n');

// The Code tab's editor is Monaco (the editor inside VS Code). Its files are copied from node_modules into app/vendor/monaco
// (not in git: .gitignore) so the desktop app loads them offline from notepath://app/vendor/…; the browser preview uses a CDN.
const MONACO_VER = '0.52.2';
function copyMonaco() {
  const src = path.join(R, 'node_modules/monaco-editor/min/vs'), dst = path.join(R, 'app/vendor/monaco/vs'), mark = path.join(R, 'app/vendor/monaco/VERSION');
  if (!fs.existsSync(src)) { console.warn('monaco-editor is not installed (npm install): the Code tab will use its simple editor.'); return; }
  let ver = ''; try { ver = JSON.parse(read('node_modules/monaco-editor/package.json')).version; } catch (e) {}
  // the files the editor needs must be readable (a damaged copy gives net::ERR_ACCESS_DENIED in the app): mend or explain
  const KEY = ['loader.js', 'editor/editor.main.js', 'editor/editor.main.css', 'base/worker/workerMain.js'];
  const unreadable = () => KEY.filter(k => { try { fs.readFileSync(path.join(dst, k)); return false; } catch (e) { return true; } });
  if (fs.existsSync(mark) && fs.readFileSync(mark, 'utf8') === ver) {
    const bad = unreadable(); if (!bad.length) return;
    for (const k of bad) { try { fs.writeFileSync(path.join(dst, k), fs.readFileSync(path.join(src, k))); } catch (e) {} }
    const still = unreadable();
    if (still.length) console.warn(`\nThe Code tab's editor files cannot be read (${still.join(', ')}).\nFix: delete the folder app/vendor (in Terminal: rm -rf app/vendor) and run this again.\n`);
    else console.log('mended Monaco files:', bad.join(', '));
    return;
  }
  // file by file (fs.cpSync copies folder permissions too, which some synced or mounted folders refuse); old files are overwritten
  const copy = (from, to) => {
    if (fs.statSync(from).isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(from)) copy(path.join(from, f), path.join(to, f)); }
    else fs.writeFileSync(to, fs.readFileSync(from));
  };
  for (const part of ['loader.js', 'editor', 'base', 'basic-languages', 'language/typescript']) { fs.mkdirSync(path.dirname(path.join(dst, part)), { recursive: true }); copy(path.join(src, part), path.join(dst, part)); }
  fs.writeFileSync(mark, ver);
  console.log('copied Monaco', ver, 'into app/vendor/monaco');
}
const monacoTag = base => `<script>window.NP_MONACO_BASE = ${JSON.stringify(base)};</script>`;

const body = `<div id="app">
  <header class="topbar" aria-label="NotePath">
    <button type="button" class="brand" id="brand" aria-label="NotePath main menu"><span class="brand-mark"><img src="${markUri}" alt="" width="30" height="30"></span><span class="brand-name">NotePath</span></button>
    <nav class="crumbs" id="crumbs" aria-label="Breadcrumb"></nav>
    <button type="button" class="gear" id="gear" title="Settings (Esc)">Settings</button>
  </header>
  <main class="view" id="view" tabindex="-1"></main>
  <div class="upd" id="upd" role="status" hidden></div>
</div>
${scripts}
`;

const desktop = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' notepath:; script-src 'self' 'unsafe-inline'; worker-src 'self' blob: notepath:; style-src 'self' 'unsafe-inline'; font-src 'self' notepath:; img-src 'self' data: blob: https: notepath:; media-src 'self' blob: https: notepath:; connect-src 'self' notepath: https://en.wiktionary.org https://en.wikipedia.org https://api.dictionaryapi.dev https://api.mymemory.translated.net https://api.languagetool.org; frame-src https://www.youtube-nocookie.com https://player.vimeo.com">
<title>NotePath</title>
<link rel="stylesheet" href="fonts/fonts.css">
<style>
${css}
</style>
</head><body>
${monacoTag(fs.existsSync(path.join(R, 'node_modules/monaco-editor/min/vs/loader.js')) || fs.existsSync(path.join(R, 'app/vendor/monaco/vs/loader.js')) ? 'vendor/monaco/vs' : '')}
${body}
</body></html>
`;

const web = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NotePath</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,600;1,400;1,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Saira+Semi+Condensed:wght@400;500;600&family=Noto+Sans+Symbols&display=swap">
<style>
${css}
</style>
</head><body>
${monacoTag(`https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VER}/min/vs`)}
${body}
</body></html>
`;

module.exports = { files, LAZY, desktop, R, copyMonaco };
if (require.main !== module) return;
copyMonaco();
fs.writeFileSync(path.join(R, 'app/index.html'), desktop);
fs.mkdirSync(path.join(R, 'dist-web'), { recursive: true });
fs.writeFileSync(path.join(R, 'dist-web/notepath.html'), web);
console.log('app/index.html', desktop.length, 'bytes; dist-web/notepath.html', web.length, 'bytes');
