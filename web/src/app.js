/* NotePath app shell: the start menu, the My notes page and the desktop chrome (update banner, version line).
   The notes window (renderNotes) and its helpers are Inquire's (web/src/app.js in codex-desktop), minus the links to
   subjects, fields and lessons, which NotePath does not have. Notes engine: notes.js; toolbar + widgets: notes-widgets.js;
   right-click menu: textmenu.js; Settings: settings.js. */
(function(){
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const h = (tag, attrs={}, html) => { const e = document.createElement(tag); for (const k in attrs) { if (k === "class") e.className = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const when = ms => { const d = new Date(ms), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }); };

/* ---------- persistence (per-computer conveniences) ---------- */
const store = {
  get(k, d){ try { const v = localStorage.getItem("notepath." + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem("notepath." + k, JSON.stringify(v)); } catch(e){} }
};

/* ---------- app state + routing ----------
   Screens (pages): "menu" (the start menu) and "notes" (My notes). Routes: #menu, #notes, #favourites. */
const S = { view: "menu" };
const viewEl = $("#view");
let cleanup = [];
function clearView(){ cleanup.forEach(f => { try{ f(); }catch(e){} }); cleanup = []; viewEl.innerHTML = ""; }

let NAV_GO = false;
function go(next, push = true){
  NAV_GO = true; try { closeWins(); } finally { NAV_GO = false; } closeShare();
  // My notes / My Tasks already on screen: just show the folder / note / task asked for
  if (next.view === "notes" && S.view === "notes" && NPAGE) { NPAGE.show(next); navMark(); return; }
  if (next.view === "tasks" && S.view === "tasks" && TPAGE) { TPAGE.show(next); navMark(); return; }
  S.view = next.view === "notes" || next.view === "tasks" ? next.view : "menu"; S.opts = next;
  render();
  viewIn(viewEl);
  const hs = S.view === "notes" && SPACE === "code" ? "code" : S.view, st = S.view === "notes" ? { view: "notes", space: SPACE } : { view: S.view };
  if (push) { try { history.pushState(st, "", "#" + hs); } catch(e){} }
  else { try { history.replaceState(st, "", "#" + hs); } catch(e){} }
  navMark();
  window.dispatchEvent(new CustomEvent("inquire:route"));
}
/* ---------- ‹ Back (v0.5.4, Devon): back to the window that was open before this one, not always the Main Menu ----------
   NAV is the trail of screens ("menu", "notes", "code", "tasks", "office"); its last entry is the one on screen. A window
   that comes back keeps the folder and note it had (SPACES / the tasks page keep them). Empty trail → the Main Menu. */
const NAV = [];
const NAV_NAME = { menu: "the Main Menu", notes: "My notes", code: "My Code", tasks: "My Tasks", office: "Note Office" };
const curKey = () => S.view === "notes" ? (SPACE === "code" ? "code" : "notes") : S.view === "tasks" ? "tasks" : "menu";
function navMark(k = curKey()){
  if (NAV[NAV.length - 1] !== k) NAV.push(k);
  if (NAV.length > 60) NAV.splice(0, NAV.length - 60);
  paintBack();
}
const backTarget = () => NAV.length > 1 ? NAV[NAV.length - 2] : "menu";
function paintBack(){
  const t = "Back to " + NAV_NAME[backTarget()];
  document.querySelectorAll(".np-back").forEach(b => { b.title = t; b.setAttribute("aria-label", t); });
}
function goBack(){
  if (NAV.length) NAV.pop(); // the window on screen now
  const k = NAV.length ? NAV.pop() : "menu";
  if (k === "office") { if (S.view !== "menu") go({ view: "menu" }); if (window.NoteOffice) NoteOffice.open(); return; }
  if (k === "notes" || k === "code") return go({ view: "notes", space: k });
  if (k === "tasks") return go({ view: "tasks" });
  go({ view: "menu" });
}
function viewIn(el){
  if (!el) return;
  el.classList.remove("vt-in"); void el.offsetWidth; el.classList.add("vt-in");
  el.addEventListener("animationend", () => el.classList.remove("vt-in"), { once: true });
}
window.addEventListener("popstate", e => { if (e.state) go(e.state, false); });
window.addEventListener("hashchange", () => { const s = fromHash(); if (s) go(s, false); });
function fromHash(){
  const t = (location.hash || "").slice(1);
  if (t === "notes") return { view: "notes", space: "notes" };
  if (t === "code") return { view: "notes", space: "code" };
  if (t === "tasks") return { view: "tasks" };
  if (t === "favourites") return { view: "notes", space: "notes", folder: "fav" };
  return t === "menu" ? { view: "menu" } : null;
}

function render(){
  clearView(); crumbs();
  if (S.view === "notes") renderNotesPage(S.opts || {}); else if (S.view === "tasks") renderTasksPage(S.opts || {}); else renderMenu();
  viewEl.focus({ preventScroll: true });
}
function crumbs(){
  const c = $("#crumbs"); c.innerHTML = "";
  if (S.view === "notes") {
    c.appendChild(h("button", { type: "button", class: "crumb", onclick: () => go({ view: "menu" }) }, "Main Menu"));
    c.appendChild(h("span", { class: "sep" }, "›"));
    if (SPACE === "code") c.appendChild(h("span", { class: "here" }, "My Code"));
    else c.appendChild(h("span", { class: "here" }, "My notes"));
  } else if (S.view === "tasks") {
    c.appendChild(h("button", { type: "button", class: "crumb", onclick: () => go({ view: "menu" }) }, "Main Menu"));
    c.appendChild(h("span", { class: "sep" }, "›")); c.appendChild(h("span", { class: "here" }, "My Tasks"));
  } else c.appendChild(h("span", { class: "here" }, "Main Menu"));
}

/* ---------- windows over the app (My notes) ----------
   Like Settings and the New note dialog: the app behind fogs and eases back (body.mw-open, settings.css), ✕, Esc
   (settings.js) or a click on the fog closes. The route #notes opens My notes over the start menu.
   modalWin(id, { title, sub, cls }) → { ov, win, body, head, cleanup: [], close() }; one window at a time. */
const MW = {};
function closeWins(except){ Object.keys(MW).forEach(k => { if (k !== except) MW[k].close(); }); }
function modalWin(id, o = {}){
  if (MW[id]) return MW[id];
  closeWins(id);
  const last = document.activeElement;
  const ov = h("div", { class: "mw-ov", "data-mw": id });
  ov.innerHTML = `<div class="mw-win win ${o.cls || ""}" role="dialog" aria-modal="true" aria-labelledby="mw-t-${id}">
    <header class="set-h mw-h">${o.back ? `<button type="button" class="np-back" data-a="back" title="Back to the Main Menu" aria-label="Back to the Main Menu"><span aria-hidden="true">‹</span> Back</button>` : ""}<span class="dot"></span><h2 id="mw-t-${id}">${esc(o.title || "")}</h2>${o.sub ? `<span class="mw-sub">${o.sub}</span>` : ""}<span class="mw-hx"></span>${o.back ? "" : `<button type="button" class="set-x" aria-label="Close ${esc(o.title || "window")}">✕</button>`}</header>
    <div class="mw-body"></div></div>`;
  document.body.appendChild(ov);
  const m = { id, ov, win: $(".mw-win", ov), body: $(".mw-body", ov), head: $(".mw-hx", ov), cleanup: [], closed: false,
    close(){
      if (m.closed) return; m.closed = true; delete MW[id];
      m.cleanup.forEach(f => { try { f(); } catch(e){} }); m.cleanup = [];
      if (!Object.keys(MW).length) document.body.classList.remove("mw-open");
      ov.classList.add("out"); setTimeout(() => ov.remove(), 260);
      if (last && document.contains(last)) try { last.focus({ preventScroll: true }); } catch(e){}
      crumbs();
      window.dispatchEvent(new CustomEvent("inquire:window", { detail: { id, open: false } }));
    } };
  MW[id] = m;
  if (o.back) { // a window with ‹ Back (Note Office; it has no ✕) is a screen on the ‹ Back trail; closing it shows the page under it
    navMark(id); m.cleanup.push(() => { if (!NAV_GO && NAV[NAV.length - 1] === id) { NAV.pop(); paintBack(); } });
    $(".np-back", ov).onclick = () => m.close(); // Note Office opens over the Main Menu, so closing it is going back
  }
  if (!o.back) $(".set-x", ov).onclick = () => m.close();
  ov.addEventListener("pointerdown", e => { if (e.target === ov) m.close(); });
  requestAnimationFrame(() => { if (!m.closed) document.body.classList.add("mw-open"); });
  setTimeout(() => { if (!m.closed && !m.win.contains(document.activeElement)) m.win.focus({ preventScroll: true }); }, 40);
  m.win.tabIndex = -1;
  window.dispatchEvent(new CustomEvent("inquire:window", { detail: { id, open: true } }));
  return m;
}
/* ---------- My notes page (#notes): a page like the start menu, not a window over it (Devon, Oct 2026) ----------
   o.folder ("all" | "fav" | "none" | folder id), o.sel (note id). NPAGE.show(o) switches folder / note in place. */
/* My notes and My Code (Devon, Oct 2026) share this page (one store, two spaces); each has its own Main Menu button.
   My Music is coming soon. (The thumb tabs on the right edge are gone, Oct 12 2026.) */
let NPAGE = null;
const TITLES = { notes: "My notes", code: "My Code" };
const SUBS = { notes: "All notes are saved on this computer.", code: "Code files are saved on this computer. ▶ Run sends them to the run service in Settings → Code (JavaScript runs here)." };
function renderNotesPage(o = {}){
  if (o.space === "notes" || o.space === "code") { SPACE = o.space; store.set("nspace", SPACE); }
  const ST = SPACES[SPACE];
  if (o.folder) { ST.folder = o.folder; ST.q = ""; }
  if (o.sel) ST.sel = o.sel;
  const pg = h("div", { class: "npage" });
  pg.innerHTML = `<div class="np-wrap"><section class="np-win win" aria-labelledby="np-t">
    <header class="set-h mw-h"><button type="button" class="np-back" data-a="back" title="Back to the Main Menu" aria-label="Back to the Main Menu"><span aria-hidden="true">‹</span> Back</button><span class="dot"></span><h2 id="np-t">My notes</h2><span class="mw-sub"></span><span class="mw-hx"></span></header>
    <div class="nb-info" role="status" aria-live="polite"></div>
    <div class="mw-body"></div></section></div>`;
  viewEl.appendChild(pg);
  $(".np-back", pg).onclick = () => goBack();
  const m = { body: $(".mw-body", pg), head: $(".mw-hx", pg), info: $(".nb-info", pg), cleanup: [] };
  const paint = () => { const w = pg.querySelector(".np-win"); w.dataset.space = SPACE; $("#np-t", pg).textContent = TITLES[SPACE]; $(".mw-sub", pg).textContent = SUBS[SPACE]; };
  const draw = focusBody => { m.cleanup.forEach(f => { try { f(); } catch(e){} }); m.cleanup = []; paint(); renderNotes(m, focusBody, SPACE); };
  const switchTo = (sp, x = {}) => {
    if (sp === SPACE && !x.force) return;
    if (m.flush) m.flush();
    SPACE = sp; store.set("nspace", SPACE); draw(x.focusBody); crumbs(); viewIn(m.body); navMark();
    try { history.replaceState({ view: "notes", space: SPACE }, "", "#" + (SPACE === "code" ? "code" : "notes")); } catch(e){}
  };
  draw(o.focusBody); crumbs(); // the breadcrumb says My notes or My Code
  NPAGE = { show(x){
      if ((x.space === "notes" || x.space === "code") && x.space !== SPACE) { const T = SPACES[x.space]; if (x.folder) { T.folder = x.folder; T.q = ""; } if (x.sel) T.sel = x.sel; switchTo(x.space, { focusBody: x.focusBody }); return; }
      const T = SPACES[SPACE]; if (x.folder) { T.folder = x.folder; T.q = ""; } if (x.sel) T.sel = x.sel; m.redraw(x.focusBody); },
    newNote: () => m.newNote(), space: () => SPACE };
  cleanup.push(() => { m.cleanup.forEach(f => { try { f(); } catch(e){} }); NPAGE = null; });
}
/* ---------- My Tasks page (#tasks): tasks.js draws the list and the task overview ---------- */
let TPAGE = null;
function renderTasksPage(o = {}){
  const pg = h("div", { class: "npage tpage" });
  pg.innerHTML = `<section class="np-win win nt-win" aria-labelledby="nt-t">
    <header class="set-h mw-h"><button type="button" class="np-back" data-a="back" title="Back to the Main Menu" aria-label="Back to the Main Menu"><span aria-hidden="true">‹</span> Back</button><span class="dot"></span><h2 id="nt-t">My Tasks</h2><span class="mw-sub">Saved on this computer. Reminders show as notifications while NotePath is running.</span><span class="mw-hx"></span></header>
    <div class="mw-body"></div></section>`;
  viewEl.appendChild(pg);
  $(".np-back", pg).onclick = () => goBack();
  const m = { body: $(".mw-body", pg), head: $(".mw-hx", pg), cleanup: [] };
  if (window.NPTasks) NPTasks.render(m, o);
  TPAGE = { show: x => m.show && m.show(x), newNote: () => m.newNote && m.newNote() };
  cleanup.push(() => { m.cleanup.forEach(f => { try { f(); } catch(e){} }); TPAGE = null; });
}
/* ---------- ⇪ Share (v0.5.4, Devon; replaces ⇅ Import / Export): copy a link to the note, copy its words, send a copy as a
   file, Import & Export. A link is notepath://note/<id>: in another file, a calendar or an email to yourself it opens the note in
   NotePath (main.js registers notepath:// links). Notes stay on this computer, so for an associate it is Send a copy (a file
   anyone can open); their NotePath would say the note is not there. ---------- */
const noteLink = id => "notepath://note/" + id;
async function copyText(t){
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  const ta = h("textarea", { style: "position:fixed;left:-9999px;top:0" }); ta.value = t; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); return ok;
}
const toastMsg = (t, ms = 4000) => { const NS = window.InquireNotes; if (NS && NS.toast) NS.toast(esc(t), null, ms); };
function openNoteLink(id){
  const NS = window.InquireNotes, n = NS && NS.get(id);
  if (!n) { toastMsg("That note is not on this computer. NotePath keeps notes on the computer they were written on: ask for a copy (Share → Send a copy).", 7000); return; }
  go({ view: "notes", space: NS.spaceOf(n), folder: "all", sel: id });
}
let shareEl = null;
function closeShare(){ if (!shareEl) return; shareEl.remove(); shareEl = null; document.removeEventListener("pointerdown", shareOut, true); window.removeEventListener("keydown", shareKey, true); document.querySelectorAll(".np-share[aria-expanded=true]").forEach(b => b.setAttribute("aria-expanded", "false")); }
const shareOut = e => { if (shareEl && !shareEl.contains(e.target) && !e.target.closest(".np-share")) closeShare(); };
const shareKey = e => { if (e.key === "Escape" && shareEl) { e.preventDefault(); e.stopPropagation(); closeShare(); } };
function shareMenu(btn, o){
  if (shareEl) { closeShare(); return; }
  const NS = window.InquireNotes, n = o.id && NS.get(o.id), dis = n ? "" : " disabled";
  shareEl = h("div", { class: "np-pop win np-share-pop", role: "menu", "aria-label": "Share" });
  shareEl.innerHTML = `<div class="np-pop-h">Share <span>${n ? "“" + esc(n.title) + "”" : "select a note first"}</span></div>
    <div class="np-shs">
      <button type="button" role="menuitem" data-s="link"${dis}><span class="np-shi" aria-hidden="true">🔗</span><span><b>Copy link</b><small>Opens this note in NotePath on this computer. Paste it in another file, a calendar or an email to yourself.</small></span></button>
      <button type="button" role="menuitem" data-s="text"${dis}><span class="np-shi" aria-hidden="true">⧉</span><span><b>Copy the words</b><small>The title and text, to paste into a message.</small></span></button>
    </div>
    <div class="np-pop-sub">Send a copy <span class="np-shnote">for an associate: a file anyone can open, no NotePath needed</span></div>
    <div class="np-shf">${[["txt", "Text", ".txt"], ["html", "Web page", ".html"], ["docx", "Word", ".docx"], ["pdf", "PDF", ".pdf"]].map(([k, nm, ext]) => `<button type="button" role="menuitem" data-f="${k}"${dis}><b>${nm}</b><small>${ext}</small></button>`).join("")}</div>
    <div class="np-shs np-shio"><button type="button" role="menuitem" data-s="io"><span class="np-shi" aria-hidden="true">⇅</span><span><b>Import &amp; Export…</b><small>Word, Markdown (Obsidian), Apple Notes / Evernote, web page, PDF, text; a note, a folder or everything.</small></span></button></div>`;
  document.body.appendChild(shareEl); btn.setAttribute("aria-expanded", "true");
  const r = btn.getBoundingClientRect(), w = shareEl.offsetWidth;
  shareEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px"; shareEl.style.top = (r.bottom + 6) + "px";
  shareEl.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const s = b.dataset.s, f = b.dataset.f; closeShare(); if (o.flush) o.flush();
    if (s === "io") { o.openIO(); return; }
    const cur = NS.get(o.id); if (!cur) return;
    if (s === "link") { toastMsg(await copyText(noteLink(cur.id)) ? `Link copied. It opens “${cur.title}” in NotePath on this computer.` : "The link could not be copied."); return; }
    if (s === "text") { toastMsg(await copyText(cur.title + "\n\n" + (cur.body || "")) ? "The words are copied." : "They could not be copied."); return; }
    if (f && window.NPIO) { try { const res = await NPIO.exportNotes("note", f, { note: cur.id }); toastMsg(res && res.printed ? "The print window is open: choose Save as PDF." : `Saved “${res.file}”. Attach it to an email or a message.`, 5000); } catch (err) { toastMsg(String(err && err.message || err)); } }
  });
  setTimeout(() => { const f0 = shareEl && shareEl.querySelector("button:not([disabled])"); if (f0) f0.focus({ preventScroll: true }); }, 30);
  document.addEventListener("pointerdown", shareOut, true); window.addEventListener("keydown", shareKey, true);
}
/* ---------- cover photos (v0.5.4, Devon): a note or code file can have a photo that replaces its icon in Show as Icons and
   sits left of the title and time in the List. Set it in the New Note / New File dialog or with the small button by the title
   (click to choose, or drop a photo on it; ✕ takes it off). Stored like note photos (InquireNotes.putImage), id in note.cover. ---------- */
