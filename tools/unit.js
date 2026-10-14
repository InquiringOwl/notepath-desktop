// Fast checks with no browser (~1 s): every source file parses, the app's identity is the same everywhere it is written
// (so releases reach installed copies and never collide with Inquire or Inquire Law), and the helper rules the note
// widgets use still work. Run: node tools/unit.js   (part of npm run check and CI)
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(R, f), 'utf8');
const fails = [], pass = [];
const ok = (c, name, got) => (c ? pass : fails).push(name + (c ? '' : ' → got ' + JSON.stringify(got)));

// 1. every page script parses
const { files } = require('./build-web.js');
for (const f of files) { try { new vm.Script(read(f), { filename: f }); ok(true, 'parses: ' + f); } catch (e) { ok(false, 'parses: ' + f, e.message); } }
// every script in web/src is built into the page (a file left out of build-web.js = a feature that silently does nothing)
{ const fsx = require('fs'), px = require('path'), all = fsx.readdirSync(px.join(__dirname, '../web/src')).filter(f => f.endsWith('.js')).map(f => 'web/src/' + f), miss = all.filter(f => !files.includes(f));
  ok(!miss.length, 'every web/src script is in the page', miss); }

// v0.5.7: lazy modules (web/lib/lazy.js): each lazy file must set the window global that wakes it, and none may be needed at start-up
{ const { LAZY } = require('./build-web.js');
  for (const [f, [name, glob]] of Object.entries(LAZY)) ok(new RegExp('window\\.' + glob + ' *=').test(read(f)), 'lazy module ' + name + ' sets window.' + glob);
  ok(Object.keys(LAZY).every(f => files.includes(f)) && files[0] === 'web/lib/lazy.js', 'lazy.js comes first and every lazy file is in the page'); }

