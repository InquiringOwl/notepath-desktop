/* Storage keys. NotePath has no accounts: everything is "_local" (one set of notes per computer). The key shape matches
   Inquire's ("<prefix>.notes.<user>") so the notes engine stays the same and accounts could be added later. */
(function () {
"use strict";
const user = () => (window.InquireUser ? String(window.InquireUser).toLowerCase() : "");
window.InquireKeys = {
  user,
  notes: () => "notepath.notes." + (user() || "_local"),
  forUser: u => ({ notes: "notepath.notes." + String(u).toLowerCase() })
};
})();

/* Notes: the store, folders, photos and the rich note editor (cloned from Inquire's notes.js).
   Loaded before app.js (the start menu and My notes read it).
   Notes live in IndexedDB "notepath-notes" › "notes" since v0.5.6 (in memory while running; see "the store" below). Before that
   they were in localStorage "notepath.notes.<username>" (lower-case) or "notepath.notes._local"; 0.5.6 moves them on its first start.
   Each note: { id, title, html (sanitised rich text), body (plain text made from html: search, previews, .md),
     created, updated, fav, folder (folder id | null), links: ["s:<subject>", "f:<field>", "t:<topic>"], src: { topic, title } | null }.
   Older notes (body only) get html on read. Folders: IndexedDB "kv" under "notepath.notefolders.<username>" (localStorage before 0.5.6) = [{ id, name, parent, order, fav? }] (nested; drag to move/reorder). Notes may carry `order` (My order).
   Photos: IndexedDB "notepath-notes" / "images" (Blob by id); a note holds <img data-img="id">, a linked photo <img src="https://…">.
   Links inside a note: <a class="nlink" data-note="id"> (another note) or data-topic="id" (a lesson); colour = --note-link (Settings).
   Every change fires "inquire:notes-changed" so open views redraw. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const key = () => window.InquireKeys.notes();
const fkey = () => key().replace(/^notepath\.notes\./, "notepath.notefolders.");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byUpdated = (a, b) => b.updated - a.updated;
const changed = () => window.dispatchEvent(new CustomEvent("inquire:notes-changed"));

/* ---------- rich text: sanitise, plain text ---------- */
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "DIV", "P", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H6", "BLOCKQUOTE", "A", "IMG", "SPAN"]); // H1 Title · H6 Subtitle · H2 / H3 / H4 Heading 1 / 2 / 3 (v0.5.4)
const TCOL = { "#f2b84b": "amber", "#5cc8e0": "cyan", "#f07ca0": "pink", "#b49bff": "violet", "#7bd88f": "green", "#d97ae6": "magenta", "#b5d65a": "lime", "#e5675b": "red", "#8b97ae": "muted" };
const TKEYS = new Set(Object.values(TCOL)), HEX = /^#[0-9a-f]{6}$/;
// any colour from the spectrum picker is kept as span[data-c="#rrggbb"] with a matching inline colour (the sanitiser writes the style itself)
const hexOf = v => { v = String(v || "").trim().toLowerCase(); if (/^#[0-9a-f]{3}$/.test(v)) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (m) v = "#" + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join(""); return HEX.test(v) ? v : ""; };
const CLEARH = "#010204"; // stand-in highlight for "no highlight" (v0.5.4): becomes span[data-h="_def"], then lift() takes it off
// a highlight keeps the words readable: a light one makes the text dark, a dark one makes it light (data-hl, set from the colour)
const hlTone = hx => { const n = parseInt(hx.slice(1), 16), L = (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; return L > 0.55 ? "l" : L < 0.3 ? "d" : ""; };
// paragraph layout (v0.5.4): align, indent, line spacing, space after, as attributes on blocks (see api.blockStyle)
const BLAYOUT = { "data-al": new Set(["left", "center", "right"]), "data-in": new Set(["1", "2", "3", "4", "5", "6", "7", "8"]), "data-lh": new Set(["1", "1.15", "1.5", "2", "2.5", "3"]), "data-ps": new Set(["0", "6", "12", "24"]) };
const BLTAGS = new Set(["DIV", "P", "H1", "H2", "H3", "H4", "H6", "BLOCKQUOTE", "UL", "OL", "LI"]);
const CLEARC = "#010203"; // stand-in colour for "normal colour": becomes span[data-c="_def"] for a moment, then lift() takes the colour off
// numeric text sizes (toolbar size menu): span[data-s="18"]; the note's normal text is 15. Old notes keep s / n / l / xl.
const NSIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];
// fonts (toolbar font menu): span[data-f="key"]; the first four are bundled with the app, the rest fall back to a close system font
const NFONTS = [["serif", "STIX Two Text"], ["sans", "IBM Plex Sans"], ["mono", "IBM Plex Mono"], ["cond", "Saira Semi Condensed"], ["georgia", "Georgia"], ["times", "Times New Roman"],
  ["palatino", "Palatino"], ["garamond", "Garamond"], ["arial", "Arial"], ["helvetica", "Helvetica"], ["verdana", "Verdana"], ["trebuchet", "Trebuchet MS"], ["tahoma", "Tahoma"],
  ["courier", "Courier New"], ["comic", "Comic Sans MS"], ["brush", "Brush Script MT"]];
const FKEYS = new Set(NFONTS.map(f => f[0]));
// text sizes from the toolbar (execCommand fontSize 2/3/5/6 → span[data-s=s|n|l|xl]); sizes are relative to the note's base size (--nb-base), so they never compound
const TSIZE = { "1": "s", "2": "s", "3": "n", "4": "l", "5": "l", "6": "xl", "7": "xl" }, SKEYS = new Set(["s", "n", "l", "xl", ...NSIZES.map(String)]);
// over = { s: "18" } when the size menu used execCommand fontSize 7 as a stand-in for its own number
function fontToSpan(f, over) {
  const col = f.getAttribute("color"), hx = hexOf(col), k = TCOL[hx] || (hx === CLEARC ? (over && over.def ? "_def" : null) : hx || null), sz = f.getAttribute("size"),
    s = over && over.s && sz === "7" ? over.s : TSIZE[sz], face = f.getAttribute("face") || "", fk = /^npf-/.test(face) ? face.slice(4) : null, fv = FKEYS.has(fk) || (fk === "_def" && over && over.def) ? fk : null;
  // a new colour / size / font replaces older ones inside it
  const strip = (attr, on) => { if (on) f.querySelectorAll(`span[${attr}]`).forEach(x => { x.removeAttribute(attr); if (attr === "data-c") x.removeAttribute("style");
    if (!x.hasAttribute("data-c") && !x.hasAttribute("data-s") && !x.hasAttribute("data-f")) x.replaceWith(...x.childNodes); }); };
  strip("data-s", !!sz); strip("data-c", col != null); strip("data-f", !!fk);
  if (!k && !s && !fv) { f.replaceWith(...f.childNodes); return; }
  const sp = document.createElement("span"); if (k) { sp.setAttribute("data-c", k); if (HEX.test(k)) sp.style.color = k; } if (s) sp.setAttribute("data-s", s); if (fv) sp.setAttribute("data-f", fv);
  sp.append(...f.childNodes); f.replaceWith(sp); return sp;
}
const WIDGETS = new Set(["code", "music", "video", "graph", "sheet", "map"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TEMPLATE", "SVG", "MATH", "NOSCRIPT", "TITLE", "HEAD", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "VIDEO", "AUDIO", "CANVAS"]);
function clean(node) {
  [...node.childNodes].forEach(c => {
    if (c.nodeType === 3) return;
    if (c.nodeType !== 1) { c.remove(); return; }
    const tag = c.tagName.toUpperCase();
    if (DROP.has(tag)) { c.remove(); return; }
    if (tag === "DIV" && c.classList.contains("nw")) { // widget: only its type and data survive; the UI is rebuilt on load
      const w = c.getAttribute("data-w"), src = c.getAttribute("data-src") || "{}";
      if (!WIDGETS.has(w) || src.length > 60000) { c.remove(); return; }
      c.innerHTML = ""; [...c.attributes].forEach(a => c.removeAttribute(a.name));
      c.setAttribute("class", "nw"); c.setAttribute("data-w", w); c.setAttribute("data-src", src); c.setAttribute("contenteditable", "false"); return;
    }
    if (tag === "FONT") { clean(c); fontToSpan(c); return; } // text colour / size from the toolbar → span[data-c] / span[data-s]
    clean(c);
    if (!KEEP.has(tag)) { c.replaceWith(...c.childNodes); return; }
    const keep = {};
    if (tag === "A") {
      const n = c.getAttribute("data-note"), t = c.getAttribute("data-topic"), fo = c.getAttribute("data-folder");
      if (n && /^[a-z0-9]+$/i.test(n)) keep["data-note"] = n; else if (fo && /^[a-z0-9]+$/i.test(fo)) keep["data-folder"] = fo; else if (t && /^[a-z0-9-]+$/i.test(t)) keep["data-topic"] = t;
      else { c.replaceWith(...c.childNodes); return; }
      keep.class = "nlink"; keep.contenteditable = "false";
    }
    if (tag === "IMG") {
      const id = c.getAttribute("data-img"), src = c.getAttribute("src") || "";
      if (id && /^[a-z0-9]+$/i.test(id)) keep["data-img"] = id; else if (/^https:\/\/[^\s"'<>]+$/i.test(src)) keep.src = src; else { c.remove(); return; }
      keep.alt = (c.getAttribute("alt") || "").slice(0, 200); keep.class = "nimg";
    }
    if (BLTAGS.has(tag)) for (const a in BLAYOUT) { const v = c.getAttribute(a); if (v != null && BLAYOUT[a].has(v)) keep[a] = v; } // align, indent, spacing (v0.5.4)
    if (tag === "UL" && c.getAttribute("data-ck") === "1") keep["data-ck"] = "1"; // checklist (NotePath)
    if (tag === "LI" && c.getAttribute("data-done") === "1") keep["data-done"] = "1";
    if (tag === "SPAN") { const k = c.getAttribute("data-c"), z = c.getAttribute("data-s"), f = c.getAttribute("data-f");
      if (TKEYS.has(k)) keep["data-c"] = k; else if (HEX.test(k || "")) { keep["data-c"] = k; keep.style = "color:" + k; }
      const hl = c.getAttribute("data-h"); if (HEX.test(hl || "")) { keep["data-h"] = hl; keep.style = (keep.style ? keep.style + ";" : "") + "background-color:" + hl; const tn = hlTone(hl); if (tn) keep["data-hl"] = tn; } // highlight (v0.5.4)
      if (SKEYS.has(z)) keep["data-s"] = z; if (FKEYS.has(f)) keep["data-f"] = f;
      const an = c.getAttribute("data-ann"); if (an && /^[a-z0-9]{4,24}$/i.test(an)) { keep["data-ann"] = an; keep["data-nt"] = String(c.getAttribute("data-nt") || "").slice(0, 4000); } // a paranote (NotePath)
      if (!keep["data-c"] && !keep["data-s"] && !keep["data-f"] && !keep["data-ann"] && !keep["data-h"]) { c.replaceWith(...c.childNodes); return; } }
    [...c.attributes].forEach(a => c.removeAttribute(a.name));
    Object.entries(keep).forEach(([k, v]) => c.setAttribute(k, v));
  });
}
function sanitize(html) { const t = document.createElement("template"); t.innerHTML = String(html || ""); clean(t.content); return t.innerHTML; }
const BLOCK = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H6", "BLOCKQUOTE", "UL", "OL"]);
function toText(html) {
  const t = document.createElement("template"); t.innerHTML = String(html || ""); let out = "";
  const walk = n => n.childNodes.forEach(c => {
    if (c.nodeType === 3) { out += c.nodeValue; return; }
    if (c.nodeType !== 1) return;
    if (c.tagName === "BR") { out += "\n"; return; }
    if (c.tagName === "IMG") { out += "[photo]"; return; }
    if (c.tagName === "DIV" && c.classList.contains("nw")) { out += window.InquireWidgets ? InquireWidgets.text(c) : ""; return; }
    const b = BLOCK.has(c.tagName);
    if (b && out && !out.endsWith("\n")) out += "\n";
    if (c.tagName === "LI") out += "• ";
    walk(c);
    if (b && !out.endsWith("\n")) out += "\n";
  });
  walk(t.content);
  return out.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
const textToHtml = t => String(t || "").split("\n").map(l => `<div>${l ? esc(l) : "<br>"}</div>`).join("");
const imgIds = html => [...String(html || "").matchAll(/data-img="([a-z0-9]+)"/gi)].map(m => m[1]);
// photos and video files share the IndexedDB store; a video widget keeps its file id as "vid" in data-src (attribute-escaped JSON)
const mediaIds = html => imgIds(html).concat([...String(html || "").matchAll(/&quot;vid&quot;:&quot;([a-z0-9]+)&quot;/gi)].map(m => m[1]));
// every photo a note keeps: the ones in its text and its cover photo (v0.5.4)
const COVER_ID = /^[a-z0-9]{4,40}$/i;
const noteMedia = n => mediaIds(n && n.html).concat(n && n.cover && COVER_ID.test(n.cover) ? [n.cover] : []);

/* ---------- notes ---------- */
/* Spaces (NotePath, Oct 2026): My notes has a Notes tab and a Code tab. A code file is a note with space: "code" and
   code: { lang, src } (html stays empty; body = the source, for search). Code folders carry space: "code" too.
   list() / folders() with no space give the Notes tab only, so the start menu, Note Office and pickers never see code. */
const spaceOf = x => (x && x.space === "code" ? "code" : "notes");
function normalize(n) {
  if (n.space === "code") { if (!n.code || typeof n.code !== "object") n.code = { lang: "python", src: n.body || "" }; n.html = ""; n.body = String(n.code.src || ""); }
  if (n.html == null) n.html = textToHtml(n.body);
  if (!Array.isArray(n.links)) n.links = n.src && n.src.topic ? ["t:" + n.src.topic] : [];
  if (n.folder === undefined) n.folder = null;
  n.fav = !!n.fav;
  return n;
}
/* ---------- the store (v0.5.6, Devon) ----------
   Notes and folders live in IndexedDB ("notepath-notes": "notes" = one record per note, "kv" = the folders), and the whole
   store sits in memory while NotePath runs (MEM), so reading a note costs nothing. Until 0.5.5 they were one JSON string in
   localStorage, which refuses every save once it holds ~5 MB (about 1,500 notes): saving silently stopped.
   - read() / readF() hand out shallow copies (callers change a copy, then write() the list back, as before).
   - write() works out which notes changed (a field that is not ===), keeps their old versions for undo, and queues only those
     for IndexedDB (a write ~300 ms later, one transaction). Until IndexedDB says it is done, the queued notes are also in a
     small localStorage journal ("<key>.journal"), so quitting mid-save loses nothing: the next start applies it.
   - The first start moves the old localStorage notes into IndexedDB, checks the count, then frees localStorage.
   - Saving state ("saving" / "saved" / "error") goes out as "inquire:notes-save" (the "Saved ✓" line in a note).
   - Without IndexedDB (very old browsers) it falls back to localStorage, as before, but a failed save is reported. */
const MEM = { notes: [], folders: [], ready: false, legacy: false, state: "saved", error: "" };
const shallow = o => Object.assign({}, o);
const read = () => MEM.notes.map(shallow);
const readF = () => MEM.folders.map(shallow);
const same = (a, b) => { if (a === b) return true; for (const k in a) if (a[k] !== b[k]) return false; for (const k in b) if (!(k in a)) return false; return true; };
const jkey = () => key() + ".journal";
const saveState = (state, error) => { MEM.state = state; MEM.error = error || ""; window.dispatchEvent(new CustomEvent("inquire:notes-save", { detail: { state, error: MEM.error } })); };
function write(all) {
  all = all.map(normalize);
  const prev = new Map(MEM.notes.map(n => [n.id, n])), seen = new Set(), ch = [], del = [];
  all.forEach(n => { seen.add(n.id); const p = prev.get(n.id); if (!p || !same(p, n)) ch.push(n); });
  prev.forEach((p, id) => { if (!seen.has(id)) del.push(id); });
  if (ch.length || del.length) { record(ch.map(n => n.id).concat(del), prev); MEM.notes = all; queue(ch, del, false); } else MEM.notes = all;
  touched(); changed();
}
function writeF(f) {
  recordF(MEM.folders); MEM.folders = f.map(shallow); queue([], [], true); touched(); changed();
}
/* the queue → IndexedDB (only what changed) */
const Q = { notes: new Map(), del: new Set(), folders: false, fly: null, t: 0, busy: false };
function queue(notes, del, folders) {
  notes.forEach(n => { Q.notes.set(n.id, n); Q.del.delete(n.id); }); del.forEach(id => { Q.del.add(id); Q.notes.delete(id); }); if (folders) Q.folders = true;
  if (!MEM.ready) return; // changes made while loading are saved once it is loaded
  journal(); clearTimeout(Q.t); Q.t = setTimeout(flush, 300); if (MEM.state !== "saving") saveState("saving");
}
function journal() {
  if (MEM.legacy) return;
  const n = new Map(Q.fly ? Q.fly.notes : []), d = new Set(Q.fly ? Q.fly.del : []);
  Q.notes.forEach((v, k) => { n.set(k, v); d.delete(k); }); Q.del.forEach(k => { d.add(k); n.delete(k); });
  const f = Q.folders || (Q.fly && Q.fly.folders);
  try { if (!n.size && !d.size && !f) localStorage.removeItem(jkey()); else localStorage.setItem(jkey(), JSON.stringify({ n: [...n.values()], d: [...d], f: f ? MEM.folders : null })); }
  catch (e) { clearTimeout(Q.t); Q.t = setTimeout(flush, 0); } // a note too big for the journal: save it to IndexedDB at once
}
async function flush() {
  clearTimeout(Q.t);
  if (Q.busy) { Q.t = setTimeout(flush, 120); return; }
  if (!Q.notes.size && !Q.del.size && !Q.folders) return;
  const job = { notes: [...Q.notes.entries()], del: [...Q.del], folders: Q.folders };
  Q.fly = job; Q.notes = new Map(); Q.del = new Set(); Q.folders = false; Q.busy = true;
  try {
    if (MEM.legacy) { localStorage.setItem(key(), JSON.stringify(MEM.notes)); localStorage.setItem(fkey(), JSON.stringify(MEM.folders)); }
    else await stx(["notes", "kv"], "readwrite", t => { const ns = t.objectStore("notes"); job.notes.forEach(([, n]) => ns.put(n)); job.del.forEach(id => ns.delete(id)); if (job.folders) t.objectStore("kv").put(MEM.folders, fkey()); });
    Q.fly = null; Q.busy = false;
    if (Q.notes.size || Q.del.size || Q.folders) { journal(); Q.t = setTimeout(flush, 60); } else { journal(); saveState("saved"); }
  } catch (e) {
    // put it back (newer changes to the same notes win) and say so; the journal still has it
    job.notes.forEach(([id, n]) => { if (!Q.notes.has(id) && !Q.del.has(id)) Q.notes.set(id, n); }); job.del.forEach(id => { if (!Q.notes.has(id)) Q.del.add(id); }); if (job.folders) Q.folders = true;
    Q.fly = null; Q.busy = false; journal();
    console.warn("Notes could not be saved", e);
    saveState("error", e && e.name === "QuotaExceededError" ? "This computer's disk is full." : "NotePath could not save to this computer's storage.");
    Q.t = setTimeout(flush, 5000); // try again by itself
  }
}
window.addEventListener("pagehide", () => { if (Q.notes.size || Q.del.size || Q.folders) flush(); });
window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && (Q.notes.size || Q.del.size || Q.folders)) flush(); });
/* the IndexedDB database (shared with photos and videos) */
let dbP = null;
const db = () => dbP || (dbP = new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error("no IndexedDB"));
  const r = indexedDB.open("notepath-notes", 2); // 1 = photos only; 2 (v0.5.6) adds the notes and folders
  r.onupgradeneeded = () => { const d = r.result; ["images", "notes", "kv"].forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, s === "notes" ? { keyPath: "id" } : undefined); }); };
  r.onsuccess = () => { const d = r.result; d.onversionchange = () => d.close(); res(d); }; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("blocked"));
}));
const stx = (stores, mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction(stores, mode); let out; const r = fn(t); t.oncomplete = () => res(r && "result" in r ? r.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("aborted"));
}));
const lsJSON = k => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return Array.isArray(v) ? v : null; } catch (e) { return null; } };
async function load() {
  let d = null; try { d = await db(); } catch (e) { d = null; }
  if (!d) { MEM.legacy = true; MEM.notes = (lsJSON(key()) || []).map(normalize); MEM.folders = lsJSON(fkey()) || []; return; }
  const got = await stx(["notes", "kv"], "readonly", t => { const o = {}; t.objectStore("notes").getAll().onsuccess = e => { o.notes = e.target.result; }; const kv = t.objectStore("kv");
    kv.get(fkey()).onsuccess = e => { o.folders = e.target.result; }; kv.get("moved:" + key()).onsuccess = e => { o.moved = e.target.result; }; return { get result() { return o; } }; });
  let notes = got.notes || [], folders = Array.isArray(got.folders) ? got.folders : [];
  if (!got.moved) { // first start with 0.5.6: move the notes out of localStorage
    const ln = lsJSON(key()), lf = lsJSON(fkey());
    if (ln || lf) {
      const byId = new Map(notes.map(n => [n.id, n])); (ln || []).forEach(n => { if (n && n.id) byId.set(n.id, n); }); notes = [...byId.values()]; if (lf) folders = lf;
      await stx(["notes", "kv"], "readwrite", t => { const ns = t.objectStore("notes"); notes.forEach(n => ns.put(n)); t.objectStore("kv").put(folders, fkey()); });
      const count = await stx(["notes"], "readonly", t => t.objectStore("notes").count());
      if (count >= notes.length) { await stx(["kv"], "readwrite", t => t.objectStore("kv").put(Date.now(), "moved:" + key())); try { localStorage.removeItem(key()); localStorage.removeItem(fkey()); } catch (e) {} }
    } else await stx(["kv"], "readwrite", t => t.objectStore("kv").put(Date.now(), "moved:" + key()));
  }
  MEM.notes = notes.map(normalize); MEM.folders = folders;
  let j = null; try { j = JSON.parse(localStorage.getItem(jkey()) || "null"); } catch (e) {}
  if (j) { // saves that had not reached IndexedDB when NotePath last closed
    const m = new Map(MEM.notes.map(n => [n.id, n])); (j.n || []).forEach(n => { if (n && n.id) { m.set(n.id, normalize(n)); Q.notes.set(n.id, n); } }); (j.d || []).forEach(id => { m.delete(id); Q.del.add(id); });
    MEM.notes = [...m.values()]; if (Array.isArray(j.f)) { MEM.folders = j.f; Q.folders = true; }
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} // ask the browser never to clear it
}
const ready = load().catch(e => { console.warn("Notes could not be loaded", e); MEM.legacy = true; MEM.notes = (lsJSON(key()) || []).map(normalize); MEM.folders = lsJSON(fkey()) || []; })
  .then(() => {
    // changes made while it was loading (rare: they are merged over what was loaded)
    if (Q.notes.size || Q.del.size) { const m = new Map(MEM.notes.map(n => [n.id, n])); Q.notes.forEach((n, id) => m.set(id, n)); Q.del.forEach(id => m.delete(id)); MEM.notes = [...m.values()]; }
    MEM.ready = true; if (Q.notes.size || Q.del.size || Q.folders) { journal(); flush(); }
    changed(); return true;
  });

