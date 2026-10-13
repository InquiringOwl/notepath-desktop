/* Right-click menu for selected text inside a note (.nb-rich editors in My notes).
   1. Copy  2. Define · Dictionary: a simple online definition shown in the menu, no keys or setup: Wiktionary (REST
      page/definition; inflected forms follow "plural of …" to the headword), else a Wikipedia summary (names, phrases),
      else dictionaryapi.dev; the desktop app fetches through main.js "dict:lookup" (host allowlist). "＋ Save to note"
      puts the definition right after the selected line.  3. Link to a note: the selected words become a link to another
      note (or a new one); links use --note-link (Settings → Appearance).  4. Translate: a box right under the menu
      offers Spanish, German or French; the translation (MyMemory, free, no key; desktop fetches through main.js) shows
      there with Copy, Replace (the selected words) and ＋ Insert below.
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
  if (e.target && e.target.closest && e.target.closest(".tm-ai textarea") && e.key !== "Escape") { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const b = menu.querySelector('[data-a="ai-go"]'); if (b) b.click(); } return; } // typing a request to the AI
  if (e.target && e.target.closest && e.target.closest(".tm-pn textarea") && e.key !== "Escape") { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const b = menu.querySelector('[data-a="pn-save"]'); if (b) b.click(); } return; } // typing a paranote
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
    <button type="button" role="menuitem" data-a="link"><span class="tm-ic">↗</span><span>Link to a note…<small>These words open the note you pick</small></span></button>
    ${c.zone && c.zone.closest && c.zone.closest(".nb-rich") ? `<button type="button" role="menuitem" data-a="pn" aria-haspopup="true"><span class="tm-ic">↳</span><span>Add a paranote…<small>Your own note under these words</small></span></button>` : ""}
    ${c.zone && c.zone.closest && c.zone.closest(".nb-rich") ? `<button type="button" role="menuitem" data-a="ai" aria-haspopup="true"><span class="tm-ic">✦</span><span>Ask AI…<small>Rewrite, shorten, explain or fix these words</small></span></button>` : ""}
    <button type="button" role="menuitem" data-a="tr"${c.text.length > TR_MAX ? " disabled" : ""} aria-haspopup="true"><span class="tm-ic">文</span><span>Translate…<small>${c.text.length > TR_MAX ? `Select up to ${TR_MAX} characters` : "Spanish, German or French"}</small></span><kbd>▾</kbd></button>`;
  document.body.appendChild(menu);
  const W = menu.offsetWidth, H = menu.offsetHeight;
  const place = () => { const W2 = menu.offsetWidth, H2 = menu.offsetHeight; menu.style.left = Math.max(6, Math.min(innerWidth - W2 - 6, x)) + "px"; menu.style.top = Math.max(6, Math.min(innerHeight - H2 - 6, y)) + "px"; };
  menu.style.left = Math.max(6, Math.min(innerWidth - W - 6, x)) + "px";
  menu.style.top = Math.max(6, Math.min(innerHeight - H - 6, y)) + "px";
  menu.addEventListener("mousedown", e => { if (!e.target.closest("textarea")) e.preventDefault(); }); // (Ask AI's box has a textarea too) // keep the selection while clicking (the paranote box takes the focus)
  menu.addEventListener("click", e => {
    const b = e.target.closest("button[data-a], button[data-lang]"); if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === "pn") { pnBox(place); return; }
    if (a === "ai") { aiBox(place); return; }
    if (a === "ai-chip") { const t = menu.querySelector(".tm-ai textarea"); if (t) t.value = b.dataset.q; askAI(c, place); return; }
    if (a === "ai-go") { askAI(c, place); return; }
    if (a === "ai-copy") { const t = menu._ai; close(); if (t) copyText(t, "Copied the answer"); return; }
    if (a === "ai-rep" || a === "ai-ins") { const t = menu._ai; close(); if (t) useAI(t, c, a === "ai-rep"); return; }
    if (a === "pn-save") { addParanote(c); return; }
    if (a === "save") { saveDef(x, y, c); return; }
    if (a === "dict") { showDict(c.text, place); return; }
    if (a === "tr") { trBox(place); return; }
    if (b.dataset.lang) { translate(c.text, b.dataset.lang, place); return; }
    if (a === "tr-copy") { const t = menu._tr; close(); if (t) { copyText(t.text); } return; }
    if (a === "tr-rep" || a === "tr-ins") { const t = menu._tr; close(); if (t) useTranslation(t, c, a === "tr-rep"); return; }
    close();
    if (a === "copy") copy(c.text);
    else if (a === "link") linkFlow(x, y, c);
  });
  document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", key, true);
  window.addEventListener("blur", close); window.addEventListener("resize", close); document.addEventListener("scroll", onScroll, true);
  menu.querySelector("button").focus({ preventScroll: true });
}
/* ---------- paranote (v0.5.5, Devon): type it right in the menu; ＋ Add puts it under the selected words ---------- */
function pnBox(place) {
  let b = menu.querySelector(".tm-pn");
  if (!b) { b = document.createElement("div"); b.className = "tm-pn"; b.innerHTML = `<div class="tm-trh">Paranote</div><textarea rows="3" maxlength="4000" placeholder="Your note on these words… Links: paste https://… or write [words](https://…)" aria-label="Paranote"></textarea><p class="tm-dn tm-pnmsg" hidden></p><div class="tm-dacts"><button type="button" class="tm-dgo" data-a="pn-save">＋ Add paranote</button></div>`; menu.appendChild(b); }
  menu.querySelector('[data-a="pn"]').setAttribute("aria-expanded", "true");
  place(); setTimeout(() => { const t = b.querySelector("textarea"); if (t) t.focus({ preventScroll: true }); }, 0);
}
function addParanote(c) {
  const N = NS(), api = N && N.editorFor(c.zone), t = menu && menu.querySelector(".tm-pn textarea"); if (!api || !t) return;
  const text = t.value.trim();
  if (!text) { const m = menu.querySelector(".tm-pnmsg"); m.hidden = false; m.textContent = "Write the paranote first."; t.focus(); return; }
  c.zone.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(c.range);
  const r = api.addAnnotation(text); close();
  if (r && r.error) { toast(esc(r.error)); return; }
  if (api.showAnnotations) api.showAnnotations(true);
  toast("Paranote added under “" + esc(c.text.length > 24 ? c.text.slice(0, 22).trim() + "…" : c.text) + "”");
}
/* ---------- Ask AI (v0.5.6, Devon): a request about the selected words, answered in the menu: Replace, ＋ Insert below or Copy.
   The AI is the one set up for My Code's Translate (NPAssist → NPCode.ai → main.js "ai:ask"). ---------- */