// 2. identity: one name, one app id, one repo, one scheme, one storage prefix
const pkg = JSON.parse(read('package.json')), main = read('main.js'), rel = read('tools/release.js'), wf = read('.github/workflows/release.yml');
const pub = pkg.build.publish[0];
ok(pkg.name === 'notepath-desktop' && pkg.productName === 'NotePath' && pkg.build.productName === 'NotePath', 'package name and product name', [pkg.name, pkg.productName]);
ok(pkg.build.appId === 'com.wolfiescoven.notepath', 'appId is NotePath\'s own (never Inquire\'s com.wolfiescoven.codex or Inquire Law\'s)', pkg.build.appId);
ok(pub.provider === 'github' && pub.owner === 'InquiringOwl' && pub.repo === 'notepath-desktop', 'updates come from InquiringOwl/notepath-desktop', pub);
ok(main.includes(`const OWNER = '${pub.owner}'`) && main.includes(`const RELEASES_REPO = '${pub.repo}'`), 'main.js checks the same repo for updates as package.json publishes to');
ok(rel.includes(pub.owner + '/' + pub.repo), 'release.js links the same repo');
ok(/scheme: 'notepath'/.test(main) && /notepath:\/\/app\/index\.html/.test(main) && /protocol\.handle\('notepath'/.test(main), 'main.js serves the page on notepath://');
ok(/default-src 'self' notepath:/.test(read('tools/build-web.js')), 'the page CSP allows notepath://');
ok(/'ubuntu-latest'|ubuntu-latest/.test(wf) && /macos-latest/.test(wf) && /windows-latest/.test(wf), 'release workflow builds macOS, Windows and Linux');
ok(['dmg', 'zip'].every(t => pkg.build.mac.target.some(x => x.target === t)) && pkg.build.win.target.some(x => x.target === 'nsis') && pkg.build.linux.target.includes('AppImage'),
  'installers: Mac dmg + zip (the zip is what the Mac self-updater installs), Windows nsis, Linux AppImage');
const web = files.map(read).join('\n');
const keys = [...new Set([...web.matchAll(/["'`](inqlaw|codex|notepath)\.[a-z]/g)].map(m => m[1]))];
ok(JSON.stringify(keys) === '["notepath"]', 'localStorage keys all start with "notepath."', keys);
ok(!/inquire-law-notes|"inquire-notes"/.test(web) && /notepath-notes/.test(web), 'photos and videos live in NotePath\'s own IndexedDB');
ok(!/Inquire Law|inquire-law/i.test(web + main + rel), 'no Inquire Law names left in the app');

// 3. the rules the note widgets borrow from Inquire's kits
const ctx = vm.createContext({}); ctx.window = ctx;
vm.runInContext(read('web/lib/python-tokens.js'), ctx); vm.runInContext(read('web/lib/music-theory.js'), ctx);
const toks = ctx.CSRules.tokens('def f(x): return 2  # done');
ok(toks.some(t => t.t === 'kw' && t.s === 'def') && toks.some(t => t.t === 'num') && toks.some(t => t.t === 'com' || /#/.test(t.s)), 'Python highlighting finds keywords, numbers and comments', toks);
ok(ctx.MusicTheory.name(ctx.MusicTheory.up('C4', 'M3')) === 'E4' && ctx.MusicTheory.name(ctx.MusicTheory.up('A3', 'm3')) === 'C4', 'MusicTheory.up: C4 + M3 = E4, A3 + m3 = C4',
  [ctx.MusicTheory.name(ctx.MusicTheory.up('C4', 'M3')), ctx.MusicTheory.name(ctx.MusicTheory.up('A3', 'm3'))]);

// 4. the graph widget's maths (notes-graph.js)
vm.runInContext(read('web/src/notes-graph.js'), ctx);
const G = ctx.NPGraph, eq = pts => G.analyse({ pts, fit: 'curve' }).eqs.map(e => e.eq).join(' | ');
ok(eq([[0, 1], [1, 3], [2, 7]]) === 'y = x² + x + 1', 'graph: a curve through (0,1) (1,3) (2,7) is y = x² + x + 1', eq([[0, 1], [1, 3], [2, 7]]));
ok(eq([[0, 0], [2, 1]]) === 'y = (1/2)x', 'graph: two points give a line with a fraction slope', eq([[0, 0], [2, 1]]));
ok(eq([[1, -2], [3, -2]]) === 'y = −2', 'graph: a flat line', eq([[1, -2], [3, -2]]));
ok(eq([[3, 1], [3, 5]]) === 'x = 3', 'graph: a vertical line', eq([[3, 1], [3, 5]]));
const bf = G.analyse({ pts: [[0, 0], [1, 1], [2, 2], [3, 3]], fit: 'best' });
ok(bf.eqs[0].eq === 'y = x' && bf.facts.some(f => f[0] === 'r²' && /^1\.000/.test(f[1])), 'graph: best-fit line and r²', bf);
const ln = G.analyse({ pts: [[0, 0], [2, 2], [4, 0]], fit: 'lines' }).eqs.map(e => e.eq);
ok(JSON.stringify(ln) === '["y = x","y = −x + 4"]', 'graph: straight lines between neighbours', ln);
ok(G.fmt(0.333333333) === '1/3' && G.fmt(-2.5) === '−5/2' && G.fmt(3.14159) === '3.142', 'graph: number formatting', [G.fmt(0.333333333), G.fmt(-2.5), G.fmt(3.14159)]);

// 4b. AI Chat / Grammar check helpers (assist.js) and the Map widget's text (notes-map.js), v0.5.6
ctx.URLSearchParams = URLSearchParams; vm.runInContext(read('web/src/assist.js'), ctx); vm.runInContext(read('web/src/notes-map.js'), ctx);
{
  const A = ctx.NPAssist, P = b => Object.fromEntries(new URLSearchParams(b));
  const q = P(A.grammarBody('Hi there', 'quick', 'en-GB')), f = P(A.grammarBody('Hi', 'formal', 'xx')), sc = P(A.grammarBody('Hi', 'school', 'en-US'));
  ok(q.language === 'en-GB' && !q.level && /STYLE/.test(q.disabledCategories) && /PUNCTUATION/.test(q.disabledCategories) && !/TYPOS/.test(q.disabledCategories), 'grammar: a quick note checks spelling and clear mistakes only', q);
  ok(f.level === 'picky' && !f.disabledCategories && f.language === 'en-US', 'grammar: formal writing is picky with every rule (an unknown language falls back to US English)', f);
  ok(/STYLE/.test(sc.disabledCategories) && !/PUNCTUATION/.test(sc.disabledCategories), 'grammar: school checks punctuation but not style', sc);
  const body = { matches: [{ offset: 7, length: 3, message: 'Typo', replacements: [{ value: 'the' }, { value: 'the' }, { value: 'tea' }], rule: { issueType: 'misspelling', category: { id: 'TYPOS', name: 'Possible Typo' } } },
    { offset: 0, length: 2, message: 'Style', replacements: [], rule: { issueType: 'style', category: { id: 'STYLE', name: 'Style' } } }, { offset: 3, length: 0, message: 'empty' }] };
  const ms = A.grammarMatches(body, 'We ate teh cake', 'school');
  ok(ms.length === 1 && ms[0].bad === 'teh' && JSON.stringify(ms[0].reps) === '["the","tea"]' && ms[0].kind === 'spelling', 'grammar: matches are filtered by the kind of note, with their words and suggestions (no repeats)', ms);
  ok(A.grammarMatches(body, 'We ate teh cake', 'formal').length === 2, 'grammar: formal keeps the style match too');
  const sh = A.shiftMatches([{ offset: 2 }, { offset: 20 }], 5, 3, 5);
  ok(sh[0].offset === 2 && sh[1].offset === 22, 'grammar: matches after a fix move with the text', sh);
  const cr = A.chatRequest([{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'Sum up' }], { title: 'T', text: 'body words' });
  ok(cr.messages.length === 1 && cr.messages[0].role === 'user' && /body words/.test(cr.system) && /User: Sum up/.test(cr.prompt), 'AI: a chat starts with the user and carries the note', cr);
  ok(!/<note>/.test(A.chatRequest([{ role: 'user', content: 'x' }], null).system), 'AI: without “Read this note”, the note is not sent');
  ok(A.cleanEdit('```\nNew text\n```') === 'New text' && A.cleanEdit('"Short."') === 'Short.' && A.cleanEdit('Plain') === 'Plain', 'AI: wrappers around a rewritten text are taken off');
  ok(A.toHTML('Intro **bold**\n- one\n- two\nEnd') === '<div>Intro <b>bold</b></div><ul><li>one</li><li>two</li></ul><div>End</div>' && A.toHTML('<x>') === '<div>&lt;x&gt;</div>', 'AI: answers become safe note lines, lists and bold', A.toHTML('Intro **bold**\n- one\n- two\nEnd'));
  const M = ctx.NPMap;
  ok(/⌖ Home: 1 Main St \(51\.50000, -0\.12000\) https:\/\/www\.openstreetmap\.org\/\?mlat=51\.5&mlon=-0\.12/.test(M.text({ title: 'Home', label: '1 Main St', lat: 51.5, lon: -0.12 })) && /no place yet/.test(M.text({})), 'map: its words for search and exports', M.text({ title: 'Home', label: '1 Main St', lat: 51.5, lon: -0.12 }));
}

// 4c. the Code box's helpers (notes-widgets.js, v0.5.6): highlighted lines and the before / after diff
try { vm.runInContext(read('web/src/notes-widgets.js'), ctx); } catch (e) { ok(false, 'notes-widgets.js loads without a page', e.message); }
if (ctx.InquireWidgets && ctx.InquireWidgets.codeKit) {
  const K = ctx.InquireWidgets.codeKit, L = (s2, m) => [...K.parseLines(s2, m)].join(',');
  ok(L('3-5, 9') === '3,4,5,9' && L('9 - 7') === '7,8,9' && L('2,x,4') === '2,4' && L('1-50', 3) === '1,2,3' && L('') === '', 'code box: “3-5, 9” style line lists', [L('3-5, 9'), L('9 - 7'), L('2,x,4'), L('1-50', 3)]);
  ok(K.formatLines(new Set([9, 3, 4, 5])) === '3-5, 9' && JSON.stringify(K.lineGroups(new Set([1, 2, 4]))) === '[[1,2],[4,4]]', 'code box: highlighted lines written back as ranges');
  const ops = K.lineDiff('a\nb\nc', 'a\nB\nc\nd').map(o => o.t).join('');
  ok(ops === '=-+=+', 'code box: before / after line diff (a changed line, an added line)', ops);
  const rows = K.diffRows(K.lineDiff('a\nb\nc', 'a\nB\nc\nd'));
  ok(rows.length === 4 && rows[1].a === 1 && rows[1].b === 1 && rows[3].a === null && rows[3].b === 3, 'code box: side-by-side rows pair a changed line with its new version', rows);
  ok(K.lineDiff('same', 'same').every(o => o.t === '='), 'code box: no changes, no marks');
}

// 5. Note Office layout (office.js): one sheet per note, ≤ 75 on the furniture, floor stacks of ≤ 100, one box per folder holding its notes
vm.runInContext(read('web/src/office.js'), ctx);
{
  const O = ctx.NoteOffice, mk = (n, folder, t0 = 0) => Array.from({ length: n }, (_, i) => ({ id: (folder || 'u') + i, title: 'N' + i, folder: folder || null, created: t0 + i }));
  const fl = [{ id: 'fa', name: 'A', parent: null, depth: 0 }, { id: 'fb', name: 'B', parent: 'fa', depth: 1 }];
  const notes = [...mk(260), ...mk(6, 'fa'), ...mk(2, 'fb')], L = O.layout(notes, fl, 1600, 7);
  const ids = new Set(L.sheets.map(s => s.id));
  ok(L.sheets.length === notes.length && ids.size === notes.length, 'office: every note is exactly one sheet', [L.sheets.length, ids.size]);
  const furn = L.sheets.filter(s => !s.box && s.layer !== 'front'), floor = L.sheets.filter(s => !s.box && s.layer === 'front');
  ok(furn.length === 75 && floor.length === 185, 'office: 75 unfiled on the desk and cabinets, the rest on the floor', [furn.length, floor.length]);
  const stacks = {}; floor.forEach(s => { stacks[s.stack] = (stacks[s.stack] || 0) + 1; });
  ok(Object.values(stacks).every(n => n <= 100) && Object.keys(stacks).length === 2 && stacks[0] === 100, 'office: floor stacks hold up to 100 sheets', stacks);
  ok(L.boxes.length === 2 && L.byFolder.get('fa').papers.length === 6 && L.byFolder.get('fb').papers.length === 2, 'office: a box per folder, one upright sheet per note in it', L.boxes.map(b => b.papers.length));
  const L2 = O.layout([...notes, ...mk(1, null, 1e9)], fl, 1600, 7), a = L.byNote.get('u10'), b2 = L2.byNote.get('u10');
  ok(a.x === b2.x && a.y === b2.y && L.byFolder.get('fa').x === L2.byFolder.get('fa').x, 'office: sheets and boxes keep their places when a note is added');
  ok(O.layout(mk(40), [], 1040).sheets.every(s => s.layer !== 'front'), 'office: 40 unfiled notes all sit on the furniture');
}

// 9. (v0.5.8) the languages: every dictionary has every catalog string, with the same placeholders; the list in i18n.js matches the files
{ const dir = path.join(__dirname, '..', 'web/i18n'), cat = JSON.parse(fs.readFileSync(path.join(dir, '_catalog.json'), 'utf8'));
  const ph = x => (String(x).match(/\{[qcs]?\d+\}/g) || []).sort().join(','), files = fs.readdirSync(dir).filter(f => /^[a-z]{2}\.json$/.test(f));
  const codes = [...read('web/lib/i18n.js').matchAll(/\["([a-z]{2})", "[^"]+", "[^"]+"\]/g)].map(m => m[1]).filter(c => c !== 'en');
  ok(codes.length === 10 && codes.every(c => files.includes(c + '.json')) && files.length === 10, 'i18n: 10 languages, each with its dictionary', { codes, files });
  for (const f of files) { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).strings || {};
    const miss = Object.keys(cat).filter(k => typeof d[k] !== 'string' || !d[k]), bad = Object.keys(cat).filter(k => typeof d[k] === 'string' && ph(k) !== ph(d[k]));
    ok(!miss.length && !bad.length, 'i18n: ' + f + ' is complete and keeps every placeholder', { miss: miss.slice(0, 3), bad: bad.slice(0, 3) }); } }

// 10. theme packs (Phase 1, Oct 14, 2026; themes-core.js, docs/theme-packets-spec.md): the rules, signing, zip, install / remove, the handler's paths
{ const T = require('../themes-core.js'), os = require('os'), zlib = require('zlib');
  const png = (w, h) => { const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ih = Buffer.alloc(25); ih.writeUInt32BE(13, 0); ih.write('IHDR', 4); ih.writeUInt32BE(w, 8); ih.writeUInt32BE(h, 12); ih[16] = 8; ih[17] = 6; return Buffer.concat([sig, ih, Buffer.from('0000000049454e44ae426082', 'hex')]); };
  const man = o => Buffer.from(JSON.stringify(Object.assign({ schema: 1, id: 'test-pack', name: 'Test Pack', author: 'NotePath', version: '1.0.0', weight: 'light', family: 'Dark', license: { type: 'free' }, preview: 'preview.png',
    colors: { bg: '#191919', surface: '#232323', accent: '#6AA2F5', tint: '#9D8CF0', text: '#E8E8E6', muted: '#B4B4B0', faint: '#8C8C88' } }, o)));
  const pack = (o, extra) => new Map([['manifest.json', man(o)], ['preview.png', png(640, 360)], ...(extra || [])]);
  const keys = T.keyPair(), keys2 = T.keyPair();
  const signed = (files, k) => { const f = new Map(files); f.set('signature.json', T.sign(f, (k || keys).privateKeyPem)); return f; };
  const errs = (files, o) => T.validate(files, o).errors.join(' | ');
  ok(T.validate(signed(pack())).ok, 'packs: a good light pack passes', errs(signed(pack())));
  ok(/signature\.json is missing/.test(errs(pack())), 'packs: an unsigned pack is refused');
  for (const id of ['paper', 'sepia', 'graphite', 'midnight']) { const v = T.validate(T.readFolder(path.join(R, 'web/themes', id)), { bundled: true }); ok(v.ok && v.manifest.license.type === 'free' && v.manifest.weight === 'light', 'packs: the built-in ' + id + ' pack passes the same rules (free, light)', v.errors); }
  ok(/text on bg is/.test(errs(signed(pack({ colors: { bg: '#191919', surface: '#232323', accent: '#6AA2F5', tint: '#9D8CF0', text: '#555555', muted: '#B4B4B0', faint: '#8C8C88' } })))), 'packs: words that do not reach 4.5:1 are refused, not adjusted');
  ok(/accent on bg/.test(errs(signed(pack({ colors: { bg: '#191919', surface: '#232323', accent: '#303030', tint: '#9D8CF0', text: '#E8E8E6', muted: '#B4B4B0', faint: '#8C8C88' } })))), 'packs: an accent under 3:1 is refused');
  ok(/not allowed/.test(errs(signed(pack({}, [['art/run.js', Buffer.from('alert(1)')]])))) && /not allowed/.test(errs(signed(pack({}, [['art/x.css', Buffer.from('a{}')]])))) && /not allowed/.test(errs(signed(pack({}, [['art/x.html', Buffer.from('<p>')]])))), 'packs: JavaScript, CSS and HTML files are refused');
  ok(/contains a script/.test(errs(signed(pack({}, [['art/a.svg', Buffer.from('<svg width="10" height="10"><script>x()</script></svg>')]])))) && /event handler/.test(errs(signed(pack({}, [['art/a.svg', Buffer.from('<svg width="10" height="10" onload="x()"></svg>')]])))) && /outside/.test(errs(signed(pack({}, [['art/a.svg', Buffer.from('<svg width="10" height="10"><rect fill="url(https://x.test/a)"/></svg>')]])))), 'packs: SVGs with scripts, handlers or outside links are refused');
  ok(T.validate(signed(pack({}, [['art/a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/></svg>')]]))).ok, 'packs: a plain SVG (inner #links only) passes');
  ok(/lowercase/.test(errs(signed(pack({}, [['Art/Sky.png', png(10, 10)]])))) && /deeper/.test(errs(signed(pack({}, [['a/b/c/d.png', png(10, 10)]])))), 'packs: capital letters and folders deeper than 2 levels are refused');
  ok(/at most 64/.test(errs(signed(pack({}, Array.from({ length: 64 }, (_, i) => ['art/p' + i + '.png', png(4, 4)]))))), 'packs: more than 64 files are refused');
  ok(/longest side/.test(errs(signed(pack({}, [['art/big.png', png(5000, 100)]])))), 'packs: an image over 4096 px is refused');
  ok(/named in the manifest but is not in the pack/.test(errs(signed(new Map([['manifest.json', man()]])))), 'packs: a missing preview is caught');
  const scene = (layers, w) => ({ weight: w || 'medium', scenes: { menu: { still: 'preview.png', layers } } });
  ok(T.validate(signed(pack(scene([{ image: 'preview.png', motion: 'twinkle', period: 8, depth: 0.3, min: 'moderate' }])))).ok, 'packs: a medium pack with a slow twinkle passes');
  ok(/moving layers is more than a light pack/.test(errs(signed(pack(scene([{ image: 'preview.png', motion: 'drift', speed: 40 }], 'light'))))), 'packs: a light pack may not move');
  ok(/at least 6 seconds/.test(errs(signed(pack(scene([{ image: 'preview.png', motion: 'pulse', period: 2 }]))))) && /no flashing/.test(errs(signed(pack(scene([{ image: 'preview.png', motion: 'twinkle', period: 8, depth: 0.9 }]))))), 'packs: fast loops and deep twinkles (flashing) are refused');
  ok(/never behind the editor/.test(errs(signed(pack({ weight: 'medium', scenes: { editor: { still: 'preview.png' } } })))), 'packs: no scenes behind the editor');
  // signatures
  const good = signed(pack());
  ok(T.verify(good, keys.publicKey) === '', 'packs: a signature checks out with its key');
  ok(/does not match/.test(T.verify(good, keys2.publicKey)), 'packs: another key does not verify it');
  { const t = new Map(good); t.set('preview.png', png(640, 361)); ok(/changed after/.test(T.verify(t, keys.publicKey)), 'packs: a file changed after signing is caught'); }
  { const t = new Map(good); t.set('art/new.png', png(4, 4)); ok(/different files/.test(T.verify(t, keys.publicKey)), 'packs: a file added after signing is caught'); }
  ok(/no signing key/.test(T.verify(good, null)), 'packs: with no key in theme-key.json nothing installs');
  // zip
  const zipped = T.writeZip(good), back = T.readZip(zipped);
  ok([...good.keys()].sort().join() === [...back.keys()].sort().join() && [...good].every(([k, v]) => v.equals(back.get(k))), 'packs: the zip writer and reader round-trip every file');
  { const evil = T.writeZip(new Map([['../escape.json', Buffer.from('{}')]])); let threw = ''; try { T.readZip(evil); } catch (e) { threw = e.message; } ok(/unsafe path/.test(threw), 'packs: a zip entry that climbs out (..) is refused', threw); }
  { const z = Buffer.from(T.writeZip(new Map([['manifest.json', Buffer.from('{}')]]))), cd = z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); z.writeUInt16LE((3 << 8) | 20, cd + 4); z.writeUInt32LE((0o120777 << 16) >>> 0, cd + 38);
    let threw = ''; try { T.readZip(z); } catch (e) { threw = e.message; } ok(/link/.test(threw), 'packs: a symlink inside the zip is refused', threw); }
  // install, list, remove, the handler
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-themes-'));
  ok(/no signing key/.test(T.install(dir, zipped, { pub: null }).error || ''), 'packs: install refuses everything while NotePath has no key');
  const r1 = T.install(dir, zipped, { pub: keys.publicKey, appVersion: '0.6.0' });
  ok(r1.ok && r1.pack.id === 'test-pack' && fs.existsSync(path.join(dir, 'test-pack/1.0.0/manifest.json')) && T.readIndex(dir).packs['test-pack'].version === '1.0.0', 'packs: install unpacks into themes/<id>/<version>/ and records it in index.json', r1);
  ok(!T.install(dir, T.writeZip(signed(pack({ id: 'paper' }))), { pub: keys.publicKey, bundledIds: T.RESERVED }).ok, 'packs: a pack may not take the name of a built-in theme');
  ok(/needs NotePath 9\.0\.0/.test(T.install(dir, T.writeZip(signed(pack({ minApp: '9.0.0' }))), { pub: keys.publicKey, appVersion: '0.6.0' }).error || ''), 'packs: minApp is honoured');
  const r2 = T.install(dir, T.writeZip(signed(pack({ version: '1.1.0' }))), { pub: keys.publicKey });
  ok(r2.ok && r2.replaced === '1.0.0' && !fs.existsSync(path.join(dir, 'test-pack/1.0.0')) && fs.existsSync(path.join(dir, 'test-pack/1.1.0')), 'packs: an update replaces the old version only once the new one is in');
  ok(T.list(dir).length === 1 && T.list(dir)[0].version === '1.1.0' && !T.list(dir)[0].broken, 'packs: list reports the installed pack');
  ok(T.resolve(dir, 'test-pack', 'preview.png') === path.join(dir, 'test-pack', '1.1.0', 'preview.png'), 'packs: notepath://theme/<id>/preview.png reaches the file');
  ok([['test-pack', '../index.json'], ['test-pack', '..%2Findex.json'], ['test-pack', '/etc/passwd'], ['test-pack', 'manifest.js'], ['../x', 'a.png'], ['nope', 'preview.png'], ['test-pack', 'art/missing.png']].every(([i, f]) => T.resolve(dir, i, f) === null), 'packs: the handler refuses paths that climb out, other types, unknown packs and missing files');
  fs.writeFileSync(path.join(dir, 'test-pack/1.1.0/manifest.json'), '{"broken"');
  ok(T.list(dir)[0].broken, 'packs: a damaged pack is reported broken (the app falls back)');
  ok(T.remove(dir, 'test-pack').ok && !fs.existsSync(path.join(dir, 'test-pack')) && !T.list(dir).length, 'packs: remove deletes the folder and its index entry');
  fs.rmSync(dir, { recursive: true, force: true });
  // the built-in theme ids are reserved, and the public key file ships with the app
  const sj = read('web/src/settings.js'), ids = [...sj.matchAll(/\{ id: "([a-z0-9-]+)", fam:/g)].map(m => m[1]);
  ok(ids.length >= 13 && ids.every(i => T.RESERVED.includes(i)) && ['paper', 'sepia', 'graphite', 'midnight', 'system', 'custom'].every(i => T.RESERVED.includes(i)), 'packs: every built-in theme id is reserved in themes-core.js', ids.filter(i => !T.RESERVED.includes(i)));
  ok(pkg.build.files.includes('themes-core.js') && pkg.build.files.includes('theme-key.json') && /require\('\.\/themes-core'\)/.test(main), 'packs: themes-core.js and theme-key.json are packaged and main.js uses them');
  const tk = JSON.parse(read('theme-key.json')); ok(tk.publicKey === null || (typeof tk.publicKey === 'string' && T.verify(signed(pack()), tk.publicKey) !== undefined), 'packs: theme-key.json holds a public key or null');
}

console.log(`unit: ${pass.length} passed${fails.length ? ', ' + fails.length + ' failed' : ''}`);
if (fails.length) { console.error(fails.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
