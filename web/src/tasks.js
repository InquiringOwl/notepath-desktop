/* My Tasks (NotePath, Oct 2026): Main Menu → My Tasks, a page like My notes (#tasks). window.NPTasks.
   Left: the list of tasks (the notes-list look) with priority, done box, due date, repeat, reminders, place and picture.
   Right: everything about the selected task, all editable: picture ("profile" photo), name, done, priority (High ▲ red,
   Medium ◆ amber, Low ● cyan), due date and time, repeat (daily / weekly), reminders, place (checked with OpenStreetMap
   and locked onto a map), notes, and files / photos / videos.
   Store: localStorage "notepath.tasks._local" = [{ id, title, done, doneAt, pri: "high"|"med"|"low", dueDate "YYYY-MM-DD"|"",
     dueTime "HH:MM"|"", repeat: "none"|"daily"|"weekly", rem: [minutes before], loc: null|{ q, label, lat, lon },
     notes, files: [{ id, name, type, size }], pic: media id|null, created, updated, last (last done of a repeating task) }].
   Pictures and files live in the notes' IndexedDB store (InquireNotes.putImage / putFile), so backups carry them.
   Reminders: the page works out what is coming up and hands it to the desktop main process (inquireDesktop.tasks.schedule),
   which shows system notifications even while the window is closed (macOS keeps NotePath running); a click opens the task.
   Without the desktop bridge (browser preview, tests) the page checks every 20 s itself. Fired reminders are remembered
   ("notepath.tasks.fired") so each one shows once. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const KEY = "notepath.tasks._local", FKEY = "notepath.tasks.fired";
const NS = () => window.InquireNotes;
const changed = () => { window.dispatchEvent(new CustomEvent("np:tasks-changed")); schedule(); };

const PRI = { high: { name: "High", glyph: "▲", col: "#E5675B", rank: 0 }, med: { name: "Medium", glyph: "◆", col: "#F2B84B", rank: 1 }, low: { name: "Low", glyph: "●", col: "#5CC8E0", rank: 2 } };
const REM = [[0, "At the due time"], [10, "10 minutes before"], [60, "1 hour before"], [1440, "1 day before"]];
const REPEAT = [["none", "Doesn't repeat"], ["daily", "Every day"], ["weekly", "Every week"]];

/* ---------- store ---------- */
const norm = t => Object.assign({ title: "Untitled task", done: false, doneAt: null, pri: "med", dueDate: "", dueTime: "", repeat: "none", rem: [], loc: null, notes: "", files: [], pic: null, last: null }, t,
  { pri: PRI[t.pri] ? t.pri : "med", rem: Array.isArray(t.rem) ? t.rem.filter(x => Number.isFinite(+x) && +x >= 0).map(Number) : [], files: Array.isArray(t.files) ? t.files : [] });
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.id).map(norm) : []; } catch (e) { return []; } };
const write = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { console.warn("Tasks could not be saved", e); } changed(); };
const all = () => read();
const get = id => read().find(t => t.id === id) || null;
function create(o = {}) { const now = Date.now(), t = norm(Object.assign({ id: uid(), created: now, updated: now }, o)); const a = read(); a.push(t); write(a); return t; }
function update(id, patch) { const a = read(), t = a.find(x => x.id === id); if (!t) return null; Object.assign(t, patch, { updated: Date.now() }); const n = norm(t); a.splice(a.indexOf(t), 1, n); write(a); return n; }
function remove(id) { const a = read(), t = a.find(x => x.id === id); if (!t) return null; write(a.filter(x => x !== t)); return t; }
const mediaOf = t => [t.pic, ...(t.files || []).map(f => f.id)].filter(Boolean);
function purge(t) { // a deleted task's picture and files, unless another task still uses them
  const still = new Set(read().flatMap(mediaOf)), gone = mediaOf(t).filter(i => !still.has(i));
  if (gone.length && NS() && NS().delMedia) NS().delMedia(gone);
}

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = (date, time) => { if (!date) return null; const [y, m, d] = date.split("-").map(Number), [hh, mm] = (time || "23:59").split(":").map(Number); const x = new Date(y, m - 1, d, hh, mm, 0, 0); return isNaN(x) ? null : x; };
const dueAt = t => parse(t.dueDate, t.dueTime);               // when it is due (end of the day without a time)
const remBase = t => parse(t.dueDate, t.dueTime || "09:00");   // reminders count back from the time, or 9:00 on that day
function dueLabel(t, long) {
  const d = dueAt(t); if (!d) return "";
  const today = new Date(), tm = new Date(); tm.setDate(tm.getDate() + 1); const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const day = ymd(d) === ymd(today) ? "Today" : ymd(d) === ymd(tm) ? "Tomorrow" : ymd(d) === ymd(yd) ? "Yesterday"
    : d.toLocaleDateString([], { weekday: long ? "long" : "short", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return t.dueTime ? day + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : day;
}
const overdue = t => { const d = dueAt(t); return !t.done && d && d.getTime() < Date.now(); };
const soon = t => { const d = dueAt(t); return !t.done && d && !overdue(t) && d.getTime() - Date.now() < 24 * 3600e3; };
function remLabel(m) { const r = REM.find(x => x[0] === m); if (r) return r[1]; return m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? "" : "s"} before` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"} before` : `${m} minutes before`; }
// a repeating task ticked done: its next date (always in the future), still open
function nextDue(t) {
  const step = t.repeat === "weekly" ? 7 : 1, d = parse(t.dueDate || ymd(new Date()), "12:00");
  const today = ymd(new Date());
  do { d.setDate(d.getDate() + step); } while (ymd(d) <= today && t.dueDate);
  if (!t.dueDate) { const x = new Date(); x.setDate(x.getDate() + step); return ymd(x); }
  return ymd(d);
}
function setDone(id, on) {
  const t = get(id); if (!t) return null;
  if (on && t.repeat !== "none") return update(id, { dueDate: nextDue(t), last: Date.now(), done: false, doneAt: null });
  return update(id, { done: !!on, doneAt: on ? Date.now() : null });
}

/* ---------- reminders ---------- */
const fired = () => { try { return new Set(JSON.parse(localStorage.getItem(FKEY) || "[]")); } catch (e) { return new Set(); } };
const markFired = k => { const s = [...fired()]; if (!s.includes(k)) { s.push(k); try { localStorage.setItem(FKEY, JSON.stringify(s.slice(-600))); } catch (e) {} } };
// every reminder still to show: { key, id, at (ms), title, body } (one missed in the last 6 hours still shows once)
function upcoming() {
  const now = Date.now(), done = fired(), out = [];
  read().forEach(t => {
    if (t.done || !t.dueDate || !t.rem.length) return;
    const base = remBase(t); if (!base) return;
    t.rem.forEach(m => {
      const at = base.getTime() - m * 60000, key = `${t.id}|${t.dueDate}T${t.dueTime}|${m}`;
      if (done.has(key) || at < now - 6 * 3600e3) return;
      out.push({ key, id: t.id, at, title: (m === 0 ? "Due now: " : "Coming up: ") + t.title,
        body: [dueLabel(t, true), PRI[t.pri].name + " priority", t.loc ? t.loc.label.split(",")[0] : ""].filter(Boolean).join(" · ") });
    });
  });
  return out.sort((a, b) => a.at - b.at);
}
const D = () => window.inquireDesktop && window.inquireDesktop.tasks;
let tick = 0;
function schedule() {
  if (D()) { try { D().schedule(upcoming()); } catch (e) {} return; }
  clearInterval(tick); tick = setInterval(check, 20000); setTimeout(check, 300);
}
function check() { const now = Date.now(); upcoming().filter(r => r.at <= now).forEach(r => { markFired(r.key); notify(r, true); }); }
// a reminder showing: a system notification (browser only: the desktop shows its own) and a message in the app
function notify(r, sys) {
  if (sys && "Notification" in window) {
    const show = () => { try { const n = new Notification(r.title, { body: r.body, tag: r.key }); n.onclick = () => { window.focus(); openTask(r.id); }; } catch (e) {} };
    if (Notification.permission === "granted") show(); else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") show(); });
  }
  if (NS() && NS().toast) NS().toast(`<b>◷ ${esc(r.title)}</b>${r.body ? " · " + esc(r.body) : ""}`, { label: "Open", run: () => openTask(r.id) }, 12000);
  window.dispatchEvent(new CustomEvent("np:task-reminder", { detail: r }));
}
const openTask = id => { if (window.InquireApp) InquireApp.go({ view: "tasks", sel: id }); };
if (D()) {
  try { D().onFired(r => { markFired(r.key); notify(r, false); }); D().onOpen(id => openTask(id)); } catch (e) {}
  try { D().fired().then(keys => { (keys || []).forEach(markFired); schedule(); }); } catch (e) { schedule(); }
} else schedule();

/* ---------- places: OpenStreetMap (Nominatim to check an address, map tiles to show it) ---------- */
async function geocode(q) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=5&q=" + encodeURIComponent(q);
  let body = null;
  if (window.inquireDesktop && inquireDesktop.lookupWord) { const r = await inquireDesktop.lookupWord({ url }); if (r.status !== 200) throw new Error(r.status ? "The map service answered " + r.status : "No connection to the map service"); body = r.body; }
  else { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("The map service answered " + r.status); body = await r.json(); }
  return (Array.isArray(body) ? body : []).map(x => ({ label: String(x.display_name || ""), lat: +x.lat, lon: +x.lon })).filter(x => x.label && isFinite(x.lat) && isFinite(x.lon));
}
// a small map: OpenStreetMap tiles around the place, a pin in the middle, − / ＋ zoom (no library needed)
function mapView(host, loc) {
  let z = 16;
  host.innerHTML = `<div class="nt-tiles"></div><span class="nt-pin" aria-hidden="true"></span><div class="nt-zoom"><button type="button" data-z="1" aria-label="Zoom in">＋</button><button type="button" data-z="-1" aria-label="Zoom out">−</button></div><span class="nt-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</span>`;
  const tiles = $(".nt-tiles", host);
  const draw = () => {
    const W = host.clientWidth || 400, H = host.clientHeight || 200, n = 2 ** z, lat = loc.lat * Math.PI / 180;
    const cx = (loc.lon + 180) / 360 * 256 * n, cy = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * 256 * n;
    const x0 = Math.floor((cx - W / 2) / 256), x1 = Math.floor((cx + W / 2) / 256), y0 = Math.floor((cy - H / 2) / 256), y1 = Math.floor((cy + H / 2) / 256);
    let html = "";
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue; const wx = ((x % n) + n) % n;
      html += `<img alt="" draggable="false" src="https://tile.openstreetmap.org/${z}/${wx}/${y}.png" style="left:${Math.round(x * 256 - cx + W / 2)}px;top:${Math.round(y * 256 - cy + H / 2)}px">`;
    }
    tiles.innerHTML = html;
  };
  host.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { z = Math.max(3, Math.min(19, z + +b.dataset.z)); draw(); });
  const ro = window.ResizeObserver ? new ResizeObserver(draw) : null; if (ro) ro.observe(host);
  draw();
  return { destroy: () => { if (ro) ro.disconnect(); } };
}

