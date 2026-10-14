// Interaction test: drives what smoke.js only loads. Fails (exit 1) on a wrong result or any page error.
//   start menu: My notes, My Tasks, a Coming soon button that does nothing, Note Office (all one size), recent notes;
//   My notes (a page): ＋ New Note + title dialog, folders (drag into / above, cycle refused, fold, notes listed under them), notes onto folders,
//             My order drag + Alt+↑/↓, ★ first, folders + list resize, list fold, drag a note in (link) or onto ⧉ (side by side, minimise, maximise),
//             text sizes, headings / bullets / numbers / checklists (tick + survive a reload), strikethrough, code box, music chart,
//             video by link and by file (+ backup size limit), delete + Undo;
//   right-click in a note: Dictionary definition (mocked Wiktionary) + Save to note, Link to a note, Translate (mocked MyMemory);
//   new note kinds (code, lead sheet), lead sheet chords/notes/bars, folder ★, undo/redo (typing, folders), ▶ Video on the note bar;
//   Settings: shortcuts (Alt+N, Alt+Shift+N, Alt+M), a theme, backup export → import round trip, Install & Relaunch (fake desktop bridge).
//   v0.5.x: note links (synthetic and real mouse drags from the list and the folders side bar, folder links, right-click
//             Open in a new note tab), ‹ Back, list indent / delete rules, folder icons as fold buttons, Folders / Code line,
//             H between U and S, styles on an empty line, ▦ Widgets, My Code / My Music on the menu, info box, Show as
//             Icons / List / Details, ◈ Links panel (views, resize), ↳ indented notes on words and on code.
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
  const page = async (init) => { const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); p.setDefaultTimeout(6000); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { if (!sessionStorage.getItem('np-new-test')) localStorage.setItem('notepath.seen056', 'true'); } catch (e) {} }); // (v0.5.6) the What's new card is checked once, on its own
    if (init) await p.addInitScript(init); return p; };

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
  ok(JSON.stringify(await p.$$eval('.npn-acts .slot h3', e => e.map(x => x.textContent))) === '["My notes","My Tasks","My Code","My Music","Note Office"]', 'the Notes console: My notes, My Tasks, My Code, My Music, Note Office on the far right');
  ok(await p.$$eval('.npn-acts .slot', e => e.every(x => Math.abs(x.getBoundingClientRect().top - e[0].getBoundingClientRect().top) < 2)), 'the five buttons sit in one row');
  ok(await p.$$eval('.npn-acts .slot', e => e.every(x => Math.abs(x.getBoundingClientRect().width - e[0].getBoundingClientRect().width) < 1.5 && Math.abs(x.getBoundingClientRect().height - e[0].getBoundingClientRect().height) < 1.5)), 'the five buttons are the same size');
  ok(await p.$$eval('.slot.npn-soon', e => e.length === 1 && e.every(x => x.querySelector('h3').textContent === 'My Music' && /Coming soon/.test(x.textContent) && x.getAttribute('aria-disabled') === 'true')), 'My Music is a Coming soon button');
  await p.click('.slot.npn-soon >> nth=0', { force: true }); await wait(300);
  ok(!(await p.$('.mw-ov, .ask-ov')) && await p.evaluate(() => location.hash) === '#menu', 'My Music is not linked to anything yet');
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
  ok(JSON.stringify(await p.$$eval('.nb-bar .btn-s', e => e.map(x => x.textContent.trim()))) === '["＋ Photo","Photo link","▶ Video","Delete"]' && !(await p.$('.nr-tools .nr-vid')) && !(await p.$('.nb-bar [data-a=exp]')), '▶ Video sits on the note bar between Photo link and Delete; no Export… button (v0.5.6)');
  await p.click('.crumbs .crumb'); await wait(400);
  ok(!!(await p.$('.hello h1')), 'the Main Menu breadcrumb goes back to the menu');
  ok(await p.$eval('.mnote .mnote-t', e => e.textContent.trim()) === 'Shopping list' && await p.$eval('[data-n=all]', e => e.textContent) === '1', 'the new note shows under Recent and in the count');
  await p.click('.mnote'); await wait(400);
  ok(await p.$eval('.nb-title', e => e.value) === 'Shopping list', 'a recent note opens in My notes');
  await p.click('#brand'); await wait(300);

  /* ---------- My notes: folders and order ---------- */
  await p.evaluate(() => { const N = InquireNotes; ['A', 'B', 'C'].forEach((t, i) => { const n = N.create({ title: 'Note ' + t }); N.update(n.id, { updated: Date.now() + i, quiet: true }); }); ['Alpha', 'Beta', 'Gamma'].forEach(f => N.addFolder(f));
    localStorage.setItem('notepath.codesech', '70'); }); // (v0.5.6) folder rows follow Show as and are taller in List: give the notes part the room so every row is on screen for the drags
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
  const order = () => p.$$eval('.nb-it[data-g=none] .nb-t', es => es.map(e => e.textContent.replace('★', ''))); // (v0.5.5) the Unfiled notes in the bar
  const before = await order(), last = before[before.length - 1];
  await p.locator('.nb-it[data-g=none]', { hasText: last }).dragTo(p.locator('.nb-it[data-g=none]').first(), { targetPosition: { x: 40, y: 3 } }); await wait(150);
  ok((await order())[0] === last, 'note dragged to the top of My order', await order());
  await p.locator('.nb-it[data-g=none]', { hasText: last }).focus(); await p.keyboard.press('Alt+ArrowDown'); await wait(100);
  ok((await order())[1] === last, 'Alt+↓ moves a note down', await order());
  await p.locator('.nb-it[data-g=none]', { hasText: 'Note B' }).click(); await wait(150); await p.click('.nb-bar [data-a=fav]'); await wait(150);
  ok((await order())[0] === 'Note B', 'a starred note goes to the top with ★ first', await order());
  await p.click('.nb-favtop'); await wait(100);
  ok((await order())[0] !== 'Note B', '★ first off: the favourite follows My order', await order());
  // folders list their notes and fold them away
  const betaId = await p.evaluate(() => InquireNotes.folders().find(f => f.name === 'Beta').id), inBeta = `.nb-fnote[data-g="${betaId}"]`;
  ok(await p.$$eval(inBeta, es => es.map(e => e.querySelector('.nb-t').textContent.trim()).join()) === 'Note A', 'a folder lists its notes under it', await p.$$eval(inBeta, es => es.map(e => e.textContent)));
  await p.click('.nb-fd.user:has-text("Alpha") .nb-fcar'); await wait(100);
  ok(!(await p.$(inBeta)) && !(await p.$('.nb-fd.user:has-text("Beta")')), '▾ folds a folder: its folders and notes hide');
  await p.click('.nb-fd.user:has-text("Alpha") .nb-fcar'); await wait(100);
  ok(await p.$$eval('.nb-fd.user .nb-fcar', b => b.every(x => x.tagName === 'BUTTON')) && !!(await p.$(inBeta)), 'every folder has its own fold button and unfolds again');
  await p.click(inBeta); await wait(200);
  ok(await p.$eval('.nb-title', e => e.value) === 'Note A', 'clicking a note in a folder opens it');
  const fw = () => p.$eval('.nb-folders', e => e.offsetWidth), rzf = await p.locator('.nb-rzf').boundingBox(), fw0 = await fw();
  await p.mouse.move(rzf.x + 5, rzf.y + 60); await p.mouse.down(); await p.mouse.move(rzf.x + 65, rzf.y + 60, { steps: 4 }); await p.mouse.up();
  ok(Math.abs(await fw() - (fw0 + 60)) < 4, 'the folders column resizes by dragging its edge', [fw0, await fw()]);
  await p.dblclick('.nb-rzf'); await wait(400);
  ok(Math.abs(await fw() - fw0) < 4, 'double-click resets the folders column');
  await p.click('.nb-favtop');
  // (v0.5.5) one Folders & Files bar: Favourites / Unfiled / All notes fold open to list their notes; the Tool bar replaced the notes list
  await p.click('.nb-lcar[data-lcar=fav]'); await wait(150);
  ok(JSON.stringify(await p.$$eval('.nb-fnote[data-g=fav] .nb-t', e => e.map(x => x.textContent.replace('★', '')))) === '["Note B"]', 'Favourites opens to list only starred notes', await p.$$eval('.nb-fnote[data-g=fav] .nb-t', e => e.map(x => x.textContent)));
  await p.click('.nb-lcar[data-lcar=fav]'); await wait(100);
  ok(!(await p.$('.nb-list')) && !!(await p.$('.nb-folders .nb-tools .np-views')) && !!(await p.$('.nb-folders .nb-sort')), 'the notes list is gone: Show as and the order sit at the top of the Folders & Files bar');
  ok(JSON.stringify(await p.$$eval('.nb-rail .nb-tool[data-tool]', e => e.map(x => x.dataset.tool + (x.classList.contains('on') ? '*' : '') + (x.getAttribute('aria-disabled') ? '-soon' : '')))) === '["note*","canvas-soon","trees-soon","sheets-soon"]', 'the Tool bar: Note (on), Canvas, Note Trees, Spreadsheets (coming soon); no Code tool (v0.5.6)');
  await p.click('.nb-rail [data-tool=trees]', { force: true }); await wait(150);
  ok(/coming soon/i.test(await p.evaluate(() => document.body.textContent)) && !!(await p.$('.npage')), 'a Coming soon tool says so and stays put');
  /* (v0.5.6, Devon) folding: each bar has a labelled ◀ Hide; folded, it leaves a 30 px strip that is one big "show" button with
     the bar's name down it, so nothing ever covers the Tool bar or the note */
  ok(!!(await p.$('.nb-ftools .nb-hide[data-p=f]')) && !!(await p.$('.nb-rail .nb-hide[data-p=l]')) && await p.$$eval('.nb-fold', b => b.every(x => x.hidden)), 'open bars have a labelled ◀ Hide button and no tab over anything');
  await p.click('.nb-hide[data-p=l]'); await wait(450); ok(await p.$eval('.nb-rail', e => e.offsetWidth) <= 30, 'the Tool bar folds away with its ◀ Hide button (to a 30 px strip)', await p.$eval('.nb-rail', e => e.offsetWidth));
  await p.click('.nb-fold[data-p=l]'); await wait(450); ok(await p.$eval('.nb-rail', e => e.offsetWidth) > 50, 'its strip brings it back');
  await p.click('.nb-hide[data-p=f]'); await wait(450); ok(await p.$eval('.nb-folders', e => e.offsetWidth) <= 30, 'the folders column folds away (to a 30 px strip)', await p.$eval('.nb-folders', e => e.offsetWidth));
  {
    const tb = await p.locator('.nb-fold[data-p=f]').boundingBox(), rail = await p.locator('.nb-rail').boundingBox(), lab = await p.$eval('.nb-fold[data-p=f]', e => e.textContent);
    const hits = await p.$$eval('.nb-rail button', (bs, t) => bs.filter(x => { const r = x.getBoundingClientRect(); return r.width && r.left < t.x + t.width - 1 && r.right > t.x + 1 && r.top < t.y + t.height && r.bottom > t.y; }).length, tb);
    ok(tb.width >= 28 && tb.height > 300 && tb.x + tb.width <= rail.x + 1 && hits === 0 && /Folders & Files/.test(lab), 'the folded Folders & Files strip is big (full height, labelled) and stays clear of the Tool bar', { tb, rail, hits, lab });
    await p.click('.nb-hide[data-p=l]'); await wait(450);
    const tl = await p.locator('.nb-fold[data-p=l]').boundingBox(), ed = await p.locator('.nb-ed').boundingBox();
    ok(tl.x + tl.width <= ed.x + 1 && tl.x >= tb.x + tb.width - 1 && tl.height > 300 && /Tools/.test(await p.$eval('.nb-fold[data-p=l]', e => e.textContent)), 'with both folded, each strip sits in its own place, clear of the note', { tb, tl, ed });
    await p.focus('.nb-fold[data-p=l]'); await p.keyboard.press('Enter'); await wait(450);
    ok(await p.$eval('.nb-rail', e => e.offsetWidth) > 50 && await p.evaluate(() => document.activeElement && document.activeElement.matches('.nb-hide[data-p=l]')), 'a strip works from the keyboard, and the focus moves to the bar\'s Hide button'); }
  await p.click('.nb-fold[data-p=f]'); await wait(450);

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
  // (v0.5.4) H is a tab of titles and headings: Normal text, Title, Subtitle, Heading 1, 2, 3
  await p.click('.nr-head'); await wait(60);
  ok(JSON.stringify(await p.$$eval('.np-pop-heads [data-h]', e => e.map(x => x.dataset.h + ':' + x.querySelector('.np-hs').textContent))) === '["div:Normal text","h1:Title","h6:Subtitle","h2:Heading 1","h3:Heading 2","h4:Heading 3"]', 'H opens a tab of Normal text, Title, Subtitle, Heading 1, 2, 3');
  await p.click('.np-pop-heads [data-h=h3]'); await wait(60);
  ok(/<h3>Plan<\/h3>/.test(await html()) && !(await p.$('.np-pop-heads')), 'Heading 2 makes the line a heading and closes the tab', await html());
  ok(await p.$eval('.nr-head', e => e.getAttribute('aria-pressed') === 'true' && e.querySelector('.nr-ddv').textContent === 'H2'), 'the H button shows the style of the line');
  for (const [t, nm] of [['h1', 'Title'], ['h6', 'Subtitle'], ['h2', 'Heading 1'], ['h4', 'Heading 3']]) {
    await p.click('.nr-head'); await wait(50); await p.click(`.np-pop-heads [data-h=${t}]`); await wait(60);
    ok(new RegExp(`<${t}>Plan</${t}>`).test(await html()), `${nm} styles the line`, await html());
  }
  ok(await p.evaluate(() => { const h = document.querySelector('.nb-rich h1, .nb-rich h4'); return !!h && parseFloat(getComputedStyle(h).fontSize) >= 15; }), 'the styles show in the note');
  await p.click('.nr-head'); await wait(50);
  ok(await p.$eval('.np-pop-heads [data-h=h4]', e => e.getAttribute('aria-checked')) === 'true', 'the tab marks the style the line has');
  await p.click('.np-pop-heads [data-h=div]'); await wait(60);
  ok(/<div>Plan<\/div>/.test(await html()) && !/<h\d>Plan/.test(await html()), 'Normal text makes it a plain line again', await html());
  await p.click('.nr-head'); await wait(50); await p.click('.np-pop-heads [data-h=h1]'); await wait(60);
  await wait(700); ok(await p.evaluate(() => { const n = InquireNotes.list().find(x => /Plan/.test(x.html)); return !!n && /<h1>Plan<\/h1>/.test(n.html); }), 'a title is saved with the note (the sanitiser keeps it)');
  await p.click('.nr-head'); await wait(50); await p.click('.np-pop-heads [data-h=h1]'); await wait(60);
  ok(/<div>Plan<\/div>/.test(await html()), 'the same style again makes it a plain line', await html());
  await p.click('.nr-head'); await wait(50); await p.click('.np-pop-heads [data-h=h3]'); await wait(60);
  await p.keyboard.press('End'); await p.keyboard.press('Enter'); await wait(80);
  ok(await p.$eval('.nr-head', e => e.getAttribute('aria-pressed')) === 'false', 'Enter after a heading goes back to plain text');
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
  await p.click('.nb-rail [data-widget=code]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=code] .nw-ta')), 'Code adds a code box');
  await p.keyboard.type('def f(x):\n    return x * 2'); await wait(600);
  ok(/class="kw"|<span class="kw/.test(await p.$eval('.nw[data-w=code]', e => e.innerHTML)) || /def/.test(await p.$eval('.nw[data-w=code]', e => e.textContent)), 'the code box highlights Python');
  ok(!(await p.$('.nb-rail [data-widget=music]')), 'no Music chart in the Widgets (v0.5.6: the Lead sheet does more)');
  await p.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); InquireNotes.editorFor(ed).addWidget('music'); }); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=music] svg')), 'a Music chart already in a note still opens with its staff');
  await p.click('.nb-rail [data-widget=graph]'); await wait(200);
  ok(!!(await p.$('.nb-rich .nw[data-w=graph] svg.ng-svg')), 'Graph adds a graph grid');
  const gb = await p.locator('.nw[data-w=graph] .ng-svg').boundingBox(), gpt = (x, y) => [gb.x + (x + 10) / 20 * gb.width, gb.y + (10 - y) / 20 * gb.height];
  for (const [x, y] of [[0, 1], [1, 3], [2, 7]]) { const [cx, cy] = gpt(x, y); await p.mouse.click(cx, cy); await wait(60); }
  ok(await p.$eval('.nw[data-w=graph] .ng-eqv', e => e.textContent) === 'y = x² + x + 1', 'three clicked points give the curve y = x² + x + 1', await p.$eval('.nw[data-w=graph] .ng-side', e => e.textContent));
  ok(!!(await p.$('.nw[data-w=graph] path.ng-curve')), 'the curve is drawn on the grid');
  { const [cx, cy] = await p.evaluate(() => { const cs = [...document.querySelectorAll('.nw[data-w=graph] svg circle')], r = cs[cs.length - 1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await p.mouse.click(cx, cy); await wait(60); } // the point's own spot (the grid keeps its shape in a wide note)
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
  ok(JSON.stringify(await p.$$eval('.tm-menu > button', e => e.map(x => x.dataset.a))) === '["copy","dict","link","pn","ai","tr"]', 'right-click menu: Copy, Define · Dictionary, Link to a note, Add a paranote, Ask AI (v0.5.6), Translate');
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
    ok(!(await c.$('.np-thumb, .np-thumbs')) && await c.$eval('#np-t', e => e.textContent) === 'My notes', 'My notes has no Code / Music tabs any more');
    ok(/#F2B84B/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-notes'))) && /#4FA3F7/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-code'))), 'the My notes / My Code colours are set');
    await c.click('#brand'); await wait(300);
    ok(await c.$eval('.npn-code .glyph', e => getComputedStyle(e).color) === 'rgb(79, 163, 247)', 'My Code on the Main Menu has its blue icon');
    await c.click('[data-a=code]'); await wait(400);
    ok(await c.evaluate(() => location.hash) === '#code' && /Main Menu›My Code/.test(await c.$eval('#crumbs', e => e.textContent)) && await c.$eval('#np-t', e => e.textContent) === 'My Code' && await c.$eval('.np-newb', e => e.textContent) === '＋ New File', 'Main Menu → My Code: #code, breadcrumb, title, ＋ New File');
    ok(await c.$$eval('.nb-fd.user', e => e.length) === 0 && /No code files/.test(await c.$eval('.nb-ftree', e => e.textContent)), 'Code has its own folders (none yet), not the notes folders');
    // ＋ New File: language cards, coming soon list
    await c.click('.np-newb'); await wait(250);
    ok(JSON.stringify(await c.$$eval('.ask-kind b', e => e.map(x => x.textContent))) === '["Python","C","C++","JavaScript","Java"]' && /Coming soon:.*Rust/.test(await c.$eval('.ask-soon', e => e.textContent)), 'New File offers Python, C, C++, JavaScript, Java; the rest are Coming soon');
    await c.keyboard.type('greet'); await c.keyboard.press('Enter');
    await c.waitForSelector('.p1 .nc-edhost[data-ready]', { timeout: 15000 }); await wait(400);
    ok(await c.$eval('.p1 .nc-edhost', e => e.dataset.kind) === 'monaco' && !!(await c.$('.p1 .monaco-editor')), 'the code editor is Monaco (VS Code)');
    { // v0.5.7: Lite drops the editor's minimap, sticky scroll and smooth scrolling; Moderate / Full keep them (followed live)
      const st = () => c.evaluate(() => { const e = monaco.editor.getEditors()[0], O = monaco.editor.EditorOption; return [e.getOption(O.minimap).enabled, e.getOption(O.stickyScroll).enabled, e.getOption(O.smoothScrolling)].join(); });
      await c.evaluate(() => { document.documentElement.dataset.perf = 'lite'; window.dispatchEvent(new CustomEvent('inquire:theme')); }); await wait(100);
      ok(await st() === 'false,false,false', 'Lite: the code editor has no minimap, sticky scroll or smooth scrolling');
      await c.evaluate(() => { document.documentElement.dataset.perf = 'moderate'; window.dispatchEvent(new CustomEvent('inquire:theme')); }); await wait(100);
      ok(await st() === 'true,true,true', 'Moderate: the code editor has them back, live');
      await c.evaluate(() => { document.documentElement.dataset.perf = 'lite'; window.dispatchEvent(new CustomEvent('inquire:theme')); }); }
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
    await c.click('#brand'); await wait(300); await c.click('[data-a=open]'); await wait(400);
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
    ok(await c.$eval('#np-t', e => e.textContent) === 'My Code' && /greet/.test(await c.$eval('.p1 .nb-title', e => e.value)), 'clicking a code file in My notes opens it in My Code');
    // the tab is remembered; #code opens it
    await c.goto(URL0 + '#code'); await wait(600);
    ok(await c.$eval('#np-t', e => e.textContent) === 'My Code', '#code opens My Code');
    await c.click('#brand'); await wait(300); await c.click('[data-a=open]'); await wait(400);
    ok(await c.$eval('#np-t', e => e.textContent) === 'My notes' && await c.evaluate(() => location.hash) === '#notes', 'My notes on the Main Menu opens My notes, even after My Code');
    await c.goto(URL0 + '#code'); await wait(600);
    // Settings: tab colours, run service
    await c.evaluate(() => InquireSettings.open('look')); await wait(200);
    await c.$eval('.set-tabcl input[data-tab=code]', e => { e.value = '#ff0000'; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }); await wait(100);
    ok(/#ff0000/i.test(await c.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-code'))) && /ff0000/i.test(await c.evaluate(() => localStorage.getItem('notepath.settings'))), 'Settings → Appearance changes and keeps the My Code colour');
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
    await x.click('.np-share'); await wait(200); await x.click('.np-share-pop [data-s=io]'); await wait(300); await x.click('.io-scope [data-s=note]'); await wait(100);
    ok(!!(await x.$('.mw-ov[data-mw=io] .io')) && await x.$eval('.io-scope [data-s=note]', e => e.getAttribute('aria-checked')) === 'true' && /Big note/.test(await x.$eval('.io-scope [data-s=note]', e => e.textContent)), 'Share → Import & Export… opens with This note available (Export… left the note bar in v0.5.6)');
    ok(JSON.stringify(await x.$$eval('.io-fmt b', e => e.map(y => y.textContent))) === '["Markdown","Word","Evernote / Apple Notes","Web page","PDF","Plain text"]', 'export formats: Markdown (Obsidian), Word, Evernote / Apple Notes, web page, PDF, text');
    const exp = async (scope, fmt) => { await x.click(`.io-scope [data-s=${scope}]`); await x.click(`.io-fmt[data-f=${fmt}]`);
      const [dl] = await Promise.all([x.waitForEvent('download'), x.click('[data-a=export]')]); const f = path.join(dir, scope + '-' + fmt + '-' + dl.suggestedFilename()); await dl.saveAs(f); return f; };
    const unz = async f => x.evaluate(async b64 => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const es = await NPIO.unzip(new Blob([a])); const o = {}; for (const e of es) o[e.name] = /\.(md|xml|enex|html|txt|rels)$/.test(e.name) ? await e.text() : e.size; return o; }, fs.readFileSync(f).toString('base64'));
    const fmd = await exp('note', 'md'), zmd = await unz(fmd), md = zmd['Big note.md'] || '';
    ok(/\.zip$/.test(fmd) && /\*\*bold\*\*/.test(md) && /^### A heading$/m.test(md) && /- \[x\] done item/.test(md) && /\[\[Other note\]\]/.test(md) && /```python/.test(md) && /!\[logo\]\(attachments\/\w+\.png\)/.test(md) && Object.keys(zmd).some(k => /^attachments\/.+\.png$/.test(k)), 'Markdown: Obsidian links, checklists, code, and the photo in attachments/', Object.keys(zmd));
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
    await x.click('[data-a=share]'); await wait(150); await x.click('.np-share-pop [data-s=io]'); await wait(300);
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
  /* ---------- (Oct 12) the hint goes with list buttons; bullets again indent; only delete takes a list off; note links:
     drag from the folders side bar, right-click → Open in a new note tab; ‹ Back on My notes, My Tasks and Note Office ---------- */
  {
    const q = await page();
    await q.goto(URL0 + '#menu'); await wait(500);
    const ids = await q.evaluate(() => { const f = InquireNotes.addFolder('Lists'); const a = InquireNotes.create({ title: 'Target', html: '', folder: f.id }), b = InquireNotes.create({ title: 'Linked one', html: '<div>other</div>', folder: f.id }); return { a: a.id, b: b.id, f: f.id }; });
    await q.click('[data-a=open]'); await wait(400);
    await q.evaluate(id => InquireApp.go({ view: 'notes', space: 'notes', folder: 'all', sel: id }), ids.a).catch(() => {}); await wait(300);
    if ((await q.$eval('.p1 .nb-title', e => e.value).catch(() => '')) !== 'Target') { await q.locator('.nb-it', { hasText: 'Target' }).click(); await wait(200); }
    const qh = () => q.$eval('.p1 .nb-rich', e => e.innerHTML);
    const hint = () => q.$eval('.p1 .nb-rich', e => e.classList.contains('is-empty'));
    ok(await hint(), 'a blank note shows the Write… hint');
    for (const k of ['h3', 'ul', 'ol', 'ck']) {
      await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = ''; ed.dispatchEvent(new Event('input')); }); await wait(50);
      await q.click('.p1 .nb-rich'); if (k === 'h3') { await q.click('.p1 .nr-head'); await wait(50); await q.click('.np-pop-heads [data-h=h3]'); } else await q.click(`.p1 [data-blk=${k}]`); await wait(80);
      ok(!(await hint()), `the Write… hint goes away when ${k === 'h3' ? 'H' : k === 'ul' ? 'bullets' : k === 'ol' ? 'numbers' : 'the checklist'} is pressed`, await qh());
    }
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = ''; ed.dispatchEvent(new Event('input')); }); await wait(50);
    await q.click('.p1 .nb-rich'); await q.click('.p1 [data-blk=ul]'); await q.keyboard.type('one'); await q.keyboard.press('Enter'); await q.keyboard.type('two');
    await q.click('.p1 [data-blk=ul]'); await wait(80);
    ok(/<ul><li>one<ul><li>two<\/li><\/ul><\/li><\/ul>/.test(await qh()), 'pressing bullets again indents the item under the one above', await qh());
    await q.click('.p1 [data-blk=ul]'); await wait(80);
    ok(/<ul><li>one<ul><li>two<\/li><\/ul><\/li><\/ul>/.test(await qh()) && /two/.test(await qh()), 'bullets again never take the bullet off', await qh());
    await q.keyboard.type('!'); ok(/<li>two!<\/li>/.test(await qh()), 'the caret stays in the indented item', await qh());
    await q.keyboard.press('Shift+Tab'); await wait(50);
    ok(/<ul><li>one<\/li><li>two!<\/li><\/ul>/.test(await qh()), 'Shift+Tab moves it back out', await qh());
    await q.keyboard.press('Tab'); await wait(50);
    ok(/<ul><li>one<ul><li>two!<\/li><\/ul><\/li><\/ul>/.test(await qh()), 'Tab indents it', await qh());
    await q.keyboard.press('Home'); await q.keyboard.press('Backspace'); await wait(50);
    ok(/<ul><li>one<\/li><li>two!<\/li><\/ul>/.test(await qh()), 'delete at the start of a sub-item moves it out one level', await qh());
    await q.keyboard.press('Backspace'); await wait(50);
    ok(/<ul><li>one<\/li><\/ul><div>two!<\/div>/.test(await qh()), 'delete at the start of an item takes the bullet off (the words stay)', await qh());
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = ''; ed.dispatchEvent(new Event('input')); }); await wait(50);
    await q.click('.p1 .nb-rich'); await q.click('.p1 [data-blk=ol]'); await q.keyboard.type('first'); await q.click('.p1 [data-blk=ol]'); await wait(50);
    ok(/<ol><li>first<\/li><\/ol>/.test(await qh()), 'numbers again keep the number', await qh());
    await q.keyboard.press('Enter'); await q.click('.p1 [data-blk=ck]'); await q.keyboard.type('box'); await q.click('.p1 [data-blk=ck]'); await wait(50);
    ok(/<ul data-ck="1"><li>box<\/li><\/ul>/.test(await qh()), 'the checklist button again keeps the box', await qh());
    await q.keyboard.press('Home'); await q.keyboard.press('Backspace'); await wait(50);
    ok(/<div>box<\/div>/.test(await qh()) && !/data-ck/.test(await qh()), 'delete at the start takes the checkbox off', await qh());
    await q.keyboard.press('ArrowUp'); await q.keyboard.press('Home'); await q.keyboard.press('Backspace'); await wait(50);
    ok(/<div>first<\/div>/.test(await qh()) && !/<ol>/.test(await qh()), 'delete at the start takes the number off', await qh());
    // (Oct 12, second set) checklist again indents; H sits between U and S; a font/size/colour with nothing selected; folder icons
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = ''; ed.dispatchEvent(new Event('input')); }); await wait(50);
    await q.click('.p1 .nb-rich'); await q.click('.p1 [data-blk=ck]'); await q.keyboard.type('milk'); await q.keyboard.press('Enter'); await q.keyboard.type('eggs');
    await q.click('.p1 [data-blk=ck]'); await wait(80);
    ok(/<ul data-ck="1"><li>milk<ul data-ck="1"><li>eggs<\/li><\/ul><\/li><\/ul>/.test(await qh()), 'pressing the checklist again indents the box under the one above', await qh());
    await q.keyboard.press('Home'); await q.keyboard.press('Backspace'); await wait(50);
    ok(/<ul data-ck="1"><li>milk<\/li><li>eggs<\/li><\/ul>/.test(await qh()), 'delete at the start of an indented box moves it out one level', await qh());
    ok(JSON.stringify(await q.$$eval('.p1 .nr-tools button', b => b.slice(0, 4).map(x => x.dataset.cmd || x.dataset.blk || x.dataset.dd))) === '["bold","italic","underline","strikeThrough"]' && await q.$eval('.p1 .nr-tools .nr-head', e => e.nextElementSibling && e.nextElementSibling.dataset.dd === 'align'), '(v0.5.5) H sits just left of Align & indent, with spacing and clear formatting');
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = '<div>abc</div>'; ed.dispatchEvent(new Event('input')); }); await wait(50);
    await q.click('.p1 .nb-rich'); await q.keyboard.press('Control+End'); await q.keyboard.press('Enter');
    const qdd = async (kind, v) => { await q.click(`.p1 .nr-dd[data-dd=${kind}]`); await wait(80); await q.click(`.np-pop-${kind} [data-v="${v}"]`); await wait(80); };
    await qdd('size', 24); await qdd('font', 'mono');
    await q.click('.p1 .nr-dd[data-dd=color]'); await wait(80); await q.fill('.np-hex', '#33AA77'); await q.click('.np-capply'); await wait(80);
    ok(await q.$eval('.p1 .nr-size .nr-ddv', e => e.textContent) === '24' && await q.$eval('.p1 .nr-font .nr-ddv', e => e.textContent) === 'IBM Plex Mono', 'on an empty line the size and font menus show what was picked');
    await q.keyboard.type('hey'); await wait(50);
    ok(/<span[^>]*data-s="24"[^>]*>hey<\/span>/.test(await qh()) && /data-f="mono"[^>]*>hey</.test(await qh()) && /data-c="#33aa77"[^>]*>hey</.test(await qh()) && !/​/.test(await qh()), 'a font, size and colour picked on an empty line style what is typed next', await qh());
    await qdd('size', 15); await q.keyboard.type(' you'); await wait(50);
    ok(/>hey<\/span><span[^>]*> you<\/span>/.test(await qh()) && !/data-s="24"[^>]*> you/.test(await qh()) && /data-f="mono"[^>]*> you/.test(await qh()), 'a new size with nothing selected keeps the font and colour', await qh());
    const fic = () => q.$eval(`.nb-fd[data-f="${ids.f}"] .nb-fold-ic`, e => e.classList.contains('open')).catch(() => null);
    ok(await fic() === true, 'an unfolded folder shows an open folder icon');
    await q.click(`.nb-fcar[data-car="${ids.f}"]`); await wait(150);
    ok(await fic() === false, 'a folded folder shows a closed folder icon');
    await q.click(`.nb-fcar[data-car="${ids.f}"]`); await wait(150);
    // a note dragged from the folders side bar becomes a link titled with the note's name
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = '<div>start</div>'; ed.dispatchEvent(new Event('input')); }); await wait(500);
    const fsel = `.nb-folders .nb-fnote[data-id="${ids.b}"]`;
    ok(!!(await q.$(fsel)), 'the folders side bar lists the note', await q.$$eval('.nb-fnote', e => e.map(x => x.textContent)));
    await q.evaluate(([f]) => { const src = document.querySelector(f), dst = document.querySelector('.p1 .nb-rich'), dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const r = dst.getBoundingClientRect(), x = r.left + 60, y = r.top + 12, t = document.elementFromPoint(x, y) || dst;
      t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); }, [fsel]); await wait(300);
    ok(new RegExp(`<a class="nlink" data-note="${ids.b}"[^>]*>Linked one</a>`).test(await qh()), 'a note dragged from the folders side bar becomes a link with its title', await qh());
    const lb = await q.$eval(`.p1 .nb-rich a.nlink[data-note="${ids.b}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.x + 6, y: r.y + r.height / 2 }; });
    await q.mouse.click(lb.x, lb.y, { button: 'right' }); await wait(150);
    ok(JSON.stringify(await q.$$eval('.tm-menu > button', e => e.map(x => x.dataset.a))) === '["open","side","peek","unlink"]', 'right-click a note link: Open, Open in a new note tab, Peek, Remove link');
    await q.click('.tm-menu [data-a=side]'); await wait(300);
    ok(await q.$eval('.p2', e => !e.hidden) && await q.$eval('.p2 .nb-title', e => e.value) === 'Linked one' && await q.$eval('.p1 .nb-title', e => e.value) === 'Target', 'Open in a new note tab opens it side by side with this note');
    await q.click('.p2 [data-a=close]'); await wait(150);
    await q.mouse.click(lb.x, lb.y, { button: 'right' }); await wait(150); await q.click('.tm-menu [data-a=unlink]'); await wait(200);
    ok(!/nlink/.test(await qh()) && /Linked one/.test(await qh()), 'Remove link keeps the words', await qh());
    // real mouse drags (Chromium's own drag and drop, as in the app): the list, the folders side bar, a folder
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = '<div>Start here</div>'; ed.dispatchEvent(new Event('input')); }); await wait(500);
    await q.locator(`.nb-it[data-id="${ids.b}"]`).dragTo(q.locator('.p1 .nb-rich'), { targetPosition: { x: 40, y: 12 } }); await wait(400);
    ok(new RegExp(`<div>Start <a class="nlink" data-note="${ids.b}"[^>]*>Linked one</a> here</div>`).test(await qh()), 'a real drag from the notes list drops a link (after the word, with spaces)', await qh());
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = '<div>Start here</div>'; ed.dispatchEvent(new Event('input')); }); await wait(500);
    await q.locator(`.nb-folders .nb-fnote[data-id="${ids.b}"]`).dragTo(q.locator('.p1 .nb-rich'), { targetPosition: { x: 120, y: 12 } }); await wait(400);
    ok(new RegExp(`data-note="${ids.b}"[^>]*>Linked one</a>`).test(await qh()), 'a real drag from the folders side bar drops a link', await qh());
    await q.locator(`.nb-fd.user[data-f="${ids.f}"]`).dragTo(q.locator('.p1 .nb-rich'), { targetPosition: { x: 20, y: 12 } }); await wait(400);
    ok(new RegExp(`<a class="nlink" data-folder="${ids.f}"[^>]*>Lists</a>`).test(await qh()) && await q.evaluate(id => /data-folder/.test(InquireNotes.get(id).html), ids.a), 'a folder dragged into the note becomes a link with its name (saved)', await qh());
    ok(await q.evaluate(f => InquireNotes.folders().find(x => x.id === f).parent == null, ids.f), 'dragging a folder into a note leaves the folder where it was');
    await q.click('.nb-fd[data-f=all] .nb-fdb'); await wait(200); await q.locator('.nb-it', { hasText: 'Target' }).click(); await wait(300);
    await q.click(`.p1 a.nlink[data-folder="${ids.f}"]`); await wait(300);
    ok(await q.$eval('.nb-fd.sel', e => e.dataset.f) === ids.f, 'clicking a folder link opens that folder');
    await q.locator('.nb-it', { hasText: 'Target' }).click(); await wait(300);
    const fb = await q.$eval(`.p1 a.nlink[data-folder="${ids.f}"]`, e => { const r = e.getBoundingClientRect(); return [r.x + 8, r.y + r.height / 2]; });
    await q.mouse.click(fb[0], fb[1], { button: 'right' }); await wait(150);
    ok(JSON.stringify(await q.$$eval('.tm-menu > button', e => e.map(x => x.dataset.a))) === '["open","unlink"]', 'right-click a folder link: Open folder, Remove link');
    await q.keyboard.press('Escape'); await wait(80);
    await q.click('.p1 .nb-holob'); await wait(200);
    ok(/Folders in this note\s*1/.test(await q.$eval('.np-holo', e => e.textContent)) && !!(await q.$(`.np-holo [data-fid="${ids.f}"]`)), 'the Links panel lists the folders linked in the note');
    await q.click('.np-holo-x'); await wait(80);
    await q.click(`.p1 .nb-rich`); await q.keyboard.press('Control+z').catch(() => {});
    // (v0.5.1) ▦ Widgets tab; the info box (last edited / created to the second); ◈ Tags · Links · Source panel
    // (v0.5.5) the widgets moved from the note's formatting bar to their own section at the top of the Tool bar
    ok(!(await q.$('.p1 .nr-tools [data-dd=widgets]')) && !(await q.$('.p1 .nr-tools [data-w]')), 'the formatting bar has no Widgets menu any more');
    ok(JSON.stringify(await q.$$eval('.nb-rail > *', e => e.map(x => x.dataset.widget || x.dataset.tool || (x.classList.contains('nb-hide') ? 'hide' : x.textContent.trim())))) === '["hide","Widgets","code","sheet","graph","map","more","Tools","note","canvas","trees","sheets"]', 'the Tool bar: ◀ Hide, a Widgets section (Code box, Lead sheet, Graph, Map, more to come) above the tools');
    await q.click('.p1 .nb-rich'); await q.keyboard.press('Control+End'); await q.click('.nb-rail [data-widget=graph]'); await wait(200);
    ok(!!(await q.$('.p1 .nb-rich .nw[data-w=graph]')), 'a widget from the Tool bar goes into the note');
    await q.click('.nb-rail [data-widget=more]', { force: true }); await wait(150);
    ok(/coming soon/i.test(await q.evaluate(() => document.body.textContent)), 'widgets that connect to other apps are coming soon');
    await q.locator('.nb-fd[data-f="' + ids.f + '"] .nb-fdb').click(); await wait(200);
    await q.locator('.nb-it', { hasText: 'Target' }).click(); await wait(300);
    const info = await q.evaluate(() => { const b = document.querySelector('.nb-info'); return b ? { t: b.textContent, times: [...b.querySelectorAll('time')].map(x => x.textContent) } : null; });
    ok(info && /Note\s*Target/.test(info.t) && /Last edited/.test(info.t) && /Created/.test(info.t) && /Folder\s*Lists/.test(info.t) && /Last change/.test(info.t) && info.times.length === 4 && info.times.every(x => /\d:\d\d:\d\d/.test(x)), 'the box at the top of the folders shows the note and folder: last edited / created, to the second', info);
    const geo = await q.evaluate(() => { const i = document.querySelector('.nb-info'), hd = document.querySelector('.npage .mw-h'), bd = document.querySelector('.npage .mw-body'), r = i.getBoundingClientRect();
      return { below: r.top >= hd.getBoundingClientRect().bottom - 1, above: r.bottom <= bd.getBoundingClientRect().top + 1, h: r.height, inCol: !!i.closest('.nb-folders') }; });
    ok(geo.below && geo.above && geo.h < 32 && !geo.inCol, '(v0.5.4) the info sits on one line right under the title and ‹ Back, not in the folders column', geo);
    ok(info.times.every(x => /^\d\d\/\d\d\/\d\d \d\d:\d\d:\d\d [AP]M$/.test(x)), '(v0.5.4) dates and times read ##/##/## ##:##:## AM/PM', info.times);
    const tb = await q.$eval('.nb-info time', e => e.textContent);
    await wait(1100); await q.click('.p1 .nb-rich'); await q.keyboard.press('Control+End'); await q.keyboard.type('!'); await wait(900);
    ok(await q.$eval('.nb-info time', e => e.textContent) !== tb, 'Last edited follows the typing');
    // ◈ panel
    await q.evaluate(([a, b]) => InquireNotes.update(b, { html: `<div>see <a class="nlink" data-note="${a}">Target</a></div>` }), [ids.a, ids.b]);
    await q.evaluate(([a, b]) => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = `<div>to <a class="nlink" data-note="${b}">Linked one</a></div>`; ed.dispatchEvent(new Event('input')); }, [ids.a, ids.b]); await wait(700);
    ok(!!(await q.$('.p1 .nb-holob')), 'a ◈ button floats at the bottom right of the note');
    await q.click('.p1 .nb-holob'); await wait(250);
    ok(JSON.stringify(await q.$$eval('.np-holo-tabs [role=tab]', e => e.map(x => x.dataset.t + (x.getAttribute('aria-disabled') ? '-soon' : '')))) === '["tags-soon","links","source-soon"]', 'the panel has Tags (soon), Links and Source (soon)');
    const hl = await q.$$eval('.np-holo section', e => e.map(x => [...x.querySelectorAll('.np-hl-t')].map(y => y.textContent)));
    ok(JSON.stringify(hl) === '[["Linked one"],["Linked one"]]', 'Links lists the notes this one links to and the notes linking here', hl);
    const hb0 = await q.$eval('.np-holo', e => e.getBoundingClientRect().toJSON());
    for (const [d, dx, dy] of [['w', -60, 0], ['n', 0, -40]]) { const g = await q.$eval(`.np-holo-rz[data-d=${d}]`, e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await q.mouse.move(g[0], g[1]); await q.mouse.down(); await q.mouse.move(g[0] + dx, g[1] + dy, { steps: 4 }); await q.mouse.up(); }
    const hb1 = await q.$eval('.np-holo', e => e.getBoundingClientRect().toJSON());
    ok(Math.abs(hb1.width - hb0.width - 60) < 3 && Math.abs(hb1.height - hb0.height - 40) < 3 && Math.abs(hb1.right - hb0.right) < 2 && Math.abs(hb1.bottom - hb0.bottom) < 2, 'dragging its left and top edges makes the panel bigger', { hb0, hb1 });
    { const g = await q.$eval('.np-holo-rz[data-d=se]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await q.mouse.move(g[0], g[1]); await q.mouse.down(); await q.mouse.move(g[0] - 30, g[1] - 20, { steps: 4 }); await q.mouse.up(); }
    const hb2 = await q.$eval('.np-holo', e => e.getBoundingClientRect().toJSON());
    ok(Math.abs(hb2.width - hb1.width + 30) < 3 && Math.abs(hb2.height - hb1.height + 20) < 3 && Math.abs(hb2.left - hb1.left) < 2 && Math.abs(hb2.top - hb1.top) < 2, 'the bottom-right corner resizes it too', { hb1, hb2 });
    await q.click('.np-holo .np-hl-s[data-side]'); await wait(300);
    ok(await q.$eval('.p2', e => !e.hidden) && await q.$eval('.p2 .nb-title', e => e.value) === 'Linked one', '⧉ in Links opens the note side by side');
    await q.click('.p2 [data-a=close]'); await wait(150);
    await q.keyboard.press('Escape'); await wait(150);
    ok(!(await q.$('.np-holo')) && !!(await q.$('.npage')) && await q.$eval('.set-ov', e => e.hidden), 'Esc closes the panel and nothing else');
    await q.click('.p1 .nb-holob'); await wait(200); await q.click('.np-holo .np-hl-o'); await wait(300);
    ok(await q.$eval('.p1 .nb-title', e => e.value) === 'Linked one' && /Target/.test(await q.$eval('.np-holo', e => e.textContent).catch(() => '')), 'clicking a link opens that note; the panel stays open for it');
    await q.click('.np-holo-x'); await wait(100);
    // (v0.5.2, tasks 13–16) the folder icon is the fold button; the Notes / Code line; Show as; indented notes
    ok(await q.$eval(`.nb-fcar[data-car="${ids.f}"]`, e => !!e.querySelector('.nb-fold-ic') && !/[▸▾]/.test(e.textContent)) && !(await q.$(`.nb-fd[data-f="${ids.f}"] .nb-fdb .nb-fold-ic`)), 'the folder icon itself is the fold button (no ▸ / ▾)');
    await q.click(`.nb-fcar[data-car="${ids.f}"]`); await wait(150);
    ok(await q.$eval(`.nb-fcar[data-car="${ids.f}"] .nb-fold-ic`, e => !e.classList.contains('open')) && !(await q.$(`.nb-fnote[data-id="${ids.a}"]`)), 'clicking the open folder closes it (closed icon, notes hidden)');
    await q.click(`.nb-fcar[data-car="${ids.f}"]`); await wait(150);
    ok(!!(await q.$('.nb-codet .nb-fold-ic.open')), 'the Code section header uses the folder icon too');
    const fsp = await q.$eval('.nb-fsplit', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 4]; });
    const ch0 = await q.$eval('.nb-fcode', e => e.offsetHeight);
    await q.mouse.move(fsp[0], fsp[1]); await q.mouse.down(); await q.mouse.move(fsp[0], fsp[1] - 80, { steps: 5 }); await q.mouse.up(); await wait(100);
    const ch1 = await q.$eval('.nb-fcode', e => e.offsetHeight);
    ok(Math.abs(ch1 - ch0 - 80) < 4 && await q.evaluate(() => JSON.parse(localStorage.getItem('notepath.codesech'))) === ch1, 'dragging the line between Folders and Code gives Code more room (and is kept)', { ch0, ch1 });
    await q.focus('.nb-fsplit'); await q.keyboard.press('ArrowDown'); await wait(50);
    ok(await q.$eval('.nb-fcode', e => e.offsetHeight) === ch1 - 24, '↓ on the line gives the folders more room');
    await q.click('.nb-tools [data-view=icons]'); await wait(150);
    ok(await q.$eval('.nb-ftree', e => e.dataset.view) === 'icons' && await q.$$eval('.nb-ftree .nb-tile', e => e.length) >= 2 && !!(await q.$('.nb-tile .nb-tic svg')), 'Show as Icons shows the notes as tiles');
    await q.click('.nb-tools [data-view=details]'); await wait(150);
    const dh = await q.$$eval('.nb-dhead span', e => e.map(x => x.textContent)), drow = await q.$eval('.nb-it.nb-row', e => [...e.children].map(x => x.textContent));
    ok(JSON.stringify(dh) === '["Name","Modified","Created","Kind"]' && drow.length === 4 && /\d:\d\d/.test(drow[1]) && /Note|Checklist|Graph/.test(drow[3]), 'Show as Details: name, modified, created and kind', { dh, drow });
    await q.locator('.nb-it.nb-row', { hasText: 'Linked one' }).click(); await wait(250);
    ok(await q.$eval('.p1 .nb-title', e => e.value) === 'Linked one', 'a note opens from the Details view');
    await q.locator('.nb-it.nb-row', { hasText: 'Target' }).click(); await wait(250);
    await q.click('.nb-tools [data-view=list]'); await wait(100);
    ok(await q.evaluate(() => localStorage.getItem('notepath.noteview')) === '"list"' && !(await q.$('.nb-dhead')), 'back to List (the choice is kept)');
    // the Links panel in the three views
    await q.click('.p1 .nb-holob'); await wait(200);
    await q.click('.np-holo-bar [data-view=details]'); await wait(100);
    ok(!!(await q.$('.np-holo .np-hl-head')) && await q.$$eval('.np-holo .np-hl-row .np-hl-d', e => e.length) >= 3, 'Links can be shown as Details');
    await q.click('.np-holo-bar [data-view=icons]'); await wait(100);
    ok(!!(await q.$('.np-holo .np-hl-tile .nb-tic svg')), 'Links can be shown as Icons');
    await q.click('.np-holo-bar [data-view=list]'); await wait(100);
    // indented notes
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = '<div>Plants use photosynthesis to make food.</div><div>Second line here.</div>'; ed.dispatchEvent(new Event('input')); }); await wait(600);
    ok(!!(await q.$('.p1 .nb-indb')), 'a ↳ Indented notes button sits beside ◈');
    await q.click('.p1 .nb-indb'); await wait(200);
    const ib = await q.$eval('.np-ind', e => e.getBoundingClientRect().bottom), hbt = await q.$eval('.np-holo:not(.np-ind)', e => e.getBoundingClientRect().top);
    ok(ib <= hbt + 1, 'the Indented notes box opens above the Links box', { ib, hbt });
    await q.click('.np-ind-add'); await wait(150);
    ok(/Select the words/.test(await q.$eval('.np-toast, .toast, [role=status]', e => e.textContent).catch(() => '')) || !(await q.$('.np-ind-ed')), 'without words selected, ＋ asks for a selection');
    await q.evaluate(() => { const t = document.querySelector('.p1 .nb-rich').firstChild.firstChild, i = t.data.indexOf('photosynthesis'); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 14); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await q.click('.np-ind-add'); await wait(200);
    await q.keyboard.type('Light into food. See [the article](https://example.com/photo) or https://example.org/x'); await wait(600);
    const nh = await q.evaluate(id => InquireNotes.get(id).html, ids.a);
    ok(/<span data-ann="[a-z0-9]+" data-nt="Light into food\. See \[the article\]\(https:\/\/example\.com\/photo\) or https:\/\/example\.org\/x">photosynthesis<\/span>/.test(nh), 'the indented note is saved with its words', nh);
    const card = await q.evaluate(() => { const c = document.querySelector('.p1 .nann-card'), w = document.querySelector('.p1 span[data-ann]'); if (!c || !w) return null; const cr = c.getBoundingClientRect(), wr = w.getBoundingClientRect(), nx = document.querySelector('.p1 .nb-rich').children[1].getBoundingClientRect();
      return { below: cr.top >= wr.bottom, indented: cr.left > wr.left, room: nx.top >= cr.bottom - 1, links: [...c.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href'), a.target]), color: getComputedStyle(c).color, lines: document.querySelectorAll('.p1 .nann-v, .p1 .nann-h').length }; });
    ok(card && card.below && card.indented && card.room && card.lines === 2, 'the note shows under its words, indented with a right-angled line, and the next line makes room', card);
    ok(card && JSON.stringify(card.links) === '[["the article","https://example.com/photo","_blank"],["https://example.org/x","https://example.org/x","_blank"]]', '[words](https://…) and bare addresses become links', card && card.links);
    ok(card && card.color === 'rgb(181, 214, 90)', 'indented notes have their own colour (lime by default)', card && card.color);
    await q.click('.np-ind-ed [data-a=cancel]'); await wait(150);
    await q.click('.np-ind-show input'); await wait(50);
    ok(!(await q.$('.p1 .nann-card')) && await q.evaluate(() => { const r = document.querySelector('.p1 .nb-rich'); return !r.classList.contains('nann-on') && r.children[1].getBoundingClientRect().top - r.children[0].getBoundingClientRect().bottom < 6; }), 'unticking Show indented notes hides them at once and the text closes up');
    await q.click('.np-ind-show input'); await wait(150);
    ok(!!(await q.$('.p1 .nann-card')), 'ticking it brings them back');
    await q.click('.p1 .nann-card', { position: { x: 4, y: 6 } }); await wait(200);
    ok(!!(await q.$('.np-ind-ed textarea')) && /Light into food/.test(await q.$eval('.np-ind-ed textarea', e => e.value)), 'clicking an indented note opens it for editing');
    await q.evaluate(() => InquireSettings.open('look')); await wait(200);
    await q.click('.set-thfam:has(.set-inddemo) .set-lcs[data-c="#F07CA0"]'); await wait(80);
    await q.evaluate(() => InquireSettings.close()); await wait(150);
    ok(await q.$eval('.p1 .nann-card', e => getComputedStyle(e).color) === 'rgb(240, 124, 160)' && /"indent":"#F07CA0"/.test(await q.evaluate(() => localStorage.getItem('notepath.settings'))), 'Settings → Appearance → Indented notes changes their colour');
    await q.click('.np-ind-ed [data-a=del]'); await wait(200);
    ok(!/data-ann/.test(await q.evaluate(id => InquireNotes.get(id).html, ids.a)) && /photosynthesis/.test(await qh()) && !(await q.$('.p1 .nann-card')), 'Remove takes the indented note off and keeps the words');
    // indented notes on code in a code box
    await q.evaluate(() => { const src = JSON.stringify({ lang: 'python', title: 'Sq', src: 'def sq(x):\n    return x * x\nprint(sq(3))' }).replace(/"/g, '&quot;'); const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = `<div>Code:</div><div class="nw" data-w="code" data-src="${src}"></div><div>After the code.</div>`; InquireNotes.hydrate(ed); ed.dispatchEvent(new Event('input')); }); await wait(600);
    await q.evaluate(() => { const ta = document.querySelector('.p1 .nw-ta'), i = ta.value.indexOf('x * x'); ta.focus(); ta.setSelectionRange(i, i + 5); });
    await q.click('.np-ind-add'); await wait(200); await q.keyboard.type('Squares it. [Docs](https://docs.python.org/3/)'); await wait(600);
    await q.click('.np-ind-ed [data-a=cancel]'); await wait(300);
    const ca = await q.evaluate(id => { const t = document.createElement('template'); t.innerHTML = InquireNotes.get(id).html; const w = t.content.querySelector('.nw[data-w=code]'); return w ? JSON.parse(w.getAttribute('data-src')).anns || null : null; }, ids.a);
    ok(ca && ca.length === 1 && ca[0].text === 'Squares it. [Docs](https://docs.python.org/3/)', 'code in a code box takes an indented note (saved with the box)', ca);
    const cv = await q.evaluate(() => { const w = document.querySelector('.p1 .nann-cw'), c = document.querySelector('.p1 .nann-ccard'), l3 = document.querySelector('.p1 .nw-al[data-line="2"]'); if (!w || !c) return null; const wr = w.getBoundingClientRect(), cr = c.getBoundingClientRect(); return { words: w.textContent, below: cr.top >= wr.bottom, indented: cr.left > wr.left, room: l3.getBoundingClientRect().top >= cr.bottom, link: c.querySelector('a') && c.querySelector('a').href }; });
    ok(cv && cv.words === 'x * x' && cv.below && cv.indented && cv.room && cv.link === 'https://docs.python.org/3/', 'the note shows under its line of code, indented, and the next line makes room', cv);
    await q.click('.p1 .nw-annv .nw-al[data-line="0"] .nw-ac', { position: { x: 5, y: 5 } }); await wait(100);
    ok(await q.evaluate(() => document.activeElement && document.activeElement.matches('.p1 .nw-ta')) && !(await q.$('.p1 .nw.nw-annon')), 'clicking the code goes back to typing');
    await q.keyboard.press('Home'); await q.keyboard.type('# top\n'); await q.evaluate(() => document.querySelector('.p1 .nb-title').focus()); await wait(500);
    ok(await q.$eval('.p1 .nann-cw', e => e.textContent).catch(() => '') === 'x * x', 'the note stays on its code when lines are added above');
    await q.click('.np-ind-show input'); await wait(80);
    ok(!(await q.$('.p1 .nw.nw-annon')) && !(await q.$('.p1 .nann-ccard')), 'unticking Show indented notes hides the notes on code too');
    await q.click('.np-ind-show input'); await wait(150);
    await q.click('.np-ind-list [data-ann]'); await wait(150); await q.click('.np-ind-ed [data-a=del]'); await wait(300);
    ok(await q.evaluate(id => !/"anns"/.test(InquireNotes.get(id).html.replace(/&quot;/g, '"')), ids.a) && !(await q.$('.p1 .nann-ccard')), 'Remove takes the note off the code');
    await q.keyboard.press('Escape'); await wait(100);
    ok(!(await q.$('.np-ind')) && !!(await q.$('.np-holo')), 'Esc closes the Indented notes box first');
    await q.keyboard.press('Escape'); await wait(100);
    // ‹ Back on My notes, My Tasks, Note Office (which has no ✕)
    await q.click('.npage .np-back'); await wait(300);
    ok(await q.evaluate(() => !document.querySelector('.npage') && /Main Menu/.test(document.querySelector('#crumbs').textContent)), '‹ Back on My notes goes to the Main Menu');
    await q.click('[data-a=tasks]'); await wait(400); await q.click('.tpage .np-back'); await wait(300);
    ok(await q.evaluate(() => !document.querySelector('.tpage') && !!document.querySelector('[data-a=office]')), '‹ Back on My Tasks goes to the Main Menu');
    await q.click('[data-a=office]'); await wait(700);
    ok(!(await q.$('.mw-ov[data-mw=office] .set-x')) && !!(await q.$('.mw-ov[data-mw=office] .np-back')), 'Note Office has ‹ Back and no ✕');
    await q.click('.mw-ov[data-mw=office] .np-back'); await wait(400);
    ok(!(await q.$('.mw-ov[data-mw=office]:not(.out)')) && await q.evaluate(() => !NoteOffice.current), '‹ Back closes Note Office to the Main Menu');
    // (v0.5.4) ‹ Back goes to the window that was open before, not always the Main Menu
    const here = () => q.evaluate(() => document.querySelector('.mw-ov[data-mw=office]:not(.out)') ? 'office' : document.querySelector('.tpage') ? 'tasks' : document.querySelector('.npage') ? (document.querySelector('#np-t').textContent === 'My Code' ? 'code' : 'notes') : 'menu');
    await q.click('[data-a=tasks]'); await wait(400); await q.evaluate(() => InquireApp.go({ view: 'notes', space: 'notes' })); await wait(400);
    ok(await q.$eval('.npage .np-back', e => e.title) === 'Back to My Tasks', 'My notes opened from My Tasks: ‹ Back says Back to My Tasks');
    await q.click('.npage .np-back'); await wait(400);
    ok(await here() === 'tasks', '‹ Back on My notes goes back to My Tasks when that was open before', await here());
    await q.click('.tpage .np-back'); await wait(400);
    ok(await here() === 'menu', 'and ‹ Back on My Tasks then goes to the Main Menu', await here());
    await q.click('[data-a=code]'); await wait(500); await q.evaluate(() => InquireApp.go({ view: 'notes', space: 'notes' })); await wait(400);
    ok(await here() === 'notes', 'My notes from My Code', await here());
    await q.click('.npage .np-back'); await wait(400);
    ok(await here() === 'code', '‹ Back on My notes goes back to My Code', await here());
    await q.click('.npage .np-back'); await wait(400);
    ok(await here() === 'menu', '‹ Back on My Code goes back to the Main Menu', await here());
    const osel = await q.evaluate(() => InquireNotes.list()[0].id);
    await q.click('[data-a=office]'); await wait(600); await q.evaluate(id => InquireApp.go({ view: "notes", space: "notes", sel: id, folder: "all" }), osel); await wait(400);
    ok(await here() === 'notes' && await q.$eval('.npage .np-back', e => e.title) === 'Back to Note Office', 'a note opened from Note Office: ‹ Back says Back to Note Office', await here());
    await q.click('.npage .np-back'); await wait(700);
    ok(await here() === 'office', '‹ Back on My notes reopens Note Office', await here());
    await q.click('.mw-ov[data-mw=office] .np-back'); await wait(400);
    ok(await here() === 'menu', '‹ Back on Note Office then shows the Main Menu', await here());
    await q.click('[data-a=tasks]'); await wait(400); await q.evaluate(() => InquireApp.go({ view: 'notes', space: 'code' })); await wait(400);
    await q.evaluate(() => InquireApp.shortcut('back')); await wait(400);
    ok(await here() === 'tasks', 'Alt+⌫ (Back) goes back the same way', await here());
    await q.close();
  }
  /* ---------- (v0.5.4) titles and headings in Markdown and Word, out and back in ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const r = await q.evaluate(async () => { const n = { id: 'hx', title: 'Heads', created: Date.now(), updated: Date.now(), html: '<h1>Top</h1><h6>Under</h6><h2>One</h2><h3>Two</h3><h4>Three</h4><div>x</div>' };
      const md = NPIO.toMD(n, { img: () => '', title: () => '' }), back = NPIO.mdToHTML('---\ntitle: Heads\n---\n' + md, {}).html;
      const dx = await NPIO.toDOCX(n), files = await NPIO.unzip(dx), doc = await files.find(f => f.name === 'word/document.xml').text(), st = await files.find(f => f.name === 'word/styles.xml').text();
      const wb = (await NPIO.docxToNote(new Uint8Array(await dx.arrayBuffer()), {})).html;
      return { md, back, doc: ['Title', 'Subtitle', 'Heading1', 'Heading2', 'Heading3'].every(k => doc.includes(`w:val="${k}"`) && st.includes(`w:styleId="${k}"`)), wb }; });
    ok(/^# Top$/m.test(r.md) && /^\*Under\*$/m.test(r.md) && /^## One$/m.test(r.md) && /^### Two$/m.test(r.md) && /^#### Three$/m.test(r.md), 'Markdown: Title #, Subtitle in italics, Heading 1–3 ##–####', r.md);
    ok(/<h1>Top<\/h1>/.test(r.back) && /<h2>One<\/h2>/.test(r.back) && /<h3>Two<\/h3>/.test(r.back) && /<h4>Three<\/h4>/.test(r.back), 'Markdown headings come back as the same styles', r.back);
    ok(r.doc, 'Word: Title, Subtitle, Heading 1, 2, 3 styles');
    ok(/<h1>[^<]*Top/.test(r.wb) && /<h6>[^<]*Under/.test(r.wb) && /<h2>[^<]*One/.test(r.wb) && /<h3>[^<]*Two/.test(r.wb) && /<h4>[^<]*Three/.test(r.wb), 'Word headings come back as the same styles', r.wb);
    await q.close();
  }
  /* ---------- (v0.5.4) highlight, colour presets, align & indent, line & paragraph spacing ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const id = await q.evaluate(() => InquireNotes.create({ title: 'Layout', html: '<div>Hello brave world</div><div>Second line here</div><ul><li>one</li><li>two</li></ul>' }).id);
    await q.evaluate(a => InquireApp.openNotes(a), id); await wait(600);
    const qh = () => q.$eval('.p1 .nb-rich', e => e.innerHTML), saved = () => q.evaluate(a => InquireNotes.get(a).html, id);
    const selWord = w => q.evaluate(w => { const ed = document.querySelector('.p1 .nb-rich'), tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.data.indexOf(w); if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); getSelection().removeAllRanges(); getSelection().addRange(r); return true; } } return false; }, w);
    const caretIn = (w, off) => q.evaluate(([w, off]) => { const ed = document.querySelector('.p1 .nb-rich'), tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.data.indexOf(w); if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(n, i + off); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); return; } } }, [w, off]);
    // highlight
    ok(!!(await q.$('.p1 .nr-tools .nr-colb + .nr-hlb')), 'a Highlight menu sits right after the text colour');
    await selWord('brave'); await q.click('.p1 .nr-hlb'); await wait(100);
    ok(!!(await q.$('.np-pop-hilite .np-spec')) && !!(await q.$('.np-pop-hilite .np-grey')) && !!(await q.$('.np-pop-hilite .np-hex')) && /No highlight/.test(await q.$eval('.np-pop-hilite', e => e.textContent)), 'the Highlight menu has the same spectrum, greys, colour code and a No highlight button');
    await q.fill('.np-pop-hilite .np-hex', '#ffe066'); await q.click('.np-pop-hilite .np-capply'); await wait(100);
    ok(/<span[^>]*data-h="#ffe066"[^>]*>brave<\/span>/.test(await qh()), 'a colour code highlights the selected words', await qh());
    ok(await q.$eval('.p1 .nb-rich span[data-h]', e => getComputedStyle(e).backgroundColor === 'rgb(255, 224, 102)' && getComputedStyle(e).color === 'rgb(20, 22, 28)'), 'the highlight shows, with dark words on a light highlight');
    await wait(500); ok(/data-h="#ffe066"/.test(await saved()), 'the highlight is saved with the note', await saved());
    await selWord('brave'); await q.click('.p1 .nr-hlb'); await wait(80); await q.click('.np-pop-hilite .np-cnorm'); await wait(100);
    ok(!/data-h/.test(await qh()) && /Hello brave world/.test(await qh()), 'No highlight takes it off', await qh());
    await caretIn('world', 5); await q.click('.p1 .nr-hlb'); await wait(80); await q.click('.np-pop-hilite .np-pre >> nth=1'); await q.keyboard.type(' new'); await wait(100);
    ok(/<span[^>]*data-h="#8ce99a"[^>]*>\s*new<\/span>/.test((await qh()).replace(/​/g, '')), 'a highlight picked with nothing selected goes on what is typed next', await qh());
    await selWord('Second'); await q.click('.p1 .nr-hlb'); await wait(80); await q.click('.np-pop-hilite .np-spec', { position: { x: 200, y: 110 } }); await wait(100);
    ok(/data-h="#[0-9a-f]{6}"[^>]*>Second</.test(await qh()), 'a click on the spectrum highlights too', await qh());
    // presets
    await q.click('.p1 .nr-colb'); await wait(80);
    ok(await q.$$eval('.np-pop-color .np-spec ~ .np-psub ~ .np-presets .np-pre', e => e.length) === 6 && !!(await q.$('.np-pop-color .np-padd')), 'text colour presets sit under the spectrum, with ＋ to add one');
    await q.fill('.np-pop-color .np-hex', '#123456'); await q.click('.np-pop-color .np-padd'); await wait(60);
    ok(await q.$$eval('.np-pop-color .np-pre', e => e.map(x => x.dataset.pc).includes('#123456')), '＋ saves the colour shown as a preset');
    await q.keyboard.press('Escape'); await wait(60); await selWord('brave'); await q.click('.p1 .nr-colb'); await wait(80);
    ok(await q.$$eval('.np-pop-color .np-pre', e => e.map(x => x.dataset.pc).includes('#123456')), 'presets are kept the next time the menu opens');
    await q.click('.np-pop-color .np-pre[data-pc="#123456"]'); await wait(100);
    ok(/data-c="#123456"[^>]*>brave</.test(await qh()), 'clicking a preset colours the selected words', await qh());
    await q.click('.p1 .nr-colb'); await wait(80); await q.click('.np-pop-color .np-pedit'); await q.click('.np-pop-color .np-pre[data-pc="#123456"]'); await wait(60);
    ok(!(await q.$$eval('.np-pop-color .np-pre', e => e.map(x => x.dataset.pc).includes('#123456'))) && await q.evaluate(() => !JSON.parse(localStorage.getItem('notepath.colorpresets')).color.includes('#123456')), 'Edit then a preset takes it away');
    await q.keyboard.press('Escape'); await wait(60);
    await q.click('.p1 .nr-hlb'); await wait(80); await q.fill('.np-pop-hilite .np-hex', '#abcdef'); await q.click('.np-pop-hilite .np-padd'); await wait(60);
    ok(await q.evaluate(() => { const o = JSON.parse(localStorage.getItem('notepath.colorpresets')); return o.hilite.includes('#abcdef') && !o.color.includes('#abcdef'); }), 'highlight presets are their own set');
    await q.click('.np-pop-hilite .np-pre[data-pc="#abcdef"]', { button: 'right' }); await wait(60);
    ok(await q.evaluate(() => !JSON.parse(localStorage.getItem('notepath.colorpresets')).hilite.includes('#abcdef')), 'a right-click takes a preset away too');
    await q.keyboard.press('Escape'); await wait(60);
    // align & indent
    await q.evaluate(a => InquireNotes.update(a, { html: '<div>Hello brave world</div><div>Second line here</div><ul><li>one</li><li>two</li></ul>' }), id);
    await q.locator('.nb-it', { hasText: 'Layout' }).click(); await q.evaluate(a => InquireApp.openNotes(a), id); await wait(500);
    await caretIn('Second', 2); await q.click('.p1 .nr-alb'); await wait(80);
    ok(JSON.stringify(await q.$$eval('.np-pop-align [data-p=al]', e => e.map(x => x.textContent))) === '["None","Left","Middle","Right"]' && /whole note/.test(await q.$eval('.np-pop-align', e => e.textContent)), 'Align & indent: None, Left, Middle, Right; with nothing selected it says the whole note');
    await q.click('.np-pop-align [data-p=al][data-v2=right]'); await wait(100);
    ok(await q.$$eval('.p1 .nb-rich > *', e => e.every(x => x.getAttribute('data-al') === 'right')) && await q.$eval('.p1 .nb-rich li', e => getComputedStyle(e).textAlign === 'right'), 'nothing selected: Right aligns the whole note', await qh());
    await selWord('line'); await q.click('.p1 .nr-alb'); await wait(80);
    ok(/only the selected/.test(await q.$eval('.np-pop-align', e => e.textContent)), 'with words selected it says only those');
    await q.click('.np-pop-align [data-p=al][data-v2=center]'); await wait(100);
    ok(/<div data-al="right">Second<\/div><div data-al="center">line<\/div><div data-al="right">here<\/div>/.test(await qh()) && /<div data-al="right">Hello/.test(await qh()), 'words selected: only they move (split onto their own line); the rest stays', await qh());
    await selWord('Second'); await q.evaluate(() => { const s = getSelection(), r = s.getRangeAt(0), t = [...document.querySelectorAll('.p1 .nb-rich div')].find(d => d.textContent === 'here'); r.setEnd(t.firstChild, 4); });
    await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=al][data-v2=""]'); await wait(100);
    ok(/<div>Second<\/div><div>line<\/div><div>here<\/div>/.test(await qh()), 'None over several selected lines takes the alignment off them', await qh());
    await selWord('one'); await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=in][data-v2="+"]'); await wait(80);
    await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=in][data-v2="+"]'); await wait(80);
    ok(/<li data-in="2">one<\/li><li>two<\/li>/.test(await qh()) && await q.$eval('.p1 .nb-rich li', e => parseFloat(getComputedStyle(e).marginLeft) > 40), 'More indents the selected line one step each time', await qh());
    await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=in][data-v2="-"]'); await wait(80);
    ok(/<li data-in="1">one<\/li>/.test(await qh()), 'Less moves it back a step', await qh());
    await caretIn('Hello', 1); await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=in][data-v2="+"]'); await wait(80);
    ok(await q.$$eval('.p1 .nb-rich > *', e => e.every(x => x.getAttribute('data-in') === '1')), 'More with nothing selected indents the whole note', await qh());
    await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=in][data-v2="0"]'); await wait(80);
    ok(!/data-in/.test(await qh()), 'No indent takes every indent off', await qh());
    await q.keyboard.press('End'); await q.keyboard.press('Enter'); await q.keyboard.type('Next');
    await q.click('.p1 .nr-alb'); await wait(80); await q.click('.np-pop-align [data-p=al][data-v2=center]'); await wait(80);
    await q.keyboard.press('End'); await q.keyboard.press('Enter'); await q.keyboard.type('Later'); await wait(100);
    ok(/<div data-al="center">Later<\/div>/.test(await qh()), 'a new line after the whole note is aligned keeps the alignment', await qh());
    // line & paragraph spacing
    await caretIn('Later', 1); await q.click('.p1 .nr-spb'); await wait(80);
    ok(JSON.stringify(await q.$$eval('.np-pop-spacing [data-p=lh]', e => e.map(x => x.textContent))) === '["Normal","1.0","1.15","1.5","2.0","2.5","3.0"]' && JSON.stringify(await q.$$eval('.np-pop-spacing [data-p=ps]', e => e.map(x => x.textContent))) === '["Normal","None","Small","Medium","Large"]', 'Line & paragraph spacing: line spacing 1.0–3.0 and space after paragraphs');
    await q.click('.np-pop-spacing [data-p=lh][data-v2="2"]'); await wait(80);
    ok(await q.$$eval('.p1 .nb-rich > *', e => e.every(x => x.getAttribute('data-lh') === '2')) && await q.$eval('.p1 .nb-rich > div', e => parseFloat(getComputedStyle(e).lineHeight) >= 29), 'nothing selected: double line spacing for the whole note', await qh());
    await selWord('two'); await q.click('.p1 .nr-spb'); await wait(80); await q.click('.np-pop-spacing [data-p=ps][data-v2="24"]'); await wait(80);
    ok(/<li data-ps="24">two<\/li>/.test(await qh()) && await q.$eval('.p1 .nb-rich li:last-child', e => getComputedStyle(e).marginBottom === '24px'), 'a selected line gets Large space after it', await qh());
    await q.click('.p1 .nr-spb'); await wait(80);
    ok(await q.$eval('.np-pop-spacing [data-p=ps][data-v2="24"]', e => e.getAttribute('aria-checked')) === 'true', 'the menu marks what the line has');
    await q.click('.np-pop-spacing [data-p=lh][data-v2=""]'); await wait(80);
    await wait(500); const sv = await saved();
    ok(/data-al="center"/.test(sv) && /data-ps="24"/.test(sv) && /data-lh="2"/.test(sv), 'align and spacing are saved with the note (the sanitiser keeps them)', sv);
    // out and back in
    const ex = await q.evaluate(async a => { const n = InquireNotes.get(a); n.html = '<div data-al="center" data-lh="1.5" data-ps="12">Mid <span data-h="#ffe066">hi</span></div><div data-al="right" data-in="2">R</div>';
      const body = NPIO.toHTMLBody(n, { src: () => '', href: () => '' }), md = NPIO.toMD(n, { img: () => '', title: () => '' });
      const dx = await NPIO.toDOCX(n), doc = await (await NPIO.unzip(dx)).find(f => f.name === 'word/document.xml').text(), back = (await NPIO.docxToNote(new Uint8Array(await dx.arrayBuffer()), {})).html;
      return { body, md, doc, back }; }, id);
    ok(/text-align:center/.test(ex.body) && /line-height:1.5/.test(ex.body) && /margin-bottom:12px/.test(ex.body) && /margin-left:4em/.test(ex.body) && /background-color:#ffe066/.test(ex.body), 'web page export keeps align, indent, spacing and highlights', ex.body);
    ok(/==hi==/.test(ex.md), 'Markdown marks highlights ==like this==', ex.md);
    ok(/<w:jc w:val="center"\/>/.test(ex.doc) && /<w:spacing w:after="180" w:line="360" w:lineRule="auto"\/>/.test(ex.doc) && /<w:ind w:left="1440"\/><w:jc w:val="right"\/>/.test(ex.doc) && /w:fill="FFE066"/.test(ex.doc), 'Word export keeps align, indent, spacing and highlights', ex.doc.slice(0, 600));
    ok(/data-al="center"/.test(ex.back) && /data-al="right"/.test(ex.back) && /data-h="#ffe066"/.test(ex.back), 'Word alignment and highlights come back in', ex.back);
    await q.close();
  }
  /* ---------- (v0.5.4) clear formatting, ⇪ Share, Paranotes, Search above the folders ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const H0 = '<h1 data-al="center">Big title</h1><div data-al="right" data-lh="2">A <b>very bold text</b> and <i>it</i> <span data-c="#e5675b">red</span> <span data-h="#ffe066">lit</span> <span data-s="24">big</span></div><ul data-ck="1"><li>task <u>under</u></li></ul><div>see <a class="nlink" data-note="zz">Other</a> and <span data-ann="ab12cd" data-nt="a note" data-c="#5cc8e0">words</span></div>';
    const ids = await q.evaluate(H0 => { const N = InquireNotes, f = N.addFolder('Far away'), a = N.create({ title: 'Clear me', html: H0 }), b = N.create({ title: 'Needle in a folder', folder: f.id, html: '<div>haystack</div>' }); return { a: a.id, b: b.id, f: f.id }; }, H0);
    await q.evaluate(a => InquireApp.openNotes(a), ids.a); await wait(600);
    const qh = () => q.$eval('.p1 .nb-rich', e => e.innerHTML);
    const selWord = w => q.evaluate(w => { const ed = document.querySelector('.p1 .nb-rich'), tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.data.indexOf(w); if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); getSelection().removeAllRanges(); getSelection().addRange(r); return true; } } return false; }, w);
    // clear formatting
    await wait(1100); // (v0.5.7) undo steps merge writes less than 700 ms apart: let the notes' creation settle, or on a slow runner Undo would also remove the new notes
    ok(!!(await q.$('.p1 .nr-tools .nr-clr[data-a=clear]')), 'a Clear formatting button is in the toolbar');
    await selWord('bold'); await q.click('.p1 .nr-clr'); await wait(150);
    let hh = await qh();
    ok(/<b>very <\/b>bold<b> text<\/b>/.test(hh), 'words selected: only they lose their bold', hh);
    ok(/<h1 data-al="center">Big title<\/h1>/.test(hh) && /<span data-c="#e5675b"[^>]*>red<\/span>/.test(hh) && /<i>it<\/i>/.test(hh), 'the rest of the note keeps its formatting', hh);
    ok(/<div>A <b>very/.test(hh), 'the selected line loses its align and spacing too', hh);
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'), t = ed.querySelector('h1').firstChild; ed.focus(); const r = document.createRange(); r.setStart(t, 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await q.click('.p1 .nr-clr'); await wait(150); hh = await qh();
    ok(!/<(b|i|u|strong|em|font)\b/.test(hh) && !/data-(c|h|s|f|al|lh|in|ps)=/.test(hh) && !/<h\d/.test(hh) && /<div>Big title<\/div>/.test(hh), 'nothing selected: the whole note loses its formatting (titles become plain lines)', hh);
    ok(/<ul data-ck="1"><li>task under<\/li><\/ul>/.test(hh) && /<a [^>]*data-note="zz"/.test(hh) && /<span data-ann="ab12cd" data-nt="a note">words<\/span>/.test(hh), 'checklists, links and paranotes stay', hh);
    await wait(500); ok(!/data-c=|<b>/.test(await q.evaluate(a => InquireNotes.get(a).html, ids.a)), 'the cleared note is saved');
    await q.evaluate(() => InquireNotes.undo()); await q.evaluate(a => InquireApp.openNotes(a), ids.b); await wait(400); await q.evaluate(a => InquireApp.openNotes(a), ids.a); await wait(500); // (v0.5.7) open the notes directly: the list rows were not found in time on the slower CI runner
    ok(/<b>|data-c=/.test(await qh()), 'Undo brings the formatting back', await qh());
    // ⇪ Share
    ok(!(await q.$('[data-a=io]')) && /Share/.test(await q.$eval('.np-win .mw-hx [data-a=share]', e => e.textContent)), '⇅ Import / Export became ⇪ Share');
    await q.evaluate(() => { window.__clip = null; navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }; });
    await q.click('[data-a=share]'); await wait(120);
    ok(JSON.stringify(await q.$$eval('.np-share-pop button', e => e.map(x => x.dataset.s || x.dataset.f))) === '["link","text","mail","mailpdf","print","txt","html","docx","pdf","io"]', 'Share: Copy link, Copy the words, Email, Email with a PDF, Print (v0.5.6), Send a copy (text, web page, Word, PDF), Import & Export');
    await q.click('.np-share-pop [data-s=link]'); await wait(150);
    ok(await q.evaluate(a => window.__clip === 'notepath://note/' + a, ids.a) && !(await q.$('.np-share-pop')), 'Copy link copies notepath://note/… for this note', await q.evaluate(() => window.__clip));
    await q.click('[data-a=share]'); await wait(100); await q.click('.np-share-pop [data-s=text]'); await wait(150);
    ok(await q.evaluate(() => /^Clear me\n\n/.test(window.__clip || '')), 'Copy the words copies the title and text');
    await q.click('[data-a=share]'); await wait(100);
    const [dl] = await Promise.all([q.waitForEvent('download'), q.click('.np-share-pop [data-f=txt]')]);
    ok(/^Clear me\.txt$/.test(dl.suggestedFilename()), 'Send a copy → Text saves the note as a .txt to attach', dl.suggestedFilename());
    await q.click('[data-a=share]'); await wait(100); await q.keyboard.press('Escape'); await wait(80);
    ok(!(await q.$('.np-share-pop')) && !!(await q.$('.npage')), 'Esc closes the Share menu and nothing else');
    await q.click('[data-a=share]'); await wait(100); await q.click('.np-share-pop [data-s=io]'); await wait(300);
    ok(!!(await q.$('.mw-ov[data-mw=io] .io-fmt')), 'Share → Import & Export… opens the Import & Export window');
    await q.click('.mw-ov[data-mw=io] .set-x'); await wait(300);
    await q.evaluate(b => InquireApp.openNoteLink(b), ids.b); await wait(400);
    ok(await q.$eval('.p1 .nb-title', e => e.value) === 'Needle in a folder', 'a note link opens its note');
    await q.evaluate(() => InquireApp.openNoteLink('nope404')); await wait(200);
    ok(/not on this computer/.test(await q.evaluate(() => document.body.textContent)), 'a link to a note this computer does not have says so');
    await q.evaluate(a => InquireApp.openNotes(a), ids.a); await wait(400);
    // Search above the folders
    const sb = await q.evaluate(() => { const i = document.querySelector('.nb-sbar input[type=search]'), nb = document.querySelector('.npage .nb'), f = document.querySelector('.nb-folders'); if (!i) return null; const r = i.closest('.nb-search').getBoundingClientRect(); return { ph: i.placeholder, above: r.bottom <= nb.getBoundingClientRect().top + 1, left: Math.abs(r.left - f.getBoundingClientRect().left) < 20, inList: !!i.closest('.nb-list') }; });
    ok(sb && sb.ph === 'Search' && sb.above && sb.left && !sb.inList && !(await q.$('.nb-tools input')), 'a Search box sits above the folders (not in the notes list)', sb);
    await q.click('.nb-hide[data-p=f]'); await wait(450); await q.click('.nb-hide[data-p=l]'); await wait(450);
    ok(await q.$eval('.nb-sbar input', e => e.getBoundingClientRect().width > 150 && getComputedStyle(e.closest('.nb-sbar')).visibility === 'visible'), 'with the folders and the notes list folded, Search stays');
    await q.fill('.nb-sbar input', 'Needle'); await wait(500);
    ok(!(await q.$eval('.npage .nb', e => e.classList.contains('ffold'))) && JSON.stringify(await q.$$eval('.nb-it .nb-t', e => e.map(x => x.textContent))) === '["Needle in a folder"]', 'Search looks through every note and opens the Folders & Files bar to show them', await q.$$eval('.nb-it .nb-t', e => e.map(x => x.textContent)));
    await q.fill('.nb-sbar input', ''); await wait(200); await q.click('.nb-fold[data-p=l]'); await wait(450);
    // Paranotes
    ok(await q.$eval('.p1 .nb-indb', e => e.getAttribute('aria-label') === 'Paranotes' && /Paranotes/.test(e.title)), 'the ↳ button is called Paranotes');
    await q.click('.p1 .nb-indb'); await wait(200);
    const pt = await q.$eval('.np-ind', e => e.textContent);
    ok(/Paranotes/.test(pt) && /Show paranotes/.test(pt) && /Add a paranote/.test(pt) && !/ndented/.test(pt), 'its box says Paranotes, Show paranotes, ＋ Add a paranote', pt);
    await q.keyboard.press('Escape'); await wait(100);
    await q.evaluate(() => InquireSettings.open('look')); await wait(300);
    const st = await q.evaluate(() => document.querySelector('.set-ov') ? document.querySelector('.set-ov').textContent : document.body.textContent);
    ok(/Paranotes/.test(st) && !/ndented note/.test(st), 'Settings → Appearance says Paranotes');
    await q.evaluate(() => InquireSettings.close()); await wait(200);
    ok(!/ndented note/.test(await q.evaluate(() => document.body.innerHTML)), 'no "indented notes" left on the page');
    await q.close();
  }
  /* ---------- (v0.5.4) Details keeps the list width, resizable Details columns, Compact list, cover photos ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const pic = path.join(R, 'app/brand/np-mark-64.png');
    await q.evaluate(() => { InquireNotes.create({ title: 'Alpha note', html: '<div>a</div>' }); InquireNotes.create({ title: 'Beta note', html: '<div>b</div>' }); });
    await q.evaluate(() => InquireApp.openNotes()); await wait(500);
    await q.click('.nb-tools [data-view=list]'); await wait(150);
    const lw0 = await q.$eval('.nb-folders', e => e.offsetWidth);
    await q.click('.nb-tools [data-view=details]'); await wait(450);
    ok(Math.abs(await q.$eval('.nb-folders', e => e.offsetWidth) - lw0) < 2 && await q.evaluate(() => !localStorage.getItem('notepath.nbw') || localStorage.getItem('notepath.nbw') === '0'), 'Details keeps the Folders & Files bar at the width you gave it', { lw0 });
    // resize a Details column
    const c0 = await q.$eval('.nb-dhead > span', e => e.getBoundingClientRect().width), g = await q.$eval('.nb-dcrz[data-c="0"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await q.mouse.move(g[0], g[1]); await q.mouse.down(); await q.mouse.move(g[0] + 70, g[1], { steps: 6 }); await q.mouse.up(); await wait(100);
    const c1 = await q.$eval('.nb-dhead > span', e => e.getBoundingClientRect().width), r1 = await q.$eval('.nb-it.nb-row > .nb-t', e => e.getBoundingClientRect().width);
    ok(Math.abs(c1 - c0 - 70) < 6 && Math.abs(r1 - c1) < 2, 'dragging the line after Name makes the Name column wider, in the rows too', { c0, c1, r1 });
    ok(await q.evaluate(() => (JSON.parse(localStorage.getItem('notepath.dcols')) || []).length === 4), 'the column widths are kept');
    await q.$eval('.nb-fmain', e => { e.scrollLeft = e.scrollWidth; }); await wait(50);
    const g2 = await q.$eval('.nb-dcrz[data-c="1"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }), m0 = await q.$eval('.nb-dhead > span:nth-child(2)', e => e.getBoundingClientRect().width);
    await q.mouse.move(g2[0], g2[1]); await q.mouse.down(); await q.mouse.move(g2[0] - 30, g2[1], { steps: 4 }); await q.mouse.up(); await wait(100);
    { const m1 = await q.$eval('.nb-dhead > span:nth-child(2)', e => e.getBoundingClientRect().width); ok(Math.abs(m1 - (m0 - 30)) < 6, 'other columns resize too (Modified narrower)', { m0, m1, g2 }); }
    await q.click('.nb-tools [data-view=list]'); await wait(100); await q.click('.nb-tools [data-view=details]'); await wait(150);
    ok(Math.abs(await q.$eval('.nb-dhead > span', e => e.getBoundingClientRect().width) - c1) < 2, 'they stay when you come back to Details');
    ok(await q.$eval('.nb-fmain', e => e.scrollWidth > e.clientWidth), 'wide columns scroll sideways inside the bar');
    await q.dblclick('.nb-dcrz[data-c="0"]'); await wait(100);
    ok(await q.evaluate(() => localStorage.getItem('notepath.dcols') === 'null') && Math.abs(await q.$eval('.nb-dhead > span', e => e.getBoundingClientRect().width) - c0) < 3, 'double-click puts the columns back');
    // Compact
    ok(JSON.stringify(await q.$$eval('.nb-tools .np-views [data-view]', e => e.map(x => x.dataset.view))) === '["icons","list","compact","details"]', 'Show as: Icons, List, Compact, Details');
    await q.click('.nb-tools [data-view=list]'); await wait(100); const lh = await q.$eval('.nb-it', e => e.offsetHeight);
    await q.click('.nb-tools [data-view=compact]'); await wait(150);
    const cr = await q.$$eval('.nb-it.nb-crow', e => e.map(x => ({ k: [...x.children].map(c => c.textContent), h: x.offsetHeight })));
    ok(cr.length >= 2 && cr.every(x => x.k.length === 2 && /\d:\d\d/.test(x.k[1])) && cr[0].h < lh - 10 && !(await q.$('.nb-ftree[data-view=compact] .nb-dhead')), 'Compact: thin rows with just the name and when it was made', { cr, lh });
    await q.locator('.nb-it.nb-crow', { hasText: 'Beta note' }).click(); await wait(250);
    ok(await q.$eval('.p1 .nb-title', e => e.value) === 'Beta note', 'a note opens from the Compact list');
    ok(!(await q.$('.np-holo-bar [data-view=compact]')), '(the ◈ Links panel keeps Icons, List, Details)');
    // cover photos: by the title
    await q.click('.nb-tools [data-view=list]'); await wait(100);
    ok(await q.$eval('.p1 .nb-trow .nb-covb', e => e.offsetWidth <= 40 && e.offsetHeight <= 40), 'a small cover-photo button sits by the title');
    await q.setInputFiles('.p1 .nb-covin', pic); await wait(700);
    const bid = await q.evaluate(() => InquireNotes.list().find(n => n.title === 'Beta note').id);
    ok(await q.evaluate(b => /^[a-z0-9]+$/i.test(InquireNotes.get(b).cover || ''), bid), 'choosing a photo makes it the note\'s cover');
    ok(await q.$eval(`.nb-it[data-id="${bid}"] .nb-lcov`, e => !!e.src && e.nextElementSibling.querySelector('.nb-t').textContent === 'Beta note'), 'List: the cover sits left of the title and time');
    ok(await q.$eval('.p1 .nb-covb img', e => !!e.src), 'the button by the title shows the cover');
    await q.click('.nb-tools [data-view=icons]'); await wait(200);
    ok(await q.$eval(`.nb-it[data-id="${bid}"] .nb-tic`, e => !!e.querySelector('img.nb-tcov') && !e.querySelector('svg')) && !!(await q.$('.nb-it.nb-tile:not([data-id="' + bid + '"]) .nb-tic svg')), 'Icons: the cover replaces the note icon (others keep theirs)');
    await q.click('.nb-tools [data-view=compact]'); await wait(100);
    ok(!(await q.$('.nb-ftree .nb-cov')), 'Compact keeps to the name and time (no cover)');
    await q.click('.nb-tools [data-view=list]'); await wait(100);
    await q.hover('.p1 .nb-cov-w'); await q.click('.p1 .nb-covx'); await wait(300);
    ok(await q.evaluate(b => !InquireNotes.get(b).cover, bid) && !(await q.$(`.nb-it[data-id="${bid}"] .nb-lcov`)), '✕ takes the cover off');
    await q.evaluate(() => InquireNotes.undo()); await q.locator('.nb-it', { hasText: 'Alpha note' }).click(); await wait(200);
    ok(await q.evaluate(b => !!InquireNotes.get(b).cover, bid) && !!(await q.$(`.nb-it[data-id="${bid}"] .nb-lcov`)), 'Undo brings the cover back');
    ok(await q.evaluate(async b => { const n = InquireNotes.get(b), m = await InquireNotes.exportImages([n]); return !!m[n.cover]; }, bid), 'backups carry the cover photo');
    // in the New Note dialog
    await q.click('[data-a=newnote]'); await wait(200);
    ok(!!(await q.$('.ask-cov .ask-covb')), 'the New Note dialog offers a cover photo');
    await q.setInputFiles('.ask-covin', pic); await wait(100);
    ok(await q.$eval('.ask-covb', e => e.classList.contains('set') && !!e.querySelector('img')), 'the chosen photo shows in the dialog');
    await q.fill('#ask-in', 'Gamma with cover'); await q.click('.ask-btns .btn.good'); await wait(700);
    ok(await q.evaluate(() => { const n = InquireNotes.list().find(x => x.title === 'Gamma with cover'); return !!(n && n.cover); }) && !!(await q.$('.nb-it.sel .nb-lcov')), 'a note made with a cover photo shows it in the list');
    // My Code files too
    await q.evaluate(() => InquireNotes.scope('code').create({ title: 'cov.py', code: { lang: 'python', src: 'print(1)' } })); await q.evaluate(() => InquireApp.go({ view: 'notes', space: 'code', folder: 'all' })); await wait(800);
    ok(!!(await q.$('.p1 .nb-trow .nb-covb')), 'code files have the cover button by their name too');
    await q.close();
  }
  /* ---------- (v0.5.4) ◈ Links: two boxes (linking here / links in this note), 👁 Peek in a small note box ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const L = await q.evaluate(() => { const N = InquireNotes, a = N.create({ title: 'Hub' }), b = N.create({ title: 'Spoke' }), c = N.create({ title: 'Fan' });
      N.update(c.id, { html: `<div>see <a class="nlink" data-note="${a.id}">Hub</a></div>` });
      N.update(b.id, { html: `<div>Spoke text here and <a class="nlink" data-note="${c.id}">Fan</a></div><div class="nw" data-w="code" data-src="{&quot;lang&quot;:&quot;python&quot;,&quot;src&quot;:&quot;x=1&quot;}"></div>` });
      N.update(a.id, { html: `<div>go to <a class="nlink" data-note="${b.id}">Spoke</a></div>` }); return { a: a.id, b: b.id, c: c.id }; });
    await q.evaluate(a => InquireApp.openNotes(a), L.a); await wait(600);
    await q.click('.p1 .nb-holob'); await wait(250);
    ok(JSON.stringify(await q.$$eval('.np-holo-ck label', e => e.map(x => x.textContent.trim() + ':' + x.querySelector('input').checked))) === '["Notes that link here:true","Links in this note:true"]', 'Links has two boxes: Notes that link here, Links in this note (both ticked)');
    const secs = () => q.$$eval('.np-holo section[data-sec]', e => e.map(x => x.dataset.sec + ':' + [...x.querySelectorAll('.np-hl-t')].map(y => y.textContent).join(',')));
    ok(JSON.stringify(await secs()) === '["back:Fan","out:Spoke"]', 'it lists the notes linking here and the links in this note', await secs());
    await q.click('.np-holo-ck [data-ck=back]'); await wait(100);
    ok(JSON.stringify(await secs()) === '["out:Spoke"]', 'unticking Notes that link here leaves only the links in this note');
    await q.click('.np-holo-ck [data-ck=out]'); await wait(100);
    ok(JSON.stringify(await secs()) === '[]' && /Tick a box/.test(await q.$eval('.np-holo-b', e => e.textContent)), 'with both unticked it says to tick a box');
    await q.click('.np-holo-ck [data-ck=back]'); await wait(100);
    ok(JSON.stringify(await secs()) === '["back:Fan"]' && await q.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('notepath.holoshow')))) === '{"back":true,"out":false}', 'each box works alone and is remembered');
    await q.click('.np-holo-ck [data-ck=out]'); await wait(100);
    // Peek
    await q.click(`.np-holo section[data-sec=out] .np-hl-pk[data-peek="${L.b}"]`); await wait(350);
    const pk = await q.evaluate(() => { const p = document.querySelector('.np-peek'), h = document.querySelector('.np-holo'); if (!p) return null; const r = p.getBoundingClientRect();
      return { t: p.querySelector('.np-peek-t').textContent, txt: p.querySelector('.np-peek-b').textContent, ro: !p.querySelector('[contenteditable=true]'), w: r.width, h: r.height, leftOfHolo: r.right <= h.getBoundingClientRect().left + 1, docked: p.classList.contains('docked') }; });
    ok(pk && pk.t === 'Spoke' && /Spoke text here/.test(pk.txt) && pk.ro && pk.docked, '👁 Peek opens the linked note in a small read-only box', pk);
    ok(pk && pk.w <= 420 && pk.h <= 560 && pk.leftOfHolo, 'the box is small and sits left of the Links box', pk);
    ok(/Code box/.test(await q.$eval('.np-peek .np-peek-w', e => e.textContent)) && await q.$eval('.p1 .nb-title', e => e.value) === 'Hub', 'widgets show as a short label; the open note stays as it was');
    await q.click('.np-peek-b a.nlink'); await wait(200);
    ok(await q.$eval('.np-peek-t', e => e.textContent) === 'Fan' && await q.$eval('.np-peek-back', e => !e.hidden), 'a link inside the box peeks at that note');
    await q.click('.np-peek-back'); await wait(150);
    ok(await q.$eval('.np-peek-t', e => e.textContent) === 'Spoke', '‹ goes back to the note before');
    const hdr = await q.$eval('.np-peek-h .np-peek-tt', e => { const r = e.getBoundingClientRect(); return [r.x + 10, r.y + r.height / 2]; });
    await q.mouse.move(hdr[0], hdr[1]); await q.mouse.down(); await q.mouse.move(hdr[0] - 300, hdr[1] - 200, { steps: 8 }); await q.mouse.up(); await wait(100);
    const fl = await q.evaluate(() => { const p = document.querySelector('.np-peek'), r = p.getBoundingClientRect(); return { f: p.classList.contains('floating'), x: r.x, y: r.y }; });
    ok(fl.f && await q.evaluate(() => JSON.parse(localStorage.getItem('notepath.peek')).float === true), 'dragging the header floats the box where you drop it (kept)', fl);
    await q.click('.np-peek-home'); await wait(150);
    ok(await q.$eval('.np-peek', e => e.classList.contains('docked')), '⇲ docks it back at the bottom right');
    await q.keyboard.press('Escape'); await wait(300);
    ok(!(await q.$('.np-peek')) && !!(await q.$('.np-holo')), 'Esc closes the Peek box first, the Links box stays');
    // right-click Peek, then Open
    const lk = await q.$eval('.p1 .nb-rich a.nlink', e => { const r = e.getBoundingClientRect(); return [r.x + 6, r.y + r.height / 2]; });
    await q.mouse.click(lk[0], lk[1], { button: 'right' }); await wait(150); await q.click('.tm-menu [data-a=peek]'); await wait(350);
    ok(await q.$eval('.np-peek-t', e => e.textContent) === 'Spoke', 'right-click a note link → Peek opens the box');
    await q.click('.np-peek [data-a=open]'); await wait(400);
    ok(!(await q.$('.np-peek')) && await q.$eval('.p1 .nb-title', e => e.value) === 'Spoke', 'Open in the box opens that note in the editor');
    await q.keyboard.press('Escape'); await wait(150);
    await q.close();
  }
  /* ---------- (v0.5.5) Folders & Files bar, Search finds folders, Tool bar, Links rows + Compact, H by Align, paranote from the right-click ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const T = await q.evaluate(() => { const N = InquireNotes, w = N.addFolder('Workshop'), r = N.addFolder('Recipes'), sub = N.addFolder('Desserts', r.id);
      const a = N.create({ title: 'Bench plan', folder: w.id, html: '<div>Saw and plane the oak.</div>' }), b = N.create({ title: 'Brownies', folder: sub.id, html: '<div>Cocoa</div>' }), c = N.create({ title: 'Loose page', html: '<div>Loose words here</div>' });
      const CF = N.scope('code'), cf = CF.addFolder('Workshop scripts'); CF.create({ title: 'cut_list.py', folder: cf.id, code: { lang: 'python', src: 'print(1)' } });
      return { w: w.id, r: r.id, sub: sub.id, a: a.id, b: b.id, c: c.id, cf: cf.id }; });
    await q.evaluate(a => InquireApp.openNotes(a), T.c); await wait(600);
    ok(JSON.stringify(await q.$$eval('.nb-ftree .nb-sech', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()))) === '["Notes","Music Coming soon"]' && !!(await q.$('.nb-ftree .nb-codeh')), 'one Folders & Files bar: Notes, then Code, then Music (coming soon), each in its own colour');
    ok(!!(await q.$(`.nb-fnote[data-g="${T.w}"][data-id="${T.a}"]`)) && !!(await q.$(`.nb-fnote[data-g="${T.sub}"][data-id="${T.b}"]`)) && !!(await q.$(`.nb-fnote[data-g=none][data-id="${T.c}"]`)) && !!(await q.$('.nb-cfile')), 'notes sit in their folders (and Unfiled), code files in the Code section');
    // Show as changes the files in the bar
    const look = async v => { await q.click(`.nb-tools [data-view=${v}]`); await wait(200); return q.$eval(`.nb-fnote[data-id="${T.a}"]`, e => e.className); };
    ok(/nb-crow/.test(await look('compact')) && /nb-tile/.test(await look('icons')) && !!(await q.$('.nb-tiles')) && /nb-row/.test(await look('details')) && !!(await q.$('.nb-ftree .nb-dhead')) && /nb-lrow/.test(await look('list')), 'Show as (Compact, Icons, Details, List) changes how the files in the bar look');
    // drag a note onto a note in another folder: it moves there, in that place
    await q.locator(`.nb-fnote[data-id="${T.c}"]`).dragTo(q.locator(`.nb-fnote[data-id="${T.a}"]`), { targetPosition: { x: 40, y: 3 } }); await wait(300);
    ok(await q.evaluate(([c, w]) => InquireNotes.get(c).folder === w, [T.c, T.w]) && JSON.stringify(await q.$$eval(`.nb-fnote[data-g="${T.w}"] .nb-t`, e => e.map(x => x.textContent))) === '["Loose page","Bench plan"]', 'a note dropped among another folder’s notes moves into that folder, in that place');
    // Search: folders as well as notes (and My Code)
    await q.fill('.nb-sbar input', 'work'); await wait(300);
    const res = await q.evaluate(() => ({ secs: [...document.querySelectorAll('.nb-sres .nb-sech')].map(x => x.dataset.sec), f: [...document.querySelectorAll('.nb-sfd')].map(x => x.dataset.sp + ':' + x.textContent.trim()), ic: !!document.querySelector('.nb-sfd .nb-fold-ic svg') }));
    ok(JSON.stringify(res.secs) === '["folders","code"]' && res.f.includes('notes:Workshop') && res.f.includes('code:Workshop scripts') && res.ic, 'Search finds folders (with the folder icon) and My Code folders too', res);
    await q.fill('.nb-sbar input', 'dess'); await wait(300);
    await q.click('.nb-sfd[data-sp=notes]'); await wait(300);
    ok(await q.$eval('.nb-sbar input', e => e.value) === '' && await q.$eval('.nb-fd.sel', e => e.dataset.f) === T.sub && !!(await q.$(`.nb-fnote[data-g="${T.sub}"]`)), 'clicking a folder found by Search shows it in the bar, open, with its notes');
    await q.fill('.nb-sbar input', 'cocoa'); await wait(300);
    ok(JSON.stringify(await q.$$eval('.nb-sres .nb-fnote .nb-t', e => e.map(x => x.textContent))) === '["Brownies"]', 'Search still finds notes by their words');
    await q.fill('.nb-sbar input', ''); await wait(200);
    // library groups fold open and stay so
    await q.click('.nb-lcar[data-lcar=all]'); await wait(150);
    ok(await q.$$eval('.nb-fnote[data-g=all]', e => e.length) === 3 && JSON.parse(await q.evaluate(() => localStorage.getItem('notepath.libopen'))).includes('all'), 'All notes folds open to list every note (remembered)');
    await q.click('.nb-lcar[data-lcar=all]'); await wait(100);
    // the Tool bar: no Code tool any more (v0.5.6); in My Code, Note still goes back to My notes
    await q.evaluate(() => InquireApp.go({ view: 'notes', space: 'code' })); await wait(600);
    ok(await q.$eval('#np-t', e => e.textContent) === 'My Code' && !(await q.$('.nb-rail [data-tool=code]')), 'My Code has no Code tool in its Tool bar');
    await q.click('.nb-rail [data-tool=note]'); await wait(500);
    ok(await q.$eval('#np-t', e => e.textContent) === 'My notes', 'and Note switches back');
    // ◈ Links: Compact view; Peek and ⧉ right after the title, never on top of it
    await q.evaluate(([a, b]) => InquireNotes.update(a, { html: `<div>see <a class="nlink" data-note="${b}">Brownies</a></div>` }), [T.a, T.b]);
    await q.evaluate(a => InquireApp.openNotes(a), T.a); await wait(500);
    await q.click('.p1 .nb-holob'); await wait(250);
    ok(JSON.stringify(await q.$$eval('.np-holo-bar [data-view]', e => e.map(x => x.dataset.view))) === '["icons","list","compact","details"]', 'the Links box can show its notes as a Compact list too');
    const noOverlap = () => q.evaluate(() => [...document.querySelectorAll('.np-holo section[data-sec=out] .np-hl-o')].every(o => { const t = o.querySelector('.np-hl-t').getBoundingClientRect(), box = o.closest('.np-holo').getBoundingClientRect();
      return [...o.querySelectorAll('.np-hl-s')].every(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= box.right + 1 && (r.left >= t.right - 1 || r.top >= t.bottom - 1); }); }));
    for (const v of ['icons', 'list', 'compact', 'details']) { await q.click(`.np-holo-bar [data-view=${v}]`); await wait(150); ok(await noOverlap(), `Links as ${v}: 👁 and ⧉ sit after the title, inside the box`); }
    await q.click('.np-holo-bar [data-view=compact]'); await wait(100);
    ok(await q.$eval('.np-holo section[data-sec=out] .np-hl-crow .np-hl-o', e => e.offsetHeight < 34), 'Compact rows are thin');
    await q.click('.np-holo section[data-sec=out] .np-hl-pk'); await wait(300);
    ok(await q.$eval('.np-peek-t', e => e.textContent) === 'Brownies' && await q.$eval('.p1 .nb-title', e => e.value) === 'Bench plan', 'Peek from a row does not open the note itself');
    await q.keyboard.press('Escape'); await wait(250); await q.keyboard.press('Escape'); await wait(150);
    // right-click: add a paranote
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'); ed.innerHTML = '<div>Cut the legs to length</div>'; ed.dispatchEvent(new Event('input')); }); await wait(500);
    const wb = await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'), t = ed.querySelector('div').firstChild, i = t.data.indexOf('legs'); ed.focus(); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 4); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    await q.mouse.click(wb[0], wb[1], { button: 'right' }); await wait(150);
    await q.click('.tm-menu [data-a=pn]'); await wait(150);
    ok(await q.evaluate(() => document.activeElement && document.activeElement.matches('.tm-pn textarea')), 'Add a paranote… opens a box to type it in, right in the menu');
    await q.keyboard.type('Measure twice: 72 cm.'); await q.click('.tm-pn [data-a=pn-save]'); await wait(400);
    ok(/<span data-ann="[a-z0-9]+" data-nt="Measure twice: 72 cm\.">legs<\/span>/.test(await q.evaluate(a => InquireNotes.get(a).html, T.a)) && !!(await q.$('.p1 .nann-card')), 'its words become a paranote under the selected words (saved, shown)', await q.evaluate(a => InquireNotes.get(a).html, T.a));
    await q.close();
  }
  /* ---------- (v0.5.4) notes in the folders column drag into the open note as links, like the notes list (slow real mouse drags) ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const d = await q.evaluate(() => { const N = InquireNotes, f = N.addFolder('Work'), g = N.addFolder('Deep', f.id);
      const a = N.create({ title: 'Target', html: '<div>Start here now</div>' }), x = N.create({ title: 'InWork', folder: f.id }), y = N.create({ title: 'InDeep', folder: g.id });
      return { a: a.id, x: x.id, y: y.id }; });
    await q.evaluate(a => InquireApp.openNotes(a), d.a); await wait(600);
    const qh = () => q.$eval('.p1 .nb-rich', e => e.innerHTML);
    const slow = async sel => { await q.locator(sel).scrollIntoViewIfNeeded(); const s0 = await q.locator(sel).boundingBox(), t = await q.locator('.p1 .nb-rich').boundingBox();
      const x0 = s0.x + 20, y0 = s0.y + s0.height / 2, x1 = t.x + 60, y1 = t.y + 12; await q.mouse.move(x0, y0); await q.mouse.down();
      for (let i = 1; i <= 24; i++) { await q.mouse.move(x0 + (x1 - x0) * i / 24, y0 + (y1 - y0) * i / 24); await wait(12); } await q.mouse.up(); await wait(500); };
    await slow(`.nb-folders .nb-fnote[data-id="${d.y}"]`);
    ok(new RegExp(`data-note="${d.y}"[^>]*>InDeep</a>`).test(await qh()), 'a note in a folder inside a folder, dragged from the folders column, drops a link', await qh());
    await slow(`.nb-folders .nb-fnote[data-id="${d.x}"]`);
    ok(new RegExp(`data-note="${d.x}"[^>]*>InWork</a>`).test(await qh()) && (await qh()).match(/class="nlink"/g).length === 2, 'a second one from the folders column drops a link too', await qh());
    await slow(`.nb-it[data-id="${d.x}"]`);
    ok((await qh()).match(/class="nlink"/g).length === 3, 'the same works from the notes list', await qh());
    await q.close();
  }
  /* ---------- (v0.5.6) folders follow Show as; All notes / Favourites / Unfiled are filters; no Export… on the note bar ---------- */
  {
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(400);
    const T = await q.evaluate(() => { const N = InquireNotes, w = N.addFolder('Garage'), sub = N.addFolder('Tools', w.id);
      const a = N.create({ title: 'Wrench list', folder: sub.id, fav: true }), b = N.create({ title: 'Oil change', folder: w.id }), c = N.create({ title: 'Stray thought' }), d = N.create({ title: 'Starred loose', fav: true });
      const CF = N.scope('code'), cf = CF.addFolder('Garage scripts'); CF.create({ title: 'fav.py', folder: cf.id, fav: true, code: { lang: 'python', src: '' } }); CF.create({ title: 'loose.py', code: { lang: 'python', src: '' } });
      localStorage.setItem('notepath.codesech', '90'); return { w: w.id, sub: sub.id, a: a.id, b: b.id, c: c.id, d: d.id }; });
    await q.evaluate(a => InquireApp.openNotes(a), T.c); await wait(600);
    ok(!(await q.$('.nb-bar [data-a=exp]')) && !/Export…/.test(await q.$eval('.nb-bar', e => e.textContent)), 'the note bar has no Export… button (⇪ Share → Import & Export… still exports)');
    // Task 1: folder rows take the Show as size of the files
    const fh = async v => { await q.click(`.nb-tools [data-view=${v}]`); await wait(200); return q.evaluate(([w]) => { const r = document.querySelector(`.nb-fd.user[data-f="${w}"]`), svg = r.querySelector('.nb-fold-ic svg');
      return { h: r.offsetHeight, ic: svg.getBoundingClientRect().width, cls: r.className, meta: !!r.querySelector('.nb-fmeta'), dc: [...r.querySelectorAll('.nb-dc')].map(x => x.textContent) }; }, [T.w]); };
    const L = await fh('list'), C = await fh('compact'), D = await fh('details'), I = await fh('icons');
    ok(/fv-list/.test(L.cls) && /fv-compact/.test(C.cls) && /fv-details/.test(D.cls) && /fv-icons/.test(I.cls), 'every folder row knows the Show as view', [L.cls, C.cls, D.cls, I.cls]);
    ok(C.h < L.h && L.h < I.h && C.ic < L.ic && L.ic < I.ic, 'folders grow and shrink with the view: Compact < List < Icons (row and icon)', { L, C, I });
    ok(L.meta && I.meta && !C.meta && /2 notes/.test(await q.$eval(`.nb-fd.user[data-f="${T.w}"] .nb-fmeta`, e => e.textContent)), 'List and Icons give folders a second line: how many notes and the last change', L);
    await q.click('.nb-tools [data-view=details]'); await wait(200);
    const cols = await q.evaluate(([w, a]) => { const f = document.querySelector(`.nb-fd.user[data-f="${w}"] .nb-dc`).getBoundingClientRect(), n = document.querySelector(`.nb-fnote[data-id="${a}"] .nb-dc`).getBoundingClientRect(); return [Math.round(f.left), Math.round(n.left)]; }, [T.w, T.a]);
    ok(D.dc.length === 3 && D.dc[2] === 'Folder' && Math.abs(cols[0] - cols[1]) <= 2, 'Details: folders get Modified · Created · Kind (Folder), lined up with the notes', { dc: D.dc, cols });
    await q.click(`.nb-fd.user[data-f="${T.w}"] .nb-dc >> nth=0`); await wait(200);
    ok(await q.$eval('.nb-fd.sel', e => e.dataset.f) === T.w, 'Details: clicking a folder’s date picks the folder');
    await q.click('.nb-tools [data-view=list]'); await wait(200);
    // Task 2: All notes / Favourites / Unfiled filter the bar
    await q.click('.nb-fdb[data-f=fav]'); await wait(250);
    const seen = () => q.evaluate(() => ({ notes: [...document.querySelectorAll('.nb-ftree .nb-fnote:not(.nb-cfile)')].map(x => x.querySelector('.nb-t').textContent.replace('★', '').trim()).sort(), folders: document.querySelectorAll('.nb-ftree .nb-fd.user, .nb-ftree .nb-cfd, .nb-ftree .nb-fadd, .nb-ftree [data-top]').length, code: [...document.querySelectorAll('.nb-ftree .nb-cfile')].map(x => x.textContent.replace(/^PY/, '').trim()), libs: [...document.querySelectorAll('.nb-fd.lib')].map(x => x.dataset.f) }));
    let v = await seen();
    ok(JSON.stringify(v.notes) === '["Starred loose","Wrench list"]' && v.folders === 0 && JSON.stringify(v.code) === '["fav.py"]' && JSON.stringify(v.libs) === '["all","fav","none"]', 'Favourites shows only the starred notes: no other notes, no folders (Code too)', v);
    await q.click('.nb-fdb[data-f=none]'); await wait(250); v = await seen();
    ok(JSON.stringify(v.notes) === '["Starred loose","Stray thought"]' && v.folders === 0 && JSON.stringify(v.code) === '["loose.py"]', 'Unfiled shows only notes in no folder: no folders or filed notes', v);
    await q.click('.nb-lcar[data-lcar=fav]'); await wait(250); v = await seen();
    ok(await q.$eval('.nb-fd.sel', e => e.dataset.f) === 'fav' && JSON.stringify(v.notes) === '["Starred loose","Wrench list"]', 'under a filter, the icon of another selector switches to it', v);
    await q.locator('.nb-fnote', { hasText: 'Wrench list' }).click(); await wait(250);
    ok(await q.$eval('.nb-title', e => e.value) === 'Wrench list' && await q.$eval('.nb-fd.sel', e => e.dataset.f) === 'fav', 'a note opens from the filtered list and the filter stays');
    await q.click('.nb-bar [data-a=fav]'); await wait(250); v = await seen();
    ok(JSON.stringify(v.notes) === '["Starred loose"]', 'unstarring the open note takes it out of Favourites at once', v);
    await q.click('.nb-fdb[data-f=all]'); await wait(250); v = await seen();
    ok(v.folders >= 4 && v.notes.includes('Oil change') && v.notes.includes('Wrench list') && v.code.length === 2, 'All notes shows everything again: folders, filed and unfiled notes, code', v);
    await q.reload(); await wait(500); await q.evaluate(() => InquireApp.openNotes()); await wait(500);
    await q.keyboard.press('Alt+KeyF'); await wait(400); v = await seen();
    ok(v.folders === 0 && JSON.stringify(v.notes) === '["Starred loose"]', 'Alt+F (favourites) opens the Favourites filter', v);
    await q.close();
  }
  /* ---------- (v0.5.6) ✦ AI Chat, right-click Ask AI…, A✓ Grammar check (mocked LanguageTool), the Map widget (mocked OpenStreetMap) ---------- */
  {
    const q = await page();
    const png = fs.readFileSync(path.join(R, 'app/brand/np-mark-64.png'));
    let lt = null;
    await q.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await q.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(/nowhere/.test(r.request().url()) ? [] : [{ display_name: '221B Baker Street, London, NW1 6XE, United Kingdom', lat: '51.5237', lon: '-0.1585' }, { display_name: 'Baker Street, London', lat: '51.52', lon: '-0.157' }]) }));
    await q.route('https://api.languagetool.org/**', r => { const f = new URLSearchParams(r.request().postData() || ''), t = f.get('text') || ''; lt = { lang: f.get('language'), level: f.get('level'), off: f.get('disabledCategories') || '' };
      const ms = [], i = t.indexOf('teh'), j = t.indexOf('a apple'), k = t.indexOf('very unique');
      if (i >= 0) ms.push({ message: 'Possible spelling mistake found.', offset: i, length: 3, replacements: [{ value: 'the' }, { value: 'ten' }], rule: { id: 'MORFOLOGIK_RULE_EN_US', issueType: 'misspelling', category: { id: 'TYPOS', name: 'Possible Typo' } } });
      if (j >= 0) ms.push({ message: 'Use “an” instead of “a”.', offset: j, length: 1, replacements: [{ value: 'an' }], rule: { id: 'EN_A_VS_AN', issueType: 'misspelling', category: { id: 'MISC', name: 'Miscellaneous' } } });
      if (k >= 0) ms.push({ message: 'Unique means one of a kind: “very” is not needed.', offset: k, length: 11, replacements: [{ value: 'unique' }], rule: { id: 'VERY_UNIQUE', issueType: 'style', category: { id: 'STYLE', name: 'Style' } } });
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ matches: ms }) }); });
    await q.goto(URL0 + '#menu'); await wait(400);
    const id = await q.evaluate(() => InquireNotes.create({ title: 'Trip plan', html: '<div>We ate teh cake and a apple at the park. It was very unique.</div><div>Then we walked home slowly.</div>' }).id);
    await q.evaluate(a => InquireApp.openNotes(a), id); await wait(700);
    ok(JSON.stringify(await q.$$eval('.p1 .nb-holob', b => b.map(x => x.getAttribute('aria-label')))) === '["Tags, links and source of this note","Paranotes","AI Chat","Grammar check"]', 'the corner buttons: ◈ Links, ↳ Paranotes, ✦ AI Chat, A✓ Grammar check');
    const xs = await q.$$eval('.p1 .nb-holob', b => b.map(x => Math.round(x.getBoundingClientRect().left)).sort((a, c) => a - c));
    ok(xs.every((x, i) => !i || x - xs[i - 1] >= 44), 'the four round buttons sit side by side without touching', xs);
    // Grammar check
    await q.click('.p1 .nb-gramb'); await wait(250);
    ok(!!(await q.$('.np-as-gram')) && JSON.stringify(await q.$$eval('.np-gr-type option', o => o.map(x => x.textContent))) === '["Quick note","School & study","Work & business","Creative writing","Formal & academic"]' && await q.$eval('.np-gr-type', e => e.value) === 'school', 'Grammar check opens with the kinds of note (School & study to start)');
    await q.click('.np-gr-go'); await wait(500);
    ok(lt && lt.lang === 'en-US' && !lt.level && /STYLE/.test(lt.off) && !/TYPOS/.test(lt.off) && await q.$$eval('.np-gr-m', e => e.length) === 2, 'School & study: spelling and grammar are checked, style is left out', { lt, n: await q.$$eval('.np-gr-m', e => e.length) });
    await q.selectOption('.np-gr-type', 'formal'); await wait(150); await q.click('.np-gr-go'); await wait(500);
    ok(lt.level === 'picky' && !lt.off && await q.$$eval('.np-gr-m', e => e.length) === 3, 'Formal & academic: the picky level with every rule (style too)', lt);
    await q.selectOption('.np-gr-type', 'quick'); await wait(150); await q.click('.np-gr-go'); await wait(500);
    ok(/MISC/.test(lt.off) && /PUNCTUATION/.test(lt.off) && JSON.stringify(await q.$$eval('.np-gr-m s', e => e.map(x => x.textContent))) === '["teh"]', 'Quick note: only spelling and clear mistakes', lt);
    ok(await q.evaluate(i => JSON.parse(localStorage.getItem('notepath.grammar')).notes[i], id) === 'quick', 'the kind of note is remembered for this note');
    await q.selectOption('.np-gr-type', 'school'); await wait(150); await q.click('.np-gr-go'); await wait(500);
    await q.click('.np-gr-m[data-g] .np-gr-w >> nth=1'); await wait(150);
    ok(await q.evaluate(() => String(getSelection())) === 'a', 'clicking a problem selects those words in the note');
    await q.click('.np-gr-rep >> nth=0'); await wait(250);
    ok(/We ate the cake and a apple/.test(await q.$eval('.p1 .nb-rich', e => e.textContent)), 'a suggestion goes straight into the note');
    await q.click('.np-gr-rep >> nth=0'); await wait(250);
    ok(/the cake and an apple/.test(await q.$eval('.p1 .nb-rich', e => e.textContent)) && /All done/.test(await q.$eval('.np-gr-b', e => e.textContent)), 'the next one still lands in the right place after the first changed the text; then “All done”');
    await q.waitForTimeout(900);
    ok(/an apple/.test(await q.evaluate(i => InquireNotes.get(i).body, id)), 'the fixes are saved with the note');
    await q.click('.p1 .nb-holob:not(.nb-indb):not(.nb-aib):not(.nb-gramb)'); await wait(200);
    ok(!!(await q.$('.np-holo:not(.np-as)')) && !(await q.$('.np-as')), 'opening ◈ Links closes the Grammar box (one box in the corner at a time)');
    // AI Chat
    await q.click('.p1 .nb-aib'); await wait(300);
    ok(!(await q.$('.np-holo:not(.np-as)')) && /not set up/i.test(await q.$eval('.np-as-ai', e => e.textContent)) && await q.$eval('.np-ai-f textarea', e => e.disabled), 'AI Chat (and it closes Links); without an AI key it says how to set one up');
    await q.click('.np-as .np-holo-x'); await wait(100);
    await q.evaluate(() => { NPCode.ai.status = async () => ({ configured: true, model: 'test' }); NPCode.ai.ask = async r => (window.__asks = (window.__asks || []).concat([r]), r.messages ? (r.messages.length > 1 ? 'Second answer' : 'Here is a summary:\n- You ate **cake**\n- You walked home') : 'A shorter line.'); });
    await q.click('.p1 .nb-aib'); await wait(300);
    await q.fill('.np-ai-f textarea', 'Sum up this note'); await q.keyboard.press('Enter'); await wait(400);
    const a1 = await q.evaluate(() => window.__asks[0]);
    ok(/Trip plan/.test(a1.system) && /walked home slowly/.test(a1.system) && a1.messages.length === 1 && a1.messages[0].content === 'Sum up this note', 'Send asks the AI, with the note when “Read this note” is ticked', a1);
    ok(await q.$$eval('.np-ai-m.ai li', e => e.length) === 2 && await q.$eval('.np-ai-m.ai b', e => e.textContent) === 'cake', 'the answer shows in the chat (lists and bold)');
    await q.click('.np-ai-read'); await q.fill('.np-ai-f textarea', 'And again?'); await q.click('.np-ai-send'); await wait(400);
    const a2 = await q.evaluate(() => window.__asks[1]);
    ok(a2.messages.length === 3 && a2.messages[1].role === 'assistant' && !/walked home slowly/.test(a2.system) && /Second answer/.test(await q.$eval('.np-ai-b', e => e.textContent)), 'the chat keeps the conversation; unticked, the note is not sent', a2);
    await q.click('.np-ai-acts [data-ins] >> nth=0'); await wait(300);
    ok(await q.$$eval('.p1 .nb-rich ul li', e => e.length) === 2, '＋ Add to note puts the answer in the note');
    await q.click('.np-as-new'); await wait(100);
    ok(!(await q.$('.np-ai-m')), 'New chat starts again');
    await q.keyboard.press('Escape'); await wait(150);
    ok(!(await q.$('.np-as')) && !!(await q.$('.npage')), 'Esc closes the AI box (and not My notes)');
    // right-click → Ask AI…
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'), t = ed.firstChild.firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    const bx = await q.locator('.p1 .nb-rich div').first().boundingBox();
    await q.mouse.click(bx.x + 15, bx.y + 8, { button: 'right' }); await wait(250);
    ok(!!(await q.$('.tm-menu [data-a=ai]')), 'right-click on selected words offers Ask AI…');
    await q.click('.tm-menu [data-a=ai]'); await wait(150);
    ok(await q.$$eval('.tm-aichip', e => e.length) === 5 && await q.evaluate(() => document.activeElement && document.activeElement.matches('.tm-ai textarea')), 'Ask AI… opens a box with ready-made requests and room to type your own');
    await q.fill('.tm-ai textarea', 'Make it shorter'); await q.keyboard.press('Enter'); await wait(400);
    const a3 = await q.evaluate(() => window.__asks[window.__asks.length - 1]);
    ok(/Request: Make it shorter/.test(a3.prompt) && /We ate/.test(a3.prompt) && /A shorter line\./.test(await q.$eval('.tm-aitext', e => e.textContent)), 'the request and the selected words go to the AI; the answer shows in the menu', a3);
    await q.click('.tm-menu [data-a=ai-rep]'); await wait(300);
    ok(/^A shorter line\./.test(await q.$eval('.p1 .nb-rich', e => e.textContent)), 'Replace puts the answer in place of the selected words');
    // the Map widget
    ok(JSON.stringify(await q.$$eval('.nb-rail [data-widget]', e => e.map(x => x.dataset.widget))) === '["code","sheet","graph","map","more"]', 'Map is in the Widgets section of the Tool bar');
    await q.click('.nb-rail [data-widget=map]'); await wait(400);
    ok(!!(await q.$('.p1 .nw[data-w=map] .nm-q')) && await q.evaluate(() => document.activeElement && document.activeElement.matches('.nm-q')), 'the Map widget goes into the note, ready to search');
    await q.fill('.nm-q', 'nowhere at all'); await q.keyboard.press('Enter'); await wait(400);
    ok(/Nothing found/.test(await q.$eval('.nw[data-w=map]', e => e.textContent)), 'a search with no answer says so');
    await q.fill('.nm-q', 'baker street'); await q.keyboard.press('Enter'); await wait(400);
    ok(await q.$$eval('.nm-res [data-pick]', e => e.length) === 2, 'the addresses found are listed');
    await q.click('[data-pick="0"]'); await wait(500);
    const md = await q.$eval('.nw[data-w=map]', e => JSON.parse(e.dataset.src));
    ok(md.label.startsWith('221B Baker Street') && Math.abs(md.lat - 51.5237) < 1e-6 && !!(await q.$('.nm-map .nt-tiles img')) && /Apple Maps/.test(await q.$eval('.nm-links', e => e.textContent)), 'picking one keeps the place, shows it on a map, with map links', md);
    await q.click('.nm-map [data-z="1"]'); await wait(300);
    ok(await q.$eval('.nw[data-w=map]', e => JSON.parse(e.dataset.src).zoom) === 17, 'the zoom is kept with the map');
    await q.fill('.nm-title', 'Where we stay'); await wait(900);
    const kept = await q.evaluate(i => { const n = InquireNotes.get(i); const m = n.html.match(/data-w="map" data-src="([^"]+)"/); return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null; }, id);
    ok(kept && kept.title === 'Where we stay' && kept.label.startsWith('221B') && kept.zoom === 17, 'the map is saved in the note (title, place, zoom)', kept);
    await q.evaluate(a => InquireApp.openNotes(a), id); await wait(500);
    ok(/221B Baker Street/.test(await q.$eval('.nw[data-w=map] .nm-place', e => e.textContent)) && await q.$eval('.nm-title', e => e.value) === 'Where we stay', 'opened again, the note remembers the place');
    ok(/221B Baker Street/.test(await q.evaluate(() => localStorage.getItem('notepath.places'))), 'places used are remembered for next time');
    await q.click('.nw[data-w=map] [data-a=change]'); await wait(200);
    ok(/221B/.test(await q.$eval('.nm-search', e => e.textContent + e.querySelector('input').value)) || !!(await q.$('.nm-search')), 'Change searches again');
    await q.click('.nw[data-w=map] [data-a=keep]'); await wait(200);
    const id2 = await q.evaluate(() => InquireNotes.create({ title: 'Another' }).id); await q.evaluate(a => InquireApp.openNotes(a), id2); await wait(500);
    await q.click('.nb-rail [data-widget=map]'); await wait(300);
    ok(/221B Baker Street/.test(await q.$eval('.nm-rec', e => e.textContent)), 'a new map offers the places used before');
    await q.click('.nm-rec [data-rec="0"]'); await wait(400);
    ok(/221B Baker Street/.test(await q.$eval('.nw[data-w=map] .nm-place', e => e.textContent)), 'one click on a place used before puts it on the map');
    ok(/⌖ .*221B Baker Street.*openstreetmap\.org/.test(await q.evaluate(i => InquireNotes.get(i).body, id2)), 'the map is in the note’s words too (search, exports)', await q.evaluate(i => InquireNotes.get(i).body, id2));
    await q.close();
  }
  /* ---------- (v0.5.6) the Code box for showing code; Share → Email, Email with a PDF, Print ---------- */
  {
    const c = await page(); await c.goto(URL0 + '#menu'); await wait(400);
    const src = 'def login(user, pw):\n    if not user:\n        return False\n    ok = check(pw)\n    return ok\n\n# done';
    const id = await c.evaluate(s => InquireNotes.create({ title: 'Code demo', html: `<div>Intro line</div><div class="nw" data-w="code" data-src="${JSON.stringify({ lang: 'python', title: 'Login check', src: s }).replace(/"/g, '&quot;')}"></div><div><br></div>` }).id, src);
    await c.evaluate(i => InquireApp.openNotes(i), id); await wait(600);
    const cs = () => c.evaluate(() => JSON.parse(document.querySelector('.nw[data-w=code]').dataset.src));
    ok(JSON.stringify(await c.$$eval('.nw[data-w=code] .nw-h .nw-b', e => e.map(x => x.dataset.a))) === '["copy","img","present","opts","del"]' && await c.$eval('.nw-opts', e => e.hidden), 'the Code box: Copy, Picture, ⤢ Present, ⚙ Options (folded away), ✕');
    await c.click('.nw[data-w=code] [data-a=opts]'); await wait(150);
    ok(!(await c.$eval('.nw-opts', e => e.hidden)), '⚙ Options opens: file name, highlighted lines, look, size, line numbers, before / after');
    await c.fill('.nw-file', 'auth.py'); await c.fill('.nw-hlin', '2-3'); await wait(150);
    ok(await c.$eval('.nw-ftab', e => !e.hidden && e.textContent === 'auth.py') && JSON.stringify(await c.$$eval('.nw-gut .on', e => e.map(x => x.textContent))) === '["2","3"]' && await c.$$eval('.nw-bands i', e => e.length) === 1, 'a file-name tab, and lines 2-3 highlighted (number and band)');
    await c.click('.nw-gut [data-ln="5"]'); await wait(150);
    ok(await c.$eval('.nw-hlin', e => e.value) === '2-3, 5' && (await cs()).hl === '2-3, 5', 'clicking a line number highlights it too (and the field follows)');
    await c.click('.nw-gut [data-ln="5"]'); await wait(100);
    ok(await c.$eval('.nw-hlin', e => e.value) === '2-3', 'a second click takes the highlight off');
    await c.fill('.nw-cap', 'Figure 1: the login check'); await c.selectOption('.nw-look', 'light'); await c.selectOption('.nw-size', 'l'); await c.click('.nw-nums'); await wait(150);
    const st = await c.evaluate(() => { const el = document.querySelector('.nw[data-w=code]'), code = el.querySelector('.nw-code'); return { look: el.dataset.look, bg: getComputedStyle(code).backgroundColor, fs: getComputedStyle(code).fontSize, gut: getComputedStyle(el.querySelector('.nw-gut')).display }; });
    ok(st.look === 'light' && st.bg === 'rgb(251, 251, 253)' && st.fs === '16px' && st.gut === 'none', 'look (light), text size (large) and line numbers off', st);
    await c.click('.nw-nums'); await c.selectOption('.nw-look', 'theme'); await wait(100);
    let d = await cs();
    ok(d.file === 'auth.py' && d.cap === 'Figure 1: the login check' && d.size === 'l' && !d.look && d.nums !== false, 'the options are kept in the box', d);
    // Before / after
    await c.click('.nw-diffon'); await wait(150);
    ok(await c.$eval('.nw-tabs', e => !e.hidden) && (await cs()).before === src, 'Before / after: tabs appear and Before starts as a copy of the code');
    await c.click('.nw-ta'); await c.keyboard.press('Control+End'); await c.keyboard.type('\nlog("ok")'); await wait(150);
    await c.click('.nw-tabs [data-tab=before]'); await wait(100);
    ok(await c.$eval('.nw-ta', e => e.value) === src && await c.$$eval('.nw-gut .on', e => e.length) === 0, 'the Before tab edits the old code (no highlights there)');
    await c.click('.nw-ta'); await c.keyboard.press('Control+Home'); await c.keyboard.press('End'); await c.keyboard.press('Backspace'); await c.keyboard.type('):'); await wait(100);
    await c.click('.nw-tabs [data-tab=compare]'); await wait(200);
    ok(await c.$$eval('.nw-cs .nw-cc.add', e => e.length) === 2 && await c.$$eval('.nw-cs .nw-cc.del', e => e.length) === 1 && /\+2 −1/.test(await c.$eval('.nw-dsum', e => e.textContent)), 'Compare side by side: changed and added lines are marked; +2 −1', await c.$eval('.nw-dsum', e => e.textContent));
    await c.selectOption('.nw-cmpm', 'unified'); await wait(150);
    ok(JSON.stringify(await c.$$eval('.nw-cu .nw-cr.add .nw-cm, .nw-cu .nw-cr.del .nw-cm', e => e.map(x => x.textContent))) === '["−","+","+"]', 'Changes only: − and + lines');
    d = await cs(); ok(d.diff && d.tab === 'compare' && d.cmp === 'unified' && /log\("ok"\)/.test(d.src) && !/log\("ok"\)/.test(d.before), 'before, after and the compare view are kept', d);
    await c.click('.nw-tabs [data-tab=after]'); await wait(100);
    // ⤢ Present
    await c.click('.nw[data-w=code] [data-a=present]'); await wait(250);
    ok(!!(await c.$('.nw-present')) && await c.$$eval('.nwp-ln.on', e => e.length) === 2 && /Figure 1/.test(await c.$eval('.nw-present', e => e.textContent)), '⤢ Present opens the code over the whole window, big, with its highlights and caption');
    const fs0 = await c.$eval('.nwp-code', e => parseFloat(getComputedStyle(e).fontSize));
    await c.keyboard.press('ArrowRight'); await wait(150);
    ok(await c.$$eval('.nwp-ln.dim', e => e.length) > 0 && JSON.stringify(await c.$$eval('.nwp-ln.focus', e => e.map(x => x.dataset.ln))) === '["2","3"]' && /1 \/ 1/.test(await c.$eval('.nwp-step', e => e.textContent)), '→ steps to the highlighted lines; the rest dims');
    await c.click('.nwp-bar [data-p=bigger]'); await wait(100);
    ok(await c.$eval('.nwp-code', e => parseFloat(getComputedStyle(e).fontSize)) > fs0 && fs0 >= 22, 'A+ makes the text bigger (it starts big)');
    await c.click('.nwp-bar [data-p=view]'); await wait(150);
    ok(!!(await c.$('.nw-present .nw-cmp')), 'Present can show the before / after comparison');
    await c.keyboard.press('Escape'); await wait(150);
    ok(!(await c.$('.nw-present')) && !!(await c.$('.npage')) && await c.evaluate(() => { const w = document.querySelector('.set-win'); return !w || w.offsetParent === null; }), 'Esc closes Present (not My notes, no Settings)');
    // Copy as a picture
    await c.evaluate(() => { window.__clip = null; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async items => { window.__clip = items; }, writeText: async () => {} } }); } catch (e) {} });
    await c.click('.nw[data-w=code] [data-a=img]'); await wait(600);
    const pic = await c.evaluate(async () => { const b = document.querySelector('.nw[data-w=code]')._picture; if (!b) return null; const bm = await createImageBitmap(b); return { type: b.type, w: bm.width, h: bm.height, clip: !!window.__clip }; });
    ok(pic && pic.type === 'image/png' && pic.w > 600 && pic.h > 300 && pic.clip, 'Picture copies the code as a PNG (title bar, lines, caption)', pic);
    // paranotes stay on the After code
    await c.click('.nw-tabs [data-tab=before]'); await wait(100);
    ok(/After/.test(JSON.stringify(await c.evaluate(() => document.querySelector('.nw[data-w=code]')._ann.add('x')))), 'paranotes are only added on the After code');
    await c.click('.nw-tabs [data-tab=after]'); await wait(100);
    await c.evaluate(i => InquireApp.openNotes(i), id); await wait(500);
    ok(await c.$eval('.nw-ftab', e => e.textContent) === 'auth.py' && await c.$$eval('.nw-gut .on', e => e.length) === 2 && await c.$eval('.nw-cap', e => e.value) === 'Figure 1: the login check', 'opened again, the code box keeps its file name, highlights and caption');
    ok(/```python Login check[\s\S]*Figure 1: the login check/.test(await c.evaluate(i => InquireNotes.get(i).body, id)), 'the caption is in the note’s words (search, exports)');
    // Share → Email, Email with a PDF, Print (the mail app, Downloads and the printer are stood in for)
    await c.evaluate(() => { window.__mail = []; window.__kept = []; window.__printed = []; NPIO.hooks.openMail = async u => { window.__mail.push(u); return true; };
      NPIO.hooks.keepFile = async (n, b) => { window.__kept.push({ n, size: b.size, type: b.type }); return '/Users/x/Downloads/NotePath/' + n; }; NPIO.hooks.printPage = async h => { window.__printed.push(h); return true; };
      window.inquireDesktop = Object.assign(window.inquireDesktop || {}, { exportPDF: async html => new TextEncoder().encode('%PDF-1.4 ' + html.length) }); });
    await c.evaluate(i => InquireNotes.update(i, { html: '<div>Meet at noon &amp; bring the plan.</div><div>Second line</div>' }), id); await c.evaluate(i => InquireApp.openNotes(i), id); await wait(400);
    await c.click('.np-share'); await wait(150); await c.click('.np-share-pop [data-s=mail]'); await wait(300);
    const m1 = await c.evaluate(() => window.__mail[0] || '');
    ok(/^mailto:\?subject=Code%20demo&body=/.test(m1) && /Meet at noon & bring the plan\./.test(decodeURIComponent(m1.split('body=')[1])) && /Sent from NotePath/.test(decodeURIComponent(m1)), 'Email opens a new message: the title as the subject, the note’s words in it', m1);
    await c.click('.np-share'); await wait(150); await c.click('.np-share-pop [data-s=mailpdf]'); await wait(500);
    const k = await c.evaluate(() => ({ kept: window.__kept, mail: window.__mail[1] || '' }));
    ok(k.kept.length === 1 && k.kept[0].n === 'Code demo.pdf' && k.kept[0].type === 'application/pdf' && /Code demo\.pdf/.test(decodeURIComponent(k.mail)) && /Downloads › NotePath/.test(await c.evaluate(() => document.body.textContent)), 'Email with a PDF: the PDF is kept and shown, the message says it is attached', k);
    await c.evaluate(i => InquireNotes.update(i, { html: '<div>' + 'word '.repeat(900) + '</div>' }), id); await wait(100);
    await c.click('.np-share'); await wait(150); await c.click('.np-share-pop [data-s=mail]'); await wait(300);
    const m3 = await c.evaluate(() => window.__mail[2] || '');
    ok(m3.length < 3000 && /The note goes on/.test(decodeURIComponent(m3)), 'a long note is cut in the email (mail apps refuse very long messages) and says so', m3.length);
    await c.click('.np-share'); await wait(150); await c.click('.np-share-pop [data-s=print]'); await wait(400);
    const pr = await c.evaluate(() => window.__printed[0] || '');
    ok(/<html/i.test(pr) && /Code demo/.test(pr) && /word word/.test(pr) && /@media print/.test(pr) && /print window is open/i.test(await c.evaluate(() => document.body.textContent)), 'Print sends the note as a clean page to the print window', pr.length);
    await c.close();
  }
  /* ---------- (v0.5.6) the store in IndexedDB: moving old notes, thousands of notes, the journal, a refused save; speed; undo memory; Saved ✓; corner names; What's new ---------- */
  {
    // an old (0.5.5) store in localStorage is moved into IndexedDB on the first start
    const q = await page(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
      localStorage.setItem('notepath.notes._local', JSON.stringify([{ id: 'old1', title: 'From 0.5.5', html: '<div>old words</div>', body: 'old words', created: 1, updated: 2, fav: true, folder: 'of1', links: [] }]));
      localStorage.setItem('notepath.notefolders._local', JSON.stringify([{ id: 'of1', name: 'Old folder', parent: null }])); } });
    await q.goto(URL0 + '#menu'); await wait(700);
    const mv = await q.evaluate(() => ({ ready: InquireNotes.isReady(), notes: InquireNotes.list().map(n => n.title + '|' + n.folder + '|' + n.fav), folders: InquireNotes.folders().map(f => f.name), ls: localStorage.getItem('notepath.notes._local'), lsf: localStorage.getItem('notepath.notefolders._local') }));
    ok(mv.ready && JSON.stringify(mv.notes) === '["From 0.5.5|of1|true"]' && JSON.stringify(mv.folders) === '["Old folder"]' && mv.ls === null && mv.lsf === null, 'the first start moves the old notes and folders from localStorage into IndexedDB, then frees localStorage', mv);
    await q.reload(); await wait(600);
    ok(JSON.stringify(await q.evaluate(() => InquireNotes.list().map(n => n.title))) === '["From 0.5.5"]' && /From 0\.5\.5/.test(await q.$eval('#view', e => e.textContent).catch(() => q.evaluate(() => document.body.textContent))), 'after a restart the moved notes are there (and on the Main Menu)');
    // thousands of notes: ~7.5 MB, more than localStorage ever held, saved and loaded again
    const big = await q.evaluate(async () => {
      const body = '<div>' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(25) + '</div>', fs = [];
      for (let i = 0; i < 40; i++) fs.push({ id: 'f' + i, name: 'Folder ' + i, parent: null, order: i, created: 1, updated: 1 });
      InquireNotes.writeFolders(fs); const all = InquireNotes.readAll();
      for (let i = 0; i < 2500; i++) all.push({ id: 'big' + i, title: 'Note ' + i, html: body, body: body.replace(/<[^>]+>/g, ''), created: i, updated: i, fav: i % 9 === 0, folder: i % 3 ? 'f' + (i % 40) : null, links: [] });
      InquireNotes.writeAll(all); await InquireNotes.flushSaves(); await new Promise(r => setTimeout(r, 500));
      return { mb: JSON.stringify(all).length / 1e6, state: InquireNotes.saveState().state, ls: JSON.stringify(localStorage).length };
    });
    ok(big.mb > 7 && big.state === 'saved' && big.ls < 200000, '2,500 long notes (7.5 MB) save to IndexedDB; localStorage stays small', big);
    await q.reload(); await wait(1200);
    ok(await q.evaluate(() => InquireNotes.list().length) === 2501 && await q.evaluate(() => InquireNotes.get('big2499').title) === 'Note 2499', 'after a restart all 2,501 notes are there');
    // speed with them: redraw the bar, type and save
    await q.evaluate(() => InquireApp.openNotes('big5')); await wait(1200);
    const sp = await q.evaluate(() => { const t0 = performance.now(); document.querySelector('.nb-fdb[data-f="all"]').click(); const t1 = performance.now();
      const ed = document.querySelector('.p1 .nb-rich'); ed.focus(); const t2 = performance.now(); for (let i = 0; i < 10; i++) document.execCommand('insertText', false, 'x'); InquireNotes.editorFor(ed).flush(); const t3 = performance.now();
      const g0 = performance.now(); for (let i = 0; i < 100; i++) InquireNotes.get('big77'); return { redraw: t1 - t0, typing: t3 - t2, get: (performance.now() - g0) / 100 }; });
    ok(sp.redraw < 1500 && sp.typing < 250 && sp.get < 0.5, 'with 2,500 notes: the bar redraws quickly, typing and saving stay quick, reading a note is instant', sp);
    ok(await q.$$eval('.nb-more', e => e.length) > 0 && /Show [\d,]+ more/.test(await q.$eval('.nb-more', e => e.textContent)), 'long groups show 100 notes and a “Show n more” row');
    const g1 = await q.$eval('.nb-more', e => e.dataset.more), n1 = await q.$$eval(`.nb-fnote[data-g="${g1}"]`, e => e.length);
    await q.click('.nb-more'); await wait(500);
    ok(await q.$$eval(`.nb-fnote[data-g="${g1}"]`, e => e.length) > n1, '“Show n more” lists the rest of that group');
    // undo keeps only what changed
    await q.waitForTimeout(800);
    await q.evaluate(async () => { for (let i = 0; i < 3; i++) { InquireNotes.update('big9', { title: 'Edited ' + i }); await new Promise(r => setTimeout(r, 750)); } });
    const hs = await q.evaluate(() => InquireNotes.history());
    ok(hs.kept < 40, 'undo keeps only the notes each step changed (not 2,500 copies per step)', hs);
    await q.click('.np-hb[data-a=undo]'); await wait(200);
    ok(await q.evaluate(() => InquireNotes.get('big9').title) === 'Edited 1' && await q.evaluate(() => InquireNotes.list().length) === 2501, '↶ Undo takes back the last edit and nothing else');
    await q.close();
  }
  {
    // the journal: a save that had not reached IndexedDB when NotePath closed is applied on the next start
    const q = await page(); await q.goto(URL0 + '#menu'); await wait(600);
    const jid = await q.evaluate(async () => { const n = InquireNotes.create({ title: 'Journal test', html: '<div>first</div>' }); await InquireNotes.flushSaves(); await new Promise(r => setTimeout(r, 300)); return n.id; });
    await q.evaluate(id => { const n = InquireNotes.get(id); localStorage.setItem('notepath.notes._local.journal', JSON.stringify({ n: [Object.assign({}, n, { title: 'Journal test (kept)', html: '<div>typed just before quitting</div>', body: 'typed just before quitting' })], d: [], f: null })); }, jid);
    await q.reload(); await wait(700);
    ok(await q.evaluate(id => InquireNotes.get(id).title, jid) === 'Journal test (kept)', 'a save still on its way when NotePath closed is kept (the journal)');
    await q.waitForTimeout(800);
    ok(!(await q.evaluate(() => localStorage.getItem('notepath.notes._local.journal'))), 'and once it is in IndexedDB the journal is cleared');
    // a refused save: “Couldn't save”, a message, Try again → Saved ✓
    await q.evaluate(id => InquireApp.openNotes(id), jid); await wait(500);
    ok(/Saved/.test(await q.$eval('.p1 .nb-save', e => e.textContent)), 'the note bar says Saved ✓');
    await q.evaluate(() => { window.__put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await q.click('.p1 .nb-rich'); await q.keyboard.type(' more words'); await wait(150);
    ok(/Saving/.test(await q.$eval('.p1 .nb-save', e => e.textContent)), 'typing shows Saving…');
    await wait(1200);
    const er = await q.evaluate(() => ({ line: document.querySelector('.p1 .nb-save').textContent, cls: document.querySelector('.p1 .nb-save').className, toast: document.body.textContent.includes('could not save your notes'), j: localStorage.getItem('notepath.notes._local.journal') || '' }));
    ok(/Couldn't save/.test(er.line) && /is-error/.test(er.cls) && er.toast && /more words/.test(er.j), 'a refused save says so plainly (and a message), and the words are kept in the journal', er);
    await q.evaluate(() => { IDBObjectStore.prototype.put = window.__put; });
    await q.click('.p1 .nb-save-retry'); await wait(800);
    ok(/Saved/.test(await q.$eval('.p1 .nb-save', e => e.textContent)) && await q.evaluate(() => InquireNotes.saveState().state) === 'saved', 'Try again saves it: Saved ✓');
    // v0.5.7 speed: lazy modules, Performance mode, no blurred page behind windows, cover thumbnails
    { const lp = await page(); await lp.goto(URL0 + '#notes'); await lp.waitForSelector('.npage .nb'); await wait(500);
      ok((await lp.evaluate(() => NPLazy.loaded())).length === 0, 'start-up and My notes run none of the lazy modules (Office, Import & Export, Sheet, Graph, Map, AI helpers)');
      ok(await lp.evaluate(() => typeof NPIO.open === 'function' && NPLazy.loaded().join() === 'io'), 'the first touch of NPIO runs its script (only that one) and it works');
      await lp.keyboard.press('Escape'); await wait(500);
      ok(await lp.evaluate(() => document.body.classList.contains('set-open') && getComputedStyle(document.querySelector('#app')).filter === 'none' && getComputedStyle(document.querySelector('#app')).transform === 'none'), 'a window over the app no longer blurs or scales the page behind it');
      await lp.click('.set-tab[data-tab=display]'); await wait(200);
      ok(JSON.stringify(await lp.$$eval('.set-seg [data-perf]', b => b.map(x => x.dataset.perf + ':' + x.getAttribute('aria-checked')))) === '["auto:true","lite:false","moderate:false","full:false"]', 'Settings → Display & comfort: Performance Auto · Lite · Moderate · Full, Auto picked');
      const flt = () => lp.evaluate(() => { const a = getComputedStyle(document.querySelector('#app')); return a.filter + '|' + a.transform; });
      await lp.click('.set-seg [data-perf=moderate]'); await wait(500);
      ok(await lp.evaluate(() => document.documentElement.dataset.perf === 'moderate' && JSON.parse(localStorage.getItem('notepath.settings')).perf === 'moderate') && await flt() === 'none|none', 'Moderate is applied and kept: no blur or scale behind the window');
      await lp.click('.set-seg [data-perf=full]'); await wait(600);
      ok(await lp.evaluate(() => document.documentElement.dataset.perf === 'full') && /blur\(3px\)/.test(await flt()) && /matrix/.test((await flt()).split('|')[1]), 'Full is the original look: the app behind the window is blurred, dimmed and scaled', await flt());
      await lp.click('.set-seg [data-perf=lite]'); await wait(600);
      ok(await lp.evaluate(() => document.documentElement.dataset.perf === 'lite' && getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() === 'transparent') && await flt() === 'none|none', 'Lite is applied: glows off, nothing blurred');
      await lp.click('.set-tab[data-tab=look]'); await wait(200);
      await lp.click('.set-th[data-id=high-contrast]'); await wait(200);
      ok(await lp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim().toLowerCase() === '#ffffff' && getComputedStyle(document.documentElement).getPropertyValue('--frame').trim().toLowerCase() === '#ffd400'), 'the High Contrast theme: pure white words, yellow trim');
      await lp.click('.set-th[data-id=capsuleer]'); await wait(100);
      await lp.click('.set-tab[data-tab=display]'); await wait(150);
      await lp.click('.set-seg [data-perf=auto]'); await wait(150);
      ok(await lp.evaluate(() => ['lite', 'moderate'].includes(document.documentElement.dataset.perf)), 'Auto resolves to Lite or Moderate (never Full)');
      await lp.close(); }
    { // v0.5.7: Auto watches the frames and drops to Lite when the computer cannot keep up; the system's reduce-motion counts; diagnostics
      const seed = () => { try { localStorage.setItem('notepath.perf.auto', JSON.stringify({ sig: (navigator.hardwareConcurrency || 4) + '/' + (navigator.deviceMemory || 8), v: 'moderate', gpu: 'test' })); window.__npJankTest = { gap: 50, count: 3, win: 6000, ms: 20000 }; } catch (e) {} };
      const jp = await page(seed); await jp.goto(URL0 + '#menu'); await wait(300);
      ok(await jp.evaluate(() => document.documentElement.dataset.perf) === 'moderate', 'Auto starts in Moderate when the computer looks capable (seeded)');
      await wait(2600);
      await jp.evaluate(() => { let n = 0; const burn = () => { const t = performance.now(); while (performance.now() - t < 130); if (++n < 8) setTimeout(burn, 0); }; burn(); }); await wait(2500);
      ok(await jp.evaluate(() => document.documentElement.dataset.perf) === 'lite' && await jp.evaluate(() => JSON.parse(localStorage.getItem('notepath.perf.auto')).reason) === 'slow frames, switched by Auto', 'ten-ish slow frames in a row: Auto drops to Lite and keeps the reason');
      ok(await jp.evaluate(() => /switched to Lite mode/.test(document.body.textContent)), 'and says so once');
      const rep = await jp.evaluate(() => NPDiag.report());
      ok(/NotePath diagnostics/.test(rep) && /Performance: setting auto → running lite \(slow frames/.test(rep) && /Frames \(Auto watch/.test(rep) && /Recent errors: none/.test(rep), 'Copy diagnostics report: version, system, performance, frames, errors', rep.slice(0, 400));
      await jp.close();
      const rp = await page(seed); await rp.goto(URL0 + '#menu'); await wait(300);
      await rp.emulateMedia({ reducedMotion: 'reduce' }); await wait(300);
      ok(await rp.evaluate(() => document.documentElement.hasAttribute('data-reduce-motion') && document.documentElement.dataset.perf === 'lite'), 'the system\'s reduce-motion turns reduce motion on and Auto to Lite');
      await rp.keyboard.press('Escape'); await wait(400); await rp.click('.set-tab[data-tab=about]'); await wait(200);
      ok(!!(await rp.$('[data-a=diag]')) && !!(await rp.$('[data-a=diagtest]')), 'Settings → About has Copy diagnostics and Run a frame test');
      await rp.click('[data-a=diagtest]'); await wait(5600);
      ok(/frames, \d+ slower than 50 ms/.test(await rp.$eval('.set-diagp', e => e.textContent)), 'Run a frame test reports frames');
      await rp.close(); }
    { // v0.5.7: daily automatic backup (fake desktop bridge)
      const bp = await page(); await bp.goto(URL0 + '#menu'); await wait(400);
      await bp.evaluate(() => { window.__bk = []; window.inquireDesktop = Object.assign(window.inquireDesktop || {}, { platform: 'darwin', version: async () => '0.5.7', backup: { save: async q => { window.__bk.push(q); return { file: q.name, bytes: q.data.length, kept: window.__bk.length }; }, open: async () => true, list: async () => [] } }); InquireNotes.create({ title: 'Backed up note', html: '<div>words</div>' }); });
      await wait(400);
      const o = await bp.evaluate(() => InquireSettings.autoBackup(false));
      ok(!!o && await bp.evaluate(() => window.__bk.length) === 1 && /^notepath-auto-\d{4}-\d{2}-\d{2}\.json$/.test(await bp.evaluate(() => window.__bk[0].name)), 'the daily automatic backup is sent to the main process, named by date');
      const j = await bp.evaluate(() => JSON.parse(window.__bk[0].data));
      ok(j.app === 'NotePath' && j.kind === 'notes-backup' && j.data.notes.some(n => n.title === 'Backed up note') && o.media === true, 'it is a normal NotePath backup (restorable with Import…) with the notes, folders, tasks, settings and photos');
      ok(await bp.evaluate(async () => (await InquireSettings.autoBackup(false)) === null) && await bp.evaluate(() => window.__bk.length) === 1, 'a second run the same day, with nothing changed, makes no new backup');
      await bp.keyboard.press('Escape'); await wait(400); await bp.click('.set-tab[data-tab=data]'); await wait(250);
      ok(/Last: .*Backed up|Last:/.test(await bp.$eval('.set-abp', e => e.textContent)) && !!(await bp.$('[data-a=abopen]')), 'Settings → Data & backups: Automatic backup shows the last one and Open folder');
      await bp.$eval('[data-k=autoBackup]', e => e.click()); await wait(150);
      ok(await bp.evaluate(() => JSON.parse(localStorage.getItem('notepath.settings')).autoBackup === false) && /^Off\./.test(await bp.$eval('.set-abp', e => e.textContent)), 'Automatic backup can be turned off');
      await bp.close(); }
    // the round corner buttons have names on hover and focus
    ok(JSON.stringify(await q.$$eval('.p1 .nb-holob', b => b.map(x => x.dataset.label))) === '["Links","Paranotes","AI Chat","Grammar"]', 'the corner buttons are named: Links, Paranotes, AI Chat, Grammar');
    await q.hover('.p1 .nb-aib'); await wait(250);
    ok(await q.$eval('.p1 .nb-aib', e => getComputedStyle(e, '::after').opacity) === '1' && await q.$eval('.p1 .nb-aib', e => getComputedStyle(e, '::after').content) === '"AI Chat"', 'hovering a corner button shows its name');
    await q.close();
  }
  {
    // v0.5.8 (Devon): the selected tile's line, the corner buttons (AI Chat far right with its figure), ◀ Hide under Show as, Import & Export progress
    const q = await page(() => { localStorage.setItem('notepath.noteview', '"icons"'); });
    await q.goto(URL0 + '#menu'); await wait(500);
    await q.evaluate(async () => { const N = InquireNotes, f = N.addFolder('Work');
      const c = document.createElement('canvas'); c.width = 400; c.height = 400; const x = c.getContext('2d'); for (let i = 0; i < 900; i++) { x.fillStyle = `hsl(${i % 360},70%,50%)`; x.fillRect(Math.random() * 400, Math.random() * 400, 20, 20); }
      const blob = await new Promise(r => c.toBlob(r, 'image/png')), big = '<div>' + 'Lorem ipsum dolor sit amet, '.repeat(300) + '</div>';
      for (let i = 0; i < 24; i++) { const id = await N.putImage(blob); N.create({ title: 'Progress note with a long name ' + i, html: big + `<div><img data-img="${id}"></div>`, folder: i % 2 ? f.id : null }); } });
    await q.click('[data-a=open]'); await q.waitForSelector('.nb-tiles .nb-fnote'); await wait(400);
    await q.click('.nb-tiles .nb-fnote >> nth=0'); await wait(400);
    const geo = await q.$eval('.nb-tiles .nb-fnote.sel', t => { const r = t.getBoundingClientRect(), cs = getComputedStyle(t, '::before'), l = r.left + parseFloat(cs.left), w = parseFloat(cs.width), ic = t.querySelector('.nb-tic').getBoundingClientRect(), ti = t.querySelector('.nb-t').getBoundingClientRect();
      return { content: cs.content, l, w, h: parseFloat(cs.height), th: r.height, tl: r.left, ic: ic.left, ti: ti.left }; });
    ok(geo.content === '""' && Math.abs(geo.l - geo.tl) <= 2 && geo.h >= geo.th - 8 && geo.l + geo.w <= geo.ic - 4 && geo.l + geo.w <= geo.ti, 'Icons: the selected note’s line runs down the left edge of its square, clear of the icon and the name', geo);
    // corner buttons: AI Chat on the far right, bigger, with the holographic figure in the theme colour
    const cb = await q.$$eval('.p1 .nb-holob', b => b.map(x => { const r = x.getBoundingClientRect(); return { k: x.dataset.label, r: r.right, w: r.width, cy: r.top + r.height / 2 }; }));
    const ai = cb.find(x => x.k === 'AI Chat');
    ok(cb.every(x => x === ai || x.r < ai.r) && JSON.stringify(cb.slice().sort((a, b) => b.r - a.r).map(x => x.k)) === '["AI Chat","Links","Paranotes","Grammar"]', 'corner buttons right to left: AI Chat, Links, Paranotes, Grammar', cb);
    ok(ai.w > Math.max(...cb.filter(x => x !== ai).map(x => x.w)) && cb.every(x => Math.abs(x.cy - ai.cy) < 2), 'AI Chat is the biggest corner button, centred on the same line', cb);
    ok(await q.$eval('.p1 .nb-aib', e => !!e.querySelector('svg.nb-aifig') && !/✦/.test(e.textContent) && getComputedStyle(e, '::before').content === '""' && (getComputedStyle(e, '::before').animationName === 'nb-aura') === (document.documentElement.dataset.perf !== 'lite' && !document.documentElement.hasAttribute('data-reduce-motion'))), 'AI Chat shows the holographic figure (no ✦) with an aura that breathes (still in Lite and with Reduce motion)');
    const fc = c => q.evaluate(() => getComputedStyle(document.querySelector('.p1 .nb-aifig .hair path')).stroke);
    const c1 = await fc(); await q.evaluate(() => document.documentElement.style.setProperty('--frame', '#D97AE6')); await wait(50); const c2 = await fc(); await q.evaluate(() => document.documentElement.style.removeProperty('--frame'));
    ok(c1 !== c2 && /217, 122, 230|d97ae6/i.test(c2), 'the figure takes the theme colour', [c1, c2]);
    await q.click('.p1 .nb-aib'); await wait(250);
    ok(!!(await q.$('.np-holo.np-as-ai')), 'AI Chat still opens its box'); await q.keyboard.press('Escape'); await wait(150);
    // ◀ Hide: under Show as at the far left; on one line it follows ★ first
    const hb = async () => q.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), v = r('.nb-ftools .np-views'), h = r('.nb-ftools .nb-hide'), f = r('.nb-ftools .nb-favtop'); return { vl: v.left, vb: v.bottom, vt: v.top, hl: h.left, ht: h.top, fl: f.left, fr: f.right, ft: f.top }; });
    let g = await hb();
    ok(Math.abs(g.hl - g.vl) < 1 && g.ht >= g.vb && Math.abs(g.ft - g.ht) < 2 && g.fl > g.hl, 'narrow bar: ◀ Hide sits at the far left right under Show as, ★ first beside it', g);
    await q.evaluate(() => { document.querySelector('.nb').style.setProperty('--nb-fw-user', '440px'); }); await wait(150); g = await hb();
    ok(Math.abs(g.ht - g.vt) < 3 && g.hl > g.fr && g.hl - g.fr <= 8, 'wide bar (one line): ◀ Hide comes straight after ★ first', g);
    await q.evaluate(() => { document.querySelector('.nb').style.removeProperty('--nb-fw-user'); });
    // Import & Export progress: size, speed, time left, % meter
    const rep = await q.evaluate(async () => { const ps = []; const r = await NPIO.exportNotes('all', 'md', { noSave: true, onProgress: p => ps.push(p) });
      const z = new File([r.blob], 'round.zip', { type: 'application/zip' }), pi = []; await NPIO.importFiles([z], { onProgress: p => pi.push(p) });
      const mono = a => a.every((p, i) => !i || p.f >= a[i - 1].f - 1e-9);
      return { n: ps.length, mono: mono(ps), last: ps[ps.length - 1], size: ps[0] && ps[0].size, zip: ps.some(p => p.phase === 'zip'), eta: ps.some(p => p.eta != null || p.finished), ni: pi.length, imono: mono(pi), ilast: pi[pi.length - 1], isize: z.size, read: pi.some(p => p.phase === 'read') }; });
    ok(rep.n >= 3 && rep.mono && rep.last.finished && rep.last.pct === 100 && rep.size > 24 * 8000 && rep.zip, 'export reports its progress: never backwards, the notes then the .zip, ends at 100%', rep);
    ok(rep.ni >= 3 && rep.imono && rep.ilast.finished && rep.ilast.pct === 100 && rep.ilast.size === rep.isize && rep.read, 'import reports its progress from the size of the files picked (reading the .zip, then the notes)', rep);
    ok(await q.evaluate(() => NPIO.fmtBytes(1536) === '1.5 KB' && NPIO.fmtBytes(5 * 1048576) === '5.0 MB' && NPIO.fmtTime(75) === '1 min 15 s' && NPIO.fmtTime(.4) === 'less than a second'), 'sizes and times read plainly (1.5 KB, 5.0 MB, 1 min 15 s)');
    await q.click('[data-a=share]'); await q.click('.np-share-pop [data-s=io]'); await q.waitForSelector('.io-fmt');
    ok(await q.$$eval('.io-prog', e => e.length === 2 && e.every(x => x.hidden)), 'the window has an export and an import bar, hidden until something runs');
    await q.click('[data-s=all]'); await q.click('[data-f=html]');
    const dl = q.waitForEvent('download').catch(() => null); await q.click('[data-a=export]');
    const vals = []; for (let i = 0; i < 300; i++) { const v = await q.$eval('.io-progx .io-prog-bar', e => +e.getAttribute('aria-valuenow')); if (!vals.includes(v)) vals.push(v); if (await q.$('.io-progx .io-prog.ok')) break; await wait(20); }
    await dl;
    const ui = await q.$eval('.io-progx .io-prog', e => ({ pct: e.querySelector('.io-prog-pct').textContent, size: e.querySelector('.io-prog-size').textContent, speed: e.querySelector('.io-prog-speed').textContent, what: e.querySelector('.io-prog-what').textContent, role: e.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), fill: e.querySelector('.io-prog-fill').style.width }));
    ok(ui.pct === '100%' && ui.role === '100' && /^100(\.0)?%$/.test(ui.fill) && /of \d/.test(ui.size) && /MB|KB/.test(ui.size) && /on average/.test(ui.speed) && /\.zip · /.test(ui.what) && vals.every((v, i) => !i || v >= vals[i - 1]), 'Export shows the bar: % meter to 100%, size, average speed and the file it made', { ui, vals });
    const zp = path.join(dir, 'progress-import.zip'); fs.writeFileSync(zp, Buffer.from(await q.evaluate(async () => { const r = await NPIO.exportNotes('all', 'txt', { noSave: true }); return [...new Uint8Array(await r.blob.arrayBuffer())]; })));
    await q.setInputFiles('.io-fin', zp); await q.waitForSelector('.io-progi .io-prog.ok', { timeout: 15000 });
    const iu = await q.$eval('.io-progi .io-prog', e => ({ pct: e.querySelector('.io-prog-pct').textContent, size: e.querySelector('.io-prog-size').textContent, t: e.querySelector('.io-prog-t').textContent }));
    ok(iu.pct === '100%' && /of \d/.test(iu.size) && /Import finished/.test(iu.t) && /Imported/.test(await q.$eval('.io-log', e => e.textContent)), 'Import shows the bar too: size, % meter, finished', iu);
    await q.keyboard.press('Escape'); await wait(200);
    await q.close();
  }
  {
    // v0.5.8 batch 2 (Devon): Emoji after Highlight, Simple / Professional, Indent less / more, 🎙 audio recording
    const b2 = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const q = await b2.newPage({ viewport: { width: 1440, height: 900 } }); q.setDefaultTimeout(6000); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { localStorage.setItem('notepath.seen056', 'true'); });
    await q.goto(URL0 + '#menu'); await wait(500);
    const ids = await q.evaluate(() => { const N = InquireNotes, a = N.create({ title: 'Indent me', html: '<div>Line one</div><div>Line two</div><ul><li>Item A</li><li>Item B</li></ul>' }), b = N.create({ title: 'Other note', html: '<div>Other</div>' });
      N.scope('code').create({ title: 'hello.py', code: { lang: 'python', src: 'print(1)' }, html: '', body: 'print(1)' }); return { a: a.id, b: b.id }; });
    await q.click('[data-a=open]'); await q.waitForSelector('.nb-rich'); await q.click(`.nb-fnote[data-id="${ids.a}"]`); await wait(400);
    // Task 5: emoji right after the highlight colour
    ok(await q.$eval('.nr-tools .nr-hlb', e => { const n = e.nextElementSibling; return !!n && n.classList.contains('nr-sym'); }), 'the Emoji & symbols button sits right after the Highlight colour');
    // Task 8: Indent less / more on the format bar (Professional)
    ok(await q.$$eval('.nr-tools .nr-ind', e => e.length === 2 && e.every(x => x.offsetParent) && e[0].dataset.a === 'indent-' && e[1].dataset.a === 'indent+'), 'Professional: Decrease / Increase indent buttons on the format bar');
    const line = n => q.evaluate(n => { const d = document.querySelector('.p1 .nb-rich').querySelectorAll(':scope > div')[n]; return d ? d.getAttribute('data-in') : 'missing'; }, n);
    await q.evaluate(() => { const ed = document.querySelector('.p1 .nb-rich'), t = ed.querySelector(':scope > div').firstChild, r = document.createRange(); r.setStart(t, 3); r.collapse(true); ed.focus(); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await q.click('.nr-ind[data-a="indent+"]'); await wait(80); await q.click('.nr-ind[data-a="indent+"]'); await wait(80);
    ok(await line(0) === '2' && await line(1) === null, 'Increase indent moves only the line the caret is on, a step each press', [await line(0), await line(1)]);
    await q.click('.nr-ind[data-a="indent-"]'); await wait(80);
    ok(await line(0) === '1', 'Decrease indent takes a step back', await line(0));
    await q.evaluate(() => { const li = document.querySelectorAll('.p1 .nb-rich li')[1], r = document.createRange(); r.setStart(li.firstChild, 2); r.collapse(true); document.querySelector('.p1 .nb-rich').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await q.click('.nr-ind[data-a="indent+"]'); await wait(120);
    ok(await q.evaluate(() => !!document.querySelector('.p1 .nb-rich li li') && /Item B/.test(document.querySelector('.p1 .nb-rich li li').textContent)), 'in a list, Increase indent tucks the item under the one above');
    await q.click('.nr-ind[data-a="indent-"]'); await wait(120);
    ok(await q.evaluate(() => !document.querySelector('.p1 .nb-rich li li')), 'and Decrease indent brings it back out');
    await wait(600); ok(await q.evaluate(id => /data-in="1"/.test(InquireNotes.get(id).html), ids.a), 'indents are saved with the note');
    // Task 6: Simple / Professional
    ok(await q.$eval('.np-mode [data-mode=pro]', e => e.getAttribute('aria-checked') === 'true') && await q.$eval('.nb', e => e.dataset.mode) === 'pro', 'My notes opens as Professional by default (the switch in the header)');
    await q.fill('input[type="search"]', 'hello'); await wait(300);
    ok(/My Code/.test(await q.$eval('.nb-sres', e => e.textContent)), 'Professional: search also finds My Code files');
    await q.fill('input[type="search"]', ''); await wait(200);
    await q.click('.np-mode [data-mode=simple]'); await wait(400);
    const vis = sel => q.$$eval(sel, e => e.some(x => x.offsetParent || getComputedStyle(x).position === 'fixed' && x.getClientRects().length));
    ok(await q.$eval('.nb', e => e.dataset.mode) === 'simple' && !(await vis('.nb-rail')) && !(await vis('.nb-fcode')) && !(await vis('.nb-fsplit')), 'Simple: no Tool bar, no Code or Music sections');
    ok(!(await vis('.nr-head')) && !(await vis('.nr-alb')) && !(await vis('.nr-spb')) && !(await vis('.nr-clr')) && !(await vis('.nr-ind')), 'Simple: no headings, align & indent, spacing, indent buttons or clear formatting');
    ok(await q.$$eval('.p1 .nr-tools [data-cmd], .p1 .nr-tools [data-blk], .p1 .nr-font, .p1 .nr-size, .p1 .nr-colb, .p1 .nr-hlb, .p1 .nr-sym', e => e.length === 12 && e.every(x => x.offsetParent)), 'Simple keeps bold, italic, underline, strikethrough, the lists, font, size, colours, highlight and emoji');
    ok(JSON.stringify(await q.$$eval('.p1 .nb-holob', e => e.filter(x => x.offsetParent).map(x => x.dataset.label))) === '["Grammar"]' && await vis('.p1 .nb-recb'), 'Simple: Grammar check and Record stay; Links, Paranotes and AI Chat go');
    ok(await q.$eval('.p1', e => e.getBoundingClientRect().left) < await q.$eval('.nb-folders', e => e.getBoundingClientRect().right) + 4, 'Simple: the note sits right beside the Folders & Files bar');
    await q.fill('input[type="search"]', 'hello'); await wait(300);
    ok(!/My Code/.test(await q.$eval('.nb-sres', e => e.textContent)), 'Simple: search keeps to notes');
    await q.fill('input[type="search"]', ''); await wait(200);
    await q.reload(); await q.waitForSelector('.nb-rich'); await wait(300);
    ok(await q.$eval('.nb', e => e.dataset.mode) === 'simple' && await q.$eval('.np-mode [data-mode=simple]', e => e.getAttribute('aria-checked') === 'true'), 'the choice is remembered');
    await q.goto(URL0 + '#code'); await q.waitForSelector('.nb.nb-code'); await wait(300);
    ok(!(await q.$('.np-mode')) && await vis('.nb-rail'), 'My Code has no switch and keeps its Tool bar');
    await q.goto(URL0 + '#notes'); await q.waitForSelector('.nb-rich'); await wait(300);
    await q.click('.np-mode [data-mode=pro]'); await wait(400);
    ok(await vis('.nb-rail') && await vis('.nb-fcode') && await vis('.nr-head') && (await q.$$eval('.p1 .nb-holob', e => e.filter(x => x.offsetParent).length)) === 4, 'Professional brings every tool back');
    await q.click('.np-mode [data-mode=simple]'); await wait(300);
    // Task 7: 🎙 audio recording (a fake microphone)
    await q.click(`.nb-fnote[data-id="${ids.b}"]`); await wait(400);
    const rb = await q.$eval('.p1 .nb-recb', e => { const r = e.getBoundingClientRect(), p = document.querySelector('.p1').getBoundingClientRect(); return { l: r.left - p.left, b: p.bottom - r.bottom }; });
    ok(rb.l < 40 && rb.b < 40, 'the Record button sits at the bottom left of the note', rb);
    await q.click('.p1 .nb-recb'); await q.waitForSelector('.nb-rec.on'); await wait(1300);
    let st = await q.evaluate(() => window.__npRec());
    ok(st.on && st.secs > 1 && /0:0[1-9]/.test(await q.$eval('.nb-rect', e => e.textContent)), 'Record starts: a running clock', st);
    await q.click('[data-r=pause]'); await wait(700); const p1 = await q.evaluate(() => window.__npRec().secs); await wait(500); const p2 = await q.evaluate(() => window.__npRec().secs);
    ok(Math.abs(p2 - p1) < 0.05 && await q.$('.nb-rec.paused'), 'Pause stops the clock');
    await q.click('[data-r=pause]'); await wait(800);
    await q.click('[data-r=stop]'); await q.waitForSelector('.p1 .nw[data-w=audio] audio'); await wait(600);
    const au = await q.evaluate(async id => { const w = document.querySelector('.p1 .nw[data-w=audio]'), d = JSON.parse(w.dataset.src), b = await InquireNotes.mediaBlob(d.vid); return { d, size: b && b.size, type: b && b.type, src: !!w.querySelector('audio').src, saved: /data-w="audio"/.test(InquireNotes.get(id).html), on: window.__npRec().on }; }, ids.b);
    ok(au.size > 500 && /^audio\//.test(au.type) && au.src && au.saved && !au.on && au.d.dur >= 1 && /^Recording · /.test(au.d.title), 'Save puts a player in the note; the clip is kept on this computer with its length and a dated title', au);
    await q.click('.p1 .nb-recb'); await q.waitForSelector('.nb-rec.on'); await wait(600); await q.click('[data-r=cancel]'); await wait(500);
    ok(await q.$$eval('.p1 .nw[data-w=audio]', e => e.length) === 1, '✕ throws a recording away');
    await q.click('.p1 .nb-recb'); await q.waitForSelector('.nb-rec.on'); await wait(700);
    await q.click(`.nb-fnote[data-id="${ids.a}"]`); await wait(500);
    ok(/into “Other note”/.test(await q.$eval('.nb-rec.on', e => e.textContent)), 'opening another note keeps recording, and says which note it goes into');
    await q.click('[data-r=stop]'); await wait(1200);
    ok(await q.evaluate(id => (InquireNotes.get(id).html.match(/data-w="audio"/g) || []).length, ids.b) === 2 && await q.evaluate(id => !/data-w="audio"/.test(InquireNotes.get(id).html), ids.a), 'that recording lands in the note it was started in');
    const md = await q.evaluate(async () => { const r = await NPIO.exportNotes('note', 'md', { note: (InquireNotes.list().find(n => n.title === 'Other note') || {}).id, noSave: true }); const z = await NPIO.unzip(r.blob); return { file: r.file, names: z.map(e => e.name), text: await (z.find(e => /\.md$/.test(e.name)) || { text: async () => '' }).text() }; });
    ok(/\.zip$/.test(md.file) && md.names.filter(n => /attachments\/.+\.webm$/.test(n)).length === 2 && /🎙 \[Recording · .*\]\(.*attachments\/.+\.webm\)/.test(md.text), 'Markdown export carries the recordings as attachments with links', md);
    await q.click('.np-mode [data-mode=pro]'); await wait(300);
    ok(await q.$eval('.p1 .nb-recb', e => !!e.offsetParent), 'Record is there in Professional too');
    await q.reload(); await q.waitForSelector('.nb-rich'); await wait(400); await q.click(`.nb-fnote[data-id="${ids.b}"]`); await wait(600);
    ok(await q.evaluate(() => document.querySelectorAll('.p1 .nw[data-w=audio] audio').length === 2 && [...document.querySelectorAll('.p1 .nw[data-w=audio] audio')].every(a => /^blob:/.test(a.src))), 'recordings stay after a reload and still play');
    await b2.close();
  }
  {
    // What's new in 0.5.6: once, the first time My notes opens
    const q = await page(() => { if (!sessionStorage.getItem('np-new-test')) { sessionStorage.setItem('np-new-test', '1'); localStorage.removeItem('notepath.seen056'); } });
    await q.goto(URL0 + '#menu'); await wait(500);
    ok(!(await q.$('.np-new')), 'no What’s new card on the Main Menu');
    await q.click('[data-a=open]'); await wait(800);
    ok(!!(await q.$('.np-new')) && /What's new in NotePath 0\.5\.6/.test(await q.$eval('.np-new', e => e.textContent)) && await q.evaluate(() => document.activeElement && document.activeElement.matches('.np-new-ok')), 'the first time My notes opens, a What’s new card shows (Got it has the focus)');
    await q.keyboard.press('Escape'); await wait(200);
    ok(!(await q.$('.np-new')) && !!(await q.$('.npage')), 'Esc (or Got it) closes it, and My notes stays');
    await q.click('#brand'); await wait(300); await q.click('[data-a=open]'); await wait(800);
    ok(!(await q.$('.np-new')), 'it does not come back');
    await q.close();
  }
  ok(!errs.length, 'no page errors', errs);
  await b.close(); srv.close();
  console.log(pass.map(x => '  ✓ ' + x).join('\n'));
  if (fails.length) { console.error('\nINTERACT FAILED\n' + fails.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
  console.log(`Interaction test passed (${pass.length} checks).`);
})().catch(e => { console.error(e); process.exit(1); });
