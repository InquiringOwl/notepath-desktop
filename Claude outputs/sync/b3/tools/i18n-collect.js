// Collects every English string NotePath shows, for the dictionaries in web/i18n/ (v0.5.8).
//   node tools/i18n-collect.js           runs smoke.js and interact.js with a collector in every page (web/lib/i18n.js walks
//                                        the page exactly as it does when translating), adds the sentences written in the
//                                        source (messages that the tests may not reach), and writes web/i18n/_catalog.json:
//                                        { "key": "where it was seen" } (keys are norm()ed: numbers {1}, names “{q1}”).
//   node tools/i18n-collect.js --check   lists, per language, the catalog keys its dictionary is missing (exit 1 if any).
// Needs Playwright (see smoke.js). The hook part (-r tools/i18n-collect.js with NP_COLLECT_OUT) is internal.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');

if (process.env.NP_COLLECT_OUT) { // ---- hook mode: inside smoke.js / interact.js
  const Module = require('module'), orig = Module.prototype.require, got = new Map();
  const add = batch => { for (const [k, w] of batch || []) if (!got.has(k)) got.set(k, w); };
  const wrapPage = async p => { try { await p.exposeBinding('__npCollect', (src, b) => add(b)); } catch (e) {} return p; };
  const wrapBrowser = b => {
    const np = b.newPage.bind(b); b.newPage = async (...a) => wrapPage(await np(...a));
    const nc = b.newContext.bind(b); b.newContext = async (...a) => { const c = await nc(...a); const cp = c.newPage.bind(c); c.newPage = async (...x) => wrapPage(await cp(...x)); return c; };
    return b;
  };
  let patched = false;
  Module.prototype.require = function (id) {
    const m = orig.apply(this, arguments);
    if (id === 'playwright' && !patched) { patched = true; const l = m.chromium.launch.bind(m.chromium); m.chromium.launch = async (...a) => wrapBrowser(await l(...a)); }
    return m;
  };
  process.on('exit', () => { let old = {}; try { old = JSON.parse(fs.readFileSync(process.env.NP_COLLECT_OUT, 'utf8')); } catch (e) {} for (const [k, w] of got) if (!(k in old)) old[k] = w; fs.writeFileSync(process.env.NP_COLLECT_OUT, JSON.stringify(old)); });
  return;
}

// the same key form as web/lib/i18n.js norm()
const AZ = 'abcdefghijklmnopqrstuvwxyz';
const norm = s => { let q = 0, c = 0, n = 0; return String(s).replace(/\s+/g, ' ').trim().replace(/“([^”]*)”/g, () => '“\u0001' + AZ[q++] + '”').replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi, () => '\u0002' + AZ[c++])
  .replace(/\d+(?:[.,:/]\d+)*/g, () => '{' + (++n) + '}').replace(/\u0001([a-z])/g, (m, x) => '{q' + (AZ.indexOf(x) + 1) + '}').replace(/\u0002([a-z])/g, (m, x) => '{c' + (AZ.indexOf(x) + 1) + '}'); };
const I18N = path.join(R, 'web/i18n'), CAT = path.join(I18N, '_catalog.json');

if (process.argv.includes('--check')) {
  const cat = JSON.parse(fs.readFileSync(CAT, 'utf8')); let bad = 0;
  for (const f of fs.readdirSync(I18N).filter(f => /^[a-z]{2}\.json$/.test(f))) {
    const d = JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8')).strings || {};
    const miss = Object.keys(cat).filter(k => !(k in d)), ph = Object.keys(d).filter(k => { const a = (k.match(/\{q?\d+\}/g) || []).sort().join(), b = (String(d[k]).match(/\{q?\d+\}/g) || []).sort().join(); return a !== b; });
    console.log(`${f}: ${Object.keys(d).length} strings, ${miss.length} missing, ${ph.length} with wrong placeholders`); if (miss.length || ph.length) bad++;
    miss.slice(0, 5).forEach(k => console.log('   missing: ' + k)); ph.slice(0, 5).forEach(k => console.log('   placeholders: ' + k + ' → ' + d[k]));
  }
  process.exit(bad ? 1 : 0);
}

