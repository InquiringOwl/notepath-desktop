// Smoke test: opens the built page in headless Chromium at desktop and phone width and visits every screen and window:
// the start menu, My notes (all notes, favourites), the New note dialog and each Settings tab. Fails on any JavaScript
// error, console error or warning, or a page that scrolls sideways.
// Run: node tools/smoke.js   (needs Playwright; exit code 1 on any failure)
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Smoke test needs Playwright. One-time setup, in this folder:\n  npm install && npx playwright install chromium');
  process.exit(1);
}
const path = require('path'), fs = require('fs'), os = require('os');
const { desktop, R, copyMonaco } = require('./build-web.js');

(async () => {
  copyMonaco(); // the Code tab's editor (app/vendor/monaco)
  const srv = await require('./serve.js')(R, desktop), URL0 = srv.url;
  const browser = await chromium.launch();
  const failures = [];
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 400, height: 860 }]]) {
    const p = await browser.newPage({ viewport });
    p.setDefaultTimeout(6000);
    const errs = [];
    p.on('pageerror', e => errs.push('page error: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    const step = async (name, fn) => {
      const n0 = errs.length;
      try { await fn(); } catch (e) { errs.push('step failed: ' + e.message.split('\n')[0]); }
      const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1).catch(() => false);
      if (wide) errs.push('page scrolls sideways');
      if (errs.length > n0) failures.push(`${label} · ${name}: ${errs.slice(n0).join(' | ')}`);
      process.stdout.write(errs.length > n0 ? 'x' : '.');
    };
    process.stdout.write(`Smoke test, ${label} width `);
    await p.goto(URL0 + '#menu'); await p.waitForTimeout(400);
    await step('start menu', async () => {
      if (!(await p.$('.npn-acts .slot[data-a=open]'))) throw new Error('the My notes button is missing');
      if (await p.$$eval('.slot.npn-soon', e => e.filter(x => /Coming soon/.test(x.textContent)).length) !== 1) throw new Error('one Coming soon button expected'); if (!(await p.$('.npn-acts .slot[data-a=code]'))) throw new Error('the My Code button is missing');
      if (!(await p.$('.npn-acts .slot[data-a=tasks]'))) throw new Error('the My Tasks button is missing');
    });
    await step('My notes', async () => { await p.click('[data-a=open]'); await p.waitForSelector('.npage .nb'); await p.waitForTimeout(300); });
    await step('New note dialog + new note', async () => { await p.click('.np-newb'); await p.waitForSelector('.ask-in:focus'); await p.keyboard.type('Smoke'); await p.keyboard.press('Enter'); await p.waitForSelector('.nb-rich'); await p.click('.nb-rich'); await p.keyboard.type('Hello'); await p.waitForTimeout(500); });
    await step('Import / Export window', async () => { await p.click('[data-a=share]'); await p.click('.np-share-pop [data-s=io]'); await p.waitForSelector('.mw-ov[data-mw=io] .io-fmt'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(400); if (await p.$('.mw-ov[data-mw=io]:not(.out)')) throw new Error('Esc did not close it'); if (!(await p.$('.npage'))) throw new Error('Esc closed My notes too'); });
    await step('My Code + new code file', async () => { await p.click('#brand'); await p.waitForTimeout(300); await p.click('[data-a=code]'); await p.waitForSelector('.nb.nb-code'); await p.click('.np-newb'); await p.waitForSelector('.ask-in:focus'); await p.keyboard.type('Smoke code'); await p.keyboard.press('Enter'); await p.waitForSelector('.p1 .nc-edhost[data-ready]', { timeout: 15000 }); await p.waitForTimeout(400); });
    await step('back to My notes', async () => { await p.click('#brand'); await p.waitForTimeout(300); await p.click('[data-a=open]'); await p.waitForSelector('.nb-codeh'); await p.waitForTimeout(200); });
    await step('back to the menu', async () => { await p.click('#brand'); await p.waitForTimeout(400); if (await p.$('.npage')) throw new Error('My notes did not close'); });
    await step('Favourites', async () => { await p.goto(URL0 + '#favourites'); await p.waitForSelector('.nb-fd.sel[data-f=fav]'); await p.click('#brand'); await p.waitForTimeout(300); });
    await step('My Tasks + new task', async () => { await p.click('#brand'); await p.waitForTimeout(200); await p.click('[data-a=tasks]'); await p.waitForSelector('.nt'); await p.click('.np-newb'); await p.waitForSelector('.ask-in:focus'); await p.keyboard.type('Smoke task'); await p.keyboard.press('Enter'); await p.waitForSelector('.nt-head'); await p.fill('.nt-in[data-k=dueDate]', '2030-01-02'); await p.dispatchEvent('.nt-in[data-k=dueDate]', 'change'); await p.waitForTimeout(300); });
    await step('route #tasks', async () => { await p.goto(URL0 + '#tasks'); await p.waitForSelector('.nt-it'); });
    await step('Note Office', async () => { await p.click('#brand'); await p.waitForTimeout(200); await p.click('[data-a=office]'); await p.waitForSelector('.mw-ov[data-mw=office] canvas'); await p.waitForTimeout(1500); await p.keyboard.press('Escape'); await p.waitForTimeout(400); });
    for (const t of ['look', 'display', 'keys', 'usage', 'code', 'data', 'about'])
      await step('Settings · ' + t, async () => { await p.evaluate(t => InquireSettings.open(t), t); await p.waitForTimeout(120); });
    await step('close Settings', async () => { await p.evaluate(() => InquireSettings.close()); });
    await step('route #notes', async () => { await p.goto(URL0 + '#notes'); await p.waitForSelector('.npage .nb'); });
    await step('route #code', async () => { await p.goto(URL0 + '#code'); await p.waitForSelector('.nb.nb-code'); });
    await step('route #favourites', async () => { await p.goto(URL0 + '#favourites'); await p.waitForSelector('.nb-fd.sel[data-f=fav]'); });
    console.log(' done');
    await p.close();
  }
  await browser.close(); srv.close();
  if (failures.length) { console.error('\nSMOKE FAILED\n' + failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
  console.log('Smoke test passed.');
})().catch(e => { console.error(e); process.exit(1); });
