// Interaction test: drives what smoke.js only loads. Fails (exit 1) on a wrong result or any page error.
//   start menu: My notes, My Tasks, a Coming soon button that does nothing, Note Office (all one size), recent notes;
//   My notes (a page): ＋ New Note + title dialog, folders (drag into / above, cycle refused, fold, notes listed under them), notes onto folders,
//             My order drag + Alt+↑/↓, ★ first, folders + list resize, list fold, drag a note in (link) or onto ⧉ (side by side, minimise, maximise),
//             text sizes, headings / bullets / numbers / checklists (tick + survive a reload), strikethrough, code box, music chart,
//             video by link and by file (+ backup size limit), delete + Undo;
//   right-click in a note: Dictionary definition (mocked Wiktionary) + Save to note, Link to a note, Translate (mocked MyMemory);
//   new note kinds (code, lead sheet), lead sheet chords/notes/bars, folder ★, undo/redo (typing, folders), ▶ Video on the note bar;
//   Settings: shortcuts (Alt+N, Alt+Shift+N, Alt+M), a theme, backup export → import round trip, Install & Relaunch (fake desktop bridge).
// Run: node tools/interact.js   (needs Playwright, ~30 s; part of npm run check)
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('interact.js needs Playwright (see smoke.js).'); process.exit(1); }
const path = require('path'), fs = require('fs'), os = require('os');
const { desktop, R, copyMonaco } = require('./build-web.js');
let URL0 = '', srv = null;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepath-interact-'));
const fails = [], pass = [];
const ok = (cond, name, got) => { (cond ? pass : fails).push(name + (cond ? '' : ' → got ' + JSON.stringify(got))); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  copyMonaco(); srv = await require('./serve.js')(R, desktop); URL0 = srv.url;
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
  await p.route('https://api.mymemory.translated.net/**', r => { const u = new URL(r.request().url()), lp = u.searchParams.get('langpair'), q = u.searchParams.get('q');
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ responseData: { translatedText: q === 'Hello' && lp === 'en|es' ? 'Hola' : '[' + lp + '] ' + q }, responseStatus: 200 }) }); });
  await p.goto(URL0 + '#menu'); await wait(500);

  /* ---------- start menu ---------- */
  ok(await p.$eval('.hello h1', e => e.textContent) === 'Main Menu', 'start menu heading is Main Menu');
  ok(JSON.stringify(await p.$$eval('.npn-acts .slot h3', e => e.map(x => x.textContent))) === '["My notes","My Tasks","Coming soon","Note Office"]', 'the Notes console: My notes, My Tasks, Coming soon, Note Office on the far right');
  ok(await p.$$eval('.npn-acts .slot', e => e.every(x => Math.abs(x.getBoundingClientRect().top - e[0].getBoundingClientRect().top) < 2)), 'the four buttons sit in one row');
  ok(await p.$$eval('.npn-acts .slot', e => e.every(x => Math.abs(x.getBoundingClientRect().width - e[0].getBoundingClientRect().width) < 1.5 && Math.abs(x.getBoundingClientRect().height - e[0].getBoundingClientRect().height) < 1.5)), 'the four buttons are the same size');
  ok(await p.$$eval('.slot.npn-soon', e => e.length === 1 && e.every(x => x.querySelector('h3').textContent === 'Coming soon' && !x.querySelector('p') && x.getAttribute('aria-disabled') === 'true')), 'one Coming soon button, labelled only that');
  await p.click('.slot.npn-soon >> nth=0', { force: true }); await wait(300);
  ok(!(await p.$('.mw-ov, .ask-ov')) && await p.evaluate(() => location.hash) === '#menu', 'a Coming soon button is not linked to anything');
  ok(/No notes yet/.test(await p.$eval('.npn-recent', e => e.textContent)), 'empty recent list says how to start');
  await p.click('[data-a=open]'); await wait(400);
  ok(!!(await p.$('#view .npage .nb')) && !(await p.$('.mw-ov')) && !(await p.evaluate(() => document.body.classList.contains('mw-open'))) && await p.evaluate(() => location.hash) === '#notes', 'My notes is a page of its own (no window, no fog)');
  ok(await p.$eval('.np-win .mw-hx .np-newb', e => e.textContent.trim()) === '＋ New Note' && !(await p.$('.nb-tools [data-a=new]')), '＋ New Note sits at the top right of My notes (not beside search)');
  await p.click('.np-newb'); await wait(300);
  ok(await p.evaluate(() => document.body.classList.contains('ask-open')), '＋ New Note asks for a title');
  ok(JSON.stringify(await p.$$eval('.ask-kind b', e => e.map(x => x.textContent))) === '["Standard note","Code note","Music chart"]' && await p.$eval('.ask-kind[aria-checked=true]', e => e.dataset.k) === 'text', 'it offers three kinds: Standard note (picked), Code note, Music chart');
  await p.click('.ask-in');
  await p.keyboard.type('Shopping list'); await p.keyboard.press('Enter'); await wait(500);
  ok(await p.$eval('.nb-title', e => e.value).catch(() => null) === 'Shopping list', 'the title dialog makes the note and opens it');
  ok(!(await p.$('.nb-fsel')) && !(await p.$('.nb-saved')), 'no Folder picker or Saved text on the note bar');
  ok(JSON.stringify(await p.$$eval('.nb-bar .btn-s', e => e.map(x => x.textContent.trim()))) === '["＋ Photo","Photo link","▶ Video","Export…","Delete"]' && !(await p.$('.nr-tools .nr-vid')), '▶ Video sits on the note bar between Photo link and Export…');
  await p.click('.crumbs .crumb'); await wait(400);
  ok(!!(await p.$('.hello h1')), 'the Main Menu breadcrumb goes back to the menu');
  ok(await p.$eval('.mnote .mnote-t', e => e.textContent.trim()) === 'Shopping list' && await p.$eval('[data-n=all]', e => e.textContent) === '1', 'the new note shows under Recent and in the count');
  await p.click('.mnote'); await wait(400);
  ok(await p.$eval('.nb-title', e => e.value) === 'Shopping list', 'a recent note opens in My notes');
  await p.click('#brand'); await wait(300);

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
  await wait(800);
  await p.click('.nb-fd.user:has-text("Alpha") [data-ffav]'); await wait(100);
  ok(JSON.stringify(await names()) === '["Alpha0","Beta1","Gamma0"]' && await p.$eval('.nb-fd.user:has-text("Alpha") [data-ffav]', e => e.textContent === '★' && e.classList.contains('on')), '☆ stars a folder and it moves to the top', await names());
  await p.click('#np-t'); await p.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyZ' : 'Control+KeyZ'); await wait(150);
  ok(JSON.stringify(await names()) === '["Gamma0","Alpha0","Beta1"]', '⌘Z / Ctrl+Z undoes the star', await names());
  await p.click('.np-hb[data-a=redo]'); await wait(150);
  ok(JSON.stringify(await names()) === '["Alpha0","Beta1","Gamma0"]', '↷ Redo stars it again', await names());
  await p.click('.nb-fd.user:has-text("Alpha") [data-ffav]'); await wait(800);
  await p.evaluate(() => InquireNotes.addFolder('Scratch')); await wait(100); await p.click('.np-hb[data-a=undo]'); await wait(150);
  ok(!(await p.$('.nb-fd.user:has-text("Scratch")')) && JSON.stringify(await names()) === '["Gamma0","Alpha0","Beta1"]', '↶ Undo takes back a new folder', await names());
  await wait(800);
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
  // folders list their notes and fold them away
  ok(await p.$$eval('.nb-fnote', es => es.map(e => e.textContent.trim()).join()) === '▫Note A', 'a folder lists its notes under it', await p.$$eval('.nb-fnote', es => es.map(e => e.textContent)));
  await p.click('.nb-fd.user:has-text("Alpha") .nb-fcar'); await wait(100);
  ok(!(await p.$('.nb-fnote')) && !(await p.$('.nb-fd.user:has-text("Beta")')), '▾ folds a folder: its folders and notes hide');
  await p.click('.nb-fd.user:has-text("Alpha") .nb-fcar'); await wait(100);
  ok(await p.$$eval('.nb-fd.user .nb-fcar', b => b.every(x => x.tagName === 'BUTTON')) && !!(await p.$('.nb-fnote')), 'every folder has its own fold button and unfolds again');
  await p.click('.nb-fnote'); await wait(200);
  ok(await p.$eval('.nb-title', e => e.value) === 'Note A', 'clicking a note in a folder opens it');
  const fw = () => p.$eval('.nb-folders', e => e.offsetWidth), rzf = await p.locator('.nb-rzf').boundingBox(), fw0 = await fw();
  await p.mouse.move(rzf.x + 5, rzf.y + 60); await p.mouse.down(); await p.mouse.move(rzf.x + 65, rzf.y + 60, { steps: 4 }); await p.mouse.up();
  ok(Math.abs(await fw() - (fw0 + 60)) < 4, 'the folders column resizes by dragging its edge', [fw0, await fw()]);
  await p.dblclick('.nb-rzf'); await wait(400);
  ok(Math.abs(await fw() - fw0) < 4, 'double-click resets the folders column');
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
  const dd = async (kind, v) => { await p.click(`.nr-dd[data-dd=${kind}]`); await wait(80); await p.click(`.np-pop-${kind} [data-v="${v}"]`); await wait(80); };
  await selWord('big'); await dd('size', 24); await dd('size', 18);
  ok(/<span data-s="18">big<\/span>/.test(await html()), 'the size menu applies a number and replaces the old size', await html());
  ok(await p.$eval('.nr-size .nr-ddv', e => e.textContent) === '18', 'the size menu shows the size at the caret');
  ok(Math.abs(await p.$eval('.nb-rich span[data-s="18"]', e => parseFloat(getComputedStyle(e).fontSize)) - 18) < .6, 'size 18 is 18 px at the normal text size');
  await selWord('Hello'); await dd('font', 'mono');
  ok(/<span data-f="mono">Hello<\/span>/.test(await html()) && /Plex Mono/.test(await p.$eval('.nb-rich span[data-f]', e => getComputedStyle(e).fontFamily)), 'the font menu applies a font', await html());
  ok(await p.$eval('.nr-font .nr-ddv', e => e.textContent) === 'IBM Plex Mono', 'the font menu shows the font at the caret');
  await selWord('Hello'); await dd('font', '');
  ok(!/data-f=/.test(await html()), 'Default font takes the font off again', await html());
  await selWord('big'); await p.click('.nr-dd[data-dd=color]'); await wait(80);
  ok(!!(await p.$('.np-pop-color canvas.np-spec')), 'the colour button opens one spectrum picker');
  await p.keyboard.press('Escape'); await wait(80);
  ok(!(await p.$('.np-pop')) && !!(await p.$('.npage .nb')) && await p.$eval('.set-ov', e => e.hidden), 'Esc closes the colour picker and nothing else');
  await p.click('.nr-dd[data-dd=color]'); await wait(80);
  await p.fill('.np-hex', '#33AA77'); await p.click('.np-capply'); await wait(80);
  ok(/<span data-c="#33aa77" style="color: ?#33aa77;?"><span data-s="18">big<\/span><\/span>|<span data-s="18" data-c="#33aa77"|data-c="#33aa77"[^>]*>big|data-c="#33aa77"[^>]*><span data-s="18">big/.test(await html()), 'a typed colour code colours the words', await html());
  await selWord('world'); await p.click('.nr-dd[data-dd=color]'); await wait(80);
  const sb = await p.locator('.np-spec').boundingBox(); await p.mouse.click(sb.x + 30, sb.y + sb.height / 2); await wait(80);
  const wc = await p.evaluate(() => { const ed = document.querySelector('.nb-rich'); const sp = [...ed.querySelectorAll('span[data-c]')].find(x => x.textContent === 'world'); return sp ? [sp.dataset.c, getComputedStyle(sp).color] : null; });
  ok(wc && /^#[0-9a-f]{6}$/.test(wc[0]) && wc[1] === 'rgb(' + [1, 3, 5].map(i => parseInt(wc[0].slice(i, i + 2), 16)).join(', ') + ')', 'clicking the spectrum colours the words', wc);
  await p.click('.nr-dd[data-dd=color]'); await wait(60);
  ok(await p.$$eval('.np-recent button', b => b.length) >= 2, 'used colours show under Recent');
  await selWord('world'); await p.click('.np-cnorm'); await wait(80);
  ok(!(await p.evaluate(() => [...document.querySelectorAll('.nb-rich span[data-c]')].some(x => x.textContent === 'world'))), 'Normal colour takes the colour off', await html());
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
  await wait(800); await p.click('.p1 .nb-rich'); await p.keyboard.press('Control+End'); await p.keyboard.type(' typo'); await wait(1000);
  ok(/typo/.test(await html()), 'typed text is in the note');
  await p.click('.np-hb[data-a=undo]'); await wait(200);
  ok(!/typo/.test(await html()) && /Milk/.test(await html()), '↶ Undo takes back the last thing typed', await html());
  await p.click('.np-hb[data-a=redo]'); await wait(200);
  ok(/typo/.test(await html()), '↷ Redo puts it back');
  await p.click('.np-hb[data-a=undo]'); await wait(800);
  await p.click('#brand'); await wait(300); await p.click('[data-a=open]'); await wait(400);
  await p.locator('.nb-it', { hasText: 'Note C' }).click(); await wait(200);
  ok(/<ul data-ck="1"><li data-done="1">Milk<\/li><li>Bread<\/li><\/ul>/.test(await html()), 'the checklist and its tick survive closing and reopening', await html());
  ok(await p.evaluate(() => /Milk/.test(InquireNotes.list().find(n => n.title === 'Note C').body)), 'list items reach the plain-text body (search, .md)');
  // Uncheck all: tick Bread too, select across both items, the button unticks them
  const box2 = await p.$eval('.nb-rich ul[data-ck] li:nth-child(2)', e => { const r = e.getBoundingClientRect(); return { x: r.left - 18, y: r.top + 11 }; });
  await p.mouse.click(box2.x, box2.y); await wait(80);
  ok(!(await p.$('.np-ck')), 'no Uncheck all button without a selection');
  await p.evaluate(() => { const ul = document.querySelector('.nb-rich ul[data-ck]'), r = document.createRange(); const tx = li => document.createTreeWalker(li, NodeFilter.SHOW_TEXT).nextNode(); r.setStart(tx(ul.firstElementChild), 1); r.setEnd(tx(ul.lastElementChild), 3); getSelection().removeAllRanges(); getSelection().addRange(r); }); await wait(200);
  ok(/Uncheck all/.test(await p.$eval('.np-ck', e => e.textContent).catch(() => '')) && /2/.test(await p.$eval('.np-ck .num', e => e.textContent).catch(() => '')), 'selecting ticked items shows Uncheck all (2)');
  await p.click('.np-ck'); await wait(150);
  ok(await p.$$eval('.nb-rich ul[data-ck] li[data-done]', l => l.length) === 0 && !(await p.$('.np-ck')), 'Uncheck all unticks every selected item', await html());
  await p.mouse.click(box.x, box.y); await wait(500); // tick Milk again for the backup check

  /* ---------- widgets: code box, music chart, video, graph ---------- */
  await p.click('.nb-rich'); await p.keyboard.press('Control+End');
  await p.click('.nr-tools [data-w=code]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=code] .nw-ta')), 'Code adds a code box');
  await p.keyboard.type('def f(x):\n    return x * 2'); await wait(600);
  ok(/class="kw"|<span class="kw/.test(await p.$eval('.nw[data-w=code]', e => e.innerHTML)) || /def/.test(await p.$eval('.nw[data-w=code]', e => e.textContent)), 'the code box highlights Python');
  await p.click('.nr-tools [data-w=music]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=music] svg')), 'Music adds a music chart with a staff');
  await p.click('.nr-tools [data-w=graph]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=graph] svg.ng-svg')), 'Graph adds a graph grid');
  const gb = await p.locator('.nw[data-w=graph] .ng-svg').boundingBox(), gpt = (x, y) => [gb.x + (x + 10) / 20 * gb.width, gb.y + (10 - y) / 20 * gb.height];
  for (const [x, y] of [[0, 1], [1, 3], [2, 7]]) { const [cx, cy] = gpt(x, y); await p.mouse.click(cx, cy); await wait(60); }
  ok(await p.$eval('.nw[data-w=graph] .ng-eqv', e => e.textContent) === 'y = x² + x + 1', 'three clicked points give the curve y = x² + x + 1', await p.$eval('.nw[data-w=graph] .ng-side', e => e.textContent));
  ok(!!(await p.$('.nw[data-w=graph] path.ng-curve')), 'the curve is drawn on the grid');
  { const [cx, cy] = gpt(2, 7); await p.mouse.click(cx, cy); await wait(60); }
  ok(await p.$eval('.nw[data-w=graph] .ng-eqv', e => e.textContent) === 'y = 2x + 1' && await p.$$eval('.nw[data-w=graph] .ng-pts li', l => l.length) === 2, 'clicking a point removes it (two points: a line)');
  await p.fill('.nw[data-w=graph] .ng-in', '30, 40'); await p.press('.nw[data-w=graph] .ng-in', 'Enter'); await wait(80);
  ok(await p.evaluate(() => { const v = document.querySelector('.nw[data-w=graph] .ng-pt[data-i="2"] circle:not(.ng-hit)'); const c = +v.getAttribute('cx'), y = +v.getAttribute('cy'); return c > 0 && c < 480 && y > 0 && y < 360; }), 'a typed point far away resizes the grid to show it');
  await p.selectOption('.nw[data-w=graph] .ng-fit', 'best'); await wait(80);
  ok(/Best-fit line/.test(await p.$eval('.nw[data-w=graph] .ng-eqs', e => e.textContent)) && /r²/.test(await p.$eval('.nw[data-w=graph] .ng-facts', e => e.textContent)), 'the equation menu switches to a best-fit line with r²');
  await wait(500);
  ok(await p.evaluate(() => { const n = InquireNotes.list().find(x => x.title === 'Note C'); return /data-w="graph"/.test(n.html) && /30,40/.test(n.html.replace(/&quot;/g, '"')) && /∿/.test(n.body); }), 'the graph is saved with its points and reaches the plain text');
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
  ok(JSON.stringify(await p.$$eval('.tm-menu > button', e => e.map(x => x.dataset.a))) === '["copy","dict","link","tr"]', 'right-click menu: Copy, Define · Dictionary, Link to a note, Translate');
  await p.click('.tm-menu [data-a=tr]'); await wait(150);
  const mb = await p.$eval('.tm-menu > button[data-a=tr]', e => e.getBoundingClientRect().bottom), tb = await p.$eval('.tm-tr', e => e.getBoundingClientRect().top);
  ok(JSON.stringify(await p.$$eval('.tm-tr .tm-lang b', e => e.map(x => x.textContent))) === '["Spanish","German","French"]' && tb >= mb, 'Translate opens a box right under the menu: Spanish, German, French');
  await p.click('.tm-lang[data-lang=es]'); await wait(300);
  ok(await p.$eval('.tm-trtext', e => e.textContent).catch(() => '') === 'Hola', 'the Spanish translation shows in the box', await p.$eval('.tm-tr', e => e.textContent).catch(() => ''));
  await p.click('.tm-tr [data-a=tr-ins]'); await wait(300);
  ok(/<div><i>Hola<\/i><\/div>/.test(await html()), '＋ Insert below puts the translation under the line', await html());
  await selWord('Hello');
  pt = await p.evaluate(() => { const b = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: b.x + 5, y: b.y + 5 }; });
  await p.mouse.click(pt.x, pt.y, { button: 'right' }); await wait(200);
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

  /* ---------- drag a note into the open note (a link) or onto ⧉ (side by side, minimise to a tab, maximise) ---------- */
  const dnd = async (fromSel, toSel, pos) => p.evaluate(([f, t, pos]) => {
    const src = document.querySelector(f), dst = document.querySelector(t), dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = dst.getBoundingClientRect(), x = r.left + (pos ? pos.x : r.width / 2), y = r.top + (pos ? pos.y : r.height / 2);
    const vis = getComputedStyle(document.querySelector('.p1 .nb-split')).display;
    const tgt = document.elementFromPoint(x, y) || dst;
    tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return vis;
  }, [fromSel, toSel, pos]);
  await p.locator('.nb-it', { hasText: 'Note B' }).click(); await wait(200);
  const nA = await p.evaluate(() => InquireNotes.list().find(n => n.title === 'Note A').id), nC = await p.evaluate(() => InquireNotes.list().find(n => n.title === 'Note C').id);
  const vis = await dnd(`.nb-it[data-id="${nA}"]`, '.p1 .nb-rich', { x: 40, y: 12 }); await wait(500);
  ok(vis === 'flex', 'while a note is dragged, ⧉ lights up beside the open note\'s title', vis);
  ok(new RegExp(`<a class="nlink" data-note="${nA}"[^>]*>Note A</a>`).test(await html()), 'a note dropped into the open note becomes a link to it', await html());
  await p.click(`.p1 .nb-rich a.nlink[data-note="${nA}"]`); await wait(300);
  ok(await p.$eval('.p1 .nb-title', e => e.value) === 'Note A', 'the dropped link opens that note');
  await p.locator('.nb-it', { hasText: 'Note B' }).click(); await wait(200);
  await dnd(`.nb-it[data-id="${nC}"]`, '.p1 .nb-split'); await wait(300);
  ok(await p.$eval('.p2', e => !e.hidden) && await p.$eval('.p2 .nb-title', e => e.value) === 'Note C' && await p.$eval('.p1 .nb-title', e => e.value) === 'Note B', 'a note dropped on ⧉ opens side by side with the open note');
  ok(await p.$$eval('.nb-ed .nb-rich', e => e.length) === 2, 'both notes can be edited at once');
  await p.click('.p2 [data-a=min]'); await wait(150);
  ok(await p.$eval('.p2', e => e.hidden) && /Note C/.test(await p.$eval('.nb-tabs', e => e.hidden ? '' : e.textContent)), '▁ minimises the side note into a tab');
  await p.click('.nb-tabs .nb-tab-b[data-a=max]'); await wait(150);
  ok(await p.$eval('.p2', e => !e.hidden) && await p.$eval('.nb-tabs', e => e.hidden), '⤢ brings it back side by side');
  await p.click('.p2 [data-a=close]'); await wait(150);
  ok(await p.$eval('.p2', e => e.hidden) && await p.$eval('.nb-tabs', e => e.hidden), '✕ closes the side note');
  await p.locator('.nb-it', { hasText: 'Note A' }).click(); await wait(200);

  /* ---------- Note Office: a sheet per note, a box per folder; click a sheet → that note ---------- */
  await p.click('#brand'); await wait(300); await p.click('[data-a=office]'); await wait(900);
  ok(!!(await p.$('.mw-ov[data-mw=office] .no-stage canvas')) && await p.evaluate(() => document.body.classList.contains('mw-open')), 'Note Office opens in a fogged window');
  const ost = await p.evaluate(() => ({ s: NoteOffice.current.state(), n: InquireNotes.list().length, f: InquireNotes.folders().length }));
  ok(ost.s.sheets === ost.n && ost.s.boxes === ost.f, 'the office has one sheet per note and one box per folder', ost);
  ok(/notes · \d+ folders · \d+ unfiled/.test(await p.$eval('.no-counts', e => e.textContent)), 'the window header counts notes, folders and unfiled');
  await wait(1200);
  const tgt = await p.evaluate(() => { const O = NoteOffice.current, st = O.state(), L = O.layout(), cand = L.sheets.filter(s => !s.box && s.layer === 'back'), sh = cand[cand.length - 1] || L.sheets[L.sheets.length - 1], r = document.querySelector('.no-stage canvas').getBoundingClientRect();
    return { x: r.left + (sh.x + st.OX) * st.SC, y: r.top + (sh.y - 2 + st.OY) * st.SC, title: InquireNotes.get(sh.id).title }; });
  await p.mouse.move(tgt.x, tgt.y); await wait(100);
  ok(await p.$eval('.no-stage canvas', e => e.title) === tgt.title, 'hovering a sheet shows its note\'s title', [await p.$eval('.no-stage canvas', e => e.title), tgt.title]);
  await p.mouse.click(tgt.x, tgt.y); await wait(500);
  ok(!(await p.$('.mw-ov[data-mw=office]:not(.out)')) && await p.$eval('.p1 .nb-title', e => e.value).catch(() => '') === tgt.title, 'clicking a sheet opens that note in My notes', tgt.title);
  await p.click('#brand'); await wait(300); await p.click('[data-a=office]'); await wait(700);
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('inquire:theme'))); await wait(100);
  // Stickman v2.3: one connected 42 + 45 arm chain (also mid-stride), 5 px of neck, greeting defers during a walk and resumes singing after the wave
  const bones = () => p.evaluate(() => { const q = NoteOffice.current.pose(), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), out = [];
    for (const s of ['l', 'r']) { const sh = [q.chest[0] + (s === 'l' ? -7 : 7), q.chest[1] + 1 - (s === 'l' ? -1 : 1) * (q.twist || 0)]; out.push(d(sh, q[s + 'e']), d(q[s + 'e'], q[s + 'h'])); }
    return { arms: out, neck: d(q.head, q.chest) - 19.5 * 1.065 - 11.5 * 1.17 / 2 }; });
  await p.evaluate(() => NoteOffice.current.poke('walk')); await wait(2600);
  let bn = await bones();
  ok(bn.arms.every((v, i) => Math.abs(v - (i % 2 ? 45 : 42)) < .01) && Math.abs(bn.neck - 5) < .01, 'Note Office: walking arms keep 42 + 45 px bones and a 5 px neck', bn);
  await p.evaluate(() => NoteOffice.current.greet()); await wait(100);
  ok(await p.evaluate(() => NoteOffice.current.state().act) === 'walk', 'Note Office: a greeting waits until his stroll is over');
  await p.evaluate(() => NoteOffice.current.poke('sing')); await wait(700);
  await p.evaluate(() => NoteOffice.current.greet()); await wait(100);
  ok(await p.evaluate(() => NoteOffice.current.state().act) === 'surprise', 'Note Office: clicking him mid-song starts the greeting');
  await wait(1700); bn = await bones();
  ok(await p.evaluate(() => NoteOffice.current.state().act) === 'wave' && bn.arms.every((v, i) => Math.abs(v - (i % 2 ? 45 : 42)) < .01), 'Note Office: he waves with connected arms', bn);
  await wait(3100);
  ok(await p.evaluate(() => NoteOffice.current.state().act) === 'sing', 'Note Office: after the wave he goes back to his song');
  await p.keyboard.press('Escape'); await wait(400);
  ok(!(await p.$('.mw-ov[data-mw=office]:not(.out)')) && await p.evaluate(() => !NoteOffice.current && !document.body.classList.contains('office-on')), 'Esc closes Note Office and it stops');
  await p.click('[data-a=open]'); await wait(400);

  /* ---------- new note kinds: code note, music chart (lead sheet) ---------- */
  await p.click('.np-newb'); await wait(300); await p.click('.ask-kind[data-k=code]'); await p.keyboard.type('Sorting'); await p.keyboard.press('Enter'); await wait(600);
  ok(!!(await p.$('.p1 .nw[data-w=code] .nw-ta')) && await p.evaluate(() => document.activeElement.classList.contains('nw-ta')) && await p.$eval('.p1 .nw[data-w=code] .nw-title', e => e.value) === 'Sorting', 'a Code note starts with a code box, ready to type in');
  await p.click('.np-newb'); await wait(300); await p.click('.ask-kind[data-k=sheet]'); await p.keyboard.type('Blues in F'); await p.keyboard.press('Enter'); await wait(600);
  ok(await p.$$eval('.p1 .nw[data-w=sheet] .sh-bar', e => e.length) === 16 && await p.$eval('.p1 .sh-t', e => e.textContent) === 'Blues in F', 'a Music chart note starts with a blank 16-bar lead sheet');
  await p.fill('.p1 .sh-chords', 'D-7 G7'); await wait(100);
  ok(JSON.stringify(await p.$$eval('.p1 .sh-chord', e => e.map(x => x.textContent))) === '["D-7","G7"]', 'chords typed for a bar show above the staff');
  await p.click('.p1 .nw-durs [data-dur=q]');
  for (const k of ['F4', 'A4', 'C5', 'A4']) await p.click(`.p1 .nw-piano [data-k="${k}"]`);
  await wait(100);
  ok(await p.$eval('.p1 .sh-barn', e => e.textContent) === 'Bar 2 of 16' && await p.$$eval('.p1 .sh-svg ellipse', e => e.length) === 4, 'four quarter notes fill bar 1 and the next bar is picked');
  await p.click('.p1 [data-a=more]'); await wait(80);
  ok(await p.$$eval('.p1 .sh-bar', e => e.length) === 20, '＋ 4 bars adds a line');
  await p.click('.p1 .sh-all summary'); await p.fill('.p1 .sh-allc', 'C | F | C | C7'); await wait(80);
  ok(JSON.stringify(await p.$$eval('.p1 .sh-chord', e => e.map(x => x.textContent))) === '["C","F","C","C7"]', 'the whole chart can be typed with |');
  await wait(600);
  ok(await p.evaluate(() => { const n = InquireNotes.list().find(x => x.title === 'Blues in F'); return /data-w="sheet"/.test(n.html) && /𝄞 Blues in F/.test(n.body) && /\| C \| F \| C \| C7 \|/.test(n.body); }), 'the lead sheet is saved and its chords reach the plain text');

  /* ---------- delete + Undo ---------- */
  const count = () => p.evaluate(() => InquireNotes.list().length);
  await p.locator('.nb-it', { hasText: 'Note C' }).click(); await wait(200);
  const n0 = await count();
  await p.click('.nb-bar [data-a=del]'); await wait(200);
  ok(await count() === n0 - 1 && !!(await p.$('.tm-toast')), 'Delete removes the note at once and offers Undo');
  await p.click('.tm-toast button'); await wait(200);
  ok(await count() === n0 && /^blob:/.test(await p.evaluate(async () => { const n = InquireNotes.list().find(x => x.title === 'Note C'); const id = (n.html.match(/&quot;vid&quot;:&quot;([a-z0-9]+)/) || [])[1]; return id ? (await InquireNotes.imageURL(id)) || '' : ''; })), 'Undo brings the note back with its video');
  await p.click('#brand'); await wait(300);

  /* ---------- shortcuts ---------- */
  await p.click('.hello h1'); await p.keyboard.press('Alt+KeyN'); await wait(400);
  ok(!!(await p.$('.npage .nb')), 'Alt+N opens My notes');
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Alt+KeyM'); await wait(400);
  ok(!(await p.$('.npage')) && !!(await p.$('.hello h1')), 'Alt+M goes back to the Main Menu');
  await p.keyboard.press('Alt+Shift+KeyN'); await wait(300);
  ok(await p.evaluate(() => document.body.classList.contains('ask-open')), 'Alt+Shift+N asks for a new note title');
  await p.keyboard.press('Escape'); await wait(300);
  await p.keyboard.press('Alt+KeyF'); await wait(400);
  ok(!!(await p.$('.nb-fd.sel[data-f=fav]')), 'Alt+F opens Favourites');
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Alt+Backspace'); await wait(400);
  ok(!!(await p.$('.hello h1')), 'Alt+⌫ goes back from My notes to the menu');
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


  /* ---------- My notes tabs (Notes / Code / Music) and the Code tab (code.js) ---------- */
  {
    const c = await page();
    // a fake Judge0: decodes the program and its input, "runs" the Python greeting
    await c.route('https://ce.judge0.com/**', r => {
      const u = r.request().url();
      if (/\/languages/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ id: 71, name: 'Python (3.8.1)' }, { id: 100, name: 'Python (3.12.5)' }, { id: 62, name: 'Java (OpenJDK 13.0.1)' }]) });
      const d = JSON.parse(r.request().postData() || '{}'), src = Buffer.from(d.source_code || '', 'base64').toString(), inp = Buffer.from(d.stdin || '', 'base64').toString();
      const out = d.language_id === 100 && /input\(/.test(src) ? 'What is your name? Hello, ' + inp.split('\n')[0] + '!\n' : '';
      r.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ stdout: Buffer.from(out).toString('base64'), stderr: null, compile_output: null, status: { id: 3, description: 'Accepted' }, time: '0.02', lang: d.language_id }) });
    });
    await c.goto(URL0 + '#menu'); await wait(400);
    await c.evaluate(() => { const n = InquireNotes.create({ title: 'Plain note', body: 'hello' }); InquireNotes.addFolder('Work'); return n.id; });
    await c.click('[data-a=open]'); await wait(400);
    ok(JSON.stringify(await c.$$eval('.np-thumb', e => e.map(x => x.querySelector('.np-tht').textContent + (x.querySelector('.np-ths') ? ' soon' : '')))) === '["Notes","Code","Music soon"]', 'My notes has three thumb tabs: Notes, Code, Music (soon)');
    const th = await c.$$eval('.np-thumb', e => e.map(x => x.getBoundingClientRect())), win = await c.$eval('.np-win', e => e.getBoundingClientRect());
    ok(th.every(r => Math.abs(r.left - win.right) < 3), 'the tabs sit on the right edge of the My notes window', { th: th.map(r => r.left), right: win.right });
    ok(await c.$eval('.np-thumb[data-sp=notes]', e => e.getAttribute('aria-selected')) === 'true', 'the Notes tab is open first');
    const tcol = sp => c.$eval(`.np-thumb[data-sp=${sp}]`, e => getComputedStyle(e).getPropertyValue('--tc').trim());
    ok(/#F2B84B/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-notes'))) && /#4FA3F7/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-code'))) && /#D97AE6/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-music'))), 'tab colours default to orange, blue and magenta');
    await c.click('.np-thumb[data-sp=music]', { force: true }); await wait(200);
    ok(await c.$eval('.np-thumb[data-sp=notes]', e => e.getAttribute('aria-selected')) === 'true', 'Music is not open yet (coming soon)');
    ok(await c.$eval('.np-win', e => getComputedStyle(e).borderTopColor) === await c.evaluate(() => { const d = document.createElement('div'); d.className = 'win'; document.body.appendChild(d); const v = getComputedStyle(d).borderTopColor; d.remove(); return v; }), 'only the tabs are coloured, not the page');
    await c.click('.np-thumb[data-sp=code]'); await wait(300);
    ok(await c.evaluate(() => location.hash) === '#code' && /Code/.test(await c.$eval('#crumbs', e => e.textContent)) && await c.$eval('.np-newb', e => e.textContent) === '＋ New File', 'the Code tab: #code, breadcrumb, ＋ New File');
    ok(await c.$$eval('.nb-fd.user', e => e.length) === 0 && /No code files/.test(await c.$eval('.nb-items', e => e.textContent)), 'Code has its own folders (none yet), not the notes folders');
    // ＋ New File: language cards, coming soon list
    await c.click('.np-newb'); await wait(250);
    ok(JSON.stringify(await c.$$eval('.ask-kind b', e => e.map(x => x.textContent))) === '["Python","C","C++","JavaScript","Java"]' && /Coming soon:.*Rust/.test(await c.$eval('.ask-soon', e => e.textContent)), 'New File offers Python, C, C++, JavaScript, Java; the rest are Coming soon');
    await c.keyboard.type('greet'); await c.keyboard.press('Enter');
    await c.waitForSelector('.p1 .nc-edhost[data-ready]', { timeout: 15000 }); await wait(400);
    ok(await c.$eval('.p1 .nc-edhost', e => e.dataset.kind) === 'monaco' && !!(await c.$('.p1 .monaco-editor')), 'the code editor is Monaco (VS Code)');
    ok(await c.evaluate(() => { const n = InquireNotes.scope('code').list()[0]; return n.code.lang === 'python' && /input\(/.test(n.code.src) && n.title === 'greet'; }), 'a new Python file starts with a small program');
    await c.click('.p1 .nc-pt[data-p=in]'); await c.fill('.p1 .nc-in', 'Ada'); await wait(700);
    await c.click('.p1 [data-a=run]'); await c.waitForFunction(() => /■/.test(document.querySelector('.p1 .nc-out').textContent), null, { timeout: 8000 });
    const out1 = await c.$eval('.p1 .nc-out', e => e.textContent);
    ok(/Hello, Ada!/.test(out1) && /Accepted/.test(out1) && /Judge0/.test(out1), '▶ Run sends Python to Judge0 (newest Python) with the Input and shows the output', out1);
    ok(await c.evaluate(() => InquireNotes.scope('code').list()[0].code.stdin) === 'Ada', 'the Input is saved with the file');
    // typing in the editor is saved
    await c.click('.p1 .monaco-editor .view-lines'); await c.keyboard.press('Control+End'); await c.keyboard.type('print(42)'); await wait(900);
    ok(await c.evaluate(() => /print\(42\)/.test(InquireNotes.scope('code').list()[0].code.src)), 'typing in the code editor is saved');
    // JavaScript runs here
    await c.click('.np-newb'); await wait(250); await c.click('.ask-kind[data-k=javascript]'); await c.keyboard.type('hello js'); await c.keyboard.press('Enter');
    await c.waitForSelector('.p1 .nc-edhost[data-ready]', { timeout: 15000 }); await wait(300);
    await c.click('.p1 [data-a=run]'); await c.waitForFunction(() => /■/.test(document.querySelector('.p1 .nc-out').textContent), null, { timeout: 8000 });
    ok(/Hello, world!/.test(await c.$eval('.p1 .nc-out', e => e.textContent)) && /this computer/.test(await c.$eval('.p1 .nc-out', e => e.textContent)), 'JavaScript runs on this computer');
    // a language change
    await c.selectOption('.p1 .nc-lang', 'cpp'); await wait(300);
    ok(await c.evaluate(() => InquireNotes.scope('code').list().find(n => n.title === 'hello js').code.lang) === 'cpp' && await c.$eval('.p1 .nc-badge', e => e.textContent) === 'C++', 'the language menu changes the file\'s language');
    await c.selectOption('.p1 .nc-lang', 'javascript'); await wait(200);
    // code folders: new folder, drag a file in
    await c.click('[data-a=addf]'); await c.keyboard.type('Algorithms'); await c.keyboard.press('Enter'); await wait(300);
    await c.locator('.nb-fd[data-f=all] .nb-fdb').click(); await wait(200);
    await c.locator('.nb-it', { hasText: 'greet' }).dragTo(c.locator('.nb-fd.user', { hasText: 'Algorithms' })); await wait(300);
    ok(await c.evaluate(() => { const f = InquireNotes.scope('code').folders(); const g = InquireNotes.scope('code').list().find(n => n.title === 'greet'); return f.length === 1 && g.folder === f[0].id && InquireNotes.folders().length === 1; }), 'code files go into code folders; the notes folders are untouched');
    // side by side: drag a file onto ⧉
    await c.locator('.nb-it', { hasText: 'hello js' }).click(); await wait(400);
    await c.locator('.nb-it', { hasText: 'greet' }).dragTo(c.locator('.p1 .nb-trow'), { targetPosition: { x: 30, y: 10 } }).catch(() => {}); await wait(100);
    await c.evaluate(() => { const it = [...document.querySelectorAll('.nb-it')].find(x => /greet/.test(x.textContent)); const sp = document.querySelector('.p1 .nb-split'); const dt = new DataTransfer();
      it.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); const r = sp.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 10 };
      sp.dispatchEvent(new DragEvent('dragover', o)); sp.dispatchEvent(new DragEvent('drop', o)); it.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); }); await wait(600);
    ok(!(await c.$eval('.nb-pane.p2', e => e.hidden)) && /greet/.test(await c.$eval('.p2 .nb-title', e => e.value)) && !!(await c.$('.p2 .nc-edhost')), 'a code file dropped on ⧉ opens side by side with its own editor');
    await c.click('.p2 [data-a=close]'); await wait(200);
    // ⇄ Translate: not set up → says so; with the AI → a new file beside it
    await c.click('.p1 [data-a=tr]'); await wait(150);
    ok(await c.$$eval('.nc-trpop [data-to]', e => e.length) === 4, 'Translate offers the other four languages');
    await c.click('.nc-trpop [data-to=python]'); await wait(300);
    ok(/not set up/.test(await c.$eval('.p1 .nc-out', e => e.textContent)), 'without the AI key, Translate says it is not set up yet');
    await c.evaluate(() => { NPCode.ai.status = async () => ({ configured: true, model: 'test' }); NPCode.ai.ask = async q => (window.__ask = q, '```python\nprint("Hello, world!")\n```'); });
    await c.click('.p1 [data-a=tr]'); await wait(150); await c.click('.nc-trpop [data-to=python]'); await wait(800);
    ok(await c.evaluate(() => { const n = InquireNotes.scope('code').list().find(x => /\(Python\)/.test(x.title)); return !!n && n.code.lang === 'python' && n.code.src === 'print("Hello, world!")\n' && /JavaScript program into idiomatic Python/.test(window.__ask.prompt); }), 'with the AI, Translate makes a new Python file (no code fences)');
    ok(!(await c.$eval('.nb-pane.p2', e => e.hidden)) && /\(Python\)/.test(await c.$eval('.p2 .nb-title', e => e.value)), 'the translation opens side by side');
    await c.click('.p2 [data-a=close]'); await wait(200);
    // Notes tab: the Code section under the folders
    await c.click('.np-thumb[data-sp=notes]'); await wait(400);
    ok(await c.evaluate(() => location.hash) === '#notes' && await c.$$eval('.nb-cfile', e => e.length) === 3 && !!(await c.$('.nb-cfd')), 'the Notes tab lists the Code folders and files under a Code divider');
    ok(await c.$$eval('.nb-it', e => e.length) === 1, 'code files are not in the notes list');
    await c.locator('.nb-it', { hasText: 'Plain note' }).click(); await wait(300);
    await c.locator('.nb-cfile', { hasText: 'greet' }).dragTo(c.locator('.p1 .nb-rich')); await wait(500);
    ok(await c.evaluate(() => { const n = InquireNotes.list().find(x => x.title === 'Plain note'); return /data-w="code"/.test(n.html) && /&quot;lang&quot;:&quot;python&quot;/.test(n.html) && /print\(42\)/.test(n.body); }), 'a code file dragged into a note becomes a code box (a copy, its language shown)');
    ok(await c.$eval('.p1 .nw[data-w=code] .nw-lang', e => e.value) === 'python', 'the code box shows the language');
    const codeN = await c.evaluate(() => InquireNotes.scope('code').list().length);
    await c.locator('.nb-cfile', { has: c.locator('.nb-cfi[data-lang=javascript]') }).dragTo(c.locator('.nb-fd.user', { hasText: 'Work' })); await wait(500);
    ok(await c.evaluate(() => { const w = InquireNotes.folders()[0], n = InquireNotes.list().find(x => x.title === 'hello js'); return !!n && n.folder === w.id && /data-w="code"/.test(n.html) && /&quot;javascript&quot;/.test(n.html); }) && await c.evaluate(() => InquireNotes.scope('code').list().length) === codeN, 'a code file dropped on a notes folder is copied there as a note; the original stays in Code');
    ok(await c.evaluate(() => InquireNotes.list().length) === 2 && /2 notes/.test(await c.evaluate(() => (InquireNotes.list().length) + ' notes')), 'the notes count leaves code files out');
    await c.locator('.nb-cfile', { hasText: 'greet' }).click(); await wait(500);
    ok(await c.$eval('.np-thumb[data-sp=code]', e => e.getAttribute('aria-selected')) === 'true' && /greet/.test(await c.$eval('.p1 .nb-title', e => e.value)), 'clicking a code file in the Notes tab opens it in the Code tab');
    // the tab is remembered; #code opens it
    await c.goto(URL0 + '#code'); await wait(600);
    ok(await c.$eval('.np-thumb[data-sp=code]', e => e.getAttribute('aria-selected')) === 'true', '#code opens My notes on the Code tab');
    // Settings: tab colours, run service
    await c.evaluate(() => InquireSettings.open('look')); await wait(200);
    await c.$eval('.set-tabcl input[data-tab=code]', e => { e.value = '#ff0000'; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }); await wait(100);
    ok(/#ff0000/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-code'))) && /ff0000/i.test(await c.evaluate(() => localStorage.getItem('notepath.settings'))), 'Settings → Appearance changes and keeps the Code tab colour');
    await c.click('.set-tab[data-tab=code]'); await wait(200);
    await c.check('.set-svc input[value=piston]'); await wait(100);
    ok(await c.evaluate(() => NPCode.settings().service) === 'piston' && /Runs on Piston/.test(await c.$eval('.p1 .nc-s-run', e => e.textContent)), 'Settings → Code picks the run service (the status bar follows)');
    await c.check('.set-svc input[value=judge0]');
    await c.click('.set-pane [data-a=test]'); await c.waitForFunction(() => /works|answered|not/.test(document.querySelector('.set-pane .set-msg').textContent), null, { timeout: 6000 }).catch(() => {});
    ok(/Ready \(test\)/.test(await c.$eval('.set-ai', e => e.textContent)), 'Settings → Code shows the AI status');
    await c.evaluate(() => InquireSettings.close());
    await c.close();
  }

  /* ---------- My Tasks (tasks.js) ---------- */
  {
    const t = await page();
    const png = fs.readFileSync(path.join(R, 'app/brand/np-mark-64.png'));
    await t.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(/Nowhere/.test(r.request().url()) ? [] : [{ display_name: '1 Infinite Loop, Cupertino, California, 95014, United States', lat: '37.3318', lon: '-122.0312' }, { display_name: 'Infinite Loop, Elsewhere', lat: '40', lon: '-100' }]) }));
    await t.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await t.goto(URL0 + '#menu'); await wait(400);
    await t.click('[data-a=tasks]'); await wait(400);
    ok(await t.evaluate(() => location.hash) === '#tasks' && /My Tasks/.test(await t.$eval('#crumbs', e => e.textContent)) && !!(await t.$('.nt .nt-list')) && !!(await t.$('.nt .nt-ed')), 'My Tasks is a page: the task list on the left, the overview on the right');
    const T = () => t.evaluate(() => NPTasks.all());
    const one = name => t.evaluate(n => NPTasks.all().find(x => x.title === n), name);
    await t.click('.np-newb'); await wait(250);
    ok(JSON.stringify(await t.$$eval('.ask-kind b', e => e.map(x => x.textContent))) === '["High priority","Medium priority","Low priority"]' && await t.$eval('.ask-kind[data-k=med]', e => e.getAttribute('aria-checked')) === 'true', 'New Task asks the priority (Medium chosen first)');
    await t.click('.ask-kind[data-k=high]'); await t.keyboard.type('Pick up the cake'); await t.keyboard.press('Enter'); await wait(300);
    ok((await one('Pick up the cake')).pri === 'high' && await t.$eval('.nt-it[aria-selected=true]', e => e.dataset.pri) === 'high' && await t.$eval('.nt-it[aria-selected=true] .nt-pri', e => e.textContent) === '▲', 'a High task: red ▲ in the list');
    await t.click('.nt-prib[data-p=low]'); await wait(150);
    ok((await one('Pick up the cake')).pri === 'low' && await t.$eval('.nt-it[aria-selected=true] .nt-pri', e => e.textContent) === '●', 'priority changes in the overview (Low ●)');
    await t.click('.nt-prib[data-p=high]'); await wait(150);
    // due date and time → an "at the due time" reminder comes with it
    await t.fill('.nt-in[data-k=dueDate]', '2030-06-14'); await t.dispatchEvent('.nt-in[data-k=dueDate]', 'change'); await wait(150);
    await t.fill('.nt-in[data-k=dueTime]', '16:30'); await t.dispatchEvent('.nt-in[data-k=dueTime]', 'change'); await wait(150);
    let c1 = await one('Pick up the cake');
    ok(c1.dueDate === '2030-06-14' && c1.dueTime === '16:30' && JSON.stringify(c1.rem) === '[0]', 'a due date and time; the first due date brings an "at the due time" reminder', c1);
    ok(/Jun 14/.test(await t.$eval('.nt-it[aria-selected=true] .nt-due', e => e.textContent)), 'the list shows the due date');
    await t.click('[data-rem="60"]'); await wait(120);
    await t.fill('.nt-cn', '2'); await t.selectOption('.nt-cu', '60'); await t.click('.nt-custom button'); await wait(150);
    ok(JSON.stringify((await one('Pick up the cake')).rem) === '[0,60,120]' && /2 hours before/.test(await t.$eval('.nt-chips', e => e.textContent)), 'reminders: chips (1 hour before) and a custom one (2 hours before)');
    await t.click('[data-rem="0"]'); await wait(120);
    ok(JSON.stringify((await one('Pick up the cake')).rem) === '[60,120]', 'a reminder chip turns off');
    // place: checked with OpenStreetMap, locked onto a map
    await t.fill('.nt-locq', 'Nowhere at all'); await t.click('.nt-locf button'); await wait(300);
    ok(/No place found/.test(await t.$eval('.nt-locres', e => e.textContent)), 'an address that is not found says so');
    await t.fill('.nt-locq', '1 Infinite Loop'); await t.click('.nt-locf button'); await wait(300);
    ok(await t.$$eval('.nt-lr', e => e.length) === 2, 'matching places are listed to pick from');
    await t.click('.nt-lr >> nth=0'); await wait(400);
    c1 = await one('Pick up the cake');
    ok(c1.loc && Math.abs(c1.loc.lat - 37.3318) < 1e-6 && /Cupertino/.test(c1.loc.label) && /Locked/.test(await t.$eval('.nt-lock', e => e.textContent)), 'the picked place is locked in with its coordinates');
    ok(await t.$$eval('.nt-map .nt-tiles img', e => e.length >= 2 && e.every(x => /^https:\/\/tile\.openstreetmap\.org\/16\//.test(x.src))) && !!(await t.$('.nt-map .nt-pin')) && /OpenStreetMap/.test(await t.$eval('.nt-attr', e => e.textContent)), 'the place shows on a map (OpenStreetMap tiles, a pin, credit)');
    await t.click('.nt-zoom [data-z="1"]'); await wait(100);
    ok(await t.$eval('.nt-map .nt-tiles img', e => /\/17\//.test(e.src)), 'the map zooms');
    ok(/maps\.apple\.com\/\?ll=37\.3318,-122\.0312/.test(await t.$eval('.nt-maplinks a', e => e.href)), 'Open in Apple Maps / Google Maps links');
    // picture, files, notes
    await t.setInputFiles('.nt-picin', path.join(R, 'app/brand/np-mark-128.png')); await wait(500);
    ok(!!(await one('Pick up the cake')).pic && await t.$eval('.nt-pic', e => /blob:/.test(e.style.backgroundImage)) && await t.$eval('.nt-it[aria-selected=true] .nt-thumb', e => /blob:/.test(e.style.backgroundImage)), 'the task picture shows in the overview and the list');
    await t.setInputFiles('.nt-fin', [path.join(R, 'app/brand/np-mark-64.png'), path.join(R, 'README.md')]); await wait(600);
    c1 = await one('Pick up the cake');
    ok(c1.files.length === 2 && await t.$$eval('.nt-gal .nt-gi', e => e.length) === 1 && /README\.md/.test(await t.$eval('.nt-docs', e => e.textContent)), 'files: a photo in the gallery, a document in the list');
    ok(await t.evaluate(async id => !!(await InquireNotes.imageURL(id)), c1.files[1].id), 'attached files are stored on this computer');
    await t.click('.nt-gi'); await wait(300);
    ok(!!(await t.$('.nt-lb img')), 'a photo opens large'); await t.keyboard.press('Escape'); await wait(150);
    ok(!(await t.$('.nt-lb')) && !!(await t.$('.nt')), 'Esc closes the photo, not My Tasks');
    await t.click('.nt-docs [data-rmf]'); await wait(200);
    ok((await one('Pick up the cake')).files.length === 1, 'a file can be removed');
    await t.fill('.nt-notes', 'Chocolate, please.'); await wait(700);
    ok((await one('Pick up the cake')).notes === 'Chocolate, please.', 'notes are saved');
    // .ics for any calendar app
    const [dl] = await Promise.all([t.waitForEvent('download'), t.click('[data-a=ics]')]);
    const icsF = path.join(dir, 'task.ics'); await dl.saveAs(icsF); const icsT = fs.readFileSync(icsF, 'utf8');
    ok(/SUMMARY:Pick up the cake/.test(icsT) && /LOCATION:1 Infinite Loop\\, Cupertino/.test(icsT) && /TRIGGER:-PT60M/.test(icsT) && /BEGIN:VEVENT/.test(icsT), '⤓ Calendar saves an .ics with the time, place and reminders');
    // repeat weekly: done moves it to next week
    await t.click('[data-rep=weekly]'); await wait(150);
    await t.click('[data-a=done]'); await wait(200);
    c1 = await one('Pick up the cake');
    ok(c1.dueDate === '2030-06-21' && !c1.done && !!c1.last, 'a weekly task ticked done moves to the next week and stays open', c1.dueDate);
    // more tasks: done, sort, search, show done
    await t.click('.np-newb'); await wait(200); await t.click('.ask-kind[data-k=low]'); await t.keyboard.type('Water the plants'); await t.keyboard.press('Enter'); await wait(250);
    await t.click('.np-newb'); await wait(200); await t.keyboard.type('Call the bank'); await t.keyboard.press('Enter'); await wait(250);
    await t.fill('.nt-in[data-k=dueDate]', '2020-01-02'); await t.dispatchEvent('.nt-in[data-k=dueDate]', 'change'); await wait(200);
    ok(/Overdue/.test(await t.$eval('.nt-it[aria-selected=true] .nt-due', e => e.textContent)) && /1 overdue/.test(await t.$eval('.nt-sum', e => e.textContent)), 'a task past its date is marked Overdue');
    ok(JSON.stringify(await t.$$eval('.nt-it .nb-t', e => e.map(x => x.textContent.slice(1)))) === '["Call the bank","Pick up the cake","Water the plants"]', 'By due date: soonest first, no date last');
    await t.selectOption('.nt-sort', 'pri'); await wait(150);
    ok(JSON.stringify(await t.$$eval('.nt-it .nb-t', e => e.map(x => x.textContent.slice(1)))) === '["Pick up the cake","Call the bank","Water the plants"]', 'By priority: High, Medium, Low');
    await t.click('.nt-it[data-pri=low] .nt-ck'); await wait(200);
    ok((await one('Water the plants')).done && await t.$eval('.nt-it[data-pri=low]', e => e.classList.contains('done')) && await t.$eval('.nt-it:last-child', e => e.dataset.pri) === 'low', 'ticking a task in the list marks it done (struck through, at the bottom)');
    await t.click('.nt-showdone'); await wait(150);
    ok(await t.$$eval('.nt-it', e => e.length) === 2, '✓ Done hides finished tasks'); await t.click('.nt-showdone'); await wait(100);
    await t.fill('.nt-tools input, .nt-list input[type=search]', 'bank'); await wait(150);
    ok(await t.$$eval('.nt-it', e => e.length) === 1, 'search finds tasks'); await t.fill('.nt-list input[type=search]', ''); await wait(100);
    // a reminder comes up: a message with Open, shown once
    await t.locator('.nt-it', { hasText: 'Call the bank' }).click(); await wait(200);
    await t.evaluate(() => { const d = new Date(Date.now() + 30 * 60000), p2 = n => String(n).padStart(2, '0'); const x = NPTasks.all().find(k => k.title === 'Call the bank');
      NPTasks.update(x.id, { dueDate: d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()), dueTime: p2(d.getHours()) + ':' + p2(d.getMinutes()), rem: [60] }); });
    await t.waitForFunction(() => /Coming up/.test((document.querySelector('.tm-toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    ok(/Coming up: Call the bank/.test(await t.$eval('.tm-toast', e => e.textContent).catch(() => '')), 'a reminder that comes up shows a message (and a notification)');
    ok(await t.evaluate(() => NPTasks.upcoming().filter(r => /bank/.test(r.title)).length) === 0, 'each reminder shows once');
    // delete with Undo
    const n0 = (await T()).length;
    await t.click('[data-a=del]'); await wait(200);
    ok((await T()).length === n0 - 1, 'Delete removes the task'); await t.click('.tm-toast button'); await wait(200);
    ok((await T()).length === n0, 'Undo brings it back');
    // menu count, shortcut
    await t.click('#brand'); await wait(300);
    ok(await t.$eval('[data-n=tasks]', e => e.textContent) === '2', 'the My Tasks button shows the open tasks');
    await t.click('.hello h1'); await t.keyboard.press('Alt+KeyT'); await wait(300);
    ok(!!(await t.$('.nt')), 'Alt+T opens My Tasks');
    await t.close();
  }

  /* ---------- Settings → Usage: keep running in the tray / start at sign-in (fake Windows desktop bridge) ---------- */
  {
    const w = await page(() => { window.__prefs = { tray: true, login: false }; window.inquireDesktop = { platform: 'win32', onUpdate: () => {}, checkForUpdates: async () => {}, updateState: async () => ({ status: 'idle' }), installUpdate: async () => {}, revealUpdate: async () => {}, version: async () => '0.3.0', lookupWord: async () => ({ status: 0 }),
      prefs: async () => Object.assign({ trayAvailable: true, loginAvailable: true }, window.__prefs), setPrefs: async p => Object.assign(window.__prefs, p), onRoute: f => { window.__route = f; } }; });
    await w.goto(URL0 + '#menu'); await wait(400);
    await w.evaluate(() => InquireSettings.open('usage')); await wait(300);
    ok(/Keep running in the system tray/.test(await w.$eval('.set-pane', e => e.textContent)) && /Start NotePath when I sign in/.test(await w.$eval('.set-pane', e => e.textContent)), 'Settings → Usage offers the system tray and start at sign-in (Windows)');
    await w.click('.set-pane [data-p=login] + span'); await w.click('.set-pane [data-p=tray] + span'); await wait(150);
    ok(await w.evaluate(() => window.__prefs.login === true && window.__prefs.tray === false), 'the switches tell the app');
    await w.evaluate(() => InquireSettings.close());
    await w.evaluate(() => window.__route({ view: 'tasks' })); await wait(300);
    ok(!!(await w.$('.nt')), 'the tray menu can open My Tasks');
    await w.close();
  }

  /* ---------- My notes › ⇅ Import / Export (io.js) ---------- */
  {
    const x = await page();
    await x.goto(URL0 + '#menu'); await wait(300);
    await x.evaluate(async () => { const N = InquireNotes, png = await N.mediaBlob ? await (await fetch('brand/np-mark-64.png')).blob() : null, img = await N.putImage(png);
      const w = N.addFolder('Work'), pr = N.addFolder('Projects', w.id), other = N.create({ title: 'Other note', body: 'linked one', folder: w.id });
      N.create({ title: 'Big note', folder: pr.id, fav: true, html: `<div>Plain <b>bold</b> <i>it</i> <s>gone</s> <span data-c="#e5675b">red</span></div><h3>A heading</h3><ul><li>one<ul><li>nested</li></ul></li></ul><ol><li>first</li></ol><ul data-ck="1"><li data-done="1">done item</li><li>todo item</li></ul><blockquote>A quote</blockquote><div>See <a class="nlink" data-note="${other.id}">Other note</a></div><div><img data-img="${img}" alt="logo"></div><div class="nw" data-w="code" data-src="${JSON.stringify({ lang: 'python', title: 'hi.py', src: 'print(1)' }).replace(/"/g, '&quot;')}"></div>` }); });
    await x.click('[data-a=open]'); await wait(300);
    await x.locator('.nb-it', { hasText: 'Big note' }).click(); await wait(300);
    await x.click('.nb-bar [data-a=exp]'); await wait(300);
    ok(!!(await x.$('.mw-ov[data-mw=io] .io')) && await x.$eval('.io-scope [data-s=note]', e => e.getAttribute('aria-checked')) === 'true' && /Big note/.test(await x.$eval('.io-scope [data-s=note]', e => e.textContent)), 'Export… on the note bar opens Import & Export with This note chosen');
    ok(JSON.stringify(await x.$$eval('.io-fmt b', e => e.map(y => y.textContent))) === '["Markdown","Word","Evernote / Apple Notes","Web page","PDF","Plain text"]', 'export formats: Markdown (Obsidian), Word, Evernote / Apple Notes, web page, PDF, text');
    const exp = async (scope, fmt) => { await x.click(`.io-scope [data-s=${scope}]`); await x.click(`.io-fmt[data-f=${fmt}]`);
      const [dl] = await Promise.all([x.waitForEvent('download'), x.click('[data-a=export]')]); const f = path.join(dir, scope + '-' + fmt + '-' + dl.suggestedFilename()); await dl.saveAs(f); return f; };
    const unz = async f => x.evaluate(async b64 => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const es = await NPIO.unzip(new Blob([a])); const o = {}; for (const e of es) o[e.name] = /\.(md|xml|enex|html|txt|rels)$/.test(e.name) ? await e.text() : e.size; return o; }, fs.readFileSync(f).toString('base64'));
    const fmd = await exp('note', 'md'), zmd = await unz(fmd), md = zmd['Big note.md'] || '';
    ok(/\.zip$/.test(fmd) && /\*\*bold\*\*/.test(md) && /## A heading/.test(md) && /- \[x\] done item/.test(md) && /\[\[Other note\]\]/.test(md) && /```python/.test(md) && /!\[logo\]\(attachments\/\w+\.png\)/.test(md) && Object.keys(zmd).some(k => /^attachments\/.+\.png$/.test(k)), 'Markdown: Obsidian links, checklists, code, and the photo in attachments/', Object.keys(zmd));
    const fdx = await exp('note', 'docx'), zdx = await unz(fdx);
    ok(/\.docx$/.test(fdx) && /<w:t xml:space="preserve">bold<\/w:t>/.test(zdx['word/document.xml']) && /Heading2/.test(zdx['word/document.xml']) && /☒/.test(zdx['word/document.xml']) && Object.keys(zdx).some(k => /^word\/media\//.test(k)) && !!zdx['word/numbering.xml'], 'Word: a .docx with headings, lists, checkboxes and the photo');
    const fen = await exp('note', 'enex'), en = fs.readFileSync(fen, 'utf8');
    ok(/<en-export/.test(en) && /<en-todo checked="true"\/>done item/.test(en) && /<en-media type="image\/png" hash="[0-9a-f]{32}"\/>/.test(en) && /<resource><data encoding="base64">/.test(en), 'Evernote / Apple Notes: an .enex with checkboxes and the photo (md5)');
    const fht = await exp('note', 'html'), ht = fs.readFileSync(fht, 'utf8');
    ok(/<h1>Big note<\/h1>/.test(ht) && /src="data:image\/png;base64,/.test(ht) && /<ol><li>first<\/li><\/ol>/.test(ht), 'Web page: one .html with the photo inside');
    const ftx = await exp('note', 'txt');
    ok(/^Big note\n\nPlain bold it gone red/.test(fs.readFileSync(ftx, 'utf8')), 'Plain text');
    const fall = await exp('all', 'md'), zall = await unz(fall);
    ok(Object.keys(zall).includes('NotePath notes/Work/Projects/Big note.md') && Object.keys(zall).includes('NotePath notes/Work/Other note.md'), 'Everything keeps the folders (Work/Projects/…)', Object.keys(zall));
    const fallx = await exp('all', 'docx');
    ok(/\.zip$/.test(fallx) && Object.keys(await unz(fallx)).includes('NotePath notes/Work/Projects/Big note.docx'), 'several Word files go in a .zip with the folders');
    await x.click('.mw-ov[data-mw=io] .set-x'); await wait(300);
    // the folder scope
    await x.locator('.nb-fd.user', { hasText: 'Projects' }).locator('.nb-fdb').click(); await wait(200);
    await x.click('[data-a=io]'); await wait(300);
    ok(/Projects · 1 note/.test(await x.$eval('.io-scope [data-s=folder]', e => e.textContent)), 'This folder: the folder being viewed, with its subfolders');
    // import: an Obsidian vault folder, Google Keep, a .docx, an .enex, a web page; the folders are kept
    const v = path.join(dir, 'vault'); fs.mkdirSync(path.join(v, 'Projects'), { recursive: true }); fs.mkdirSync(path.join(v, 'attachments'), { recursive: true }); fs.mkdirSync(path.join(v, '.obsidian'), { recursive: true });
    fs.writeFileSync(path.join(v, '.obsidian', 'app.json'), '{}'); fs.copyFileSync(path.join(R, 'app/brand/np-mark-64.png'), path.join(v, 'attachments', 'pic.png'));
    fs.writeFileSync(path.join(v, 'Home.md'), '---\ncreated: 2025-01-02\n---\n# Home\n\nSee [[Idea|the idea]] and [[Missing]].\n\n- [ ] milk\n- [x] code\n  - nested\n\n![[pic.png]]\n\n```js\nconsole.log(1)\n```\n');
    fs.writeFileSync(path.join(v, 'Projects', 'Idea.md'), 'An idea with ~~old~~ and `code`.\n\n> quoted\n');
    await x.selectOption('.io-sel', '');
    await x.setInputFiles('.io-din', v);
    await x.waitForFunction(() => /Imported|Nothing|not/.test(document.querySelector('.io-log').textContent), null, { timeout: 10000 });
    ok(/Imported 2 notes, 2 folders, 1 photo/.test(await x.$eval('.io-log', e => e.textContent)), 'an Obsidian vault (a folder) imports with its folders and photos', await x.$eval('.io-log', e => e.textContent));
    const home = await x.evaluate(() => { const n = InquireNotes.list().find(y => y.title === 'Home'), f = InquireNotes.folders(); return { html: n.html, folder: (f.find(z => z.id === n.folder) || {}).name, created: n.created, idea: (f.find(z => z.id === InquireNotes.list().find(y => y.title === 'Idea').folder) || {}).name }; });
    ok(home.folder === 'vault' && home.idea === 'Projects' && new Date(home.created).getUTCFullYear() === 2025, 'the vault folder and its Projects folder are kept; dates come along', home);
    ok(/<a[^>]*data-note="[a-z0-9]+"[^>]*>the idea<\/a>/.test(home.html) && /Missing/.test(home.html) && /<ul data-ck="1"><li>milk<\/li><li data-done="1">code<ul><li>nested<\/li><\/ul><\/li><\/ul>/.test(home.html) && /data-img="/.test(home.html) && /data-w="code"/.test(home.html), '[[links]] become note links; checklists, nesting, photos and code come in', home.html);
    fs.writeFileSync(path.join(dir, 'Shopping.json'), JSON.stringify({ title: 'Shopping', isPinned: true, isTrashed: false, listContent: [{ text: 'Eggs', isChecked: false }, { text: 'Bread', isChecked: true }], labels: [{ name: 'Home' }], userEditedTimestampUsec: 1.7e15 }));
    const enex = fen, docx = fdx;
    await x.setInputFiles('.io-fin', [path.join(dir, 'Shopping.json'), enex, docx, fht]);
    await x.waitForFunction(() => /Imported 4/.test(document.querySelector('.io-log').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/Imported 4 notes/.test(await x.$eval('.io-log', e => e.textContent)), 'Google Keep, .enex, .docx and .html import together', await x.$eval('.io-log', e => e.textContent));
    const back = await x.evaluate(() => InquireNotes.list().filter(n => n.title === 'Big note').map(n => n.html));
    ok(back.length === 4 && back.every(h => /done item/.test(h) && /<h3>A heading<\/h3>/.test(h)) && back.filter(h => /<li data-done="1">done item<\/li>/.test(h)).length >= 3, 'what NotePath exports comes back in (Word, Evernote, web page)');
    ok(await x.evaluate(() => { const n = InquireNotes.list().find(y => y.title === 'Shopping'), f = InquireNotes.folders().find(z => z.id === n.folder); return n.fav && f && f.name === 'Home' && /<li data-done="1">Bread<\/li>/.test(n.html); }), 'a Google Keep note: pinned → ★, its label → a folder, its checklist');
    await x.setInputFiles('.io-fin', [path.join(R, 'README.md').replace('README.md', 'package.json')]); await wait(500);
    ok(/Nothing to import/.test(await x.$eval('.io-log', e => e.textContent)), 'a file that is not notes is left out');
    await x.close();
  }
  ok(!errs.length, 'no page errors', errs);
  await b.close(); srv.close();
  console.log(pass.map(x => '  ✓ ' + x).join('\n'));
  if (fails.length) { console.error('\nINTERACT FAILED\n' + fails.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
  console.log(`Interaction test passed (${pass.length} checks).`);
})().catch(e => { console.error(e); process.exit(1); });
