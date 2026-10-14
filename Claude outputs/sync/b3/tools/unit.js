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

console.log(`unit: ${pass.length} passed${fails.length ? ', ' + fails.length + ' failed' : ''}`);
if (fails.length) { console.error(fails.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