const AI_CHIPS = ["Improve the writing", "Make it shorter", "Fix spelling and grammar", "Explain it simply", "Turn it into a list"];
function aiBox(place, html) {
  let b = menu.querySelector(".tm-ai");
  if (!b) { b = document.createElement("div"); b.className = "tm-ai"; b.innerHTML = `<div class="tm-trh">Ask AI about these words</div><div class="tm-aichips">${AI_CHIPS.map(q => `<button type="button" class="tm-aichip" data-a="ai-chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div><div class="tm-aiq"><textarea rows="2" maxlength="2000" placeholder="Or say what you want… e.g. Make it friendlier" aria-label="What should the AI do with these words?"></textarea><button type="button" class="tm-dgo" data-a="ai-go">Ask</button></div><div class="tm-aiout" aria-live="polite"></div>`; menu.appendChild(b);
    menu.querySelector('[data-a="ai"]').setAttribute("aria-expanded", "true"); }
  if (html != null) b.querySelector(".tm-aiout").innerHTML = html;
  place(); if (html == null) setTimeout(() => { const t = b.querySelector("textarea"); if (t) t.focus({ preventScroll: true }); }, 0);
  return b;
}
async function askAI(c, place) {
  const A = window.NPAssist, t = menu && menu.querySelector(".tm-ai textarea"); if (!A || !t) return;
  const q = t.value.trim(); if (!q) { aiBox(place, `<p class="tm-dn">Pick one of the requests above or write your own.</p>`); t.focus(); return; }
  const m0 = menu; m0._ai = null;
  const st = await A.aiStatus();
  if (!st || !st.configured) { if (menu === m0) aiBox(place, `<p class="tm-dn">AI is not set up in this copy of NotePath. It uses the AI key in <code>ai.config.json</code> (the same as My Code's Translate); Settings → Code shows whether it is ready.</p>`); return; }
  aiBox(place, `<p class="tm-dn tm-busy">Asking the AI…</p>`);
  let out = "", err = "";
  try { out = A.cleanEdit(await A.ask(A.selRequest(q, c.text))); } catch (e) { err = e && e.message ? e.message : "The AI did not answer."; }
  if (menu !== m0) return;
  if (err || !out) { aiBox(place, `<p class="tm-dn">${esc(err || "The AI gave no answer.")}</p>`); return; }
  menu._ai = out;
  aiBox(place, `<div class="tm-aitext">${esc(out).replace(/\n/g, "<br>")}</div><div class="tm-dacts"><button type="button" class="tm-dgo" data-a="ai-rep" title="Put the answer in place of the selected words">Replace</button><button type="button" class="tm-dgo" data-a="ai-ins">＋ Insert below</button><button type="button" class="tm-dgo" data-a="ai-copy">Copy</button></div><p class="tm-dfoot">AI answers can be wrong: read it before you keep it.</p>`);
}
function useAI(text, c, replace) {
  const N = NS(), api = N && N.editorFor(c.zone); if (!api) return;
  if (replace) { c.zone.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(c.range); document.execCommand("insertText", false, text); api.changed(); toast("Replaced with the AI's answer"); }
  else if (api.insertBlock(window.NPAssist ? NPAssist.toHTML(text) : `<div>${esc(text)}</div>`, c.range)) toast("Added the AI's answer below");
}
/* ---------- translate: a language box right under the menu ---------- */
const TR_MAX = 480, LANGS = [["es", "Spanish", "Español"], ["de", "German", "Deutsch"], ["fr", "French", "Français"]], trCache = {};
const TR_URL = "https://api.mymemory.translated.net/get";
function trBox(place, html) {
  let b = menu.querySelector(".tm-tr");
  if (!b) { b = document.createElement("div"); b.className = "tm-tr"; b.setAttribute("role", "group"); b.setAttribute("aria-label", "Translate into"); menu.appendChild(b); }
  if (!b.querySelector(".tm-langs")) b.innerHTML = `<div class="tm-trh">Translate into</div><div class="tm-langs">${LANGS.map(([k, n, own]) => `<button type="button" class="tm-lang" data-lang="${k}" title="${own}"><b>${n}</b><small>${own}</small></button>`).join("")}</div><div class="tm-trout" aria-live="polite"></div>`;
  if (html != null) b.querySelector(".tm-trout").innerHTML = html;
  menu.querySelector('[data-a="tr"]').setAttribute("aria-expanded", "true");
  place(); if (html == null) b.querySelector(".tm-lang").focus({ preventScroll: true });
  return b;
}
async function translate(text, lang, place) {
  const L = LANGS.find(x => x[0] === lang); if (!L) return;
  const q = text.replace(/\s+/g, " ").trim().slice(0, TR_MAX), ck = lang + "|" + q;
  menu.querySelectorAll(".tm-lang").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  menu._tr = null;
  trBox(place, `<p class="tm-dn tm-busy">Translating into ${L[1]}…</p>`);
  let r = trCache[ck];
  if (!r) {
    const res = await getJSON(TR_URL + "?q=" + encodeURIComponent(q) + "&langpair=" + encodeURIComponent("en|" + lang));
    const d = res.body && res.body.responseData, out = d && plain(String(d.translatedText || ""));
    const st = res.body && +res.body.responseStatus;
    r = res.status === 200 && out && (!st || st === 200) ? { ok: true, text: out } : { ok: false, error: !res.status ? "Could not reach the translation service. Check your internet connection." : st === 429 || /LIMIT/i.test(String(res.body && res.body.responseDetails)) ? "Today's free translations are used up. Try again tomorrow." : "That could not be translated." };
    if (r.ok) trCache[ck] = r;
  }
  if (!menu) return;
  if (!r.ok) { trBox(place, `<p class="tm-dn">${esc(r.error)}</p>`); return; }
  menu._tr = { text: r.text, lang: L[1] };
  trBox(place, `<p class="tm-trtext" lang="${lang}">${esc(r.text)}</p><div class="tm-dacts"><button type="button" class="tm-dgo" data-a="tr-copy">Copy</button><button type="button" class="tm-dgo" data-a="tr-rep">Replace</button><button type="button" class="tm-dgo" data-a="tr-ins">＋ Insert below</button></div><p class="tm-dfoot">${L[1]} · free, from MyMemory (machine translation).</p>`);
}
function copyText(t, said) {
  const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove();
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(t).then(() => {}, () => {});
  toast(said || "Copied the translation");
}
function useTranslation(t, c, replace) {
  const N = NS(), api = N && N.editorFor(c.zone); if (!api) return;
  if (replace) { c.zone.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(c.range); document.execCommand("insertText", false, t.text); api.changed(); toast(`Replaced with the ${t.lang} translation`); }
  else if (api.insertBlock(`<div><i>${esc(t.text)}</i></div>`, c.range)) toast(`Added the ${t.lang} translation below`);
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
// right-click a note link: Open · Open in a new note tab (side by side with this note) · Remove link (keeps the words)
function linkMenu(x, y, a, zone) {
  close();
  const N = NS(), api = N && N.editorFor(zone);
  if (a.dataset.folder) return folderMenu(x, y, a, api);
  const id = a.dataset.note, t = id && N && N.get(id);
  if (!api || !t) return false;
  menu = document.createElement("div");
  menu.className = "tm-menu win"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Note link");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-a="open"><span class="tm-ic">↗</span><span>Open “${esc(t.title.length > 30 ? t.title.slice(0, 28).trim() + "…" : t.title)}”<small>In place of this note</small></span></button>
    <button type="button" role="menuitem" data-a="side"><span class="tm-ic">⧉</span><span>Open in a new note tab<small>Side by side with this note</small></span></button>
    ${api.peek ? `<button type="button" role="menuitem" data-a="peek"><span class="tm-ic">👁</span><span>Peek<small>See it in a small box</small></span></button>` : ""}
    <button type="button" role="menuitem" data-a="unlink"><span class="tm-ic">⌫</span><span>Remove link<small>Keeps the words</small></span></button>`;
  document.body.appendChild(menu);
  const W = menu.offsetWidth, H = menu.offsetHeight;
  menu.style.left = Math.max(6, Math.min(innerWidth - W - 6, x)) + "px"; menu.style.top = Math.max(6, Math.min(innerHeight - H - 6, y)) + "px";
  menu.addEventListener("mousedown", e => e.preventDefault());
  menu.addEventListener("click", e => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const k = b.dataset.a; close();
    if (k === "open") api.openNote(id);
    else if (k === "peek") api.peek(id);
    else if (k === "side") api.openSide(id);
    else if (k === "unlink" && a.isConnected) { a.replaceWith(document.createTextNode(a.textContent)); api.el.normalize(); api.changed(); api.flush(); }
  });
  document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", key, true);
  window.addEventListener("blur", close); window.addEventListener("resize", close); document.addEventListener("scroll", onScroll, true);
  setTimeout(() => { const f = menu && menu.querySelector("button"); if (f) f.focus({ preventScroll: true }); }, 0);
  return true;
}
// right-click a folder link: Open folder · Remove link
function folderMenu(x, y, a, api) {
  const N = NS(), f = N && N.folders().find(z => z.id === a.dataset.folder); if (!api || !f) return false;
  menu = document.createElement("div"); menu.className = "tm-menu win"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Folder link");
  menu.innerHTML = `<button type="button" role="menuitem" data-a="open"><span class="tm-ic">▤</span><span>Open folder “${esc(f.name.length > 30 ? f.name.slice(0, 28).trim() + "…" : f.name)}”<small>Its notes in the list</small></span></button>
    <button type="button" role="menuitem" data-a="unlink"><span class="tm-ic">⌫</span><span>Remove link<small>Keeps the words</small></span></button>`;
  document.body.appendChild(menu);
  const W = menu.offsetWidth, H = menu.offsetHeight;
  menu.style.left = Math.max(6, Math.min(innerWidth - W - 6, x)) + "px"; menu.style.top = Math.max(6, Math.min(innerHeight - H - 6, y)) + "px";
  menu.addEventListener("mousedown", e => e.preventDefault());
  menu.addEventListener("click", e => { const b = e.target.closest("button[data-a]"); if (!b) return; const k = b.dataset.a; close();
    if (k === "open") api.openFolder(f.id);
    else if (a.isConnected) { a.replaceWith(document.createTextNode(a.textContent)); api.el.normalize(); api.changed(); api.flush(); } });
  document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", key, true);
  window.addEventListener("blur", close); window.addEventListener("resize", close); document.addEventListener("scroll", onScroll, true);
  setTimeout(() => { const b = menu && menu.querySelector("button"); if (b) b.focus({ preventScroll: true }); }, 0);
  return true;
}
document.addEventListener("contextmenu", e => {
  const zone = e.target.closest && e.target.closest(".nb-rich");
  if (!zone || e.target.closest("input, textarea, select, canvas")) return;
  const lk = e.target.closest("a.nlink[data-note], a.nlink[data-folder]");
  if (lk && zone.contains(lk)) { if (linkMenu(e.clientX || 0, e.clientY || 0, lk, zone)) e.preventDefault(); return; }
  const sel = getSelection(), text = sel ? sel.toString().trim() : "";
  if (!text || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!zone.contains(range.commonAncestorContainer)) return;
  e.preventDefault();
  open(e.clientX || 0, e.clientY || 0, { zone, text, range: range.cloneRange(), rich: true });
});
})();