// ---- main: run the tests with the hook, then add the source's sentences
const { execFileSync } = require('child_process');
const tmp = path.join(require('os').tmpdir(), 'np-i18n-seen.json');
if (!(process.argv.includes('--reuse') && fs.existsSync(tmp))) { // --reuse: the strings from the last run (when only the source part changed)
  fs.writeFileSync(tmp, '{}');
  for (const t of ['smoke.js', 'interact.js']) {
    try { execFileSync(process.execPath, ['-r', __filename, path.join(__dirname, t)], { stdio: ['ignore', 'ignore', 'inherit'], env: Object.assign({}, process.env, { NP_COLLECT_OUT: tmp }), timeout: 900000 }); }
    catch (e) { console.warn(t + ' did not pass; the strings it reached are still collected.'); }
  }
}
const seen = JSON.parse(fs.readFileSync(tmp, 'utf8'));
// words the tests type in (note titles and the like) are not the app's: leave out anything only the tests contain
const testText = ['interact.js', 'smoke.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
const srcFiles = ['web/lib', 'web/src'].flatMap(d => fs.readdirSync(path.join(R, d)).filter(f => /\.js$/.test(f)).map(f => path.join(R, d, f)));
const src = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
// sentences in the source: string literals, and the text between tags and in title / aria-label / placeholder attributes of
// template literals; a ${…} inside becomes a slot {s1}, {s2}… (a name or value filled in at run time)
// every string and template literal in the source, nested ones too; inside a template each ${…} becomes a marker (\u0003)
function literals(src) {
  const out = []; let i = 0;
  const str = q => { let v = ''; i++; while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { v += src[i] + src[i + 1]; i += 2; } else v += src[i++]; } i++; out.push(v); };
  const tpl = () => { let v = ''; i++; while (i < src.length && src[i] !== '`') { if (src[i] === '\\') { v += src[i] + src[i + 1]; i += 2; } else if (src[i] === '$' && src[i + 1] === '{') { i += 2; code(1); v += '\u0003'; } else v += src[i++]; } i++; out.push(v); };
  const code = depth => { // until the matching }
    while (i < src.length) { const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
      else if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; }
      else if (c === '"' || c === "'") str(c);
      else if (c === '`') tpl();
      else if (c === '/' && /[(,=:[!&|?{};]\s*$/.test(src.slice(Math.max(0, i - 30), i))) { i++; let cls = false; while (i < src.length && src[i] !== '\n') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i++; } i++; } // a regex literal
      else if (c === '{') { i++; code(depth + 1); }
      else if (c === '}') { i++; if (depth) return; }
      else i++; } };
  code(0); return out;
}
const lits = srcFiles.flatMap(f => literals(fs.readFileSync(f, 'utf8')));
const sentence = t => { t = t.replace(/\\n/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\(["'`])/g, '$1').replace(/\s+/g, ' ').trim();
  const lit = t.replace(/\u0003/g, ' ');
  if (lit.replace(/[^\p{L}]/gu, '').length < 3 || !/\p{L}{3,}/u.test(lit)) return null;
  if (/[{}<>=;]|\b(var|const|function|return|typeof)\b|^\.|\bnb-|\bnp-|\bnw-|#[a-z]|\w\.\w+\(|https?:|\\u|=>|^[a-z]+(-[a-z]+)+$|^[a-z]+[A-Z]\w*$/.test(lit)) return null;
  if (!/[A-Z“‹←↶↷＋⇪✓⚠✕◀▶☆★◷●▲◆✍🎙]/u.test(lit[0] === '\u0003' ? lit.trim()[0] || '' : lit[0]) && !/^\u0003\s*[:·]?\s*[a-z]/.test(t) && !/\s[a-z]{3,}\s[a-z]{2,}/.test(lit)) return null;
  return t; };
const toKey = t => { let n = 0; return norm(t.replace(/\u0003/g, '\u0004')).replace(/\u0004/g, () => '{s' + (++n) + '}'); };
const fromSrc = {}, pats = [];
for (const L0 of lits) {
  const L = L0;
  const parts = /<[a-z]/i.test(L) ? [...L.matchAll(/>([^<>]{2,400})</g)].map(m => m[1]).concat([...L.matchAll(/(?:title|aria-label|placeholder|data-label)="([^"]{3,300})"/g)].map(m => m[1])) : [L];
  for (const p of parts) { const s = sentence(p); if (!s || s.length > 220) continue; const k = toKey(s);
    if (/^(\{s\d+\}[\s·:,.]*)+$/.test(k)) continue;
    fromSrc[k] = 'source'; if (/\{s\d+\}/.test(k)) pats.push(k); }
}
const patRe = pats.map(k => new RegExp('^' + k.split(/(\{s\d+\})/).map(p => /^\{s\d+\}$/.test(p) ? '(.*?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$'));
const srcFlat = norm(src);
const testTitles = [...new Set(literals(testText).map(t => norm(t)).filter(t => t.length >= 4 && /\p{L}{3}/u.test(t) && !/[<>{}=$]/.test(t.replace(/\{\d+\}/g, '')) && !srcFlat.includes(t)))];
const cat = {};
let covered = 0;
for (const [k, w] of Object.entries(seen)) {
  const plain = k.replace(/\{[qcs]?\d+\}/g, '');
  if (!/\p{L}{2,}/u.test(plain) || /(.)\1{6,}/.test(k)) continue;
  if (testText.includes(k) && !src.includes(k)) continue; // a test's own words
  if (testTitles.some(t => k.includes(t))) continue; // a note or folder name from the tests inside a longer string
  if (!srcFlat.includes(k) && patRe.some(r => r.test(k))) { covered++; continue; } // a name filled into a sentence the source has as a pattern
  cat[k] = w;
}
let added = 0;
for (const [k, w] of Object.entries(fromSrc)) if (!(k in cat)) { cat[k] = w; added++; }
fs.mkdirSync(I18N, { recursive: true });
const sorted = Object.fromEntries(Object.keys(cat).sort((a, b) => a.localeCompare(b)).map(k => [k, cat[k]]));
fs.writeFileSync(CAT, JSON.stringify(sorted, null, 1));
console.log(`web/i18n/_catalog.json: ${Object.keys(sorted).length} strings (${Object.keys(sorted).length - added} seen on screen, ${added} more from the source, ${pats.length} of them patterns; ${covered} seen strings covered by a pattern)`);
