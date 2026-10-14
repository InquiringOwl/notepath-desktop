// Checks a theme pack folder (or a built .nptheme file) against NotePath's rules: the same code the app runs when it installs one.
// Run: npm run theme:check <folder or file.nptheme>   (exit code 1 if the pack would be refused)
const fs = require('fs'), path = require('path');
const T = require('../themes-core.js');
const arg = process.argv[2];
if (!arg) { console.error('Usage: npm run theme:check <pack folder or .nptheme file>'); process.exit(2); }
let files, built = false;
try {
  if (fs.statSync(arg).isDirectory()) files = T.readFolder(arg);
  else { files = T.readZip(fs.readFileSync(arg)); built = true; }
} catch (e) { console.error('✗ ' + e.message); process.exit(1); }
const bundled = path.resolve(arg).startsWith(path.resolve(__dirname, '../web/themes') + path.sep);
const v = T.validate(built ? files : new Map([...files, ...(files.has('signature.json') ? [] : [['signature.json', Buffer.from('{}')]])]), { bundled });
const m = v.manifest || {};
console.log(`${m.name || '(no name)'} ${m.version || ''} · ${m.weight || '?'} pack · ${files.size} files · ${(v.bytes / 1024).toFixed(1)} KB${bundled ? ' · built into NotePath' : ''}`);
if (m.colors) console.log('Contrast: ' + ['text', 'muted', 'faint'].map(k => `${k} ${T.ratio(m.colors[k], m.colors.bg).toFixed(1)}:1 / ${T.ratio(m.colors[k], m.colors.surface).toFixed(1)}:1`).join(' · ') + ` · accent ${T.ratio(m.colors.accent, m.colors.bg).toFixed(1)}:1`);
v.warnings.forEach(w => console.log('! ' + w));
v.errors.forEach(e => console.log('✗ ' + e));
if (built && !v.errors.length) { const pub = require('../theme-key.json').publicKey; const s = T.verify(files, pub); console.log(s ? '! signature: ' + s : '✓ signature matches NotePath\'s key'); }
console.log(v.ok ? `✓ passes. Recommended weight: ${v.suggest}${v.suggest !== m.weight ? ` (it says ${m.weight})` : ''}.` : `✗ ${v.errors.length} problem${v.errors.length === 1 ? '' : 's'}: NotePath would refuse this pack.`);
process.exit(v.ok ? 0 : 1);