/* ---------- .ics (add one task to any calendar app) ---------- */
function ics(t) {
  const d = dueAt(t); if (!d) return null;
  const f = x => x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + "T" + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + "00Z";
  const e = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const start = t.dueTime ? d : null, day = t.dueDate.replace(/-/g, "");
  const end = t.dueTime ? new Date(d.getTime() + 30 * 60000) : null, nd = parse(t.dueDate, "12:00"); nd.setDate(nd.getDate() + 1);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wolfie's Coven//NotePath//EN", "BEGIN:VEVENT", "UID:" + t.id + "@notepath", "DTSTAMP:" + f(new Date()),
    start ? "DTSTART:" + f(start) : "DTSTART;VALUE=DATE:" + day, end ? "DTEND:" + f(end) : "DTEND;VALUE=DATE:" + ymd(nd).replace(/-/g, ""),
    "SUMMARY:" + e(t.title), t.notes ? "DESCRIPTION:" + e(t.notes) : "", t.loc ? "LOCATION:" + e(t.loc.label) : "", t.loc ? `GEO:${t.loc.lat};${t.loc.lon}` : "",
    t.repeat === "daily" ? "RRULE:FREQ=DAILY" : t.repeat === "weekly" ? "RRULE:FREQ=WEEKLY" : "", "PRIORITY:" + (t.pri === "high" ? 1 : t.pri === "med" ? 5 : 9),
    ...t.rem.map(m => `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${e(t.title)}\r\nTRIGGER:-PT${m}M\r\nEND:VALARM`), "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
  return L.join("\r\n") + "\r\n";
}
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

