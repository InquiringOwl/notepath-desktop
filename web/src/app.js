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

function go(next, push = true){
  closeWins();
  // My notes already on screen: just show the folder / note asked for
  if (next.view === "notes" && S.view === "notes" && NPAGE) { NPAGE.show(next); return; }
  S.view = next.view === "notes" ? "notes" : "menu"; S.opts = next;
  render();
  viewIn(viewEl);
  if (push) { try { history.pushState({ view: S.view }, "", "#" + S.view); } catch(e){} }
  else { try { history.replaceState({ view: S.view }, "", "#" + S.view); } catch(e){} }
  window.dispatchEvent(new CustomEvent("inquire:route"));
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
  if (t === "notes") return { view: "notes" };
  if (t === "favourites") return { view: "notes", folder: "fav" };
  return t === "menu" ? { view: "menu" } : null;
}

function render(){
  clearView(); crumbs();
  if (S.view === "notes") renderNotesPage(S.opts || {}); else renderMenu();
  viewEl.focus({ preventScroll: true });
}
function crumbs(){
  const c = $("#crumbs"); c.innerHTML = "";
  if (S.view === "notes") {
    c.appendChild(h("button", { type: "button", class: "crumb", onclick: () => go({ view: "menu" }) }, "Main Menu"));
    c.appendChild(h("span", { class: "sep" }, "›")); c.appendChild(h("span", { class: "here" }, "My notes"));
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
    <header class="set-h mw-h"><span class="dot"></span><h2 id="mw-t-${id}">${esc(o.title || "")}</h2>${o.sub ? `<span class="mw-sub">${o.sub}</span>` : ""}<span class="mw-hx"></span><button type="button" class="set-x" aria-label="Close ${esc(o.title || "window")}">✕</button></header>
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
  $(".set-x", ov).onclick = () => m.close();
  ov.addEventListener("pointerdown", e => { if (e.target === ov) m.close(); });
  requestAnimationFrame(() => { if (!m.closed) document.body.classList.add("mw-open"); });
  setTimeout(() => { if (!m.closed && !m.win.contains(document.activeElement)) m.win.focus({ preventScroll: true }); }, 40);
  m.win.tabIndex = -1;
  window.dispatchEvent(new CustomEvent("inquire:window", { detail: { id, open: true } }));
  return m;
}
/* ---------- My notes page (#notes): a page like the start menu, not a window over it (Devon, Oct 2026) ----------
   o.folder ("all" | "fav" | "none" | folder id), o.sel (note id). NPAGE.show(o) switches folder / note in place. */
let NPAGE = null;
function renderNotesPage(o = {}){
  if (o.folder) { NOTES.folder = o.folder; NOTES.q = ""; }
  if (o.sel) NOTES.sel = o.sel;
  const pg = h("div", { class: "npage" });
  pg.innerHTML = `<section class="np-win win" aria-labelledby="np-t">
    <header class="set-h mw-h"><span class="dot"></span><h2 id="np-t">My notes</h2><span class="mw-sub">All notes are saved on this computer.</span><span class="mw-hx"></span></header>
    <div class="mw-body"></div></section>`;
  viewEl.appendChild(pg);
  const m = { body: $(".mw-body", pg), head: $(".mw-hx", pg), cleanup: [] };
  renderNotes(m, o.focusBody);
  NPAGE = { show(x){ if (x.folder) { NOTES.folder = x.folder; NOTES.q = ""; } if (x.sel) NOTES.sel = x.sel; m.redraw(x.focusBody); }, newNote: () => m.newNote() };
  cleanup.push(() => { m.cleanup.forEach(f => { try { f(); } catch(e){} }); NPAGE = null; });
}
// ＋ New Note (My notes, Alt+Shift+N): ask for a title, then open the note in My notes. o.folder files it there.
const NOTE_KINDS = [
  { k: "text", glyph: "✎", name: "Standard note", desc: "Text, lists, photos, video and widgets", placeholder: "Untitled note" },
  { k: "code", glyph: "&lt;/&gt;", name: "Code note", desc: "Starts with a code box: highlighting, line numbers", placeholder: "Untitled code" },
  { k: "sheet", glyph: "𝄞", name: "Music chart", desc: "A blank lead sheet: bars, chords, melody", placeholder: "Untitled chart" }];
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function newNote(o = {}){
  const NS = window.InquireNotes; if (!NS) return;
  const r = await askText({ title: "New note", label: "Note title", placeholder: "Untitled note", ok: "Create note", max: 140, kinds: NOTE_KINDS });
  if (r == null) return;
  const title = r.text || (r.kind === "code" ? "Untitled code" : r.kind === "sheet" ? "Untitled chart" : "Untitled note");
  const html = r.kind === "code" ? `<div class="nw" data-w="code" data-src="${attr(JSON.stringify({ lang: "python", title: r.text || "", src: "" }))}"></div><div><br></div>`
    : r.kind === "sheet" ? `<div class="nw" data-w="sheet" data-src="${attr(JSON.stringify(Object.assign({}, window.NPSheet ? NPSheet.DEF : {}, { title: r.text || "" })))}"></div><div><br></div>` : undefined;
  const n = NS.create({ title, html, folder: o.folder || null, fav: !!o.fav });
  NOTES.q = "";
  go({ view: "notes", sel: n.id, focusBody: r.kind === "code" ? "code" : r.kind === "sheet" ? "sheet" : true });
}

/* ---------- start menu ----------
   The Notes console: My notes, Note Office (office.js) and two slots not linked to anything yet ("Coming soon"); under them
   the three most recent notes. New notes are made in My notes (＋ New Note). */
function renderMenu(){
  const s = h("div", { class: "screen" });
  s.innerHTML = `<div class="screen-in">
    <div class="hello"><p class="eyebrow">NotePath</p><h1>Main Menu</h1></div>
    <section class="npn win" aria-labelledby="npn-t">
      <header class="win-h npn-h"><span class="dot"></span><span id="npn-t">Notes</span><span class="npn-count num"></span></header>
      <div class="slots npn-acts">
        <button type="button" class="slot big" data-a="open"><span class="glyph">▤</span><span><h3>My notes</h3><p>Every note, folder and photo, with search and your own order. Start a new note there with ＋ New Note.</p></span><span class="tag num" data-n="all"></span></button>
        <button type="button" class="slot big npn-office" data-a="office"><span class="glyph">⌂</span><span><h3>Note Office</h3><p>Your notes as a little office: a sheet for every note, a box for every folder. Someone works there.</p></span></button>
        ${[1, 2].map(() => `<button type="button" class="slot big locked npn-soon" aria-disabled="true" tabindex="-1"><span class="glyph">◇</span><span><h3>Coming soon</h3></span></button>`).join("")}
      </div>
      <div class="npn-recent"><h2 class="npn-sub">Recent</h2><div class="mnotes-list"></div></div>
    </section>
    <div class="verline" id="verline"></div></div>`;
  viewEl.appendChild(s);
  if (window.inquireDesktop) $("#verline", s).innerHTML = `<span>NotePath <span class="num">v${esc(DESK_VERSION || "")}</span></span>`; // updates: Settings → About
  $('[data-a="open"]', s).onclick = () => go({ view: "notes", folder: "all" });
  $('[data-a="office"]', s).onclick = () => { if (window.NoteOffice) NoteOffice.open(); };
  const NS = window.InquireNotes, list = $(".mnotes-list", s);
  const draw = () => {
    const all = NS ? NS.list() : [], top = all.slice(0, 3);
    $(".npn-count", s).textContent = all.length + (all.length === 1 ? " note" : " notes");
    $('[data-n="all"]', s).textContent = all.length;
    list.innerHTML = top.length ? top.map(n => `<button type="button" class="mnote" data-id="${n.id}"><span class="mnote-t">${n.fav ? '<i class="nb-star" aria-label="Favourite">★</i> ' : ""}${esc(n.title)}</span><span class="mnote-b">${esc(n.body.slice(0, 160))}</span><span class="mnote-m">${when(n.updated)}</span></button>`).join("")
      : `<p class="mnotes-empty">No notes yet. Open <b>My notes</b> and choose <b>＋ New Note</b> to write your first one.</p>`;
    list.querySelectorAll(".mnote").forEach(b => b.onclick = () => go({ view: "notes", folder: "all", sel: b.dataset.id }));
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
      <div class="ask-body">${o.kinds ? `<div class="ask-kinds" role="radiogroup" aria-label="Kind of note">${o.kinds.map((k, i) => `<button type="button" role="radio" class="ask-kind" data-k="${k.k}" aria-checked="${i === 0}"><span class="ask-kg" aria-hidden="true">${k.glyph}</span><b>${esc(k.name)}</b><small>${esc(k.desc)}</small></button>`).join("")}</div>` : ""}<label class="ask-l" for="ask-in">${esc(o.label || "Name")}</label>
        <input id="ask-in" class="ask-in" maxlength="${o.max || 140}" placeholder="${esc(o.placeholder || "")}" value="${esc(o.value || "")}" autocomplete="off">
        <div class="ask-btns"><button type="button" class="btn-s" data-x>Cancel</button><button type="submit" class="btn good">${esc(o.ok || "OK")}</button></div></div></form>`);
    document.body.appendChild(ov);
    requestAnimationFrame(() => document.body.classList.add("ask-open"));
    const inp = $(".ask-in", ov);
    const fin = v => { document.body.classList.remove("ask-open"); document.removeEventListener("keydown", key, true); ov.classList.add("out"); setTimeout(() => ov.remove(), 250); if (last && document.contains(last)) try { last.focus({ preventScroll: true }); } catch (e) {} done(v); };
    const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fin(null); } };
    document.addEventListener("keydown", key, true);
    ov.querySelectorAll("[data-x]").forEach(b => b.onclick = () => fin(null));
    ov.addEventListener("pointerdown", e => { if (e.target === ov) fin(null); });
    let kind = o.kinds ? o.kinds[0].k : null;
    ov.querySelectorAll(".ask-kind").forEach(b => b.onclick = () => { kind = b.dataset.k; ov.querySelectorAll(".ask-kind").forEach(x => x.setAttribute("aria-checked", String(x === b))); const k = o.kinds.find(x => x.k === kind); if (k && k.placeholder) inp.placeholder = k.placeholder; inp.focus(); });
    $(".ask-kinds", ov) && $(".ask-kinds", ov).addEventListener("keydown", e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); const bs = [...ov.querySelectorAll(".ask-kind")], i = bs.findIndex(x => x.dataset.k === kind), j = (i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length; bs[j].click(); bs[j].focus(); });
    $("form", ov).onsubmit = e => { e.preventDefault(); fin(o.kinds ? { text: inp.value.trim(), kind } : inp.value.trim()); };
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

/* ---------- My notes (page): folders column (folders with their notes) · notes list · editor (one note, or two side by side) ---------- */
const NOTES = { sel: null, q: "", folder: "all", sort: store.get("notesort", "mine"), favTop: store.get("notefavtop", true) };
function renderNotes(m, focusBody){
  const NS = window.InquireNotes;
  const s = m.body;
  s.innerHTML = `    <div class="nb"><nav class="nb-folders" aria-label="Folders"></nav>
    <aside class="nb-list"><div class="nb-tools"><label class="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search notes" aria-label="Search notes"></label></div>
      <div class="nb-filter"><select class="nb-sort" aria-label="Order of notes"><option value="mine">My order</option><option value="recent">Recently edited</option></select><button type="button" class="nb-favtop" aria-pressed="false" title="Keep favourites at the top of the list">★ first</button></div><div class="nb-items" role="listbox" aria-label="Notes"></div></aside>
    <section class="nb-ed"><div class="nb-tabs" hidden></div><div class="nb-panes"><div class="nb-pane p1"></div><div class="nb-pane p2" hidden></div></div></section>
    <button type="button" class="nb-fold" data-p="f"></button><button type="button" class="nb-fold" data-p="l"></button>
    <div class="nb-rzf" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the folders column (drag, or ←/→; double-click resets)" title="Drag to resize the folders · double-click resets"></div>
    <div class="nb-rz" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the notes list (drag, or ←/→; double-click resets)" title="Drag to resize the notes list · double-click resets"></div></div>`;
  notesLayout($(".nb", s));
  m.head.innerHTML = `<span class="mw-tip" tabindex="0" title="Drag notes into folders and folders into other folders, drag either up or down to put them in your own order, star the ones you use most, and paste or drop photos and videos in. ▾ on a folder folds its notes away. Drag a note into the open note to link to it, or onto ⧉ beside the title to open the two side by side. The ◀ tabs hide the folders or the list; drag the lines beside them to resize. Select words and right-click to define them or link them to another note." aria-label="Tips">?</span><span class="np-hist" role="group" aria-label="Undo and redo"><button type="button" class="np-hb" data-a="undo" title="Undo (${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}+Z): writing, folders, new or deleted notes, widgets…" aria-label="Undo">↶ Undo</button><button type="button" class="np-hb" data-a="redo" title="Redo (⇧${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}+Z)" aria-label="Redo">↷ Redo</button></span><button type="button" class="np-newb" data-a="newnote" title="Name a new note and start writing (Alt+Shift+N)">＋ New Note</button>`;
  const fold = $(".nb-folders", s), items = $(".nb-items", s), edSec = $(".nb-ed", s), ed = $(".nb-pane.p1", s), ed2 = $(".nb-pane.p2", s), tabs = $(".nb-tabs", s), nbEl = $(".nb", s), q = $('input[type="search"]', s), sortSel = $(".nb-sort", s);
  q.value = NOTES.q;
  q.oninput = () => { NOTES.q = q.value; drawList(); };
  sortSel.value = NOTES.sort === "recent" ? "recent" : "mine";
  sortSel.onchange = () => { NOTES.sort = sortSel.value; store.set("notesort", NOTES.sort); drawList(); };
  const favTop = $(".nb-favtop", s), paintFavTop = () => { favTop.setAttribute("aria-pressed", String(!!NOTES.favTop)); favTop.title = NOTES.favTop ? "Favourites are kept at the top. Click to place them in your own order instead" : "Favourites follow your order. Click to keep them at the top"; };
  favTop.onclick = () => { NOTES.favTop = !NOTES.favTop; store.set("notefavtop", NOTES.favTop); paintFavTop(); drawList(); }; paintFavTop();
  const realFolder = () => NS.folders().some(f => f.id === NOTES.folder) ? NOTES.folder : null;
  const newHere = () => { flushEd(); newNote({ folder: realFolder(), fav: NOTES.folder === "fav" }); };
  $('[data-a="newnote"]', m.head).onclick = newHere;
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
  m.newNote = newHere;
  // a folder shows its own notes and the notes of every folder inside it
  let inSub = new Set();
  const inView = n => NOTES.folder === "all" || (NOTES.folder === "fav" ? n.fav : NOTES.folder === "none" ? !n.folder : inSub.has(n.folder));

  // drag and drop: notes onto folders (file them) or onto other notes (My order); folders onto folders (nest) or between them (reorder)
  let DRAG = null;
  const clearDrop = () => s.querySelectorAll(".drop,.drop-before,.drop-after").forEach(el => el.classList.remove("drop", "drop-before", "drop-after"));
  const closed = () => new Set(store.get("notefold", []));
  function drawFolders(){
    const all = NS.list(), fs = NS.folders(), shut = closed();
    if (!["all", "fav", "none"].includes(NOTES.folder) && !fs.some(f => f.id === NOTES.folder)) NOTES.folder = "all";
    inSub = ["all", "fav", "none"].includes(NOTES.folder) ? new Set() : NS.subtree(NOTES.folder);
    const count = id => { const sub = NS.subtree(id); return all.filter(n => sub.has(n.folder)).length; };
    const row = (id, ic, name, n, f) => `<div class="nb-fd${NOTES.folder === id ? " sel" : ""}${f ? " user" : ""}" data-f="${id}"${f ? ` draggable="true" style="--d:${f.depth}"` : ""}>${f ? `<button type="button" class="nb-fcar" data-car="${id}" aria-expanded="${!shut.has(id)}" title="${shut.has(id) ? "Show" : "Hide"} what is in ${esc(name)}" aria-label="${shut.has(id) ? "Show" : "Hide"} the notes and folders in ${esc(name)}">${shut.has(id) ? "▸" : "▾"}</button>` : ""}<button type="button" class="nb-fdb" data-f="${id}" aria-pressed="${NOTES.folder === id}"${f ? ` title="Drag onto another folder to put it inside; drag above or below a folder to reorder. Alt+↑/↓ also reorders."` : ""}>${f ? "" : `<span class="nb-fic">${ic}</span>`}<span class="nb-fnm">${esc(name)}</span><span class="nb-fn num">${n}</span></button>${f ? `<button type="button" class="nb-fx nb-ffav${f.fav ? " on" : ""}" data-ffav="${id}" aria-pressed="${!!f.fav}" title="${f.fav ? "Unstar: back to its own place" : "Star: keep this folder at the top"}" aria-label="${f.fav ? "Unstar" : "Star"} ${esc(name)}">${f.fav ? "★" : "☆"}</button><button type="button" class="nb-fx" data-sub="${id}" title="New folder inside" aria-label="New folder inside ${esc(name)}">＋</button><button type="button" class="nb-fx" data-ren="${id}" title="Rename folder" aria-label="Rename ${esc(name)}">✎</button><button type="button" class="nb-fx" data-del="${id}" title="Delete folder (its notes and folders move up a level)" aria-label="Delete ${esc(name)}">✕</button>` : ""}</div>`;
    // each folder lists its folders, then its own notes (My order); ▾ / ▸ folds both away
    const byFolder = {}; all.slice().sort(NS.byOrder).forEach(n => { if (n.folder) (byFolder[n.folder] = byFolder[n.folder] || []).push(n); });
    const noteRow = (n, d) => `<div class="nb-fnote${n.id === NOTES.sel ? " sel" : ""}" role="button" tabindex="0" draggable="true" data-id="${n.id}" style="--d:${d}" title="Open ${esc(n.title)} · drag it onto a folder, into the open note (a link) or onto ⧉ (side by side)"><span class="nb-fni" aria-hidden="true">${n.fav ? "★" : "▫"}</span><span class="nb-fnt">${esc(n.title)}</span></div>`;
    const tree = parent => fs.filter(f => (f.parent || null) === parent).map(f => row(f.id, "", f.name, count(f.id), f)
      + (shut.has(f.id) ? "" : tree(f.id) + (byFolder[f.id] || []).map(n => noteRow(n, f.depth + 1)).join(""))).join("");
    fold.innerHTML = `<div class="nb-fh">Library</div>`
      + row("all", "▤", "All notes", all.length) + row("fav", "★", "Favourites", all.filter(n => n.fav).length) + row("none", "◌", "Unfiled", all.filter(n => !n.folder).length)
      + `<div class="nb-fh nb-ftop" data-top>Folders</div>` + tree(null)
      + `<button type="button" class="nb-fadd" data-a="addf">＋ New folder</button>`;
    fold.querySelectorAll(".nb-fnote").forEach(r => {
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
      d.addEventListener("dragstart", e => { DRAG = { type: "folder", id: d.dataset.f }; e.dataTransfer.setData("text/x-folder", d.dataset.f); e.dataTransfer.effectAllowed = "move"; d.classList.add("dragging"); });
      d.addEventListener("dragend", () => { DRAG = null; d.classList.remove("dragging"); clearDrop(); });
    });
    $('[data-a="addf"]', fold).onclick = e => nameBox(e.target, "", v => { const f = NS.addFolder(v); NOTES.folder = f.id; drawAll(); });
  }
  // where a drag over the folder column would land: { el, how: "into" | "before" | "after" | "top", id }
  function folderDrop(e){
    if (!DRAG) return null;
    const top = e.target.closest("[data-top]");
    if (DRAG.type === "folder" && top) return { el: top, how: "top" };
    const d = e.target.closest(".nb-fd"); if (!d || !d.dataset.f) return null;
    const f = d.dataset.f;
    if (DRAG.type === "note") return f === "all" ? null : { el: d, how: "into", id: f };
    if (f === "fav") return null;
    if (f === "all" || f === "none") return { el: d, how: "top" };
    if (NS.subtree(DRAG.id).has(f)) return null; // not into itself or its own subfolders
    const r = d.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    return { el: d, how: y < .28 ? "before" : y > .72 ? "after" : "into", id: f };
  }
  fold.addEventListener("dragover", e => {
    const t = folderDrop(e); clearDrop(); if (!t) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    t.el.classList.add(t.how === "before" ? "drop-before" : t.how === "after" ? "drop-after" : "drop");
  });
  fold.addEventListener("dragleave", e => { if (!fold.contains(e.relatedTarget)) clearDrop(); });
  fold.addEventListener("drop", e => {
    const t = folderDrop(e); clearDrop(); if (!t) return; e.preventDefault();
    if (DRAG.type === "note") {
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
  function drawList(){
    const mine = NOTES.sort !== "recent";
    const all = NS.list(NOTES.q).filter(inView).sort((a, b) => (NOTES.favTop ? b.fav - a.fav : 0) || (mine ? NS.byOrder(a, b) : b.updated - a.updated)); // favourites on top unless "★ first" is off
    if (!NOTES.sel || !all.some(n => n.id === NOTES.sel)) { if (!NOTES.sel || !NS.get(NOTES.sel) || !inView(NS.get(NOTES.sel))) NOTES.sel = all[0] ? all[0].id : null; }
    const fname = Object.fromEntries(NS.folders().map(f => [f.id, f.name]));
    items.innerHTML = all.length ? all.map(n => `<div role="option" tabindex="0" class="nb-it" draggable="true" aria-selected="${n.id === NOTES.sel}" data-id="${n.id}"><span class="nb-t">${n.fav ? '<i class="nb-star" aria-label="Favourite">★</i>' : ""}${esc(n.title)}</span><span class="nb-m">${n.folder && fname[n.folder] && NOTES.folder !== n.folder ? "▸ " + esc(fname[n.folder]) + " · " : ""}${when(n.updated)}</span></div>`).join("")
      : `<p class="nb-empty">${NOTES.q ? "No notes match." : NOTES.folder === "fav" ? "No favourites yet. Star a note with ☆." : "No notes here yet."}</p>`;
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
    if (SPLIT.id && (SPLIT.id === NOTES.sel || !NS.get(SPLIT.id))) closeSplit(true);
    const n = NOTES.sel && NS.get(NOTES.sel);
    ed.dataset.id = n ? n.id : "";
    if (!n) { ed.innerHTML = `<div class="nb-none"><p>Select a note, or start a new one with <b>＋ New Note</b> at the top right.</p></div>`; return; }
    ed.innerHTML = `<div class="nb-bar"><button type="button" class="nb-favb${n.fav ? " on" : ""}" data-a="fav" aria-pressed="${n.fav}" title="${n.fav ? "Remove from favourites" : "Add to favourites"}">${n.fav ? "★" : "☆"}</button>
        <button type="button" class="btn-s nb-bar-r" data-a="photo" title="Add photos from this computer (or paste / drop them into the note)">＋ Photo</button><button type="button" class="btn-s" data-a="purl" title="Show a photo from a web address">Photo link</button>
        <button type="button" class="btn-s nr-vid" data-a="video" title="Add a video: a file from this computer, or a YouTube, Vimeo or video link" aria-haspopup="dialog">▶ Video</button>
        <button type="button" class="btn-s" data-a="md">Save as .md</button><button type="button" class="btn-s set-warn" data-a="del">Delete</button></div>
      <form class="nb-urlrow" hidden><input type="url" placeholder="https://… address of a photo" aria-label="Photo address"><button type="submit" class="btn-s">Insert</button><button type="button" class="btn-s" data-a="purlx">Cancel</button><span class="nb-urlmsg"></span></form>
      <div class="nb-trow"><input class="nb-title" value="${esc(n.title)}" aria-label="Title" maxlength="140"><div class="nb-split" aria-hidden="true" title="Drop a note here to open it beside this one"><span class="nb-split-ic">⧉</span><span>Drop to open side by side</span></div></div>
      <div class="nb-host"></div><input type="file" accept="image/*" multiple hidden>`;
    const ti = $(".nb-title", ed), file = $('input[type="file"]', ed);
    rich = NS.mountEditor($(".nb-host", ed), n.id, {
      onSaved: () => { const it = items.querySelector(`[data-id="${n.id}"] .nb-m`); if (it) drawList(); },
      openNote: id => openLinked(id),
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
    $('[data-a="md"]', ed).onclick = () => { flushEd(); const m = NS.get(n.id); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["# " + m.title + "\n\n" + m.body], { type: "text/markdown" })); a.download = (m.title.replace(/[^\w\- ]+/g, "").trim() || "note") + ".md"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    // delete at once, with Undo in a message for 8 s (photos and videos are only removed once that time is up)
    $('[data-a="del"]', ed).onclick = () => { flushEd(); if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; NS.deleteWithUndo(n.id, id => { if (s.isConnected) { NOTES.sel = id; drawAll(); } }); drawAll(); };
    if (focusBody) setTimeout(() => {
      const w = focusBody === "code" ? ed.querySelector(".nw[data-w=code] .nw-ta") : focusBody === "sheet" ? ed.querySelector(".nw[data-w=sheet] .sh-chords") : null;
      if (w) w.focus({ preventScroll: true }); else if (rich) rich.focus();
    }, 30);
  }
  // a note link clicked in either pane opens in the main pane
  function openLinked(id){ flushEd(); NOTES.sel = id; const m = NS.get(id); if (m && !inView(m)) NOTES.folder = "all"; drawAll(); }

  /* ----- a second note side by side (dropped on ⧉); ▁ minimises it to a tab above the editor, ⤢ brings it back ----- */
  const SPLIT = NOTES.split || (NOTES.split = { id: null, min: false });
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
    if (!show) { ed2.innerHTML = ""; return; }
    ed2.innerHTML = `<div class="nb-p2h"><span class="nb-p2tag">Side by side</span><button type="button" class="btn-s" data-a="swap" title="Make this the main note">Open as main</button><button type="button" class="nb-p2b" data-a="min" title="Minimise to a tab" aria-label="Minimise to a tab">▁</button><button type="button" class="nb-p2b" data-a="close" title="Close this note" aria-label="Close the side note">✕</button></div>
      <div class="nb-trow"><input class="nb-title" value="${esc(n.title)}" aria-label="Title of the side note" maxlength="140"></div><div class="nb-host"></div>`;
    rich2 = NS.mountEditor($(".nb-host", ed2), n.id, { openNote: id => openLinked(id), onMessage: msg, onSaved: () => drawList() });
    const ti = $(".nb-title", ed2);
    ti.oninput = () => { clearTimeout(save2); save2 = setTimeout(() => { save2 = null; NS.update(n.id, { title: ti.value.trim() || "Untitled note" }); drawList(); drawFolders(); }, 400); };
    $('[data-a="min"]', ed2).onclick = () => { flush2(); SPLIT.min = true; drawSplit(); };
    $('[data-a="close"]', ed2).onclick = () => closeSplit();
    $('[data-a="swap"]', ed2).onclick = () => { flushEd(); const a = NOTES.sel; NOTES.sel = n.id; SPLIT.id = a && a !== n.id ? a : null; drawAll(); };
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
    if (!DRAG || DRAG.type !== "note") return null;
    const sp = e.target.closest && e.target.closest(".p1 .nb-split"); if (sp) return DRAG.id === NOTES.sel ? null : { kind: "split", el: sp };
    const re = e.target.closest && e.target.closest(".nb-rich"); if (!re || e.target.closest(".nw")) return null;
    const api = NS.editorFor(re); if (!api || api.id === DRAG.id) return null;
    return { kind: "link", api, re };
  };
  edSec.addEventListener("dragover", e => {
    const t = dropTarget(e); edSec.querySelectorAll(".nb-split.over").forEach(x => { if (!t || x !== t.el) x.classList.remove("over"); });
    if (!t) { hideCaret(); return; }
    e.preventDefault(); e.dataTransfer.dropEffect = t.kind === "split" ? "copy" : "link";
    if (t.kind === "split") { t.el.classList.add("over"); hideCaret(); return; }
    const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY), rc = r && t.re.contains(r.startContainer) ? r.getBoundingClientRect() : null;
    if (!dcaret) { dcaret = h("div", { class: "nb-dcaret" }); document.body.appendChild(dcaret); }
    const lh = rc && rc.height ? rc.height : 20;
    dcaret.style.left = (rc && (rc.left || rc.top) ? rc.left : e.clientX) + "px"; dcaret.style.top = (rc && (rc.left || rc.top) ? rc.top : e.clientY - lh / 2) + "px"; dcaret.style.height = lh + "px";
  });
  edSec.addEventListener("dragleave", e => { if (!edSec.contains(e.relatedTarget)) { hideCaret(); edSec.querySelectorAll(".nb-split.over").forEach(x => x.classList.remove("over")); } });
  edSec.addEventListener("drop", e => {
    const t = dropTarget(e); hideCaret(); if (!t) return; e.preventDefault(); e.stopPropagation();
    const id = DRAG.id; nbEl.classList.remove("dragnote");
    if (t.kind === "split") { openSplit(id); return; }
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
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
  context(){ return { view: S.view }; },
  openNotes: id => go({ view: "notes", folder: "all", sel: id || null }),
  newNote,
  modal: modalWin, closeWin: id => { if (id) { if (MW[id]) MW[id].close(); } else closeWins(); }, openWin: () => {}, winOpen: id => (id ? !!MW[id] : Object.keys(MW).length > 0),
  go: v => go(v), askText,
  // keyboard shortcuts (Settings → Shortcuts)
  shortcut(name){
    if (name === "menu") return go({ view: "menu" });
    if (name === "notes") return go({ view: S.view === "notes" ? "menu" : "notes" });
    if (name === "newnote") return S.view === "notes" && NPAGE && NPAGE.newNote ? NPAGE.newNote() : newNote();
    if (name === "favs") return go({ view: "notes", folder: "fav" });
    if (name === "back") { if (Object.keys(MW).length) return closeWins(); if (S.view !== "menu") return go({ view: "menu" }); }
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