const COVER_IC = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 11l3.5-3.5 3 3 2-2 4.5 4"/><circle cx="11" cy="6" r="1.3"/></svg>';
function coverButton(NS, id, onChange){
  const A = window.InquireNotes, w = h("span", { class: "nb-cov-w" });
  const setFile = async f => { if (!f || !/^image\//.test(f.type || "")) { if (f && A.toast) A.toast("That is not a photo.", null, 2500); return; } const cid = await A.putImage(f); NS.update(id, { cover: cid }); draw(); if (onChange) onChange(); };
  const draw = () => {
    const n = NS.get(id), c = n && n.cover;
    w.innerHTML = `<button type="button" class="nb-covb${c ? " set" : ""}" title="${c ? "Cover photo: click to change it, or drop a photo here" : "Add a cover photo: it shows in the notes list and as the note's icon"}" aria-label="${c ? "Change the cover photo" : "Add a cover photo"}">${c ? '<img alt="">' : COVER_IC}</button>${c ? '<button type="button" class="nb-covx" title="Take the cover photo off" aria-label="Remove the cover photo">✕</button>' : ""}<input type="file" class="nb-covin" accept="image/*" hidden>`;
    if (c) A.imageURL(c).then(u => { const im = w.querySelector("img"); if (im && u) im.src = u; });
    const inp = w.querySelector(".nb-covin");
    w.querySelector(".nb-covb").onclick = () => inp.click();
    inp.onchange = () => { setFile(inp.files[0]); inp.value = ""; };
    const x = w.querySelector(".nb-covx"); if (x) x.onclick = () => { NS.update(id, { cover: null }); draw(); if (onChange) onChange(); };
  };
  w.addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; w.classList.add("over"); } });
  w.addEventListener("dragleave", () => w.classList.remove("over"));
  w.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); e.stopPropagation(); w.classList.remove("over"); setFile(f); });
  draw(); return w;
}
// ＋ New Note (My notes, Alt+Shift+N): ask for a title, then open the note in My notes. o.folder files it there.
const NOTE_KINDS = [
  { k: "text", glyph: "✎", name: "Standard note", desc: "Text, lists, photos, video and widgets", placeholder: "Untitled note" },
  { k: "code", glyph: "&lt;/&gt;", name: "Code note", desc: "Starts with a code box: highlighting, line numbers", placeholder: "Untitled code" },
  { k: "sheet", glyph: "𝄞", name: "Music chart", desc: "A blank lead sheet: bars, chords, melody", placeholder: "Untitled chart" }];
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function newNote(o = {}){
  const NS = window.InquireNotes; if (!NS) return;
  const r = await askText({ title: "New note", label: "Note title", placeholder: "Untitled note", ok: "Create note", max: 140, kinds: NOTE_KINDS, cover: true });
  if (r == null) return;
  const title = r.text || (r.kind === "code" ? "Untitled code" : r.kind === "sheet" ? "Untitled chart" : "Untitled note");
  const html = r.kind === "code" ? `<div class="nw" data-w="code" data-src="${attr(JSON.stringify({ lang: "python", title: r.text || "", src: "" }))}"></div><div><br></div>`
    : r.kind === "sheet" ? `<div class="nw" data-w="sheet" data-src="${attr(JSON.stringify(Object.assign({}, window.NPSheet ? NPSheet.DEF : {}, { title: r.text || "" })))}"></div><div><br></div>` : undefined;
  const cover = r.cover ? await NS.putImage(r.cover).catch(() => null) : null;
  const n = NS.create({ title, html, folder: o.folder || null, fav: !!o.fav, cover });
  NOTES.q = "";
  go({ view: "notes", space: "notes", sel: n.id, focusBody: r.kind === "code" ? "code" : r.kind === "sheet" ? "sheet" : true });
}

// ＋ New File (My notes → Code): the language first (cards), then the name; it starts with a small program to run
async function newCode(o = {}){
  const NS = window.InquireNotes && InquireNotes.scope("code"), C = window.NPCode; if (!NS || !C) return;
  const r = await askText({ title: "New code file", label: "File name", placeholder: "Untitled Python", ok: "Create file", max: 140,
    kinds: C.LANGS.map(l => ({ k: l.k, glyph: esc(l.short), name: l.name, desc: l.k === "javascript" ? "Runs right here, on this computer" : "Compiles and runs on the run service", placeholder: "Untitled " + l.name })),
    foot: `<p class="ask-soon"><b>Coming soon:</b> ${C.SOON.map(esc).join(" · ")}</p>`, cover: true });
  if (r == null) return;
  const cover = r.cover ? await window.InquireNotes.putImage(r.cover).catch(() => null) : null;
  const l = C.lang(r.kind), n = NS.create({ title: r.text || "Untitled " + l.name, folder: o.folder || null, fav: !!o.fav, code: { lang: l.k, src: l.hello }, cover });
  SPACES.code.q = "";
  go({ view: "notes", space: "code", sel: n.id, focusBody: true });
}

/* ---------- start menu ----------
   The Notes console: My notes · My Tasks · My Code · My Music (coming soon) · Note Office (office.js); under them
   the three most recent notes. New notes are made in My notes (＋ New Note). */
function renderMenu(){
  const s = h("div", { class: "screen" });
  s.innerHTML = `<div class="screen-in">
    <div class="hello"><p class="eyebrow">NotePath</p><h1>Main Menu</h1></div>
    <section class="npn win" aria-labelledby="npn-t">
      <header class="win-h npn-h"><span class="dot"></span><span id="npn-t">Notes</span><span class="npn-count num"></span></header>
      <div class="slots npn-acts">
        <button type="button" class="slot big" data-a="open"><span class="glyph">▤</span><span><h3>My notes</h3><p>Every note, folder and photo, with search and your own order. Start a new note there with ＋ New Note.</p></span><span class="tag num" data-n="all"></span></button>
        <button type="button" class="slot big npn-tasks" data-a="tasks"><span class="glyph">☑</span><span><h3>My Tasks</h3><p>To-dos with priorities, due dates and reminders, places on a map, photos and files.</p></span><span class="tag num" data-n="tasks"></span></button>
        <button type="button" class="slot big npn-code" data-a="code"><span class="glyph">&lt;/&gt;</span><span><h3>My Code</h3><p>Code files in Python, C, C++, JavaScript and Java, with their own folders. ▶ Run them right here.</p></span><span class="tag num" data-n="code"></span></button>
        <button type="button" class="slot big locked npn-soon npn-music" aria-disabled="true" tabindex="-1"><span class="glyph">𝄞</span><span><h3>My Music</h3><p>Coming soon</p></span></button>
        <button type="button" class="slot big npn-office" data-a="office"><span class="glyph">⌂</span><span><h3>Note Office</h3><p>Your notes as a little office: a sheet for every note, a box for every folder. Someone works there.</p></span></button>
      </div>
      <div class="npn-recent"><h2 class="npn-sub">Recent</h2><div class="mnotes-list"></div></div>
    </section>
    <div class="verline" id="verline"></div></div>`;
  viewEl.appendChild(s);
  if (window.inquireDesktop) $("#verline", s).innerHTML = `<span>NotePath <span class="num">v${esc(DESK_VERSION || "")}</span></span>`; // updates: Settings → About
  $('[data-a="open"]', s).onclick = () => go({ view: "notes", space: "notes", folder: "all" });
  $('[data-a="office"]', s).onclick = () => { if (window.NoteOffice) NoteOffice.open(); };
  $('[data-a="tasks"]', s).onclick = () => go({ view: "tasks" });
  $('[data-a="code"]', s).onclick = () => go({ view: "notes", space: "code" });
  const drawT = () => { const T = window.NPTasks, b = $('[data-n="tasks"]', s); if (!T || !b) return; const n = T.openCount(), od = T.overdueCount(); b.textContent = n; b.title = n + " open" + (od ? ", " + od + " overdue" : ""); b.classList.toggle("od", od > 0); };
  drawT(); window.addEventListener("np:tasks-changed", drawT); cleanup.push(() => window.removeEventListener("np:tasks-changed", drawT));
  const NS = window.InquireNotes, list = $(".mnotes-list", s);
  const draw = () => {
    const all = NS ? NS.list() : [], top = all.slice(0, 3);
    $(".npn-count", s).textContent = all.length + (all.length === 1 ? " note" : " notes");
    $('[data-n="all"]', s).textContent = all.length;
    if (NS) $('[data-n="code"]', s).textContent = NS.scope("code").list().length;
    list.innerHTML = top.length ? top.map(n => `<button type="button" class="mnote" data-id="${n.id}"><span class="mnote-t">${n.fav ? '<i class="nb-star" aria-label="Favourite">★</i> ' : ""}${esc(n.title)}</span><span class="mnote-b">${esc(n.body.slice(0, 160))}</span><span class="mnote-m">${when(n.updated)}</span></button>`).join("")
      : `<p class="mnotes-empty">No notes yet. Open <b>My notes</b> and choose <b>＋ New Note</b> to write your first one.</p>`;
    list.querySelectorAll(".mnote").forEach(b => b.onclick = () => go({ view: "notes", space: "notes", folder: "all", sel: b.dataset.id }));
  };
  draw();
  window.addEventListener("inquire:notes-changed", draw); cleanup.push(() => window.removeEventListener("inquire:notes-changed", draw));
}

/* ---------- My notes layout: fold the folders / notes columns (◀ ▶ tabs) and drag the line after either column to resize it ---------- */
function notesLayout(nb){
  const fold = store.get("nbfold", { f: false, l: false }), W0 = () => store.get("nbw", 0);
  const paint = () => {
    nb.classList.toggle("ffold", !!fold.f); nb.classList.toggle("lfold", !!fold.l);
    nb.querySelectorAll(".nb-fold").forEach(b => {
      const shut = !!fold[b.dataset.p], what = b.dataset.p === "f" ? "folders" : "notes list";
      b.innerHTML = `<span aria-hidden="true">${shut ? "▶" : "◀"}</span>`; b.title = (shut ? "Show the " : "Hide the ") + what; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!shut));
    });
    const w = W0(); if (w) nb.style.setProperty("--nb-lw-user", w + "px"); else nb.style.removeProperty("--nb-lw-user");
    const fw = store.get("nbfw", 0); if (fw) nb.style.setProperty("--nb-fw-user", fw + "px"); else nb.style.removeProperty("--nb-fw-user");
    if (matchMedia("(min-width:861px)").matches) { $(".nb-folders", nb).inert = !!fold.f; $(".nb-list", nb).inert = !!fold.l; }
  };
  nb.querySelectorAll(".nb-fold").forEach(b => b.onclick = () => { fold[b.dataset.p] = !fold[b.dataset.p]; store.set("nbfold", fold); paint(); });
  // two resizers: .nb-rzf after the folders (store "nbfw", 140–420 px), .nb-rz after the notes list (store "nbw", 180–620 px); the editor keeps ≥ 340 px
  const sizer = (rz, col, key, cssVar, lo, hi, other) => {
    const lim = w => Math.round(Math.max(lo, Math.min(w, hi, nb.offsetWidth - other().offsetWidth - 340)));
    const setW = w => { store.set(key, w ? lim(w) : 0); paint(); };
    rz.addEventListener("pointerdown", e => {
      if (e.button !== 0) return; e.preventDefault();
      const z = nb.getBoundingClientRect().width / nb.offsetWidth || 1, x0 = e.clientX, w0 = col.offsetWidth;
      rz.setPointerCapture(e.pointerId); nb.classList.add("rz");
      const move = ev => nb.style.setProperty(cssVar, lim(w0 + (ev.clientX - x0) / z) + "px");
      const up = () => { rz.removeEventListener("pointermove", move); rz.removeEventListener("pointerup", up); rz.removeEventListener("pointercancel", up); nb.classList.remove("rz"); store.set(key, col.offsetWidth); };
      rz.addEventListener("pointermove", move); rz.addEventListener("pointerup", up); rz.addEventListener("pointercancel", up);
    });
    rz.addEventListener("dblclick", () => setW(0));
    rz.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setW(col.offsetWidth + (e.key === "ArrowRight" ? 20 : -20)); }
      else if (e.key === "Home") { e.preventDefault(); setW(0); }
    });
  };
  const list = $(".nb-list", nb), folders = $(".nb-folders", nb);
  sizer($(".nb-rz", nb), list, "nbw", "--nb-lw-user", 180, 620, () => folders);
  sizer($(".nb-rzf", nb), folders, "nbfw", "--nb-fw-user", 140, 420, () => list);
  paint();
}

/* ---------- small dialog in the Settings style (the app behind fogs): askText({title, label, placeholder, value, ok, max}) → text | null
   With kinds: [{ k, glyph, name, desc }] it also asks which kind (cards above the field) → { text, kind } | null. ---------- */