/* ---------- the page ---------- */
const store = { get(k, d) { try { const v = localStorage.getItem("notepath." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("notepath." + k, JSON.stringify(v)); } catch (e) {} } };
const ST = { sel: null, q: "", sort: store.get("tasksort", "due"), showDone: store.get("taskdone", true) };
const sorters = {
  due: (a, b) => (a.done - b.done) || ((dueAt(a) ? dueAt(a).getTime() : 9e15) - (dueAt(b) ? dueAt(b).getTime() : 9e15)) || (PRI[a.pri].rank - PRI[b.pri].rank) || (b.created - a.created),
  pri: (a, b) => (a.done - b.done) || (PRI[a.pri].rank - PRI[b.pri].rank) || ((dueAt(a) ? dueAt(a).getTime() : 9e15) - (dueAt(b) ? dueAt(b).getTime() : 9e15)) || (b.created - a.created),
  new: (a, b) => (a.done - b.done) || (b.created - a.created) };
const priIcon = (p, cls) => `<i class="nt-pri ${cls || ""}" data-pri="${p}" title="${PRI[p].name} priority" aria-label="${PRI[p].name} priority">${PRI[p].glyph}</i>`;
const imgURL = id => (NS() && id ? NS().imageURL(id) : Promise.resolve(null));
function hydratePics(root) { root.querySelectorAll("[data-pic]").forEach(el => imgURL(el.dataset.pic).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; })); }

