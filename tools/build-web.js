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
const files = ['web/lib/python-tokens.js', 'web/lib/music-theory.js', 'web/src/notes.js', 'web/src/notes-widgets.js', 'web/src/notes-graph.js', 'web/src/notes-sheet.js', 'web/src/app.js', 'web/src/textmenu.js', 'web/src/eula.js', 'web/src/settings.js'];
const scripts = files.map(f => {
  const src = read(f);
  if (/<\/script/i.test(src)) throw new Error(f + ' contains </script>, which would break the page.');
  try { new vm.Script(src, { filename: f }); } catch (e) { throw new Error(f + ': ' + e.message); }
  return `<script>/* ${f} */\n${src}\n</script>`;
}).join('\n');

const body = `<div id="app">
  <header class="topbar">
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
<meta http-equiv="Content-Security-Policy" content="default-src 'self' notepath:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' notepath:; img-src 'self' data: blob: https: notepath:; media-src 'self' blob: https: notepath:; connect-src 'self' notepath: https://en.wiktionary.org https://en.wikipedia.org https://api.dictionaryapi.dev https://api.mymemory.translated.net; frame-src https://www.youtube-nocookie.com https://player.vimeo.com">
<title>NotePath</title>
<link rel="stylesheet" href="fonts/fonts.css">
<style>
${css}
</style>
</head><body>
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
${body}
</body></html>
`;

module.exports = { files, desktop, R };
if (require.main !== module) return;
fs.writeFileSync(path.join(R, 'app/index.html'), desktop);
fs.mkdirSync(path.join(R, 'dist-web'), { recursive: true });
fs.writeFileSync(path.join(R, 'dist-web/notepath.html'), web);
console.log('app/index.html', desktop.length, 'bytes; dist-web/notepath.html', web.length, 'bytes');