/* ---------- undo / redo (My notes ↶ ↷, ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y) ----------
   Every change to the notes or folders is one step: writing (each pause in typing), new / renamed / moved / starred /
   deleted folders, new or deleted notes, widgets, order. A burst of writes within 700 ms counts as one step. Since 0.5.6 a
   step keeps only the notes it changed (their versions before it) and the folders if they changed, not a copy of every note:
   a long session no longer piles up copies of the whole store. Up to 100 steps. Photos and videos stay in IndexedDB until
   the app closes, so undoing a delete brings them back too. */
const H = { undo: [], redo: [], cur: null, t: 0, lock: false };
const hfire = () => window.dispatchEvent(new CustomEvent("inquire:notes-history", { detail: { undo: H.undo.length, redo: H.redo.length } }));
function hstep() {
  if (!H.cur) { H.cur = { n: new Map(), f: null }; H.undo.push(H.cur); if (H.undo.length > 100) H.undo.shift(); H.redo = []; }
  clearTimeout(H.t); H.t = setTimeout(settle, 700); return H.cur;
}
function record(ids, prev) { if (H.lock || !MEM.ready) return; const s = hstep(); ids.forEach(id => { if (!s.n.has(id)) s.n.set(id, prev.get(id) || null); }); }
function recordF(prevF) { if (H.lock || !MEM.ready) return; const s = hstep(); if (!s.f) s.f = prevF; }
function touched() { if (!H.lock) hfire(); }
function settle() { clearTimeout(H.t); H.cur = null; }
const live = new Set(); // mounted editors: their unsaved typing is saved before an undo
function histStep(from, to) {
  live.forEach(a => a.flush()); settle();
  if (!from.length) return false;
  const s = from.pop(), cur = new Map(MEM.notes.map(n => [n.id, n])), inv = { n: new Map(), f: s.f ? MEM.folders : null };
  s.n.forEach((n, id) => { inv.n.set(id, cur.get(id) || null); if (n) cur.set(id, n); else cur.delete(id); });
  H.lock = true; try { write([...cur.values()].map(shallow)); if (s.f) writeF(s.f); } finally { H.lock = false; }
  to.push(inv); changed(); hfire(); return true;
}
const undo = () => histStep(H.undo, H.redo), redo = () => histStep(H.redo, H.undo);
const history = () => ({ undo: H.undo.length, redo: H.redo.length, kept: H.undo.concat(H.redo).reduce((k, st) => k + st.n.size, 0) }); // kept = note versions held for undo
function list(q, sp) {
  sp = sp || "notes";
  const all = read().filter(n => spaceOf(n) === sp).sort(byUpdated);
  if (!q) return all;
  const s = q.toLowerCase();
  return all.filter(n => (n.title + "\n" + n.body + "\n" + (n.src ? n.src.title : "")).toLowerCase().includes(s));
}
const get = id => { const n = MEM.notes.find(x => x.id === id); return n ? shallow(n) : null; }; // v0.5.6: no copy of the whole store
function create(o = {}) {
  const now = Date.now(), html = o.html != null ? sanitize(o.html) : textToHtml(o.body || "");
  const n = { id: uid(), title: o.title || "Untitled note", html, body: toText(html), created: now, updated: now, src: o.src || null,
    fav: !!o.fav, folder: o.folder || null, links: Array.isArray(o.links) ? o.links.slice() : o.src && o.src.topic ? ["t:" + o.src.topic] : [] };
  if (o.cover && COVER_ID.test(o.cover)) n.cover = o.cover; // cover photo (v0.5.4)
  if (o.space === "code") { const c = o.code || {}; n.space = "code"; n.code = { lang: String(c.lang || "python"), src: String(c.src || "") }; n.html = ""; n.body = n.code.src; if (!o.title) n.title = "Untitled code"; }
  const all = read(); all.push(n); write(all); return n;
}
function update(id, patch) {
  const all = read(), n = all.find(x => x.id === id); if (!n) return null;
  patch = Object.assign({}, patch);
  if (n.space === "code") { delete patch.html; if (patch.code) { patch.code = { lang: String(patch.code.lang || n.code.lang), src: String(patch.code.src ?? n.code.src), stdin: String(patch.code.stdin ?? n.code.stdin ?? "") }; patch.body = patch.code.src; } else delete patch.body; }
  else if (patch.html != null) { patch.html = sanitize(patch.html); patch.body = toText(patch.html); }
  else if (patch.body != null) patch.html = textToHtml(patch.body);
  const quiet = patch.quiet; delete patch.quiet;
  if ("cover" in patch) { const c = patch.cover && COVER_ID.test(patch.cover) ? patch.cover : null; if (n.cover && n.cover !== c) oldCovers.add(n.cover); if (c) patch.cover = c; else { delete patch.cover; delete n.cover; } }
  Object.assign(n, patch); if (!quiet) n.updated = Date.now(); write(all); return n;
}
function remove(id) {
  const all = read(), n = all.find(x => x.id === id); if (!n) return;
  const rest = all.filter(x => x.id !== id), still = new Set(rest.flatMap(noteMedia));
  delImages(noteMedia(n).filter(i => !still.has(i)));
  write(rest);
}
// delete with undo: trash() takes the note out at once but keeps its photos/videos; restore() puts it back as it was;
// purge() (after the undo window, or when the page closes) deletes the media no other note uses
const trashed = new Map();
function trash(id) {
  const all = read(), n = all.find(x => x.id === id); if (!n) return null;
  write(all.filter(x => x.id !== id)); trashed.set(id, n); return n;
}
function restore(id) {
  const n = trashed.get(id); if (!n) return null; trashed.delete(id);
  const all = read(); if (!all.some(x => x.id === id)) { all.push(n); write(all); } return n;
}
function purge(id) {
  const n = trashed.get(id); if (!n) return; trashed.delete(id);
  const still = new Set(read().flatMap(noteMedia));
  delImages(noteMedia(n).filter(i => !still.has(i)));
}
window.addEventListener("pagehide", () => [...trashed.keys()].forEach(purge));
// cover photos that were changed or taken off go when the app closes (until then ↶ Undo can bring them back), unless a note still uses them
const oldCovers = new Set();
window.addEventListener("pagehide", () => { if (!oldCovers.size) return; const still = new Set(read().flatMap(noteMedia)); delImages([...oldCovers].filter(i => !still.has(i))); });
// a deleted-note message with Undo (shared by My notes and the Assist dock)
function deleteWithUndo(id, onUndo) {
  const n = trash(id); if (!n) return;
  let done = false;
  const t = setTimeout(() => { done = true; }, 8000); // the media stay until the app closes (pagehide → purge), so ↶ Undo can still restore the note
  toast(`Deleted “${esc(n.title)}”`, { label: "Undo", run: () => { if (done) return; done = true; clearTimeout(t); restore(id); if (onUndo) onUndo(id); } }, 8000);
}
function toast(html, action, ms) {
  document.querySelectorAll(".tm-toast").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "tm-toast win"; t.setAttribute("role", "status");
  t.innerHTML = `<span>${html}</span>` + (action ? `<button type="button" class="btn-s">${esc(action.label)}</button>` : "");
  document.body.appendChild(t);
  if (action) t.querySelector("button").onclick = () => { t.remove(); action.run(); };
  ms = ms || 4000; setTimeout(() => t.classList.add("out"), ms - 400); setTimeout(() => t.remove(), ms);
  return t;
}
// a definition (or any short block) added to the end of a note, optionally linked to a lesson
function appendBlock(id, html, topic) {
  const n = get(id); if (!n) return null;
  return update(id, { html: n.html + html + "<div><br></div>", links: topic && !n.links.includes("t:" + topic) ? n.links.concat("t:" + topic) : n.links });
}
const link = (id, k) => { const n = get(id); if (n && !n.links.includes(k)) update(id, { links: n.links.concat(k), quiet: true }); };
const unlink = (id, k) => { const n = get(id); if (n) update(id, { links: n.links.filter(x => x !== k), quiet: true }); };
// a quote from a lesson, linked back to it (context menu "Link to a note" on a topic page, dock "Clip selection")
function appendQuote(id, text, topic, title) {
  const n = get(id); if (!n) return null;
  const back = topic ? `<br>— <a class="nlink" data-topic="${esc(topic)}" contenteditable="false">${esc(title || topic)}</a>` : "";
  const html = n.html + `<blockquote>“${esc(text)}”${back}</blockquote><div><br></div>`;
  return update(id, { html, links: topic && !n.links.includes("t:" + topic) ? n.links.concat("t:" + topic) : n.links });
}