function render(m, o = {}) {
  if (o.sel) ST.sel = o.sel;
  const s = m.body;
  s.innerHTML = `<div class="nt">
    <aside class="nt-list nb-list"><div class="nb-tools"><label class="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search tasks" aria-label="Search tasks"></label></div>
      <div class="nb-filter"><select class="nt-sort" aria-label="Order of tasks"><option value="due">By due date</option><option value="pri">By priority</option><option value="new">Newest first</option></select><button type="button" class="nb-favtop nt-showdone" aria-pressed="false">✓ Done</button></div>
      <div class="nt-sum num"></div><div class="nb-items nt-items" role="listbox" aria-label="Tasks"></div></aside>
    <section class="nt-ed" aria-label="Task"></section></div>`;
  m.head.innerHTML = `<span class="mw-tip" tabindex="0" title="Tick a task to finish it (a repeating task moves to its next date). Give it a priority, a due date and reminders: NotePath shows a notification when one comes up. Check a place to pin it on a map. Drop photos, videos or any file on the task, and give it a picture of its own." aria-label="Tips">?</span><button type="button" class="np-newb" data-a="newtask" title="Name a new task and choose its priority (Alt+Shift+N)">＋ New Task</button>`;
  const items = $(".nt-items", s), ed = $(".nt-ed", s), q = $('input[type="search"]', s), sortSel = $(".nt-sort", s), sd = $(".nt-showdone", s), sum = $(".nt-sum", s);
  q.value = ST.q; q.oninput = () => { ST.q = q.value; drawList(); };
  sortSel.value = ST.sort; sortSel.onchange = () => { ST.sort = sortSel.value; store.set("tasksort", ST.sort); drawList(); };
  const paintSD = () => { sd.setAttribute("aria-pressed", String(!!ST.showDone)); sd.title = ST.showDone ? "Finished tasks are shown (at the bottom). Click to hide them" : "Finished tasks are hidden. Click to show them"; };
  sd.onclick = () => { ST.showDone = !ST.showDone; store.set("taskdone", ST.showDone); paintSD(); drawList(); }; paintSD();
  $('[data-a="newtask"]', m.head).onclick = () => newTask();
  m.newNote = () => newTask();

  async function newTask() {
    flush();
    const r = await InquireApp.askText({ title: "New task", label: "Task", placeholder: "What needs doing?", ok: "Create task", max: 140, kind: "med",
      kinds: ["high", "med", "low"].map(k => ({ k, glyph: `<span class="nt-pri" data-pri="${k}">${PRI[k].glyph}</span>`, name: PRI[k].name + " priority", desc: k === "high" ? "Urgent or important" : k === "med" ? "Soon, when you can" : "Some day, no rush", placeholder: "What needs doing?" })) });
    if (r == null) return;
    const t = create({ title: r.text || "Untitled task", pri: r.kind || "med" });
    ST.sel = t.id; ST.q = ""; q.value = ""; drawAll();
  }

  function visible() {
    const qq = ST.q.trim().toLowerCase();
    return read().filter(t => (ST.showDone || !t.done) && (!qq || (t.title + "\n" + t.notes + "\n" + (t.loc ? t.loc.label : "")).toLowerCase().includes(qq))).sort(sorters[ST.sort] || sorters.due);
  }
  function drawList() {
    const list = visible(), every = read();
    if (!ST.sel || !every.some(t => t.id === ST.sel)) ST.sel = list[0] ? list[0].id : null;
    const open = every.filter(t => !t.done).length, od = every.filter(overdue).length;
    sum.innerHTML = every.length ? `${open} open${od ? ` · <b class="nt-od">${od} overdue</b>` : ""}${every.length - open ? ` · ${every.length - open} done` : ""}` : "";
    items.innerHTML = list.length ? list.map(t => `<div role="option" tabindex="0" class="nb-it nt-it${t.done ? " done" : ""}" data-id="${t.id}" data-pri="${t.pri}" aria-selected="${t.id === ST.sel}">
        <button type="button" class="nt-ck" role="checkbox" aria-checked="${t.done}" aria-label="${t.done ? "Mark not done" : "Mark done"}: ${esc(t.title)}" title="${t.repeat !== "none" ? "Done (it comes back " + (t.repeat === "daily" ? "tomorrow" : "next week") + ")" : t.done ? "Not done yet" : "Done"}"></button>
        ${t.pic ? `<span class="nt-thumb" data-pic="${t.pic}" aria-hidden="true"></span>` : ""}
        <span class="nt-itx"><span class="nb-t">${priIcon(t.pri)}${esc(t.title)}</span>
        <span class="nt-meta">${t.dueDate ? `<span class="nt-due${overdue(t) ? " od" : soon(t) ? " soon" : ""}">${overdue(t) ? "Overdue · " : ""}${esc(dueLabel(t))}</span>` : ""}${t.repeat !== "none" ? `<span title="${t.repeat === "daily" ? "Every day" : "Every week"}">↻ ${t.repeat === "daily" ? "Daily" : "Weekly"}</span>` : ""}${t.rem.length && t.dueDate && !t.done ? `<span title="${esc(t.rem.map(remLabel).join(", "))}">◷ ${t.rem.length}</span>` : ""}${t.loc ? `<span title="${esc(t.loc.label)}">⌖ ${esc(t.loc.label.split(",")[0])}</span>` : ""}${t.files.length ? `<span>⎙ ${t.files.length}</span>` : ""}</span></span></div>`).join("")
      : `<p class="nb-empty">${ST.q ? "No tasks match." : every.length ? "Every task is done. Show them with ✓ Done." : "No tasks yet. Add one with <b>＋ New Task</b>."}</p>`;
    hydratePics(items);
    items.querySelectorAll(".nt-it").forEach(r => {
      r.onclick = e => { if (e.target.closest(".nt-ck")) return; if (ST.sel === r.dataset.id) return; flush(); ST.sel = r.dataset.id; drawList(); drawEd(); };
      r.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target === r) { e.preventDefault(); r.click(); } };
      $(".nt-ck", r).onclick = e => { e.stopPropagation(); flush(); tick1(r.dataset.id); };
    });
  }
  function tick1(id) {
    const t = get(id); if (!t) return;
    const n = setDone(id, !t.done);
    if (t.repeat !== "none" && !t.done && n) { if (NS()) NS().toast(`Done: <b>${esc(t.title)}</b>. Next: ${esc(dueLabel(n, true))}.`, null, 4000); }
    drawList(); if (ST.sel === id) drawEd();
  }

  /* ----- the overview: everything about one task, editable ----- */
  let saveT = 0, saveP = null, mapV = null;
  const flush = () => { if (saveT) { clearTimeout(saveT); saveT = 0; if (saveP) { update(saveP.id, saveP.patch); saveP = null; drawList(); } } };
  const later = (id, patch) => { saveP = { id, patch: Object.assign(saveP && saveP.id === id ? saveP.patch : {}, patch) }; clearTimeout(saveT); saveT = setTimeout(flush, 450); };
  m.flush = flush;
  function drawEd() {
    if (mapV) { mapV.destroy(); mapV = null; }
    const t = ST.sel && get(ST.sel);
    if (!t) { ed.innerHTML = `<div class="nb-none"><p>Select a task, or add one with <b>＋ New Task</b> at the top right.</p></div>`; return; }
    const imgs = t.files.filter(f => /^(image|video)\//.test(f.type)), docs = t.files.filter(f => !/^(image|video)\//.test(f.type));
    ed.innerHTML = `<div class="nt-head" data-pri="${t.pri}">
        <button type="button" class="nt-pic${t.pic ? " has" : ""}" data-a="pic"${t.pic ? ` data-pic="${t.pic}"` : ""} title="${t.pic ? "Change the task's picture (or drop a photo here)" : "Give this task a picture of its own: something in your life it reminds you of"}" aria-label="Task picture">${t.pic ? "" : `<span>${PRI[t.pri].glyph}</span><small>Add a picture</small>`}</button>
        <div class="nt-hx"><div class="nt-trow"><button type="button" class="nt-ck big" role="checkbox" aria-checked="${t.done}" data-a="done" aria-label="${t.done ? "Mark not done" : "Mark done"}"></button><input class="nb-title nt-title" value="${esc(t.title)}" maxlength="140" aria-label="Task name"></div>
          <div class="nt-pris" role="radiogroup" aria-label="Priority">${Object.entries(PRI).map(([k, p]) => `<button type="button" role="radio" class="nt-prib" data-p="${k}" aria-checked="${t.pri === k}">${priIcon(k)}${p.name}</button>`).join("")}</div>
          ${t.done ? `<p class="nt-donel">✓ Done ${t.doneAt ? new Date(t.doneAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</p>` : t.last ? `<p class="nt-donel">↻ Last done ${new Date(t.last).toLocaleDateString([], { month: "short", day: "numeric" })}</p>` : ""}</div>
        <div class="nt-hb">${t.pic ? `<button type="button" class="btn-s" data-a="picx" title="Remove the picture">Remove picture</button>` : ""}<button type="button" class="btn-s" data-a="ics" title="Add this task to Google, Apple or Outlook calendar (an .ics file)"${t.dueDate ? "" : " disabled"}>⤓ Calendar</button><button type="button" class="btn-s set-warn" data-a="del">Delete</button></div></div>
      <div class="nt-body">
        <section class="nt-card"><h3>When</h3>
          <div class="nt-row"><label>Due date<input type="date" class="nt-in" data-k="dueDate" value="${t.dueDate}"></label><label>Time<input type="time" class="nt-in" data-k="dueTime" value="${t.dueTime}"${t.dueDate ? "" : " disabled"}></label>${t.dueDate ? `<button type="button" class="btn-s" data-a="nodue">Clear</button>` : ""}</div>
          ${t.dueDate ? `<p class="nt-when${overdue(t) ? " od" : ""}">${overdue(t) ? "Overdue: " : "Due "}${esc(dueLabel(t, true))}</p>` : `<p class="nt-hint">No due date. Pick one to set reminders.</p>`}
          <div class="nt-seg" role="radiogroup" aria-label="Repeat">${REPEAT.map(([k, n]) => `<button type="button" role="radio" data-rep="${k}" aria-checked="${t.repeat === k}">${k === "none" ? "" : "↻ "}${n}</button>`).join("")}</div></section>
        <section class="nt-card"><h3>Reminders</h3>
          <div class="nt-chips" role="group" aria-label="Reminders">${REM.map(([mm, n]) => `<button type="button" class="nt-chip" data-rem="${mm}" aria-pressed="${t.rem.includes(mm)}"${t.dueDate ? "" : " disabled"}>◷ ${n}</button>`).join("")}${t.rem.filter(mm => !REM.some(r => r[0] === mm)).map(mm => `<button type="button" class="nt-chip" data-rem="${mm}" aria-pressed="true">◷ ${esc(remLabel(mm))} ✕</button>`).join("")}</div>
          <form class="nt-row nt-custom"><label>Custom<input type="number" min="1" max="999" class="nt-in nt-cn" placeholder="2"${t.dueDate ? "" : " disabled"}></label><select class="nt-in nt-cu" aria-label="Unit"${t.dueDate ? "" : " disabled"}><option value="1">minutes before</option><option value="60">hours before</option><option value="1440">days before</option></select><button type="submit" class="btn-s"${t.dueDate ? "" : " disabled"}>＋ Add</button></form>
          <p class="nt-hint">${t.dueDate ? (t.dueTime ? "Reminders count back from the due time." : "No time set: reminders count back from 9:00 AM that day.") + " They show as notifications while NotePath is running." : "Set a due date first."}</p></section>
        <section class="nt-card nt-loc"><h3>Place</h3>
          ${t.loc ? `<div class="nt-locked"><span class="nt-lock" title="Checked with OpenStreetMap and locked">✓ Locked</span><span class="nt-loclabel">${esc(t.loc.label)}</span><button type="button" class="btn-s" data-a="locx" title="Unlock to change the place">Change</button></div>
            <div class="nt-map" role="img" aria-label="Map of ${esc(t.loc.label)}"></div>
            <p class="nt-maplinks"><a href="https://maps.apple.com/?ll=${t.loc.lat},${t.loc.lon}&q=${encodeURIComponent(t.loc.label.split(",")[0])}" target="_blank" rel="noopener">Open in Apple Maps</a> · <a href="https://www.google.com/maps/search/?api=1&query=${t.loc.lat},${t.loc.lon}" target="_blank" rel="noopener">Google Maps</a></p>`
          : `<form class="nt-row nt-locf"><input class="nt-in nt-locq" placeholder="Address or place name" aria-label="Address" autocomplete="off"><button type="submit" class="btn-s">Check address</button></form><div class="nt-locres" role="listbox" aria-label="Matching places"></div><p class="nt-hint">NotePath checks the address with OpenStreetMap, then locks it onto a map.</p>`}</section>
        <section class="nt-card nt-wide"><h3>Notes</h3><textarea class="nt-notes" rows="4" placeholder="Anything else about this task…" aria-label="Notes">${esc(t.notes)}</textarea></section>
        <section class="nt-card nt-wide nt-files"><h3>Files, photos &amp; videos <span class="num">${t.files.length || ""}</span></h3>
          <div class="nt-drop" tabindex="0" role="button" aria-label="Add files, photos or videos">Drop files, photos or videos here, paste a picture, or <b>choose files…</b></div>
          ${imgs.length ? `<div class="nt-gal">${imgs.map(f => `<div class="nt-gi" data-fid="${f.id}">${/^video\//.test(f.type) ? `<video data-vid="${f.id}" muted preload="metadata"></video><span class="nt-play" aria-hidden="true">▶</span>` : `<span class="nt-gimg" data-pic="${f.id}"></span>`}<button type="button" class="nt-fx" data-rmf="${f.id}" aria-label="Remove ${esc(f.name)}">✕</button><span class="nt-fn">${esc(f.name)}</span></div>`).join("")}</div>` : ""}
          ${docs.length ? `<ul class="nt-docs">${docs.map(f => `<li data-fid="${f.id}"><span class="nt-ext">${esc((f.name.match(/\.([a-z0-9]{1,5})$/i) || ["", "file"])[1].toUpperCase())}</span><button type="button" class="nt-dn" data-open="${f.id}" title="Save ${esc(f.name)} to your computer">${esc(f.name)}</button><span class="num">${f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + " KB" : (f.size / 1048576).toFixed(1) + " MB"}</span><button type="button" class="nt-fx" data-rmf="${f.id}" aria-label="Remove ${esc(f.name)}">✕</button></li>`).join("")}</ul>` : ""}
          <input type="file" class="nt-fin" multiple hidden><input type="file" class="nt-picin" accept="image/*" hidden></section>
      </div>`;
    hydratePics(ed);
    ed.querySelectorAll("video[data-vid]").forEach(v => imgURL(v.dataset.vid).then(u => { if (u) v.src = u; }));
    const id = t.id, re = () => { drawList(); drawEd(); };
    // name, done, priority
    const ti = $(".nt-title", ed); ti.oninput = () => { later(id, { title: ti.value.trim() || "Untitled task" }); const it = items.querySelector(`[data-id="${id}"] .nb-t`); if (it) it.lastChild.textContent = ti.value.trim() || "Untitled task"; };
    $('[data-a="done"]', ed).onclick = () => { flush(); tick1(id); };
    ed.querySelectorAll(".nt-prib").forEach(b => b.onclick = () => { flush(); update(id, { pri: b.dataset.p }); re(); });
    // picture
    const pin = $(".nt-picin", ed);
    $('[data-a="pic"]', ed).onclick = () => pin.click();
    pin.onchange = async () => { const f = pin.files[0]; pin.value = ""; if (f) await setPic(f); };
    const picx = $('[data-a="picx"]', ed); if (picx) picx.onclick = () => { const old = get(id).pic; update(id, { pic: null }); purge({ pic: old, files: [] }); re(); };
    async function setPic(f) { if (!/^image\//.test(f.type) || !NS()) return; const old = get(id).pic; const pid = await NS().putImage(f); update(id, { pic: pid }); if (old) purge({ pic: old, files: [] }); re(); }
    const picEl = $('[data-a="pic"]', ed);
    picEl.addEventListener("dragover", e => { if ([...e.dataTransfer.items].some(i => i.kind === "file")) { e.preventDefault(); picEl.classList.add("over"); } });
    picEl.addEventListener("dragleave", () => picEl.classList.remove("over"));
    picEl.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); picEl.classList.remove("over"); const f = [...e.dataTransfer.files].find(x => /^image\//.test(x.type)); if (f) setPic(f); });
    // when + repeat
    ed.querySelectorAll(".nt-in[data-k]").forEach(inp => inp.onchange = () => {
      flush(); const p = { [inp.dataset.k]: inp.value };
      if (inp.dataset.k === "dueDate" && inp.value && !get(id).dueDate && !get(id).rem.length) p.rem = [0]; // a first due date comes with an "at the due time" reminder
      update(id, p); re();
    });
    const nd = $('[data-a="nodue"]', ed); if (nd) nd.onclick = () => { update(id, { dueDate: "", dueTime: "" }); re(); };
    ed.querySelectorAll("[data-rep]").forEach(b => b.onclick = () => { update(id, { repeat: b.dataset.rep }); re(); });
    // reminders
    ed.querySelectorAll("[data-rem]").forEach(b => b.onclick = () => { const mm = +b.dataset.rem, r = get(id).rem; update(id, { rem: r.includes(mm) ? r.filter(x => x !== mm) : r.concat(mm).sort((a, b2) => a - b2) }); re(); });
    $(".nt-custom", ed).onsubmit = e => { e.preventDefault(); const n = Math.round(+$(".nt-cn", ed).value), u = +$(".nt-cu", ed).value; if (!(n > 0)) return; const mm = n * u, r = get(id).rem; if (!r.includes(mm)) update(id, { rem: r.concat(mm).sort((a, b2) => a - b2) }); re(); };
    // place
    const lf = $(".nt-locf", ed);
    if (lf) {
      const res = $(".nt-locres", ed), lq = $(".nt-locq", ed);
      lf.onsubmit = async e => {
        e.preventDefault(); const qq = lq.value.trim(); if (!qq) return;
        res.innerHTML = `<p class="nt-hint">Checking “${esc(qq)}”…</p>`;
        try {
          const found = await geocode(qq);
          res.innerHTML = found.length ? found.map((x, i) => `<button type="button" role="option" class="nt-lr" data-i="${i}"><span class="nt-lrp" aria-hidden="true">⌖</span>${esc(x.label)}</button>`).join("") + `<p class="nt-hint">Pick the right one to lock it in.</p>`
            : `<p class="nt-hint nt-bad">No place found for “${esc(qq)}”. Try adding the city or postcode.</p>`;
          res.querySelectorAll(".nt-lr").forEach(b => b.onclick = () => { const x = found[+b.dataset.i]; update(id, { loc: { q: qq, label: x.label, lat: x.lat, lon: x.lon } }); re(); });
        } catch (err) { res.innerHTML = `<p class="nt-hint nt-bad">${esc(err.message || "Could not check the address")}. Check your internet connection.</p>`; }
      };
    } else {
      $('[data-a="locx"]', ed).onclick = () => { const l = get(id).loc; update(id, { loc: null }); re(); const lq = $(".nt-locq", ed); if (lq && l) { lq.value = l.q || l.label; lq.focus(); } };
      mapV = mapView($(".nt-map", ed), t.loc);
    }
    // notes
    const nt = $(".nt-notes", ed); nt.oninput = () => later(id, { notes: nt.value });
    // files, photos, videos
    const fin = $(".nt-fin", ed), drop = $(".nt-drop", ed);
    drop.onclick = () => fin.click(); drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fin.click(); } };
    fin.onchange = async () => { const fs = [...fin.files]; fin.value = ""; await addFiles(fs); };
    async function addFiles(fs) {
      if (!fs.length || !NS()) return; flush();
      const add = [];
      for (const f of fs) { try { const fid = /^image\/(png|jpeg|webp)$/.test(f.type) ? await NS().putImage(f) : await NS().putFile(f); add.push({ id: fid, name: String(f.name || "file").slice(0, 120), type: f.type || "application/octet-stream", size: f.size }); } catch (e) { if (NS().toast) NS().toast(esc(f.name) + " is too big (over 500 MB).", null, 4000); } }
      if (add.length) { update(id, { files: get(id).files.concat(add) }); re(); }
    }
    const body = $(".nt-body", ed);
    body.addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } });
    body.addEventListener("dragleave", e => { if (!body.contains(e.relatedTarget)) drop.classList.remove("over"); });
    body.addEventListener("drop", e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
    ed.onpaste = e => { if (e.target.closest("input, textarea")) return; const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
    ed.querySelectorAll("[data-rmf]").forEach(b => b.onclick = e => { e.stopPropagation(); const fid = b.dataset.rmf, f = get(id).files.find(x => x.id === fid); update(id, { files: get(id).files.filter(x => x.id !== fid) }); if (f) purge({ pic: null, files: [f] }); re(); });
    ed.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => { const f = get(id).files.find(x => x.id === b.dataset.open), u = f && await imgURL(f.id); if (u) { const a = document.createElement("a"); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); } });
    ed.querySelectorAll(".nt-gi").forEach(g => g.onclick = e => { if (e.target.closest("[data-rmf]")) return; const f = get(id).files.find(x => x.id === g.dataset.fid); if (f) lightbox(f); });
    // calendar file, delete (with Undo)
    $('[data-a="ics"]', ed).onclick = () => { const x = ics(get(id)); if (x) download(new Blob([x], { type: "text/calendar" }), (get(id).title.replace(/[^\w\- ]+/g, "").trim() || "task") + ".ics"); };
    $('[data-a="del"]', ed).onclick = () => {
      flush(); const gone = remove(id); if (!gone) return; ST.sel = null; drawAll();
      let undone = false; const tm = setTimeout(() => { if (!undone) purge(gone); }, 9000);
      if (NS()) NS().toast(`Deleted “${esc(gone.title)}”`, { label: "Undo", run: () => { undone = true; clearTimeout(tm); const a = read(); a.push(gone); write(a); ST.sel = gone.id; if (s.isConnected) drawAll(); } }, 8000);
    };
  }
  function lightbox(f) {
    imgURL(f.id).then(u => {
      if (!u) return;
      const ov = document.createElement("div"); ov.className = "np-pop nt-lb"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", f.name);
      ov.innerHTML = /^video\//.test(f.type) ? `<video src="${u}" controls autoplay></video>` : `<img src="${u}" alt="${esc(f.name)}">`;
      ov.insertAdjacentHTML("beforeend", `<button type="button" class="nt-lbx" aria-label="Close">✕</button><span class="nt-lbn">${esc(f.name)}</span>`);
      document.body.appendChild(ov);
      const close = () => { ov.remove(); document.removeEventListener("keydown", key, true); };
      const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
      document.addEventListener("keydown", key, true); ov.onclick = e => { if (e.target === ov || e.target.closest(".nt-lbx")) close(); };
    });
  }
  function drawAll() { drawList(); drawEd(); }
  const onChange = () => { if (!saveT) drawList(); };
  window.addEventListener("np:tasks-changed", onChange);
  const clock = setInterval(() => { if (!saveT && !(document.activeElement && document.activeElement.closest && document.activeElement.closest(".nt-ed"))) drawList(); }, 60000); // "Overdue" appears on time
  m.cleanup.push(() => { flush(); window.removeEventListener("np:tasks-changed", onChange); clearInterval(clock); if (mapV) mapV.destroy(); document.querySelectorAll(".nt-lb").forEach(x => x.remove()); });
  m.redraw = drawAll; m.show = x => { if (x.sel) { flush(); ST.sel = x.sel; } drawAll(); };
  drawAll();
}

window.NPTasks = { all, get, create, update, remove, setDone, render, upcoming, dueAt, dueLabel, overdue, nextDue, ics, PRI, REM, geocode,
  media: () => read().flatMap(mediaOf), readRaw: read, writeRaw: write, openCount: () => read().filter(t => !t.done).length, overdueCount: () => read().filter(overdue).length };
})();
