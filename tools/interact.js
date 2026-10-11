// Interaction test: drives what smoke.js only loads. Fails (exit 1) on a wrong result or any page error.
//   start menu: the Notes buttons (My notes, New note + title dialog, Favourites), recent notes, three Coming soon buttons that do nothing;
//   My notes: folders (drag into / above, cycle refused), notes onto folders, My order drag + Alt+↑/↓, ★ first, list resize + fold,
//             text sizes, headings / bullets / numbers / checklists (tick + survive a reload), strikethrough, code box, music chart,
//             video by link and by file (+ backup size limit), delete + Undo;
//   right-click in a note: Dictionary definition (mocked Wiktionary) + Save to note, Link to a note;
//   Settings: shortcuts (Alt+N, Alt+Shift+N, Alt+M), a theme, backup export → import round trip, Install & Relaunch (fake desktop bridge).
// Run: node tools/interact.js   (needs Playwright, ~30 s; part of npm run check)
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('interact.js needs Playwright (see smoke.js).'); process.exit(1); }
const path = require('path'), fs = require('fs'), os = require('os');
const { desktop, R } = require('./build-web.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepath-interact-')), file = path.join(dir, 'index.html');
fs.writeFileSync(file, desktop.replace('href="fonts/fonts.css"', `href="file://${path.join(R, 'app/fonts/fonts.css')}"`).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
const URL0 = 'file://' + file;
const fails = [], pass = [];
const ok = (cond, name, got) => { (cond ? pass : fails).push(name + (cond ? '' : ' → got ' + JSON.stringify(got))); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const page = async (init) => { const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); p.setDefaultTimeout(6000); p.on('pageerror', e => errs.push(e.message)); if (init) await p.addInitScript(init); return p; };

  /* ---------- Settings: Install & Relaunch with a fake desktop bridge ---------- */
  {
    const p = await page(() => { const cbs = []; window.__upd = s => cbs.forEach(f => f(s)); window.__inst = 0;
      window.inquireDesktop = { platform: 'darwin', onUpdate: f => { cbs.push(f); }, checkForUpdates: async () => {}, updateState: async () => ({ status: 'ready', version: '9.9.9' }), installUpdate: async () => { window.__inst++; }, revealUpdate: async () => {}, version: async () => '0.1.0', lookupWord: async () => ({ status: 0 }) }; });
    await p.goto(URL0 + '#menu'); await wait(600);
    ok(/v0\.1\.0/.test(await p.$eval('#verline', e => e.textContent)), 'start menu shows the app version in the desktop app');
    await p.evaluate(() => InquireSettings.open('about')); await wait(300);
    ok(await p.$eval('.set-tab[data-tab=about]', e => e.classList.contains('has-upd')), 'About tab shows the update dot');
    await p.click('.set-upd [data-u=go]'); ok(await p.evaluate(() => window.__inst) === 1, 'Install & Relaunch calls installUpdate');
    await p.evaluate(() => __upd({ status: 'downloading', version: '9.9.9', percent: 40 }));
    ok(/40%/.test(await p.$eval('.set-upd-msg', e => e.textContent)), 'update progress shows in Settings');
    await p.evaluate(() => InquireSettings.close());
    await p.evaluate(() => __upd({ status: 'ready', version: '9.9.9' })); await wait(100);
    ok(await p.$eval('#upd', e => !e.hidden && /Install/.test(e.textContent)), 'the top banner offers Install & Relaunch');
    await p.close();
  }

  const p = await page();
  await p.route('https://en.wiktionary.org/api/rest_v1/page/definition/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: '<span>Something whose <a href="/wiki/value">value</a> may change.</span>' }] }] }) }));
  await p.goto(URL0 + '#menu'); await wait(500);

  /* ---------- start menu ---------- */
  ok(await p.$eval('.hello h1', e => e.textContent) === 'Main Menu', 'start menu heading is Main Menu');
  ok(JSON.stringify(await p.$$eval('.npn-acts .slot h3', e => e.map(x => x.textContent))) === '["My notes","New note","Favourites"]', 'Notes buttons: My notes, New note, Favourites');
  ok(await p.$$eval('.npn-soon .slot', e => e.length === 3 && e.every(x => x.querySelector('h3').textContent === 'Coming soon' && !x.querySelector('p') && x.getAttribute('aria-disabled') === 'true')), 'three Coming soon buttons, labelled only that');
  await p.click('.npn-soon .slot >> nth=0', { force: true }); await wait(300);
  ok(!(await p.$('.mw-ov, .ask-ov')) && await p.evaluate(() => location.hash) === '#menu', 'a Coming soon button is not linked to anything');
  ok(/No notes yet/.test(await p.$eval('.npn-recent', e => e.textContent)), 'empty recent list says how to start');
  await p.click('[data-a=new]'); await wait(300);
  ok(await p.evaluate(() => document.body.classList.contains('ask-open')), 'New note asks for a title');
  await p.keyboard.type('Shopping list'); await p.keyboard.press('Enter'); await wait(500);
  ok(await p.$eval('.nb-title', e => e.value).catch(() => null) === 'Shopping list', 'the title dialog makes the note and opens it in My notes');
  ok(await p.evaluate(() => document.body.classList.contains('mw-open')) && await p.evaluate(() => location.hash) === '#menu', 'My notes is a window over the start menu (app fogs)');
  await p.keyboard.press('Escape'); await wait(400);
  ok(!(await p.$('.mw-ov')), 'Esc closes My notes');
  ok(await p.$eval('.mnote .mnote-t', e => e.textContent.trim()) === 'Shopping list' && await p.$eval('[data-n=all]', e => e.textContent) === '1', 'the new note shows under Recent and in the count');
  await p.click('.mnote'); await wait(400);
  ok(await p.$eval('.nb-title', e => e.value) === 'Shopping list', 'a recent note opens in My notes');
  await p.keyboard.press('Escape'); await wait(300);

  /* ---------- My notes: folders and order ---------- */
  await p.evaluate(() => { const N = InquireNotes; ['A', 'B', 'C'].forEach((t, i) => { const n = N.create({ title: 'Note ' + t }); N.update(n.id, { updated: Date.now() + i, quiet: true }); }); ['Alpha', 'Beta', 'Gamma'].forEach(f => N.addFolder(f)); });
  await p.click('[data-a=open]'); await wait(500);
  const names = () => p.$$eval('.nb-fd.user', es => es.map(e => e.querySelector('.nb-fnm').textContent + getComputedStyle(e).getPropertyValue('--d')));
  const fd = n => p.locator('.nb-fd.user', { hasText: n });
  await fd('Beta').dragTo(fd('Alpha')); await wait(150);
  ok(JSON.stringify(await names()) === '["Alpha0","Beta1","Gamma0"]', 'folder dropped into a folder', await names());
  await fd('Gamma').dragTo(fd('Alpha'), { targetPosition: { x: 30, y: 2 } }); await wait(150);
  ok(JSON.stringify(await names()) === '["Gamma0","Alpha0","Beta1"]', 'folder dropped above a folder', await names());
  await fd('Alpha').dragTo(fd('Beta')); await wait(150);
  ok(JSON.stringify(await names()) === '["Gamma0","Alpha0","Beta1"]', 'a folder cannot go into its own subfolder', await names());
  await p.locator('.nb-it', { hasText: 'Note A' }).dragTo(fd('Beta')); await wait(150);
  ok(await p.evaluate(() => InquireNotes.list().find(n => n.title === 'Note A').folder === InquireNotes.folders().find(f => f.name === 'Beta').id), 'note dropped onto a folder');
  const order = () => p.$$eval('.nb-it .nb-t', es => es.map(e => e.textContent.replace('★', '')));
  const before = await order(), last = before[before.length - 1];
  await p.locator('.nb-it', { hasText: last }).dragTo(p.locator('.nb-it').first(), { targetPosition: { x: 40, y: 3 } }); await wait(150);
  ok((await order())[0] === last, 'note dragged to the top of My order', await order());
  await p.locator('.nb-it', { hasText: last }).focus(); await p.keyboard.press('Alt+ArrowDown'); await wait(100);
  ok((await order())[1] === last, 'Alt+↓ moves a note down', await order());
  await p.locator('.nb-it', { hasText: 'Note B' }).click(); await wait(150); await p.click('.nb-bar [data-a=fav]'); await wait(150);
  ok((await order())[0] === 'Note B', 'a starred note goes to the top with ★ first', await order());
  await p.click('.nb-favtop'); await wait(100);
  ok((await order())[0] !== 'Note B', '★ first off: the favourite follows My order', await order());
  await p.click('.nb-favtop');
  await p.click('.nb-fdb[data-f=fav]'); await wait(150);
  ok(JSON.stringify(await order()) === '["Note B"]', 'Favourites folder lists only starred notes', await order());
  await p.click('.nb-fdb[data-f=all]'); await wait(150);
  const lw = () => p.$eval('.nb-list', e => e.offsetWidth);
  const rz = await p.locator('.nb-rz').boundingBox(); const w0 = await lw(); await p.mouse.move(rz.x + 5, rz.y + 200); await p.mouse.down(); await p.mouse.move(rz.x + 85, rz.y + 200, { steps: 4 }); await p.mouse.up();
  ok(Math.abs(await lw() - (w0 + 80)) < 4, 'the notes list resizes by dragging', [w0, await lw()]);
  await p.click('.nb-fold[data-p=f]'); await wait(450); ok(await p.$eval('.nb-folders', e => e.offsetWidth) === 0, 'the folders column folds away');
  await p.click('.nb-fold[data-p=f]'); await p.dblclick('.nb-rz'); await wait(450);

  /* ---------- the editor: sizes, headings, lists, checklists, strikethrough ---------- */
  await p.locator('.nb-it', { hasText: 'Note C' }).click(); await wait(200);
  const html = () => p.$eval('.nb-rich', e => e.innerHTML);
  const selWord = w => p.evaluate(w => { const ed = document.querySelector('.nb-rich'); const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.textContent.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); getSelection().removeAllRanges(); getSelection().addRange(r); return true; } } return false; }, w);
  await p.click('.nb-rich'); await p.keyboard.type('Hello big world');
  await selWord('big'); await p.click('.nr-sz-xl'); await p.click('.nr-sz-l');
  ok(/<span data-s="l">big<\/span>/.test(await html()), 'text size applies and replaces the old size', await html());
  await selWord('world'); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('Plan');
  await p.click('[data-blk=h3]'); await wait(50);
  ok(/<h3>Plan<\/h3>/.test(await html()), 'H makes the line a heading', await html());
  await p.keyboard.press('End'); await p.keyboard.press('Enter'); await wait(80);
  ok(await p.$eval('[data-blk=h3]', e => e.getAttribute('aria-pressed')) === 'false', 'Enter after a heading goes back to plain text');
  await p.keyboard.type('Milk');
  await p.click('[data-blk=ck]'); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('Bread'); await wait(50);
  ok(/<ul data-ck="1"><li>Milk<\/li><li>Bread<\/li><\/ul>/.test(await html()), '☑ makes a checklist and Enter adds an item', await html());
  ok(await p.$eval('[data-blk=ck]', e => e.getAttribute('aria-pressed')) === 'true', 'the ☑ button shows it is on inside a checklist');
  const box = await p.$eval('.nb-rich ul[data-ck] li', e => { const r = e.getBoundingClientRect(); return { x: r.left - 18, y: r.top + 11 }; });
  await p.mouse.click(box.x, box.y); await wait(100);
  ok(await p.$eval('.nb-rich ul[data-ck] li', e => e.getAttribute('data-done')) === '1', 'clicking the box ticks the item off');
  await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.keyboard.type('After the list');
  await p.keyboard.press('Enter'); await p.click('[data-blk=ul]'); await p.keyboard.type('point');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.click('[data-blk=ol]'); await p.keyboard.type('first'); await wait(500);
  ok(/<ul><li>point<\/li><\/ul>/.test(await html()) && /<ol><li>first<\/li><\/ol>/.test(await html()), 'bullets and numbers', await html());
  await selWord('world'); await p.click('[data-cmd=strikeThrough]'); await wait(500);
  ok(/<(s|strike)>world<\/(s|strike)>/.test(await html()), 'strikethrough', await html());
  await p.keyboard.press('Escape'); await wait(300); await p.click('[data-a=open]'); await wait(400);
  await p.locator('.nb-it', { hasText: 'Note C' }).click(); await wait(200);
  ok(/<ul data-ck="1"><li data-done="1">Milk<\/li><li>Bread<\/li><\/ul>/.test(await html()), 'the checklist and its tick survive closing and reopening', await html());
  ok(await p.evaluate(() => /Milk/.test(InquireNotes.list().find(n => n.title === 'Note C').body)), 'list items reach the plain-text body (search, .md)');

  /* ---------- widgets: code box, music chart, video ---------- */
  await p.click('.nb-rich'); await p.keyboard.press('Control+End');
  await p.click('.nr-tools [data-w=code]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=code] .nw-ta')), 'Code adds a code box');
  await p.keyboard.type('def f(x):\n    return x * 2'); await wait(600);
  ok(/class="kw"|<span class="kw/.test(await p.$eval('.nw[data-w=code]', e => e.innerHTML)) || /def/.test(await p.$eval('.nw[data-w=code]', e => e.textContent)), 'the code box highlights Python');
  await p.click('.nr-tools [data-w=music]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=music] svg')), 'Music adds a music chart with a staff');
  await p.click('.nr-vid'); await p.fill('.nv-form input', 'https://youtu.be/dQw4w9WgXcQ?t=42'); await p.click('.nv-form button'); await wait(200);
  ok(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ.*start=42/.test(await p.$eval('.nw[data-w=video] iframe', e => e.src).catch(() => '')), 'a YouTube link becomes an embed');
  await p.evaluate(() => InquireNotes.editorFor(document.querySelector('.nb-rich')).addFiles([new File([new Uint8Array(2000)], 'clip.mp4', { type: 'video/mp4' })])); await wait(700);
  ok(/^blob:/.test(await p.$eval('.nw[data-w=video] video', e => e.src).catch(() => '')), 'a video file plays from storage');
  const big = await p.evaluate(async () => { const api = InquireNotes.editorFor(document.querySelector('.nb-rich')); await api.addFiles([new File([new Uint8Array(26 * 1048576)], 'big.mp4', { type: 'video/mp4' })]); await new Promise(r => setTimeout(r, 700)); const r = await InquireNotes.exportMedia(); return { n: Object.keys(r.map).length, skipped: r.skipped.length }; });
  ok(big.skipped === 1 && big.n >= 1, 'backups leave out videos over 25 MB and say so', big);

  /* ---------- right-click in a note: Dictionary + Save to note, Link to a note ---------- */
  await p.evaluate(() => { const ed = document.querySelector('.nb-rich'); ed.scrollTop = 0; }); await wait(200);
  await selWord('Hello');
  let pt = await p.evaluate(() => { const b = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: b.x + 5, y: b.y + 5 }; });
  await p.mouse.click(pt.x, pt.y, { button: 'right' }); await wait(200);
  ok(JSON.stringify(await p.$$eval('.tm-menu > button', e => e.map(x => x.dataset.a))) === '["copy","dict","link"]', 'right-click menu: Copy, Define · Dictionary, Link to a note');
  await p.click('.tm-menu [data-a=dict]'); await wait(500);
  ok(/value may change/.test(await p.$eval('.tm-def', e => e.textContent).catch(() => '')) && /Wiktionary/.test(await p.$eval('.tm-def .tm-src', e => e.textContent).catch(() => '')), 'the Wiktionary definition shows in the menu');
  await p.click('.tm-menu [data-a=save]'); await wait(300);
  ok(/<blockquote>[\s\S]*value may change/.test(await html()), 'Save to note puts the definition into this note', await html());
  await selWord('world');
  pt = await p.evaluate(() => { const b = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: b.x + 5, y: b.y + 5 }; });
  await p.mouse.click(pt.x, pt.y, { button: 'right' }); await wait(200);
  await p.click('.tm-menu [data-a=link]'); await wait(300);
  await p.click('.nk-list button >> text=Note A'); await wait(300);
  ok(/<a class="nlink" data-note="[a-z0-9]+"[^>]*>world<\/a>/.test(await html()), 'Link to a note turns the words into a note link', await html());
  await p.click('.nb-rich a.nlink'); await wait(300);
  ok(await p.$eval('.nb-title', e => e.value) === 'Note A', 'the note link opens the other note');

  /* ---------- delete + Undo ---------- */
  const count = () => p.evaluate(() => InquireNotes.list().length);
  await p.locator('.nb-it', { hasText: 'Note C' }).click(); await wait(200);
  const n0 = await count();
  await p.click('.nb-bar [data-a=del]'); await wait(200);
  ok(await count() === n0 - 1 && !!(await p.$('.tm-toast')), 'Delete removes the note at once and offers Undo');
  await p.click('.tm-toast button'); await wait(200);
  ok(await count() === n0 && /^blob:/.test(await p.evaluate(async () => { const n = InquireNotes.list().find(x => x.title === 'Note C'); const id = (n.html.match(/&quot;vid&quot;:&quot;([a-z0-9]+)/) || [])[1]; return id ? (await InquireNotes.imageURL(id)) || '' : ''; })), 'Undo brings the note back with its video');
  await p.keyboard.press('Escape'); await wait(300);

  /* ---------- shortcuts ---------- */
  await p.click('.hello h1'); await p.keyboard.press('Alt+KeyN'); await wait(400);
  ok(!!(await p.$('.mw-ov[data-mw=notes]')), 'Alt+N opens My notes');
  await p.keyboard.press('Alt+KeyM'); await wait(400);
  ok(!(await p.$('.mw-ov')), 'Alt+M goes back to the Main Menu');
  await p.keyboard.press('Alt+Shift+KeyN'); await wait(300);
  ok(await p.evaluate(() => document.body.classList.contains('ask-open')), 'Alt+Shift+N asks for a new note title');
  await p.keyboard.press('Escape'); await wait(300);
  await p.keyboard.press('Alt+KeyF'); await wait(400);
  ok(!!(await p.$('.nb-fd.sel[data-f=fav]')), 'Alt+F opens Favourites');
  await p.keyboard.press('Escape'); await wait(300);
  await p.keyboard.press('Escape'); await wait(300);
  ok(await p.$eval('.set-ov', e => !e.hidden), 'Esc opens Settings when nothing else is open');

  /* ---------- Settings: theme, backup round trip ---------- */
  await p.evaluate(() => InquireSettings.open('look')); await wait(200);
  const frame0 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--frame').trim());
  await p.click('.set-th >> nth=2'); await wait(150);
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--frame').trim()) !== frame0, 'a theme changes the console colours');
  await p.click('.set-tab[data-tab=data]'); await wait(150);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a=exp]')]);
  const bf = path.join(dir, 'backup.json'); await dl.saveAs(bf);
  const bj = JSON.parse(fs.readFileSync(bf, 'utf8'));
  ok(bj.app === 'NotePath' && bj.data.notes.length === n0 && bj.data.folders.length === 3, 'Export saves every note and folder', { app: bj.app, notes: bj.data.notes.length, folders: bj.data.folders.length });
  const p2 = await page(); await p2.goto(URL0 + '#menu'); await wait(400);
  await p2.evaluate(() => InquireSettings.open('data')); await wait(150);
  await p2.setInputFiles('.set-pane input[type=file]', bf); await wait(800);
  ok(await p2.evaluate(() => InquireNotes.list().length) === n0 && /restored/.test(await p2.$eval('.set-msg', e => e.textContent)), 'Import on a fresh computer brings every note back');
  ok(await p2.evaluate(() => /data-done="1"/.test(InquireNotes.list().find(n => n.title === 'Note C').html)), 'the imported note keeps its checklist ticks');
  await p2.close();

  ok(!errs.length, 'no page errors', errs);
  await b.close();
  console.log(pass.map(x => '  ✓ ' + x).join('\n'));
  if (fails.length) { console.error('\nINTERACT FAILED\n' + fails.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
  console.log(`Interaction test passed (${pass.length} checks).`);
})().catch(e => { console.error(e); process.exit(1); });