/* ---------- folders ---------- */
// Folders nest (parent id) and keep the order the user drags them into (order); older folders without order fall back to A–Z.
const fnorm = f => { if (f.parent === undefined) f.parent = null; return f; };
// starred folders (fav) come first among their sibling folders, so starred top-level folders lead the folders column
const fcmp = (a, b) => (!!b.fav - !!a.fav) || ((a.order ?? 1e9) - (b.order ?? 1e9)) || a.name.localeCompare(b.name);
// flat list in tree order (parents before children, siblings in order), each with depth
function folders(sp) {
  sp = sp || "notes";
  const all = readF().map(fnorm).filter(f => spaceOf(f) === sp), ids = new Set(all.map(f => f.id)), out = [], seen = new Set();
  all.forEach(f => { if (f.parent && (!ids.has(f.parent) || f.parent === f.id)) f.parent = null; });
  const walk = (pid, d) => all.filter(f => f.parent === pid && !seen.has(f.id)).sort(fcmp).forEach(f => { seen.add(f.id); out.push(Object.assign({}, f, { depth: d })); walk(f.id, d + 1); });
  walk(null, 0);
  all.filter(f => !seen.has(f.id)).forEach(f => out.push(Object.assign({}, f, { parent: null, depth: 0 }))); // a broken cycle shows at the top level
  return out;
}
// a folder and every folder inside it
function subtree(id) { const all = readF().map(fnorm), out = new Set([id]); let grew = true; while (grew) { grew = false; all.forEach(f => { if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; } }); } return out; }
function addFolder(name, parent, sp) {
  sp = sp || "notes";
  const all = readF().map(fnorm), pid = parent && all.some(f => f.id === parent && spaceOf(f) === sp) ? parent : null;
  const sib = all.filter(f => f.parent === pid && spaceOf(f) === sp), order = sib.length ? Math.max(...sib.map(f => f.order ?? sib.indexOf(f))) + 1 : 0;
  const now = Date.now(), f = { id: uid(), name: String(name || "").trim().slice(0, 60) || "New folder", parent: pid, order, created: now, updated: now }; if (sp === "code") f.space = "code"; writeF(all.concat(f)); return f;
}
function setFolderFav(id, on) { const all = readF(), f = all.find(x => x.id === id); if (!f) return; if (on) f.fav = true; else delete f.fav; writeF(all); }
function renameFolder(id, name) { const all = readF(), f = all.find(x => x.id === id); if (!f) return; f.name = String(name || "").trim().slice(0, 60) || f.name; f.updated = Date.now(); writeF(all); }
// move folder id into parent (null = top level), placed before folder `before` (or last); refuses to move a folder into itself or its own subfolders
function moveFolder(id, parent, before) {
  parent = parent || null;
  if (parent && subtree(id).has(parent)) return false;
  const all = readF().map(fnorm), f = all.find(x => x.id === id); if (!f) return false;
  if (parent) { const p = all.find(x => x.id === parent); if (!p || spaceOf(p) !== spaceOf(f)) return false; }
  const sib = folders(spaceOf(f)).filter(x => x.parent === parent && x.id !== id).map(x => x.id);
  const at = before && sib.includes(before) ? sib.indexOf(before) : sib.length;
  sib.splice(at, 0, id);
  f.parent = parent;
  sib.forEach((sid, i) => { const g = all.find(x => x.id === sid); if (g) g.order = i; });
  writeF(all); return true;
}
// deleting a folder keeps everything in it: its notes and subfolders move up to its parent
function removeFolder(id) {
  const fs = readF().map(fnorm), f = fs.find(x => x.id === id), up = f ? f.parent : null;
  writeF(fs.filter(x => x.id !== id).map(x => x.parent === id ? Object.assign(x, { parent: up, order: (x.order ?? 0) + 1000 }) : x));
  const all = read(); let hit = false; all.forEach(n => { if (n.folder === id) { n.folder = up; hit = true; } }); if (hit) write(all);
}
// the user's own note order ("My order"): notes never dragged have no order and sit on top, newest first
const byOrder = (a, b) => { const ao = a.order == null, bo = b.order == null; return ao !== bo ? (ao ? -1 : 1) : ao ? byUpdated(a, b) : a.order - b.order; };
function setOrder(ids) { // ids = every note id in the new order
  const all = read(), pos = new Map(ids.map((id, i) => [id, i])); all.forEach(n => { if (pos.has(n.id)) n.order = pos.get(n.id); }); write(all);
}

/* ---------- photos (IndexedDB; the same database as the notes, see db() above) ---------- */
const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction("images", mode), req = fn(t.objectStore("images"));
  t.oncomplete = () => res(req && "result" in req ? req.result : undefined); t.onerror = () => rej(t.error);
}));
async function shrink(blob) { // long side ≤ 1800 px keeps the store small; GIFs and SVGs are kept as they are
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type) || !window.createImageBitmap) return blob;
  try {
    const bm = await createImageBitmap(blob), M = 1800, sc = Math.min(1, M / Math.max(bm.width, bm.height));
    if (sc === 1 && blob.size < 1.5e6) return blob;
    const c = document.createElement("canvas"); c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
    c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || blob), blob.type === "image/png" ? "image/png" : "image/jpeg", .86));
  } catch (e) { return blob; }
}
async function putImage(blob) { const id = uid(), b = await shrink(blob); await tx("readwrite", st => st.put({ blob: b, at: Date.now() }, id)); return id; }
const VIDEO_MAX = 500 * 1024 * 1024, VIDEO_BACKUP_MAX = 25 * 1024 * 1024; // videos are stored as they are; backups carry only the small ones
async function putVideo(blob) { if (blob.size > VIDEO_MAX) throw new Error("too big"); const id = uid(); await tx("readwrite", st => st.put({ blob, at: Date.now() }, id)); return id; }
const urls = {};
async function imageURL(id) {
  if (urls[id]) return urls[id];
  const rec = await tx("readonly", st => st.get(id)).catch(() => null);
  return rec && rec.blob ? (urls[id] = URL.createObjectURL(rec.blob)) : null;
}
/* v0.5.7 (memory): the notes list shows covers 38–56 px wide; decoding the stored 1800 px photo for each (~10 MB a piece) was the
   biggest memory cost of a long list. thumbURL makes a small copy once per session (one at a time, so opening a big list does not spike). */