function askText(o = {}){
  return new Promise(done => {
    document.querySelectorAll(".ask-ov").forEach(x => x.remove());
    const last = document.activeElement;
    const ov = h("div", { class: "ask-ov" }, `<form class="ask-win win" role="dialog" aria-modal="true" aria-labelledby="ask-t">
      <header class="set-h"><span class="dot"></span><h2 id="ask-t">${esc(o.title || "Name")}</h2><button type="button" class="set-x" data-x aria-label="Cancel">✕</button></header>
      <div class="ask-body">${o.kinds ? `<div class="ask-kinds" role="radiogroup" aria-label="Kind of note">${o.kinds.map((k, i) => `<button type="button" role="radio" class="ask-kind" data-k="${k.k}" aria-checked="${o.kind ? k.k === o.kind : i === 0}"><span class="ask-kg" aria-hidden="true">${k.glyph}</span><b>${esc(k.name)}</b><small>${esc(k.desc)}</small></button>`).join("")}</div>` : ""}${o.foot || ""}<label class="ask-l" for="ask-in">${esc(o.label || "Name")}</label>
        <input id="ask-in" class="ask-in" maxlength="${o.max || 140}" placeholder="${esc(o.placeholder || "")}" value="${esc(o.value || "")}" autocomplete="off">
        ${o.cover ? `<div class="ask-cov"><button type="button" class="ask-covb" title="Choose a cover photo (optional): it shows in the notes list and as the icon">${COVER_IC}<span>Cover photo</span></button><span class="ask-covn">Optional</span><button type="button" class="ask-covx" hidden aria-label="No cover photo">✕</button><input type="file" accept="image/*" hidden class="ask-covin"></div>` : ""}<div class="ask-btns"><button type="button" class="btn-s" data-x>Cancel</button><button type="submit" class="btn good">${esc(o.ok || "OK")}</button></div></div></form>`);
    document.body.appendChild(ov);
    requestAnimationFrame(() => document.body.classList.add("ask-open"));
    const inp = $(".ask-in", ov);
    const fin = v => { document.body.classList.remove("ask-open"); document.removeEventListener("keydown", key, true); ov.classList.add("out"); setTimeout(() => ov.remove(), 250); if (last && document.contains(last)) try { last.focus({ preventScroll: true }); } catch (e) {} done(v); };
    const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fin(null); } };
    document.addEventListener("keydown", key, true);
    ov.querySelectorAll("[data-x]").forEach(b => b.onclick = () => fin(null));
    ov.addEventListener("pointerdown", e => { if (e.target === ov) fin(null); });
    let kind = o.kinds ? (o.kind && o.kinds.some(k => k.k === o.kind) ? o.kind : o.kinds[0].k) : null;
    ov.querySelectorAll(".ask-kind").forEach(b => b.onclick = () => { kind = b.dataset.k; ov.querySelectorAll(".ask-kind").forEach(x => x.setAttribute("aria-checked", String(x === b))); const k = o.kinds.find(x => x.k === kind); if (k && k.placeholder) inp.placeholder = k.placeholder; inp.focus(); });
    $(".ask-kinds", ov) && $(".ask-kinds", ov).addEventListener("keydown", e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); const bs = [...ov.querySelectorAll(".ask-kind")], i = bs.findIndex(x => x.dataset.k === kind), j = (i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length; bs[j].click(); bs[j].focus(); });
    let coverFile = null; // optional cover photo (v0.5.4)
    if (o.cover) { const cb = $(".ask-covb", ov), ci = $(".ask-covin", ov), cn = $(".ask-covn", ov), cx = $(".ask-covx", ov);
      const show = f => { coverFile = f; cx.hidden = !f; cb.classList.toggle("set", !!f); if (f) { const u = URL.createObjectURL(f); cb.innerHTML = `<img alt="" src="${u}"><span>Cover photo</span>`; cn.textContent = f.name; } else { cb.innerHTML = COVER_IC + "<span>Cover photo</span>"; cn.textContent = "Optional"; } };
      cb.onclick = () => ci.click(); ci.onchange = () => { const f = ci.files[0]; if (f && /^image\//.test(f.type)) show(f); ci.value = ""; }; cx.onclick = () => show(null); }
    $("form", ov).onsubmit = e => { e.preventDefault(); const t = inp.value.trim(); fin(o.kinds ? (o.cover ? { text: t, kind, cover: coverFile } : { text: t, kind }) : t); };
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

/* ---------- My notes (page): folders column (folders with their notes) · notes list · editor (one note, or two side by side) ---------- */
const NOTES = { sel: null, q: "", folder: "all", sort: store.get("notesort", "mine"), favTop: store.get("notefavtop", true) };
const SPACES = { notes: NOTES, code: { sel: null, q: "", folder: "all", sort: store.get("codesort", "mine"), favTop: store.get("codefavtop", true) } };
let SPACE = store.get("nspace", "notes") === "code" ? "code" : "notes";
const SKEYS = { notes: { sort: "notesort", favTop: "notefavtop" }, code: { sort: "codesort", favTop: "codefavtop" } };
/* ---------- Show as: Icons · List · Details, like Finder / File Explorer (Devon, Oct 12 2026): for the notes list (each space
   keeps its own choice) and the ◈ Links panel. Details = name, modified, created and kind. ---------- */
const VIEWS = [["icons", "Icons", '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>'],
  ["list", "List", '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 4h12M2 8h12M2 12h12"/></svg>'],
  ["compact", "Compact: thin rows with the name and when it was made", '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 3h12M2 6h12M2 9h12M2 12h12M11 2v12"/></svg>'],
  ["details", "Details: created, modified and kind", '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 3.5h12M2 8h12M2 12.5h12M9 2v12"/></svg>']];
const viewOf = k => { const v = store.get(k, "list"); return VIEWS.some(x => x[0] === v) ? v : "list"; };
const viewSwitch = (cur, label, views = VIEWS) => `<div class="np-views" role="radiogroup" aria-label="${esc(label || "Show as")}">${views.map(([k, n, ic]) => `<button type="button" role="radio" data-view="${k}" aria-checked="${k === cur}" title="Show as ${n}" aria-label="${n.split(":")[0]}">${ic}</button>`).join("")}</div>`;
const stampShort = t => { if (!t) return "—"; const d = new Date(t); return d.toLocaleString(undefined, { year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
function noteKind(n){
  if (n.space === "code") { const l = window.NPCode ? NPCode.lang(n.code.lang) : null; return (l ? l.name : "Code") + " file"; }
  const h = String(n.html || "");
  if (/data-w="sheet"/.test(h)) return "Music chart"; if (/data-w="code"/.test(h)) return "Code note"; if (/data-w="music"/.test(h)) return "Music note";
  if (/data-w="graph"/.test(h)) return "Graph note"; if (/<ul data-ck/.test(h)) return "Checklist"; if (/data-img=|class="nimg"/.test(h) || /data-w="video"/.test(h)) return "Note · media";
  return "Note";
}
const NOTE_IC = '<svg viewBox="0 0 24 28" width="30" height="34" aria-hidden="true"><path d="M3 2h12l6 6v18H3z" class="pg"/><path d="M15 2v6h6" class="fd"/><path d="M7 13h10M7 17h10M7 21h6" class="ln"/></svg>';
function renderNotes(m, focusBody, space = "notes"){
  const NS = window.InquireNotes.scope(space), NOTES = SPACES[space], CODE = space === "code", SK = SKEYS[space];
  const ALLNS = window.InquireNotes, CS = window.InquireNotes.scope("code");
  const s = m.body;
  s.innerHTML = `    <div class="nb-sbar"><label class="search nb-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search" aria-label="${CODE ? "Search every code file" : "Search every note"}"></label></div>
    <div class="nb"><nav class="nb-folders" aria-label="Folders"></nav>
    <aside class="nb-list"><div class="nb-tools">${viewSwitch(viewOf(CODE ? "codeview" : "noteview"), CODE ? "Show the code files as" : "Show the notes as")}</div>
      <div class="nb-filter"><select class="nb-sort" aria-label="${CODE ? "Order of code files" : "Order of notes"}"><option value="mine">My order</option><option value="recent">Recently edited</option></select><button type="button" class="nb-favtop" aria-pressed="false" title="Keep favourites at the top of the list">★ first</button></div><div class="nb-items" role="listbox" aria-label="${CODE ? "Code files" : "Notes"}"></div></aside>
    <section class="nb-ed"><div class="nb-tabs" hidden></div><div class="nb-panes"><div class="nb-pane p1"></div><div class="nb-pane p2" hidden></div></div></section>
    <button type="button" class="nb-fold" data-p="f"></button><button type="button" class="nb-fold" data-p="l"></button>
    <div class="nb-rzf" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the folders column (drag, or ←/→; double-click resets)" title="Drag to resize the folders · double-click resets"></div>
    <div class="nb-rz" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the notes list (drag, or ←/→; double-click resets)" title="Drag to resize the notes list · double-click resets"></div></div>`;
  notesLayout($(".nb", s)); $(".nb", s).classList.toggle("nb-code", CODE);
  const mac = /Mac/.test(navigator.platform);
  m.head.innerHTML = CODE ? `<span class="mw-tip" tabindex="0" title="Code files have their own folders: drag files into folders and folders into each other, or up and down to put them in your own order. Drag a file onto ⧉ beside the name to open two side by side. ▶ Run (${mac ? "⌘" : "Ctrl+"}Enter) runs the file; type what it reads in the Input tab. ⇄ Translate turns it into another language (AI). In My notes, the Code section of the folders lets you drop a copy of a code file into a note." aria-label="Tips">?</span><span class="np-hist" role="group" aria-label="Undo and redo"><button type="button" class="np-hb" data-a="undo" title="Undo: new, renamed, moved or deleted files and folders (inside the editor, ${mac ? "⌘" : "Ctrl+"}Z undoes typing)" aria-label="Undo">↶ Undo</button><button type="button" class="np-hb" data-a="redo" title="Redo" aria-label="Redo">↷ Redo</button></span><button type="button" class="np-newb" data-a="newnote" title="Choose a language and name a new code file (Alt+Shift+N)">＋ New File</button>`
  : `<span class="mw-tip" tabindex="0" title="Drag notes into folders and folders into other folders, drag either up or down to put them in your own order, star the ones you use most, and paste or drop photos and videos in. Click a folder icon to fold its notes away. Drag a note or a folder into the open note to link to it (right-click a link to open it in a new note tab), or onto ⧉ beside the title to open the two side by side. Drag a file from the Code section into a note for a copy of its code, or onto a folder to file a copy there; drag the line above Code to share the column. ▦ ☰ ≣ beside the search show the notes as icons, a list or details. H in the note's toolbar makes a line a Title, Subtitle or Heading 1, 2 or 3. The align and spacing menus change the whole note when nothing is selected, or only the words you select. ‹ Back goes to the window you had open before. ◈ at the bottom right lists the note's links; ↳ beside it adds your own paranotes under words or code. The ◀ tabs hide the folders or the list; drag the lines beside them to resize. Select words and right-click to define them or link them to another note." aria-label="Tips">?</span><span class="np-hist" role="group" aria-label="Undo and redo"><button type="button" class="np-hb" data-a="undo" title="Undo (${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}+Z): writing, folders, new or deleted notes, widgets…" aria-label="Undo">↶ Undo</button><button type="button" class="np-hb" data-a="redo" title="Redo (⇧${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}+Z)" aria-label="Redo">↷ Redo</button></span><button type="button" class="np-hb np-io np-share" data-a="share" aria-haspopup="menu" aria-expanded="false" title="Share: copy a link to this note, send a copy to someone, import or export notes">⇪ Share</button><button type="button" class="np-newb" data-a="newnote" title="Name a new note and start writing (Alt+Shift+N)">＋ New Note</button>`;
  const fold = $(".nb-folders", s), items = $(".nb-items", s), edSec = $(".nb-ed", s), ed = $(".nb-pane.p1", s), ed2 = $(".nb-pane.p2", s), tabs = $(".nb-tabs", s), nbEl = $(".nb", s), q = $('input[type="search"]', s), sortSel = $(".nb-sort", s);
  const VK = CODE ? "codeview" : "noteview";
  $(".nb-tools .np-views", s).addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (!b) return; store.set(VK, b.dataset.view); $(".nb-tools .np-views", s).querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
    drawList(); }); // the list keeps the width you gave it (v0.5.4, Devon): Details scrolls sideways instead of widening it
  q.value = NOTES.q;
  // Search (v0.5.4, Devon): above the folders, never folded away; it looks through every note (or code file), and shows the
  // notes list if it was folded so the results can be seen
  q.oninput = () => { NOTES.q = q.value; if (q.value.trim() && nbEl.classList.contains("lfold")) { const fb = $('.nb-fold[data-p="l"]', s); if (fb) fb.click(); } drawList(); };
  { const bar = $(".nb-sbar", s), fcol = $(".nb-folders", s), fit = () => { const w = fcol.offsetWidth; if (w > 60) bar.style.setProperty("--sbw", Math.max(200, w - 20) + "px"); };
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(fcol); m.cleanup.push(() => ro.disconnect()); } fit(); }
  sortSel.value = NOTES.sort === "recent" ? "recent" : "mine";
  sortSel.onchange = () => { NOTES.sort = sortSel.value; store.set(SK.sort, NOTES.sort); drawList(); };
  const favTop = $(".nb-favtop", s), paintFavTop = () => { favTop.setAttribute("aria-pressed", String(!!NOTES.favTop)); favTop.title = NOTES.favTop ? "Favourites are kept at the top. Click to place them in your own order instead" : "Favourites follow your order. Click to keep them at the top"; };
  favTop.onclick = () => { NOTES.favTop = !NOTES.favTop; store.set(SK.favTop, NOTES.favTop); paintFavTop(); drawList(); }; paintFavTop();
  const realFolder = () => NS.folders().some(f => f.id === NOTES.folder) ? NOTES.folder : null;
  const newHere = () => { flushEd(); (CODE ? newCode : newNote)({ folder: realFolder(), fav: NOTES.folder === "fav" }); };
  $('[data-a="newnote"]', m.head).onclick = newHere;
  // ⇅ Import / Export (io.js): the note open now and the folder being viewed are offered first
  const openIO = scope => { flushEd(); if (window.NPIO) NPIO.open({ note: NOTES.sel, folder: NOTES.folder, scope, onImported: r => { NOTES.folder = "all"; if (r.made[0]) NOTES.sel = r.made[0]; drawAll(); } }); };
  const shb = $('[data-a="share"]', m.head); if (shb) shb.onclick = () => shareMenu(shb, { id: NOTES.sel, flush: flushEd, openIO });
  // undo / redo (notes.js keeps the steps): save what is being typed, step, redraw everything from the store
  const hb = { undo: $('[data-a="undo"]', m.head), redo: $('[data-a="redo"]', m.head) };
  const paintHist = () => { const st = NS.history(); hb.undo.disabled = !st.undo; hb.redo.disabled = !st.redo; };
  const step = dir => { flushEd(); if (NS[dir]()) drawAll(); paintHist(); };
  hb.undo.onclick = () => step("undo"); hb.redo.onclick = () => step("redo");
  window.addEventListener("inquire:notes-history", paintHist); m.cleanup.push(() => window.removeEventListener("inquire:notes-history", paintHist));
  const histKey = e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase(); if (k !== "z" && !(k === "y" && e.ctrlKey)) return;
    const t = e.target; if (t && t.closest && t.closest("input, textarea, select")) return; // text fields (title, code box, notation…) keep their own undo
    if (document.querySelector(".ask-ov, .set-ov:not([hidden])")) return;
    e.preventDefault(); e.stopPropagation(); step(k === "y" || e.shiftKey ? "redo" : "undo");
  };
  document.addEventListener("keydown", histKey, true); m.cleanup.push(() => document.removeEventListener("keydown", histKey, true));
  m.newNote = newHere; m.flush = () => flushEd();
  // a folder shows its own notes and the notes of every folder inside it
  let inSub = new Set();
  const inView = n => NOTES.folder === "all" || (NOTES.folder === "fav" ? n.fav : NOTES.folder === "none" ? !n.folder : inSub.has(n.folder));

  // drag and drop: notes onto folders (file them) or onto other notes (My order); folders onto folders (nest) or between them (reorder)
  let DRAG = null;
  const clearDrop = () => s.querySelectorAll(".drop,.drop-before,.drop-after").forEach(el => el.classList.remove("drop", "drop-before", "drop-after"));
  const closed = () => new Set(store.get("notefold", []));
  // the fold button of every folder is its icon: a closed folder while folded, an open one while its notes show (Devon, Oct 2026)
  const folderIcon = open => `<span class="nb-fic nb-fold-ic${open ? " open" : ""}" aria-hidden="true"><svg viewBox="0 0 16 16" width="15" height="15">${open
    ? '<path d="M1.5 13.5V3.5h4.2l1.5 1.6h5.8v2" class="b"/><path d="M1.5 13.5l2.3-6.4h10.7l-2.3 6.4z" class="f"/>'
    : '<path d="M1.5 3.5h4.2l1.5 1.6h7.3v8.4h-13z" class="f"/><path d="M1.5 6.6h13" class="b"/>'}</svg></span>`;
  /* the info line under the page title and ‹ Back (Devon, Oct 12 2026; moved out of the folders column in v0.5.4): when the
     selected note was last edited and made, and the same for the folder being viewed (its last change = the folder itself or
     any note in it), as MM/DD/YY hh:mm:ss AM/PM */
  const p2 = v => String(v).padStart(2, "0");
  const stamp = t => { if (!t) return ""; const d = new Date(t), hr = d.getHours(); return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${p2(d.getFullYear() % 100)} ${p2(hr % 12 || 12)}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${hr < 12 ? "AM" : "PM"}`; };
  const infoRow = (k, t, why) => `<span class="nb-iv"><span class="nb-ilab">${k}</span> ${t ? `<time class="num" datetime="${new Date(t).toISOString()}">${esc(stamp(t))}</time>` : `<span class="nb-inone" title="${esc(why || "")}">Not recorded</span>`}</span>`;
  function drawInfo(){
    const box = m.info; if (!box) return;
    const n = NOTES.sel && NS.get(NOTES.sel), all = NS.list(), f = NS.folders().find(x => x.id === NOTES.folder);
    const inF = f ? (() => { const sub = NS.subtree(f.id); return all.filter(x => sub.has(x.folder)); })() : NOTES.folder === "fav" ? all.filter(x => x.fav) : NOTES.folder === "none" ? all.filter(x => !x.folder) : all;
    const fname = f ? f.name : NOTES.folder === "fav" ? "Favourites" : NOTES.folder === "none" ? "Unfiled" : CODE ? "All code" : "All notes";
    const last = Math.max(f && f.updated || 0, ...inF.map(x => x.updated || 0));
    box.setAttribute("aria-label", CODE ? "Selected file and folder" : "Selected note and folder");
    box.innerHTML = `<span class="nb-ib"><span class="nb-ik">${CODE ? "File" : "Note"}</span>${n ? `<b class="nb-iname" title="${esc(n.title)}">${esc(n.title)}</b>${infoRow("Last edited", n.updated)}${infoRow("Created", n.created)}` : `<span class="nb-inone">No ${CODE ? "file" : "note"} selected</span>`}</span>`
      + `<span class="nb-ib"><span class="nb-ik">Folder</span><b class="nb-iname" title="${esc(fname)}">${esc(fname)}</b>${infoRow("Last change", last > 0 ? last : 0, "Nothing in it yet")}${f ? infoRow("Created", f.created, "Folders made before NotePath 0.5.2 have no creation date") : ""}</span>`;
  }
  const onInfo = () => drawInfo(); window.addEventListener("inquire:notes-changed", onInfo); m.cleanup.push(() => window.removeEventListener("inquire:notes-changed", onInfo));
  function drawFolders(){
    const all = NS.list(), fs = NS.folders(), shut = closed();
    if (!["all", "fav", "none"].includes(NOTES.folder) && !fs.some(f => f.id === NOTES.folder)) NOTES.folder = "all";
    inSub = ["all", "fav", "none"].includes(NOTES.folder) ? new Set() : NS.subtree(NOTES.folder);
    const count = id => { const sub = NS.subtree(id); return all.filter(n => sub.has(n.folder)).length; };
    const row = (id, ic, name, n, f) => `<div class="nb-fd${NOTES.folder === id ? " sel" : ""}${f ? " user" : ""}" data-f="${id}"${f ? ` draggable="true" style="--d:${f.depth}"` : ""}>${f ? `<button type="button" class="nb-fcar" data-car="${id}" aria-expanded="${!shut.has(id)}" title="${shut.has(id) ? "Show" : "Hide"} what is in ${esc(name)}" aria-label="${shut.has(id) ? "Show" : "Hide"} the notes and folders in ${esc(name)}">${folderIcon(!shut.has(id))}</button>` : ""}<button type="button" class="nb-fdb" data-f="${id}" aria-pressed="${NOTES.folder === id}"${f ? ` title="Drag onto another folder to put it inside; drag above or below a folder to reorder. Alt+↑/↓ also reorders."` : ""}>${f ? "" : `<span class="nb-fic">${ic}</span>`}<span class="nb-fnm">${esc(name)}</span><span class="nb-fn num">${n}</span></button>${f ? `<button type="button" class="nb-fx nb-ffav${f.fav ? " on" : ""}" data-ffav="${id}" aria-pressed="${!!f.fav}" title="${f.fav ? "Unstar: back to its own place" : "Star: keep this folder at the top"}" aria-label="${f.fav ? "Unstar" : "Star"} ${esc(name)}">${f.fav ? "★" : "☆"}</button><button type="button" class="nb-fx" data-sub="${id}" title="New folder inside" aria-label="New folder inside ${esc(name)}">＋</button><button type="button" class="nb-fx" data-ren="${id}" title="Rename folder" aria-label="Rename ${esc(name)}">✎</button><button type="button" class="nb-fx" data-del="${id}" title="Delete folder (its notes and folders move up a level)" aria-label="Delete ${esc(name)}">✕</button>` : ""}</div>`;
    // each folder lists its folders, then its own notes (My order); ▾ / ▸ folds both away
    const byFolder = {}; all.slice().sort(NS.byOrder).forEach(n => { if (n.folder) (byFolder[n.folder] = byFolder[n.folder] || []).push(n); });
    const noteRow = (n, d) => `<div class="nb-fnote${n.id === NOTES.sel ? " sel" : ""}" role="button" tabindex="0" draggable="true" data-id="${n.id}" style="--d:${d}" title="Open ${esc(n.title)} · drag it onto a folder, into the open note (a link) or onto ⧉ (side by side)"><span class="nb-fni" aria-hidden="true">${n.fav ? "★" : "▫"}</span><span class="nb-fnt">${esc(n.title)}</span></div>`;
    const tree = parent => fs.filter(f => (f.parent || null) === parent).map(f => row(f.id, "", f.name, count(f.id), f)
      + (shut.has(f.id) ? "" : tree(f.id) + (byFolder[f.id] || []).map(n => noteRow(n, f.depth + 1)).join(""))).join("");
    fold.innerHTML = (CODE ? "" : `<div class="nb-fmain">`) + `<div class="nb-fh">${CODE ? "Code library" : "Library"}</div>`
      + row("all", CODE ? "&lt;/&gt;" : "▤", CODE ? "All code" : "All notes", all.length) + row("fav", "★", "Favourites", all.filter(n => n.fav).length) + row("none", "◌", "Unfiled", all.filter(n => !n.folder).length)
      + `<div class="nb-fh nb-ftop" data-top>${CODE ? "Code folders" : "Folders"}</div>` + tree(null)
      + `<button type="button" class="nb-fadd" data-a="addf">＋ New folder</button>` + (CODE ? "" : `</div><div class="nb-fsplit" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Share the folders column between notes and code (drag, or ↑/↓; double-click resets)" title="Drag to give the Code section more or less room · double-click resets"></div><div class="nb-fcode">${codeSection(shut)}</div>`);
    if (!CODE) wireFsplit();
    drawInfo();
    if (!CODE) wireCodeSection();
    fold.querySelectorAll(".nb-fnote:not(.nb-cfile)").forEach(r => {
      const open = () => { if (NOTES.sel === r.dataset.id) return; flushEd(); NOTES.sel = r.dataset.id; const n = NS.get(r.dataset.id); if (n && !inView(n)) NOTES.folder = n.folder || "all"; drawAll(); };
      r.onclick = open; r.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
      r.addEventListener("dragstart", e => noteDragStart(e, r.dataset.id, r));
      r.addEventListener("dragend", () => noteDragEnd(r));
    });
    // pick, open/close, rename, delete
    fold.querySelectorAll(".nb-fdb").forEach(b => b.onclick = () => { NOTES.folder = b.dataset.f; drawFolders(); drawList(); });
    fold.querySelectorAll("[data-car]").forEach(b => b.onclick = e => { e.stopPropagation(); const c = closed(), id = b.dataset.car; c.has(id) ? c.delete(id) : c.add(id); store.set("notefold", [...c]); drawFolders(); });
    fold.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { const id = b.dataset.sub, c = closed(); c.delete(id); store.set("notefold", [...c]);
      const at = h("div", { class: "nb-fd user", style: `--d:${(fs.find(f => f.id === id) || {}).depth + 1 || 1}` }); b.closest(".nb-fd").after(at);
      nameBox(at, "", v => { const f = NS.addFolder(v, id); NOTES.folder = f.id; drawAll(); }); });
    fold.querySelectorAll("[data-ffav]").forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.ffav, f = NS.folders().find(x => x.id === id); NS.setFolderFav(id, !(f && f.fav)); drawFolders(); const nb = fold.querySelector(`[data-ffav="${id}"]`); if (nb) nb.focus(); });
    fold.querySelectorAll("[data-ren]").forEach(b => b.onclick = () => nameBox(b.closest(".nb-fd"), NS.folders().find(f => f.id === b.dataset.ren).name, v => { NS.renameFolder(b.dataset.ren, v); drawAll(); }));
    fold.querySelectorAll("[data-del]").forEach(b => { let armed = 0; b.onclick = () => {
      if (!armed) { b.textContent = "Delete?"; b.classList.add("armed"); armed = setTimeout(() => { armed = 0; b.textContent = "✕"; b.classList.remove("armed"); }, 3000); return; }
      clearTimeout(armed); NS.removeFolder(b.dataset.del); if (NOTES.folder === b.dataset.del) NOTES.folder = "all"; drawAll(); }; });
    // keyboard: Alt+↑/↓ on a folder moves it among its siblings
    fold.querySelectorAll(".nb-fd.user .nb-fdb").forEach(b => b.addEventListener("keydown", e => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault();
      const id = b.dataset.f, f = fs.find(x => x.id === id), sib = fs.filter(x => x.parent === f.parent).map(x => x.id), i = sib.indexOf(id);
      if (e.key === "ArrowUp" && i > 0) NS.moveFolder(id, f.parent, sib[i - 1]); else if (e.key === "ArrowDown" && i < sib.length - 1) NS.moveFolder(id, f.parent, sib[i + 2] || null); else return;
      drawFolders(); const nb = fold.querySelector(`.nb-fdb[data-f="${id}"]`); if (nb) nb.focus();
    }));
    fold.querySelectorAll(".nb-fd.user").forEach(d => {
      d.addEventListener("dragstart", e => { DRAG = { type: "folder", id: d.dataset.f }; e.dataTransfer.setData("text/x-folder", d.dataset.f); e.dataTransfer.effectAllowed = "copyMove"; nbEl.classList.add("dragfolder"); d.classList.add("dragging"); });
      d.addEventListener("dragend", () => { DRAG = null; d.classList.remove("dragging"); clearDrop(); nbEl.classList.remove("dragfolder"); hideCaret(); });
    });
    $('[data-a="addf"]', fold).onclick = e => nameBox(e.target, "", v => { const f = NS.addFolder(v); NOTES.folder = f.id; drawAll(); });
  }
  /* ----- Notes tab: the Code section under the folders (a divider, then the Code folders and files). A code file opens in
     My Code; dragged into a note it becomes a code box (a copy); dropped on a folder it is copied there as a new note.
     The original always stays in My Code (Devon, Oct 2026). ----- */
  const LG = k => (window.NPCode ? NPCode.lang(k) : { short: "&lt;/&gt;" });
  function codeSection(shut){
    const cf = CS.folders(), cn = CS.list(), open = !store.get("codesecfold", false);
    const byF = {}; cn.slice().sort(ALLNS.byOrder).forEach(n => { const k = n.folder || "_"; (byF[k] = byF[k] || []).push(n); });
    const crow = (n, d) => `<div class="nb-fnote nb-cfile" role="button" tabindex="0" draggable="true" data-cid="${n.id}" style="--d:${d}" title="${esc(n.title)}: click to open it in My Code; drag it into a note for a copy of its code, or onto a folder to file a copy there"><span class="nb-fni nb-cfi" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</span><span class="nb-fnt">${esc(n.title)}</span></div>`;
    const cnt = id => { const sub = ALLNS.subtree(id); return cn.filter(n => sub.has(n.folder)).length; };
    const cfrow = f => `<div class="nb-cfd" style="--d:${f.depth}"><button type="button" class="nb-fcar" data-ccar="${f.id}" aria-expanded="${!shut.has(f.id)}" title="${shut.has(f.id) ? "Show" : "Hide"} the files in ${esc(f.name)}" aria-label="${shut.has(f.id) ? "Show" : "Hide"} the files in ${esc(f.name)}">${folderIcon(!shut.has(f.id))}</button><span class="nb-cfdn">${esc(f.name)}</span><span class="nb-fn num">${cnt(f.id)}</span></div>`;
    const tree = parent => cf.filter(f => (f.parent || null) === parent).map(f => cfrow(f) + (shut.has(f.id) ? "" : tree(f.id) + (byF[f.id] || []).map(n => crow(n, f.depth + 1)).join(""))).join("");
    return `<div class="nb-codeh" role="separator"><button type="button" class="nb-codet" aria-expanded="${open}" title="${open ? "Hide" : "Show"} your code files">${folderIcon(open)} Code</button><span class="nb-fn num">${cn.length}</span><button type="button" class="nb-codego" data-a="gocode" title="Open My Code" aria-label="Open My Code">↗</button></div>`
      + (open ? `<div class="nb-codetree">${cn.length || cf.length ? tree(null) + (byF._ || []).map(n => crow(n, 0)).join("") : `<p class="nb-codeempty">No code files yet. Make one in <b>My Code</b> on the Main Menu.</p>`}</div>` : "");
  }
  /* the line between the notes folders and the Code section: drag it (or ↑/↓) to share the column; the Code part's height
     is kept (store "codesech"); folded, the Code section takes only its header (Devon, Oct 12 2026) */
  function wireFsplit(){
    const sp = $(".nb-fsplit", fold), main = $(".nb-fmain", fold), code = $(".nb-fcode", fold); if (!sp || !code) return;
    const open = !store.get("codesecfold", false); fold.classList.add("has-fsplit"); fold.classList.toggle("code-shut", !open);
    const total = () => fold.clientHeight, set = (hgt, keep) => { const H = total(); if (!H) return; hgt = Math.round(Math.max(44, Math.min(H - 120, hgt))); code.style.height = hgt + "px"; if (keep) store.set("codesech", hgt); };
    if (open) requestAnimationFrame(() => { if (fold.isConnected) set(store.get("codesech", Math.round(total() * .34))); });
    sp.addEventListener("pointerdown", e => { if (!open) return; e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add("on"); const y0 = e.clientY, h0 = code.offsetHeight;
      const mv = ev => set(h0 - (ev.clientY - y0)), up = () => { sp.classList.remove("on"); sp.removeEventListener("pointermove", mv); sp.removeEventListener("pointerup", up); set(code.offsetHeight, true); };
      sp.addEventListener("pointermove", mv); sp.addEventListener("pointerup", up); });
    sp.addEventListener("keydown", e => { if (!open || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault(); set(code.offsetHeight + (e.key === "ArrowUp" ? 24 : -24), true); });
    sp.addEventListener("dblclick", () => { if (!open) return; store.set("codesech", null); set(Math.round(total() * .34)); });
    main.scrollTop = FOLDSCROLL.m || 0; code.scrollTop = FOLDSCROLL.c || 0;
    main.onscroll = () => { FOLDSCROLL.m = main.scrollTop; }; code.onscroll = () => { FOLDSCROLL.c = code.scrollTop; };
  }
  const FOLDSCROLL = {};
  function wireCodeSection(){
    const t = $(".nb-codet", fold); if (!t) return;
    t.onclick = () => { store.set("codesecfold", !store.get("codesecfold", false)); drawFolders(); };
    $('[data-a="gocode"]', fold).onclick = () => { flushEd(); go({ view: "notes", space: "code" }); };
    fold.querySelectorAll("[data-ccar]").forEach(b => b.onclick = () => { const c = closed(), id = b.dataset.ccar; c.has(id) ? c.delete(id) : c.add(id); store.set("notefold", [...c]); drawFolders(); });
    fold.querySelectorAll(".nb-cfile").forEach(r => {
      const open = () => { flushEd(); go({ view: "notes", space: "code", sel: r.dataset.cid }); };
      r.onclick = open; r.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
      r.addEventListener("dragstart", e => { DRAG = { type: "code", id: r.dataset.cid }; e.dataTransfer.setData("text/x-code", r.dataset.cid); e.dataTransfer.effectAllowed = "copy"; r.classList.add("dragging"); nbEl.classList.add("dragcode"); });
      r.addEventListener("dragend", () => { DRAG = null; r.classList.remove("dragging"); clearDrop(); nbEl.classList.remove("dragcode"); hideCaret(); });
    });
  }
  const codeBox = c => ({ lang: c.code.lang, title: c.title, src: c.code.src });
  // where a drag over the folder column would land: { el, how: "into" | "before" | "after" | "top", id }
  function folderDrop(e){
    if (!DRAG) return null;
    const top = e.target.closest("[data-top]");
    if (DRAG.type === "folder" && top) return { el: top, how: "top" };
    const d = e.target.closest(".nb-fd"); if (!d || !d.dataset.f) return null;
    const f = d.dataset.f;
    if (DRAG.type === "note" || DRAG.type === "code") return f === "all" ? null : { el: d, how: "into", id: f };
    if (f === "fav") return null;
    if (f === "all" || f === "none") return { el: d, how: "top" };
    if (NS.subtree(DRAG.id).has(f)) return null; // not into itself or its own subfolders
    const r = d.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    return { el: d, how: y < .28 ? "before" : y > .72 ? "after" : "into", id: f };
  }
  fold.addEventListener("dragover", e => {
    const t = folderDrop(e); clearDrop(); if (!t) return;
    e.preventDefault(); e.dataTransfer.dropEffect = DRAG.type === "code" ? "copy" : "move";
    t.el.classList.add(t.how === "before" ? "drop-before" : t.how === "after" ? "drop-after" : "drop");
  });
  fold.addEventListener("dragleave", e => { if (!fold.contains(e.relatedTarget)) clearDrop(); });
  fold.addEventListener("drop", e => {
    const t = folderDrop(e); clearDrop(); if (!t) return; e.preventDefault();
    if (DRAG.type === "code") { // a copy of the code file, as a new note with a code box, filed in that folder
      const c = ALLNS.get(DRAG.id);
      if (c && c.code) { flushEd(); const fid = t.id === "none" || t.id === "fav" ? null : t.id, fname = fid ? (NS.folders().find(f => f.id === fid) || {}).name : t.id === "fav" ? "Favourites" : "Unfiled";
        const n = NS.create({ title: c.title, folder: fid, fav: t.id === "fav", html: `<div class="nw" data-w="code" data-src="${attr(JSON.stringify(codeBox(c)))}"></div><div><br></div>` });
        NOTES.sel = n.id; if (!inView(n)) NOTES.folder = t.id; msg(`Copied “${c.title}” into ${fname || "the folder"}. The original stays in Code.`); }
      nbEl.classList.remove("dragcode");
    } else if (DRAG.type === "note") {
      if (t.id === "fav") NS.update(DRAG.id, { fav: true, quiet: true }); else NS.update(DRAG.id, { folder: t.id === "none" ? null : t.id, quiet: true });
    } else {
      const fs = NS.folders(), tf = fs.find(x => x.id === t.id);
      if (t.how === "top") NS.moveFolder(DRAG.id, null, null);
      else if (t.how === "into") { NS.moveFolder(DRAG.id, t.id, null); const c = closed(); c.delete(t.id); store.set("notefold", [...c]); }
      else if (t.how === "before") NS.moveFolder(DRAG.id, tf.parent, t.id);
      else { const sib = fs.filter(x => x.parent === tf.parent && x.id !== DRAG.id).map(x => x.id); NS.moveFolder(DRAG.id, tf.parent, sib[sib.indexOf(t.id) + 1] || null); }
    }
    DRAG = null; drawAll();
  });
  // inline name field (new folder / rename); Enter saves, Esc cancels
  function nameBox(at, val, done){
    const box = h("form", { class: "nb-fname" }, `<input maxlength="60" aria-label="Folder name" placeholder="Folder name" value="${esc(val)}"><button type="submit" class="btn-s">OK</button>`);
    at.replaceWith(box); const inp = $("input", box); inp.focus(); inp.select();
    let fin = false;
    const end = ok => { if (fin) return; fin = true; if (ok && inp.value.trim()) done(inp.value.trim()); else drawFolders(); };
    box.onsubmit = e => { e.preventDefault(); end(true); };
    inp.onkeydown = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); } };
    inp.onblur = () => setTimeout(() => end(true), 120);
  }
  /* Details columns (v0.5.4, Devon): drag the line at the right of a column header to resize it; widths kept per space
     (notepath.dcols / notepath.codedcols), double-click resets; the list scrolls sideways when they are wider than it */
  const DCK = CODE ? "codedcols" : "dcols";
  const paintDcols = () => { const w = store.get(DCK, null); if (Array.isArray(w) && w.length === 4) { items.style.setProperty("--dcols", w.map(x => x + "px").join(" ")); items.style.setProperty("--dmin", (w.reduce((a, b) => a + b, 0) + 3 * 8 + 28) + "px"); } else { items.style.removeProperty("--dcols"); items.style.removeProperty("--dmin"); } };
  function wireDcols(){
    paintDcols();
    items.querySelectorAll(".nb-dcrz").forEach(g => {
      g.addEventListener("pointerdown", e => {
        if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
        const cols = [...items.querySelectorAll(".nb-dhead > span")].map(x => Math.round(x.getBoundingClientRect().width)), i = +g.dataset.c, x0 = e.clientX, w0 = cols[i];
        g.setPointerCapture(e.pointerId); g.classList.add("on");
        const move = ev => { cols[i] = Math.max(50, Math.min(600, Math.round(w0 + ev.clientX - x0))); store.set(DCK, cols); paintDcols(); };
        const up = () => { g.classList.remove("on"); g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); };
        g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
      });
      g.addEventListener("dblclick", e => { e.stopPropagation(); store.set(DCK, null); paintDcols(); });
      g.addEventListener("click", e => e.stopPropagation());
    });
  }
  function drawList(){
    const mine = NOTES.sort !== "recent";
    const all = (NOTES.q.trim() ? NS.list(NOTES.q) : NS.list().filter(inView)).sort((a, b) => (NOTES.favTop ? b.fav - a.fav : 0) || (mine ? NS.byOrder(a, b) : b.updated - a.updated)); // favourites on top unless "★ first" is off
    if (!NOTES.sel || !all.some(n => n.id === NOTES.sel)) { if (!NOTES.sel || !NS.get(NOTES.sel) || !inView(NS.get(NOTES.sel))) NOTES.sel = all[0] ? all[0].id : null; }
    const fname = Object.fromEntries(NS.folders().map(f => [f.id, f.name]));
    const view = viewOf(VK); items.dataset.view = view;
    const badge = n => CODE ? `<i class="nc-badge" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</i>` : "", star = n => n.fav ? '<i class="nb-star" aria-label="Favourite">★</i>' : "";
    const itemHTML = n => { const a = `role="option" tabindex="0" draggable="true" aria-selected="${n.id === NOTES.sel}" data-id="${n.id}"`, inF = n.folder && fname[n.folder] && NOTES.folder !== n.folder ? "▸ " + esc(fname[n.folder]) + " · " : "";
      const cov = n.cover && /^[a-z0-9]{4,40}$/i.test(n.cover) ? n.cover : null; // cover photo (v0.5.4)
      if (view === "icons") return `<div ${a} class="nb-it nb-tile" title="${esc(n.title)} · ${esc(noteKind(n))} · edited ${esc(stampShort(n.updated))}"><span class="nb-tic${cov ? " has-cov" : ""}">${cov ? `<img class="nb-cov nb-tcov" data-cov="${cov}" alt="">` : CODE ? `<i class="nc-badge nb-tbadge" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</i>` : NOTE_IC}${n.fav ? '<i class="nb-star nb-tstar" aria-label="Favourite">★</i>' : ""}</span><span class="nb-t">${esc(n.title)}</span><span class="nb-m">${when(n.updated)}</span></div>`;
      if (view === "details") return `<div ${a} class="nb-it nb-row"><span class="nb-t">${badge(n)}${star(n)}${esc(n.title)}</span><span class="nb-dc num">${esc(stampShort(n.updated))}</span><span class="nb-dc num">${esc(stampShort(n.created))}</span><span class="nb-dc">${esc(noteKind(n))}</span></div>`;
      if (view === "compact") return `<div ${a} class="nb-it nb-row nb-crow" title="${esc(n.title)} · made ${esc(stampShort(n.created))}"><span class="nb-t">${badge(n)}${star(n)}${esc(n.title)}</span><span class="nb-dc num">${esc(stampShort(n.created))}</span></div>`;
      if (cov) return `<div ${a} class="nb-it nb-hascov"><img class="nb-cov nb-lcov" data-cov="${cov}" alt=""><span class="nb-ltx"><span class="nb-t">${badge(n)}${star(n)}${esc(n.title)}</span><span class="nb-m">${inF}${when(n.updated)}</span></span></div>`;
      return `<div ${a} class="nb-it"><span class="nb-t">${badge(n)}${star(n)}${esc(n.title)}</span><span class="nb-m">${inF}${when(n.updated)}</span></div>`; };
    items.innerHTML = all.length ? (view === "details" ? `<div class="nb-dhead" aria-hidden="true">${["Name", "Modified", "Created", "Kind"].map((t, i) => `<span>${t}${i < 3 ? `<i class="nb-dcrz" data-c="${i}" title="Drag to resize this column · double-click to reset all"></i>` : ""}</span>`).join("")}</div>` : "") + all.map(itemHTML).join("")
      : `<p class="nb-empty">${NOTES.q ? (CODE ? "No code files match." : "No notes match.") : NOTES.folder === "fav" ? (CODE ? "No favourites yet. Star a file with ☆." : "No favourites yet. Star a note with ☆.") : CODE ? "No code files here yet. Start one with ＋ New File." : "No notes here yet."}</p>`;
    items.querySelectorAll("img[data-cov]").forEach(im => window.InquireNotes.imageURL(im.dataset.cov).then(u => { if (u) im.src = u; else im.classList.add("missing"); }));
    if (view === "details") wireDcols();
    items.querySelectorAll(".nb-it").forEach(b => {
      b.onclick = () => { if (NOTES.sel === b.dataset.id) return; flushEd(); NOTES.sel = b.dataset.id; drawFolders(); drawList(); drawEd(); };
      b.addEventListener("dragstart", e => noteDragStart(e, b.dataset.id, b));
      b.addEventListener("dragend", () => noteDragEnd(b));
      // keyboard: Alt+↑/↓ moves the note in My order
      b.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && e.target === b) { e.preventDefault(); b.click(); return; }
        if (!mine || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault();
        const ids = all.map(n => n.id), i = ids.indexOf(b.dataset.id), j = i + (e.key === "ArrowUp" ? -1 : 1); if (j < 0 || j >= ids.length) return;
        ids.splice(i, 1); ids.splice(j, 0, b.dataset.id); reorder(ids); const nb = items.querySelector(`[data-id="${b.dataset.id}"]`); if (nb) nb.focus();
      });
    });
    items.title = mine ? "Drag notes up or down to reorder them, or onto a folder to file them" : "Choose My order to arrange notes by dragging";
    curIds = all.map(n => n.id);
  }
  // the notes on screen in their new order → fold them into the full My order (notes not on screen keep their places)
  let curIds = [];
  function reorder(ids){
    const full = NS.list().sort(NS.byOrder).map(n => n.id), shown = new Set(ids), slots = [];
    full.forEach((id, i) => { if (shown.has(id)) slots.push(i); });
    slots.forEach((i, k) => { full[i] = ids[k]; });
    NS.setOrder(full); drawList();
  }
  const noteDrop = e => {
    if (!DRAG || DRAG.type !== "note" || NOTES.sort === "recent") return null;
    const it = e.target.closest(".nb-it"); if (!it || it.dataset.id === DRAG.id) return null;
    const r = it.getBoundingClientRect(); return { el: it, after: e.clientY > r.top + r.height / 2 };
  };
  items.addEventListener("dragover", e => { const t = noteDrop(e); clearDrop(); if (!t) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; t.el.classList.add(t.after ? "drop-after" : "drop-before"); });
  items.addEventListener("dragleave", e => { if (!items.contains(e.relatedTarget)) clearDrop(); });
  items.addEventListener("drop", e => {
    const t = noteDrop(e); clearDrop(); if (!t) return; e.preventDefault();
    const ids = curIds.filter(id => id !== DRAG.id); let at = ids.indexOf(t.el.dataset.id); if (t.after) at++;
    ids.splice(at, 0, DRAG.id); DRAG = null; reorder(ids);
  });
  let saveT = null, rich = null;
  const flushEd = () => { if (rich) rich.flush(); if (saveT) { clearTimeout(saveT); saveT = null; const ti = $(".nb-title", ed); if (ti && ed.dataset.id && NS.get(ed.dataset.id)) NS.update(ed.dataset.id, { title: ti.value.trim() || "Untitled note" }); } flush2(); };
  const msg = t => { if (NS.toast) NS.toast(esc(t), null, 3000); };
  function drawEd(focusBody){
    if (rich) { rich.destroy(); rich = null; }
    holoEl = null; indEl = null; // the pane is redrawn; ◈ / ↳ put their panels back if they were open
    if (holoKey) { window.removeEventListener("keydown", holoKey, true); holoKey = null; } if (indKey) { window.removeEventListener("keydown", indKey, true); indKey = null; }
    drawInfo();
    ed.classList.remove("nc-pane");
    if (SPLIT.id && (SPLIT.id === NOTES.sel || !NS.get(SPLIT.id) || NS.spaceOf(NS.get(SPLIT.id)) !== space)) closeSplit(true);
    const n = NOTES.sel && NS.get(NOTES.sel);
    ed.dataset.id = n ? n.id : "";
    if (!n) { ed.innerHTML = CODE ? `<div class="nb-none"><p>Select a code file, or start one with <b>＋ New File</b> at the top right.</p></div>` : `<div class="nb-none"><p>Select a note, or start a new one with <b>＋ New Note</b> at the top right.</p></div>`; return; }
    if (CODE) { // a code file: code.js draws the bar, the title, the editor and the Output / Input panel
      ed.innerHTML = "";
      rich = NPCode.pane(ed, n, { NS, main: true, msg, focus: !!focusBody,
        onSaved: () => drawList(),
        onTitle: t => { const it = items.querySelector(`[data-id="${n.id}"] .nb-t`); if (it) it.lastChild.textContent = t; const fr = fold.querySelector(`.nb-fnote[data-id="${n.id}"] .nb-fnt`); if (fr) fr.textContent = t; },
        onFav: () => { drawFolders(); drawList(); },
        onDelete: () => { flushEd(); if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; NS.deleteWithUndo(n.id, id => { if (s.isConnected) { NOTES.sel = id; drawAll(); } }); drawAll(); },
        openSide: id => { drawFolders(); drawList(); openSplit(id); } });
      return;
    }
    ed.innerHTML = `<div class="nb-bar"><button type="button" class="nb-favb${n.fav ? " on" : ""}" data-a="fav" aria-pressed="${n.fav}" title="${n.fav ? "Remove from favourites" : "Add to favourites"}">${n.fav ? "★" : "☆"}</button>
        <button type="button" class="btn-s nb-bar-r" data-a="photo" title="Add photos from this computer (or paste / drop them into the note)">＋ Photo</button><button type="button" class="btn-s" data-a="purl" title="Show a photo from a web address">Photo link</button>
        <button type="button" class="btn-s nr-vid" data-a="video" title="Add a video: a file from this computer, or a YouTube, Vimeo or video link" aria-haspopup="dialog">▶ Video</button>
        <button type="button" class="btn-s" data-a="exp" title="Save this note as Word, Markdown (Obsidian), Apple Notes / Evernote, PDF, a web page or text">Export…</button><button type="button" class="btn-s set-warn" data-a="del">Delete</button></div>
      <form class="nb-urlrow" hidden><input type="url" placeholder="https://… address of a photo" aria-label="Photo address"><button type="submit" class="btn-s">Insert</button><button type="button" class="btn-s" data-a="purlx">Cancel</button><span class="nb-urlmsg"></span></form>
      <div class="nb-trow"><input class="nb-title" value="${esc(n.title)}" aria-label="Title" maxlength="140"><div class="nb-split" aria-hidden="true" title="Drop a note here to open it beside this one"><span class="nb-split-ic">⧉</span><span>Drop to open side by side</span></div></div>
      <div class="nb-host"></div><input type="file" accept="image/*" multiple hidden>`;
    const ti = $(".nb-title", ed), file = $('input[type="file"]', ed);
    $(".nb-trow", ed).prepend(coverButton(NS, n.id, () => drawList())); // cover photo by the title (v0.5.4)
    rich = NS.mountEditor($(".nb-host", ed), n.id, {
      onSaved: () => { const it = items.querySelector(`[data-id="${n.id}"]`); if (it) drawList(); },
      openNote: id => openLinked(id),
      openSide: id => openFromLink(id), peek: id => peekOpen(id), openFolder: fid => openFolderLink(fid),
      annotations: indShown(), onAnnotation: aid => { IND.open = true; IND.edit = aid; indOpen(n.id); },
      onMessage: msg
    });
    ti.oninput = () => { clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; NS.update(n.id, { title: ti.value.trim() || "Untitled note" }); const it = items.querySelector(`[data-id="${n.id}"] .nb-t`); if (it) it.lastChild.textContent = ti.value.trim() || "Untitled note"; const fr = fold.querySelector(`.nb-fnote[data-id="${n.id}"] .nb-fnt`); if (fr) fr.textContent = ti.value.trim() || "Untitled note"; }, 400); };
    $('[data-a="fav"]', ed).onclick = e => { const m = NS.update(n.id, { fav: !NS.get(n.id).fav, quiet: true }); const b = e.currentTarget; b.classList.toggle("on", m.fav); b.textContent = m.fav ? "★" : "☆"; b.setAttribute("aria-pressed", String(m.fav)); b.title = m.fav ? "Remove from favourites" : "Add to favourites"; drawFolders(); drawList(); };
    $('[data-a="photo"]', ed).onclick = () => file.click();
    $('[data-a="video"]', ed).onclick = e => { if (window.InquireWidgets && rich) InquireWidgets.videoPanel(e.currentTarget, rich); };
    file.onchange = async () => { const k = await rich.addFiles(file.files); if (!k) msg("Those files are not photos or videos"); file.value = ""; };
    const urlRow = $(".nb-urlrow", ed), urlIn = $("input", urlRow);
    $('[data-a="purl"]', ed).onclick = () => { urlRow.hidden = !urlRow.hidden; if (!urlRow.hidden) urlIn.focus(); };
    $('[data-a="purlx"]', ed).onclick = () => { urlRow.hidden = true; };
    urlRow.onsubmit = e => { e.preventDefault(); if (rich.addURL(urlIn.value)) { urlIn.value = ""; urlRow.hidden = true; } else $(".nb-urlmsg", urlRow).textContent = "Use an https:// address of an image."; };
    $('[data-a="exp"]', ed).onclick = () => openIO("note");
    holoButton(n);
    // delete at once, with Undo in a message for 8 s (photos and videos are only removed once that time is up)
    $('[data-a="del"]', ed).onclick = () => { flushEd(); if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; NS.deleteWithUndo(n.id, id => { if (s.isConnected) { NOTES.sel = id; drawAll(); } }); drawAll(); };
    if (focusBody) setTimeout(() => {
      const w = focusBody === "code" ? ed.querySelector(".nw[data-w=code] .nw-ta") : focusBody === "sheet" ? ed.querySelector(".nw[data-w=sheet] .sh-chords") : null;
      if (w) w.focus({ preventScroll: true }); else if (rich) rich.focus();
    }, 30);
  }
  /* ----- ◈ the floating button at the bottom right of the note: a holographic panel with Tags (soon) · Links · Source (soon).
     Links lists every note this one links to and every note that links here; drag any edge or corner to resize it
     (Devon, Oct 12 2026). Kept light: no blur, one gradient, faint scan lines. ----- */
  const HOLO = NOTES.holo || (NOTES.holo = { open: false, tab: "links", box: Object.assign({ r: 16, b: 70, w: 360, h: 340 }, store.get("holobox", {})) });
  let holoEl = null, holoKey = null;
  // resize a floating panel from any edge or corner (it is anchored to the bottom right of the note)
  function panelResize(el, box, fit, key){
    el.querySelectorAll(".np-holo-rz").forEach(g => g.addEventListener("pointerdown", e => {
      e.preventDefault(); g.setPointerCapture(e.pointerId); const d = g.dataset.d, x0 = e.clientX, y0 = e.clientY, b0 = Object.assign({}, box);
      const mv = ev => { const dx = ev.clientX - x0, dy = ev.clientY - y0, x = box;
        if (d.includes("w")) x.w = b0.w - dx; if (d.includes("e")) { x.w = b0.w + dx; x.r = b0.r - dx; }
        if (d.includes("n")) x.h = b0.h - dy; if (d.includes("s")) { x.h = b0.h + dy; x.b = b0.b - dy; }
        if (x.w < 240) { if (d.includes("e")) x.r -= 240 - x.w; x.w = 240; } if (x.h < 160) { if (d.includes("s")) x.b -= 160 - x.h; x.h = 160; }
        fit(); };
      const up = () => { g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); store.set(key, box); };
      g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    }));
  }
  const RZ = ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(d => `<div class="np-holo-rz" data-d="${d}" aria-hidden="true"></div>`).join("");
  function holoButton(n){
    const b = h("button", { type: "button", class: "nb-holob", "aria-label": "Tags, links and source of this note", title: "Tags · Links · Source", "aria-expanded": "false" }, `<span aria-hidden="true">◈</span>`);
    ed.appendChild(b);
    b.onclick = () => { HOLO.open = !HOLO.open; if (HOLO.open) holoOpen(n.id); else holoClose(); };
    if (HOLO.open) holoOpen(n.id);
    indButton(n);
  }
  /* ----- ↳ Paranotes (Devon, Oct 12 2026): the button above ◈ opens a box above the Links box. "Show paranotes"
     draws your own notes under the words they explain (notes.js does the drawing; store "indshow"); ＋ adds one on the
     selected words; click one (in the note or in the list) to edit it. Links: [words](https://…) or a bare https:// address. ----- */
  const IND = NOTES.ind || (NOTES.ind = { open: false, edit: null, box: Object.assign({ r: 16, b: 70, w: 360, h: 300 }, store.get("indbox", {})) });
  let indEl = null, indKey = null;
  const indShown = () => store.get("indshow", true) !== false;
  function indButton(n){
    const b = h("button", { type: "button", class: "nb-holob nb-indb", "aria-label": "Paranotes", title: "Paranotes: your own notes under the words they explain", "aria-expanded": "false" }, `<span aria-hidden="true">↳</span>`);
    ed.appendChild(b);
    b.onclick = () => { IND.open = !IND.open; if (IND.open) indOpen(n.id); else indClose(); };
    if (IND.open) indOpen(n.id);
  }
  function indClose(){ IND.open = false; IND.edit = null; if (indEl) { indEl.remove(); indEl = null; } if (indKey) { window.removeEventListener("keydown", indKey, true); indKey = null; } const b = $(".nb-indb", ed); if (b) b.setAttribute("aria-expanded", "false"); }
  function indFit(){
    if (!indEl) return; const W = ed.clientWidth, H = ed.clientHeight, x = IND.box, he = holoEl && holoEl.isConnected ? holoEl : null;
    const floor = he ? HOLO.box.b + he.offsetHeight + 8 : 4, b = Math.max(x.b, floor);
    x.w = Math.max(240, Math.min(x.w, W - 8)); x.r = Math.max(4, Math.min(x.r, W - x.w - 4));
    const h2 = Math.max(160, Math.min(x.h, H - b - 4));
    Object.assign(indEl.style, { right: x.r + "px", bottom: Math.min(b, Math.max(4, H - h2 - 4)) + "px", width: x.w + "px", height: h2 + "px" });
  }
  function indOpen(id){
    if (indEl) indEl.remove(); if (indKey) { window.removeEventListener("keydown", indKey, true); indKey = null; }
    const b = $(".nb-indb", ed); if (b) b.setAttribute("aria-expanded", "true");
    indEl = h("div", { class: "np-holo np-ind", role: "dialog", "aria-label": "Paranotes" });
    indEl.innerHTML = `<div class="np-holo-h"><div class="np-holo-tabs"><span class="np-ind-t">↳ Paranotes</span></div><button type="button" class="np-holo-x" aria-label="Close">✕</button></div>
      <div class="np-holo-bar"><label class="np-ind-show"><input type="checkbox"${indShown() ? " checked" : ""}><span>Show paranotes</span></label><button type="button" class="np-ind-add" title="Select words in the note (or code in a code box), then add a note of your own under them">＋ Add a paranote</button></div>
      <div class="np-holo-b np-ind-b"></div>${RZ}`;
    ed.appendChild(indEl); indFit(); indDraw(id);
    indEl.addEventListener("mousedown", e => { if (e.target.closest("button") && !e.target.closest(".np-ind-ed")) e.preventDefault(); }); // keep the words selected in the note
    $(".np-holo-x", indEl).onclick = () => indClose();
    $(".np-ind-show input", indEl).onchange = e => { store.set("indshow", e.target.checked); [rich, rich2].forEach(r => r && r.showAnnotations && r.showAnnotations(e.target.checked)); };
    $(".np-ind-add", indEl).onclick = () => {
      if (!rich || !rich.addAnnotation) return; const r = rich.addAnnotation("");
      if (r.error) { msg(r.error); return; }
      if (!indShown()) { store.set("indshow", true); $(".np-ind-show input", indEl).checked = true; rich.showAnnotations(true); }
      IND.edit = r.id; indDraw(NOTES.sel);
    };
    panelResize(indEl, IND.box, indFit, "indbox");
    indKey = e => { if (e.key === "Escape" && indEl && !document.querySelector(".tm-menu, .np-pop, .ask-ov")) { e.preventDefault(); e.stopPropagation(); if (IND.edit) { IND.edit = null; indDraw(NOTES.sel); } else indClose(); } };
    window.addEventListener("keydown", indKey, true);
  }
  function indDraw(id){
    if (!indEl || !rich || !rich.annotations) return; const list = rich.annotations(), body = $(".np-ind-b", indEl);
    const cur = IND.edit && list.find(a => a.id === IND.edit);
    if (IND.edit && !cur) IND.edit = null;
    body.innerHTML = (cur ? `<form class="np-ind-ed"><p class="np-ind-w${cur.code ? " is-code" : ""}">${cur.code ? esc(cur.words.slice(0, 120)) : `“${esc(cur.words.slice(0, 120))}”`}</p>
        <textarea rows="4" maxlength="4000" placeholder="Your note on these words… Links: paste https://… or write [words](https://…)" aria-label="Paranote">${esc(cur.text)}</textarea>
        <div class="np-ind-acts"><button type="submit" class="btn-s">Save</button><button type="button" class="btn-s" data-a="cancel">Done</button><button type="button" class="btn-s set-warn" data-a="del">Remove</button></div></form>` : "")
      + (list.length ? `<h4>In this note <span class="num">${list.length}</span></h4><ul class="np-ind-list">${list.map(a => `<li><button type="button" data-ann="${a.id}"${a.id === IND.edit ? ' aria-current="true"' : ""}><span class="np-ind-lw${a.code ? " is-code" : ""}">${esc(a.words.slice(0, 60))}</span><span class="np-ind-lt">${a.text ? esc(a.text.slice(0, 140)) : "<i>Empty</i>"}</span></button></li>`).join("")}</ul>`
        : `<p class="np-hl-none">No paranotes yet. Select words in the note, or code in a code box, and press <b>＋ Add a paranote</b>: your note appears under them, in its own colour (Settings → Appearance).</p>`);
    body.querySelectorAll("[data-ann]").forEach(b2 => b2.onclick = () => { IND.edit = b2.dataset.ann; indDraw(NOTES.sel); if (rich) rich.focusAnnotation(b2.dataset.ann); });
    const f = $(".np-ind-ed", body);
    if (f) { const ta = $("textarea", f);
      let t = 0; ta.oninput = () => { clearTimeout(t); t = setTimeout(() => rich && rich.setAnnotation(cur.id, ta.value), 350); };
      f.onsubmit = e => { e.preventDefault(); clearTimeout(t); rich.setAnnotation(cur.id, ta.value); IND.edit = null; indDraw(NOTES.sel); };
      $('[data-a="cancel"]', f).onclick = () => { clearTimeout(t); rich.setAnnotation(cur.id, ta.value); IND.edit = null; indDraw(NOTES.sel); };
      $('[data-a="del"]', f).onclick = () => { clearTimeout(t); rich.removeAnnotation(cur.id); IND.edit = null; indDraw(NOTES.sel); };
      setTimeout(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0); }
  }
  const linksOf = html => { const out = []; String(html || "").replace(/data-note="([a-z0-9]+)"/gi, (x, id) => { if (!out.includes(id)) out.push(id); return x; }); return out; };
  function holoClose(){ HOLO.open = false; if (holoEl) { holoEl.remove(); holoEl = null; } if (holoKey) { window.removeEventListener("keydown", holoKey, true); holoKey = null; } const b = $(".nb-holob", ed); if (b) b.setAttribute("aria-expanded", "false"); indFit(); }
  function holoFit(){
    if (!holoEl) return; const W = ed.clientWidth, H = ed.clientHeight, x = HOLO.box;
    x.w = Math.max(240, Math.min(x.w, W - 8)); x.h = Math.max(180, Math.min(x.h, H - 8));
    x.r = Math.max(4, Math.min(x.r, W - x.w - 4)); x.b = Math.max(4, Math.min(x.b, H - x.h - 4));
    Object.assign(holoEl.style, { right: x.r + "px", bottom: x.b + "px", width: x.w + "px", height: x.h + "px" });
  }
  function holoOpen(id){
    if (holoEl) holoEl.remove(); if (holoKey) { window.removeEventListener("keydown", holoKey, true); holoKey = null; }
    const b = $(".nb-holob", ed); if (b) b.setAttribute("aria-expanded", "true");
    holoEl = h("div", { class: "np-holo", role: "dialog", "aria-label": "Tags, links and source" });
    holoEl.innerHTML = `<div class="np-holo-h"><div class="np-holo-tabs" role="tablist">
        <button type="button" role="tab" data-t="tags" aria-disabled="true" title="Tags: coming soon">Tags<small>Soon</small></button>
        <button type="button" role="tab" data-t="links" aria-selected="true">Links</button>
        <button type="button" role="tab" data-t="source" aria-disabled="true" title="Source: coming soon">Source<small>Soon</small></button></div>
        <button type="button" class="np-holo-x" aria-label="Close">✕</button></div>
      <div class="np-holo-ck" role="group" aria-label="Which links to show"><label><input type="checkbox" data-ck="back"${HSHOW().back ? " checked" : ""}><span>Notes that link here</span></label><label><input type="checkbox" data-ck="out"${HSHOW().out ? " checked" : ""}><span>Links in this note</span></label></div>
      <div class="np-holo-bar"><span class="np-holo-lbl">Show as</span>${viewSwitch(viewOf("holoview") === "compact" ? "list" : viewOf("holoview"), "Show the links as", VIEWS.filter(v => v[0] !== "compact"))}</div>
      <div class="np-holo-b" role="tabpanel"></div>
      ${RZ}`;
    ed.appendChild(holoEl); holoFit(); holoDraw(id); indFit();
    $(".np-holo-bar .np-views", holoEl).addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (!b) return; store.set("holoview", b.dataset.view); holoEl.querySelectorAll(".np-holo-bar [data-view]").forEach(x => x.setAttribute("aria-checked", String(x === b))); holoDraw(NOTES.sel); });
    holoEl.querySelectorAll(".np-holo-ck input").forEach(c => c.onchange = () => { const v = HSHOW(); v[c.dataset.ck] = c.checked; store.set("holoshow", v); holoDraw(NOTES.sel); });
    $(".np-holo-x", holoEl).onclick = () => holoClose();
    holoEl.querySelectorAll('.np-holo-tabs [aria-disabled]').forEach(t => t.onclick = () => msg(`${t.dataset.t === "tags" ? "Tags" : "Source"} is coming soon.`));
    panelResize(holoEl, HOLO.box, () => { holoFit(); indFit(); }, "holobox");
    holoKey = e => { if (e.key === "Escape" && holoEl && !e.defaultPrevented && !(indEl && indEl.isConnected) && !peekEl && !document.querySelector(".tm-menu, .np-pop, .ask-ov")) { e.preventDefault(); e.stopPropagation(); holoClose(); } };
    window.addEventListener("keydown", holoKey, true);
  }
  // ◈ Links (v0.5.4, Devon): two boxes choose what is listed: the notes that link here, the links in this note (notepath.holoshow)
  function HSHOW(){ const v = store.get("holoshow", null); return v && typeof v === "object" ? { back: v.back !== false, out: v.out !== false } : { back: true, out: true }; }
  function holoDraw(id){
    if (!holoEl) return; const n = NS.get(id); if (!n) { holoClose(); return; }
    const all = NS.list(), folderName = x => { const f = x.folder && NS.folders().find(y => y.id === x.folder); return f ? f.name : "Unfiled"; };
    const fl = (() => { const o2 = []; String(n.html || "").replace(/data-folder="([a-z0-9]+)"/gi, (x, f) => { if (!o2.includes(f)) o2.push(f); return x; }); return o2.map(f => NS.folders().find(y => y.id === f) || null); })();
    const out = linksOf(n.html).filter(x => x !== id), back = all.filter(x => x.id !== id && linksOf(x.html).includes(id));
    const view = viewOf("holoview"), side = x => `<button type="button" class="np-hl-s np-hl-pk" data-peek="${x.id}" title="Peek: see ${esc(x.title)} in a small box" aria-label="Peek at ${esc(x.title)}">👁</button><button type="button" class="np-hl-s" data-side="${x.id}" title="Open ${esc(x.title)} in a new note tab (side by side)" aria-label="Open ${esc(x.title)} side by side">⧉</button>`;
    const row = (x, gone) => gone ? `<li class="np-hl gone"><span class="np-hl-t">A deleted note</span><span class="np-hl-f">its link stays in the text</span></li>`
      : view === "icons" ? `<li class="np-hl np-hl-tile"><button type="button" class="np-hl-o" data-id="${x.id}" title="Open ${esc(x.title)} · ${esc(noteKind(x))}"><span class="nb-tic">${NOTE_IC}</span><span class="np-hl-t">${x.fav ? "★ " : ""}${esc(x.title)}</span></button>${side(x)}</li>`
      : view === "details" ? `<li class="np-hl np-hl-row"><button type="button" class="np-hl-o" data-id="${x.id}" title="Open ${esc(x.title)}"><span class="np-hl-t">${x.fav ? "★ " : ""}${esc(x.title)}</span><span class="np-hl-d num">${esc(stampShort(x.updated))}</span><span class="np-hl-d num">${esc(stampShort(x.created))}</span><span class="np-hl-d">${esc(noteKind(x))}</span></button>${side(x)}</li>`
      : `<li class="np-hl"><button type="button" class="np-hl-o" data-id="${x.id}" title="Open ${esc(x.title)}"><span class="np-hl-t">${x.fav ? "★ " : ""}${esc(x.title)}</span><span class="np-hl-f">${esc(folderName(x))} · ${esc(when(x.updated))}</span></button>${side(x)}</li>`;
    const head = view === "details" ? `<div class="np-hl-head" aria-hidden="true"><span>Name</span><span>Modified</span><span>Created</span><span>Kind</span><span></span></div>` : "";
    const lst = arr => `<ul class="np-hl-list" data-view="${view}">${head}${arr.join("")}</ul>`;
    const SH = HSHOW();
    $(".np-holo-b", holoEl).innerHTML = (SH.back ? `<section data-sec="back"><h4>Notes that link here <span class="num">${back.length}</span></h4>${back.length ? lst(back.map(x => row(x))) : `<p class="np-hl-none">No other note links to this one yet.</p>`}</section>` : "")
      + (SH.out ? `<section data-sec="out"><h4>Links in this note <span class="num">${out.length}</span></h4>${out.length ? lst(out.map(k => row(NS.get(k), !NS.get(k)))) : `<p class="np-hl-none">No links yet. Drag a note in from the side bar, or select words and right-click → Link to a note.</p>`}</section>` : "")
      + (!SH.back && !SH.out ? `<p class="np-hl-none">Tick a box above to list the notes that link here or the links in this note.</p>` : "")
      + (fl.length ? `<section><h4>Folders in this note <span class="num">${fl.length}</span></h4><ul class="np-hl-list">${fl.map(f => f ? `<li class="np-hl"><button type="button" class="np-hl-o" data-fid="${f.id}" title="Open the folder ${esc(f.name)}"><span class="np-hl-t">▤ ${esc(f.name)}</span><span class="np-hl-f">${all.filter(x => NS.subtree(f.id).has(x.folder)).length} notes</span></button></li>` : `<li class="np-hl gone"><span class="np-hl-t">A deleted folder</span></li>`).join("")}</ul></section>` : "");
    holoEl.querySelectorAll("[data-fid]").forEach(b2 => b2.onclick = () => openFolderLink(b2.dataset.fid));
    holoEl.querySelectorAll(".np-hl-o").forEach(b2 => b2.onclick = () => openLinked(b2.dataset.id));
    holoEl.querySelectorAll(".np-hl-s[data-side]").forEach(b2 => b2.onclick = () => openFromLink(b2.dataset.side));
    holoEl.querySelectorAll(".np-hl-pk").forEach(b2 => b2.onclick = () => peekOpen(b2.dataset.peek));
  }
  const onHolo = () => { if (holoEl && NOTES.sel) holoDraw(NOTES.sel); if (indEl && NOTES.sel && !IND.edit) indDraw(NOTES.sel); }; window.addEventListener("inquire:notes-changed", onHolo);
  const onHoloRz = () => { holoFit(); indFit(); }; window.addEventListener("resize", onHoloRz);
  m.cleanup.push(() => { window.removeEventListener("inquire:notes-changed", onHolo); window.removeEventListener("resize", onHoloRz); if (holoKey) window.removeEventListener("keydown", holoKey, true); if (indKey) window.removeEventListener("keydown", indKey, true); });

  /* ----- 👁 Peek (v0.5.4, Devon): a small note box, after Inquire's floating Notes box (docked bottom right; drag the header
     to float it anywhere, ⇲ or a double-click on the header docks it, ✕ or Esc closes it). It shows the note a link goes to,
     read only; a link inside it peeks that note (‹ goes back); Open / ⧉ Side by side take it into the editor. Opened from
     👁 in ◈ Links or Peek on a link's right-click menu. Place in notepath.peek = { float, x, y }. ----- */
  let peekEl = null, peekKey = null, peekTrail = [];
  const PEEK = store.get("peek", { float: false, x: 0, y: 0 });
  function peekPlace(){
    if (!peekEl) return;
    const phone = matchMedia("(max-width:760px)").matches, fl = PEEK.float && !phone;
    peekEl.classList.toggle("docked", !fl); peekEl.classList.toggle("floating", fl);
    if (fl) { const w = peekEl.offsetWidth || 360; PEEK.x = Math.round(Math.max(120 - w, Math.min(innerWidth - 120, PEEK.x))); PEEK.y = Math.round(Math.max(0, Math.min(innerHeight - 44, PEEK.y))); peekEl.style.left = PEEK.x + "px"; peekEl.style.top = PEEK.y + "px"; peekEl.style.right = peekEl.style.bottom = ""; return; }
    peekEl.style.left = peekEl.style.top = "";
    const hr = holoEl && holoEl.isConnected ? holoEl.getBoundingClientRect() : null; // docked: left of the ◈ Links box when it is open
    peekEl.style.right = (hr && !phone ? Math.max(16, innerWidth - hr.left + 12) : 16) + "px"; peekEl.style.bottom = "16px";
  }
  function peekClose(){ if (!peekEl) return; const el = peekEl; peekEl = null; peekTrail = []; el.classList.remove("is-open"); setTimeout(() => el.remove(), 220); if (peekKey) { window.removeEventListener("keydown", peekKey, true); peekKey = null; } }
  function peekDraw(){
    if (!peekEl) return; const id = peekTrail[peekTrail.length - 1], n = id && ALLNS.get(id);
    const body = $(".np-peek-b", peekEl), back = $(".np-peek-back", peekEl);
    back.hidden = peekTrail.length < 2;
    if (!n) { $(".np-peek-t", peekEl).textContent = "A deleted note"; $(".np-peek-m", peekEl).textContent = ""; body.innerHTML = `<p class="np-hl-none">That note was deleted. Its link stays in the text.</p>`; peekEl.querySelectorAll(".np-peek-f button").forEach(b => b.disabled = true); return; }
    peekEl.querySelectorAll(".np-peek-f button").forEach(b => b.disabled = false);
    const f = n.folder && ALLNS.folders(ALLNS.spaceOf(n)).find(x => x.id === n.folder);
    $(".np-peek-t", peekEl).textContent = n.title;
    $(".np-peek-m", peekEl).textContent = (f ? f.name : "Unfiled") + " · edited " + stampShort(n.updated);
    if (n.space === "code") { body.innerHTML = `<pre class="np-peek-code"></pre>`; body.firstChild.textContent = (n.code && n.code.src) || ""; return; }
    const t = document.createElement("template"); t.innerHTML = ALLNS.sanitize(n.html || "");
    t.content.querySelectorAll("div.nw").forEach(w => { const k = w.getAttribute("data-w"); const p = document.createElement("div"); p.className = "np-peek-w"; p.textContent = "▦ " + ({ code: "Code box", music: "Music chart", sheet: "Lead sheet", graph: "Graph", video: "Video" }[k] || "Widget") + " · open the note to see it"; w.replaceWith(p); });
    t.content.querySelectorAll("span[data-ann]").forEach(sp => sp.removeAttribute("data-ann"));
    body.innerHTML = ""; body.appendChild(t.content);
    if (!body.textContent.trim() && !body.querySelector("img")) body.innerHTML = `<p class="np-hl-none">This note is empty.</p>`;
    body.querySelectorAll("img[data-img]").forEach(im => ALLNS.imageURL(im.dataset.img).then(u => { if (u) im.src = u; }));
    body.querySelectorAll("a.nlink[data-note]").forEach(a => { a.href = "#"; a.title = "Peek at " + a.textContent; a.onclick = e => { e.preventDefault(); peekTrail.push(a.dataset.note); peekDraw(); }; });
    body.querySelectorAll("a.nlink[data-folder]").forEach(a => { a.onclick = e => { e.preventDefault(); openFolderLink(a.dataset.folder); }; });
  }
  function peekOpen(id){
    if (!id) return;
    if (!peekEl) {
      peekEl = h("section", { class: "np-peek win", role: "dialog", "aria-label": "Peek at a note" });
      peekEl.innerHTML = `<header class="np-peek-h" title="Drag to move · double-click to dock"><button type="button" class="np-peek-x np-peek-back" title="Back to the note before" aria-label="Back" hidden>‹</button><div class="np-peek-tt"><span class="np-peek-gem" aria-hidden="true"></span>Peek</div><span class="np-peek-grip" aria-hidden="true">⠿</span>
        <div class="np-peek-hr"><button type="button" class="np-peek-x np-peek-home" title="Dock at the bottom right" aria-label="Dock at the bottom right">⇲</button><button type="button" class="np-peek-x np-peek-close" title="Close" aria-label="Close">✕</button></div></header>
        <div class="np-peek-in"><h3 class="np-peek-t"></h3><p class="np-peek-m num"></p><div class="np-peek-b nb-rich" tabindex="0"></div></div>
        <div class="np-peek-f"><button type="button" class="btn-s" data-a="open" title="Open it in place of this note">↗ Open</button><button type="button" class="btn-s" data-a="side" title="Open it side by side with this note">⧉ Side by side</button></div>`;
      document.body.appendChild(peekEl);
      const hd = $(".np-peek-h", peekEl);
      $(".np-peek-close", peekEl).onclick = () => peekClose();
      $(".np-peek-home", peekEl).onclick = () => { PEEK.float = false; store.set("peek", PEEK); peekPlace(); };
      $(".np-peek-back", peekEl).onclick = () => { if (peekTrail.length > 1) { peekTrail.pop(); peekDraw(); } };
      hd.addEventListener("dblclick", e => { if (!e.target.closest("button")) { PEEK.float = false; store.set("peek", PEEK); peekPlace(); } });
      hd.addEventListener("pointerdown", e => {
        if (e.button !== 0 || e.target.closest("button") || matchMedia("(max-width:760px)").matches) return; e.preventDefault();
        const r = peekEl.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; hd.setPointerCapture(e.pointerId); peekEl.classList.add("dragging");
        PEEK.float = true; PEEK.x = r.left; PEEK.y = r.top; peekPlace();
        const mv = ev => { PEEK.x = ev.clientX - dx; PEEK.y = ev.clientY - dy; peekPlace(); };
        const up = () => { peekEl && peekEl.classList.remove("dragging"); hd.removeEventListener("pointermove", mv); hd.removeEventListener("pointerup", up); hd.removeEventListener("pointercancel", up); store.set("peek", PEEK); };
        hd.addEventListener("pointermove", mv); hd.addEventListener("pointerup", up); hd.addEventListener("pointercancel", up);
      });
      peekEl.querySelector('[data-a="open"]').onclick = () => { const x = peekTrail[peekTrail.length - 1]; peekClose(); openLinked(x); };
      peekEl.querySelector('[data-a="side"]').onclick = () => { const x = peekTrail[peekTrail.length - 1]; peekClose(); openFromLink(x); };
      peekKey = e => { if (e.key === "Escape" && peekEl && !document.querySelector(".tm-menu, .np-pop, .ask-ov")) { e.preventDefault(); e.stopPropagation(); peekClose(); } };
      window.addEventListener("keydown", peekKey, true);
      peekTrail = [id]; peekDraw(); peekPlace(); void peekEl.offsetWidth; peekEl.classList.add("is-open");
    } else { peekTrail = [id]; peekDraw(); peekPlace(); }
    setTimeout(() => { const b = peekEl && $(".np-peek-close", peekEl); if (b) b.focus({ preventScroll: true }); }, 30);
  }
  const onPeek = () => { if (peekEl) peekDraw(); }; window.addEventListener("inquire:notes-changed", onPeek);
  const onPeekRz = () => peekPlace(); window.addEventListener("resize", onPeekRz);
  m.cleanup.push(() => { window.removeEventListener("inquire:notes-changed", onPeek); window.removeEventListener("resize", onPeekRz); peekClose(); });
  // a folder link: show that folder (its notes in the list); the open note stays
  function openFolderLink(fid){ if (!NS.folders().some(f => f.id === fid)) return; flushEd(); NOTES.folder = fid; NOTES.q = ""; q.value = ""; drawAll(); }
  // a note link clicked in either pane opens in the main pane
  function openLinked(id){ flushEd(); NOTES.sel = id; const m = NS.get(id); if (m && !inView(m)) NOTES.folder = "all"; drawAll(); }

  /* ----- a second note side by side (dropped on ⧉); ▁ minimises it to a tab above the editor, ⤢ brings it back ----- */
  const SPLIT = NOTES.split || (NOTES.split = { id: null, min: false }); // one per tab
  let rich2 = null, save2 = null;
  function flush2(){ if (rich2) rich2.flush(); if (save2) { clearTimeout(save2); save2 = null; const ti = $(".nb-title", ed2); if (ti && SPLIT.id && NS.get(SPLIT.id)) NS.update(SPLIT.id, { title: ti.value.trim() || "Untitled note" }); } }
  function drawSplit(){
    if (rich2) { rich2.destroy(); rich2 = null; }
    const n = SPLIT.id && NS.get(SPLIT.id);
    if (!n) { SPLIT.id = null; SPLIT.min = false; }
    const show = !!n && !SPLIT.min;
    ed2.hidden = !show; edSec.classList.toggle("split", show);
    tabs.hidden = !(n && SPLIT.min);
    tabs.innerHTML = n && SPLIT.min ? `<div class="nb-tab"><button type="button" class="nb-tab-t" data-a="max" title="Bring ${esc(n.title)} back beside this note">▣ <span>${esc(n.title)}</span></button><button type="button" class="nb-tab-b" data-a="max" title="Maximise: open it side by side again" aria-label="Maximise ${esc(n.title)}">⤢</button><button type="button" class="nb-tab-b" data-a="close" title="Close" aria-label="Close ${esc(n.title)}">✕</button></div>` : "";
    tabs.querySelectorAll('[data-a="max"]').forEach(b => b.onclick = () => { SPLIT.min = false; drawSplit(); });
    const tx = $('[data-a="close"]', tabs); if (tx) tx.onclick = () => closeSplit();
    ed2.classList.remove("nc-pane");
    if (!show) { ed2.innerHTML = ""; return; }
    if (CODE) {
      ed2.innerHTML = `<div class="nb-p2h"><span class="nb-p2tag">Side by side</span><button type="button" class="btn-s" data-a="swap" title="Make this the main file">Open as main</button><button type="button" class="nb-p2b" data-a="min" title="Minimise to a tab" aria-label="Minimise to a tab">▁</button><button type="button" class="nb-p2b" data-a="close" title="Close this file" aria-label="Close the side file">✕</button></div><div class="nb-p2body"></div>`;
      rich2 = NPCode.pane($(".nb-p2body", ed2), n, { NS, main: false, msg, onSaved: () => drawList(), onTitle: () => { drawList(); drawFolders(); }, openSide: id => { drawFolders(); drawList(); openSplit(id); } });
      $('[data-a="min"]', ed2).onclick = () => { flush2(); SPLIT.min = true; drawSplit(); };
      $('[data-a="close"]', ed2).onclick = () => closeSplit();
      $('[data-a="swap"]', ed2).onclick = () => { flushEd(); const a = NOTES.sel; NOTES.sel = n.id; SPLIT.id = a && a !== n.id ? a : null; drawAll(); };
      return;
    }
    ed2.innerHTML = `<div class="nb-p2h"><span class="nb-p2tag">Side by side</span><button type="button" class="btn-s" data-a="swap" title="Make this the main note">Open as main</button><button type="button" class="nb-p2b" data-a="min" title="Minimise to a tab" aria-label="Minimise to a tab">▁</button><button type="button" class="nb-p2b" data-a="close" title="Close this note" aria-label="Close the side note">✕</button></div>
      <div class="nb-trow"><input class="nb-title" value="${esc(n.title)}" aria-label="Title of the side note" maxlength="140"></div><div class="nb-host"></div>`;
    rich2 = NS.mountEditor($(".nb-host", ed2), n.id, { openNote: id => openLinked(id), openSide: id => openFromLink(id), peek: id => peekOpen(id), openFolder: fid => openFolderLink(fid), onMessage: msg, onSaved: () => drawList(), annotations: store.get("indshow", true) !== false });
    const ti = $(".nb-title", ed2);
    ti.oninput = () => { clearTimeout(save2); save2 = setTimeout(() => { save2 = null; NS.update(n.id, { title: ti.value.trim() || "Untitled note" }); drawList(); drawFolders(); }, 400); };
    $('[data-a="min"]', ed2).onclick = () => { flush2(); SPLIT.min = true; drawSplit(); };
    $('[data-a="close"]', ed2).onclick = () => closeSplit();
    $('[data-a="swap"]', ed2).onclick = () => { flushEd(); const a = NOTES.sel; NOTES.sel = n.id; SPLIT.id = a && a !== n.id ? a : null; drawAll(); };
  }
  // right-click a note link → "Open in a new note tab": the note opens in the side-by-side box (textmenu.js)
  function openFromLink(id){
    if (!NS.get(id)) return;
    if (id === NOTES.sel) { msg("That note is already open."); return; }
    if (id === SPLIT.id) { if (SPLIT.min) { SPLIT.min = false; drawSplit(); } return; }
    flushEd(); openSplit(id); drawList();
  }
  function openSplit(id){ if (!id || id === NOTES.sel) return; flush2(); SPLIT.id = id; SPLIT.min = false; drawSplit(); }
  function closeSplit(quiet){ flush2(); if (rich2) { rich2.destroy(); rich2 = null; } SPLIT.id = null; SPLIT.min = false; if (!quiet) drawSplit(); else { ed2.hidden = true; ed2.innerHTML = ""; tabs.hidden = true; tabs.innerHTML = ""; edSec.classList.remove("split"); } }

  /* ----- dragging a note (from the list or a folder): into a note = a link to it; onto ⧉ = open it side by side ----- */
  let dcaret = null;
  const hideCaret = () => { if (dcaret) { dcaret.remove(); dcaret = null; } };
  function noteDragStart(e, id, el){
    DRAG = { type: "note", id }; e.dataTransfer.setData("text/x-note", id); e.dataTransfer.effectAllowed = "copyMove"; el.classList.add("dragging");
    nbEl.classList.add("dragnote"); nbEl.classList.toggle("dragself", id === NOTES.sel); // the open note itself can only be linked from the side note
  }
  function noteDragEnd(el){ DRAG = null; el.classList.remove("dragging"); clearDrop(); nbEl.classList.remove("dragnote"); edSec.querySelectorAll(".nb-split.over").forEach(x => x.classList.remove("over")); hideCaret(); }
  const dropTarget = e => {
    if (DRAG && DRAG.type === "code") { // a code file from the Code section: a code box (a copy) in the note
      const re = e.target.closest && e.target.closest(".nb-rich"); if (!re || e.target.closest(".nw")) return null;
      const api = NS.editorFor(re); return api ? { kind: "code", api, re } : null;
    }
    if (DRAG && DRAG.type === "folder" && !CODE) { // a folder: a link to it in the note
      const re = e.target.closest && e.target.closest(".nb-rich"); if (!re || e.target.closest(".nw")) return null;
      const api = NS.editorFor(re); return api ? { kind: "flink", api, re } : null;
    }
    if (!DRAG || DRAG.type !== "note") return null;
    const sp = e.target.closest && e.target.closest(".p1 .nb-split"); if (sp) return DRAG.id === NOTES.sel ? null : { kind: "split", el: sp };
    const re = e.target.closest && e.target.closest(".nb-rich"); if (!re || e.target.closest(".nw")) return null;
    const api = NS.editorFor(re); if (!api || api.id === DRAG.id) return null;
    return { kind: "link", api, re };
  };
  edSec.addEventListener("dragover", e => {
    const t = dropTarget(e); edSec.querySelectorAll(".nb-split.over").forEach(x => { if (!t || x !== t.el) x.classList.remove("over"); });
    if (!t) { hideCaret(); return; }
    e.preventDefault(); e.dataTransfer.dropEffect = "copy"; // must be one of the drag's effectAllowed ("copyMove" / "copy") or a real drop never happens
    if (t.kind === "split") { t.el.classList.add("over"); hideCaret(); return; }
    const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY), rc = r && t.re.contains(r.startContainer) ? r.getBoundingClientRect() : null;
    if (!dcaret) { dcaret = h("div", { class: "nb-dcaret" }); document.body.appendChild(dcaret); }
    const lh = rc && rc.height ? rc.height : 20;
    dcaret.style.left = (rc && (rc.left || rc.top) ? rc.left : e.clientX) + "px"; dcaret.style.top = (rc && (rc.left || rc.top) ? rc.top : e.clientY - lh / 2) + "px"; dcaret.style.height = lh + "px";
  });
  edSec.addEventListener("dragleave", e => { if (!edSec.contains(e.relatedTarget)) { hideCaret(); edSec.querySelectorAll(".nb-split.over").forEach(x => x.classList.remove("over")); } });
  edSec.addEventListener("drop", e => {
    const t = dropTarget(e); hideCaret(); if (!t) return; e.preventDefault(); e.stopPropagation();
    const id = DRAG.id; nbEl.classList.remove("dragnote", "dragcode");
    if (t.kind === "split") { openSplit(id); return; }
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (t.kind === "code") { const c = ALLNS.get(id); if (c && c.code) { t.api.insertWidgetAt(r, "code", codeBox(c)); msg(`Added a copy of “${c.title}”. The original stays in Code.`); } return; }
    if (t.kind === "flink") { t.api.insertFolderLink(r, id); return; }
    t.api.insertNoteLink(r, id);
  });

  function drawAll(focusBody){ drawFolders(); drawList(); drawEd(focusBody); drawSplit(); }
  m.redraw = drawAll;
  drawAll(focusBody); paintHist();
  m.cleanup.push(() => { flushEd(); if (rich) { rich.destroy(); rich = null; } if (rich2) { rich2.destroy(); rich2 = null; } hideCaret(); });
}

