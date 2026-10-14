/* NotePath app shell: the start menu, the My notes page and the desktop chrome (update banner, version line).
   The notes window (renderNotes) and its helpers are Inquire's (web/src/app.js in codex-desktop), minus the links to
   subjects, fields and lessons, which NotePath does not have. Notes engine: notes.js; toolbar + widgets: notes-widgets.js;
   right-click menu: textmenu.js; Settings: settings.js. */
(function(){
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const h = (tag, attrs={}, html) => { const e = document.createElement(tag); for (const k in attrs) { if (k === "class") e.className = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// dates on rows (v0.5.6: the formatters are made once and the text is kept per minute: making them for every row of a long
// list was the slowest part of drawing it)
const FMT = { t: new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }), d: new Intl.DateTimeFormat([], { month: "short", day: "numeric" }), dy: new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" }),
  s: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), sy: new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) };
const WHEN = new Map();
const when = ms => { const now = new Date(), k = Math.floor(ms / 60000) + "|" + now.toDateString(); let v = WHEN.get(k); if (v) return v; const d = new Date(ms);
  v = d.toDateString() === now.toDateString() ? FMT.t.format(d) : (d.getFullYear() === now.getFullYear() ? FMT.d : FMT.dy).format(d); if (WHEN.size > 20000) WHEN.clear(); WHEN.set(k, v); return v; };

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
    <header role="group" class="set-h mw-h">${o.back ? `<button type="button" class="np-back" data-a="back" title="Back to the Main Menu" aria-label="Back to the Main Menu"><span aria-hidden="true">‹</span> Back</button>` : ""}<span class="dot"></span><h2 id="mw-t-${id}">${esc(o.title || "")}</h2>${o.sub ? `<span class="mw-sub">${o.sub}</span>` : ""}<span class="mw-hx"></span>${o.back ? "" : `<button type="button" class="set-x" aria-label="Close ${esc(o.title || "window")}">✕</button>`}</header>
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
/* "What's new in 0.5.6" (Devon): a small card the first time My notes opens after the update; Got it (or Esc) and it never
   comes back (store "seen056") */
function whatsNew(pg){
  if (document.querySelector(".np-new")) return;
  const c = h("div", { class: "np-new win", role: "dialog", "aria-label": "What's new in NotePath 0.5.6" });
  c.innerHTML = `<div class="np-new-h">What's new in NotePath 0.5.6</div><ul>
    <li><b>Safe and quick with any number of notes.</b> “Saved ✓” beside the star shows when your note is on this computer.</li>
    <li><b>All notes · Favourites · Unfiled</b> now filter the Folders &amp; Files bar, and folders follow Show as.</li>
    <li><b>◀ Hide</b> folds a side bar into a strip; click the strip to bring it back.</li>
    <li><b>✦ AI Chat</b> and <b>A✓ Grammar check</b> at the bottom right; right-click words → <b>Ask AI…</b></li>
    <li><b>Map</b> widget; the <b>Code box</b> highlights lines, compares before / after, presents ⤢ and copies as a picture.</li>
    <li><b>Share</b> → Email, Email with a PDF and Print.</li></ul>
    <div class="np-new-f"><button type="button" class="np-newb np-new-ok">Got it</button></div>`;
  pg.appendChild(c);
  const done = () => { store.set("seen056", true); c.remove(); window.removeEventListener("keydown", key, true); };
  const key = e => { if (e.key === "Escape" && c.isConnected) { e.preventDefault(); e.stopImmediatePropagation(); done(); } };
  $(".np-new-ok", c).onclick = done; window.addEventListener("keydown", key, true);
  $(".np-new-ok", c).focus({ preventScroll: true });
}
function renderNotesPage(o = {}){
  if (o.space === "notes" || o.space === "code") { SPACE = o.space; store.set("nspace", SPACE); }
  const ST = SPACES[SPACE];
  if (o.folder) { ST.folder = o.folder; ST.q = ""; }
  if (o.sel) ST.sel = o.sel;
  const pg = h("div", { class: "npage" });
  pg.innerHTML = `<div class="np-wrap"><section class="np-win win" aria-labelledby="np-t">
    <header role="group" class="set-h mw-h"><button type="button" class="np-back" data-a="back" title="Back to the Main Menu" aria-label="Back to the Main Menu"><span aria-hidden="true">‹</span> Back</button><span class="dot"></span><h2 id="np-t" aria-level="1">My notes</h2><span class="mw-sub"></span><span class="mw-hx"></span></header>
    <div class="nb-info" role="status" aria-live="polite"></div>
    <div class="mw-body"></div></section></div>`;
  viewEl.appendChild(pg);
  $(".np-back", pg).onclick = () => goBack();
  const m = { body: $(".mw-body", pg), head: $(".mw-hx", pg), info: $(".nb-info", pg), cleanup: [] };
  if (SPACE === "notes" && !store.get("seen056", false)) setTimeout(() => { if (pg.isConnected) whatsNew(pg); }, 350);
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
    <header role="group" class="set-h mw-h"><button type="button" class="np-back" data-a="back" title="Back to the Main Menu" aria-label="Back to the Main Menu"><span aria-hidden="true">‹</span> Back</button><span class="dot"></span><h2 id="nt-t" aria-level="1">My Tasks</h2><span class="mw-sub">Saved on this computer. Reminders show as notifications while NotePath is running.</span><span class="mw-hx"></span></header>
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
const folderLink = id => "notepath://folder/" + id; // (v0.5.8) right-click a folder → Copy link
function openFolderLinkTo(id){
  const NS = window.InquireNotes, f = NS && NS.scope("code").folders().concat(NS.folders()).find(x => x.id === id);
  if (!f) { toastMsg("That folder is not on this computer.", 6000); return; }
  go({ view: "notes", space: f.space === "code" ? "code" : "notes", folder: id });
}
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
    <div class="np-pop-sub">Email &amp; print</div>
    <div class="np-shs np-shmail">
      <button type="button" role="menuitem" data-s="mail"${dis}><span class="np-shi" aria-hidden="true">✉</span><span><b>Email</b><small>Opens your mail app with a new message: the title as the subject, the note's words in it.</small></span></button>
      <button type="button" role="menuitem" data-s="mailpdf"${dis}><span class="np-shi" aria-hidden="true">✉</span><span><b>Email with a PDF</b><small>Also makes a PDF of the note and shows it, ready to drag into the message.</small></span></button>
      <button type="button" role="menuitem" data-s="print"${dis}><span class="np-shi" aria-hidden="true">⎙</span><span><b>Print…</b><small>The note as a clean page, on paper or as a PDF.</small></span></button>
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
    if ((s === "mail" || s === "mailpdf" || s === "print") && window.NPIO) { // v0.5.6 (Devon): Email and Print
      try {
        if (s === "print") { await NPIO.printNote(cur.id); toastMsg("The print window is open."); return; }
        const r = await NPIO.email(cur.id, { pdf: s === "mailpdf" });
        toastMsg(r.printed ? "The print window is open: choose Save as PDF, then attach the file to your email." : r.file ? `A new email is open, and “${r.file}” is ${r.where ? "in Downloads › NotePath (the folder is open)" : "in your downloads"}: drag it into the message.` : "A new email is open in your mail app.", 6000);
      } catch (err) { toastMsg(String(err && err.message || err)); }
      return;
    }
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
      <header role="group" class="win-h npn-h"><span class="dot"></span><span id="npn-t">Notes</span><span class="npn-count num"></span></header>
      <div class="slots npn-acts">
        <button type="button" class="slot big" data-a="open"><span class="glyph">▤</span><span><h3 aria-level="2">My notes</h3><p>Every note, folder and photo, with search and your own order. Start a new note there with ＋ New Note.</p></span><span class="tag num" data-n="all"></span></button>
        <button type="button" class="slot big npn-tasks" data-a="tasks"><span class="glyph">☑</span><span><h3 aria-level="2">My Tasks</h3><p>To-dos with priorities, due dates and reminders, places on a map, photos and files.</p></span><span class="tag num" data-n="tasks"></span></button>
        <button type="button" class="slot big npn-code" data-a="code"><span class="glyph">&lt;/&gt;</span><span><h3 aria-level="2">My Code</h3><p>Code files in Python, C, C++, JavaScript and Java, with their own folders. ▶ Run them right here.</p></span><span class="tag num" data-n="code"></span></button>
        <button type="button" class="slot big locked npn-soon npn-music" aria-disabled="true" tabindex="-1"><span class="glyph">𝄞</span><span><h3 aria-level="2">My Music</h3><p>Coming soon</p></span></button>
        <button type="button" class="slot big npn-office" data-a="office"><span class="glyph">⌂</span><span><h3 aria-level="2">Note Office</h3><p>Your notes as a little office: a sheet for every note, a box for every folder. Someone works there.</p></span></button>
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
    /* v0.5.6 (Devon): big, labelled and never in the way. Folded, a bar becomes a full-height strip (.nb-fold) that is one
       big "show" button with the bar's name down it; open, the bar has its own labelled ◀ Hide button (.nb-hide) */
    nb.querySelectorAll(".nb-fold").forEach(b => {
      const shut = !!fold[b.dataset.p], what = b.dataset.p === "f" ? "Folders & Files" : "Tool bar";
      b.innerHTML = `<span class="nb-foldi" aria-hidden="true">▶</span><span class="nb-foldl">${b.dataset.p === "f" ? "Folders &amp; Files" : "Tools"}</span>`; b.title = "Show the " + what; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!shut)); b.hidden = !shut;
    });
    nb.querySelectorAll(".nb-hide").forEach(b => { b.setAttribute("aria-expanded", String(!fold[b.dataset.p])); });
    const w = W0(); if (w) nb.style.setProperty("--nb-lw-user", w + "px"); else nb.style.removeProperty("--nb-lw-user");
    const fw = store.get("nbfw", 0); if (fw) nb.style.setProperty("--nb-fw-user", fw + "px"); else nb.style.removeProperty("--nb-fw-user");
    if (matchMedia("(min-width:861px)").matches) { $(".nb-folders", nb).inert = !!fold.f; $(".nb-rail", nb).inert = !!fold.l; }
  };
  nb.querySelectorAll(".nb-fold, .nb-hide").forEach(b => b.onclick = () => { const had = b === document.activeElement; fold[b.dataset.p] = !fold[b.dataset.p]; store.set("nbfold", fold); paint();
    const back = $(fold[b.dataset.p] ? `.nb-fold[data-p="${b.dataset.p}"]` : `.nb-hide[data-p="${b.dataset.p}"]`, nb); if (back && had) back.focus({ preventScroll: true }); }); // the focus follows to the control that undoes it
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
  const list = $(".nb-rail", nb), folders = $(".nb-folders", nb);
  sizer($(".nb-rzf", nb), folders, "nbfw", "--nb-fw-user", 180, 620, () => list);
  paint();
}

/* ---------- small dialog in the Settings style (the app behind fogs): askText({title, label, placeholder, value, ok, max}) → text | null
   With kinds: [{ k, glyph, name, desc }] it also asks which kind (cards above the field) → { text, kind } | null. ---------- */