const turls = {}, tq = []; let tbusy = false;
function thumbURL(id, px) {
  px = px || 160; const k = id + ":" + px;
  if (turls[k]) return Promise.resolve(turls[k]);
  return new Promise(res => { tq.push({ id, px, k, res }); thumbPump(); });
}
async function thumbPump() {
  if (tbusy) return; tbusy = true;
  while (tq.length) {
    const j = tq.shift();
    if (turls[j.k]) { j.res(turls[j.k]); continue; }
    try {
      const rec = await tx("readonly", st => st.get(j.id)), b = rec && rec.blob;
      if (!b) { j.res(null); continue; }
      if (!/^image\/(png|jpeg|webp)$/.test(b.type) || !window.createImageBitmap) { j.res(await imageURL(j.id)); continue; }
      const bm = await createImageBitmap(b), sc = Math.min(1, j.px / Math.min(bm.width, bm.height));
      if (sc === 1) { if (bm.close) bm.close(); j.res(await imageURL(j.id)); continue; }
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bm.width * sc)); c.height = Math.max(1, Math.round(bm.height * sc));
      c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height); if (bm.close) bm.close();
      const tb = await new Promise(r => c.toBlob(r, "image/jpeg", .8));
      c.width = c.height = 0;
      j.res(tb ? (turls[j.k] = URL.createObjectURL(tb)) : await imageURL(j.id));
    } catch (e) { j.res(null); }
  }
  tbusy = false;
}
function dropThumbs(id) { Object.keys(turls).forEach(k => { if (k.startsWith(id + ":")) { URL.revokeObjectURL(turls[k]); delete turls[k]; } }); }
// backups: the photos a set of notes uses, as data URLs, and back
const fromDataURL = u => { const m = String(u).match(/^data:([^;,]+)(;base64)?,(.*)$/); if (!m) throw new Error("bad data URL"); const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m[1] }); };
const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
// backups: like exportImages, plus the videos left out for size → { map, skipped: [{ note, title, mb }] }
async function exportMedia(notes) {
  const map = {}, skipped = [];
  for (const n of (notes || read())) for (const id of noteMedia(n)) {
    if (map[id]) continue;
    const rec = await tx("readonly", st => st.get(id)).catch(() => null); if (!rec || !rec.blob) continue;
    if (rec.blob.size > VIDEO_BACKUP_MAX) { skipped.push({ note: n.title, mb: Math.round(rec.blob.size / 1048576) }); continue; }
    map[id] = await toDataURL(rec.blob);
  }
  return { map, skipped };
}
async function exportImages(notes) {
  const out = {}, ids = [...new Set((notes || read()).flatMap(noteMedia))];
  for (const id of ids) { const rec = await tx("readonly", st => st.get(id)).catch(() => null); if (rec && rec.blob && !(/^video\//.test(rec.blob.type) && rec.blob.size > VIDEO_BACKUP_MAX)) out[id] = await toDataURL(rec.blob); }
  return out;
}
async function importImages(map) {
  let n = 0;
  for (const [id, url] of Object.entries(map || {})) {
    if (!/^[a-z0-9]+$/i.test(id) || !/^data:(image|video|audio|text|application)\/[a-z0-9+.-]+;base64,/i.test(String(url))) continue; // My Tasks also keeps any file
    try { const b = fromDataURL(url); await tx("readwrite", st => st.put({ blob: b, at: Date.now() }, id)); if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } n++; } catch (e) {}
  }
  return n;
}
function delImages(ids) { if (ids.length) tx("readwrite", st => { ids.forEach(i => { st.delete(i); dropThumbs(i); if (urls[i]) { URL.revokeObjectURL(urls[i]); delete urls[i]; } }); return null; }).catch(() => {}); }
function hydrate(root) {
  if (window.InquireWidgets) root.querySelectorAll("div.nw").forEach(w => InquireWidgets.mount(w));
  root.querySelectorAll("img[data-img]").forEach(im => { if (im.src) return; imageURL(im.dataset.img).then(u => { if (u) im.src = u; else { im.alt = "Photo missing"; im.classList.add("missing"); } }); });
  root.querySelectorAll("a.nlink").forEach(a => {
    a.contentEditable = "false"; a.tabIndex = 0; a.setAttribute("role", "link");
    const n = a.dataset.note && get(a.dataset.note), f = a.dataset.folder && readF().find(x => x.id === a.dataset.folder);
    a.title = a.dataset.note ? (n ? "Open note: " + n.title : "Linked note was deleted") : a.dataset.folder ? (f ? "Open folder: " + f.name : "Linked folder was deleted") : "Open lesson";
    a.classList.toggle("gone", (!!a.dataset.note && !n) || (!!a.dataset.folder && !f));
  });
}

/* ---------- small picker popover (notes, link targets) ----------
   pick({ x, y, title, placeholder, items: [{ id, label, sub, ic }], create: q => label | null }) → Promise<id | { create: q } | null> */
function pick(o) {
  return new Promise(done => {
    document.querySelectorAll(".nk-pick").forEach(p => p.remove());
    const p = document.createElement("div");
    p.className = "nk-pick win"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", o.title || "Pick");
    p.innerHTML = `<div class="win-h"><span class="dot"></span>${esc(o.title || "Pick")}</div>
      <input class="nk-q" type="search" placeholder="${esc(o.placeholder || "Search")}" aria-label="Search"><div class="nk-list" role="listbox"></div>`;
    document.body.appendChild(p);
    const q = p.querySelector(".nk-q"), lst = p.querySelector(".nk-list");
    const W = Math.min(340, innerWidth - 16); p.style.width = W + "px";
    p.style.left = Math.max(8, Math.min(innerWidth - W - 8, o.x || 8)) + "px";
    const top = o.y || 8; p.style.top = Math.max(8, Math.min(innerHeight - 380, top)) + "px";
    const finish = v => { p.remove(); document.removeEventListener("pointerdown", out, true); document.removeEventListener("keydown", key, true); done(v); };
    const out = e => { if (!p.contains(e.target)) finish(null); };
    const key = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const bs = [...lst.querySelectorAll("button")], i = bs.indexOf(document.activeElement); const nx = bs[e.key === "ArrowDown" ? Math.min(bs.length - 1, i + 1) : Math.max(0, i - 1)]; if (nx) nx.focus(); else if (bs[0]) bs[0].focus(); }
    };
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const hits = o.items.filter(x => !s || (x.label + " " + (x.sub || "")).toLowerCase().includes(s)).slice(0, 60);
      const mk = o.create ? o.create(q.value.trim()) : null;
      lst.innerHTML = (mk ? `<button type="button" class="nk-it nk-new" data-new="1"><span class="nk-ic">＋</span><span>${esc(mk)}</span></button>` : "")
        + hits.map(x => `<button type="button" class="nk-it" data-id="${esc(x.id)}"><span class="nk-ic"${x.col ? ` style="color:${esc(x.col)}"` : ""}>${x.ic || "▤"}</span><span>${esc(x.label)}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span></button>`).join("")
        + (!hits.length && !mk ? `<p class="nk-none">Nothing matches.</p>` : "");
    };
    lst.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; finish(b.dataset.new ? { create: q.value.trim() } : b.dataset.id); });
    q.addEventListener("input", draw);
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const b = lst.querySelector("button"); if (b) b.click(); } });
    document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", key, true);
    draw(); setTimeout(() => q.focus({ preventScroll: true }), 0);
  });
}
// pick a note (or make a new one); resolves to a note id or null
async function pickNote(o = {}) {
  const items = list().filter(n => n.id !== o.exclude).map(n => ({ id: n.id, label: n.title, sub: (n.fav ? "★ " : "") + (n.body.slice(0, 60) || "Empty note"), ic: "✎" }));
  const r = await pick({ x: o.x, y: o.y, title: o.title || "Link to a note", placeholder: "Search your notes", items, create: q => "New note: " + (q || o.suggest || "Untitled note") });
  if (!r) return null;
  if (typeof r === "object") return create({ title: (r.create || o.suggest || "Untitled note").slice(0, 140), folder: o.folder || null }).id;
  return r;
}

/* ---------- rich editor ----------
   mountEditor(host, id, { onEditing, onSaved, openNote(id), openTopic(id) }) → api { el, flush, addFiles(files), addURL(url), linkRange(range, noteId) } */
