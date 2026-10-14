// NotePath theme packs: the one set of rules for what a pack may hold (docs/theme-packets-spec.md). Used by main.js (install,
// remove, list, the notepath://theme/ handler), tools/theme-check.js (authors), tools/theme-pack.js (build + sign) and
// tools/unit.js. Node only, no dependencies: zip via zlib, signatures via crypto (ed25519).
// A pack is data, never code: a manifest, a signature list and images. Anything else is refused whole.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

const LIMITS = {
  files: 64, depth: 2, image: 2 * 1024 * 1024, px: 4096,
  weight: { light: { bytes: 1 * 1024 * 1024, moving: 0, art: 8 * 1024 * 1024 }, medium: { bytes: 5 * 1024 * 1024, moving: 3, art: 30 * 1024 * 1024 }, rich: { bytes: 15 * 1024 * 1024, moving: 8, art: 80 * 1024 * 1024 } },
  layers: 8, loop: 6
};
const EXT = ['.json', '.webp', '.avif', '.png', '.svg'];
const IMG = ['.webp', '.avif', '.png', '.svg'];
const TOKENS = ['bg', 'surface', 'accent', 'tint', 'text', 'muted', 'faint'];
const MOTIONS = ['none', 'drift', 'float', 'twinkle', 'pulse'];
const PLACES = ['menu', 'margins', 'splash'];
const MODES = ['moderate', 'full'];
const FAMILIES = ['Light', 'Dark', 'Nature', 'Water', 'Earth', 'Airy', 'Glass'];
// ids of the themes built into NotePath (settings.js THEMES + MINIS + its own ids): a downloaded pack may not take one (unit.js keeps this in step)
const RESERVED = ['system', 'custom', 'preset-1', 'preset-2', 'preset-3', 'paper', 'sepia', 'graphite', 'midnight', 'capsuleer', 'obsidian', 'high-contrast', 'old-growth', 'moss', 'abyssal', 'tidepool', 'ember', 'canyon', 'mist', 'dusk', 'frost', 'aurora'];
const SEMVER = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,5})$/;
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SEG = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/* ---------- colours ---------- */
const hexOk = c => typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c);
const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function lum(c) { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// the spec's contrast rules: text and muted 4.5:1 on bg and surface, faint 3:1, accent 3:1 on bg
function checkColors(c, err) {
  if (!c || typeof c !== 'object') { err('colors is missing'); return; }
  for (const k of TOKENS) if (!hexOk(c[k]) || c[k].length !== 7) err(`colors.${k} must be a 6-digit hex colour like #1F1F1E`);
  if (c.glow != null && !hexOk(c.glow)) err('colors.glow must be a 6- or 8-digit hex colour');
  if (c.glass != null && !(typeof c.glass === 'number' && c.glass >= 0 && c.glass <= 1)) err('colors.glass must be a number from 0 to 1');
  if (!TOKENS.every(k => hexOk(c[k]))) return;
  const need = [['text', 4.5], ['muted', 4.5], ['faint', 4.5]]; // faint carries small hints and counts in NotePath, so it needs 4.5:1 too (spec draft 1 said 3:1)
  for (const [k, min] of need) for (const on of ['bg', 'surface']) {
    const r = ratio(c[k], c[on]); if (r < min) err(`colors.${k} on ${on} is ${r.toFixed(2)}:1; it must be at least ${min}:1`);
  }
  const ra = ratio(c.accent, c.bg); if (ra < 3) err(`colors.accent on bg is ${ra.toFixed(2)}:1; it must be at least 3:1`);
}

/* ---------- file names and images ---------- */
function checkName(p) { // "art/sky.webp": lowercase, at most 2 levels, no .., no leading slash
  if (typeof p !== 'string' || !p || p.length > 160 || p.includes('\\') || p.startsWith('/') || /^[a-z]:/i.test(p)) return 'bad path';
  const parts = p.split('/');
  if (parts.length > LIMITS.depth + 1) return 'folders deeper than 2 levels';
  if (parts.some(s => s === '..' || s === '.' || !SEG.test(s))) return 'names may use lowercase letters, digits, hyphens and dots only';
  if (!EXT.includes(path.posix.extname(p))) return `file type ${path.posix.extname(p) || '(none)'} is not allowed (only ${EXT.join(' ')})`;
  return '';
}
function imageSize(name, buf) {
  const ext = path.posix.extname(name);
  try {
    if (ext === '.png') { if (buf.toString('ascii', 1, 4) !== 'PNG') return null; return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
    if (ext === '.webp') {
      if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
      const f = buf.toString('ascii', 12, 16);
      if (f === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
      return null;
    }
    if (ext === '.avif') { const i = buf.indexOf('ispe'); if (i < 0) return null; return { w: buf.readUInt32BE(i + 8), h: buf.readUInt32BE(i + 12) }; }
    if (ext === '.svg') {
      const s = buf.toString('utf8'), vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
      const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(s), h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(s);
      if (w && h) return { w: +w[1], h: +h[1] }; if (vb) return { w: +vb[1], h: +vb[2] }; return { w: 0, h: 0 };
    }
  } catch (e) { return null; }
  return null;
}
// SVGs are drawn as images (never put into the page), and still refused if they carry anything active or anything from outside
function svgProblem(buf) {
  const s = buf.toString('utf8');
  if (!/<svg[\s>]/i.test(s)) return 'is not an SVG';
  const bad = [[/<script/i, 'a script'], [/\son[a-z]+\s*=/i, 'an event handler'], [/<foreignObject/i, 'an embedded document'], [/<(iframe|embed|object|image|use|a)[\s>]/i, 'an embedded or linked element'],
    [/javascript:/i, 'a javascript: link'], [/(xlink:)?href\s*=\s*["']\s*(?!#)/i, 'a link outside the file'], [/@import/i, 'a style import'], [/url\(\s*["']?\s*(?!#)/i, 'an outside url()'], [/<!ENTITY/i, 'an XML entity'], [/<\?xml-stylesheet/i, 'a stylesheet']];
  for (const [re, what] of bad) if (re.test(s)) return 'contains ' + what;
  return '';
}

/* ---------- manifest ---------- */
function checkManifest(m, err, warn, o) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) { err('manifest.json must be a JSON object'); return; }
  if (m.schema !== 1) err('schema must be 1');
  if (!ID.test(m.id || '')) err('id must be 2–40 lowercase letters, digits or hyphens, like city-night');
  for (const k of ['name', 'author']) if (typeof m[k] !== 'string' || !m[k].trim() || m[k].length > 60) err(`${k} must be a short piece of text`);
  if (!SEMVER.test(m.version || '')) err('version must look like 1.0.0');
  if (m.minApp != null && !SEMVER.test(m.minApp)) err('minApp must look like 0.6.0');
  if (!LIMITS.weight[m.weight]) err('weight must be light, medium or rich');
  if (!FAMILIES.includes(m.family)) err(`family must be one of ${FAMILIES.join(', ')}`);
  if (m.style != null && !['plain', 'console'].includes(m.style)) err('style must be plain or console');
  const lic = m.license;
  if (!lic || !['free', 'paid'].includes(lic.type)) err('license.type must be free or paid');
  else if (lic.type === 'paid' && !ID.test(lic.product || '')) err('a paid pack needs license.product, its product id');
  if (!o.bundled || m.preview != null) { if (typeof m.preview !== 'string') err('preview must name the 640 × 360 card image'); }
  checkColors(m.colors, err);
  if (m.description != null && !(typeof m.description === 'string' && m.description.length <= 120)) err('description must be at most 120 characters');
  if (m.credits != null && !(Array.isArray(m.credits) && m.credits.every(c => typeof c === 'string' && c.length <= 200))) err('credits must be a list of short lines');
  if (m.scenes != null) checkScenes(m, err, warn);
}
function checkScenes(m, err) {
  const sc = m.scenes, budget = LIMITS.weight[m.weight];
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) { err('scenes must be an object of places'); return; }
  for (const [place, s] of Object.entries(sc)) {
    if (!PLACES.includes(place)) { err(`scenes.${place}: scenes may only be on ${PLACES.join(', ')} (never behind the editor or dialogs)`); continue; }
    if (!s || typeof s.still !== 'string') { err(`scenes.${place}.still must name the still image (Lite and reduce motion show only it)`); continue; }
    const layers = s.layers || [];
    if (!Array.isArray(layers)) { err(`scenes.${place}.layers must be a list`); continue; }
    if (layers.length > LIMITS.layers) err(`scenes.${place}: at most ${LIMITS.layers} layers`);
    let moving = 0, modMoving = 0;
    layers.forEach((l, i) => {
      const at = `scenes.${place}.layers[${i}]`;
      if (!l || typeof l.image !== 'string') { err(`${at}.image must name an image`); return; }
      if (!MOTIONS.includes(l.motion || 'none')) err(`${at}.motion must be one of ${MOTIONS.join(', ')}`);
      if (!MODES.includes(l.min || 'full')) err(`${at}.min must be moderate or full (Lite shows only the still)`);
      const mv = (l.motion || 'none') !== 'none';
      if (mv) { moving++; if ((l.min || 'full') === 'moderate') modMoving++; }
      for (const k of ['speed', 'amount', 'period', 'depth']) if (l[k] != null && !(typeof l[k] === 'number' && isFinite(l[k]) && l[k] >= 0)) err(`${at}.${k} must be a number`);
      if (['float', 'twinkle', 'pulse'].includes(l.motion) && (l.period == null || l.period < LIMITS.loop)) err(`${at}: a ${l.motion} loop must take at least ${LIMITS.loop} seconds (period)`);
      if (l.motion === 'twinkle' && l.depth != null && l.depth > 0.5) err(`${at}: twinkle depth must be 0.5 or less (no flashing)`);
      if (l.motion === 'drift' && !(l.speed > 0 && l.speed <= 200)) err(`${at}: drift needs a speed from 1 to 200 px a second`);
      if (l.direction != null && !['left', 'right', 'up', 'down'].includes(l.direction)) err(`${at}.direction must be left, right, up or down`);
    });
    if (moving > budget.moving) err(`scenes.${place}: ${moving} moving layers is more than a ${m.weight} pack may have (${budget.moving})`);
    if (modMoving > 3) err(`scenes.${place}: at most 3 moving layers may show in Moderate`);
  }
}
const sceneFiles = m => { const out = []; for (const s of Object.values(m.scenes || {})) { if (s && s.still) out.push(s.still); (s && s.layers || []).forEach(l => l && l.image && out.push(l.image)); } return out; };

/* ---------- the whole pack ---------- */
// files: Map of "path" → Buffer (signature.json may be among them). o.bundled: a pack shipped inside the app (no preview needed).
function validate(files, o) {
  o = o || {};
  const errors = [], warnings = [], err = m => errors.push(m), warn = m => warnings.push(m);
  const names = [...files.keys()];
  if (names.length > LIMITS.files) err(`${names.length} files: a pack may hold at most ${LIMITS.files}`);
  let total = 0, art = 0;
  for (const n of names) {
    const bad = checkName(n); if (bad) { err(`${n}: ${bad}`); continue; }
    const buf = files.get(n); total += buf.length;
    if (IMG.includes(path.posix.extname(n))) {
      if (buf.length > LIMITS.image) err(`${n}: ${(buf.length / 1048576).toFixed(1)} MB; one image may be at most 2 MB`);
      if (n.endsWith('.svg')) { const p = svgProblem(buf); if (p) err(`${n} ${p}`); }
      const sz = imageSize(n, buf);
      if (!sz) err(`${n}: not a readable ${path.posix.extname(n).slice(1).toUpperCase()} image`);
      else { if (Math.max(sz.w, sz.h) > LIMITS.px) err(`${n}: ${sz.w} × ${sz.h} px; the longest side may be at most ${LIMITS.px} px`); art += sz.w * sz.h * 4; }
    }
  }
  let m = null;
  if (!files.has('manifest.json')) err('manifest.json is missing');
  else { try { m = JSON.parse(files.get('manifest.json').toString('utf8')); } catch (e) { err('manifest.json is not valid JSON'); } }
  if (m) {
    checkManifest(m, err, warn, o);
    const refs = [m.preview, ...sceneFiles(m)].filter(Boolean);
    for (const r of refs) { if (checkName(r) || !IMG.includes(path.posix.extname(r))) err(`${r}: not an allowed image path`); else if (!files.has(r)) err(`${r} is named in the manifest but is not in the pack`); }
    if (m.preview && files.has(m.preview)) { const sz = imageSize(m.preview, files.get(m.preview)); if (sz && (sz.w !== 640 || sz.h !== 360)) warn(`${m.preview} is ${sz.w} × ${sz.h}; cards expect 640 × 360`); }
    const b = LIMITS.weight[m.weight];
    if (b && total > b.bytes) err(`the pack is ${(total / 1048576).toFixed(2)} MB; a ${m.weight} pack must be under ${b.bytes / 1048576} MB`);
    if (b && art > b.art) err(`its art needs about ${Math.round(art / 1048576)} MB of memory; a ${m.weight} pack must stay under ${b.art / 1048576} MB`);
  }
  if (!o.bundled && !files.has('signature.json')) err('signature.json is missing (build the pack with npm run theme:pack)');
  const moving = m ? Math.max(0, ...Object.values(m.scenes || {}).map(s => (s && s.layers || []).filter(l => l && (l.motion || 'none') !== 'none').length)) : 0;
  const suggest = moving > 3 || total > LIMITS.weight.medium.bytes ? 'rich' : moving > 0 || total > LIMITS.weight.light.bytes ? 'medium' : 'light';
  return { ok: !errors.length, errors, warnings, manifest: m, bytes: total, artBytes: art, suggest };
}

/* ---------- signatures (ed25519 over the list of SHA-256 hashes) ---------- */
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function hashList(files) { const out = {}; [...files.keys()].filter(n => n !== 'signature.json').sort().forEach(n => { out[n] = sha(files.get(n)); }); return out; }
const signedBytes = list => Buffer.from(JSON.stringify(Object.keys(list).sort().map(k => [k, list[k]])), 'utf8');
function sign(files, privateKeyPem) {
  const list = hashList(files);
  const sig = crypto.sign(null, signedBytes(list), crypto.createPrivateKey(privateKeyPem)).toString('base64');
  return Buffer.from(JSON.stringify({ v: 1, files: list, sig }, null, 1));
}
function publicKeyObject(pub) { // base64 of the DER (SPKI) form, as theme-key.json keeps it
  return crypto.createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' });
}
function verify(files, pub) {
  if (!pub) return 'NotePath has no signing key yet, so it cannot install packs';
  let s; try { s = JSON.parse(files.get('signature.json').toString('utf8')); } catch (e) { return 'signature.json is not readable'; }
  if (!s || s.v !== 1 || !s.files || typeof s.sig !== 'string') return 'signature.json is not in the right form';
  const now = hashList(files);
  const a = Object.keys(now).sort(), b = Object.keys(s.files).sort();
  if (a.join('\n') !== b.join('\n')) return 'the pack holds different files from the ones that were signed';
  for (const k of a) if (now[k] !== s.files[k]) return `${k} changed after the pack was signed`;
  let ok = false; try { ok = crypto.verify(null, signedBytes(s.files), publicKeyObject(pub), Buffer.from(s.sig, 'base64')); } catch (e) { ok = false; }
  return ok ? '' : 'the signature does not match NotePath\'s key';
}
function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}

/* ---------- zip (an .nptheme file is an ordinary zip) ---------- */
function readZip(buf, maxTotal) {
  maxTotal = maxTotal || LIMITS.weight.rich.bytes + 1024 * 1024;
  let e = buf.length - 22; const stop = Math.max(0, buf.length - 65557);
  while (e >= stop && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < stop) throw new Error('not a zip file');
  const count = buf.readUInt16LE(e + 10), cdOff = buf.readUInt32LE(e + 16);
  if (count > LIMITS.files + 1) throw new Error(`${count} files: a pack may hold at most ${LIMITS.files}`);
  const out = new Map(); let p = cdOff, total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('the zip directory is damaged');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), made = buf.readUInt16LE(p + 4) >> 8;
    const ext = buf.readUInt32LE(p + 38), loc = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue; // a folder entry
    if (made === 3 && ((ext >>> 16) & 0o170000) === 0o120000) throw new Error(`${name} is a link; packs may not hold links`);
    const bad = checkName(name); if (bad && (name.includes('..') || name.startsWith('/') || name.includes('\\'))) throw new Error(`${name}: unsafe path`);
    if (out.has(name)) throw new Error(`${name} is in the zip twice`);
    total += usize; if (total > maxTotal) throw new Error('the pack is too big when unpacked');
    if (buf.readUInt32LE(loc) !== 0x04034b50) throw new Error('the zip is damaged');
    const start = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28), raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(usize, 1) });
    else throw new Error(`${name} uses a zip method NotePath does not read`);
    if (data.length !== usize) throw new Error(`${name} is damaged`);
    out.set(name, data);
  }
  return out;
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function writeZip(files) {
  const parts = [], cd = []; let off = 0;
  for (const [name, data] of [...files.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const nm = Buffer.from(name, 'utf8'), z = zlib.deflateRawSync(data), use = z.length < data.length, body = use ? z : data, crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(use ? 8 : 0, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, body);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(use ? 8 : 0, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    cd.push(c, nm); off += 30 + nm.length + body.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, end]);
}
function readFolder(dir) { // an author's pack folder → Map (links and hidden files refused)
  const out = new Map();
  (function walk(d, rel, depth) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.DS_Store' || e.name === 'Thumbs.db') continue;
      const r = rel ? rel + '/' + e.name : e.name, full = path.join(d, e.name), st = fs.lstatSync(full);
      if (st.isSymbolicLink()) throw new Error(`${r} is a link; packs may not hold links`);
      if (st.isDirectory()) { if (depth >= LIMITS.depth) throw new Error(`${r}: folders deeper than 2 levels`); walk(full, r, depth + 1); }
      else out.set(r, fs.readFileSync(full));
    }
  })(dir, '', 0);
  return out;
}

