/* NotePath app shell: the start menu, the My notes window and the desktop chrome (update banner, version line).
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
   Screens: "menu" (the start menu). Windows over a screen: "notes" (My notes). Routes: #menu, #notes, #favourites. */
const S = { view: "menu" };
const viewEl = $("#view");
let cleanup = [];
function clearView(){ cleanup.forEach(f => { try{ f(); }catch(e){} }); cleanup = []; viewEl.innerHTML = ""; }

function go(next, push = true){
  if (WIN_VIEWS[next.view]) { // a window, not a screen: open it over whatever is on screen (the start menu on a cold start)
    WIN_VIEWS[next.view](next);
    if (viewEl.childElementCount) { try { history.replaceState(history.state, "", "#" + S.view); } catch(e){} return; }
    next = { view: "menu" }; push = false;
  } else closeWins();
  Object.assign(S, next);
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
  renderMenu();
  viewEl.focus({ preventScroll: true });
}
function crumbs(){
  const c = $("#crumbs"); c.innerHTML = "";
  c.appendChild(h("span", { class: "here" }, MW.notes ? "Menu" : "Main Menu"));
  if (MW.notes) { c.appendChild(h("span", { class: "sep" }, "›")); c.appendChild(h("span", { class: "here" }, "My notes")); }
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
const WIN_VIEWS = { notes: o => openNotesWin(o) };
// o.folder ("all" | "fav" | "none" | folder id), o.sel (note id), o.focusTitle (a new note: put the cursor in its title)
function openNotesWin(o = {}){
  if (o.folder) { NOTES.folder = o.folder; NOTES.q = ""; }
  if (o.sel) NOTES.sel = o.sel;
  const fresh = !MW.notes, m = modalWin("notes", { title: "My notes", cls: "mw-notes", sub: "All notes are saved on this computer." });
  if (!fresh) { m.cleanup.forEach(f => { try { f(); } catch(e){} }); m.cleanup = []; }
  renderNotes(m, o.focusTitle);
  crumbs();
  return m;
}
// ＋ New note (start menu, shortcut): ask for a title, then open it in My notes
async function newNote(){
  const NS = window.InquireNotes; if (!NS) return;
  const t = await askText({ title: "New note", label: "Note title", placeholder: "Untitled note", ok: "Create note", max: 140 });
  if (t == null) return;
  const n = NS.create({ title: t || "Untitled note" });
  go({ view: "notes", folder: "all", sel: n.id });
}

/* ---------- start menu ----------
   The Notes console (My notes · ＋ New note · Favourites, then the three most recent notes) and three slots that are
   not linked to anything yet ("Coming soon"). */
function renderMenu(){
  const s = h("div", { class: "screen" });
  s.innerHTML = `<div class="screen-in">
    <div class="hello"><p class="eyebrow">NotePath</p><h1>Main Menu</h1></div>
    <section class="npn win" aria-labelledby="npn-t">
      <header class="win-h npn-h"><span class="dot"></span><span id="npn-t">Notes</span><span class="npn-count num"></span></header>
      <div class="slots three npn-acts">
        <button type="button" class="slot big" data-a="open"><span class="glyph">▤</span><span><h3>My notes</h3><p>Every note, folder and photo, with search and your own order.</p></span><span class="tag num" data-n="all"></span></button>
        <button type="button" class="slot big npn-new" data-a="new"><span class="glyph">＋</span><span><h3>New note</h3><p>Name it and start writing. Text, lists, photos, video, code and music.</p></span><span class="tag">Write</span></button>
        <button type="button" class="slot big" data-a="fav"><span class="glyph">★</span><span><h3>Favourites</h3><p>The notes you starred, kept one click away.</p></span><span class="tag num" data-n="fav"></span></button>
      </div>
      <div class="npn-recent"><h2 class="npn-sub">Recent</h2><div class="mnotes-list"></div></div>
    </section>
    <div class="slots three npn-soon" aria-label="Coming soon">
      ${[1, 2, 3].map(() => `<button type="button" class="slot big locked" aria-disabled="true" tabindex="-1"><span class="glyph">◇</span><span><h3>Coming soon</h3></span></button>`).join("")}
    </div>
    <div class="verline" id="verline"></div></div>`;
  viewEl.appendChild(s);
  if (window.inquireDesktop) $("#verline", s).innerHTML = `<span>NotePath <span class="num">v${esc(DESK_VERSION || "")}</span></span>`; // updates: Settings → About
  $('[data-a="open"]', s).onclick = () => go({ view: "notes", folder: "all" });
  $('[data-a="new"]', s).onclick = () => newNote();
  $('[data-a="fav"]', s).onclick = () => go({ view: "notes", folder: "fav" });
  const NS = window.InquireNotes, list = $(".mnotes-list", s);
  const draw = () => {
    const all = NS ? NS.list() : [], top = all.slice(0, 3), fav = all.filter(n => n.fav).length;
    $(".npn-count", s).textContent = all.length + (all.length === 1 ? " note" : " notes");
    $('[data-n="all"]', s).textContent = all.length;
    $('[data-n="fav"]', s).textContent = "★ " + fav;
    list.innerHTML = top.length ? top.map(n => `<button type="button" class="mnote" data-id="${n.id}"><span class="mnote-t">${n.fav ? '<i class="nb-star" aria-label="Favourite">★</i> ' : ""}${esc(n.title)}</span><span class="mnote-b">${esc(n.body.slice(0, 160))}</span><span class="mnote-m">${when(n.updated)}</span></button>`).join("")
      : `<p class="mnotes-empty">No notes yet. Choose <b>New note</b> above to write your first one.</p>`;
    list.querySelectorAll(".mnote").forEach(b => b.onclick = () => go({ view: "notes", folder: "all", sel: b.dataset.id }));
  };
  draw();
  window.addEventListener("inquire:notes-changed", draw); cleanup.push(() => window.removeEventListener("inquire:notes-changed", draw));
}

/* ---------- My notes layout: fold the folders / notes columns (◀ ▶ tabs) and drag the list's right edge to resize it ---------- */
function notesLayout(nb){
  const fold = store.get("nbfold", { f: false, l: false }), W0 = () => store.get("nbw", 0);
  const paint = () => {
    nb.classList.toggle("ffold", !!fold.f); nb.classList.toggle("lfold", !!fold.l);
    nb.querySelectorAll(".nb-fold").forEach(b => {
      const shut = !!fold[b.dataset.p], what = b.dataset.p === "f" ? "folders" : "notes list";
      b.innerHTML = `<span aria-hidden="true">${shut ? "▶" : "◀"}</span>`; b.title = (shut ? "Show the " : "Hide the ") + what; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!shut));
    });
    const w = W0(); if (w) nb.style.setProperty("--nb-lw-user", w + "px"); else nb.style.removeProperty("--nb-lw-user");
    if (matchMedia("(min-width:861px)").matches) { $(".nb-folders", nb).inert = !!fold.f; $(".nb-list", nb).inert = !!fold.l; }
  };
  nb.querySelectorAll(".nb-fold").forEach(b => b.onclick = () => { fold[b.dataset.p] = !fold[b.dataset.p]; store.set("nbfold", fold); paint(); });
  const rz = $(".nb-rz", nb), list = $(".nb-list", nb);
  const lim = w => { const total = nb.offsetWidth, fw = $(".nb-folders", nb).offsetWidth; return Math.round(Math.max(180, Math.min(w, 620, total - fw - 340))); };
  const setW = w => { store.set("nbw", w ? lim(w) : 0); paint(); };
  rz.addEventListener("pointerdown", e => {
    if (e.button !== 0) return; e.preventDefault();
    const z = nb.getBoundingClientRect().width / nb.offsetWidth || 1, x0 = e.clientX, w0 = list.offsetWidth;
    rz.setPointerCapture(e.pointerId); nb.classList.add("rz");
    const move = ev => nb.style.setProperty("--nb-lw-user", lim(w0 + (ev.clientX - x0) / z) + "px");
    const up = () => { rz.removeEventListener("pointermove", move); rz.removeEventListener("pointerup", up); rz.removeEventListener("pointercancel", up); nb.classList.remove("rz"); store.set("nbw", list.offsetWidth); };
    rz.addEventListener("pointermove", move); rz.addEventListener("pointerup", up); rz.addEventListener("pointercancel", up);
  });
  rz.addEventListener("dblclick", () => setW(0));
  rz.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setW(list.offsetWidth + (e.key === "ArrowRight" ? 20 : -20)); }
    else if (e.key === "Home") { e.preventDefault(); setW(0); }
  });
  paint();
}