const editors = new WeakMap();
function mountEditor(host, id, o = {}) {
  const n = get(id); if (!n) return null;
  const ed = document.createElement("div");
  ed.className = "nb-rich"; ed.contentEditable = "true"; ed.spellcheck = true;
  ed.setAttribute("role", "textbox"); ed.setAttribute("aria-multiline", "true"); ed.setAttribute("aria-label", "Note"); ed.dataset.noteId = id;
  ed.dataset.placeholder = "Write… Paste or drop photos and videos here. Select words and right-click to link them to another note.";
  ed.innerHTML = sanitize(n.html); hydrate(ed);
  let bar = null;
  // the hint shows only while the note is truly blank: a heading, bullet, number, checkbox, photo or widget hides it too
  const empty = () => ed.classList.toggle("is-empty", !ed.textContent.trim() && !ed.querySelector("img, ul, ol, li, h1, h2, h3, h4, h6, blockquote, pre, hr, .nw, a.nlink"));
  empty();
  let t = null, last = null;
  const flush = () => { if (!t) return; clearTimeout(t); t = null; update(id, { html: ed.innerHTML }); if (o.onSaved) o.onSaved(); };
  const save = () => { clearTimeout(t); t = setTimeout(flush, 400); empty(); if (o.onEditing) o.onEditing(); };
  ed.addEventListener("input", save);
  const inWidget = node => { const el = node && (node.nodeType === 1 ? node : node.parentElement); return !!(el && el.closest && el.closest(".nw")); };
  const remember = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.getRangeAt(0).commonAncestorContainer) && !inWidget(s.getRangeAt(0).commonAncestorContainer)) last = s.getRangeAt(0).cloneRange(); };
  document.addEventListener("selectionchange", remember);
  function insert(nodes) {
    ed.focus({ preventScroll: true });
    let r = last && ed.contains(last.commonAncestorContainer) && !inWidget(last.commonAncestorContainer) ? last : null;
    if (!r) { r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); }
    r.deleteContents();
    const frag = document.createDocumentFragment(); nodes.forEach(x => frag.appendChild(x)); const end = frag.lastChild;
    r.insertNode(frag);
    if (end) { const s = getSelection(), r2 = document.createRange(); r2.setStartAfter(end); r2.collapse(true); s.removeAllRanges(); s.addRange(r2); last = r2.cloneRange(); }
    hydrate(ed); save();
  }
  const imgEl = attrs => { const im = document.createElement("img"); im.className = "nimg"; Object.entries(attrs).forEach(([k, v]) => im.setAttribute(k, v)); return im; };
  // photos go in at the caret; video files become video blocks (stored in IndexedDB like photos)
  async function addFiles(files) {
    const imgs = [...files].filter(f => f && /^image\//.test(f.type)), vids = [...files].filter(f => f && /^video\//.test(f.type));
    const ids = [];
    for (const f of imgs) { try { ids.push(await putImage(f)); } catch (e) { console.warn("Photo not stored", e); } }
    if (ids.length) insert(ids.flatMap(i => [imgEl({ "data-img": i, alt: "" }), document.createElement("br")]));
    let nv = 0;
    for (const f of vids) { try { const vid = await putVideo(f); addWidget("video", { kind: "file", vid, title: String(f.name || "").replace(/\.[^.]+$/, "").slice(0, 80) }); nv++; } catch (e) { console.warn("Video not stored", e); if (o.onMessage) o.onMessage(f.size > VIDEO_MAX ? "That video is over 500 MB" : "That video could not be stored"); } }
    return ids.length + nv;
  }
  // a video from a link: YouTube, Vimeo, or an https .mp4/.webm/.ogg/.mov file
  function addVideoLink(url) {
    const v = window.InquireWidgets && InquireWidgets.videoFrom(url); if (!v) return false;
    addWidget("video", v); return true;
  }
  function addURL(url) {
    url = String(url || "").trim();
    if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) return false;
    insert([imgEl({ src: url, alt: "Linked photo" }), document.createElement("br")]); return true;
  }
  function linkRange(range, noteId) {
    if (!range || !ed.contains(range.commonAncestorContainer)) return false;
    const text = range.toString(); if (!text.trim()) return false;
    range.deleteContents();
    const a = document.createElement("a"); a.className = "nlink"; a.dataset.note = noteId; a.textContent = text;
    range.insertNode(a); last = null;
    const r2 = document.createRange(); r2.setStartAfter(a); r2.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r2);
    hydrate(ed); save(); flush(); return true;
  }
  // a link dropped inside a word goes after that word, not into the middle of it
  const wordEnd = r => { const n = r.startContainer; if (n.nodeType !== 3) return r; let i = r.startOffset; const t = n.data;
    if (i > 0 && i < t.length && /\w/.test(t[i - 1]) && /\w/.test(t[i])) { while (i < t.length && /\w/.test(t[i])) i++; const r2 = document.createRange(); r2.setStart(n, i); r2.collapse(true); return r2; } return r; };
  // a note dragged in from My notes: a link to it (its title) at the drop point, or at the end
  function insertNoteLink(range, noteId) {
    const t = get(noteId); if (!t) return false;
    if (!range || !ed.contains(range.startContainer) || inWidget(range.startContainer)) { range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); }
    else { range = wordEnd(range.cloneRange()); range.collapse(true); const inA = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest("a.nlink"); if (inA && ed.contains(inA)) range.setStartAfter(inA); }
    const a = document.createElement("a"); a.className = "nlink"; a.dataset.note = noteId; a.textContent = t.title || "Untitled note";
    const lead = range.startContainer.nodeType === 3 && range.startOffset > 0 && !/\s/.test(range.startContainer.data[range.startOffset - 1]); // a space before the link when it follows a word
    const nx = range.startContainer.nodeType === 3 ? range.startContainer.data[range.startOffset] : null; // and one after it, unless a space is already there
    const sp = document.createTextNode(nx && /\s/.test(nx) ? "" : " "); range.insertNode(sp); range.insertNode(a); if (lead) range.insertNode(document.createTextNode(" "));
    const r2 = document.createRange(); r2.setStartAfter(sp); r2.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r2); last = r2.cloneRange();
    ed.classList.remove("is-empty"); hydrate(ed); save(); flush(); return true;
  }
  // a folder dragged in from the folders column: a link to it (its name) at the drop point; it opens that folder
  function insertFolderLink(range, folderId) {
    const f = readF().find(x => x.id === folderId); if (!f) return false;
    if (!range || !ed.contains(range.startContainer) || inWidget(range.startContainer)) { range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); }
    else { range = wordEnd(range.cloneRange()); range.collapse(true); const inA = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest("a.nlink"); if (inA && ed.contains(inA)) range.setStartAfter(inA); }
    const a = document.createElement("a"); a.className = "nlink"; a.dataset.folder = folderId; a.textContent = f.name || "Folder";
    const lead = range.startContainer.nodeType === 3 && range.startOffset > 0 && !/\s/.test(range.startContainer.data[range.startOffset - 1]); // a space before the link when it follows a word
    const nx = range.startContainer.nodeType === 3 ? range.startContainer.data[range.startOffset] : null; // and one after it, unless a space is already there
    const sp = document.createTextNode(nx && /\s/.test(nx) ? "" : " "); range.insertNode(sp); range.insertNode(a); if (lead) range.insertNode(document.createTextNode(" "));
    const r2 = document.createRange(); r2.setStartAfter(sp); r2.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r2); last = r2.cloneRange();
    ed.classList.remove("is-empty"); hydrate(ed); save(); flush(); return true;
  }
  // a code file dragged in from the Code folders: a code box (a copy of its source) after the line at the drop point
  function insertWidgetAt(range, type, data) {
    if (!window.InquireWidgets) return false;
    const w = InquireWidgets.create(type, data), after = document.createElement("div"); after.appendChild(document.createElement("br"));
    let block = range && ed.contains(range.endContainer) && !inWidget(range.endContainer) ? range.endContainer : null;
    while (block && block.parentNode !== ed) block = block.parentNode;
    if (block) block.after(w, after); else ed.append(w, after);
    ed.classList.remove("is-empty"); hydrate(ed); save(); flush(); w.scrollIntoView({ block: "nearest" }); return true;
  }
  ed.addEventListener("paste", async e => {
    const cd = e.clipboardData; if (!cd || inWidget(e.target)) return;
    e.preventDefault();
    const files = [...cd.files].filter(f => /^(image|video)\//.test(f.type));
    if (files.length) { await addFiles(files); return; }
    const html = cd.getData("text/html");
    if (html) {
      const tp = document.createElement("template"); tp.innerHTML = html;
      for (const im of tp.content.querySelectorAll('img[src^="data:image"]')) { try { const b = fromDataURL(im.getAttribute("src")); im.setAttribute("data-img", await putImage(b)); im.removeAttribute("src"); } catch (err) { im.remove(); } }
      const safe = document.createElement("template"); safe.innerHTML = sanitize(tp.innerHTML);
      insert([...safe.content.childNodes]); return;
    }
    const txt = cd.getData("text/plain"); if (txt) document.execCommand("insertText", false, txt);
  });
  ed.addEventListener("dragover", e => { if (inWidget(e.target)) return; if ([...(e.dataTransfer && e.dataTransfer.items || [])].some(i => i.kind === "file")) { e.preventDefault(); ed.classList.add("drop"); } });
  ed.addEventListener("dragleave", () => ed.classList.remove("drop"));
  ed.addEventListener("drop", e => { if (inWidget(e.target)) return;
    const fs = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(f => /^(image|video)\//.test(f.type));
    ed.classList.remove("drop"); if (!fs.length) return;
    e.preventDefault();
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (r && ed.contains(r.startContainer)) last = r;
    addFiles(fs);
  });
  // checklists (NotePath): the box drawn left of each item ticks the item off; a new item starts unticked
  ed.addEventListener("pointerdown", e => {
    const li = e.target.closest && e.target.closest("ul[data-ck] > li"); if (!li || !ed.contains(li)) return;
    if (e.clientX >= li.getBoundingClientRect().left) return;
    e.preventDefault();
    if (li.getAttribute("data-done") === "1") li.removeAttribute("data-done"); else li.setAttribute("data-done", "1");
    save();
  });
  ed.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.shiftKey) return;
    setTimeout(() => { const s = getSelection(); if (!s.rangeCount) return; const n = s.getRangeAt(0).startContainer, el = n.nodeType === 1 ? n : n.parentElement;
      const li = el && el.closest("ul[data-ck] > li"); if (li && ed.contains(li) && !li.textContent.trim()) li.removeAttribute("data-done"); }, 0);
  });
  // selecting words across ticked checklist items brings up "Uncheck all": it unticks every ticked item the selection touches
  let ckb = null;
  const ckItems = () => { const s = getSelection(); if (!s.rangeCount) return [];
    const r = s.getRangeAt(0); if (r.collapsed || !ed.contains(r.commonAncestorContainer)) return [];
    return [...ed.querySelectorAll('ul[data-ck] > li[data-done="1"]')].filter(li => r.intersectsNode(li)); };
  const ckHide = () => { if (ckb) { ckb.remove(); ckb = null; } };
  const ckShow = () => {
    const items = ckItems(); if (!items.length) { ckHide(); return; }
    if (!ckb) {
      ckb = document.createElement("button"); ckb.type = "button"; ckb.className = "np-ck";
      ckb.addEventListener("mousedown", e => e.preventDefault()); // keep the selection
      ckb.addEventListener("click", () => { const its = ckItems(); its.forEach(li => li.removeAttribute("data-done")); ckHide(); if (its.length) { save(); flush(); } });
      document.body.appendChild(ckb);
    }
    ckb.innerHTML = `<span class="np-ck-box" aria-hidden="true"></span>Uncheck all <span class="num">${items.length}</span>`;
    ckb.setAttribute("aria-label", `Uncheck all ${items.length} ticked item${items.length > 1 ? "s" : ""} in the selection`);
    const rr = getSelection().getRangeAt(0).getBoundingClientRect(), bw = ckb.offsetWidth || 150, er = ed.getBoundingClientRect();
    if (rr.bottom < er.top || rr.top > er.bottom || rr.bottom < 0 || rr.top > innerHeight) { ckb.style.visibility = "hidden"; return; } ckb.style.visibility = "";
    ckb.style.left = Math.max(8, Math.min(innerWidth - bw - 8, rr.left + rr.width / 2 - bw / 2)) + "px";
    ckb.style.top = (rr.top > 60 ? rr.top - 40 : rr.bottom + 8) + "px";
  };
  let ckT = 0; const ckSoon = () => { clearTimeout(ckT); ckT = setTimeout(ckShow, 60); };
  document.addEventListener("selectionchange", ckSoon);
  const ckScroll = () => { if (ckb) ckSoon(); }; document.addEventListener("scroll", ckScroll, true); // follow the words when anything around them scrolls
  ed.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== ed) ckHide(); }, 120));
  /* ----- lists (NotePath): the bullet button again (or Tab) indents an item under the one above; Shift+Tab moves it back
     out; delete (Backspace) at the start of an item is the only way to take a bullet, number or checkbox off: a nested
     item first moves out one level, a top-level item becomes a plain line ----- */
  const caretAt = () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; };
  const keepCaret = (fn) => { const r = caretAt(), at = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset]; fn();
    if (at && ed.contains(at[0]) && ed.contains(at[2])) try { const nr = document.createRange(); nr.setStart(at[0], at[1]); nr.setEnd(at[2], at[3]); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); last = nr.cloneRange(); } catch (e) {} };
  const itemAt = () => { const r = caretAt(); if (!r || !ed.contains(r.startContainer) || inWidget(r.startContainer)) return null;
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement, li = el && el.closest("li"); return li && ed.contains(li) ? li : null; };
  const subList = (L) => { const n = document.createElement(L.tagName); if (L.hasAttribute("data-ck")) n.setAttribute("data-ck", "1"); return n; };
  function indentItem(li) {
    li = li || itemAt(); if (!li) return false;
    const L = li.parentElement, prev = li.previousElementSibling;
    if (!prev || prev.tagName !== "LI") { if (o.onMessage) o.onMessage("Add an item above this one to indent it under"); return false; }
    keepCaret(() => {
      let sub = prev.lastElementChild && /^(UL|OL)$/.test(prev.lastElementChild.tagName) ? prev.lastElementChild : null;
      if (!sub) { sub = subList(L); prev.appendChild(sub); }
      sub.appendChild(li);
      // the item's own sub-items come along at the same depth below it
    });
    save(); return true;
  }
  function outdentItem(li) {
    li = li || itemAt(); if (!li) return false;
    const L = li.parentElement, host = L && L.parentElement && L.parentElement.closest("li");
    if (!host || !ed.contains(host)) return false;
    keepCaret(() => {
      const after = []; let x = li.nextElementSibling; while (x) { after.push(x); x = x.nextElementSibling; }
      if (after.length) { let sub = li.lastElementChild && /^(UL|OL)$/.test(li.lastElementChild.tagName) ? li.lastElementChild : null; if (!sub) { sub = subList(L); li.appendChild(sub); } after.forEach(y => sub.appendChild(y)); }
      host.after(li); if (!L.children.length) L.remove();
    });
    save(); return true;
  }
  // a top-level item becomes a plain line where it stood (the list splits around it; its sub-items stay a list below it)
  function unlistItem(li) {
    const L = li.parentElement; if (!L || !/^(UL|OL)$/.test(L.tagName)) return false;
    const line = document.createElement("div"), subs = [];
    [...li.childNodes].forEach(c => { if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) subs.push(c); else line.appendChild(c); });
    if (!line.childNodes.length) line.appendChild(document.createElement("br"));
    const tail = subList(L); let x = li.nextElementSibling; while (x) { const nx = x.nextElementSibling; tail.appendChild(x); x = nx; }
    li.remove(); L.after(line); let at = line; subs.forEach(sl => { at.after(sl); at = sl; }); if (tail.children.length) at.after(tail);
    if (!L.children.length) L.remove();
    const r = document.createRange(); r.setStart(line, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); last = r.cloneRange();
    save(); return true;
  }
  const atItemStart = (li, r) => { if (!r.collapsed) return false; const t = document.createRange(); t.setStart(li, 0);
    try { t.setEnd(r.startContainer, r.startOffset); } catch (e) { return false; }
    return !t.toString().length && !t.cloneContents().querySelector("img, .nw, a.nlink"); };
  ed.addEventListener("keydown", e => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Tab") { const li = itemAt(); if (!li) return; e.preventDefault(); if (e.shiftKey) outdentItem(li); else indentItem(li); return; }
    if (e.key === "Enter" && !e.shiftKey) { const li = itemAt(); if (li && !li.textContent.trim() && !li.querySelector("img, ul, ol") && outdentItem(li)) e.preventDefault(); return; } // an empty sub-item: back out one level
    if (e.key === "Backspace") {
      const r = caretAt(), li = itemAt(); if (!li || !r || !atItemStart(li, r)) return;
      e.preventDefault(); if (!outdentItem(li)) unlistItem(li);
    }
  });
  const follow = a => { if (a.dataset.folder) { if (o.openFolder && readF().some(x => x.id === a.dataset.folder)) { flush(); o.openFolder(a.dataset.folder); } return; } if (a.dataset.note) { if (get(a.dataset.note) && o.openNote) { flush(); o.openNote(a.dataset.note); } } else if (a.dataset.topic && o.openTopic) { flush(); o.openTopic(a.dataset.topic); } };
  ed.addEventListener("click", e => { const a = e.target.closest("a.nlink"); if (a && ed.contains(a)) { e.preventDefault(); follow(a); } });
  ed.addEventListener("keydown", e => { const a = e.target.closest && e.target.closest("a.nlink"); if (a && e.key === "Enter") { e.preventDefault(); follow(a); } });
  function insertText(t) {
    ed.focus({ preventScroll: true });
    const s = getSelection();
    if (last && ed.contains(last.commonAncestorContainer) && !inWidget(last.commonAncestorContainer)) { s.removeAllRanges(); s.addRange(last); }
    else if (!s.rangeCount || !ed.contains(s.getRangeAt(0).commonAncestorContainer)) { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
    document.execCommand("insertText", false, t); remember(); save();
  }
  function addWidget(type, data) {
    if (!window.InquireWidgets) return;
    const w = InquireWidgets.create(type, data), after = document.createElement("div"); after.appendChild(document.createElement("br"));
    // a widget is a block: it goes after the line the caret is on (never inside bold or coloured text)
    let block = last && ed.contains(last.commonAncestorContainer) ? last.endContainer : null;
    while (block && block.parentNode !== ed) block = block.parentNode;
    if (block) block.after(w, after); else ed.append(w, after);
    const s = getSelection(), r = document.createRange(); r.setStart(after, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r); last = r.cloneRange();
    hydrate(ed); save();
    const f = type === "video" || type === "graph" || type === "sheet" ? null : w.querySelector(type === "code" ? ".nw-ta" : type === "map" ? ".nm-q" : ".nw-piano button"); if (f) f.focus({ preventScroll: true });
    w.scrollIntoView({ block: "nearest" });
  }
  // a block (definition, quote) placed after the line that holds `range` (or the caret), never inside it
  function insertBlock(html, range) {
    const t = document.createElement("template"); t.innerHTML = sanitize(html);
    const nodes = [...t.content.childNodes]; if (!nodes.length) return false;
    let block = range && ed.contains(range.endContainer) ? range.endContainer : last && ed.contains(last.endContainer) ? last.endContainer : null;
    while (block && block.parentNode !== ed) block = block.parentNode;
    if (block) block.after(...nodes); else ed.append(...nodes);
    hydrate(ed); save(); flush();
    const el = nodes.find(x => x.nodeType === 1); if (el) el.scrollIntoView({ block: "nearest" });
    return true;
  }
  // "normal" colour / font: each span[attr="_def"] takes that attribute off every span around it, splitting them so the words
  // before and after keep theirs. Returns the nodes that were inside, to reselect them.
  const bare = sp => !sp.hasAttribute("data-c") && !sp.hasAttribute("data-s") && !sp.hasAttribute("data-f") && !sp.hasAttribute("data-h") && !sp.hasAttribute("data-ann");
  function lift(attr) {
    const out = [];
    [...ed.querySelectorAll(`span[${attr}="_def"]`)].forEach(x => {
      let a;
      while ((a = x.parentElement && x.parentElement.closest(`span[${attr}]`)) && ed.contains(a)) {
        const r1 = document.createRange(); r1.setStart(a, 0); r1.setEndBefore(x);
        const r2 = document.createRange(); r2.setStartAfter(x); r2.setEnd(a, a.childNodes.length);
        const before = r1.extractContents(), after = r2.extractContents();
        if (before.textContent) { const c = a.cloneNode(false); c.append(before); a.before(c); }
        if (after.textContent) { const c = a.cloneNode(false); c.append(after); a.after(c); }
        a.removeAttribute(attr); if (attr === "data-c") a.style.color = ""; if (attr === "data-h") { a.style.backgroundColor = ""; a.removeAttribute("data-hl"); } if (a.getAttribute("style") === "") a.removeAttribute("style");
        if (bare(a)) a.replaceWith(...a.childNodes);
      }
      const kids = [...x.childNodes]; x.removeAttribute(attr); if (attr === "data-h") { x.style.backgroundColor = ""; x.removeAttribute("data-hl"); } if (x.getAttribute("style") === "") x.removeAttribute("style");
      if (bare(x)) { x.replaceWith(...kids); out.push(...kids); } else out.push(x);
    });
    return out;
  }
  /* ----- a font, size or colour picked with nothing selected (an empty line, or between words): what is typed next
     gets it. A span holding a zero-width space waits at the caret; picking more styles there adds to the same span, and
     the stand-in space goes once real text is in it (Devon, Oct 2026) ----- */
  const ZW = "​";
  function caretStyle(r, kind, v) {
    const at = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    let sp = at && at.closest("span"); if (sp && (!ed.contains(sp) || sp.textContent.replace(/​/g, "") !== "")) sp = null;
    const attr = kind === "color" ? "data-c" : kind === "hilite" ? "data-h" : kind === "size" ? "data-s" : "data-f";
    if (!sp) {
      sp = document.createElement("span"); sp.appendChild(document.createTextNode(ZW));
      // at the very end of a styled span, the new one goes after it so "normal" really is normal
      let host = at && at.closest(`span[${attr}]`);
      const atEnd = host && ed.contains(host) && (() => { const t = document.createRange(); t.selectNodeContents(host); t.setStart(r.startContainer, r.startOffset); return !t.toString().replace(/​/g, "").length; })();
      if (atEnd) { // keep the other two styles the caret had inside that span
        ["data-c", "data-s", "data-f", "data-h"].filter(a => a !== attr).forEach(a => { const o = at.closest(`span[${a}]`); if (o && (o === host || host.contains(o))) { sp.setAttribute(a, o.getAttribute(a)); if (a === "data-c" && HEX.test(o.getAttribute(a))) sp.style.color = o.getAttribute(a); if (a === "data-h" && HEX.test(o.getAttribute(a))) { sp.style.backgroundColor = o.getAttribute(a); const tn = hlTone(o.getAttribute(a)); if (tn) sp.setAttribute("data-hl", tn); } } });
        host.after(sp);
      } else { const rr = r.cloneRange(); rr.insertNode(sp); }
    }
    const inside = a => { const o = sp.parentElement && sp.parentElement.closest(`span[${a}]`); return !!(o && ed.contains(o)); };
    if (kind === "color") { const hx = hexOf(v); if (hx) { sp.setAttribute("data-c", hx); sp.style.color = hx; } else if (inside("data-c")) { sp.setAttribute("data-c", "_def"); sp.style.color = getComputedStyle(ed).color; } else { sp.removeAttribute("data-c"); sp.style.color = ""; } }
    else if (kind === "hilite") { const hx = hexOf(v); sp.removeAttribute("data-hl"); if (hx) { sp.setAttribute("data-h", hx); sp.style.backgroundColor = hx; const tn = hlTone(hx); if (tn) sp.setAttribute("data-hl", tn); } else if (inside("data-h")) { sp.setAttribute("data-h", "_def"); sp.style.backgroundColor = "transparent"; } else { sp.removeAttribute("data-h"); sp.style.backgroundColor = ""; } }
    else if (kind === "size") { const n = NSIZES.includes(+v) && +v !== 15 ? String(+v) : ""; if (n) sp.setAttribute("data-s", n); else if (inside("data-s")) sp.setAttribute("data-s", "15"); else sp.removeAttribute("data-s"); }
    else { if (FKEYS.has(v)) sp.setAttribute("data-f", v); else if (inside("data-f")) sp.setAttribute("data-f", "_def"); else sp.removeAttribute("data-f"); }
    if (!sp.getAttribute("style")) sp.removeAttribute("style");
    const t = sp.firstChild && sp.firstChild.nodeType === 3 ? sp.firstChild : sp.insertBefore(document.createTextNode(ZW), sp.firstChild);
    const nr = document.createRange(); nr.setStart(t, t.data.length); nr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); last = nr.cloneRange();
  }
  // the stand-in space goes as soon as real text is next to it (the caret stays where it was)
  ed.addEventListener("input", () => {
    const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
    const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); const hit = []; let n;
    while ((n = tw.nextNode())) if (n.data.includes(ZW) && n.data !== ZW) hit.push(n);
    hit.forEach(tn => { let off = r && r.startContainer === tn ? r.startOffset : -1; if (off >= 0) off -= (tn.data.slice(0, off).match(/​/g) || []).length;
      tn.data = tn.data.replace(/​/g, ""); if (off >= 0) { const nr = document.createRange(); nr.setStart(tn, Math.min(off, tn.data.length)); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); } });
  }, true);
  /* ----- paranotes (Devon, Oct 12 2026): your own note under the words it explains. The words are
     span[data-ann] with the note in data-nt (so it is saved, undone and backed up with the note). While shown, a layer over
     the editor draws each note under its line with a right-angled line from the middle of the words, in --note-indent;
     the line under the words grows (a ::after spacer in a <style> of its own, nothing in the note) so the text below makes
     room. Hidden = nothing drawn, nothing styled. Text: [words](https://…) and bare https:// addresses become links. ----- */
  const annKey = "a" + Math.random().toString(36).slice(2, 8); ed.dataset.annEd = annKey;
  const annStyle = document.createElement("style"); document.head.appendChild(annStyle);
  const annLayer = document.createElement("div"); annLayer.className = "nann-layer"; annLayer.setAttribute("aria-hidden", "false");
  const annIn = document.createElement("div"); annIn.className = "nann-in"; annLayer.appendChild(annIn);
  let annOn = !!o.annotations, annT = 0, annH = {};
  const annEsc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function annHTML(t) {
    const parts = []; let rest = String(t || "");
    const re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g; let m, at = 0;
    while ((m = re.exec(rest))) { parts.push(annEsc(rest.slice(at, m.index))); const url = m[2] || m[3], label = m[1] || m[3];
      parts.push(`<a href="${annEsc(url)}" target="_blank" rel="noopener noreferrer" title="${annEsc(url)}">${annEsc(label)}</a>`); at = m.index + m[0].length; }
    parts.push(annEsc(rest.slice(at))); return parts.join("").replace(/\n/g, "<br>");
  }
  const annSpans = () => [...ed.querySelectorAll("span[data-ann]")];
  const annBoxes = () => [...ed.querySelectorAll(".nw")].filter(w => w._ann);
  const annBox = id => annBoxes().find(w => w._ann.has(id));
  function annList() { // in the order they appear: words in the text, and code in code boxes
    return [...ed.querySelectorAll("span[data-ann], .nw")].flatMap(x => x.matches(".nw") ? (x._ann ? x._ann.list() : []) : [{ id: x.dataset.ann, words: x.textContent.replace(/\u200B/g, ""), text: x.dataset.nt || "" }]); }
  function annLayout(again) {
    annT = 0;
    if (!annOn || !ed.isConnected) { annStyle.textContent = ""; annIn.innerHTML = ""; annLayer.hidden = true; ed.classList.remove("nann-on"); return; }
    ed.classList.add("nann-on"); annLayer.hidden = false;
    const host = ed.parentElement; if (annLayer.parentElement !== host) host.appendChild(annLayer);
    annLayer.style.top = ed.offsetTop + "px"; annLayer.style.left = ed.offsetLeft + "px"; annLayer.style.width = ed.clientWidth + "px"; annLayer.style.height = ed.clientHeight + "px";
    const er = ed.getBoundingClientRect(), W = ed.clientWidth, padR = 18, items = [];
    annSpans().forEach(sp => {
      const rs = [...sp.getClientRects()].filter(r => r.width || r.height); if (!rs.length) return;
      const r = rs[rs.length - 1], lh = parseFloat(getComputedStyle(sp).lineHeight) || r.height * 1.6;
      const x = r.left + r.width / 2 - er.left + ed.scrollLeft, lineTop = r.top - er.top + ed.scrollTop - Math.max(0, (lh - r.height) / 2);
      items.push({ sp, id: sp.dataset.ann, x, y: r.bottom - er.top + ed.scrollTop, lineTop, lh, key: Math.round(lineTop / 4) });
    });
    // cards: one per note, stacked when two notes share a line
    const seen = new Set(); annIn.innerHTML = ""; const groups = {};
    items.forEach(it => { (groups[it.key] = groups[it.key] || []).push(it); });
    const css = [];
    Object.values(groups).forEach(g => {
      let top = g[0].lineTop + g[0].lh + 8;
      g.forEach((it, i) => {
        if (seen.has(it.id)) return; seen.add(it.id);
        const left = Math.max(14, Math.min(it.x + 16, W - 240)), width = Math.max(160, Math.min(620, W - left - padR));
        const card = document.createElement("div"); card.className = "nann-card"; card.dataset.ann = it.id;
        card.style.left = left + "px"; card.style.top = top + "px"; card.style.width = width + "px";
        card.innerHTML = (it.sp.dataset.nt ? annHTML(it.sp.dataset.nt) : `<i class="nann-empty">Empty paranote</i>`);
        card.title = "Click to edit this paranote";
        annIn.appendChild(card);
        const ch = card.offsetHeight, my = top + Math.min(ch / 2, 13);
        const v = document.createElement("div"); v.className = "nann-v"; v.style.left = (it.x - .5) + "px"; v.style.top = (it.y + 1) + "px"; v.style.height = Math.max(4, my - it.y - 1) + "px";
        const hz = document.createElement("div"); hz.className = "nann-h"; const x0 = Math.min(it.x, left), x1 = Math.max(it.x, left); hz.style.left = x0 + "px"; hz.style.width = Math.max(2, x1 - x0) + "px"; hz.style.top = (my - .5) + "px";
        const dot = document.createElement("div"); dot.className = "nann-dot"; dot.style.left = it.x + "px"; dot.style.top = (it.y + 1) + "px";
        annIn.append(v, hz, dot);
        top += ch + 6; it.h = ch;
      });
      // the line grows by everything stacked under it: a spacer at the end of the last note's words on that line
      const last = g[g.length - 1], need = Math.round(top - g[0].lineTop + 4);
      css.push(`.nb-rich[data-ann-ed="${annKey}"] span[data-ann="${last.id}"]::after{content:"";display:inline-block;width:0;height:${need}px;vertical-align:top}`);
    });
    const next = css.join("\n"), changed = next !== annStyle.textContent;
    annStyle.textContent = next; annScroll();
    if (changed && !again) requestAnimationFrame(() => annLayout(true)); // the lines moved: place the cards again once
  }
  const annScroll = () => { annIn.style.transform = `translate(${-ed.scrollLeft}px, ${-ed.scrollTop}px)`; };
  const annSoon = () => { if (!annOn) return; clearTimeout(annT); annT = setTimeout(() => annLayout(), 60); };
  ed.addEventListener("scroll", annScroll); ed.addEventListener("input", annSoon);
  const annRO = new ResizeObserver(() => annSoon()); annRO.observe(ed);
  annLayer.addEventListener("mousedown", e => { if (e.target.closest(".nann-card") && !e.target.closest("a")) e.preventDefault(); });
  ed.addEventListener("np:ann-layout", () => annSoon());
  ed.addEventListener("np:ann-edit", e => { if (o.onAnnotation && e.detail) o.onAnnotation(e.detail.id); });
  annLayer.addEventListener("click", e => { const c = e.target.closest(".nann-card"); if (!c || e.target.closest("a")) return; if (o.onAnnotation) o.onAnnotation(c.dataset.ann); });
  // a new paranote on the words selected in the note (one line of words; not inside a widget or a link)
  function addAnnotation(text) {
    const ae = document.activeElement, box = ae && ae.matches && ae.matches(".nw-ta") && ed.contains(ae) ? ae.closest(".nw") : null;
    if (box && box._ann) { const r0 = box._ann.add(text); if (r0.id) { save(); flush(); } return r0; } // code in a code box
    const s = getSelection(); let r = s.rangeCount && ed.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0) : last;
    if (!r || r.collapsed || !ed.contains(r.commonAncestorContainer) || !r.toString().trim()) return { error: "Select the words in the note first." };
    if (inWidget(r.startContainer) || inWidget(r.endContainer)) return { error: "Select the code inside the code box, then press ＋ again." };
    const blk = n => { let el = n.nodeType === 1 ? n : n.parentElement; while (el && el !== ed && !/^(DIV|P|LI|H1|H2|H3|H4|H6|BLOCKQUOTE|PRE)$/.test(el.tagName)) el = el.parentElement; return el; };
    if (blk(r.startContainer) !== blk(r.endContainer)) return { error: "Select words on one line." };
    const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    if (anc.closest("span[data-ann], a.nlink") || r.cloneContents().querySelector("span[data-ann], a.nlink, img")) return { error: "Those words already have a paranote or a link." };
    const sp = document.createElement("span"); sp.dataset.ann = uid(); sp.dataset.nt = String(text || "").slice(0, 4000);
    try { sp.appendChild(r.extractContents()); r.insertNode(sp); } catch (e) { return { error: "Those words could not take a paranote." }; }
    const r2 = document.createRange(); r2.setStartAfter(sp); r2.collapse(true); s.removeAllRanges(); s.addRange(r2); last = r2.cloneRange();
    ed.classList.remove("is-empty"); save(); flush(); annLayout(); return { id: sp.dataset.ann };
  }
  function setAnnotation(id, text) { const sp = ed.querySelector(`span[data-ann="${id}"]`); if (!sp) { const w = annBox(id); if (!w) return false; w._ann.set(id, text); flush(); return true; } sp.dataset.nt = String(text || "").slice(0, 4000); save(); flush(); annLayout(); return true; }
  function removeAnnotation(id) { const sp = ed.querySelector(`span[data-ann="${id}"]`); if (!sp) { const w = annBox(id); if (!w) return false; w._ann.remove(id); flush(); return true; } sp.replaceWith(...sp.childNodes); ed.normalize(); save(); flush(); annLayout(); return true; }
  function showAnnotations(on) { annOn = !!on; annLayout(); annBoxes().forEach(w => w._ann.show(annOn)); }
  function focusAnnotation(id) { const sp = ed.querySelector(`span[data-ann="${id}"]`); if (!sp) { const w = annBox(id); if (w) w._ann.focus(id); return; } sp.scrollIntoView({ block: "nearest" }); sp.classList.add("nann-hi"); setTimeout(() => sp.classList.remove("nann-hi"), 900); }
  // spans (or other inline elements) Chromium gave a background → span[data-h] (or "_def" for the no-highlight stand-in)
  function hiliteSpans() {
    const out = [];
    [...ed.querySelectorAll("[style]")].forEach(el => {
      const bg = el.style.backgroundColor; if (!bg || inWidget(el)) return; const hx = hexOf(bg); if (!hx) return;
      if (el.tagName !== "SPAN") { // a highlight belongs on the words, never on a whole line or a bold/italic tag
        el.style.backgroundColor = ""; if (el.getAttribute("style") === "") el.removeAttribute("style"); if (BLTAGS.has(el.tagName)) return;
        const sp = document.createElement("span"); sp.append(...el.childNodes); el.appendChild(sp); sp.style.backgroundColor = hx; el = sp; }
      const sp = el; if (sp.getAttribute("data-h") === hx) return;
      sp.removeAttribute("data-hl");
      if (hx === CLEARH) { sp.setAttribute("data-h", "_def"); sp.style.backgroundColor = ""; }
      else { sp.setAttribute("data-h", hx); const tn = hlTone(hx); if (tn) sp.setAttribute("data-hl", tn); }
      // a highlight inside an older one replaces it there
      sp.querySelectorAll("span[data-h]").forEach(x => { x.removeAttribute("data-h"); x.removeAttribute("data-hl"); x.style.backgroundColor = ""; if (x.getAttribute("style") === "") x.removeAttribute("style"); if (bare(x)) x.replaceWith(...x.childNodes); });
      out.push(sp);
    });
    return out;
  }
  /* ----- paragraph layout (v0.5.4, Devon): align, indent, line spacing, space after paragraphs. Nothing selected = the whole
     note (every line; new lines follow because Enter copies the line's attributes); words selected = only the lines they are
     on, and for align / indent only those words: a part of one line is split off into a line of its own. ----- */
  const BLOCKSEL = "div:not(.nw),p,h1,h2,h3,h4,h6,blockquote,li";
  function topBlocks() { // every top-level line becomes an element (loose text and inline bits get a div)
    let run = null; const out = [];
    [...ed.childNodes].forEach(n => {
      const blk = n.nodeType === 1 && (BLTAGS.has(n.tagName) || n.classList.contains("nw") || n.tagName === "PRE");
      if (blk) { run = null; if (!n.classList.contains("nw")) out.push(n); return; }
      if (n.nodeType === 3 && !n.data.trim() && !run) return;
      if (!run) { run = document.createElement("div"); n.before(run); out.push(run); }
      run.appendChild(n);
      if (n.nodeType === 1 && n.tagName === "BR") run = null;
    });
    if (!out.length) { const d = document.createElement("div"); d.appendChild(document.createElement("br")); ed.appendChild(d); out.push(d); }
    return out;
  }
  const lineOf = node => { let el = node && (node.nodeType === 1 ? node : node.parentElement); el = el && el.closest(BLOCKSEL); return el && ed.contains(el) && el !== ed && !inWidget(el) ? el : null; };
  function layoutTargets(split) {
    const s = getSelection(); let r = s.rangeCount ? s.getRangeAt(0) : null;
    if (!r || !ed.contains(r.commonAncestorContainer)) r = last && ed.contains(last.commonAncestorContainer) ? last : null;
    if (!r || r.collapsed || !r.toString().replace(/[\s​]/g, "")) return { whole: true, els: topBlocks() };
    if (!lineOf(r.startContainer) || !lineOf(r.endContainer)) { // loose text at the top of the note: make it lines first
      const k = [r.startContainer, r.startOffset, r.endContainer, r.endOffset]; topBlocks();
      try { r = document.createRange(); r.setStart(k[0], k[1]); r.setEnd(k[2], k[3]); } catch (e) {} }
    const a = lineOf(r.startContainer), b = lineOf(r.endContainer);
    if (split && a && a === b && a.tagName !== "LI") { // a part of one line: split it off
      const pre = document.createRange(); pre.setStart(a, 0); pre.setEnd(r.startContainer, r.startOffset);
      const post = document.createRange(); post.setStart(r.endContainer, r.endOffset); post.setEnd(a, a.childNodes.length);
      const has = rg => { const f = rg.cloneContents(); return !!(f.textContent.replace(/[\s​]/g, "") || f.querySelector("img,a,.nw")); };
      const hp = has(pre), hq = has(post);
      const edge = (el, end) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, t = null; while ((n = tw.nextNode())) { if (!end) { t = n; break; } t = n; } if (t) t.data = end ? t.data.replace(/\s+$/, "") : t.data.replace(/^\s+/, ""); };
      if (hq) { const c = a.cloneNode(false); c.appendChild(post.extractContents()); a.after(c); edge(c, false); }
      if (hp) { const c = a.cloneNode(false); c.appendChild(pre.extractContents()); a.before(c); edge(c, true); }
      if (hp || hq) { const nr = document.createRange(); nr.selectNodeContents(a); s.removeAllRanges(); s.addRange(nr); last = nr.cloneRange(); }
      return { whole: false, els: [a] };
    }
    // every line the selection touches (the innermost ones: an item, not its whole list)
    const els = [...ed.querySelectorAll(BLOCKSEL)].filter(el => !inWidget(el) && r.intersectsNode(el) && !el.querySelector(BLOCKSEL));
    [a, b].forEach(x => { if (x && !els.includes(x) && !els.some(e => x.contains(e))) els.push(x); });
    return { whole: false, els: els.length ? els : topBlocks() };
  }
  /* ----- clear formatting (v0.5.4, Devon): nothing selected = the whole note; words selected = only them. Takes off bold,
     italic, underline, strikethrough, colour, highlight, font and size from the words, and titles / headings, align, indent
     and spacing from the lines they are on. Lists, checklists, links, photos, widgets and paranotes stay. ----- */
  const FMT_SEL = "b,strong,i,em,u,s,strike,font,span[data-c],span[data-s],span[data-f],span[data-h]";
  function plainEl(x) { // take the formatting off one element (a paranote span keeps being a paranote)
    if (x.tagName === "SPAN" && x.hasAttribute("data-ann")) { ["data-c", "data-s", "data-f", "data-h", "data-hl", "style"].forEach(a => x.removeAttribute(a)); return; }
    x.replaceWith(...x.childNodes);
  }
  function plainLine(el) { // a title / heading becomes a plain line; align, indent and spacing come off
    ["data-al", "data-in", "data-lh", "data-ps"].forEach(a => el.removeAttribute(a));
    if (/^H[1-6]$/.test(el.tagName)) { const d = document.createElement("div"); [...el.attributes].forEach(a => d.setAttribute(a.name, a.value)); d.append(...el.childNodes); el.replaceWith(d); return d; }
    return el;
  }
  function clearFormat() {
    api.focus();
    const s = getSelection(); let r = s.rangeCount ? s.getRangeAt(0) : null;
    if (!r || !ed.contains(r.commonAncestorContainer)) r = last && ed.contains(last.commonAncestorContainer) ? last : null;
    const whole = !r || r.collapsed || !r.toString().replace(/[\s​]/g, "");
    if (whole) {
      [...ed.querySelectorAll(FMT_SEL)].reverse().forEach(x => { if (!inWidget(x)) plainEl(x); });
      [...ed.querySelectorAll("[data-al],[data-in],[data-lh],[data-ps],h1,h2,h3,h4,h6")].forEach(x => { if (!inWidget(x) && x.isConnected) plainLine(x); });
      ed.normalize(); save(); flush(); annLayout(); return true;
    }
    // only the selected words: split the text at the ends, then split each formatting element around them
    let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = r;
    if (ec.nodeType === 3 && eo < ec.data.length) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0) { const t = sc.splitText(so); if (ec === sc) { ec = t; eo = t.data.length; } sc = t; so = 0; }
    const rr = document.createRange(); rr.setStart(sc, so); rr.setEnd(ec, eo);
    const first = sc.nodeType === 3 ? sc : (sc.childNodes[so] || sc), lastN = ec.nodeType === 3 ? ec : (ec.childNodes[eo - 1] || ec);
    const lines = new Set(); [...ed.querySelectorAll(BLOCKSEL + ",h1,h2,h3,h4,h6")].forEach(el => { if (!inWidget(el) && rr.intersectsNode(el) && !el.querySelector(BLOCKSEL)) lines.add(el); });
    [lineOf(first), lineOf(lastN)].forEach(x => { if (x) lines.add(x); });
    const hit = [...ed.querySelectorAll(FMT_SEL)].filter(x => !inWidget(x) && rr.intersectsNode(x)).reverse();
    hit.forEach(x => {
      if (!x.isConnected) return;
      if (x.contains(first)) { const r1 = document.createRange(); r1.setStart(x, 0); r1.setEndBefore(first); const f = r1.extractContents(); if (f.textContent || (f.querySelector && f.querySelector("img,a"))) { const c = x.cloneNode(false); c.append(f); x.before(c); } }
      if (x.contains(lastN)) { const r2 = document.createRange(); r2.setStartAfter(lastN); r2.setEnd(x, x.childNodes.length); const f = r2.extractContents(); if (f.textContent || (f.querySelector && f.querySelector("img,a"))) { const c = x.cloneNode(false); c.append(f); x.after(c); } }
      plainEl(x);
    });
    lines.forEach(el => { if (el.isConnected) plainLine(el); });
    try { const nr = document.createRange(); nr.setStartBefore(first); nr.setEndAfter(lastN); s.removeAllRanges(); s.addRange(nr); last = nr.cloneRange(); } catch (e) {}
    save(); flush(); annLayout(); return false;
  }
  // what the line the caret is on has: { al, in, lh, ps }
  function layoutAt() {
    const s = getSelection(), r = s.rangeCount && ed.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0) : last;
    const el = (r && lineOf(r.startContainer)) || ed.firstElementChild;
    const get = a => { let x = el; while (x && x !== ed) { if (x.hasAttribute(a)) return x.getAttribute(a); x = x.parentElement; } return ""; };
    return { al: get("data-al"), in: get("data-in"), lh: get("data-lh"), ps: get("data-ps"), whole: !r || r.collapsed || !r.toString().trim() };
  }
  // prop "al" (left | center | right | "" none), "in" ("+" | "-" | "0"), "lh" (1 … 3 | "" normal), "ps" (0 | 6 | 12 | 24 | "" normal)
  function blockStyle(prop, v) {
    api.focus();
    const t = layoutTargets(prop === "al" || prop === "in"), a = "data-" + prop;
    let base = 0; if (t.whole && prop === "in") base = +(((t.els[0] || {}).getAttribute && t.els[0].getAttribute(a)) || 0);
    if (t.whole) ed.querySelectorAll(`[${a}]`).forEach(x => x.removeAttribute(a)); // the whole note: one setting for every line
    t.els.forEach(el => {
      if (prop === "in") { const cur = t.whole ? base : +(el.getAttribute(a) || 0), n = v === "+" ? Math.min(8, cur + 1) : v === "-" ? Math.max(0, cur - 1) : 0; if (n) el.setAttribute(a, String(n)); else el.removeAttribute(a); return; }
      if (v !== "" && v != null && BLAYOUT[a].has(String(v))) el.setAttribute(a, String(v)); else el.removeAttribute(a);
      el.querySelectorAll(`[${a}]`).forEach(x => x.removeAttribute(a)); // lines inside take the new setting
    });
    save(); flush(); annLayout();
    return t.whole;
  }
  // Chromium edits inline colours itself (it may clear or copy style="color"): keep data-c in step with what is shown
  function syncColors() {
    ed.querySelectorAll("span").forEach(sp => {
      const k = sp.getAttribute("data-c"), c = hexOf(sp.style.color);
      const hk = sp.getAttribute("data-h"), hb = sp.style.backgroundColor ? hexOf(sp.style.backgroundColor) : "";
      if (hk && HEX.test(hk) && !hb) { sp.removeAttribute("data-h"); sp.removeAttribute("data-hl"); } else if (hb && hb !== CLEARH && (!hk || HEX.test(hk)) && hk !== hb) { sp.setAttribute("data-h", hb); const tn = hlTone(hb); if (tn) sp.setAttribute("data-hl", tn); else sp.removeAttribute("data-hl"); }
      if (k && HEX.test(k) && !c) { sp.removeAttribute("data-c"); sp.style.color = ""; if (sp.getAttribute("style") === "") sp.removeAttribute("style"); if (bare(sp)) { sp.replaceWith(...sp.childNodes); return; } }
      else if (c && (!k || HEX.test(k)) && k !== c) sp.setAttribute("data-c", c);
      else if (!c && sp.getAttribute("style") === "") sp.removeAttribute("style");
    });
  }
  const api = { el: ed, id, flush, insertFolderLink, openFolder: fid => { if (!o.openFolder) return false; flush(); o.openFolder(fid); return true; }, indentItem, outdentItem, annotations: annList, addAnnotation, setAnnotation, removeAnnotation, showAnnotations, focusAnnotation, relayoutAnnotations: () => annLayout(),
    openSide: noteId => { if (!o.openSide || !get(noteId)) return false; flush(); o.openSide(noteId); return true; },
    peek: noteId => { if (!o.peek) return false; flush(); o.peek(noteId); return true; },
    openNote: noteId => { if (!o.openNote || !get(noteId)) return false; flush(); o.openNote(noteId); return true; },
    addFiles, addURL, addVideoLink, linkRange, insertNoteLink, insertWidgetAt, insertText, addWidget, insertBlock,
    focus: () => { ed.focus({ preventScroll: true }); const s = getSelection(); if (last && (!s.rangeCount || !ed.contains(s.getRangeAt(0).commonAncestorContainer))) { s.removeAllRanges(); s.addRange(last); } },
    changed: () => save(),
    // kind "color" (a #hex, or "" for the normal colour), "size" (a number, or "" for normal), "font" (a key, or "" for the note's font)
    blockStyle, layoutAt, clearFormat,
    format: (kind, v) => {
      api.focus(); document.execCommand("styleWithCSS", false, false);
      { const s0 = getSelection(), r0 = s0.rangeCount ? s0.getRangeAt(0) : null; // nothing selected: what is typed next gets it
        if (r0 && r0.collapsed && ed.contains(r0.startContainer) && !inWidget(r0.startContainer)) { caretStyle(r0, kind, v); save(); return; } }
      let made = [];
      const conv = over => { made = [...ed.querySelectorAll("font")].reverse().map(f => fontToSpan(f, over)).filter(Boolean).reverse(); };
      if (kind === "color") { document.execCommand("foreColor", false, hexOf(v) || CLEARC); conv({ def: !hexOf(v) }); if (!hexOf(v)) made = lift("data-c"); }
      else if (kind === "hilite") { // Chromium writes a highlight as span style="background-color"; mark those spans data-h (v0.5.4)
        document.execCommand("hiliteColor", false, hexOf(v) || CLEARH); made = hiliteSpans(); if (!hexOf(v)) made = lift("data-h"); }
      else if (kind === "font") { document.execCommand("fontName", false, "npf-" + (FKEYS.has(v) ? v : "_def")); conv({ def: !FKEYS.has(v) }); if (!FKEYS.has(v)) made = lift("data-f"); }
      else if (kind === "size") { const n = NSIZES.includes(+v) ? String(+v) : "n"; document.execCommand("fontSize", false, "7"); conv({ s: n }); }
      api.normalizeColors();
      // keep the same words selected so the next click (another size, a colour) still applies to them
      const s2 = getSelection(), live = made.filter(x => x.isConnected);
      if (live.length) try { const nr = document.createRange(); nr.setStartBefore(live[0]); nr.setEndAfter(live[live.length - 1]); s2.removeAllRanges(); s2.addRange(nr); last = nr.cloneRange(); } catch (e) {}
      save();
    },
    normalizeColors: () => { // font → span, keeping the selection on the same text so the next size/colour click still applies
      const sel = getSelection(), r = sel.rangeCount ? sel.getRangeAt(0) : null, at = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
      syncColors();
      const made = [...ed.querySelectorAll("font")].reverse().map(f => fontToSpan(f)).filter(Boolean).reverse();
      // tidy: a size wrapped straight around another size does nothing; "normal" outside any size is not needed
      const unsize = sp => { sp.removeAttribute("data-s"); if (!sp.hasAttribute("data-c")) { const i = made.indexOf(sp); const kids = [...sp.childNodes]; sp.replaceWith(...kids); if (i >= 0) made.splice(i, 1, ...kids.filter(k => k.nodeType === 1)); } };
      [...ed.querySelectorAll("span[data-s]")].forEach(sp => { if (sp.isConnected && sp.childNodes.length === 1 && sp.firstChild.nodeType === 1 && sp.firstChild.matches("span[data-s]")) unsize(sp); });
      [...ed.querySelectorAll('span[data-s="n"], span[data-s="15"]')].forEach(sp => { if (!sp.parentElement.closest("span[data-s]")) unsize(sp); });
      try {
        const nr = document.createRange();
        if (at && at[0].nodeType === 3 && at[2].nodeType === 3 && ed.contains(at[0]) && ed.contains(at[2])) { nr.setStart(at[0], at[1]); nr.setEnd(at[2], at[3]); }
        else if (made.length) { nr.setStartBefore(made[0].firstChild || made[0]); nr.setEndAfter(made[made.length - 1].lastChild || made[made.length - 1]); }
        else return;
        sel.removeAllRanges(); sel.addRange(nr);
      } catch (e) {}
    },
    destroy: () => { flush(); annRO.disconnect(); annStyle.remove(); annLayer.remove(); clearTimeout(annT); live.delete(api); document.removeEventListener("selectionchange", remember); document.removeEventListener("selectionchange", ckSoon); document.removeEventListener("scroll", ckScroll, true); ckHide(); if (bar && bar.destroy) bar.destroy(); } };
  if (window.InquireWidgets) { bar = InquireWidgets.toolbar(api); host.appendChild(bar); }
  host.appendChild(ed);
  editors.set(ed, api); live.add(api);
  if (annOn) requestAnimationFrame(() => annLayout());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => annSoon());
  return api;
}
const editorFor = el => { const ed = el && el.closest ? el.closest(".nb-rich") : null; return ed ? editors.get(ed) || null : null; };