/* ---------- installed packs: <userData>/themes/ ---------- */
// index.json = { v: 1, packs: { id: { version, name, installed } } }; one folder per pack and version: <id>/<version>/
const indexPath = dir => path.join(dir, 'index.json');
function readIndex(dir) { try { const j = JSON.parse(fs.readFileSync(indexPath(dir), 'utf8')); if (j && j.packs && typeof j.packs === 'object') return j; } catch (e) {} return { v: 1, packs: {} }; }
function writeIndex(dir, idx) { fs.mkdirSync(dir, { recursive: true }); const t = indexPath(dir) + '.tmp'; fs.writeFileSync(t, JSON.stringify(idx, null, 1)); fs.renameSync(t, indexPath(dir)); }
function cmpVer(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }
function summary(m, bytes) { return { id: m.id, name: m.name, author: m.author, version: m.version, weight: m.weight, family: m.family, style: m.style || 'plain', license: m.license.type, colors: m.colors, preview: m.preview || null, scenes: !!m.scenes, credits: m.credits || [], bytes }; }
// buf: the .nptheme file. o: { pub (base64 key or null), appVersion, bundledIds }. Returns { ok, pack } or { ok: false, error }.
function install(dir, buf, o) {
  o = o || {};
  let files; try { files = readZip(buf); } catch (e) { return { ok: false, error: 'Couldn\'t read this pack: ' + e.message }; }
  const bad = verify(files, o.pub); if (bad) return { ok: false, error: 'Couldn\'t verify this pack, so it wasn\'t installed: ' + bad + '.' };
  const v = validate(files); if (!v.ok) return { ok: false, error: 'This pack breaks NotePath\'s rules, so it wasn\'t installed: ' + v.errors[0] + (v.errors.length > 1 ? ` (and ${v.errors.length - 1} more)` : '') + '.' };
  const m = v.manifest;
  if ((o.bundledIds || []).includes(m.id)) return { ok: false, error: `“${m.name}” uses the name of a theme built into NotePath.` };
  if (m.minApp && o.appVersion && cmpVer(o.appVersion, m.minApp) < 0) return { ok: false, error: `This pack needs NotePath ${m.minApp} or newer.` };
  const tmp = path.join(dir, 'downloads', 'unpack-' + process.pid + '-' + Date.now()), dest = path.join(dir, m.id, m.version);
  try {
    for (const [n, data] of files) { const f = path.join(tmp, ...n.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
    fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(tmp, dest);
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: e.code === 'ENOSPC' ? `Not enough disk space: ${(v.bytes / 1048576).toFixed(1)} MB needed.` : 'Couldn\'t save the pack: ' + e.message }; }
  const idx = readIndex(dir), old = idx.packs[m.id];
  idx.packs[m.id] = { version: m.version, name: m.name, installed: Date.now() }; writeIndex(dir, idx);
  try { for (const ver of fs.readdirSync(path.join(dir, m.id))) if (ver !== m.version) fs.rmSync(path.join(dir, m.id, ver), { recursive: true, force: true }); } catch (e) {} // the old version goes once the new one is in
  return { ok: true, pack: summary(m, v.bytes), replaced: old ? old.version : null };
}
function remove(dir, id) {
  if (!ID.test(id || '')) return { ok: false, error: 'No such pack.' };
  const idx = readIndex(dir); const had = !!idx.packs[id]; delete idx.packs[id]; writeIndex(dir, idx);
  try { fs.rmSync(path.join(dir, id), { recursive: true, force: true }); } catch (e) {}
  return { ok: had };
}
function list(dir) { // every installed pack, re-checked (a damaged one comes back with broken: true so the app can fall back)
  const idx = readIndex(dir), out = [];
  for (const [id, e] of Object.entries(idx.packs)) {
    const d = path.join(dir, id, e.version || '');
    let pack = null, broken = '';
    try { const files = readFolder(d), v = validate(files); if (v.ok) pack = summary(v.manifest, v.bytes); else broken = v.errors[0]; } catch (err) { broken = 'missing'; }
    out.push(pack ? pack : { id, name: e.name || id, version: e.version, broken: broken || 'damaged' });
  }
  return out;
}
// notepath://theme/<id>/<path>: the file inside the installed version, or null (unknown pack, a path that climbs out, a type not allowed)
function resolve(dir, id, rel) {
  if (!ID.test(id || '')) return null;
  rel = String(rel || '').replace(/^\/+/, '');
  if (checkName(rel)) return null;
  const e = readIndex(dir).packs[id]; if (!e || !SEMVER.test(e.version || '')) return null;
  const root = path.join(dir, id, e.version), f = path.resolve(root, ...rel.split('/'));
  if (!f.startsWith(root + path.sep)) return null;
  try { const st = fs.lstatSync(f); if (!st.isFile()) return null; const real = fs.realpathSync(f); if (!real.startsWith(fs.realpathSync(root) + path.sep)) return null; } catch (e2) { return null; }
  return f;
}
function clearDownloads(dir) { try { fs.rmSync(path.join(dir, 'downloads'), { recursive: true, force: true }); } catch (e) {} }

module.exports = { RESERVED, LIMITS, EXT, TOKENS, MOTIONS, FAMILIES, ratio, checkColors, checkName, svgProblem, imageSize, validate, sign, verify, keyPair, readZip, writeZip, readFolder, install, remove, list, resolve, readIndex, clearDownloads, cmpVer };