/* ---------- desktop shell (only inside the NotePath app) ---------- */
let DESK_VERSION = "";
if (window.inquireDesktop) {
  const D = window.inquireDesktop;
  document.documentElement.classList.add("desktop", "os-" + D.platform);
  if (D.onRoute) D.onRoute(r => { if (r && r.note) return openNoteLink(r.note); if (r && r.view) go(r); }); // tray menu: Open My Tasks, the next reminder
  D.version().then(v => { DESK_VERSION = v; const el = document.querySelector("#verline .num"); if (el) el.textContent = "v" + v; });
  const bar = $("#upd");
  let hideT = null;
  D.onUpdate(s => {
    clearTimeout(hideT);
    const v = s.version ? esc(s.version) : "";
    let html = "", keep = true;
    if (s.status === "downloading") html = `<span class="dot"></span>Downloading NotePath ${v}… <span class="num">${s.percent || 0}%</span>`;
    else if (s.status === "ready") html = `<span class="dot"></span>NotePath ${v} is ready.<button type="button" class="btn good" id="upd-go">Install &amp; Relaunch</button><button type="button" class="btn-s" id="upd-x">Later</button>`;
    else if (s.status === "installing") html = `<span class="dot"></span>Installing NotePath ${v}…`;
    else if (s.status === "installed") { html = `<span class="dot"></span>Updated to NotePath ${v}.`; keep = false; }
    else if (s.status === "blocked") html = `<span class="dot"></span>macOS blocked the update. NotePath ${v} is in your Downloads folder: drag it into Applications and replace the old copy.<button type="button" class="btn-s" id="upd-rev">Show in Finder</button><button type="button" class="btn-s" id="upd-x">Dismiss</button>`;
    else if (s.status === "error" && s.message) html = `<span class="dot err"></span>Update problem: ${esc(s.message)}<button type="button" class="btn-s" id="upd-x">Dismiss</button>`;
    bar.hidden = !html; bar.innerHTML = html;
    const g = $("#upd-go"); if (g) g.onclick = () => { g.disabled = true; D.installUpdate(); };
    const x = $("#upd-x"); if (x) x.onclick = () => { bar.hidden = true; };
    const rv = $("#upd-rev"); if (rv) rv.onclick = () => D.revealUpdate();
    if (!keep) hideT = setTimeout(() => bar.hidden = true, 6000);
  });
}