// the same store seen from one tab of My notes: list / folders / new folders / new notes stay in that space
function scope(sp) {
  sp = sp === "code" ? "code" : "notes";
  return Object.assign({}, window.InquireNotes, { space: sp, list: q => list(q, sp), folders: () => folders(sp), addFolder: (name, parent) => addFolder(name, parent, sp),
    create: o => create(Object.assign({}, o, { space: sp })) });
}
// My Tasks (tasks.js) keeps its pictures and files in the same store
async function putFile(blob) { if (blob.size > VIDEO_MAX) throw new Error("too big"); const id = uid(); await tx("readwrite", st => st.put({ blob, at: Date.now() }, id)); return id; }
async function mediaBlob(id) { const rec = await tx("readonly", st => st.get(id)).catch(() => null); return rec && rec.blob ? rec.blob : null; } // (import / export: no fetch of blob: URLs, which the CSP refuses)
window.InquireNotes = { scope, spaceOf, putImage, putFile, delMedia: delImages, mediaBlob, list, get, create, update, remove, trash, restore, purge, deleteWithUndo, toast, appendBlock, exportMedia, key, link, unlink, appendQuote,
  undo, redo, history, NSIZES, NFONTS, folders, addFolder, renameFolder, setFolderFav, removeFolder, moveFolder, subtree, setOrder, byOrder, sanitize, toText, mountEditor, editorFor, hydrate, pick, pickNote, imageURL, thumbURL, exportImages, importImages,
  readFolders: readF, writeFolders: writeF,
  // v0.5.6: the store is in IndexedDB and in memory; the page waits for `ready` before it draws
  ready, isReady: () => MEM.ready, saveState: () => ({ state: MEM.state, error: MEM.error }), flushSaves: () => flush(), readAll: () => read(), writeAll: all => write(all) };
})();
