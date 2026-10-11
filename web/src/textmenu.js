/* Right-click menu for selected text inside a note (.nb-rich editors in My notes).
   1. Copy  2. Define · Dictionary: a simple online definition shown in the menu, no keys or setup: Wiktionary (REST
      page/definition; inflected forms follow "plural of …" to the headword), else a Wikipedia summary (names, phrases),
      else dictionaryapi.dev; the desktop app fetches through main.js "dict:lookup" (host allowlist). "＋ Save to note"
      puts the definition right after the selected line.  3. Link to a note: the selected words become a link to another
      note (or a new one); links use --note-link (Settings → Appearance).
   No selection → the normal menu. Loaded after notes.js and app.js. */
(function () {
"use strict";
const NS = () => window.InquireNotes;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let menu = null;
function close() {
  if (!menu) return;
  menu.remove(); menu = null;
  document.removeEventListener("pointerdown", out, true); document.removeEventListener("keydown", key, true);
  window.removeEventListener("blur", close); window.removeEventListener("resize", close); document.removeEventListener("scroll", onScroll, true);
}
const out = e => { if (menu && !menu.contains(e.target)) close(); };
const onScroll = e => { if (menu && e.target instanceof Node && menu.contains(e.target)) return; close(); }; // scrolling a definition keeps the menu
function key(e) {
  if (!menu) return;
  const bs = [...menu.querySelectorAll("button:not([disabled])")], i = bs.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); (bs[e.key === "ArrowDown" ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length] || bs[0]).focus(); }
}
function toast(html, action) {
  document.querySelectorAll(".tm-toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "tm-toast win"; t.setAttribute("role", "status");
  t.innerHTML = `<span>${html}</span>` + (action ? `<button type="button" class="btn-s">${esc(action.label)}</button>` : "");
  document.body.appendChild(t);
  if (action) t.querySelector("button").onclick = () => { t.remove(); action.run(); };
  setTimeout(() => t.classList.add("out"), 3600); setTimeout(() => t.remove(), 4000);
}
function copy(text) {
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {}
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).then(() => {}, () => {});
  toast("Copied");
}
function open(x, y, c) {
  close();
  const short = c.text.length > 26 ? c.text.slice(0, 24).trim() + "…" : c.text;
  const words = c.text.split(/\s+/).length;
  menu = document.createElement("div");
  menu.className = "tm-menu win"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Selected text");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-a="copy"><span class="tm-ic">⧉</span><span>Copy</span><kbd>${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}C</kbd></button>
    <button type="button" role="menuitem" data-a="dict"${words > 5 ? " disabled" : ""}><span class="tm-ic">W</span><span>Define “${esc(short)}” · Dictionary<small>${words > 5 ? "Select a word or short phrase" : "Wiktionary and Wikipedia, online"}</small></span></button>
    <button type="button" role="menuitem" data-a="link"><span class="tm-ic">↗</span><span>Link to a note…<small>These words open the note you pick</small></span></button>`;
  document.body.appendChild(menu);
  const W = menu.offsetWidth, H = menu.offsetHeight;
  const place = () => { const W2 = menu.offsetWidth, H2 = menu.offsetHeight; menu.style.left = Math.max(6, Math.min(innerWidth - W2 - 6, x)) + "px"; menu.style.top = Math.max(6, Math.min(innerHeight - H2 - 6, y)) + "px"; };
  menu.style.left = Math.max(6, Math.min(innerWidth - W - 6, x)) + "px";
  menu.style.top = Math.max(6, Math.min(innerHeight - H - 6, y)) + "px";
  menu.addEventListener("mousedown", e => e.preventDefault()); // keep the selection while clicking
  menu.addEventListener("click", e => {
    const b = e.target.closest("button[data-a]"); if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === "save") { saveDef(x, y, c); return; }
    if (a === "dict") { showDict(c.text, place); return; }
    close();
    if (a === "copy") copy(c.text);
    else if (a === "link") linkFlow(x, y, c);
  });
  document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", key, true);
  window.addEventListener("blur", close); window.addEventListener("resize", close); document.addEventListener("scroll", onScroll, true);
  menu.querySelector("button").focus({ preventScroll: true });
}
/* ---------- definitions inside the menu ---------- */
// "＋ Save to note": in a note, the definition goes in right after the selected line; on a lesson, into a note you pick
const SAVE_BTN = `<button type="button" class="tm-dgo tm-save" data-a="save">＋ Save to note</button>`;
async function saveDef(x, y, c) {
  const d = menu && menu._def; if (!d) return;
  const N = NS(); if (!N) return;
  close();
  const api = N.editorFor(c.zone); if (api && api.insertBlock(d.html, c.range)) toast(`Saved “${esc(d.word)}” to this note`);
}
function defBox(html, place) {
  let d = menu.querySelector(".tm-def");
  if (!d) { d = document.createElement("div"); d.className = "tm-def"; d.setAttribute("role", "status"); d.setAttribute("aria-live", "polite"); menu.appendChild(d); }
  d.innerHTML = html; place(); return d;
}
const dictCache = {};
const WIKT = "https://en.wiktionary.org/api/rest_v1/page/definition/", WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
// one GET → { status, body } (status 0 = could not reach it). Desktop: main.js; browser build: these APIs allow cross-origin requests.
async function getJSON(url) {
  const D = window.inquireDesktop;
  if (D && D.lookupWord) { try { return (await D.lookupWord({ url })) || { status: 0 }; } catch (e) { return { status: 0 }; } }
  try { const r = await fetch(url, { headers: { Accept: "application/json" } }); return { status: r.status, body: r.status === 200 ? await r.json() : null }; }
  catch (e) { return { status: 0 }; }
}
const plain = html => { const d = document.createElement("div"); d.innerHTML = String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, ""); return d.textContent.replace(/\s+/g, " ").trim(); };
// Wiktionary: English senses, and the headword an inflected form points to ("plural of cat")
function wiktSenses(body) {
  const out = { senses: [], lemma: "" };
  ((body && body.en) || []).forEach(sec => (sec.definitions || []).forEach(d => {
    const html = String(d.definition || ""), def = plain(html);
    if (!def) return;
    out.senses.push({ pos: (sec.partOfSpeech || "").toLowerCase(), def });
    const m = !out.lemma && /form-of-definition-link[\s\S]*?title="([^"#]+)"/.exec(html);
    if (m) out.lemma = plain(m[1]);
  }));
  return out;
}
async function wiktionary(word) {
  const tries = [...new Set([word, word.toLowerCase()])];
  let reached = false;
  for (const w of tries) {
    const r = await getJSON(WIKT + encodeURIComponent(w.replace(/ /g, "_")));
    if (r.status) reached = true;
    if (r.status !== 200) continue;
    const s = wiktSenses(r.body);
    if (!s.senses.length) continue;
    let senses = s.senses.slice(0, 2), head = w;
    if (s.lemma && s.lemma.toLowerCase() !== w.toLowerCase() && s.senses.every(x => / of /.test(x.def))) { // inflected form: add the headword's meanings
      const l = await getJSON(WIKT + encodeURIComponent(s.lemma.replace(/ /g, "_")));
      const ls = l.status === 200 ? wiktSenses(l.body).senses : [];
      if (ls.length) { senses = [s.senses[0]].concat(ls.slice(0, 3)); head = w; }
    } else senses = s.senses;
    return { ok: true, source: "Wiktionary", entry: { word: head, phon: "", senses: senses.slice(0, 4), link: "https://en.wiktionary.org/wiki/" + encodeURIComponent(w.replace(/ /g, "_")) + "#English" } };
  }
  return { ok: false, reached };
}
async function wikipedia(word) {
  const r = await getJSON(WIKI + encodeURIComponent(word.replace(/ /g, "_")) + "?redirect=true");
  if (r.status !== 200 || !r.body || r.body.type === "disambiguation" || !r.body.extract) return { ok: false, reached: !!r.status };
  const ext = r.body.extract.replace(/\s+/g, " ").trim(), cut = ext.match(/^(.{40,320}?[.!?])(\s|$)/);
  return { ok: true, source: "Wikipedia", entry: { word: r.body.title || word, phon: "", senses: [{ pos: r.body.description || "", def: cut ? cut[1] : ext.slice(0, 320) }],
    link: (r.body.content_urls && r.body.content_urls.desktop && r.body.content_urls.desktop.page) || "https://en.wikipedia.org/wiki/" + encodeURIComponent(word.replace(/ /g, "_")) } };
}
async function freeDict(word) { // last resort (this service is often down: Cloudflare 522)
  const r = await getJSON("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word.toLowerCase()));
  if (r.status !== 200 || !Array.isArray(r.body)) return { ok: false, reached: !!r.status };
  const e = { word: "", phon: "", senses: [], link: "" };
  r.body.forEach(x => { e.word = e.word || x.word || ""; e.phon = e.phon || x.phonetic || "";
    (x.meanings || []).forEach(m => (m.definitions || []).slice(0, 2).forEach(d => d.definition && e.senses.push({ pos: m.partOfSpeech || "", def: d.definition })));
    if (!e.link && x.sourceUrls && x.sourceUrls[0]) e.link = x.sourceUrls[0]; });
  e.senses = e.senses.slice(0, 4);
  return e.senses.length ? { ok: true, source: "Wiktionary", entry: e } : { ok: false, reached: true };
}
async function lookup(word) {
  const key = word.toLowerCase();
  if (dictCache[key]) return dictCache[key];
  const words = word.split(/\s+/).length;
  let reached = false, r;
  for (const f of words > 3 ? [wikipedia, wiktionary] : [wiktionary, wikipedia, freeDict]) {
    r = await f(word); if (r.ok) break; reached = reached || r.reached;
  }
  if (!r.ok) r = reached ? { ok: false, error: `No definition found for “${word}”.` } : { ok: false, error: "Could not reach the online dictionary. Check your internet connection." };
  if (r.ok || reached) dictCache[key] = r;
  return r;
}
async function showDict(text, place) {
  const word = text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/\s+/g, " ").slice(0, 80);
  menu._def = null;
  defBox(`<p class="tm-dn tm-busy">Looking up “${esc(word)}”…</p>`, place);
  const r = await lookup(word);
  if (!menu) return;
  if (!r || !r.ok) { defBox(`<p class="tm-dn">${esc((r && r.error) || "No definition found.")}</p>`, place); return; }
  const e = r.entry, src = r.source;
  menu._def = { word: e.word || word, topic: null, html: `<blockquote><b>${esc(e.word || word)}</b>${e.phon ? ` <i>${esc(e.phon)}</i>` : ""}<br>${e.senses.map((s, i) => `${e.senses.length > 1 ? i + 1 + ". " : ""}${s.pos ? "(" + esc(s.pos) + ") " : ""}${esc(s.def)}`).join("<br>")}<br>— ${src}</blockquote>` };
  defBox(`<div class="tm-dh"><b>${esc(e.word || word)}</b>${e.phon ? `<span class="tm-ipa">${esc(e.phon)}</span>` : ""}<span class="tm-src">${src}</span></div>`
    + `<ol class="tm-dl">${e.senses.map(s => `<li>${s.pos ? `<i>${esc(s.pos)}</i> ` : ""}${esc(s.def)}</li>`).join("")}</ol>`
    + `<div class="tm-dacts">${SAVE_BTN}${e.link ? `<a class="tm-dgo" href="${esc(e.link)}" target="_blank" rel="noopener">More at ${src} ↗</a>` : ""}</div>`
    + `<p class="tm-dfoot">Free, from ${src} (CC BY-SA).</p>`, place);
}

async function linkFlow(x, y, c) {
  const N = NS(); if (!N) return;
  const api = N.editorFor(c.zone); if (!api) return;
  const self = N.get(api.id);
  const id = await N.pickNote({ x, y, exclude: api.id, suggest: c.text.slice(0, 80), folder: self && self.folder });
  if (!id) return;
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(c.range);
  if (api.linkRange(c.range, id)) toast(`Linked to “${esc(N.get(id).title)}”`);
}
document.addEventListener("contextmenu", e => {
  const zone = e.target.closest && e.target.closest(".nb-rich");
  if (!zone || e.target.closest("input, textarea, select, canvas")) return;
  const sel = getSelection(), text = sel ? sel.toString().trim() : "";
  if (!text || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!zone.contains(range.commonAncestorContainer)) return;
  e.preventDefault();
  open(e.clientX || 0, e.clientY || 0, { zone, text, range: range.cloneRange(), rich: true });
});
})();