/* ---------- small dialog in the Settings style (the app behind fogs): askText({title, label, placeholder, value, ok, max}) → text | null ---------- */
function askText(o = {}){
  return new Promise(done => {
    document.querySelectorAll(".ask-ov").forEach(x => x.remove());
    const last = document.activeElement;
    const ov = h("div", { class: "ask-ov" }, `<form class="ask-win win" role="dialog" aria-modal="true" aria-labelledby="ask-t">
      <header class="set-h"><span class="dot"></span><h2 id="ask-t">${esc(o.title || "Name")}</h2><button type="button" class="set-x" data-x aria-label="Cancel">✕</button></header>
      <div class="ask-body"><label class="ask-l" for="ask-in">${esc(o.label || "Name")}</label>
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
    $("form", ov).onsubmit = e => { e.preventDefault(); fin(inp.value.trim()); };
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

/* ---------- My notes (window): folders column · notes list · editor ---------- */
const NOTES = { sel: null, q: "", folder: "all", sort: store.get("notesort", "mine"), favTop: store.get("notefavtop", true) };
function renderNotes(m, focusTitle){
  const NS = window.InquireNotes;
  const s = m.body;
  s.innerHTML = `    <div class="nb"><nav class="nb-folders" aria-label="Folders"></nav>
    <aside class="nb-list"><div class="nb-tools"><label class="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search notes" aria-label="Search notes"></label><button type="button" class="btn-s" data-a="new">＋ New</button></div>
      <div class="nb-filter"><select class="nb-sort" aria-label="Order of notes"><option value="mine">My order</option><option value="recent">Recently edited</option></select><button type="button" class="nb-favtop" aria-pressed="false" title="Keep favourites at the top of the list">★ first</button></div><div class="nb-items" role="listbox" aria-label="Notes"></div></aside>
    <section class="nb-ed"></section>
    <button type="button" class="nb-fold" data-p="f"></button><button type="button" class="nb-fold" data-p="l"></button>
    <div class="nb-rz" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the notes list (drag, or ←/→; double-click resets)" title="Drag to resize the notes list · double-click resets"></div></div>`;
  notesLayout($(".nb", s));
  m.head.innerHTML = `<span class="mw-tip" tabindex="0" title="Drag notes into folders and folders into other folders, drag either up or down to put them in your own order, star the ones you use most, and paste or drop photos and videos in. The ◀ tabs hide the folders or the list; drag the line beside the list to resize it. Select words and right-click to define them or link them to another note." aria-label="Tips">?</span>`;
  const fold = $(".nb-folders", s), items = $(".nb-items", s), ed = $(".nb-ed", s), q = $('input[type="search"]', s), sortSel = $(".nb-sort", s);
  q.value = NOTES.q;
  q.oninput = () => { NOTES.q = q.value; drawList(); };
  sortSel.value = NOTES.sort === "recent" ? "recent" : "mine";
  sortSel.onchange = () => { NOTES.sort = sortSel.value; store.set("notesort", NOTES.sort); drawList(); };
  const favTop = $(".nb-favtop", s), paintFavTop = () => { favTop.setAttribute("aria-pressed", String(!!NOTES.favTop)); favTop.title = NOTES.favTop ? "Favourites are kept at the top. Click to place them in your own order instead" : "Favourites follow your order. Click to keep them at the top"; };
  favTop.onclick = () => { NOTES.favTop = !NOTES.favTop; store.set("notefavtop", NOTES.favTop); paintFavTop(); drawList(); }; paintFavTop();
  const realFolder = () => NS.folders().some(f => f.id === NOTES.folder) ? NOTES.folder : null;
  $('[data-a="new"]', s).onclick = () => { flushEd(); const n = NS.create({ folder: realFolder(), fav: NOTES.folder === "fav" }); NOTES.sel = n.id; NOTES.q = q.value = ""; drawAll(true); };
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
    const kids = new Set(fs.map(f => f.parent).filter(Boolean));
    const count = id => { const sub = NS.subtree(id); return all.filter(n => sub.has(n.folder)).length; };
    const row = (id, ic, name, n, f) => `<div class="nb-fd${NOTES.folder === id ? " sel" : ""}${f ? " user" : ""}" data-f="${id}"${f ? ` draggable="true" style="--d:${f.depth}"` : ""}>${f && kids.has(id) ? `<button type="button" class="nb-fcar" data-car="${id}" aria-expanded="${!shut.has(id)}" aria-label="${shut.has(id) ? "Show" : "Hide"} folders in ${esc(name)}">${shut.has(id) ? "▸" : "▾"}</button>` : f ? `<span class="nb-fcar" aria-hidden="true">▹</span>` : ""}<button type="button" class="nb-fdb" data-f="${id}" aria-pressed="${NOTES.folder === id}"${f ? ` title="Drag onto another folder to put it inside; drag above or below a folder to reorder. Alt+↑/↓ also reorders."` : ""}>${f ? "" : `<span class="nb-fic">${ic}</span>`}<span class="nb-fnm">${esc(name)}</span><span class="nb-fn num">${n}</span></button>${f ? `<button type="button" class="nb-fx" data-sub="${id}" title="New folder inside" aria-label="New folder inside ${esc(name)}">＋</button><button type="button" class="nb-fx" data-ren="${id}" title="Rename folder" aria-label="Rename ${esc(name)}">✎</button><button type="button" class="nb-fx" data-del="${id}" title="Delete folder (its notes and folders move up a level)" aria-label="Delete ${esc(name)}">✕</button>` : ""}</div>`;
    // hide folders inside a collapsed folder
    const hidden = new Set(); fs.forEach(f => { if (f.parent && (hidden.has(f.parent) || shut.has(f.parent))) hidden.add(f.id); });
    fold.innerHTML = `<div class="nb-fh">Library</div>`
      + row("all", "▤", "All notes", all.length) + row("fav", "★", "Favourites", all.filter(n => n.fav).length) + row("none", "◌", "Unfiled", all.filter(n => !n.folder).length)
      + `<div class="nb-fh nb-ftop" data-top>Folders</div>` + fs.filter(f => !hidden.has(f.id)).map(f => row(f.id, kids.has(f.id) ? "" : "▹", f.name, count(f.id), f)).join("")
      + `<button type="button" class="nb-fadd" data-a="addf">＋ New folder</button>`;
    // pick, open/close, rename, delete
    fold.querySelectorAll(".nb-fdb").forEach(b => b.onclick = () => { NOTES.folder = b.dataset.f; drawFolders(); drawList(); });
    fold.querySelectorAll("[data-car]").forEach(b => b.onclick = e => { e.stopPropagation(); const c = closed(), id = b.dataset.car; c.has(id) ? c.delete(id) : c.add(id); store.set("notefold", [...c]); drawFolders(); });
    fold.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { const id = b.dataset.sub, c = closed(); c.delete(id); store.set("notefold", [...c]);
      const at = h("div", { class: "nb-fd user", style: `--d:${(fs.find(f => f.id === id) || {}).depth + 1 || 1}` }); b.closest(".nb-fd").after(at);
      nameBox(at, "", v => { const f = NS.addFolder(v, id); NOTES.folder = f.id; drawAll(); }); });
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
      b.onclick = () => { if (NOTES.sel === b.dataset.id) return; flushEd(); NOTES.sel = b.dataset.id; drawList(); drawEd(); };
      b.addEventListener("dragstart", e => { DRAG = { type: "note", id: b.dataset.id }; e.dataTransfer.setData("text/x-note", b.dataset.id); e.dataTransfer.effectAllowed = "move"; b.classList.add("dragging"); });
      b.addEventListener("dragend", () => { DRAG = null; b.classList.remove("dragging"); clearDrop(); });
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
  const flushEd = () => { if (rich) rich.flush(); if (saveT) { clearTimeout(saveT); saveT = null; const ti = $(".nb-title", ed); if (ti && ed.dataset.id && NS.get(ed.dataset.id)) NS.update(ed.dataset.id, { title: ti.value.trim() || "Untitled note" }); } };
  function drawEd(focusTitle){
    if (rich) { rich.destroy(); rich = null; }
    const n = NOTES.sel && NS.get(NOTES.sel);
    ed.dataset.id = n ? n.id : "";
    if (!n) { ed.innerHTML = `<div class="nb-none"><p>Select a note, or start a new one with <b>＋ New</b>.</p></div>`; return; }
    const fs = NS.folders();
    ed.innerHTML = `<div class="nb-bar"><button type="button" class="nb-favb${n.fav ? " on" : ""}" data-a="fav" aria-pressed="${n.fav}" title="${n.fav ? "Remove from favourites" : "Add to favourites"}">${n.fav ? "★" : "☆"}</button>
        <label class="nb-fsel"><span>Folder</span><select data-a="folder" aria-label="Folder"><option value="">Unfiled</option>${fs.map(f => `<option value="${f.id}"${n.folder === f.id ? " selected" : ""}>${"   ".repeat(f.depth)}${esc(f.name)}</option>`).join("")}</select></label>
        <span class="nb-saved" aria-live="polite" title="Last saved ${esc(new Date(n.updated).toLocaleString())}">Saved</span>
        <button type="button" class="btn-s" data-a="photo" title="Add photos from this computer (or paste / drop them into the note)">＋ Photo</button><button type="button" class="btn-s" data-a="purl" title="Show a photo from a web address">Photo link</button>
        <button type="button" class="btn-s" data-a="md">Save as .md</button><button type="button" class="btn-s set-warn" data-a="del">Delete</button></div>
      <form class="nb-urlrow" hidden><input type="url" placeholder="https://… address of a photo" aria-label="Photo address"><button type="submit" class="btn-s">Insert</button><button type="button" class="btn-s" data-a="purlx">Cancel</button><span class="nb-urlmsg"></span></form>
      <input class="nb-title" value="${esc(n.title)}" aria-label="Title" maxlength="140">
      <div class="nb-host"></div><input type="file" accept="image/*" multiple hidden>`;
    const ti = $(".nb-title", ed), sv = $(".nb-saved", ed), file = $('input[type="file"]', ed);
    rich = NS.mountEditor($(".nb-host", ed), n.id, {
      onEditing: () => { sv.textContent = "Editing…"; },
      onSaved: () => { sv.textContent = "Saved"; const it = items.querySelector(`[data-id="${n.id}"] .nb-m`); if (it) drawList(); },
      openNote: id => { NOTES.sel = id; const m = NS.get(id); if (m && !inView(m)) NOTES.folder = "all"; drawAll(); }
    });
    ti.oninput = () => { clearTimeout(saveT); sv.textContent = "Editing…"; saveT = setTimeout(() => { saveT = null; NS.update(n.id, { title: ti.value.trim() || "Untitled note" }); sv.textContent = "Saved"; const it = items.querySelector(`[data-id="${n.id}"] .nb-t`); if (it) it.lastChild.textContent = ti.value.trim() || "Untitled note"; }, 400); };
    $('[data-a="fav"]', ed).onclick = e => { const m = NS.update(n.id, { fav: !NS.get(n.id).fav, quiet: true }); const b = e.currentTarget; b.classList.toggle("on", m.fav); b.textContent = m.fav ? "★" : "☆"; b.setAttribute("aria-pressed", String(m.fav)); b.title = m.fav ? "Remove from favourites" : "Add to favourites"; drawFolders(); drawList(); };
    $('[data-a="folder"]', ed).onchange = e => { NS.update(n.id, { folder: e.target.value || null, quiet: true }); drawFolders(); drawList(); };
    $('[data-a="photo"]', ed).onclick = () => file.click();
    file.onchange = async () => { const k = await rich.addFiles(file.files); sv.textContent = k ? (k === 1 ? "Added" : k + " added") : "Those files are not photos or videos"; file.value = ""; };
    const urlRow = $(".nb-urlrow", ed), urlIn = $("input", urlRow);
    $('[data-a="purl"]', ed).onclick = () => { urlRow.hidden = !urlRow.hidden; if (!urlRow.hidden) urlIn.focus(); };
    $('[data-a="purlx"]', ed).onclick = () => { urlRow.hidden = true; };
    urlRow.onsubmit = e => { e.preventDefault(); if (rich.addURL(urlIn.value)) { urlIn.value = ""; urlRow.hidden = true; } else $(".nb-urlmsg", urlRow).textContent = "Use an https:// address of an image."; };
    $('[data-a="md"]', ed).onclick = () => { flushEd(); const m = NS.get(n.id); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["# " + m.title + "\n\n" + m.body], { type: "text/markdown" })); a.download = (m.title.replace(/[^\w\- ]+/g, "").trim() || "note") + ".md"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    // delete at once, with Undo in a message for 8 s (photos and videos are only removed once that time is up)
    $('[data-a="del"]', ed).onclick = () => { flushEd(); if (rich) { rich.destroy(); rich = null; } NOTES.sel = null; NS.deleteWithUndo(n.id, id => { if (s.isConnected) { NOTES.sel = id; drawAll(); } }); drawAll(); };
    if (focusTitle) { ti.focus(); ti.select(); }
  }
  function drawAll(focusTitle){ drawFolders(); drawList(); drawEd(focusTitle); }
  drawAll(focusTitle);
  m.cleanup.push(() => { flushEd(); if (rich) { rich.destroy(); rich = null; } });
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
  context(){ return { view: MW.notes ? "notes" : S.view }; },
  openNotes: id => go({ view: "notes", folder: "all", sel: id || null }),
  newNote,
  modal: modalWin, closeWin: id => { if (id) { if (MW[id]) MW[id].close(); } else closeWins(); }, openWin: id => WIN_VIEWS[id] && WIN_VIEWS[id]({}), winOpen: id => (id ? !!MW[id] : Object.keys(MW).length > 0),
  go: v => go(v), askText,
  // keyboard shortcuts (Settings → Shortcuts)
  shortcut(name){
    if (name === "menu") return go({ view: "menu" });
    if (name === "notes") return MW.notes ? MW.notes.close() : openNotesWin({});
    if (name === "newnote") return newNote();
    if (name === "favs") return go({ view: "notes", folder: "fav" });
    if (name === "back") { if (Object.keys(MW).length) return closeWins(); }
  }
};

/* ---------- boot ---------- */
$("#brand").onclick = () => go({ view: "menu" });
// NotePath opens on the start menu; #notes / #favourites open My notes over it.
const initial = fromHash();
render();
try { history.replaceState({ view: "menu" }, "", "#menu"); } catch(e){}
if (initial && initial.view === "notes") go(initial, false);
})();
