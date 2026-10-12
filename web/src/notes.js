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
   Notes live in localStorage "notepath.notes.<username>" (lower-case), or "notepath.notes._local" with nobody signed in.
   Each note: { id, title, html (sanitised rich text), body (plain text made from html: search, previews, .md),
     created, updated, fav, folder (folder id | null), links: ["s:<subject>", "f:<field>", "t:<topic>"], src: { topic, title } | null }.
   Older notes (body only) get html on read. Folders: "notepath.notefolders.<username>" = [{ id, name, parent, order, fav? }] (nested; drag to move/reorder). Notes may carry `order` (My order).
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
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "DIV", "P", "UL", "OL", "LI", "H3", "BLOCKQUOTE", "A", "IMG", "SPAN"]);
const TCOL = { "#f2b84b": "amber", "#5cc8e0": "cyan", "#f07ca0": "pink", "#b49bff": "violet", "#7bd88f": "green", "#d97ae6": "magenta", "#b5d65a": "lime", "#e5675b": "red", "#8b97ae": "muted" };
const TKEYS = new Set(Object.values(TCOL)), HEX = /^#[0-9a-f]{6}$/;
// any colour from the spectrum picker is kept as span[data-c="#rrggbb"] with a matching inline colour (the sanitiser writes the style itself)
const hexOf = v => { v = String(v || "").trim().toLowerCase(); if (/^#[0-9a-f]{3}$/.test(v)) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (m) v = "#" + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join(""); return HEX.test(v) ? v : ""; };
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
const WIDGETS = new Set(["code", "music", "video", "graph", "sheet"]);
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
      const n = c.getAttribute("data-note"), t = c.getAttribute("data-topic");
      if (n && /^[a-z0-9]+$/i.test(n)) keep["data-note"] = n; else if (t && /^[a-z0-9-]+$/i.test(t)) keep["data-topic"] = t;
      else { c.replaceWith(...c.childNodes); return; }
      keep.class = "nlink"; keep.contenteditable = "false";
    }
    if (tag === "IMG") {
      const id = c.getAttribute("data-img"), src = c.getAttribute("src") || "";
      if (id && /^[a-z0-9]+$/i.test(id)) keep["data-img"] = id; else if (/^https:\/\/[^\s"'<>]+$/i.test(src)) keep.src = src; else { c.remove(); return; }
      keep.alt = (c.getAttribute("alt") || "").slice(0, 200); keep.class = "nimg";
    }
    if (tag === "UL" && c.getAttribute("data-ck") === "1") keep["data-ck"] = "1"; // checklist (NotePath)
    if (tag === "LI" && c.getAttribute("data-done") === "1") keep["data-done"] = "1";
    if (tag === "SPAN") { const k = c.getAttribute("data-c"), z = c.getAttribute("data-s"), f = c.getAttribute("data-f");
      if (TKEYS.has(k)) keep["data-c"] = k; else if (HEX.test(k || "")) { keep["data-c"] = k; keep.style = "color:" + k; }
      if (SKEYS.has(z)) keep["data-s"] = z; if (FKEYS.has(f)) keep["data-f"] = f;
      if (!keep["data-c"] && !keep["data-s"] && !keep["data-f"]) { c.replaceWith(...c.childNodes); return; } }
    [...c.attributes].forEach(a => c.removeAttribute(a.name));
    Object.entries(keep).forEach(([k, v]) => c.setAttribute(k, v));
  });
}
function sanitize(html) { const t = document.createElement("template"); t.innerHTML = String(html || ""); clean(t.content); return t.innerHTML; }
const BLOCK = new Set(["DIV", "P", "LI", "H3", "BLOCKQUOTE", "UL", "OL"]);
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
const read = () => { try { const v = JSON.parse(localStorage.getItem(key()) || "[]"); return Array.isArray(v) ? v.map(normalize) : []; } catch (e) { return []; } };
const write = all => { try { localStorage.setItem(key(), JSON.stringify(all)); } catch (e) { console.warn("Notes could not be saved", e); } touched(); changed(); };

/* ---------- undo / redo (My notes ↶ ↷, ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y) ----------
   Every change to the notes or folders is one step: writing (each pause in typing), new / renamed / moved / starred /
   deleted folders, new or deleted notes, widgets, order. A burst of writes within 700 ms counts as one step. Steps are
   whole snapshots of the two stores, kept for this session (up to 100). Photos and videos stay in IndexedDB until the
   app closes, so undoing a delete brings them back too. */