/* ---------- hooks for settings.js and textmenu.js ---------- */
window.InquireApp = {
  noteLink, openNoteLink, coverButton,
  context(){ return { view: S.view }; },
  openNotes: id => go({ view: "notes", space: "notes", folder: "all", sel: id || null }),
  newNote,
  modal: modalWin, closeWin: id => { if (id) { if (MW[id]) MW[id].close(); } else closeWins(); }, openWin: () => {}, winOpen: id => (id ? !!MW[id] : Object.keys(MW).length > 0),
  go: v => go(v), askText,
  // keyboard shortcuts (Settings → Shortcuts)
  shortcut(name){
    if (name === "menu") return go({ view: "menu" });
    if (name === "notes") return go({ view: S.view === "notes" ? "menu" : "notes" });
    if (name === "newnote") return S.view === "notes" && NPAGE && NPAGE.newNote ? NPAGE.newNote() : S.view === "tasks" && TPAGE ? TPAGE.newNote() : newNote();
    if (name === "tasks") return go({ view: S.view === "tasks" ? "menu" : "tasks" });
    if (name === "favs") return go({ view: "notes", space: "notes", folder: "fav" });
    if (name === "back") { const ob = Object.values(MW).find(w => w.ov.querySelector(".np-back")); if (ob) return ob.ov.querySelector(".np-back").click(); if (Object.keys(MW).length) return closeWins(); if (S.view !== "menu" || NAV.length > 1) return goBack(); }
  }
};

/* ---------- boot ---------- */
$("#brand").onclick = () => go({ view: "menu" });
// NotePath opens on the start menu; #notes / #favourites open the My notes page.
const initial = fromHash();
render();
try { history.replaceState({ view: "menu" }, "", "#menu"); } catch(e){}
if (initial && initial.view === "notes") go(initial, false);
})();