function askText(o = {}){
  return new Promise(done => {
    document.querySelectorAll(".ask-ov").forEach(x => x.remove());
    const last = document.activeElement;
    const ov = h("div", { class: "ask-ov" }, `<form class="ask-win win" role="dialog" aria-modal="true" aria-labelledby="ask-t">
      <header role="group" class="set-h"><span class="dot"></span><h2 id="ask-t">${esc(o.title || "Name")}</h2><button type="button" class="set-x" data-x aria-label="Cancel">✕</button></header>
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
const stampShort = t => { if (!t) return "—"; const d = new Date(t); return (d.getFullYear() === new Date().getFullYear() ? FMT.s : FMT.sy).format(d); };
function noteKind(n){
  if (n.space === "code") { const l = window.NPCode ? NPCode.lang(n.code.lang) : null; return (l ? l.name : "Code") + " file"; }
  const h = String(n.html || "");
  if (/data-w="sheet"/.test(h)) return "Music chart"; if (/data-w="code"/.test(h)) return "Code note"; if (/data-w="music"/.test(h)) return "Music note";
  if (/data-w="graph"/.test(h)) return "Graph note"; if (/<ul data-ck/.test(h)) return "Checklist"; if (/data-img=|class="nimg"/.test(h) || /data-w="(video|audio)"/.test(h)) return "Note · media";
  return "Note";
}
/* (v0.5.8, Devon) the ✦ AI Chat button's figure: a holographic woman's head and shoulders made of coloured light (after his
   reference picture, without its halo rings), drawn in the theme's colour (var(--frame)) so it follows every theme. Ids are
   made per copy (the main note and the side-by-side note each draw one). */
let AIFIG_N = 0;
function aiFigure(){
  const k = "aif" + (++AIFIG_N), B = "M20 4C25.2 4 27.4 8 27.2 12.6c-.2 3.8-1.8 6.8-3.8 8.2l.3 5.2c3.6 1.6 8.6 3.4 11.3 8.4L36.6 40H3.4l1.6-5.6c2.7-5 7.7-6.8 11.3-8.4l.3-5.2c-2-1.4-3.6-4.4-3.8-8.2C12.6 8 14.8 4 20 4z";
  return `<svg class="nb-aifig" viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" focusable="false"><defs>`
    + `<linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset=".5" class="s1"/><stop offset=".95" class="s2"/></linearGradient>`
    + `<linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="e0"/><stop offset=".6" class="e1"/><stop offset="1" class="e2"/></linearGradient>`
    + `<radialGradient id="${k}r"><stop offset="0" class="c0"/><stop offset="1" class="c1"/></radialGradient>`
    + `<pattern id="${k}p" width="4" height="1.8" patternUnits="userSpaceOnUse"><rect width="4" height=".4" class="scan"/></pattern>`
    + `<clipPath id="${k}c"><path d="${B}"/></clipPath></defs>`
    + `<path class="body" fill="url(#${k}g)" stroke="url(#${k}s)" d="${B}"/>`
    + `<rect class="scans" x="0" y="-2" width="40" height="44" fill="url(#${k}p)" clip-path="url(#${k}c)"/>`
    + `<g class="hair"><path d="M20 3.2C13.2 3.2 10.8 8.6 11.2 13.8c.4 4.6 2 7.8 2.4 10.6.3 2.4-1.6 4.4-5 6"/><path d="M20 3.2c6.8 0 9.2 5.4 8.8 10.6-.4 4.6-2 7.8-2.4 10.6-.3 2.4 1.6 4.4 5 6"/><path class="thin" d="M12.4 9.4c-.8 3.6.2 7.4 2 10.6M27.6 9.4c.8 3.6-.2 7.4-2 10.6"/>`
    + `<path class="thin" d="M20 4.2c-3.6.4-5.6 2.8-6.2 5.8M20 4.2c3.6.4 5.6 2.8 6.2 5.8M18 4.5c-2 1.6-2.8 3.4-3 5M22 4.5c2 1.6 2.8 3.4 3 5M20 4v3.4"/></g>`
    + `<g class="face"><path d="M15.4 10.9q1.8-.8 3.4 0M21.2 10.9q1.8-.8 3.4 0"/><path class="eye" d="M15.6 12.8q1.7 1.1 3.3 0M21.1 12.8q1.7 1.1 3.3 0"/><path d="M20 13.6v2.4q-.5.5-.9.5"/><path class="lip" d="M18.3 18.2q1.7.9 3.4 0M18.3 18.2q.8-.5 1.7-.1.9-.4 1.7.1"/></g>`
    + `<g class="neck"><path d="M17.6 21.6v4.4M22.4 21.6v4.4M14.4 30.2q3 1.4 5.6.8M25.6 30.2q-3 1.4-5.6.8"/></g>`
    + `<circle cx="20" cy="4.2" r="3" fill="url(#${k}r)"/></svg>`;
}
const NOTE_IC = '<svg viewBox="0 0 24 28" width="30" height="34" aria-hidden="true"><path d="M3 2h12l6 6v18H3z" class="pg"/><path d="M15 2v6h6" class="fd"/><path d="M7 13h10M7 17h10M7 21h6" class="ln"/></svg>';
/* the Tool bar (v0.5.5, Devon; where the notes list was): tools that change what the note area is for. Note and Code now;
   Canvas, Note Trees and Spreadsheets come later (Coming soon). Fold it with its ◀ tab. */
const TOOLS = [["note", "✎", "Note", "Write: text, lists, photos and widgets"], // v0.5.6 (Devon): the Code tool is gone (My Code is on the Main Menu)
  ["canvas", '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M4.5 10.5l2.5-3 2 2 1.5-1.5 1.5 2.5"/></svg>', "Canvas", ""],
  ["trees", '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="3.5" r="1.6"/><circle cx="3.5" cy="12.5" r="1.6"/><circle cx="12.5" cy="12.5" r="1.6"/><path d="M8 5.1v3.4M8 8.5L3.5 10.9M8 8.5l4.5 2.4"/></svg>', "Note Trees", ""],
  ["sheets", '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 6h12M2 9.5h12M6 2.5v11M10 2.5v11"/></svg>', "Spreadsheets", ""]];
/* v0.5.5 (Devon): the ▦ Widgets menu moved out of the note's formatting bar into the Tool bar, in its own section above the
   tools: a click puts the widget into the note you were writing in (after the line you were on). Widgets that connect to
   other apps and services (APIs) will join this section. */
const WIDGET_SHORT = { code: "Code box", music: "Music", sheet: "Lead sheet", graph: "Graph", map: "Map", audio: "Audio", sign: "Sign" };
const railHTML = code => `<div class="nb-railh">Widgets</div>` + ((window.InquireWidgets && InquireWidgets.WIDGETS) || []).map(([w, g, n, d]) =>
    `<button type="button" class="nb-tool nb-wtool${code ? " soon" : ""}" data-widget="${w}" data-name="${n}"${code ? ' aria-disabled="true"' : ""} title="${code ? `${n}: widgets go into notes (My notes)` : `${n}: ${d}. Goes in after the line you are on`}"><span class="nb-tooli" aria-hidden="true">${g}</span><span class="nb-tooln">${WIDGET_SHORT[w] || n}</span></button>`).join("")
  + `<button type="button" class="nb-tool nb-wtool nb-wmore soon" data-widget="more" aria-disabled="true" data-name="App widgets" title="Widgets that connect to other apps and services: coming soon"><span class="nb-tooli" aria-hidden="true">＋</span><span class="nb-tooln">More</span><small>Soon</small></button>`
  + `<div class="nb-railh">Tools</div>` + TOOLS.map(([k, ic, n, d]) => { const soon = !d, on = (k === "note" && !code) || (k === "code" && code);
  return `<button type="button" class="nb-tool${on ? " on" : ""}${soon ? " soon" : ""}" data-tool="${k}" data-name="${n}" aria-pressed="${on}"${soon ? ' aria-disabled="true"' : ""} title="${n}${soon ? ": coming soon" : ": " + d}"><span class="nb-tooli" aria-hidden="true">${ic}</span><span class="nb-tooln">${n === "Spreadsheets" ? "Sheets" : n === "Note Trees" ? "Trees" : n}</span>${soon ? '<small>Soon</small>' : ""}</button>`; }).join("");
const NOTE_MINI = '<svg viewBox="0 0 12 14" width="11" height="13"><path d="M1.5 1h6l3 3v9h-9z" class="pg"/><path d="M7.5 1v3h3" class="fd"/></svg>';
/* (v0.5.8, Devon) My notes comes in two versions, picked in the header: Simple = the Folders & Files bar (notes only) and the
   note (formatting without headings, align, indent and spacing, clear formatting; Grammar check and audio recording stay);
   Professional = everything. Kept in notepath.notemode; My Code is always Professional. */
/* (v0.5.8, Devon) 🎙 audio recording: one recording at a time, for the note it was started in (even if another note is
   opened meanwhile); kept while My notes is open, saved into its note when stopped or when My notes closes. */
const REC = { on: false };
const REC_MAX = 3 * 3600; // seconds
function recMime(){ const M = window.MediaRecorder; if (!M || !M.isTypeSupported) return ""; return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(t => M.isTypeSupported(t)) || ""; }
function recSecs(){ return !REC.on ? 0 : (REC.acc + (REC.paused ? 0 : (performance.now() - REC.t0))) / 1000; }
const noteMode = () => store.get("notemode", "pro") === "simple" ? "simple" : "pro";
function renderNotes(m, focusBody, space = "notes"){
  const NS = window.InquireNotes.scope(space), NOTES = SPACES[space], CODE = space === "code", SK = SKEYS[space];
  const ALLNS = window.InquireNotes, CS = window.InquireNotes.scope("code");
  const s = m.body;
  s.innerHTML = `    <div class="nb-sbar"><label class="search nb-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search" aria-label="${CODE ? "Search every code file" : "Search every note"}"></label></div>
    <div class="nb"><nav class="nb-folders" aria-label="${CODE ? "Folders and code files" : "Folders and files"}"><div class="nb-tools nb-ftools">${viewSwitch(viewOf(CODE ? "codeview" : "noteview"), CODE ? "Show the code files as" : "Show the notes as")}<select class="nb-sort" aria-label="${CODE ? "Order of code files" : "Order of notes"}"><option value="mine">My order</option><option value="recent">Recently edited</option></select><button type="button" class="nb-favtop" aria-pressed="false" title="Keep favourites at the top of the list">★ first</button><button type="button" class="nb-hide" data-p="f" title="Hide the Folders &amp; Files bar (a strip on the left brings it back)" aria-label="Hide the Folders and Files bar"><span aria-hidden="true">◀</span> Hide</button></div><div class="nb-ftree" role="group" aria-label="${CODE ? "Code folders and files" : "Folders and files"}"></div></nav>
    <aside class="nb-rail" aria-label="Tools"><button type="button" class="nb-hide nb-hidel" data-p="l" title="Hide the Tool bar (a strip brings it back)" aria-label="Hide the Tool bar"><span class="nb-tooli" aria-hidden="true">◀</span><span class="nb-tooln">Hide</span></button>${railHTML(CODE)}</aside>
    <section class="nb-ed"><div class="nb-tabs" hidden></div><div class="nb-panes"><div class="nb-pane p1"></div><div class="nb-pane p2" hidden></div></div></section>
    <button type="button" class="nb-fold" data-p="f"></button><button type="button" class="nb-fold" data-p="l"></button>
    <div class="nb-rzf" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the folders column (drag, or ←/→; double-click resets)" title="Drag to resize the folders · double-click resets"></div>
</div>`;
  notesLayout($(".nb", s)); $(".nb", s).classList.toggle("nb-code", CODE);
  const mac = /Mac/.test(navigator.platform);
  m.head.innerHTML = CODE ? `<span class="mw-tip" tabindex="0" title="Code files have their own folders: drag files into folders and folders into each other, or up and down to put them in your own order. Drag a file onto ⧉ beside the name to open two side by side. ▶ Run (${mac ? "⌘" : "Ctrl+"}Enter) runs the file; type what it reads in the Input tab. ⇄ Translate turns it into another language (AI). In My notes, the Code section of the folders lets you drop a copy of a code file into a note." aria-label="Tips">?</span><span class="np-hist" role="group" aria-label="Undo and redo"><button type="button" class="np-hb" data-a="undo" title="Undo: new, renamed, moved or deleted files and folders (inside the editor, ${mac ? "⌘" : "Ctrl+"}Z undoes typing)" aria-label="Undo">↶ Undo</button><button type="button" class="np-hb" data-a="redo" title="Redo" aria-label="Redo">↷ Redo</button></span><button type="button" class="np-newb" data-a="newnote" title="Choose a language and name a new code file (Alt+Shift+N)">＋ New File</button>`
  : `<span class="mw-tip" tabindex="0" title="Drag notes into folders and folders into other folders, drag either up or down to put them in your own order, star the ones you use most, and paste or drop photos and videos in. Click a folder icon to fold its notes away. Drag a note or a folder into the open note to link to it (right-click a link to open it in a new note tab), or onto ⧉ beside the title to open the two side by side. Drag a file from the Code section into a note for a copy of its code, or onto a folder to file a copy there; drag the line above Code to share the column. The buttons at the top of the Folders & Files bar show the notes and folders as icons, a list, a compact list or details; All notes, Favourites and Unfiled filter the bar; Search finds folders too. The Tool bar beside it switches between Note and Code (Canvas, Note Trees and Spreadsheets are coming). H in the note's toolbar makes a line a Title, Subtitle or Heading 1, 2 or 3. The align and spacing menus change the whole note when nothing is selected, or only the words you select. ‹ Back goes to the window you had open before. ◈ at the bottom right lists the note's links; ↳ beside it adds your own paranotes under words or code; ✦ opens AI Chat and A✓ checks the grammar for the kind of note you are writing. ◀ Hide folds the Folders & Files bar or the Tool bar into a strip; click the strip to bring it back. Drag the line beside the folders to resize them. The Map widget in the Tool bar finds an address and keeps it in the note. Select words and right-click to define them, link them to another note, or Ask AI to rewrite, shorten or explain them." aria-label="Tips">?</span><span class="np-hist" role="group" aria-label="Undo and redo"><button type="button" class="np-hb" data-a="undo" title="Undo (${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}+Z): writing, folders, new or deleted notes, widgets…" aria-label="Undo">↶ Undo</button><button type="button" class="np-hb" data-a="redo" title="Redo (⇧${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}+Z)" aria-label="Redo">↷ Redo</button></span><button type="button" class="np-hb np-io np-share" data-a="share" aria-haspopup="menu" aria-expanded="false" title="Share: copy a link to this note, send a copy to someone, import or export notes">⇪ Share</button><button type="button" class="np-newb" data-a="newnote" title="Name a new note and start writing (Alt+Shift+N)">＋ New Note</button>`;
  const fold = $(".nb-ftree", s), items = fold, edSec = $(".nb-ed", s), ed = $(".nb-pane.p1", s), ed2 = $(".nb-pane.p2", s), tabs = $(".nb-tabs", s), nbEl = $(".nb", s), q = $('input[type="search"]', s), sortSel = $(".nb-sort", s);
  const VK = CODE ? "codeview" : "noteview";
  $(".nb-tools .np-views", s).addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (!b) return; store.set(VK, b.dataset.view); $(".nb-tools .np-views", s).querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
    drawList(); }); // the list keeps the width you gave it (v0.5.4, Devon): Details scrolls sideways instead of widening it
  q.value = NOTES.q;
  // Search (v0.5.4, Devon): above the folders, never folded away; it looks through every note (or code file), and shows the
  // notes list if it was folded so the results can be seen
  q.oninput = () => { NOTES.q = q.value; if (q.value.trim() && nbEl.classList.contains("ffold")) { const fb = $('.nb-fold[data-p="f"]', s); if (fb) fb.click(); } drawList(); };
  // the Tool bar (v0.5.5): Note · Code switch what the page edits; Canvas, Note Trees and Spreadsheets are coming
  $(".nb-rail", s).addEventListener("mousedown", e => { if (e.target.closest("[data-widget]")) e.preventDefault(); }); // keep the caret in the note
  $(".nb-rail", s).addEventListener("click", e => {
    const wb = e.target.closest("[data-widget]");
    if (wb) { // a widget into the note last written in (main or side by side)
      if (wb.getAttribute("aria-disabled") === "true") { msg(CODE && wb.dataset.widget !== "more" ? "Widgets go into notes: open My notes to add one." : "Widgets that connect to other apps are coming soon."); return; }
      const api = (lastPane === "p2" && rich2 && rich2.addWidget) ? rich2 : rich && rich.addWidget ? rich : null;
      if (!api) { msg("Open a note first, then add the widget."); return; }
      api.addWidget(wb.dataset.widget); return;
    }
    const b = e.target.closest("[data-tool]"); if (!b) return; const t = b.dataset.tool;
    if (b.getAttribute("aria-disabled") === "true") { msg(`${b.dataset.name} is coming soon.`); return; }
    if ((t === "note" && !CODE) || (t === "code" && CODE)) return;
    flushEd(); go({ view: "notes", space: t === "code" ? "code" : "notes" }); });
  { const bar = $(".nb-sbar", s), fcol = $(".nb-folders", s), fit = () => { const w = fcol.offsetWidth; if (w > 60) bar.style.setProperty("--sbw", Math.max(200, w - 20) + "px"); const rz = $(".nb-rzf", s); if (rz) { rz.setAttribute("aria-valuemin", "180"); rz.setAttribute("aria-valuemax", "620"); rz.setAttribute("aria-valuenow", String(Math.round(w))); } };
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(fcol); m.cleanup.push(() => ro.disconnect()); } fit(); }
  sortSel.value = NOTES.sort === "recent" ? "recent" : "mine";
  sortSel.onchange = () => { NOTES.sort = sortSel.value; store.set(SK.sort, NOTES.sort); drawList(); };
  const favTop = $(".nb-favtop", s), paintFavTop = () => { favTop.setAttribute("aria-pressed", String(!!NOTES.favTop)); favTop.title = NOTES.favTop ? "Favourites are kept at the top. Click to place them in your own order instead" : "Favourites follow your order. Click to keep them at the top"; };
  favTop.onclick = () => { NOTES.favTop = !NOTES.favTop; store.set(SK.favTop, NOTES.favTop); paintFavTop(); drawList(); }; paintFavTop();
  const realFolder = () => NS.folders().some(f => f.id === NOTES.folder) ? NOTES.folder : null;
  const newHere = () => { flushEd(); (CODE ? newCode : newNote)({ folder: realFolder(), fav: NOTES.folder === "fav" }); };
  $('[data-a="newnote"]', m.head).onclick = newHere;
  const SIMPLE = () => !CODE && noteMode() === "simple";
  if (!CODE) {
    m.head.insertAdjacentHTML("afterbegin", `<span class="np-mode" role="radiogroup" aria-label="Version of My notes"><button type="button" role="radio" data-mode="simple" title="Simple: your notes and folders, and the everyday formatting">Simple</button><button type="button" role="radio" data-mode="pro" title="Professional: every tool, widget and panel">Professional</button></span>`);
    const mb = $(".np-mode", m.head), paintMode = () => { const md = noteMode(); nbEl.dataset.mode = md; mb.querySelectorAll("[data-mode]").forEach(b => { b.setAttribute("aria-checked", String(b.dataset.mode === md)); b.tabIndex = b.dataset.mode === md ? 0 : -1; }); };
    mb.addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b || b.dataset.mode === noteMode()) return; setMode(b.dataset.mode); });
    mb.addEventListener("keydown", e => { if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return; e.preventDefault(); const md = noteMode() === "simple" ? "pro" : "simple"; setMode(md); $(`[data-mode="${md}"]`, mb).focus(); });
    var setMode = md => { flushEd(); store.set("notemode", md); paintMode();
      if (md === "simple") { if (typeof holoClose === "function") { holoClose(); indClose(); if (AS.open === "ai") asClose(); peekClose(); } }
      drawAll(); msg(md === "simple" ? "Simple: just your notes and folders. Professional brings back every tool." : "Professional: every tool, widget and panel is back."); };
    paintMode();
  }
  // ⇅ Import / Export (io.js): the note open now and the folder being viewed are offered first
  const openIO = scope => { flushEd(); if (window.NPIO) NPIO.open({ note: NOTES.sel, folder: NOTES.folder, scope, onImported: r => { NOTES.folder = "all"; if (r.made[0]) NOTES.sel = r.made[0]; drawAll(); },
    onChanged: () => { if (NOTES.sel && !NS.get(NOTES.sel)) { if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; } drawAll(); } }); };
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
  /* "Saved ✓" beside the star (v0.5.6, Devon): Saving… while typing and until the notes are on disk, Saved ✓, or, when the
     computer refuses, "Couldn't save" with Try again (the changes are kept and tried again by themselves every few seconds) */
  let saveErrSaid = false, saveFade = 0;
  function saveLine(st){
    const el = $(".nb-save", ed); if (!el) return; const S0 = window.InquireNotes.saveState ? InquireNotes.saveState() : { state: "saved" }, state = st || S0.state;
    clearTimeout(saveFade); el.className = "nb-save is-" + state;
    if (state === "error") { el.innerHTML = `<span>⚠ Couldn't save</span><button type="button" class="nb-save-retry" title="${esc(S0.error || "")} Your changes are kept and tried again by themselves.">Try again</button>`; $(".nb-save-retry", el).onclick = () => { if (InquireNotes.flushSaves) InquireNotes.flushSaves(); };
      if (!saveErrSaid) { saveErrSaid = true; if (NS.toast) NS.toast(esc("NotePath could not save your notes: " + (S0.error || "the computer refused.") + " Your changes are kept while NotePath is open and it keeps trying. Don't close it until it says Saved."), null, 12000); } return; }
    saveErrSaid = false;
    el.textContent = state === "saved" ? "Saved ✓" : "Saving…";
    if (state === "saved") saveFade = setTimeout(() => el.classList.add("quiet"), 2500);
  }
  const onSave = () => saveLine(); window.addEventListener("inquire:notes-save", onSave); m.cleanup.push(() => window.removeEventListener("inquire:notes-save", onSave));
  const onInfo = () => drawInfo(); window.addEventListener("inquire:notes-changed", onInfo); m.cleanup.push(() => window.removeEventListener("inquire:notes-changed", onInfo));
  const ROWCAP = 100, SHOWALL = NOTES.showall || (NOTES.showall = new Set()); let ROWFN = null;
  function drawFolders(){
    const all = NS.list(), fs = NS.folders(), shut = closed();
    if (!["all", "fav", "none"].includes(NOTES.folder) && !fs.some(f => f.id === NOTES.folder)) NOTES.folder = "all";
    inSub = ["all", "fav", "none"].includes(NOTES.folder) ? new Set() : NS.subtree(NOTES.folder);
    if (!NOTES.sel || !NS.get(NOTES.sel)) { const first = all.filter(inView).sort((a, b) => (NOTES.favTop ? b.fav - a.fav : 0) || (NOTES.sort !== "recent" ? NS.byOrder(a, b) : b.updated - a.updated))[0] || all[0]; NOTES.sel = first ? first.id : null; }
    const count = id => { const sub = NS.subtree(id); return all.filter(n => sub.has(n.folder)).length; };
    const LIBK = CODE ? "codelibopen" : "libopen", libOpen = new Set(store.get(LIBK, ["none"])); // library groups that are open (Unfiled by default)
    /* v0.5.6 (Devon): All notes / Favourites / Unfiled are filters. Favourites shows only the starred notes and Unfiled only the
       notes in no folder (no folders, here or in the Code section); All notes (or any folder) shows everything as before */
    const FILTER = NOTES.folder === "fav" || NOTES.folder === "none" ? NOTES.folder : null;
    const libShown = id => FILTER ? FILTER === id : libOpen.has(id);
    const mine = NOTES.sort !== "recent", view = viewOf(VK), qq = NOTES.q.trim().toLowerCase();
    // a folder's last change = the folder itself or any note in it (as in the info line)
    const lastOf = f => { const sub = NS.subtree(f.id); return Math.max(f.updated || 0, ...all.filter(n => sub.has(n.folder)).map(n => n.updated || 0)); };
    fold.dataset.view = view;
    const order = arr => arr.slice().sort((a, b) => (NOTES.favTop ? b.fav - a.fav : 0) || (mine ? NS.byOrder(a, b) : b.updated - a.updated));
    const row = (id, ic, name, n, f) => { const fv = f ? ` fv-${view}` : "", det = f && view === "details", lc = f ? lastOf(f) : 0;
      const meta = f && (view === "list" || view === "icons") ? `<span class="nb-fmeta num">${n} ${CODE ? (n === 1 ? "file" : "files") : (n === 1 ? "note" : "notes")}${lc ? " · " + esc(when(lc)) : ""}</span>` : "";
      const r = `<div class="nb-fd${NOTES.folder === id ? " sel" : ""}${f ? " user" + fv : " lib"}" data-f="${id}"${f ? ` draggable="true" style="--d:${f.depth}"` : ""}>${det ? '<span class="nb-dname">' : ""}${f ? `<button type="button" class="nb-fcar" data-car="${id}" aria-expanded="${!shut.has(id)}" title="${shut.has(id) ? "Show" : "Hide"} what is in ${esc(name)}" aria-label="${shut.has(id) ? "Show" : "Hide"} the notes and folders in ${esc(name)}">${folderIcon(!shut.has(id))}</button>`
        : `<button type="button" class="nb-fcar nb-lcar" data-lcar="${id}" aria-expanded="${libShown(id)}" title="${FILTER ? (FILTER === id ? `Showing only ${esc(name)}` : `Show only ${esc(name)}`) : (libOpen.has(id) ? "Hide" : "Show") + ` the ${CODE ? "files" : "notes"} in ${esc(name)}`}" aria-label="${FILTER ? (FILTER === id ? `Showing only ${esc(name)}` : `Show only ${esc(name)}`) : (libOpen.has(id) ? "Hide" : "Show") + ` the ${CODE ? "files" : "notes"} in ${esc(name)}`}"><span class="nb-lic" aria-hidden="true">${ic}</span></button>`}<button type="button" class="nb-fdb" data-f="${id}" aria-pressed="${NOTES.folder === id}"${f ? ` title="Drag onto another folder to put it inside; drag above or below a folder to reorder. Alt+↑/↓ also reorders."` : ""}>${meta ? `<span class="nb-ftx"><span class="nb-fnm">${esc(name)}</span>${meta}</span>` : `<span class="nb-fnm">${esc(name)}</span>`}<span class="nb-fn num">${n}</span></button>${f ? `<button type="button" class="nb-fx nb-ffav${f.fav ? " on" : ""}" data-ffav="${id}" aria-pressed="${!!f.fav}" title="${f.fav ? "Unstar: back to its own place" : "Star: keep this folder at the top"}" aria-label="${f.fav ? "Unstar" : "Star"} ${esc(name)}">${f.fav ? "★" : "☆"}</button><button type="button" class="nb-fx" data-sub="${id}" title="New folder inside" aria-label="New folder inside ${esc(name)}">＋</button><button type="button" class="nb-fx" data-ren="${id}" title="Rename folder" aria-label="Rename ${esc(name)}">✎</button><button type="button" class="nb-fx" data-del="${id}" title="Delete folder (its notes and folders move up a level)" aria-label="Delete ${esc(name)}">✕</button>` : ""}${det ? `</span><span class="nb-dc num">${esc(stampShort(lc))}</span><span class="nb-dc num">${esc(stampShort(f.created))}</span><span class="nb-dc">Folder</span>` : ""}</div>`;
      return r; };
    // a file row in the Folders & Files bar (v0.5.5): its look follows Show as (List, Compact, Details, Icons); g = the group it is listed in
    const fname = Object.fromEntries(fs.map(f => [f.id, f.name]));
    const star = n => n.fav ? '<i class="nb-star" aria-label="Favourite">★</i>' : "";
    const fic = n => CODE ? `<i class="nc-badge nb-fbadge" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</i>` : `<span class="nb-fni" aria-hidden="true">${NOTE_MINI}</span>`;
    const fileRow = (n, d, g) => {
      const a = x => `class="nb-fnote nb-it${x}${n.id === NOTES.sel ? " sel" : ""}" role="button" tabindex="0" draggable="true" aria-pressed="${n.id === NOTES.sel}" data-id="${n.id}" data-g="${g}" style="--d:${d}"`;
      const cov = n.cover && /^[a-z0-9]{4,40}$/i.test(n.cover) ? n.cover : null, inF = g === "q" || g === "all" || g === "fav" ? (n.folder && fname[n.folder] ? esc(fname[n.folder]) + " · " : "") : "";
      if (view === "icons") return `<div ${a(" nb-tile")} title="${esc(n.title)} · ${esc(noteKind(n))} · edited ${esc(stampShort(n.updated))}"><span class="nb-tic${cov ? " has-cov" : ""}">${cov ? `<img class="nb-cov nb-tcov" data-cov="${cov}" alt="">` : CODE ? `<i class="nc-badge nb-tbadge" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</i>` : NOTE_IC}${n.fav ? '<i class="nb-star nb-tstar" aria-label="Favourite">★</i>' : ""}</span><span class="nb-t">${esc(n.title)}</span><span class="nb-m">${when(n.updated)}</span></div>`;
      if (view === "details") return `<div ${a(" nb-row")}><span class="nb-t">${fic(n)}${star(n)}${esc(n.title)}</span><span class="nb-dc num">${esc(stampShort(n.updated))}</span><span class="nb-dc num">${esc(stampShort(n.created))}</span><span class="nb-dc">${esc(noteKind(n))}</span></div>`;
      if (view === "compact") return `<div ${a(" nb-row nb-crow")} title="${esc(n.title)} · made ${esc(stampShort(n.created))}"><span class="nb-t">${fic(n)}${star(n)}${esc(n.title)}</span><span class="nb-dc num">${esc(when(n.created))}</span></div>`;
      return `<div ${a(cov ? " nb-hascov" : " nb-lrow")}>${cov ? `<img class="nb-cov nb-lcov" data-cov="${cov}" alt="">` : fic(n)}<span class="nb-ltx"><span class="nb-t">${star(n)}${esc(n.title)}</span><span class="nb-m">${inF}${when(n.updated)}</span></span></div>`;
    };
    /* v0.5.6 (Devon): a long group shows its first 100 notes and a "Show n more" row (the open note is always listed), so a
       redraw with thousands of notes stays quick; "Show all" is remembered for the session */
    const files = (arr, d, g) => { if (!arr.length) return ""; let list = order(arr), more = 0;
      if (list.length > ROWCAP && !SHOWALL.has(g) && !qq) { const head = list.slice(0, ROWCAP), sel = list.find(n => n.id === NOTES.sel); more = list.length - ROWCAP; if (sel && !head.includes(sel)) { head.push(sel); more--; } list = head; }
      const rows = list.map(n => fileRow(n, d, g)).join(""), tail = more > 0 ? `<button type="button" class="nb-more" data-more="${esc(g)}" style="--d:${d}">Show ${more.toLocaleString()} more</button>` : "";
      return (view === "icons" ? `<div class="nb-tiles" style="--d:${d}">${rows}</div>` : rows) + tail; };
    ROWFN = (n, el) => fileRow(n, +getComputedStyle(el).getPropertyValue("--d") || 0, el.dataset.g);
    const dhead = view === "details" ? `<div class="nb-dhead" aria-hidden="true">${["Name", "Modified", "Created", "Kind"].map((t, i) => `<span>${t}${i < 3 ? `<i class="nb-dcrz" data-c="${i}" title="Drag to resize this column · double-click to reset all"></i>` : ""}</span>`).join("")}</div>` : "";
    const byFolder = {}; all.forEach(n => { if (n.folder) (byFolder[n.folder] = byFolder[n.folder] || []).push(n); });
    const tree = parent => fs.filter(f => (f.parent || null) === parent).map(f => row(f.id, "", f.name, count(f.id), f)
      + (shut.has(f.id) ? "" : tree(f.id) + files(byFolder[f.id] || [], f.depth + 1, f.id))).join("");
    const empty = (txt) => `<p class="nb-gempty" style="--d:1">${txt}</p>`;
    const lib = (id, ic, name, arr, none) => row(id, ic, name, arr.length) + (libShown(id) ? (files(arr, 1, id) || empty(none)) : "");
    const libHTML = (all.length ? "" : `<p class="nb-gempty nb-none0" style="--d:0">${CODE ? "No code files yet. Start one with ＋ New File." : "No notes yet. Start one with ＋ New Note."}</p>`) + lib("all", CODE ? "&lt;/&gt;" : "▤", CODE ? "All code" : "All notes", all, CODE ? "No code files yet. Start one with ＋ New File." : "No notes yet. Start one with ＋ New Note.")
      + lib("fav", "★", "Favourites", all.filter(n => n.fav), CODE ? "No favourites yet. Star a file with ☆." : "No favourites yet. Star a note with ☆.")
      + lib("none", "◌", "Unfiled", all.filter(n => !n.folder), "Nothing unfiled.");
    const libRows = () => { // under a filter (v0.5.6): the three selectors stay together at the top, the filtered notes under them
      const g = { all: [CODE ? "&lt;/&gt;" : "▤", CODE ? "All code" : "All notes", all], fav: ["★", "Favourites", all.filter(n => n.fav)], none: ["◌", "Unfiled", all.filter(n => !n.folder)] };
      return Object.keys(g).map(k => row(k, g[k][0], g[k][1], g[k][2].length)).join("") + `<div class="nb-fres" data-for="${FILTER}">`
        + (files(g[FILTER][2], 1, FILTER) || empty(FILTER === "fav" ? (CODE ? "No favourites yet. Star a file with ☆." : "No favourites yet. Star a note with ☆.") : "Nothing unfiled.")) + `</div>`; };
    if (qq) { // Search (v0.5.5): folders as well as notes; in My notes also My Code's folders and files
      const path = (f, list) => { const out = []; let x = f; while (x && x.parent) { x = list.find(y => y.id === x.parent); if (x) out.unshift(x.name); } return out.join(" › "); };
      const fl = fs.filter(f => f.name.toLowerCase().includes(qq)), nl = NS.list(NOTES.q);
      const cf = CODE ? [] : CS.folders(), cfl = cf.filter(f => f.name.toLowerCase().includes(qq)), cnl = CODE ? [] : CS.list(NOTES.q);
      const frow = (f, sp, list) => `<button type="button" class="nb-sfd" data-sf="${f.id}" data-sp="${sp}" title="Show the folder ${esc(f.name)}">${folderIcon(false)}<span class="nb-fnm">${esc(f.name)}</span>${path(f, list) ? `<span class="nb-spath">in ${esc(path(f, list))}</span>` : ""}</button>`;
      const crowS = n => `<div class="nb-fnote nb-cfile" role="button" tabindex="0" draggable="true" data-cid="${n.id}" style="--d:0" title="${esc(n.title)}: click to open it in My Code"><span class="nb-fni nb-cfi" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</span><span class="nb-fnt">${esc(n.title)}</span></div>`;
      const sec = (k, cls, label, body, n) => n ? `<div class="nb-sech ${cls}" data-sec="${k}">${label} <span class="num">${n}</span></div>${body}` : "";
      const total = fl.length + nl.length + (SIMPLE() ? 0 : cfl.length + cnl.length);
      fold.innerHTML = `<div class="nb-sres">${dhead}<div class="nb-sres-h">${total ? `${total} found for “${esc(NOTES.q.trim())}”` : `Nothing matches “${esc(NOTES.q.trim())}”`}</div>`
        + sec("folders", "", CODE ? "Code folders" : "Folders", fl.map(f => frow(f, CODE ? "code" : "notes", fs)).join(""), fl.length)
        + sec("files", CODE ? "is-code" : "is-notes", CODE ? "Code files" : "Notes", files(nl, 0, "q"), nl.length)
        + (SIMPLE() ? "" : sec("code", "is-code", "My Code", cfl.map(f => frow(f, "code", cf)).join("") + cnl.map(crowS).join(""), cfl.length + cnl.length)) + `</div>`;
    } else {
      fold.innerHTML = (CODE ? "" : `<div class="nb-fmain">`) + dhead + `<div class="nb-sech ${CODE ? "is-code" : "is-notes"}">${CODE ? "Code" : "Notes"}</div>` + (FILTER ? libRows() : libHTML)
        + (FILTER ? "" : `<div class="nb-fh nb-ftop" data-top>${CODE ? "Code folders" : "Folders"}</div>` + tree(null))
        + `<button type="button" class="nb-fadd" data-a="addf" title="Make a new folder">＋ New folder</button>` + (CODE ? "" : `</div><div class="nb-fsplit" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Share the bar between notes and code (drag, or ↑/↓; double-click resets)" title="Drag to give the Code section more or less room · double-click resets"></div><div class="nb-fcode">${codeSection(shut, FILTER)}<div class="nb-sech is-music nb-music" title="My Music is coming soon">Music <span class="nb-soon">Coming soon</span></div></div>`);
    }
    fold.classList.toggle("is-search", !!qq); if (qq) fold.classList.remove("has-fsplit", "code-shut");
    fold.dataset.filter = FILTER && !qq ? FILTER : "";
    if (!CODE && !qq) wireFsplit();
    drawInfo();
    if (!CODE) wireCodeSection();
    fold.querySelectorAll("img[data-cov]").forEach(im => window.InquireNotes.thumbURL(im.dataset.cov, 160).then(u => { if (u) im.src = u; else im.classList.add("missing"); }));
    if (view === "details") wireDcols();
    fold.title = mine ? "Drag notes onto folders to file them, or up and down among notes to put them in your own order" : "Choose My order to arrange notes by dragging";
    fold.querySelectorAll("[data-more]").forEach(b => b.onclick = () => { SHOWALL.add(b.dataset.more); drawFolders(); });
    fold.querySelectorAll(".nb-fnote:not(.nb-cfile)").forEach(wireRow);
    fold.querySelectorAll("[data-lcar]").forEach(b => b.onclick = e => { e.stopPropagation(); if (FILTER) { if (b.dataset.lcar !== FILTER) { NOTES.folder = b.dataset.lcar; drawFolders(); } return; } const o = new Set(store.get(LIBK, ["none"])), id = b.dataset.lcar; o.has(id) ? o.delete(id) : o.add(id); store.set(LIBK, [...o]); drawFolders(); });
    fold.querySelectorAll(".nb-sfd").forEach(b => b.onclick = () => { // a folder found by Search: show it in the bar (opened, its parents too)
      if (b.dataset.sp !== space) { flushEd(); go({ view: "notes", space: b.dataset.sp, folder: b.dataset.sf }); return; }
      const c = closed(); let x = fs.find(f => f.id === b.dataset.sf); while (x) { c.delete(x.id); x = x.parent && fs.find(f => f.id === x.parent); } store.set("notefold", [...c]);
      NOTES.q = ""; q.value = ""; NOTES.folder = b.dataset.sf; drawFolders();
      const rowEl = fold.querySelector(`.nb-fd[data-f="${b.dataset.sf}"]`); if (rowEl) { rowEl.scrollIntoView({ block: "nearest" }); const fb = rowEl.querySelector(".nb-fdb"); if (fb) fb.focus({ preventScroll: true }); } });
    // pick, open/close, rename, delete
    fold.querySelectorAll(".nb-fdb").forEach(b => b.onclick = e => { if (b.closest(".nb-fd.user") && pickClick(e, "f", b.dataset.f)) return; NOTES.folder = b.dataset.f; drawFolders(); });
    fold.querySelectorAll(".nb-fd.user").forEach(d => d.addEventListener("click", e => { if (e.target.closest("button,input,form")) return; const b = d.querySelector(".nb-fdb"); if (b) b.click(); }));
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
    const addf = $('[data-a="addf"]', fold); if (addf) addf.onclick = e => nameBox(e.target, "", v => { const f = NS.addFolder(v); NOTES.folder = f.id; drawAll(); });
    pickPaint();
  }
  /* ----- (v0.5.8, Devon) Select and the right-click menu in the Folders & Files bar. Ctrl+click (⌘+click on a Mac) adds a
     note or folder to the selection or takes it out, Shift+click selects everything between, Esc or a plain click clears it.
     Right-click a note, a folder or Unfiled / Favourites / All notes: Copy link · Select · Select all · Delete. Delete on a
     selected item deletes the whole selection (asks once more for more than one item or a folder), with Undo. Deleting a
     folder keeps its notes and folders (they move up a level), as the ✕ on the row does. ----- */
  const PICK = NOTES.pick || (NOTES.pick = { n: new Set(), f: new Set(), anchor: null });
  const MODK = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
  const pickCount = () => PICK.n.size + PICK.f.size;
  function pickPaint(){
    fold.querySelectorAll(".nb-fnote[data-id]:not(.nb-cfile)").forEach(r => { const on = PICK.n.has(r.dataset.id); r.classList.toggle("is-picked", on); });
    fold.querySelectorAll(".nb-fd.user[data-f]").forEach(r => r.classList.toggle("is-picked", PICK.f.has(r.dataset.f)));
    let bar = $(".nb-pickbar", nbEl.querySelector(".nb-folders")); const k = pickCount();
    if (!k) { if (bar) bar.remove(); return; }
    if (!bar) { bar = h("div", { class: "nb-pickbar", role: "status" }); nbEl.querySelector(".nb-folders").insertBefore(bar, fold); }
    const parts = []; if (PICK.n.size) parts.push(`${PICK.n.size} ${CODE ? "file" : "note"}${PICK.n.size === 1 ? "" : "s"}`); if (PICK.f.size) parts.push(`${PICK.f.size} folder${PICK.f.size === 1 ? "" : "s"}`);
    bar.innerHTML = `<span class="nb-pickn"><span>${parts.join(" and ")}</span> <span>selected</span></span><button type="button" class="nb-pickx" data-p="del" title="Delete the selected items">Delete</button><button type="button" class="nb-pickx" data-p="clear" title="Clear the selection (Esc)" aria-label="Clear the selection">✕</button>`;
    bar.onclick = e => { const b = e.target.closest("[data-p]"); if (!b) return; if (b.dataset.p === "clear") pickClear(); else { if (b.dataset.armed) { pickDelete([...PICK.n], [...PICK.f]); return; } b.dataset.armed = "1"; b.textContent = "Delete " + k + "?"; b.classList.add("armed"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete"; b.classList.remove("armed"); } }, 3500); } };
  }
  function pickClear(){ PICK.n.clear(); PICK.f.clear(); PICK.anchor = null; pickPaint(); }
  const pickSet = kind => kind === "n" ? PICK.n : PICK.f;
  function pickToggle(kind, id){ const S = pickSet(kind); S.has(id) ? S.delete(id) : S.add(id); PICK.anchor = { kind, id }; pickPaint(); }
  // a modified click: true when it was a selection click (the caller then does nothing else)
  function pickClick(e, kind, id){
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); pickToggle(kind, id); return true; }
    if (e.shiftKey) { e.preventDefault();
      const sel = kind === "n" ? ".nb-fnote[data-id]:not(.nb-cfile)" : ".nb-fd.user[data-f]", key = kind === "n" ? "id" : "f";
      const ids = [...new Set([...fold.querySelectorAll(sel)].map(x => x.dataset[key]))];
      const a = PICK.anchor && PICK.anchor.kind === kind ? ids.indexOf(PICK.anchor.id) : -1, b = ids.indexOf(id);
      if (a < 0) { // no start yet: the open note / folder is the start
        const st = kind === "n" ? ids.indexOf(NOTES.sel) : ids.indexOf(NOTES.folder); if (st >= 0) { ids.slice(Math.min(st, b), Math.max(st, b) + 1).forEach(x => pickSet(kind).add(x)); } else pickSet(kind).add(id);
      } else ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => pickSet(kind).add(x));
      pickPaint(); return true; }
    if (pickCount()) pickClear();
    return false;
  }
  // the notes a "Select all" on this row means: its folder's notes, Unfiled, Favourites, everything, or what Search shows
  function groupNotes(g){
    const all = NS.list();
    if (g === "none") return all.filter(n => !n.folder).map(n => n.id);
    if (g === "fav") return all.filter(n => n.fav).map(n => n.id);
    if (g === "all") return all.map(n => n.id);
    if (g === "q") return [...new Set([...fold.querySelectorAll('.nb-fnote[data-g="q"]')].map(x => x.dataset.id))];
    return all.filter(n => n.folder === g).map(n => n.id);
  }
  const groupName = g => g === "none" ? "Unfiled" : g === "fav" ? "Favourites" : g === "all" ? (CODE ? "all files" : "All notes") : g === "q" ? "the search results" : (NS.folders().find(f => f.id === g) || {}).name || "this folder";
  async function pickDelete(nids, fids){
    nids = nids.filter(id => NS.get(id)); fids = fids.filter(id => NS.folders().some(f => f.id === id));
    if (!nids.length && !fids.length) return;
    flushEd();
    if (nids.includes(NOTES.sel)) { if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; }
    if (SPLIT.id && nids.includes(SPLIT.id)) closeSplit(true);
    nids.forEach(id => NS.trash(id));
    const fs0 = NS.folders(), depth = id => (fs0.find(f => f.id === id) || {}).depth || 0;
    fids.slice().sort((a, b) => depth(b) - depth(a)).forEach(id => NS.removeFolder(id)); // inner folders first
    if (fids.includes(NOTES.folder)) NOTES.folder = "all";
    PICK.n.clear(); PICK.f.clear(); PICK.anchor = null;
    drawAll();
    const mark = NS.history().undo, parts = [];
    if (nids.length) parts.push(`${nids.length} ${CODE ? "file" : "note"}${nids.length === 1 ? "" : "s"}`); if (fids.length) parts.push(`${fids.length} folder${fids.length === 1 ? "" : "s"}`);
    NS.toast(`Deleted ${parts.join(" and ")}${fids.length ? ". What was in the folders moved up a level" : ""}`, { label: "Undo", run: () => {
      if (NS.history().undo !== mark) { msg("Use ↶ Undo at the top to step back to it."); return; }
      if (NS.undo()) drawAll(); } }, 9000);
  }
  let fmenu = null;
  function fmenuClose(){ if (!fmenu) return; fmenu.remove(); fmenu = null; document.removeEventListener("pointerdown", fmenuOut, true); window.removeEventListener("keydown", fmenuKey, true); window.removeEventListener("blur", fmenuClose); }
  const fmenuOut = e => { if (fmenu && !fmenu.contains(e.target)) fmenuClose(); };
  const fmenuKey = e => { if (e.key === "Escape" && fmenu) { e.preventDefault(); e.stopPropagation(); fmenuClose(); } };
  fold.addEventListener("contextmenu", e => {
    const nr = e.target.closest(".nb-fnote[data-id]:not(.nb-cfile)"), fr = !nr && e.target.closest(".nb-fd[data-f]");
    if (!nr && !fr) return;
    e.preventDefault(); fmenuClose();
    const lib = fr && !fr.classList.contains("user"), kind = nr ? "n" : "f", id = nr ? nr.dataset.id : fr.dataset.f, g = nr ? nr.dataset.g : id;
    const item = kind === "n" ? NS.get(id) : NS.folders().find(f => f.id === id);
    if (!lib && !item) return;
    const inSel = !lib && pickSet(kind).has(id), many = inSel && pickCount() > 1;
    const name = lib ? groupName(id) : kind === "n" ? item.title : item.name, short = t => esc(String(t || "").length > 34 ? String(t).slice(0, 32).trim() + "…" : t || "");
    const delN = many ? [...PICK.n] : kind === "n" ? [id] : [], delF = many ? [...PICK.f] : kind === "f" && !lib ? [id] : [];
    const delWhat = many ? `${pickCount()} selected items` : kind === "n" ? `“${short(name)}”` : `the folder “${short(name)}”`;
    const all = lib ? groupNotes(id) : kind === "n" ? groupNotes(g) : NS.folders().map(f => f.id);
    fmenu = h("div", { class: "tm-menu win nb-fmenu", role: "menu", "aria-label": lib ? name : kind === "n" ? (CODE ? "File" : "Note") : "Folder" });
    fmenu.innerHTML = (lib ? "" : `<button type="button" role="menuitem" data-m="copy"><span class="tm-ic">⧉</span><span>${many ? `Copy ${pickCount()} links` : "Copy link"}<small>${many ? "One per line, to paste into a note, a calendar or an email to yourself" : kind === "n" ? `Opens “${short(name)}” in NotePath on this computer` : `Opens the folder “${short(name)}” in NotePath on this computer`}</small></span></button>
      <button type="button" role="menuitem" data-m="pick"><span class="tm-ic">${inSel ? "☒" : "☐"}</span><span>${inSel ? "Unselect" : "Select"}<small>${MODK}click also selects · Shift+click selects a run</small></span><kbd>${MODK}click</kbd></button>`)
      + `<button type="button" role="menuitem" data-m="all"${all.length ? "" : " disabled"}><span class="tm-ic">▦</span><span>${kind === "f" && !lib ? "Select all folders" : (CODE ? "Select all files in " : "Select all notes in ") + esc(lib || g === "none" || g === "fav" || g === "all" || g === "q" ? groupName(g) : "“" + groupName(g) + "”")}<small>${all.length} ${kind === "f" && !lib ? "folder" : CODE ? "file" : "note"}${all.length === 1 ? "" : "s"}</small></span></button>`
      + (lib ? "" : `<div class="nb-fmsep" role="separator"></div><button type="button" role="menuitem" class="nb-fmdel" data-m="del"><span class="tm-ic">✕</span><span>${many ? `Delete ${pickCount()} selected items` : "Delete"}<small>${delF.length ? "Notes and folders inside a folder move up a level" : "Undo is offered right after"}</small></span></button>`);
    document.body.appendChild(fmenu);
    const W = fmenu.offsetWidth, H = fmenu.offsetHeight;
    fmenu.style.left = Math.max(6, Math.min(innerWidth - W - 6, e.clientX)) + "px"; fmenu.style.top = Math.max(6, Math.min(innerHeight - H - 6, e.clientY)) + "px";
    fmenu.addEventListener("click", async ev => {
      const b = ev.target.closest("button[data-m]"); if (!b || b.disabled) return; const m = b.dataset.m;
      if (m === "copy") { const ids = many ? [...PICK.n].map(x => ["n", x]).concat([...PICK.f].map(x => ["f", x])) : [[kind, id]];
        const lines = ids.map(([k, x]) => { const o = k === "n" ? NS.get(x) : NS.folders().find(f => f.id === x); return o ? (ids.length > 1 ? (k === "n" ? o.title : o.name) + " — " : "") + (k === "n" ? noteLink(x) : folderLink(x)) : ""; }).filter(Boolean);
        fmenuClose(); msg((await copyText(lines.join("\n"))) ? (lines.length > 1 ? `Copied ${lines.length} links.` : "Link copied. It opens this in NotePath on this computer.") : "Copying did not work."); return; }
      if (m === "pick") { fmenuClose(); pickToggle(kind, id); return; }
      if (m === "all") { fmenuClose(); all.forEach(x => pickSet(kind === "f" && !lib ? "f" : "n").add(x)); PICK.anchor = null; pickPaint(); msg(`Selected ${all.length}. Right-click one of them → Delete to delete them all.`); return; }
      if (m === "del") {
        const big = delN.length + delF.length > 1 || delF.length;
        if (big && !b.dataset.armed) { b.dataset.armed = "1"; b.classList.add("armed"); b.querySelector("span:not(.tm-ic)").firstChild.textContent = `Click again to delete ${delWhat}`; return; }
        fmenuClose(); if (!big && delN.length === 1) { const n = NS.get(delN[0]); flushEd(); if (NOTES.sel === delN[0]) { if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; } PICK.n.delete(delN[0]); NS.deleteWithUndo(delN[0], x => { if (s.isConnected) { NOTES.sel = x; drawAll(); } }); drawAll(); void n; return; }
        pickDelete(delN, delF); }
    });
    document.addEventListener("pointerdown", fmenuOut, true); window.addEventListener("keydown", fmenuKey, true); window.addEventListener("blur", fmenuClose);
    setTimeout(() => { const f = fmenu && fmenu.querySelector("button:not([disabled])"); if (f) f.focus({ preventScroll: true }); }, 0);
  });
  const pickEsc = e => { if (e.key !== "Escape" || !pickCount() || fmenu || document.querySelector(".tm-menu, .np-pop, .ask-ov, .np-holo, .np-peek, .nw-present, .set-ov:not([hidden])")) return; const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable=true]")) return; e.preventDefault(); e.stopPropagation(); pickClear(); };
  window.addEventListener("keydown", pickEsc, true); m.cleanup.push(() => { window.removeEventListener("keydown", pickEsc, true); fmenuClose(); });
  // one note row in the bar: open, keyboard, drag (v0.5.6: on its own, so a saved note's row can be redrawn alone)
  function wireRow(r){
      const mine = NOTES.sort !== "recent";
      const open = () => { if (NOTES.sel === r.dataset.id) return; flushEd(); NOTES.sel = r.dataset.id; const n = NS.get(r.dataset.id); if (n && !inView(n)) NOTES.folder = n.folder || "all"; drawAll(); };
      r.onclick = e => { if (pickClick(e, "n", r.dataset.id)) return; open(); };
      r.onkeydown = e => {
        if ((e.key === "Enter" || e.key === " ") && e.target === r) { e.preventDefault(); open(); return; }
        // Alt+↑/↓ moves the note among the notes listed with it (My order)
        if (!mine || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault();
        const ids = [...fold.querySelectorAll(`.nb-fnote[data-g="${r.dataset.g}"]`)].map(x => x.dataset.id), i = ids.indexOf(r.dataset.id), j = i + (e.key === "ArrowUp" ? -1 : 1); if (j < 0 || j >= ids.length) return;
        ids.splice(i, 1); ids.splice(j, 0, r.dataset.id); reorder(ids); const nb = fold.querySelector(`.nb-fnote[data-g="${r.dataset.g}"][data-id="${r.dataset.id}"]`); if (nb) nb.focus();
      };
      r.addEventListener("dragstart", e => noteDragStart(e, r.dataset.id, r));
      r.addEventListener("dragend", () => noteDragEnd(r));
  }
  // a saved note: redraw only its rows (its time, star, title); the order catches up on the next full redraw
  function patchRows(id){
    const n = NS.get(id); if (!n || !ROWFN) return;
    fold.querySelectorAll(`.nb-fnote[data-id="${id}"]:not(.nb-cfile)`).forEach(el => {
      const t = document.createElement("template"); t.innerHTML = ROWFN(n, el); const nr = t.content.firstElementChild; if (!nr) return;
      el.replaceWith(nr); wireRow(nr); nr.classList.toggle("is-picked", PICK.n.has(id));
      const im = nr.querySelector("img[data-cov]"); if (im) window.InquireNotes.thumbURL(im.dataset.cov, 160).then(u => { if (u) im.src = u; });
    });
  }
  /* ----- Notes tab: the Code section under the folders (a divider, then the Code folders and files). A code file opens in
     My Code; dragged into a note it becomes a code box (a copy); dropped on a folder it is copied there as a new note.
     The original always stays in My Code (Devon, Oct 2026). ----- */
  const LG = k => (window.NPCode ? NPCode.lang(k) : { short: "&lt;/&gt;" });
  function codeSection(shut, filter){
    const cf = CS.folders(), cn = CS.list(), open = !store.get("codesecfold", false), fl = filter ? cn.slice().sort(ALLNS.byOrder).filter(n => filter === "fav" ? n.fav : !n.folder) : null;
    const byF = {}; cn.slice().sort(ALLNS.byOrder).forEach(n => { const k = n.folder || "_"; (byF[k] = byF[k] || []).push(n); });
    const crow = (n, d) => `<div class="nb-fnote nb-cfile" role="button" tabindex="0" draggable="true" data-cid="${n.id}" style="--d:${d}" title="${esc(n.title)}: click to open it in My Code; drag it into a note for a copy of its code, or onto a folder to file a copy there"><span class="nb-fni nb-cfi" data-lang="${esc(n.code.lang)}">${esc(LG(n.code.lang).short)}</span><span class="nb-fnt">${esc(n.title)}</span></div>`;
    const cnt = id => { const sub = ALLNS.subtree(id); return cn.filter(n => sub.has(n.folder)).length; };
    const cfrow = f => `<div class="nb-cfd" style="--d:${f.depth}"><button type="button" class="nb-fcar" data-ccar="${f.id}" aria-expanded="${!shut.has(f.id)}" title="${shut.has(f.id) ? "Show" : "Hide"} the files in ${esc(f.name)}" aria-label="${shut.has(f.id) ? "Show" : "Hide"} the files in ${esc(f.name)}">${folderIcon(!shut.has(f.id))}</button><span class="nb-cfdn">${esc(f.name)}</span><span class="nb-fn num">${cnt(f.id)}</span></div>`;
    const tree = parent => cf.filter(f => (f.parent || null) === parent).map(f => cfrow(f) + (shut.has(f.id) ? "" : tree(f.id) + (byF[f.id] || []).map(n => crow(n, f.depth + 1)).join(""))).join("");
    return `<div class="nb-codeh" role="group" aria-label="Code files"><button type="button" class="nb-codet" aria-expanded="${open}" title="${open ? "Hide" : "Show"} your code files">${folderIcon(open)} Code</button><span class="nb-fn num">${fl ? fl.length : cn.length}</span><button type="button" class="nb-codego" data-a="gocode" title="Open My Code" aria-label="Open My Code">↗</button></div>`
      + (open ? `<div class="nb-codetree">${fl ? (fl.length ? fl.map(n => crow(n, 0)).join("") : `<p class="nb-codeempty">${filter === "fav" ? "No favourite code files." : "No unfiled code files."}</p>`) // v0.5.6: the filter reaches the Code section (files only, no folders)
        : cn.length || cf.length ? tree(null) + (byF._ || []).map(n => crow(n, 0)).join("") : `<p class="nb-codeempty">No code files yet. Make one in <b>My Code</b> on the Main Menu.</p>`}</div>` : "");
  }
  /* the line between the notes folders and the Code section: drag it (or ↑/↓) to share the column; the Code part's height
     is kept (store "codesech"); folded, the Code section takes only its header (Devon, Oct 12 2026) */
  function wireFsplit(){
    const sp = $(".nb-fsplit", fold), main = $(".nb-fmain", fold), code = $(".nb-fcode", fold); if (!sp || !code) return;
    const open = !store.get("codesecfold", false); fold.classList.add("has-fsplit"); fold.classList.toggle("code-shut", !open);
    const total = () => fold.clientHeight, set = (hgt, keep) => { const H = total(); if (!H) return; hgt = Math.round(Math.max(44, Math.min(H - 120, hgt))); code.style.height = hgt + "px"; sp.setAttribute("aria-valuemin", "44"); sp.setAttribute("aria-valuemax", String(Math.max(44, H - 120))); sp.setAttribute("aria-valuenow", String(hgt)); if (keep) store.set("codesech", hgt); };
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
    const t = $(".nb-codet", fold);
    if (t) { t.onclick = () => { store.set("codesecfold", !store.get("codesecfold", false)); drawFolders(); };
      $('[data-a="gocode"]', fold).onclick = () => { flushEd(); go({ view: "notes", space: "code" }); }; }
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
    const t = folderDrop(e), nr = !t && noteRowDrop(e); clearDrop(); if (!t && !nr) return;
    e.preventDefault(); e.dataTransfer.dropEffect = DRAG.type === "code" ? "copy" : "move";
    if (nr) { nr.el.classList.add(nr.after ? "drop-after" : "drop-before"); return; }
    t.el.classList.add(t.how === "before" ? "drop-before" : t.how === "after" ? "drop-after" : "drop");
  });
  fold.addEventListener("dragleave", e => { if (!fold.contains(e.relatedTarget)) clearDrop(); });
  fold.addEventListener("drop", e => {
    const t = folderDrop(e), nr = !t && noteRowDrop(e); clearDrop(); if (nr) { e.preventDefault(); dropOnNote(nr); return; } if (!t) return; e.preventDefault();
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
  // the notes list is part of the Folders & Files bar now (v0.5.5)
  function drawList(){ drawFolders(); }
  // the notes in a group in their new order → fold them into the full My order (notes not listed keep their places)
  function reorder(ids){
    const full = NS.list().sort(NS.byOrder).map(n => n.id), shown = new Set(ids), slots = [];
    full.forEach((id, i) => { if (shown.has(id)) slots.push(i); });
    slots.forEach((i, k) => { full[i] = ids[k]; });
    NS.setOrder(full); drawFolders();
  }
  // a note dragged over another note in the bar: before or after it (My order); dropped in a folder's or Unfiled's list it is filed there too
  const noteRowDrop = e => {
    if (!DRAG || DRAG.type !== "note" || NOTES.sort === "recent") return null;
    const it = e.target.closest(".nb-fnote:not(.nb-cfile)[data-id]"); if (!it || it.dataset.id === DRAG.id || !fold.contains(it)) return null;
    const r = it.getBoundingClientRect(), tile = it.classList.contains("nb-tile");
    return { el: it, after: tile ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2 };
  };
  function dropOnNote(t){
    const id = DRAG.id, g = t.el.dataset.g, full = NS.list().sort(NS.byOrder).map(n => n.id).filter(x => x !== id);
    let at = full.indexOf(t.el.dataset.id); if (t.after) at++; full.splice(at, 0, id); NS.setOrder(full);
    if (g === "none") NS.update(id, { folder: null, quiet: true }); else if (g && !["all", "fav", "q"].includes(g)) NS.update(id, { folder: g, quiet: true });
    DRAG = null; drawAll();
  }
  let saveT = null, rich = null, lastPane = "p1";
  const flushEd = () => { if (rich) rich.flush(); if (saveT) { clearTimeout(saveT); saveT = null; const ti = $(".nb-title", ed); if (ti && ed.dataset.id && NS.get(ed.dataset.id)) NS.update(ed.dataset.id, { title: ti.value.trim() || "Untitled note" }); } flush2(); };
  const msg = t => { if (NS.toast) NS.toast(esc(t), null, 3000); };
  function drawEd(focusBody){
    if (rich) { rich.destroy(); rich = null; }
    holoEl = null; indEl = null; asEl = null; // the pane is redrawn; ◈ / ↳ / ✦ / A✓ put their panels back if they were open
    if (asKey) { window.removeEventListener("keydown", asKey, true); asKey = null; }
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
        onFav: () => { drawFolders(); },
        onDelete: () => { flushEd(); if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; NS.deleteWithUndo(n.id, id => { if (s.isConnected) { NOTES.sel = id; drawAll(); } }); drawAll(); },
        openSide: id => { drawFolders(); openSplit(id); } });
      return;
    }
    ed.innerHTML = `<div class="nb-bar"><button type="button" class="nb-favb${n.fav ? " on" : ""}" data-a="fav" aria-pressed="${n.fav}" title="${n.fav ? "Remove from favourites" : "Add to favourites"}">${n.fav ? "★" : "☆"}</button><span class="nb-save" role="status" aria-live="polite"></span>
        <button type="button" class="btn-s nb-bar-r" data-a="photo" title="Add photos from this computer (or paste / drop them into the note)">＋ Photo</button><button type="button" class="btn-s" data-a="purl" title="Show a photo from a web address">Photo link</button>
        <button type="button" class="btn-s nr-vid" data-a="video" title="Add a video: a file from this computer, or a YouTube, Vimeo or video link" aria-haspopup="dialog">▶ Video</button>
        <button type="button" class="btn-s set-warn" data-a="del">Delete</button></div>
      <form class="nb-urlrow" hidden><input type="url" placeholder="https://… address of a photo" aria-label="Photo address"><button type="submit" class="btn-s">Insert</button><button type="button" class="btn-s" data-a="purlx">Cancel</button><span class="nb-urlmsg"></span></form>
      <div class="nb-trow"><input class="nb-title" value="${esc(n.title)}" aria-label="Title" maxlength="140"><div class="nb-split" aria-hidden="true" title="Drop a note here to open it beside this one"><span class="nb-split-ic">⧉</span><span>Drop to open side by side</span></div></div>
      <div class="nb-host"></div><input type="file" accept="image/*" multiple hidden>`;
    const ti = $(".nb-title", ed), file = $('input[type="file"]', ed);
    $(".nb-trow", ed).prepend(coverButton(NS, n.id, () => drawList())); // cover photo by the title (v0.5.4)
    rich = NS.mountEditor($(".nb-host", ed), n.id, {
      onSaved: () => patchRows(n.id), // v0.5.6: only this note's rows, not the whole bar
      onEditing: () => saveLine("editing"),
      openNote: id => openLinked(id),
      openSide: id => openFromLink(id), peek: id => peekOpen(id), openFolder: fid => openFolderLink(fid),
      annotations: indShown(), onAnnotation: aid => { IND.open = true; IND.edit = aid; indOpen(n.id); },
      onMessage: msg
    });
    ti.oninput = () => { clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; NS.update(n.id, { title: ti.value.trim() || "Untitled note" }); const it = items.querySelector(`[data-id="${n.id}"] .nb-t`); if (it) it.lastChild.textContent = ti.value.trim() || "Untitled note"; const fr = fold.querySelector(`.nb-fnote[data-id="${n.id}"] .nb-fnt`); if (fr) fr.textContent = ti.value.trim() || "Untitled note"; }, 400); };
    $('[data-a="fav"]', ed).onclick = e => { const m = NS.update(n.id, { fav: !NS.get(n.id).fav, quiet: true }); const b = e.currentTarget; b.classList.toggle("on", m.fav); b.textContent = m.fav ? "★" : "☆"; b.setAttribute("aria-pressed", String(m.fav)); b.title = m.fav ? "Remove from favourites" : "Add to favourites"; drawFolders(); };
    $('[data-a="photo"]', ed).onclick = () => file.click();
    $('[data-a="video"]', ed).onclick = e => { if (window.InquireWidgets && rich) InquireWidgets.videoPanel(e.currentTarget, rich); };
    file.onchange = async () => { const k = await rich.addFiles(file.files); if (!k) msg("Those files are not photos or videos"); file.value = ""; };
    const urlRow = $(".nb-urlrow", ed), urlIn = $("input", urlRow);
    $('[data-a="purl"]', ed).onclick = () => { urlRow.hidden = !urlRow.hidden; if (!urlRow.hidden) urlIn.focus(); };
    $('[data-a="purlx"]', ed).onclick = () => { urlRow.hidden = true; };
    urlRow.onsubmit = e => { e.preventDefault(); if (rich.addURL(urlIn.value)) { urlIn.value = ""; urlRow.hidden = true; } else $(".nb-urlmsg", urlRow).textContent = "Use an https:// address of an image."; };
    holoButton(n); recButton(n); wordCount(); saveLine(); { const sl = $(".nb-save", ed); if (sl && !sl.classList.contains("is-error")) sl.classList.add("quiet"); }
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
    b.onclick = () => { HOLO.open = !HOLO.open; if (HOLO.open) { if (AS.open) asClose(); holoOpen(n.id); } else holoClose(); };
    if (HOLO.open && !SIMPLE()) holoOpen(n.id);
    indButton(n); asButtons(n);
    // short names that show on hover and keyboard focus (v0.5.6, Devon: the symbols alone were not enough)
    [[".nb-holob:not(.nb-indb):not(.nb-aib):not(.nb-gramb)", "Links"], [".nb-indb", "Paranotes"], [".nb-aib", "AI Chat"], [".nb-gramb", "Grammar"]].forEach(([q, l]) => { const x = $(q, ed); if (x) x.dataset.label = l; });
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
    b.onclick = () => { IND.open = !IND.open; if (IND.open) { if (AS.open) asClose(); indOpen(n.id); } else indClose(); };
    if (IND.open && !SIMPLE()) indOpen(n.id);
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
  /* ----- v0.5.6 (Devon): ✦ AI Chat and Aa✓ Grammar check, two more round buttons beside ↳ and ◈. Each opens a box in the same
     corner (one of them at a time; opening one closes the Links and Paranotes boxes, and the other way round). The work
     (requests, LanguageTool, the text map) is in assist.js (NPAssist). ----- */
  const AS = NOTES.as || (NOTES.as = { open: null, box: Object.assign({ r: 16, b: 70, w: 400, h: 460 }, store.get("asbox", {})), chats: {}, g: null });
  let asEl = null, asKey = null;
  const GST = () => Object.assign({ def: "school", lang: "en-US", notes: {} }, store.get("grammar", {}));
  /* ----- Word count (v0.5.8, Devon): a slim line at the bottom of the note, between 🎙 and the corner buttons: words,
     characters, reading time; with words selected, the count of the selection. Widgets and paranotes are not counted;
     Chinese and Japanese characters count one word each. ----- */
  function countText(root, range){
    let t = ""; const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: x => x.parentElement && x.parentElement.closest(".nw, .nann-layer, .np-ck") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let x; while ((x = tw.nextNode())) { if (range && !range.intersectsNode(x)) continue; let v = x.data;
      if (range) v = v.slice(x === range.startContainer ? range.startOffset : 0, x === range.endContainer ? range.endOffset : v.length);
      t += v + (x.parentElement && /^(DIV|P|LI|H\d)$/.test(x.parentElement.tagName) ? " " : ""); }
    t = t.replace(/\u200b/g, "");
    const cjk = (t.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const words = (t.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’_-]*/gu) || []).length + cjk;
    const chars = [...t.replace(/\s+$/, "").replace(/^\s+/, "")].filter(c => c !== "\n").length, bare = [...t].filter(c => !/\s/.test(c)).length;
    return { words, chars, bare };
  }
  function wordCount(){
    if (CODE || !rich) return;
    const bar = h("div", { class: "nb-wc num", role: "status", "aria-live": "off", title: "Word count" }); ed.appendChild(bar);
    const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
    const paint = () => { if (!rich || !bar.isConnected) return;
      const all = countText(rich.el), sel = getSelection(), r = sel.rangeCount && !sel.isCollapsed && rich.el.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : null;
      const mins = all.words / 238, read = all.words ? (mins < 1 ? "under 1 min read" : `${Math.round(mins)} min read`) : "";
      if (r) { const c = countText(rich.el, r); bar.classList.add("sel"); bar.innerHTML = `<b>${c.words.toLocaleString()}</b> <span>of ${plural(all.words, "word")} selected</span><span class="nb-wcx"> <span>· ${plural(c.chars, "character")}</span></span>`; }
      else { bar.classList.remove("sel"); bar.innerHTML = `<b>${plural(all.words, "word")}</b><span class="nb-wcx"> <span>· ${plural(all.chars, "character")}</span>${read ? ` · <span>${read}</span>` : ""}</span>`; } // one phrase per span, so each translates (i18n.js)
      bar.title = `${plural(all.words, "word")} · ${plural(all.chars, "character")} (${all.bare.toLocaleString()} without spaces)${read ? " · " + read : ""}`; };
    let t = 0; const later = ms => { clearTimeout(t); t = setTimeout(paint, ms); };
    rich.el.addEventListener("input", () => later(200));
    const ro = new MutationObserver(() => later(250)); ro.observe(rich.el, { childList: true, subtree: false });
    const onSel = () => { if (bar.isConnected) later(120); else { document.removeEventListener("selectionchange", onSel); ro.disconnect(); } };
    document.addEventListener("selectionchange", onSel); m.cleanup.push(() => { document.removeEventListener("selectionchange", onSel); ro.disconnect(); });
    paint();
  }
  /* ----- 🎙 Record (v0.5.8, Devon): bottom left of the note, in Simple and Professional ----- */
  function recButton(n){
    if (CODE) return;
    const old = $(".nb-rec", ed); if (old) old.remove();
    const box = h("div", { class: "nb-rec", role: "group", "aria-label": "Audio recording" });
    ed.appendChild(box); recPaint(box, n);
  }
  function recPaint(box, n){
    box = box || $(".nb-rec", ed); if (!box) return;
    const MIC = window.InquireWidgets ? InquireWidgets.MIC_IC : "🎙";
    if (!REC.on) {
      box.className = "nb-rec";
      box.innerHTML = `<button type="button" class="nb-recb" data-label="Record" title="Record audio into this note (your microphone)" aria-label="Record audio into this note">${MIC}</button>`;
      $(".nb-recb", box).onclick = () => recStart(n);
      return;
    }
    const other = REC.noteId !== NOTES.sel, nt = NS.get(REC.noteId);
    box.className = "nb-rec on" + (REC.paused ? " paused" : "");
    box.innerHTML = `<span class="nb-recdot" aria-hidden="true"></span><span class="nb-rect num" role="timer" aria-live="off">${InquireWidgets.clock(recSecs())}</span><span class="nb-reclv" aria-hidden="true"><i></i></span>`
      + `<span class="nb-recs">${REC.paused ? "Paused" : "Recording"}${other && nt ? ` into “${esc(nt.title)}”` : ""}</span>`
      + `<button type="button" class="nb-recx" data-r="pause" title="${REC.paused ? "Carry on recording" : "Pause"}" aria-label="${REC.paused ? "Resume" : "Pause"}">${REC.paused ? "▶" : "❚❚"}</button>`
      + `<button type="button" class="nb-recx nb-recstop" data-r="stop" title="Stop and put the recording in the note" aria-label="Stop and save">■ Save</button>`
      + `<button type="button" class="nb-recx" data-r="cancel" title="Throw this recording away" aria-label="Discard the recording">✕</button>`;
    box.onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; if (b.dataset.r === "pause") recPause(); else if (b.dataset.r === "stop") recStop(true); else recStop(false); };
  }
  async function recStart(n){
    if (REC.on) return;
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia || !window.MediaRecorder) { msg("Recording needs a microphone, and this window can't reach one."); return; }
    let stream;
    try { stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { msg(/NotAllowed|Security|Permission/i.test(e && e.name || "") ? (/Mac/.test(navigator.platform) ? "NotePath may not use the microphone. Turn it on in System Settings › Privacy & Security › Microphone, then try again." : "NotePath may not use the microphone. Allow it in your system's privacy settings, then try again.") : "No microphone was found."); return; }
    const mime = recMime(); let mr;
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined); } catch (e) { stream.getTracks().forEach(t => t.stop()); msg("This computer can't record audio here."); return; }
    Object.assign(REC, { on: true, mr, stream, chunks: [], noteId: n.id, paused: false, acc: 0, t0: performance.now(), mime: mr.mimeType || mime || "audio/webm", started: new Date() });
    mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
    mr.start(1000);
    // a small level meter (≈ 12 updates a second)
    try { const AC = window.AudioContext || window.webkitAudioContext; REC.ac = new AC(); const an = REC.ac.createAnalyser(); an.fftSize = 512; REC.ac.createMediaStreamSource(stream).connect(an); REC.an = an; REC.buf = new Uint8Array(an.fftSize); } catch (e) {}
    REC.tick = setInterval(recTick, 80);
    window.__npRec = () => ({ on: REC.on, paused: REC.paused, secs: recSecs(), level: REC.lv || 0, note: REC.noteId }); // for the tests
    if (REC.ac && REC.ac.resume) REC.ac.resume().catch(() => {});
    recPaint(null, n); const sb = $(".nb-recstop", ed); if (sb) sb.focus({ preventScroll: true });
  }
  function recTick(){
    if (!REC.on) return;
    const box = $(".nb-rec.on", ed); if (box) {
      const t = $(".nb-rect", box); if (t) t.textContent = InquireWidgets.clock(recSecs());
      const lv = $(".nb-reclv i", box); if (lv && REC.an && !REC.paused) { REC.an.getByteTimeDomainData(REC.buf); let pk = 0; for (let i = 0; i < REC.buf.length; i += 4) pk = Math.max(pk, Math.abs(REC.buf[i] - 128)); REC.lv = Math.max(REC.lv || 0, pk); lv.style.transform = `scaleX(${Math.min(1, pk / 90).toFixed(2)})`; }
    }
    if (recSecs() >= REC_MAX) { recStop(true); msg("Recordings stop at 3 hours: this one is saved."); }
  }
  function recPause(){
    if (!REC.on) return;
    if (REC.paused) { REC.mr.resume(); REC.paused = false; REC.t0 = performance.now(); }
    else { REC.mr.pause(); REC.paused = true; REC.acc += performance.now() - REC.t0; }
    recPaint();
  }
  function recStop(keep){
    if (!REC.on) return Promise.resolve();
    const R = Object.assign({}, REC), dur = recSecs();
    clearInterval(REC.tick); REC.on = false;
    try { if (R.ac) R.ac.close(); } catch (e) {}
    const done = new Promise(res => { R.mr.onstop = res; });
    try { R.mr.stop(); } catch (e) {}
    R.stream.getTracks().forEach(t => t.stop());
    const box = $(".nb-rec", ed); if (box) recPaint(box, NS.get(NOTES.sel) || { id: NOTES.sel });
    return done.then(async () => {
      if (!keep) { msg("Recording thrown away."); return; }
      const blob = new Blob(R.chunks, { type: R.mime.split(";")[0] || "audio/webm" });
      if (!blob.size) { msg("Nothing was recorded."); return; }
      const d = R.started, title = "Recording · " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      try {
        if (rich && rich.id === R.noteId && rich.addAudio && s.isConnected) { await rich.addAudio(blob, { title, dur }); }
        else { const nt = NS.get(R.noteId); if (!nt) { msg("The note for that recording is gone."); return; }
          const vid = await NS.putVideo(blob), w = InquireWidgets.create("audio", { vid, title, dur: Math.round(dur), mime: blob.type });
          NS.update(R.noteId, { html: (nt.html || "") + w.outerHTML + "<div><br></div>" }); }
        msg(`Saved the recording (${InquireWidgets.clock(dur)}) in the note.`);
      } catch (e) { msg("The recording could not be saved."); }
    });
  }
  m.cleanup.push(() => { if (REC.on) recStop(true); });
  function asButtons(n){
    [["ai", "nb-aib", "AI Chat", "AI Chat: ask about this note, or have it write, sum up or explain", aiFigure()],
     ["gram", "nb-gramb", "Grammar check", "Grammar check: spelling, grammar and style, set to the kind of note you are writing", `<span aria-hidden="true" class="nb-gramg">A<small>✓</small></span>`]].forEach(([k, cls, label, title, ic]) => {
      const b = h("button", { type: "button", class: "nb-holob " + cls, "aria-label": label, title, "aria-expanded": String(AS.open === k) }, ic);
      ed.appendChild(b); b.onclick = () => { if (AS.open === k) asClose(); else asOpen(k, n.id); };
    });
    if (AS.open && !(SIMPLE() && AS.open === "ai")) asOpen(AS.open, n.id);
  }
  function asClose(){ AS.open = null; if (asEl) { asEl.remove(); asEl = null; } if (asKey) { window.removeEventListener("keydown", asKey, true); asKey = null; } ed.querySelectorAll(".nb-aib, .nb-gramb").forEach(b => b.setAttribute("aria-expanded", "false")); }
  function asFit(){
    if (!asEl) return; const W = ed.clientWidth, H = ed.clientHeight, x = AS.box;
    x.w = Math.max(280, Math.min(x.w, W - 8)); x.h = Math.max(240, Math.min(x.h, H - 8));
    x.r = Math.max(4, Math.min(x.r, W - x.w - 4)); x.b = Math.max(4, Math.min(x.b, H - x.h - 4));
    Object.assign(asEl.style, { right: x.r + "px", bottom: x.b + "px", width: x.w + "px", height: x.h + "px" });
  }
  function asOpen(k, id){
    if (HOLO.open) holoClose(); if (IND.open) indClose();
    if (asEl) asEl.remove(); if (asKey) { window.removeEventListener("keydown", asKey, true); asKey = null; }
    AS.open = k; ed.querySelectorAll(".nb-aib, .nb-gramb").forEach(b => b.setAttribute("aria-expanded", String(b.classList.contains(k === "ai" ? "nb-aib" : "nb-gramb"))));
    asEl = h("div", { class: "np-holo np-as np-as-" + k, role: "dialog", "aria-label": k === "ai" ? "AI Chat" : "Grammar check" });
    ed.appendChild(asEl); asFit();
    if (k === "ai") aiPanel(id); else gramPanel(id);
    panelResize(asEl, AS.box, asFit, "asbox");
    asKey = e => { if (e.key === "Escape" && asEl && !document.querySelector(".tm-menu, .np-pop, .ask-ov")) { e.preventDefault(); e.stopPropagation(); asClose(); } };
    window.addEventListener("keydown", asKey, true);
  }
  const asHead = (t, extra) => `<div class="np-holo-h"><div class="np-holo-tabs"><span class="np-as-t">${t}</span></div>${extra || ""}<button type="button" class="np-holo-x" aria-label="Close">✕</button></div>`;
  const noteText = id => { const n = NS.get(id); if (!n) return null; const t = rich && rich.el ? NPAssist.textMap(rich.el).text : n.body || ""; return { title: n.title, text: t }; };
  // ✦ AI Chat: a conversation per note for this session (not saved); "Read this note" sends the note with each question
  function aiPanel(id){
    const chat = AS.chats[id] || (AS.chats[id] = []);
    asEl.innerHTML = asHead("✦ AI Chat", `<button type="button" class="np-as-new" title="Start a new chat about this note">New chat</button>`)
      + `<div class="np-holo-bar"><label class="np-ind-show"><input type="checkbox" class="np-ai-read"${store.get("airead", true) !== false ? " checked" : ""}><span>Read this note</span></label><span class="np-as-st"></span></div>
      <div class="np-holo-b np-ai-b" aria-live="polite"></div>
      <form class="np-ai-f"><textarea rows="2" maxlength="8000" placeholder="Ask anything… e.g. Sum up this note · Give me 5 ideas · Explain the second paragraph" aria-label="Message to the AI"></textarea><button type="submit" class="np-ai-send" title="Send (Enter; Shift+Enter for a new line)">Send</button></form>
      <div class="np-holo-rzs">${RZ}</div>`;
    const body = $(".np-ai-b", asEl), f = $(".np-ai-f", asEl), ta = $("textarea", f), st = $(".np-as-st", asEl);
    $(".np-holo-x", asEl).onclick = () => asClose();
    $(".np-ai-read", asEl).onchange = e => store.set("airead", e.target.checked);
    $(".np-as-new", asEl).onclick = () => { chat.length = 0; draw(); ta.focus(); };
    let busy = false, ready = null;
    const draw = () => {
      body.innerHTML = (ready === false ? `<div class="np-ai-off"><b>AI Chat is not set up in this copy of NotePath.</b><p>It uses the same AI key as My Code's ⇄ Translate: put the key in <code>ai.config.json</code> beside NotePath (copy <code>ai.config.example.json</code>), then open NotePath again. Settings → Code shows whether it is ready.</p></div>` : "")
        + (chat.length ? chat.map((m, i) => `<div class="np-ai-m ${m.role === "user" ? "me" : m.err ? "err" : "ai"}"><div class="np-ai-tx">${m.role === "user" || m.err ? esc(m.content).replace(/\n/g, "<br>") : NPAssist.toHTML(m.content)}</div>${m.role === "assistant" && !m.err ? `<div class="np-ai-acts"><button type="button" data-copy="${i}">Copy</button><button type="button" data-ins="${i}" title="Add this answer to the note, after the line you were on">＋ Add to note</button></div>` : ""}</div>`).join("")
          : ready !== false ? `<p class="np-hl-none">Ask about this note, or ask it to write something for you: a summary, a list of ideas, a clearer version, an explanation. Tip: select words in the note and right-click → <b>Ask AI…</b> to work on just those words.</p>` : "")
        + (busy ? `<div class="np-ai-m ai busy"><div class="np-ai-tx">Thinking…</div></div>` : "");
      body.scrollTop = body.scrollHeight;
      f.querySelector("button").disabled = busy || ready === false; ta.disabled = ready === false;
      body.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => { const t = chat[+b.dataset.copy].content; if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => msg("Copied"), () => msg("Could not copy")); });
      body.querySelectorAll("[data-ins]").forEach(b => b.onclick = () => { if (rich && rich.insertBlock && rich.insertBlock(NPAssist.toHTML(chat[+b.dataset.ins].content))) msg("Added to the note"); });
    };
    const send = async () => {
      const q = ta.value.trim(); if (!q || busy || ready === false) return;
      chat.push({ role: "user", content: q }); ta.value = ""; busy = true; draw();
      try { const a = await NPAssist.ask(NPAssist.chatRequest(chat.filter(m => !m.err), $(".np-ai-read", asEl) && $(".np-ai-read", asEl).checked ? noteText(id) : null)); chat.push({ role: "assistant", content: a || "(no answer)" }); }
      catch (e) { chat.push({ role: "assistant", err: true, content: e && e.message ? e.message : "The AI did not answer." }); }
      busy = false; if (asEl && asEl.isConnected && AS.open === "ai") draw();
    };
    f.onsubmit = e => { e.preventDefault(); send(); };
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    draw();
    NPAssist.aiStatus().then(s => { ready = !!(s && s.configured); if (!asEl || AS.open !== "ai") return; st.textContent = ready ? (s.model ? "Ready · " + s.model : "Ready") : "Not set up"; st.classList.toggle("off", !ready); draw(); if (ready) ta.focus({ preventScroll: true }); });
  }
  // Aa✓ Grammar check: pick the kind of note (how strict), check, then take a suggestion or ignore it; click one to see it in the note
  function gramPanel(id){
    const G = GST(), type = G.notes[id] || G.def;
    if (!AS.g || AS.g.id !== id) AS.g = { id, list: null, err: "", busy: false, cut: false };
    const S = AS.g;
    asEl.innerHTML = asHead("A✓ Grammar check")
      + `<div class="np-gr-set"><label><span>This note is</span><select class="np-gr-type" aria-label="Kind of note">${NPAssist.GTYPES.map(t => `<option value="${t[0]}"${t[0] === type ? " selected" : ""}>${t[1]}</option>`).join("")}</select></label>
        <label><span>Language</span><select class="np-gr-lang" aria-label="Language">${NPAssist.GLANGS.map(l => `<option value="${l[0]}"${l[0] === G.lang ? " selected" : ""}>${l[1]}</option>`).join("")}</select></label>
        <p class="np-gr-what"></p><button type="button" class="np-gr-go">Check this note</button></div>
      <div class="np-holo-b np-gr-b" aria-live="polite"></div><p class="np-gr-foot">Checked by LanguageTool (free): the note's words are sent to languagetool.org when you press Check.</p><div class="np-holo-rzs">${RZ}</div>`;
    const tSel = $(".np-gr-type", asEl), lSel = $(".np-gr-lang", asEl), what = $(".np-gr-what", asEl), body = $(".np-gr-b", asEl), go = $(".np-gr-go", asEl);
    $(".np-holo-x", asEl).onclick = () => asClose();
    const say = () => { what.textContent = NPAssist.gtype(tSel.value)[2]; };
    tSel.onchange = () => { const g = GST(); g.notes[id] = tSel.value; g.def = tSel.value; store.set("grammar", g); say(); if (S.list) { S.list = null; draw(); } };
    lSel.onchange = () => { const g = GST(); g.lang = lSel.value; store.set("grammar", g); };
    const draw = () => {
      go.disabled = S.busy; go.textContent = S.busy ? "Checking…" : S.list ? "Check again" : "Check this note";
      if (S.err) { body.innerHTML = `<p class="np-gr-msg bad">${esc(S.err)}</p>`; return; }
      if (!S.list) { body.innerHTML = S.busy ? "" : `<p class="np-hl-none">Choose the kind of note you are writing, then press <b>Check this note</b>. A quick note only gets spelling and clear mistakes; formal writing gets every rule.</p>`; return; }
      if (!S.list.length) { body.innerHTML = `<p class="np-gr-ok">${S.fixed ? "✓ All done. Press Check again to look once more." : `✓ No problems found (checked as ${esc(NPAssist.gtype(tSel.value)[1])}).`}</p>` + (S.cut ? `<p class="np-gr-msg">Only the first ${NPAssist.GT_MAX.toLocaleString()} characters were checked.</p>` : ""); return; }
      body.innerHTML = `<p class="np-gr-n">${S.list.length} ${S.list.length === 1 ? "thing" : "things"} to look at${S.cut ? ` (the first ${NPAssist.GT_MAX.toLocaleString()} characters)` : ""}</p>`
        + S.list.map(m => `<div class="np-gr-m k-${m.kind}" data-g="${m.id}"><button type="button" class="np-gr-w" data-show="${m.id}" title="Show it in the note"><s>${esc(m.bad)}</s><span class="np-gr-cat">${esc(m.kind === "spelling" ? "Spelling" : m.cat || "Grammar")}</span></button><p>${esc(m.message)}</p>
          <div class="np-gr-reps">${m.reps.map((r, j) => `<button type="button" class="np-gr-rep" data-fix="${m.id}" data-r="${j}">${r === "" ? "<i>remove it</i>" : esc(r)}</button>`).join("")}<button type="button" class="np-gr-ign" data-ign="${m.id}">Ignore</button></div></div>`).join("");
      body.querySelectorAll("[data-show]").forEach(b => b.onclick = () => show(S.list.find(m => m.id === b.dataset.show)));
      body.querySelectorAll("[data-fix]").forEach(b => b.onclick = () => fix(S.list.find(m => m.id === b.dataset.fix), +b.dataset.r));
      body.querySelectorAll("[data-ign]").forEach(b => b.onclick = () => { S.fixed = true; S.list = S.list.filter(m => m.id !== b.dataset.ign); draw(); });
    };
    const where = m => { if (!rich || !rich.el) return null; const map = NPAssist.textMap(rich.el), at = NPAssist.locate(map, m); return at < 0 ? null : { at, r: NPAssist.rangeAt(map, at, m.length) }; };
    const show = m => { const w = m && where(m); if (!w || !w.r) { msg("That part of the note has changed. Check again."); return; }
      rich.el.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(w.r); const el = w.r.startContainer.parentElement; if (el) el.scrollIntoView({ block: "nearest" }); };
    const fix = (m, j) => { const w = m && where(m); if (!w || !w.r) { msg("That part of the note has changed. Check again."); return; }
      const rep = m.reps[j]; rich.el.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(w.r);
      if (rep === "") document.execCommand("delete"); else document.execCommand("insertText", false, rep);
      if (rich.changed) rich.changed();
      S.fixed = true; S.list = NPAssist.shiftMatches(S.list.filter(x => x.id !== m.id), w.at, m.length, rep.length); draw(); };
    go.onclick = async () => {
      const t = noteText(id); if (!t || !t.text.trim()) { S.err = ""; S.list = []; draw(); return; }
      S.busy = true; S.err = ""; S.fixed = false; draw();
      try { const r = await NPAssist.grammarCheck(t.text, tSel.value, lSel.value); S.list = r.matches; S.cut = r.cut; } catch (e) { S.err = e && e.message ? e.message : "The check did not work."; S.list = null; }
      S.busy = false; if (asEl && AS.open === "gram" && AS.g === S) draw();
    };
    say(); draw();
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
      <div class="np-holo-bar"><span class="np-holo-lbl">Show as</span>${viewSwitch(viewOf("holoview"), "Show the links as")}</div>
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
    // a link row (v0.5.5): 👁 Peek and ⧉ sit right after the title in every view, so they never cover it or fall off a narrow box
    const acts = x => `<span class="np-hl-acts">${side(x)}</span>`, ttl = x => `<span class="np-hl-t">${x.fav ? "★ " : ""}${esc(x.title)}</span>`;
    const card = (x, cls, inner) => `<li class="np-hl ${cls}"><div class="np-hl-o" role="button" tabindex="0" data-id="${x.id}" title="Open ${esc(x.title)} · ${esc(noteKind(x))}">${inner}</div></li>`;
    const row = (x, gone) => gone ? `<li class="np-hl gone"><span class="np-hl-t">A deleted note</span><span class="np-hl-f">its link stays in the text</span></li>`
      : view === "icons" ? card(x, "np-hl-tile", `<span class="nb-tic">${NOTE_IC}</span>${ttl(x)}${acts(x)}`)
      : view === "details" ? card(x, "np-hl-row", `<span class="np-hl-nm">${ttl(x)}${acts(x)}</span><span class="np-hl-d num">${esc(stampShort(x.updated))}</span><span class="np-hl-d num">${esc(stampShort(x.created))}</span><span class="np-hl-d">${esc(noteKind(x))}</span>`)
      : view === "compact" ? card(x, "np-hl-crow", `${ttl(x)}<span class="np-hl-d num">${esc(when(x.created))}</span>${acts(x)}`)
      : card(x, "np-hl-lrow", `<span class="np-hl-tr">${ttl(x)}${acts(x)}</span><span class="np-hl-f">${esc(folderName(x))} · ${esc(when(x.updated))}</span>`);
    const head = view === "details" ? `<div class="np-hl-head" aria-hidden="true"><span>Name</span><span>Modified</span><span>Created</span><span>Kind</span></div>` : "";
    const lst = arr => `<ul class="np-hl-list" data-view="${view}">${head}${arr.join("")}</ul>`;
    const SH = HSHOW();
    $(".np-holo-b", holoEl).innerHTML = (SH.back ? `<section data-sec="back"><h4>Notes that link here <span class="num">${back.length}</span></h4>${back.length ? lst(back.map(x => row(x))) : `<p class="np-hl-none">No other note links to this one yet.</p>`}</section>` : "")
      + (SH.out ? `<section data-sec="out"><h4>Links in this note <span class="num">${out.length}</span></h4>${out.length ? lst(out.map(k => row(NS.get(k), !NS.get(k)))) : `<p class="np-hl-none">No links yet. Drag a note in from the side bar, or select words and right-click → Link to a note.</p>`}</section>` : "")
      + (!SH.back && !SH.out ? `<p class="np-hl-none">Tick a box above to list the notes that link here or the links in this note.</p>` : "")
      + (fl.length ? `<section><h4>Folders in this note <span class="num">${fl.length}</span></h4><ul class="np-hl-list">${fl.map(f => f ? `<li class="np-hl"><button type="button" class="np-hl-o" data-fid="${f.id}" title="Open the folder ${esc(f.name)}"><span class="np-hl-t">▤ ${esc(f.name)}</span><span class="np-hl-f">${all.filter(x => NS.subtree(f.id).has(x.folder)).length} notes</span></button></li>` : `<li class="np-hl gone"><span class="np-hl-t">A deleted folder</span></li>`).join("")}</ul></section>` : "");
    holoEl.querySelectorAll("[data-fid]").forEach(b2 => b2.onclick = () => openFolderLink(b2.dataset.fid));
    holoEl.querySelectorAll(".np-hl-o[data-id]").forEach(b2 => { b2.onclick = e => { if (!e.target.closest(".np-hl-s")) openLinked(b2.dataset.id); }; b2.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target === b2) { e.preventDefault(); openLinked(b2.dataset.id); } }; });
    holoEl.querySelectorAll(".np-hl-s[data-side]").forEach(b2 => b2.onclick = e => { e.stopPropagation(); openFromLink(b2.dataset.side); });
    holoEl.querySelectorAll(".np-hl-pk").forEach(b2 => b2.onclick = e => { e.stopPropagation(); peekOpen(b2.dataset.peek); });
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
    t.content.querySelectorAll("div.nw").forEach(w => { const k = w.getAttribute("data-w"); const p = document.createElement("div"); p.className = "np-peek-w"; p.textContent = "▦ " + ({ code: "Code box", music: "Music chart", sheet: "Lead sheet", graph: "Graph", video: "Video", map: "Map", audio: "Audio recording", sign: "Signature" }[k] || "Widget") + " · open the note to see it"; w.replaceWith(p); });
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
      peekEl.innerHTML = `<header role="group" class="np-peek-h" title="Drag to move · double-click to dock"><button type="button" class="np-peek-x np-peek-back" title="Back to the note before" aria-label="Back" hidden>‹</button><div class="np-peek-tt"><span class="np-peek-gem" aria-hidden="true"></span>Peek</div><span class="np-peek-grip" aria-hidden="true">⠿</span>
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
    const show = !!n && !SPLIT.min && !SIMPLE(); // Simple has one note at a time; Professional brings the second one back
    ed2.hidden = !show; edSec.classList.toggle("split", show);
    tabs.hidden = !(n && SPLIT.min) || SIMPLE();
    tabs.innerHTML = n && SPLIT.min ? `<div class="nb-tab"><button type="button" class="nb-tab-t" data-a="max" title="Bring ${esc(n.title)} back beside this note">▣ <span>${esc(n.title)}</span></button><button type="button" class="nb-tab-b" data-a="max" title="Maximise: open it side by side again" aria-label="Maximise ${esc(n.title)}">⤢</button><button type="button" class="nb-tab-b" data-a="close" title="Close" aria-label="Close ${esc(n.title)}">✕</button></div>` : "";
    tabs.querySelectorAll('[data-a="max"]').forEach(b => b.onclick = () => { SPLIT.min = false; drawSplit(); });
    const tx = $('[data-a="close"]', tabs); if (tx) tx.onclick = () => closeSplit();
    ed2.classList.remove("nc-pane");
    if (!show) { ed2.innerHTML = ""; return; }
    if (CODE) {
      ed2.innerHTML = `<div class="nb-p2h"><span class="nb-p2tag">Side by side</span><button type="button" class="btn-s" data-a="swap" title="Make this the main file">Open as main</button><button type="button" class="nb-p2b" data-a="min" title="Minimise to a tab" aria-label="Minimise to a tab">▁</button><button type="button" class="nb-p2b" data-a="close" title="Close this file" aria-label="Close the side file">✕</button></div><div class="nb-p2body"></div>`;
      rich2 = NPCode.pane($(".nb-p2body", ed2), n, { NS, main: false, msg, onSaved: () => drawList(), onTitle: () => { drawList(); drawFolders(); }, openSide: id => { drawFolders(); openSplit(id); } });
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
  edSec.addEventListener("focusin", e => { lastPane = e.target.closest(".p2") ? "p2" : "p1"; }); // the Tool bar's widgets go to the note last written in
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

  function drawAll(focusBody){ drawFolders(); drawEd(focusBody); drawSplit(); }
  m.redraw = drawAll;
  drawAll(focusBody); paintHist();
  m.cleanup.push(() => { flushEd(); if (rich) { rich.destroy(); rich = null; } if (rich2) { rich2.destroy(); rich2 = null; } hideCaret(); });
}

/* ---------- desktop shell (only inside the NotePath app) ---------- */
let DESK_VERSION = "";
if (window.inquireDesktop) {
  const D = window.inquireDesktop;
  document.documentElement.classList.add("desktop", "os-" + D.platform);
  if (D.onRoute) D.onRoute(r => { if (r && r.note) return openNoteLink(r.note); if (r && r.folderLink) return openFolderLinkTo(r.folderLink); if (r && r.view) go(r); }); // tray menu: Open My Tasks, the next reminder
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
  noteLink, openNoteLink, folderLink, openFolderLinkTo, coverButton,
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
// v0.5.6: the notes load from IndexedDB first (a few ms; on the first start of 0.5.6 they are moved there from localStorage)
const startUp = () => { render(); try { history.replaceState({ view: "menu" }, "", "#menu"); } catch(e){} if (initial && initial.view === "notes") go(initial, false); };
if (window.InquireNotes && InquireNotes.ready && !InquireNotes.isReady()) InquireNotes.ready.then(startUp, startUp); else startUp();
})();