const H = { undo: [], redo: [], base: null, open: false, t: 0, lock: false };
const snap = () => ({ n: localStorage.getItem(key()) || "[]", f: localStorage.getItem(fkey()) || "[]" });
const hfire = () => window.dispatchEvent(new CustomEvent("inquire:notes-history", { detail: { undo: H.undo.length, redo: H.redo.length } }));
function touched() {
  if (H.lock) return;
  if (!H.base) H.base = { n: "[]", f: "[]" };
  if (!H.open) { H.open = true; H.undo.push(H.base); if (H.undo.length > 100) H.undo.shift(); H.redo = []; }
  clearTimeout(H.t); H.t = setTimeout(settle, 700); hfire();
}
function settle() { clearTimeout(H.t); if (H.open) { H.open = false; H.base = snap(); } }
const live = new Set(); // mounted editors: their unsaved typing is saved before an undo
function histStep(from, to) {
  live.forEach(a => a.flush()); settle();
  if (!from.length) return false;
  const prev = from.pop(); to.push(snap());
  H.lock = true; try { localStorage.setItem(key(), prev.n); localStorage.setItem(fkey(), prev.f); } catch (e) {} H.lock = false;
  H.base = prev; changed(); hfire(); return true;
}
const undo = () => histStep(H.undo, H.redo), redo = () => histStep(H.redo, H.undo);
const history = () => ({ undo: H.undo.length, redo: H.redo.length });
function list(q, sp) {
  sp = sp || "notes";
  const all = read().filter(n => spaceOf(n) === sp).sort(byUpdated);
  if (!q) return all;
  const s = q.toLowerCase();
  return all.filter(n => (n.title + "\n" + n.body + "\n" + (n.src ? n.src.title : "")).toLowerCase().includes(s));
}
const get = id => read().find(n => n.id === id) || null;
function create(o = {}) {
  const now = Date.now(), html = o.html != null ? sanitize(o.html) : textToHtml(o.body || "");
  const n = { id: uid(), title: o.title || "Untitled note", html, body: toText(html), created: now, updated: now, src: o.src || null,
    fav: !!o.fav, folder: o.folder || null, links: Array.isArray(o.links) ? o.links.slice() : o.src && o.src.topic ? ["t:" + o.src.topic] : [] };
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
  Object.assign(n, patch); if (!quiet) n.updated = Date.now(); write(all); return n;
}
function remove(id) {
  const all = read(), n = all.find(x => x.id === id); if (!n) return;
  const rest = all.filter(x => x.id !== id), still = new Set(rest.flatMap(x => mediaIds(x.html)));
  delImages(mediaIds(n.html).filter(i => !still.has(i)));
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
  const still = new Set(read().flatMap(x => mediaIds(x.html)));
  delImages(mediaIds(n.html).filter(i => !still.has(i)));
}
window.addEventListener("pagehide", () => [...trashed.keys()].forEach(purge));
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
const readF = () => { try { const v = JSON.parse(localStorage.getItem(fkey()) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const writeF = f => { try { localStorage.setItem(fkey(), JSON.stringify(f)); } catch (e) {} touched(); changed(); };
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
  const f = { id: uid(), name: String(name || "").trim().slice(0, 60) || "New folder", parent: pid, order }; if (sp === "code") f.space = "code"; writeF(all.concat(f)); return f;
}
function setFolderFav(id, on) { const all = readF(), f = all.find(x => x.id === id); if (!f) return; if (on) f.fav = true; else delete f.fav; writeF(all); }
function renameFolder(id, name) { const all = readF(), f = all.find(x => x.id === id); if (!f) return; f.name = String(name || "").trim().slice(0, 60) || f.name; writeF(all); }
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

/* ---------- photos (IndexedDB) ---------- */
let dbP = null;
const db = () => dbP || (dbP = new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error("no IndexedDB"));
  const r = indexedDB.open("notepath-notes", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("images");
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
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
// backups: the photos a set of notes uses, as data URLs, and back
const fromDataURL = u => { const m = String(u).match(/^data:([^;,]+)(;base64)?,(.*)$/); if (!m) throw new Error("bad data URL"); const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m[1] }); };
const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
// backups: like exportImages, plus the videos left out for size → { map, skipped: [{ note, title, mb }] }
async function exportMedia(notes) {
  const map = {}, skipped = [];
  for (const n of (notes || read())) for (const id of mediaIds(n.html)) {
    if (map[id]) continue;
    const rec = await tx("readonly", st => st.get(id)).catch(() => null); if (!rec || !rec.blob) continue;
    if (rec.blob.size > VIDEO_BACKUP_MAX) { skipped.push({ note: n.title, mb: Math.round(rec.blob.size / 1048576) }); continue; }
    map[id] = await toDataURL(rec.blob);
  }
  return { map, skipped };
}
async function exportImages(notes) {
  const out = {}, ids = [...new Set((notes || read()).flatMap(n => mediaIds(n.html)))];
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
function delImages(ids) { if (ids.length) tx("readwrite", st => { ids.forEach(i => { st.delete(i); if (urls[i]) { URL.revokeObjectURL(urls[i]); delete urls[i]; } }); return null; }).catch(() => {}); }
function hydrate(root) {
  if (window.InquireWidgets) root.querySelectorAll("div.nw").forEach(w => InquireWidgets.mount(w));
  root.querySelectorAll("img[data-img]").forEach(im => { if (im.src) return; imageURL(im.dataset.img).then(u => { if (u) im.src = u; else { im.alt = "Photo missing"; im.classList.add("missing"); } }); });
  root.querySelectorAll("a.nlink").forEach(a => {
    a.contentEditable = "false"; a.tabIndex = 0; a.setAttribute("role", "link");
    const n = a.dataset.note && get(a.dataset.note);
    a.title = a.dataset.note ? (n ? "Open note: " + n.title : "Linked note was deleted") : "Open lesson";
    a.classList.toggle("gone", !!a.dataset.note && !n);
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
  const empty = () => ed.classList.toggle("is-empty", !ed.textContent.trim() && !ed.querySelector("img"));
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
  // a note dragged in from My notes: a link to it (its title) at the drop point, or at the end
  function insertNoteLink(range, noteId) {
    const t = get(noteId); if (!t) return false;
    if (!range || !ed.contains(range.startContainer) || inWidget(range.startContainer)) { range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); }
    else { range = range.cloneRange(); range.collapse(true); const inA = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest("a.nlink"); if (inA && ed.contains(inA)) range.setStartAfter(inA); }
    const a = document.createElement("a"); a.className = "nlink"; a.dataset.note = noteId; a.textContent = t.title || "Untitled note";
    const sp = document.createTextNode(" ");
    range.insertNode(sp); range.insertNode(a);
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
  const follow = a => { if (a.dataset.note) { if (get(a.dataset.note) && o.openNote) { flush(); o.openNote(a.dataset.note); } } else if (a.dataset.topic && o.openTopic) { flush(); o.openTopic(a.dataset.topic); } };
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
    const f = type === "video" || type === "graph" || type === "sheet" ? null : w.querySelector(type === "code" ? ".nw-ta" : ".nw-piano button"); if (f) f.focus({ preventScroll: true });
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
  const bare = sp => !sp.hasAttribute("data-c") && !sp.hasAttribute("data-s") && !sp.hasAttribute("data-f");
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
        a.removeAttribute(attr); if (attr === "data-c") a.style.color = "";
        if (bare(a)) a.replaceWith(...a.childNodes);
      }
      const kids = [...x.childNodes]; x.removeAttribute(attr);
      if (bare(x)) { x.replaceWith(...kids); out.push(...kids); } else out.push(x);
    });
    return out;
  }
  // Chromium edits inline colours itself (it may clear or copy style="color"): keep data-c in step with what is shown
  function syncColors() {
    ed.querySelectorAll("span").forEach(sp => {
      const k = sp.getAttribute("data-c"), c = hexOf(sp.style.color);
      if (k && HEX.test(k) && !c) { sp.removeAttribute("data-c"); sp.removeAttribute("style"); if (bare(sp)) sp.replaceWith(...sp.childNodes); }
      else if (c && (!k || HEX.test(k)) && k !== c) sp.setAttribute("data-c", c);
      else if (!c && sp.getAttribute("style") === "") sp.removeAttribute("style");
    });
  }
  const api = { el: ed, id, flush, addFiles, addURL, addVideoLink, linkRange, insertNoteLink, insertWidgetAt, insertText, addWidget, insertBlock,
    focus: () => { ed.focus({ preventScroll: true }); const s = getSelection(); if (last && (!s.rangeCount || !ed.contains(s.getRangeAt(0).commonAncestorContainer))) { s.removeAllRanges(); s.addRange(last); } },
    changed: () => save(),
    // kind "color" (a #hex, or "" for the normal colour), "size" (a number, or "" for normal), "font" (a key, or "" for the note's font)
    format: (kind, v) => {
      api.focus(); document.execCommand("styleWithCSS", false, false);
      let made = [];
      const conv = over => { made = [...ed.querySelectorAll("font")].reverse().map(f => fontToSpan(f, over)).filter(Boolean).reverse(); };
      if (kind === "color") { document.execCommand("foreColor", false, hexOf(v) || CLEARC); conv({ def: !hexOf(v) }); if (!hexOf(v)) made = lift("data-c"); }
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
    destroy: () => { flush(); live.delete(api); document.removeEventListener("selectionchange", remember); document.removeEventListener("selectionchange", ckSoon); document.removeEventListener("scroll", ckScroll, true); ckHide(); if (bar && bar.destroy) bar.destroy(); } };
  if (window.InquireWidgets) { bar = InquireWidgets.toolbar(api); host.appendChild(bar); }
  host.appendChild(ed);
  editors.set(ed, api); live.add(api);
  return api;
}
const editorFor = el => { const ed = el && el.closest ? el.closest(".nb-rich") : null; return ed ? editors.get(ed) || null : null; };

H.base = snap(); // the state the first undo step goes back to
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
  undo, redo, history, NSIZES, NFONTS, folders, addFolder, renameFolder, setFolderFav, removeFolder, moveFolder, subtree, setOrder, byOrder, sanitize, toText, mountEditor, editorFor, hydrate, pick, pickNote, imageURL, exportImages, importImages,
  readFolders: readF, writeFolders: writeF };
})();
