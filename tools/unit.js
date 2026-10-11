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

console.log(`unit: ${pass.length} passed${fails.length ? ', ' + fails.length + ' failed' : ''}`);
if (fails.length) { console.error(fails.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
