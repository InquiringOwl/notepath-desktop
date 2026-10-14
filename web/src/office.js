/* Note Office (NotePath): Main Menu → Note Office opens a window (the usual fogged window) with a little office where a
   stick figure works. Based on the "Stickman v2" prototype, now at its v2.3 motion (connected arms with a real elbow, 5 px neck, heel-to-toe
   stroll, underhand ball toss, cocked-elbow plane throw, authored singing / desk beat / wave), wired
   to the real notes:
   - every note is ONE sheet of paper. Unfiled notes lie on the desk and on the filing cabinets (75 at most there),
     from the 76th on they stack on the floor in stacks of up to 100. Each sheet keeps its place (placed by its id).
   - every folder is ONE open box, on the left or right of the room (by its id; a subfolder sits with its parent),
     holding one upright sheet per note. Boxes widen to fit and stack up to 4 high.
   - what changed since the last visit plays when the office opens: new notes flutter down, new folders drop in,
     notes filed into a folder are carried to their box (up to 3 trips), deleted notes are crumpled into the bin.
   - click a sheet: that note opens in My notes; click a box: that folder; click him: he waves.
   - colours come from Settings → Appearance (the theme), and repaint when it changes.
   Speed and memory: the room and every sheet are painted once into two cached bitmaps (behind him, and the front
   floor strip in front of him), repainted only when notes, folders, theme or size change; each frame paints those
   bitmaps, the desk and him. Nothing runs while the window is closed; Reduce motion shows a still office.
   The scene is 800 × 480 at its core and widens / heightens to the window's shape (no letterboxing). */
(function () {
"use strict";
const NS = () => window.InquireNotes;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TAU = Math.PI * 2, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
const point = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const rand = i => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const hk = (s, k) => hash(s + "|" + k);
const clone = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]));
function blend(a, b, t) { const p = {}; for (const k in b) p[k] = Array.isArray(b[k]) ? point(a[k] ?? b[k], b[k], t) : mix(a[k] ?? b[k], b[k], t); return p; }

/* ---------- the layout: where every sheet and box goes (pure: notes + folders + room width → positions) ---------- */
const SURFACE_MAX = 75, STACK_MAX = 100, BOX_STACK = 4, BOX_H = 34;
// unfiled sheets on furniture: two piles on the desk (drawn with the desk), one on each filing cabinet
const PILES = [{ x: 456, y: 309, s: .84, cap: 22, layer: "desk" }, { x: 500, y: 310, s: .78, cap: 22, layer: "desk" }, { x: 138, y: 246, s: .8, cap: 18, layer: "back" }, { x: 213, y: 286, s: .66, cap: 13, layer: "back" }];
// stackMax: how many boxes high a column may go (taller rooms allow more). L.overflow = something had to overlap (the caller then widens the room)
function layout(notes, folders, W, stackMax = BOX_STACK) {
  const ox = (W - 800) / 2, xL = -ox + 16, xR = 800 + ox - 16;
  const L = { xL, xR, sheets: [], boxes: [], byNote: new Map(), byFolder: new Map(), overflow: false };
  const fids = new Set(folders.map(f => f.id)), byCreated = (a, b) => (a.created || 0) - (b.created || 0) || (a.id < b.id ? -1 : 1);
  const unfiled = notes.filter(n => !n.folder || !fids.has(n.folder)).sort(byCreated);
  // 1. furniture piles (first 75 unfiled, each to a pile picked by its id; a full pile passes it on)
  const fill = PILES.map(() => 0);
  unfiled.slice(0, SURFACE_MAX).forEach(n => {
    let k = Math.floor(hash(n.id) * PILES.length); for (let i = 0; i < PILES.length && fill[k] >= PILES[k].cap; i++) k = (k + 1) % PILES.length;
    const P = PILES[k], j = fill[k]++;
    add({ id: n.id, title: n.title, kind: "flat", x: P.x + (hk(n.id, 1) - .5) * 7, y: P.y - j * 1.6, a: (hk(n.id, 2) - .5) * .12, s: P.s, layer: P.layer, base: P.y });
  });
  // 2. folders → boxes in columns along the side walls (left or right by the top folder's id), then the front of the room
  const rows = { BL: { y: 402, a: xL + 6, b: 94, dir: 1 }, BR: { y: 406, a: 604, b: xR - 6, dir: -1 } };
  const cols = { BL: [], BR: [] }; const cursor = { BL: rows.BL.a, BR: rows.BR.b };
  const front = [{ y: 468, a: xL + 4, b: 214 }, { y: 470, a: 590, b: xR - 4 }, { y: 474, a: 216, b: 588 }, { y: 450, a: xL + 30, b: 214 }, { y: 452, a: 590, b: xR - 30 }, { y: 434, a: xL + 10, b: 230 }, { y: 436, a: 600, b: xR - 10 }];
  const fcur = front.map(r => r.a);
  const takeFront = w => { for (let i = 0; i < front.length; i++) if (fcur[i] + w <= front[i].b) { const x = fcur[i]; fcur[i] += w + 6; return { x, y: front[i].y }; }
    L.overflow = true; const i = Math.floor(rand(L.sheets.length) * 2), r = front[i]; return { x: r.a + rand(L.boxes.length + 3) * Math.max(10, r.b - r.a - w), y: r.y - 14 * (1 + Math.floor(rand(fcur.length + L.sheets.length) * 4)) }; };
  const inFolder = new Map(); notes.forEach(n => { if (n.folder && fids.has(n.folder)) (inFolder.get(n.folder) || inFolder.set(n.folder, []).get(n.folder)).push(n); });
  const rootOf = f => { let r = f, seen = 0; while (r.parent && seen++ < 64) { const p = folders.find(x => x.id === r.parent); if (!p) break; r = p; } return r; };
  folders.forEach(f => {
    const papers = (inFolder.get(f.id) || []).sort(byCreated), w = clamp(papers.length * 2.6 + 20, 58, 196);
    const prefer = hash(rootOf(f).id) < .5 ? "BL" : "BR", order = prefer === "BL" ? ["BL", "BR"] : ["BR", "BL"];
    let pos = null;
    for (const side of order) {
      const R = rows[side], cs = cols[side], top = cs[cs.length - 1];
      if (top && top.n < stackMax) { pos = { x: clamp(top.cx - w / 2, Math.min(R.a, R.b - w), Math.max(R.a, R.b - w)), y: R.y - top.n * (BOX_H + 20), layer: "back" }; top.n++; break; } // a wider box on top stays inside the room
      const x = R.dir > 0 ? cursor[side] : cursor[side] - w;
      if ((R.dir > 0 && x + w <= R.b) || (R.dir < 0 && x >= R.a)) { cs.push({ cx: x + w / 2, n: 1 }); cursor[side] = R.dir > 0 ? x + w + 8 : x - 8; pos = { x, y: R.y, layer: "back" }; break; }
    }
    if (!pos) { const q = takeFront(w); pos = { x: q.x, y: q.y, layer: "front" }; }
    const box = { id: f.id, name: f.name, depth: f.depth || 0, x: pos.x, y: pos.y, w, h: BOX_H, layer: pos.layer, base: pos.y, n: papers.length, papers: [] };
    L.boxes.push(box); L.byFolder.set(f.id, box);
    const gap = Math.min(2.6, (w - 16) / Math.max(1, papers.length)), x0 = box.x + (w - (papers.length - 1) * gap) / 2; // the sheets sit in the middle of the box
    papers.forEach((n, i) => { const sh = { id: n.id, title: n.title, kind: "up", x: x0 + i * gap + (hk(n.id, 3) - .5) * .8, y: box.y - box.h + 4, a: (hk(n.id, 4) - .5) * .5 - .08, s: 1, layer: box.layer, box }; box.papers.push(sh); add(sh); });
  });
  // 3. unfiled sheets from the 76th: floor stacks of up to 100 (front of the room, either side of the desk, then the middle)
  const rest = unfiled.slice(SURFACE_MAX);
  for (let i = 0; i < rest.length; i += STACK_MAX) {
    const q = takeFront(52), cx = q.x + 26;
    rest.slice(i, i + STACK_MAX).forEach((n, j) => add({ id: n.id, title: n.title, kind: "flat", x: cx + (hk(n.id, 1) - .5) * 4, y: q.y - j * 1.15, a: (hk(n.id, 2) - .5) * .07, s: .78, layer: "front", base: q.y, stack: i / STACK_MAX }));
  }
  function add(sh) { L.sheets.push(sh); L.byNote.set(sh.id, sh); }
  // the front of the room is drawn far → near, so a nearer stack or box covers the ones behind it
  L.front = [...L.boxes.filter(b => b.layer === "front").map((b, i) => ({ b, base: b.base, i })), ...L.sheets.filter(s => s.layer === "front" && !s.box).map((sh, i) => ({ sh, base: sh.base, i: i + 1e6 }))].sort((a, b) => a.base - b.base || a.i - b.i);
  return L;
}

/* ---------- colours from the theme ---------- */
function palette() {
  const probe = document.createElement("span"); probe.style.display = "none"; document.body.appendChild(probe);
  const rgb = c => { probe.style.color = ""; probe.style.color = c; const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]; return m.slice(0, 3).map(Number); };
  const wall = rgb("var(--panel)"), deep = rgb("var(--ink)"), text = rgb("var(--text)"), muted = rgb("var(--muted)"), line2 = rgb("var(--line-2)"), frame = rgb("var(--frame)"), amber = rgb("var(--amber)");
  probe.remove();
  const css = a => `rgb(${a.map(v => Math.round(v)).join(",")})`, mx = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  return { bg: css(wall), floor: css(mx(wall, deep, .55)), ink: css(text), soft: css(muted), faint: css(line2), line: css(mx(wall, text, .32)), paper: css(mx(wall, text, .2)), edge: css(mx(wall, text, .55)),
    accent: css(frame), star: css(amber), shade: `rgba(${deep.map(Math.round).join(",")},.55)`, mouth: css(wall) };
}

/* ---------- the office ---------- */
function mount(host, o = {}) {
  const stage = document.createElement("div"); stage.className = "no-stage";
  stage.innerHTML = `<canvas role="img" aria-label="Note Office: a stick figure at work in an office. Every note is a sheet of paper, every folder a box. Click a sheet to open the note, a box to open the folder."></canvas><span class="no-bubble" aria-hidden="true"></span>`;
  host.appendChild(stage);
  const canvas = stage.querySelector("canvas"), bubble = stage.querySelector(".no-bubble"), ctx = canvas.getContext("2d");
  const back = document.createElement("canvas"), frontC = document.createElement("canvas");
  const abort = new AbortController(), on = (el, ev, fn, opt) => el.addEventListener(ev, fn, Object.assign({ signal: abort.signal }, opt || {}));
  const motionQ = matchMedia("(prefers-reduced-motion: reduce)"), still = () => motionQ.matches || document.documentElement.hasAttribute("data-reduce-motion");
  const config = { limb: 11.5, desk: 3.5 };
  let C = palette();
  let notes = [], folders = [], L = null, hidden = new Set(), hiddenBoxes = new Set();
  let W = 1060, H = 640, OX = 130, OY = 160, SC = 1, dpr = 1, BAND = 290;
  let time = 0, act = "idle", startTime = 0, nextAt = 2.2, greeting = true, round = 0, queue = [], errand = null, trash = [];
  let restingBall = false, restingPlane = false, arrivals = [], lastFrame = 0, frameId = 0, dirty = true, cacheDirty = true, playing = !still(), currentPose = null, fromPose = null;
  let gaze = { x: 400, y: 210, active: false }, hoverT = 0, transitionAt = 0, interrupted = null, greetLater = false;
  const duration = { idle: 6, surprise: .85, wave: 3.4, drum: 7, read: 9, ball: 9.4, trash: 9.4, plane: 12, sing: 10, walk: 18.5, stretch: 6.2 };
  const words = { idle: "Very busy doing nothing.", surprise: "Oh! An audience.", wave: "Hey, you.", drum: "The desk has excellent acoustics.", read: "A serious reader. Mostly.", ball: "An idea with a little bounce.",
    trash: "That one's going in the bin.", plane: "Let that thought take flight.", sing: "Absolutely convinced he can sing.", walk: "A very important little stroll.", file: "Filing. Somebody has to.", stretch: "A stretch. He's earned it." };
  const say = t => { if (o.onStatus) o.onStatus(t); };

  /* ----- data ----- */
  function readData() {
    const N = NS(); if (!N) return;
    notes = N.list().map(n => ({ id: n.id, title: n.title, folder: n.folder || null, created: n.created || n.updated || 0 }));
    folders = N.folders().map(f => ({ id: f.id, name: f.name, parent: f.parent || null, depth: f.depth || 0 }));
    relayout();
    if (o.onCounts) o.onCounts({ notes: notes.length, folders: folders.length, unfiled: notes.filter(n => !n.folder || !folders.some(f => f.id === n.folder)).length });
  }
  // the room starts at the window's shape and widens (zooms out) until every box and stack has a place of its own
  let aspect = 1.7, cssW = 1;
  function relayout() {
    let w = Math.max(1040, 580 * aspect);
    for (let k = 0; k < 14; k++) { const h = w / aspect, oy = h - 480, stackMax = clamp(Math.floor((402 + oy - 40) / 54), 4, 7); L = layout(notes, folders, w, stackMax); if (!L.overflow || w > 3200) break; w *= 1.15; }
    W = w; H = W / aspect; SC = cssW / W; OX = (W - 800) / 2; OY = aspect >= 1.2 ? H - 480 : (H - 480) * .55; cacheDirty = true; dirty = true; // a tall window: the room sits a little above the bottom
  }

  /* ----- drawing helpers (the prototype's) ----- */
  let g = ctx; // the context being drawn into (the screen, or a cache while it is rebuilt)
  function path(points, color = C.ink, width = 1.5, fill = null) { g.beginPath(); g.moveTo(...points[0]); for (let i = 1; i < points.length; i++) g.lineTo(...points[i]); if (fill) { g.closePath(); g.fillStyle = fill; g.fill(); } if (color) { g.strokeStyle = color; g.lineWidth = width; g.stroke(); } }
  function line(a, b, c = C.ink, w = 1.5) { path([a, b], c, w); }
  function curve(pts, c = C.ink, w = 1.5) { g.beginPath(); g.moveTo(pts[0], pts[1]); g.bezierCurveTo(...pts.slice(2)); g.strokeStyle = c; g.lineWidth = w; g.stroke(); }
  function circle(x, y, r, fill = C.ink, stroke = null, width = 1.5) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); } }
  function ellipse(x, y, rx, ry, fill) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = fill; g.fill(); }
  function rect(x, y, w, h, color = C.soft, width = 1.5, fill = C.bg) { path([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], color, width, fill); }
  function paper(x, y, angle = 0, scale = 1, flat = false, fold = false) { g.save(); g.translate(x, y); g.rotate(angle); g.scale(scale, scale);
    if (flat) { path([[-30, -5], [16, -12], [31, -2], [-16, 5], [-30, -5]], C.edge, 1.05, C.paper); line([-21, -5], [13, -9], C.line, .7); }
    else { path([[-22, -16], [20, -16], [23, 15], [-20, 15], [-22, -16]], C.edge, 1.2, C.paper); if (fold) { line([-22, -16], [23, 15], C.line, .8); line([20, -16], [-20, 15], C.line, .8); } else for (let i = 0; i < 3; i++) line([-13, -7 + i * 6], [i === 2 ? 5 : 13, -7 + i * 6], C.line, .8); }
    g.restore(); }
  function upright(x, y, a) { g.save(); g.translate(x, y); g.rotate(a); path([[-1.2, 0], [-1.2, -19], [1.2, -20], [1.2, 0]], C.edge, .7, C.paper); g.restore(); }
  function sheet(sh) { if (sh.kind === "up") upright(sh.x, sh.y, sh.a); else paper(sh.x, sh.y, sh.a, sh.s, true); }
  function ball(x, y, r = 6, angle = 0, squash = 0) { g.save(); g.translate(x, y); g.scale(1 + squash * .6, 1 - squash); g.rotate(squash ? 0 : angle); path([[-r, -2], [-r * .6, -r], [r * .3, -r], [r, -r * .3], [r * .8, r * .6], [0, r], [-r * .8, r * .6], [-r, -2]], C.edge, 1.1, C.paper); path([[-r * .6, -r], [0, -1], [-r * .5, r * .7]], C.line, .8); line([0, -1], [r * .7, r * .5], C.line, .8); g.restore(); }
  function plane(x, y, a = 0, s = 1, bank = 0) { g.save(); g.translate(x, y); g.rotate(a); g.transform(s, 0, bank * s * .35, s * (1 - Math.abs(bank) * .7), 0, 0); path([[-24, -11], [26, 0], [-22, 12], [-12, 1], [-24, -11]], C.edge, 1.3, C.paper); path([[-24, -11], [-6, -1], [26, 0], [-12, 1], [-6, -1], [-8, 9], [-12, 1]], C.soft, .85); g.restore(); }
  function musicalNote(x, y, angle, size, dbl = false) { g.save(); g.translate(x, y); g.rotate(angle); g.scale(size, size); ellipse(0, 0, 3.6, 2.6, C.accent); line([3, -1], [3, -15], C.accent, 1.5);
    if (dbl) { line([3, -15], [13, -18], C.accent, 2); line([13, -18], [13, -4], C.accent, 1.5); ellipse(10, -3, 3.6, 2.6, C.accent); } else curve([3, -15, 12, -12, 10, -7, 5, -8], C.accent, 1.5); g.restore(); }

  /* ----- the room, furniture and the folder boxes (into the caches) ----- */
  function drawCabinet(x, y, w, h, drawers) { path([[x, y], [x + 12, y - 9], [x + w + 12, y - 9], [x + w, y], [x, y]], C.soft, 1.8, C.bg); path([[x + w, y], [x + w + 12, y - 9], [x + w + 12, y + h - 9], [x + w, y + h]], C.soft, 1.8, C.bg); rect(x, y, w, h, C.ink, 2, C.bg);
    const dh = (h - 14) / drawers; for (let i = 0; i < drawers; i++) { rect(x + 6, y + 6 + i * dh, w - 12, dh - 5, C.soft, 1.2, C.bg); rect(x + w / 2 - 9, y + 17 + i * dh, 18, 5, C.soft, 1.1, null); line([x + w / 2 - 11, y + 29 + i * dh], [x + w / 2 + 11, y + 29 + i * dh], C.line, .8); }
    line([x + 5, y + h], [x + 5, y + h + 5], C.ink, 2); line([x + w - 5, y + h], [x + w - 5, y + h + 5], C.ink, 2); }
  function drawRoom() {
    const xL = L.xL, xR = L.xR, top = -OY - 4;
    // floor, wall line and the two side corners (the room is as wide as the window)
    const fb = H - OY + 6; // the floor runs to the bottom of the window
    path([[xL, 362], [xR, 362], [xR + 70 * (fb - 362) / 124, fb], [xL - 70 * (fb - 362) / 124, fb]], null, 0, C.floor);
    line([xL, 362], [xR, 362], C.faint, 1.1); line([xL, top], [xL, 362], C.faint, 1); line([xR, top], [xR, 362], C.faint, 1);
    line([xL, 362], [xL - 70 * (fb - 362) / 124, fb], C.faint, .9); line([xR, 362], [xR + 70 * (fb - 362) / 124, fb], C.faint, .9);
    drawCabinet(104, 250, 67, 148, 3); drawCabinet(182, 289, 61, 109, 2);
    for (const y of [157, 246]) { line([591, y], [733, y], C.ink, 2.9); path([[605, y + 1], [605, y + 17], [624, y + 1]], C.soft, 1.4); path([[702, y + 1], [702, y + 17], [722, y + 1]], C.soft, 1.4); }
    for (let i = 0; i < 4; i++) { const x = 666 + i * 12, h = [35, 42, 37, 32][i]; rect(x, 155 - h, 9, h, C.soft, 1.35, C.bg); line([x + 3, 149], [x + 6, 149], C.soft, .8); }
    // the plant moved to the lower shelf: the cabinet tops hold papers now
    g.save(); g.translate(475, -23); path([[196, 270], [199, 287], [215, 287], [219, 270]], C.soft, 1.4, C.bg); line([194, 269], [221, 269], C.soft, 1.6); curve([207, 269, 204, 253, 212, 243, 209, 235], C.soft, 1.6); curve([207, 258, 192, 257, 191, 247, 193, 244], C.soft, 1.4); curve([193, 244, 204, 244, 207, 252, 207, 258], C.soft, 1.4); curve([209, 249, 223, 245, 221, 236, 220, 233], C.soft, 1.4); curve([220, 233, 212, 232, 209, 242, 209, 249], C.soft, 1.4); g.restore();
    circle(325, 132, 17, null, C.line, 1.3); line([325, 132], [325, 121], C.soft, 1.1); line([325, 132], [334, 135], C.soft, 1.1); circle(325, 132, 1.5, C.soft);
    // the bin, for deleted notes
    path([[534, 400], [538, 428], [560, 428], [564, 400]], C.soft, 1.6, C.bg); ellipse(549, 400, 15, 3.2, C.floor); g.beginPath(); g.ellipse(549, 400, 15, 3.2, 0, 0, TAU); g.strokeStyle = C.soft; g.lineWidth = 1.4; g.stroke();
    trash.slice(-4).forEach((t, i) => ball(541 + i * 5.5, 398 - (i % 2) * 3, 4.2, t));
    ellipse(405, 430, 123, 5, C.shade);
  }
  function drawBox(b) {
    const x = b.x, y = b.y, w = b.w, h = b.h, d = 9;
    // back rim and inside, then the upright sheets, then the front and side faces cover their feet
    path([[x, y - h], [x + d, y - h - 7], [x + w + d, y - h - 7], [x + w, y - h]], C.soft, 1.3, C.floor);
    b.papers.forEach(sh => { if (!hidden.has(sh.id)) sheet(sh); });
    path([[x + w, y - h], [x + w + d, y - h - 7], [x + w + d, y - 7], [x + w, y]], C.soft, 1.5, C.bg);
    rect(x, y - h, w, h, C.ink, 1.8, C.bg);
    line([x - 2, y - h], [x + w + 1, y - h], C.ink, 2);
    // label: the folder's name, handwritten-ish on a strip of tape
    g.save(); g.beginPath(); g.rect(x + 5, y - h + 6, w - 10, h - 12); g.clip();
    g.font = `600 ${b.depth ? 8.5 : 9.5}px "Saira Semi Condensed","Arial Narrow",sans-serif`; try { g.letterSpacing = "0.6px"; } catch (e) {}
    g.fillStyle = C.ink; g.textBaseline = "middle";
    const label = (b.depth ? "↳ " : "") + String(b.name).toUpperCase();
    g.fillText(label, x + 8, y - h / 2 + .5); g.restore();
    if (b.n) { g.save(); g.font = `500 8px "IBM Plex Mono",monospace`; g.fillStyle = C.soft; g.textAlign = "right"; g.fillText(String(b.n), x + w - 5, y - 4); g.restore(); }
  }
  function rebuildCaches() {
    const pw = canvas.width, ph = canvas.height; if (!pw || !ph || !L) return;
    back.width = pw; back.height = ph;
    const bandPx = Math.floor((OY + BAND) * SC * dpr); frontC.width = pw; frontC.height = Math.max(1, ph - bandPx);
    // behind him: room, furniture, cabinet piles, back boxes
    g = back.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, pw, ph);
    g.setTransform(SC * dpr, 0, 0, SC * dpr, OX * SC * dpr, OY * SC * dpr); g.lineCap = "round"; g.lineJoin = "round";
    drawRoom();
    L.boxes.forEach(b => { if (b.layer === "back" && !hiddenBoxes.has(b.id)) drawBox(b); });
    L.sheets.forEach(sh => { if (sh.layer === "back" && !sh.box && !hidden.has(sh.id)) sheet(sh); });
    // in front of him: the floor stacks and any boxes on the front of the floor
    g = frontC.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, frontC.width, frontC.height);
    g.setTransform(SC * dpr, 0, 0, SC * dpr, OX * SC * dpr, OY * SC * dpr - bandPx); g.lineCap = "round"; g.lineJoin = "round";
    L.front.forEach(it => { if (it.b) { if (!hiddenBoxes.has(it.b.id)) drawBox(it.b); } else if (!hidden.has(it.sh.id)) sheet(it.sh); });
    g = ctx; cacheDirty = false;
  }

  /* ----- poses: Stickman v2.3 (docs/note-office-prototype, Oct 11 2026) -----
     One connected 42 + 45 px arm chain with a real elbow, a 20.77 px head on 5 px of neck, a heel-to-toe stroll on
     fixed footholds, a low underhand ball toss with catches, a cocked-elbow plane throw and authored acting phrases
     (sing, desk beat, notice, wave). Coordinates are the prototype's 800 × 480 core. */
  function seated(localTime = time) { const b = Math.sin(localTime * 1.6), s = Math.sin(localTime * .68); return { hip: [401, 323], chest: [399 + s, 253 + b * .8], head: [397 + s * 1.8, 215 + b * 1.2], lh: [366, 313], rh: [437, 312], lf: [358, 418], rf: [448, 418], lk: [366, 348], rk: [435, 349], armFold: 0, walkWeight: 0, walkPhase: 0, walkDir: 1, face: 0, tilt: -.04, chair: 0 }; }
  function standing(x = 400, y = 420) { return { hip: [x, y - 119], chest: [x + 2, y - 191], head: [x + 3, y - 228], lh: [x - 20, y - 115], rh: [x + 23, y - 113], lf: [x - 12, y], rf: [x + 14, y], lk: [x - 17, y - 60], rk: [x + 20, y - 59], armFold: 0, walkWeight: 0, walkPhase: 0, walkDir: 1, face: 1, tilt: .05, chair: 9 }; }
  // two-segment limbs: joints are solved from anchored hands and feet
  function joint(a, b, l1, l2, side) { const dx = b[0] - a[0], dy = b[1] - a[1], raw = Math.hypot(dx, dy), d = clamp(raw, .001, l1 + l2 - .001), ux = dx / (raw || 1), uy = dy / (raw || 1), along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), height = Math.sqrt(Math.max(0, l1 * l1 - along * along)); return [a[0] + ux * along - uy * height * side, a[1] + uy * along + ux * height * side]; }
  // standing still at x (amount 0), optionally carrying a sheet in both hands
  function gait(x, ground, distance, dir, amount = 0, carry = false) { const p = standing(x, ground); p.face = dir; if (carry) { p.lh = [p.chest[0] + dir * 18 - 17, p.chest[1] + 53]; p.rh = [p.chest[0] + dir * 18 + 17, p.chest[1] + 51]; } return p; }
  function rise(t, a = 0, b = 1.6) { const p = blend(seated(), standing(), ramp(t, a + .35, b)), an = pulse(t, a, a + .28, a + .55, b); p.head[0] += an * 17; p.head[1] += an * 7; p.chest[0] += an * 11; p.lh = point(p.lh, [358, 313], an * .65); p.rh = point(p.rh, [440, 313], an * .65); p.chair = ramp(t, a + .25, b) * 9; return p; }
  function sit(t, a, b) { const p = blend(standing(), seated(), ramp(t, a, b)), settle = Math.sin(clamp((t - b) / .6) * Math.PI) * 3; if (t > b) { p.hip[1] += settle; p.chest[1] += settle * .7; p.head[1] += settle * .4; } return p; }
  // a relaxed stroll on a finite set of world-space footholds: only the swinging foot changes anchor; heel strike,
  // roll, toe-off; hips sway over the planted leg with a small opposing chest twist; eased first and last steps
  function travel(t, a, b, x0, x1, carry = false) {
    const z = clamp((t - a) / (b - a)), edge = .20;
    const easeIn = z => (z / 2 - edge * Math.sin(Math.PI * z / edge) / (2 * Math.PI)) / (1 - edge);
    const progress = z < edge ? easeIn(z) : z > 1 - edge ? 1 - easeIn(1 - z) : (z - edge / 2) / (1 - edge);
    const u = progress - .012 * Math.sin(TAU * progress), dir = Math.sign(x1 - x0) || 1, distance = Math.abs(x1 - x0);
    const steps = Math.max(4, Math.round(distance / 32 / 2) * 2), stride = distance / steps;
    const q = Math.min(steps - 1e-8, u * steps), step = Math.floor(q), f = q - step;
    const amount = Math.min(ramp(q, 0, 1.2), 1 - ramp(q, steps - 1.2, steps));
    const p = standing(mix(x0, x1, u), 420), phase = q * Math.PI, sway = Math.sin(phase) * 3.2 * amount;
    p.hip[0] += sway; p.hip[1] = 420 - 119 + 5 * amount - 3.8 * Math.sin(f * Math.PI) * amount;
    p.chest[0] = p.hip[0] + 2 + dir * 3 * amount - sway * 1.45; p.chest[1] = p.hip[1] - 72;
    p.head[0] = mix(x0, x1, u) + 3 + dir * 4 * amount + Math.sin(phase - .42) * 1.4 * amount; p.head[1] = p.chest[1] - 37;
    p.face = dir; p.twist = -sway * .65; p.stridePhase = q;
    const anchor = (j, k) => j < 0 ? x0 + (k ? 14 : -12) : j >= steps - 2 ? x1 + (k ? 14 : -12) : x0 + dir * (j + 1.35) * stride;
    for (let k = 0; k < 2; k++) {
      const moving = step % 2 === k, previous = step - 1 - ((step - 1 - k) % 2 + 2) % 2;
      let ax = anchor(previous, k), ay = 420, toeX = ax + dir * 10, toeY = 420;
      if (moving) {
        const v = ramp(f, .10, .90), target = anchor(step, k);
        ax = mix(ax, target, v); ay -= 28 * Math.pow(Math.sin(Math.PI * v), 1.15) + 5 * (1 - v);
        const angle = mix(.42, -.38, smooth(v)); // toe-off, then a relaxed toe-down swing; the toe rises before heel contact
        toeX = ax + dir * 10 * Math.cos(angle); toeY = ay + 10 * Math.sin(angle);
        if (f < .10) { const lift = 5 * ramp(f, 0, .10); ay = 420 - lift; toeX = anchor(previous, k) + dir * 10; toeY = 420; }
        if (f > .90) { ay = 420; toeX = target + dir * 10; toeY = 420 - 4 * (1 - ramp(f, .90, 1)); }
      }
      p[k ? "rf" : "lf"] = [ax, ay]; p[k ? "rtoe" : "ltoe"] = [toeX, toeY];
    }
    // keep both legs reachable without stretching the 61 + 62 segments
    for (const foot of [p.lf, p.rf]) { const reach = Math.sqrt(Math.max(0, 122.8 * 122.8 - (foot[0] - p.hip[0]) ** 2)), corr = Math.max(0, foot[1] - p.hip[1] - reach); p.hip[1] += corr; p.chest[1] += corr; p.head[1] += corr; }
    p.lk = joint(p.hip, p.lf, 61, 62, -dir); p.rk = joint(p.hip, p.rf, 61, 62, -dir);
    // shoulder pendulum with a delayed forearm (applied in articulateArms)
    p.walkWeight = carry ? 0 : amount; p.walkPhase = phase; p.walkDir = dir;
    if (carry) { p.lh = [p.chest[0] + dir * 18 - 17, p.chest[1] + 53]; p.rh = [p.chest[0] + dir * 18 + 17, p.chest[1] + 51]; }
    return p;
  }
  function walkingPose(t) { let p; if (t < 1.8) p = rise(t, 0, 1.8); else if (t < 5) p = travel(t, 1.8, 5, 400, 560); else if (t < 6.4) { p = standing(560); const a = pulse(t, 5, 5.4, 5.9, 6.4); p.chest[0] -= a * 7; p.head[0] -= a * 11; p.lh = [540 - 8 * a, 309 - 30 * a]; p.rh = [584 + 12 * a, 307 - 35 * a]; p.tilt = -.1 * a; }
    else if (t < 11.7) p = travel(t, 6.4, 11.7, 560, 249); else if (t < 13) { p = standing(249); p.face = -1; p.head[0] -= ramp(t, 11.7, 12.1) * 7 * (1 - ramp(t, 12.5, 13)); } else if (t < 16.8) p = travel(t, 13, 16.8, 249, 400); else p = sit(t, 16.8, 18); return p; }
  // filing a note: grab it off the desk, walk to its folder's box, put it in (with a little flourish), walk back, sit
  function makeErrand(note, box) {
    const tx = box.x + box.w / 2, ty = box.y - box.h - 2, dir = tx >= 400 ? 1 : -1, stand = clamp(tx - dir * 44, L.xL + 30, L.xR - 30), dist = Math.abs(stand - 400), wt = clamp(dist / 76, 1.6, 6.5);
    const T = { grab: 1.3, up: 2.9 }; T.go = T.up + wt; T.reach = T.go + 2.4; T.flair = T.reach + .9; T.back = T.flair + wt; T.sit = T.back + 1.3;
    return { note, box, tx, ty, dir, stand, dist, T, picked: false, done: false, total: T.sit + .3 };
  }
  function errandPose(t) {
    const E = errand, T = E.T; let p;
    if (t < T.grab) { p = seated(); const k = ramp(t, 0, .75); p.chest[0] += k * 19; p.head[0] += k * 27; p.head[1] += k * 8; p.lh = point(p.lh, [447, 306], k); p.rh = point(p.rh, [478, 304], k); p.tilt = .16 * k; }
    else if (t < T.up) { p = rise(t, T.grab, T.up); const k = ramp(t, T.grab, T.up); p.lh = point([447, 306], [401, 282], k); p.rh = point([478, 304], [435, 280], k); }
    else if (t < T.go) p = travel(t, T.up, T.go, 400, E.stand, true);
    else if (t < T.reach) {
      p = gait(E.stand, 420, E.dist, E.dir, 0, true); const reach = pulse(t, T.go, T.go + .95, T.go + 1.6, T.reach), bend = clamp((E.ty - 245) / 90);
      p.hip[1] += reach * 8 * bend; p.chest[0] += E.dir * reach * (14 + 9 * bend); p.chest[1] += reach * 29 * bend; p.head[0] += E.dir * reach * (21 + 11 * bend); p.head[1] += reach * 38 * bend - reach * 6 * (1 - bend);
      p.lh = point(p.lh, [E.tx - 15, E.ty + 1], reach); p.rh = point(p.rh, [E.tx + 15, E.ty - 1], reach); p.tilt = E.dir * .27 * reach * bend; p.face = E.dir;
    }
    else if (t < T.flair) { p = standing(E.stand); const a = pulse(t, T.reach, T.reach + .3, T.reach + .6, T.flair); p.face = E.dir; p.lh = [E.stand - 20, 305]; p.rh = [E.stand + 24, 300 - a * 30]; p.head[1] -= a * 3; p.tilt = -a * .1 * E.dir; } // dusts off his hands
    else if (t < T.back) p = travel(t, T.flair, T.back, E.stand, 400);
    else p = sit(t, T.back, T.sit);
    return p;
  }
  function soften(fn, t, bounds) { const b = [...bounds].reverse().find(b => t >= b); return b !== undefined && t < b + .4 ? blend(fn(b - .0001), fn(t), smooth((t - b) / .4)) : fn(t); }
  // stationary feet stay stationary even while the torso blends into the next phase
  function softenContact(fn, t, bounds) { const p = fn(t), soft = soften(fn, t, bounds); for (const k of ["hip", "lf", "rf", "lk", "rk", "ltoe", "rtoe"]) if (p[k] !== undefined) soft[k] = p[k]; return soft; }

  // proportions: the head is 6.5% larger than v2 (19.5 → 20.7675) with 5 px of visible neck
  const HEAD_RADIUS = 19.5 * 1.065, NECK_LENGTH = 5;
  function finishPose(p) {
    const dx = p.head[0] - p.chest[0], dy = p.head[1] - p.chest[1], len = Math.hypot(dx, dy) || 1, hd = HEAD_RADIUS + NECK_LENGTH + config.limb * 1.17 / 2;
    p.head[0] = p.chest[0] + dx / len * hd; p.head[1] = p.chest[1] + dy / len * hd;
    p.lGoal = [...p.lh]; p.rGoal = [...p.rh]; // the unsolved targets, for interruption blends (never articulate twice)
    articulateArms(p); return p;
  }
  // one connected 42 + 45 px chain per arm; props use the same resolved hands
  function shoulder(p, side) { const sign = side === "l" ? -1 : 1; return [p.chest[0] + sign * 7, p.chest[1] + 1 - sign * (p.twist || 0)]; }
  const angleMix = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  function articulateArms(p) {
    for (const side of ["l", "r"]) {
      const s = shoulder(p, side), h = p[side + "h"], dx = h[0] - s[0], dy = h[1] - s[1], d = Math.hypot(dx, dy);
      if (d > 86.98) { h[0] = s[0] + dx * 86.98 / d; h[1] = s[1] + dy * 86.98 / d; } // a straight arm is fine, a rubber forearm is not
      let e = joint(s, h, 42, 45, side === "l" ? 1 : -1);
      const fold = p[side + "Fold"] ?? p.armFold;
      if (fold > 0) {
        const low = joint(s, h, 42, 45, side === "l" ? -1 : 1);
        if (fold >= 1) e = low;
        else { // rotate both real bones through a change of grip; never flip the elbow
          const arc = (p.gripArc || 0) * (side === "l" ? -1 : 1) * .60 * Math.sin(Math.PI * fold);
          const a = arc + angleMix(Math.atan2(e[0] - s[0], e[1] - s[1]), Math.atan2(low[0] - s[0], low[1] - s[1]), fold);
          const b = arc + angleMix(Math.atan2(h[0] - e[0], h[1] - e[1]), Math.atan2(h[0] - low[0], h[1] - low[1]), fold);
          e = [s[0] + 42 * Math.sin(a), s[1] + 42 * Math.cos(a)]; h[0] = e[0] + 45 * Math.sin(b); h[1] = e[1] + 45 * Math.cos(b);
        }
      }
      if (p.walkWeight > 0) { // loose swing opposite the legs, the forearm trailing
        const phase = p.walkPhase + (side === "r" ? Math.PI : 0), dir = p.walkDir;
        const upper = dir * .43 * Math.cos(phase), fore = dir * (.43 * Math.cos(phase - .30) + .35 + .14 * Math.sin(phase - .65));
        const a = Math.atan2(e[0] - s[0], e[1] - s[1]), b = Math.atan2(h[0] - e[0], h[1] - e[1]), u = angleMix(a, upper, p.walkWeight), v = angleMix(b, fore, p.walkWeight);
        e = [s[0] + 42 * Math.sin(u), s[1] + 42 * Math.cos(u)]; h[0] = e[0] + 45 * Math.sin(v); h[1] = e[1] + 45 * Math.cos(v);
      }
      p[side + "e"] = e;
    }
  }

  // cubic Hermite tracks keep the release velocity exact
  function key(t, x, y, vx = 0, vy = 0) { return { t, x, y, vx, vy }; }
  function track(keys, t, out) {
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], dt = b.t - a.t, u = clamp((t - a.t) / dt), v = 1 - u, h0 = (1 + 2 * u) * v * v, h1 = u * v * v, h2 = u * u * (3 - 2 * u), h3 = u * u * (u - 1);
    out[0] = h0 * a.x + h1 * dt * a.vx + h2 * b.x + h3 * dt * b.vx; out[1] = h0 * a.y + h1 * dt * a.vy + h2 * b.y + h3 * dt * b.vy; return out;
  }
  /* paper ball: crumple, three low underhand tosses hand to hand, then a drop onto the desk (or, for deleted notes, a lob into the bin) */
  const GRAVITY = 1600, BALL_RADIUS = 6, DESK_SURFACE = 323, IMPACT_TIME = .045;
  const tosses = [{ release: 3.12, flight: .70, catchHand: "lh", x: 453, y: 282, cx: 347, cy: 282 }, { release: 4.65, flight: .56, catchHand: "rh", x: 347, y: 282, cx: 453, cy: 282 }, { release: 5.92, flight: .66, catchHand: "lh", x: 453, y: 282, cx: 347, cy: 279 }];
  for (const e of tosses) { e.catch = e.release + e.flight; e.vx = (e.cx - e.x) / e.flight; e.vy = (e.cy - e.y - .5 * GRAVITY * e.flight ** 2) / e.flight; }
  const releaseKeys = e => [key(e.release - .12, e.x - e.vx * .12 / 3, e.y + 6 - e.vy * .12 / 3), key(e.release, e.x, e.y + 6, e.vx, e.vy), key(e.release + .08, e.x + e.vx * .08 / 3, e.y + 6 + e.vy * .08 / 3)];
  const leftBallTrack = [key(2.15, 396, 300), key(2.64, 347, 309), key(3.48, 347, 288), key(3.82, 347, 288), key(3.94, 347, 296), key(4.18, 347, 311), ...releaseKeys(tosses[1]), key(5.26, 347, 307), key(6.38, 347, 285), key(6.58, 347, 285), key(6.70, 347, 293), key(6.95, 410, 310), key(7.36, 378, 310), key(7.96, 366, 313), key(9.4, 366, 313)];
  const rightHead = [key(2.15, 408, 300), key(2.64, 453, 311), ...releaseKeys(tosses[0]), key(3.82, 453, 307), key(5.03, 453, 288), key(5.21, 453, 288), key(5.33, 453, 296), key(5.54, 453, 309), ...releaseKeys(tosses[2]), key(6.52, 453, 307), key(6.95, 410, 310)];
  const rightBallTrack = [...rightHead, key(7.20, 453, 271), key(7.36, 459, 278), key(7.96, 437, 312), key(9.4, 437, 312)];
  const drop = { at: 7.20, x: 453, y: 265 };
  drop.impact = drop.at + Math.sqrt(2 * (DESK_SURFACE - BALL_RADIUS - drop.y) / GRAVITY); drop.rebound = Math.sqrt(2 * GRAVITY * (DESK_SURFACE - BALL_RADIUS - drop.y) * .45);
  drop.second = drop.impact + IMPACT_TIME + 2 * drop.rebound / GRAVITY; drop.end = drop.second + IMPACT_TIME + drop.rebound / GRAVITY; drop.vx = (489 - drop.x) / (drop.end - drop.at + .65 / 2);
  const restingBallAngle = drop.end * 5 + (489 - drop.x - drop.vx * (drop.end - drop.at)) / BALL_RADIUS;
  // the bin lob (NotePath's deleted notes): released from the same hand position with a flick toward the bin
  const lob = { at: 7.20, x: 453, y: 265, tx: 549, ty: 394, flight: .72 }; lob.vx = (lob.tx - lob.x) / lob.flight; lob.vy = (lob.ty - lob.y - .5 * GRAVITY * lob.flight ** 2) / lob.flight; lob.end = lob.at + lob.flight;
  const rightBinTrack = [...rightHead, key(7.20, 453, 271, lob.vx * .3, lob.vy * .3), key(7.42, 474, 262), key(7.96, 437, 312), key(9.4, 437, 312)];
  const ballState = { x: 0, y: 0, angle: 0, squash: 0, held: null, gone: false };
  function ballMotion(t, p, bin) {
    const o = ballState; o.squash = 0; o.held = null; o.gone = false; o.angle = t * 5; let hand = "rh";
    for (const e of tosses) { if (t < e.release) break; if (t < e.catch) { const q = t - e.release; o.x = e.x + e.vx * q; o.y = e.y + e.vy * q + .5 * GRAVITY * q * q; if (e === tosses[2]) o.angle += q * 9; return o; } hand = e.catchHand; }
    if (t >= 6.95) hand = "rh";
    if (t < drop.at) { o.held = hand; o.x = p[hand][0]; o.y = p[hand][1] - BALL_RADIUS; return o; }
    let q = t - drop.at;
    if (bin) { q = Math.min(q, lob.flight); o.x = lob.x + lob.vx * q; o.y = lob.y + lob.vy * q + .5 * GRAVITY * q * q; o.angle += q * 8; o.gone = t >= lob.end; return o; }
    o.x = drop.x + drop.vx * q;
    if (t < drop.impact) o.y = drop.y + .5 * GRAVITY * q * q;
    else if (t < drop.second) { q = Math.max(0, t - drop.impact - IMPACT_TIME); o.y = DESK_SURFACE - BALL_RADIUS - drop.rebound * q + .5 * GRAVITY * q * q; }
    else if (t < drop.end) { q = Math.max(0, t - drop.second - IMPACT_TIME); o.y = DESK_SURFACE - BALL_RADIUS - drop.rebound * .5 * q + .5 * GRAVITY * q * q; }
    else { const u = clamp((t - drop.end) / .65), x0 = drop.x + drop.vx * (drop.end - drop.at); o.x = mix(x0, 489, 1 - (1 - u) ** 2); o.y = DESK_SURFACE - BALL_RADIUS; o.angle = drop.end * 5 + (o.x - x0) / BALL_RADIUS + Math.sin(u * TAU * 2) * .09 * (1 - u); }
    const since = t >= drop.end ? t - drop.end : t >= drop.second ? t - drop.second : t >= drop.impact ? t - drop.impact : Infinity; // a 45 ms squash, lower edge on the desk
    if (since < IMPACT_TIME) { o.squash = .27 * Math.sin(Math.PI * since / IMPACT_TIME); o.y = DESK_SURFACE - BALL_RADIUS * (1 - o.squash); }
    return o;
  }
  function throwBody(p, t, e, strength = 1) {
    const wind = pulse(t, e.release - .62, e.release - .22, e.release - .12, e.release + .02), drive = pulse(t, e.release - .15, e.release + .02, e.release + .16, e.release + .60);
    const dir = (e.vx > 0 ? 1 : -1) * strength, hipDrive = pulse(t, e.release - .23, e.release - .06, e.release + .10, e.release + .50);
    p.hip[0] += dir * (-3 * wind + 5 * hipDrive); p.chest[0] += dir * (-7 * wind + 9 * drive); p.head[0] += dir * (-4 * wind + 5 * drive); p.twist = (p.twist || 0) + dir * (-3 * wind + 4 * drive); p[dir > 0 ? "lf" : "rf"][1] -= 5 * drive;
  }
  const crumpleAmount = t => .25 * (ramp(t, .30, .55) + ramp(t, .75, .98) + ramp(t, 1.16, 1.42) + ramp(t, 1.68, 2.12));
  function ballPose(t, bin) {
    const p = seated(t); p.gripArc = 1; p.armFold = pulse(t, 2.15, 2.64, 7.36, 7.96);
    if (t < 2.15) { const k = crumpleAmount(t), reach = ramp(t, 0, .35), squeeze = Math.sin(k * Math.PI * 4) ** 2; p.lh = point(p.lh, [402 - (21 - 15 * k), 300 - 3 * Math.sin(k * TAU)], reach); p.rh = point(p.rh, [402 + (21 - 15 * k), 300 + 3 * Math.sin(k * TAU)], reach); p.chest[1] -= squeeze * 3; p.head[1] -= squeeze; }
    else { track(leftBallTrack, t, p.lh); track(bin ? rightBinTrack : rightBallTrack, t, p.rh); }
    for (const e of tosses) { throwBody(p, t, e, .22); const give = pulse(t, e.catch, e.catch + .10, e.catch + .17, e.catch + .35); p.hip[1] += give * 2; p.chest[1] += give * 3; p.head[1] += give * 1.5; p.lk[1] += give * 2; p.rk[1] += give * 2; }
    const o = ballMotion(t, p, bin), watch = pulse(t, 2.6, 3.12, 8.6, 9.25);
    p.head[0] += clamp((o.x - 400) * .09, -10, 10) * watch; p.head[1] += clamp((o.y - 240) * .05, -8, 5) * watch;
    if (bin) { const look = pulse(t, 7.4, 7.9, 8.6, 9.3); p.head[0] += look * 8; p.head[1] += look * 4; }
    return p;
  }
  const crumpleOutline = [[-22, -16], [1, -16], [20, -16], [22, 0], [23, 15], [1, 15], [-20, 15], [-21, 0]], crumpleBall = [[-6, -2], [-3.6, -6], [1.8, -6], [6, -1.8], [4.8, 3.6], [0, 6], [-4.8, 3.6], [-6, -2]];
  function drawCrumple(t, p) { // a changing outline and crease pattern, not a scaled rectangle
    const k = crumpleAmount(t), handoff = ramp(t, 1.96, 2.15), x = mix((p.lh[0] + p.rh[0]) / 2, p.rh[0], handoff), y = mix((p.lh[1] + p.rh[1]) / 2, p.rh[1] - BALL_RADIUS, handoff);
    g.save(); g.globalAlpha = ramp(t, 0, .30); g.translate(x, y); g.rotate(Math.sin(k * TAU) * .16); g.beginPath();
    for (let i = 0; i < 8; i++) { const a = crumpleOutline[i], b = crumpleBall[i], jag = Math.sin(i * 2.7 + k * 15) * Math.sin(k * Math.PI) * 4, xx = mix(a[0], b[0], k) + jag, yy = mix(a[1], b[1], k) - jag * .6; if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
    g.closePath(); g.fillStyle = C.paper; g.fill(); g.strokeStyle = C.edge; g.lineWidth = 1.1; g.stroke();
    for (let i = 0; i < 4; i++) { const a = crumpleOutline[i * 2], b = crumpleBall[i * 2]; line([mix(a[0], b[0], k), mix(a[1], b[1], k)], [Math.sin(i * 3) * 4 * (1 - k), Math.cos(i * 2) * 3], C.line, .8); }
    g.restore();
  }

  /* paper plane: fold, bring it up, cock the hand back with the elbow low, unfold the elbow and release from the hand's own
     position and velocity; the glide loses speed along an authored turn and lands on the floor */
  const planeCurves = [[[499, 262], [590, 255], [654, 184], [728, 199]], [[728, 199], [802, 214], [780, 326], [759, 415]], [[759, 415], [754, 436], [742, 437], [732, 437]]];
  const PLANE_RELEASE = 4.05, PLANE_FLIGHT = 5.3, PLANE_DRAG = .38, flightTable = new Float64Array(513 * 3);
  function flightPoint(u, out) { const f = clamp(u) * 3, i = Math.min(2, Math.floor(f)), v = f - i, w = 1 - v, c = planeCurves[i]; for (let j = 0; j < 2; j++) out[j] = w * w * w * c[0][j] + 3 * w * w * v * c[1][j] + 3 * w * v * v * c[2][j] + v * v * v * c[3][j]; return out; }
  const flightTemp = [0, 0]; let flightLength = 0;
  for (let i = 0; i <= 512; i++) { flightPoint(i / 512, flightTemp); if (i) flightLength += Math.hypot(flightTemp[0] - flightTable[(i - 1) * 3], flightTemp[1] - flightTable[(i - 1) * 3 + 1]); flightTable[i * 3] = flightTemp[0]; flightTable[i * 3 + 1] = flightTemp[1]; flightTable[i * 3 + 2] = flightLength; }
  const planeSpeed0 = flightLength * PLANE_DRAG / (1 - Math.exp(-PLANE_DRAG * PLANE_FLIGHT)), planeLaunchAngle = Math.atan2(-7, 91);
  const planeThrow = { release: PLANE_RELEASE, x: 499, y: 262 - 6, vx: Math.cos(planeLaunchAngle) * planeSpeed0, vy: Math.sin(planeLaunchAngle) * planeSpeed0 };
  const planeHandTrack = [key(3.10, 415 + Math.sin(3.10 * 9 + 1) * 4, 300), key(3.48, 445, 269), key(3.68, 415, 249), key(3.78, 415, 249), key(3.86, 430, 263), key(PLANE_RELEASE, 499, 262, planeThrow.vx, planeThrow.vy), key(4.14, 502, 270), key(4.38, 473, 285), key(4.85, 444, 307), key(5.25, 437, 312), key(12, 437, 312)];
  const planeState = { x: 443, y: 232, angle: 0, bank: 0, speed: 0 };
  function flight(u) {
    const t = clamp(u) * PLANE_FLIGHT, dist = planeSpeed0 * (1 - Math.exp(-PLANE_DRAG * t)) / PLANE_DRAG;
    let lo = 0, hi = 512; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (flightTable[m * 3 + 2] < dist) lo = m; else hi = m; }
    const v = clamp((dist - flightTable[lo * 3 + 2]) / (flightTable[hi * 3 + 2] - flightTable[lo * 3 + 2])), o = planeState;
    o.x = mix(flightTable[lo * 3], flightTable[hi * 3], v); o.y = mix(flightTable[lo * 3 + 1], flightTable[hi * 3 + 1], v);
    const z = (lo + v) / 512 * 3, i = Math.min(2, Math.floor(z)), f = z - i, w = 1 - f, c = planeCurves[i];
    const dx = 3 * w * w * (c[1][0] - c[0][0]) + 6 * w * f * (c[2][0] - c[1][0]) + 3 * f * f * (c[3][0] - c[2][0]), dy = 3 * w * w * (c[1][1] - c[0][1]) + 6 * w * f * (c[2][1] - c[1][1]) + 3 * f * f * (c[3][1] - c[2][1]);
    o.angle = Math.atan2(dy, dx) + .025 * Math.sin(t * 5) * Math.sin(Math.PI * clamp(u)); o.bank = .30 * Math.sin(t * 1.2) * Math.sin(Math.PI * clamp(u)); o.speed = planeSpeed0 * Math.exp(-PLANE_DRAG * t); return o;
  }
  function planeMotion(t, p) {
    const o = planeState;
    if (t < PLANE_RELEASE) { o.x = p.rh[0]; o.y = p.rh[1]; o.angle = mix(-.1, planeLaunchAngle, ramp(t, 3.49, PLANE_RELEASE)); o.bank = 0; o.speed = 0; return o; }
    if (t < PLANE_RELEASE + PLANE_FLIGHT) return flight((t - PLANE_RELEASE) / PLANE_FLIGHT);
    const q = t - PLANE_RELEASE - PLANE_FLIGHT, v = planeSpeed0 * Math.exp(-PLANE_DRAG * PLANE_FLIGHT), stop = .65, u = clamp(q / stop);
    o.x = 732 - v * stop * (u - u * u / 2); o.y = 437; o.angle = Math.PI + .09 * smooth(u); o.bank = .12 * smooth(u); o.speed = v * (1 - u); return o;
  }
  function planePose(t) {
    const p = seated(t), fold = pulse(t, 0, .6, 3.10, 3.5); p.lFold = 0; p.gripArc = 1; p.armFold = pulse(t, 3.10, 3.48, 4.70, 5.25);
    p.lh = point(p.lh, [394 + Math.sin(t * 9) * 4, 301], fold);
    if (t < 3.10) p.rh = point(p.rh, [415 + Math.sin(t * 9 + 1) * 4, 300], fold); else track(planeHandTrack, t, p.rh);
    throwBody(p, t, planeThrow, .36);
    p.chest[0] += 4 * pulse(t, 3.85, 4.05, 4.18, 4.65); // weight settles forward as the elbow opens
    if (t >= PLANE_RELEASE) { const o = planeMotion(t, p), watch = pulse(t, PLANE_RELEASE, 4.3, 10.1, 10.8); p.head[0] += clamp((o.x - 400) / 30, 0, 12) * watch; p.head[1] += (o.y - 232) / 55 * watch; }
    const nod = pulse(t, 9.72, 9.95, 10.10, 10.42); p.head[0] += nod * 7; p.chest[1] += nod * 1.8;
    return p;
  }

  /* acting: short authored phrases with holds. Rows: time, hip x, chest x, chest y, head angle, left hand x/y, right hand x/y, shoulder roll */
  const singKeys = [[0, 0, 0, 0, -.05, 366, 313, 437, 312, 0], [.42, 1, 3, 2, .06, 362, 309, 440, 300, -1], [1.05, -1, -4, -1, -.16, 358, 282, 430, 251, 2], [1.65, -2, -7, -2, -.22, 350, 276, 434, 246, 3], [2.12, 0, 1, 0, .08, 359, 287, 435, 252, -1], [2.55, 0, 1, 0, .08, 359, 287, 435, 252, -1], [3.12, 2, 4, 3, .19, 367, 298, 429, 272, -2], [3.78, -3, -8, -3, -.28, 346, 259, 460, 204, 4], [4.12, -3, -8, -3, -.28, 346, 259, 460, 204, 4], [4.72, 1, 6, -1, .20, 356, 244, 450, 257, -3], [5.22, 0, 2, 1, .04, 362, 300, 438, 288, 0], [5.58, 0, 2, 1, .04, 362, 300, 438, 288, 0], [6.22, -1, -4, -1, -.15, 354, 281, 432, 253, 2], [6.88, 2, 8, -2, .23, 369, 275, 454, 225, -3], [7.48, 2, 8, -2, .23, 369, 275, 454, 225, -3], [8.05, 0, 2, 1, .18, 364, 299, 440, 279, 1], [8.43, 0, 2, 1, .18, 364, 299, 440, 279, 1], [9.18, 0, 0, 0, -.05, 366, 313, 437, 312, 0], [10, 0, 0, 0, -.05, 366, 313, 437, 312, 0]];
  const drumKeys = [[0, 0, 0, 0, -.05, 366, 313, 437, 312, 0], [.4, 0, 2, 1, .15, 365, 311, 440, 311, -1], [1.85, 1, 4, 1, .20, 365, 311, 440, 311, -2], [2.20, 0, 1, 0, -.13, 365, 311, 440, 294, 1], [2.65, 0, 1, 0, -.13, 365, 311, 440, 294, 1], [2.87, -1, -3, 2, .16, 365, 311, 440, 311, 2], [4.20, 1, 4, 0, .21, 365, 311, 440, 311, -2], [4.48, -1, -4, 2, -.12, 365, 311, 440, 311, 2], [5.18, 0, 1, 0, -.10, 365, 311, 440, 311, 0], [5.68, 0, 1, 0, -.10, 365, 311, 440, 311, 0], [5.86, 0, 2, 1, .12, 365, 311, 440, 311, 0], [6.65, 0, 0, 0, -.05, 366, 313, 437, 312, 0], [7, 0, 0, 0, -.05, 366, 313, 437, 312, 0]];
  const drumHits = [[.65, "lh", 19], [.98, "rh", 24], [1.32, "lh", 16], [1.70, "rh", 27], [3.12, "lh", 20], [3.46, "rh", 24], [3.78, "lh", 17], [4.04, "rh", 27], [4.65, "lh", 30], [4.76, "rh", 33], [6.10, "lh", 16], [6.40, "rh", 20]];
  const noticeKeys = [[0, 0, 0, 0, -.05, 366, 313, 437, 312, 0], [.17, 0, 0, 0, .22, 366, 313, 438, 306, 0], [.34, 0, 1, -2, .08, 366, 311, 441, 291, -1], [.62, 0, 1, -2, .08, 366, 311, 441, 291, -1], [.85, 0, 0, -1, -.06, 366, 312, 443, 284, 0]];
  const waveKeys = [[0, 0, 0, -1, -.06, 366, 312, 443, 284, 0], [.38, -1, -4, -1, -.15, 364, 313, 456, 239, 2], [.70, -1, -4, -1, -.15, 364, 313, 456, 239, 2], [2.05, -1, -4, -1, -.15, 364, 313, 456, 239, 2], [2.45, 0, -2, 0, -.09, 365, 313, 449, 265, 1], [3.10, 0, 0, 0, -.05, 366, 313, 437, 312, 0], [3.40, 0, 0, 0, -.05, 366, 313, 437, 312, 0]];
  function actingChannel(keys, t, col) { let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++; const a = keys[i], b = keys[i + 1]; return mix(a[col], b[col], ramp(t, a[0], b[0])); }
  function actingPose(keys, t, headDelay = .08) {
    const p = seated(0), breath = Math.sin(t * 1.6) * .25;
    p.hip[0] += actingChannel(keys, t, 1); p.chest[0] += actingChannel(keys, t, 2); p.chest[1] += actingChannel(keys, t, 3) + breath;
    const look = actingChannel(keys, t - headDelay, 4); p.head[0] = p.chest[0] + Math.sin(look) * 40; p.head[1] = p.chest[1] - Math.cos(look) * 40;
    p.lh[0] = actingChannel(keys, t, 5); p.lh[1] = actingChannel(keys, t, 6); p.rh[0] = actingChannel(keys, t, 7); p.rh[1] = actingChannel(keys, t, 8); p.twist = actingChannel(keys, t, 9);
    return p;
  }
  const singVoice = t => Math.max(pulse(t, .65, .90, 1.88, 2.12), pulse(t, 3.35, 3.62, 4.50, 4.88), pulse(t, 6.0, 6.20, 7.45, 7.80));
  function singingPose(t) {
    const p = actingPose(singKeys, t), groove = singVoice(t) * (1 - pulse(t, 3.65, 3.78, 4.12, 4.24)); // small motion inside a phrase, none in the holds
    p.hip[0] += Math.sin(t * TAU * 1.15) * 1.2 * groove; p.chest[1] += Math.sin(t * TAU * 1.15 - .2) * .7 * groove; p.rf[1] -= Math.max(0, Math.sin(t * TAU * 1.15)) * 3 * groove;
    p.armFold = pulse(t, .42, 1.05, 8.43, 9.18); p.face = .35; return p;
  }
  function tapLift(t, hit) { const d = t - hit[0]; if (d < 0) return hit[2] * ramp(d, -.24, -.065) * (1 - ramp(d, -.065, 0)); return 4.5 * pulse(d, 0, .045, .075, .17); }
  function drummingPose(t) {
    const p = actingPose(drumKeys, t), enter = ramp(t, 0, .40), leave = 1 - ramp(t, 6.55, 7); let left = 0, right = 0, settle = 0;
    for (const hit of drumHits) { const lift = tapLift(t, hit); if (hit[1] === "lh") left = Math.max(left, lift); else right = Math.max(right, lift); settle += pulse(t, hit[0], hit[0] + .045, hit[0] + .08, hit[0] + .19); }
    p.lh[1] -= left; p.rh[1] -= right; p.chest[1] += settle * .7 * enter * leave; p.head[0] += settle * 1.8 * enter * leave; p.rf[1] -= Math.min(1, settle) * 2.5 * enter * leave; return p;
  }
  function greetingPose(name, t) {
    const p = actingPose(name === "surprise" ? noticeKeys : waveKeys, t, name === "surprise" ? 0 : .06);
    if (name === "wave") { // the forearm swings about a quiet elbow
      p.armFold = pulse(t, 0, .38, 2.45, 3.10);
      const w = pulse(t, .38, .70, 2.05, 2.45), beat = (t - .70) * 10, base = joint(shoulder(p, "r"), p.rh, 42, 45, 1), a = Math.atan2(p.rh[0] - base[0], p.rh[1] - base[1]), angle = a + .20 * Math.sin(beat) * w;
      p.rh = [base[0] + 45 * Math.sin(angle), base[1] + 45 * Math.cos(angle)];
    }
    return p;
  }
  function actionPose(name, t) {
    if (name === "walk") return softenContact(walkingPose, t, [1.8, 5, 6.4, 11.7, 13, 16.8]);
    if (name === "file") { const T = errand.T; return softenContact(errandPose, t, [T.grab, T.up, T.go, T.reach, T.flair, T.back]); }
    if (name === "ball" || name === "trash") return ballPose(t, name === "trash");
    if (name === "plane") return planePose(t);
    if (name === "sing") return singingPose(t);
    if (name === "drum") return drummingPose(t);
    if (name === "surprise" || name === "wave") return greetingPose(name, t);
    const p = seated(); let k;
    if (name === "read") { const grab = pulse(t, 0, .8, 1.1, 2), read = pulse(t, .9, 2, 6.7, 8.2); p.chest[0] += grab * 13 - read * 7; p.head[0] += grab * 19 - read * 9; p.head[1] += grab * 6 + read * 4; p.lh = point(p.lh, [382, 271], read); p.rh = point(point(p.rh, [480, 304], grab), [425, 270], read); p.tilt = -read * .12 + Math.sin(t * 1.3) * read * .035; p.rf[0] += read * 9;
      const inspect = pulse(t, 2.45, 3.05, 3.55, 4.0), consider = pulse(t, 4.05, 4.35, 4.70, 5.10), adjust = pulse(t, 4.85, 5.18, 5.65, 6.25);
      p.chest[0] += inspect * 4 - consider * 4; p.head[0] += inspect * 14 - consider * 12; p.chest[1] += inspect * 1.5; p.head[1] += inspect * 2; p.lh[0] += adjust * 4; p.rh[0] += adjust * 4; p.lh[1] -= adjust * 2; p.rh[1] -= adjust * 2; }
    if (name === "stretch") { k = pulse(t, .2, 1.4, 3.7, 5.7); p.hip[0] -= k * 3; p.chest[0] -= k * 8; p.chest[1] -= k * 7; p.head[0] -= k * 12; p.head[1] -= k * 10; p.lh = point(p.lh, [355 + Math.sin(t * 1.3) * 3, 171], k); p.rh = point(p.rh, [441, 170], k); p.lf[0] -= k * 13; p.rf[0] += k * 15; p.tilt = -k * .18; }
    return p;
  }

  /* ----- him ----- */
  function limb(a, j, b, width) { const q1 = point(a, j, .8), q2 = point(b, j, .8); g.beginPath(); g.moveTo(...a); g.lineTo(...q1); g.quadraticCurveTo(j[0], j[1], q2[0], q2[1]); g.lineTo(...b); g.strokeStyle = C.ink; g.lineWidth = width; g.stroke(); }
  function drawLegs(p) { limb(p.hip, p.lk, p.lf, config.limb); limb(p.hip, p.rk, p.rf, config.limb); const dir = p.face;
    line(p.lf, p.ltoe || [p.lf[0] + (dir > .3 ? 10 : -10), p.lf[1] + .5], C.ink, config.limb * .86); line(p.rf, p.rtoe || [p.rf[0] + (dir < -.3 ? -10 : 10), p.rf[1] + .5], C.ink, config.limb * .86); }
  function drawBody(p) { const [hx, hy] = p.hip, [cx, cy] = p.chest; curve([hx, hy, hx - 3, hy - 28, cx + 2, cy + 23, cx, cy], C.ink, config.limb * 1.17); line(p.chest, p.head, C.ink, config.limb * .91); circle(p.head[0], p.head[1], HEAD_RADIUS, C.ink); }
  // straight bones meeting at one rounded elbow
  function drawArms(p) { for (const side of ["l", "r"]) path([shoulder(p, side), p[side + "e"], p[side + "h"]], C.ink, config.limb * .9); }
  function drawChair(offset) { g.save(); g.translate(offset, 0); path([[372, 322], [365, 250], [367, 240], [375, 236], [424, 236], [432, 244], [429, 321]], C.soft, 2.4); curve([368, 250, 390, 255, 411, 255, 429, 250], C.line, 1.1); path([[368, 321], [430, 321], [432, 328], [369, 328], [368, 321]], C.soft, 2, C.bg); line([377, 330], [369, 408], C.soft, 2); line([424, 330], [433, 408], C.soft, 2); g.restore(); }
  function drawDesk() {
    line([337, 331], [329, 412], C.soft, config.desk * .7); line([479, 327], [487, 412], C.soft, config.desk * .7);
    path([[294, 325], [507, 325], [532, 308], [321, 308], [294, 325]], C.ink, config.desk, C.bg); path([[294, 325], [294, 331], [507, 331], [532, 314], [532, 308]], C.ink, config.desk * .82); line([507, 325], [507, 331], C.ink, config.desk * .7); line([303, 333], [295, 430], C.ink, config.desk); line([497, 333], [508, 430], C.ink, config.desk);
    path([[323, 293], [325, 311], [339, 311], [341, 293]], C.soft, 1.5, C.bg); ellipse(332, 293, 9, 2.5, C.bg); g.beginPath(); g.ellipse(332, 293, 9, 2.5, 0, 0, TAU); g.strokeStyle = C.soft; g.lineWidth = 1.3; g.stroke(); curve([341, 296, 351, 292, 353, 307, 340, 307], C.soft, 1.5);
    g.save(); g.globalAlpha = .4; curve([333, 287, 327 + Math.sin(time) * 3, 280, 340, 277, 332, 271], C.soft, 1); g.restore();
    // the desk piles (unfiled notes) are drawn with the desk so he sits behind them
    for (const sh of L.sheets) if (sh.layer === "desk" && !hidden.has(sh.id)) sheet(sh);
    if (restingBall) ball(489, DESK_SURFACE - BALL_RADIUS, BALL_RADIUS, restingBallAngle);
  }
  function drawProps(p, t) {
    if (act === "surprise") { const a = pulse(t, 0, .12, .45, .85); g.save(); g.globalAlpha = a; line([p.head[0] + 23, p.head[1] - 19], [p.head[0] + 29, p.head[1] - 28], C.accent, 2); line([p.head[0] + 29, p.head[1] - 9], [p.head[0] + 38, p.head[1] - 13], C.accent, 2); g.restore(); }
    if (act === "drum") for (const hit of drumHits) { const age = t - hit[0]; if (age < 0 || age > .12) continue; const hand = p[hit[1]], x = hand[0], y = hand[1] + 2; g.save(); g.globalAlpha = (1 - age / .12) * .7; line([x - 7, y - 2], [x - 11, y - 7], C.accent, 1.3); line([x + 7, y - 2], [x + 10, y - 8], C.accent, 1.3); g.restore(); }
    if (act === "read" && t > .65 && t < 8.45) { const up = ramp(t, .65, 2), down = ramp(t, 6.8, 8.3), x = mix(mix(474, 403, up), 474, down), y = mix(mix(303, 270, up), 304, down), adjust = pulse(t, 4.85, 5.18, 5.65, 6.25); g.save(); g.globalAlpha = Math.min(ramp(t, .65, .9), 1 - ramp(t, 8.2, 8.45)); paper(x + adjust * 4, y - adjust * 2, -.07 * Math.sin(t), .94, false); g.restore(); }
    if (act === "sing" && t > .5 && t < 9.55) { const strength = singVoice(t); g.save(); g.globalAlpha = strength; ellipse(p.head[0] + 10, p.head[1] + 7, 2.3, 2.5 + Math.max(0, Math.sin(t * 10)) * 1.8, C.mouth); g.restore();
      for (let i = 0; i < 6; i++) { const age = t - .65 - i * .48; if (age < 0) continue; const u = (age % 2.6) / 2.6; g.save(); g.globalAlpha = Math.sin(u * Math.PI) * strength * .8; musicalNote(p.head[0] + 24 + u * 82 + Math.sin(u * TAU + i) * 8, p.head[1] + 4 - u * 85 + Math.sin(u * 6 + i) * 6, Math.sin(u * 5 + i) * .25, .75 + u * .45, i % 3 === 0); g.restore(); } }
    if (act === "file" && errand && errand.picked && !errand.done) { const c = point(p.lh, p.rh, .5); paper(c[0], c[1] - 3, Math.sin(time * 6) * .012, .85, true); }
    if (act === "ball" || act === "trash") {
      if (t < 2.15) drawCrumple(t, p);
      else { const o = ballMotion(t, p, act === "trash"); if (!o.gone) ball(o.x, o.y, BALL_RADIUS, o.angle, o.squash); else ball(549, 397, 4.2, o.angle); }
    }
    if (act === "plane") {
      if (t < 3.10) { g.save(); g.globalAlpha = ramp(t, 0, .6); paper(mix(404, p.rh[0], ramp(t, 2.9, 3.1)), 300, Math.sin(t * 8) * .025, .88 - ramp(t, 1, 3.1) * .26, true, true); g.restore(); }
      else { const q = planeMotion(t, p); plane(q.x, q.y, q.angle, .69, q.bank); }
    }
    if (restingPlane && act !== "plane") { const q = planeMotion(12, null); plane(q.x, q.y, q.angle, .69, q.bank); }
  }
  // new notes flutter down to their place, new folders drop in
  function drawArrivals() {
    const top = -OY - 30; let ended = false;
    arrivals = arrivals.filter(a => { const t = time - a.at; if (t < 1.65) return true; if (a.kind === "note") hidden.delete(a.id); else hiddenBoxes.delete(a.id); ended = true; return false; });
    if (ended) cacheDirty = true;
    for (const a of arrivals) { const t = time - a.at; if (t < 0) continue; const u = ramp(t, 0, 1.65);
      if (a.kind === "note") { const sh = L.byNote.get(a.id); if (!sh) continue; const x = mix(400 + (rand(a.seed) - .5) * 200, sh.x, u) + Math.sin(u * TAU * 2) * 20 * (1 - u), y = mix(top, sh.y, u); if (sh.kind === "up" && u > .85) upright(sh.x, sh.y, sh.a); else paper(x, y, Math.sin(u * 7) * .6 * (1 - u) + (sh.kind === "up" ? 0 : sh.a * u), sh.kind === "up" ? .6 : sh.s, true); }
      else { const b = L.byFolder.get(a.id); if (!b) continue; g.save(); g.translate(0, mix(top - b.y, 0, Math.min(1, u * 1.08)) - Math.sin(clamp((u - .92) / .08) * Math.PI) * 6); drawBox(b); g.restore(); } }
  }

  /* ----- routine control ----- */
  function begin(name) {
    fromPose = currentPose ? clone(currentPose) : null; if (fromPose && fromPose.lGoal) { fromPose.lh = [...fromPose.lGoal]; fromPose.rh = [...fromPose.rGoal]; } act = name; startTime = time; transitionAt = time; dirty = true; say(words[name] || "");
    if (name === "ball") restingBall = false; if (name === "plane") restingPlane = false;
    if (name === "idle") nextAt = time + 3.1 + rand(round + 10) * 2;
  }
  // a greeting may interrupt a desk performance (sing, desk beat), which resumes after the wave; trips and prop
  // handling (ball, plane, reading, filing, the bin) finish first so a sheet, ball or plane never vanishes mid-action
  function greet() {
    if (act === "surprise" || act === "wave") return;
    if (act === "walk" || act === "file" || act === "ball" || act === "trash" || act === "plane" || act === "read") { greetLater = true; say("Just a moment…"); return; }
    interrupted = act === "sing" || act === "drum" ? { name: act, elapsed: time - startTime } : null; greeting = false; greetLater = false; begin("surprise");
  }
  function next() {
    if (greeting) { greeting = false; begin("surprise"); return; }
    const job = queue.shift();
    if (job && job.kind === "file") { const box = L.byFolder.get(job.folder), sh = L.byNote.get(job.id); if (!(box && sh)) { hidden.delete(job.id); cacheDirty = true; } if (box && sh) { errand = makeErrand(sh, box); duration.file = errand.total; hidden.add(job.id); cacheDirty = true; begin("file"); say(`Filing “${clip(sh.title)}” in ${clip(box.name)}.`); return; } }
    if (job && job.kind === "trash") { begin("trash"); say(job.n > 1 ? `${job.n} notes deleted. Into the bin.` : words.trash); return; }
    const seq = ["sing", "walk", "drum", "read", "plane", "stretch", "ball"]; begin(seq[round++ % seq.length]);
  }
  const clip = s => { s = String(s || "Untitled"); return s.length > 28 ? s.slice(0, 26) + "…" : s; };
  function advance(dt) {
    time += dt; const t = time - startTime;
    if (act === "file" && errand) { if (t >= 1.05 && !errand.picked) errand.picked = true; if (t >= errand.T.go + 1.25 && !errand.done) { errand.done = true; hidden.delete(errand.note.id); cacheDirty = true; } }
    if (act === "idle" && time >= nextAt) next();
    else if (act !== "idle" && t >= (duration[act] || 6)) {
      if (act === "ball") restingBall = true; if (act === "plane") restingPlane = true;
      if (act === "trash") { trash.push(rand(trash.length + 7) * 3); cacheDirty = true; }
      if (act === "file" && errand) { if (!errand.done) { hidden.delete(errand.note.id); cacheDirty = true; } errand = null; }
      if (act === "surprise") begin("wave");
      else if (greetLater) { greetLater = false; interrupted = null; greeting = false; begin("surprise"); }
      else if (act === "wave" && interrupted) { const r = interrupted; interrupted = null; begin(r.name); startTime = time - r.elapsed; }
      else begin("idle");
    }
  }

  /* ----- frame ----- */
  function draw() {
    if (!L) return; if (cacheDirty) rebuildCaches();
    g = ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(back, 0, 0);
    ctx.setTransform(SC * dpr, 0, 0, SC * dpr, OX * SC * dpr, OY * SC * dpr); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const t = time - startTime, tr = time - transitionAt; let p = actionPose(act, t); if (fromPose && tr < .45) p = blend(fromPose, p, smooth(tr / .45));
    if (act === "idle" && gaze.active) { p.head[0] += clamp((gaze.x - 400) / 100, -6, 6); p.head[1] += clamp((gaze.y - 220) / 180, -3, 3); }
    finishPose(p); currentPose = p;
    drawChair(p.chair); const outside = p.hip[0] < 285 || p.hip[0] > 538;
    if (outside) { drawDesk(); drawLegs(p); drawBody(p); drawArms(p); } else { drawLegs(p); drawBody(p); drawDesk(); drawArms(p); }
    drawProps(p, t); drawArrivals();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(frontC, 0, Math.floor((OY + BAND) * SC * dpr));
    const show = act === "wave" && t > .3 && t < 2.9; bubble.style.opacity = show ? "1" : "0";
    if (show) { bubble.textContent = "oh, hey."; bubble.style.left = ((OX + p.head[0] + 33) * SC) + "px"; bubble.style.top = ((OY + p.head[1] - 43) * SC) + "px"; }
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
    dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    // the room is at least 1040 wide (the 800-wide core plus space for boxes and stacks), takes the window's shape, and widens with the paperwork
    aspect = r.width / r.height; cssW = r.width;
    relayout(); draw();
  }
  function frame(ts) {
    if (!stage.isConnected) return;
    const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, .04) : 0;
    // an idle office needs fewer frames: ~30 fps when nothing much is moving
    const calm = act === "idle" && !arrivals.length && !gaze.active;
    // v0.5.7: Lite draws ~24 fps while calm and ~30 fps otherwise (60 elsewhere), enough for the stick figure and half the work
    const gap = document.documentElement.dataset.perf === "lite" ? (calm ? 41 : 32) : (calm ? 31 : 0);
    if (gap && lastFrame && ts - lastFrame < gap) { frameId = requestAnimationFrame(frame); return; }
    lastFrame = ts;
    if (playing && !document.hidden) { advance(dt); dirty = true; }
    if (dirty || cacheDirty) { draw(); dirty = false; }
    frameId = requestAnimationFrame(frame);
  }

  /* ----- what changed since the last visit (kept in notepath.office.seen) ----- */
  const SEEN = "notepath.office.seen";
  function catchUp() {
    let prev = null; try { prev = JSON.parse(localStorage.getItem(SEEN) || "null"); } catch (e) {}
    const now = { n: Object.fromEntries(notes.map(n => [n.id, n.folder || ""])), f: folders.map(f => f.id) };
    try { localStorage.setItem(SEEN, JSON.stringify(now)); } catch (e) {}
    if (!prev || !prev.n || still()) return;
    const added = notes.filter(n => !(n.id in prev.n)), fset = new Set(prev.f || []), fNew = folders.filter(f => !fset.has(f.id));
    const moved = notes.filter(n => n.id in prev.n && n.folder && prev.n[n.id] !== n.folder && L.byFolder.has(n.folder));
    const removed = Object.keys(prev.n).filter(id => !now.n[id]).length;
    if (added.length && added.length <= 12) added.forEach((n, i) => { hidden.add(n.id); arrivals.push({ kind: "note", id: n.id, at: time + 1 + i * .12, seed: i }); });
    if (fNew.length && fNew.length <= 6) fNew.forEach((f, i) => { hiddenBoxes.add(f.id); arrivals.push({ kind: "folder", id: f.id, at: time + .6 + i * .18 }); });
    moved.slice(0, 3).forEach(n => { hidden.add(n.id); queue.push({ kind: "file", id: n.id, folder: n.folder }); }); // he still has to carry these over
    if (removed) queue.push({ kind: "trash", n: removed });
    cacheDirty = true;
  }

  /* ----- input: click a sheet / box / him; hover shows the title ----- */
  const toCore = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / SC - OX, (e.clientY - r.top) / SC - OY]; };
  function hit(x, y) {
    if (!L) return null;
    for (let i = L.sheets.length - 1; i >= 0; i--) { const s = L.sheets[i]; if (hidden.has(s.id)) continue;
      if (s.kind === "up") { if (x > s.x - 3 && x < s.x + 3 && y > s.y - 21 && y < s.y - 1) return { note: s.id, title: s.title }; }
      else { const w = 30 * s.s; if (x > s.x - w && x < s.x + w && y > s.y - 8 * s.s && y < s.y + 3) return { note: s.id, title: s.title }; } }
    for (let i = L.boxes.length - 1; i >= 0; i--) { const b = L.boxes[i]; if (x > b.x && x < b.x + b.w + 9 && y > b.y - b.h - 8 && y < b.y) return { folder: b.id, title: `${b.name} · ${b.n} ${b.n === 1 ? "note" : "notes"}` }; }
    return null;
  }
  on(canvas, "pointermove", e => { const [x, y] = toCore(e); gaze = { x, y, active: true }; dirty = true;
    if (!hoverT) hoverT = requestAnimationFrame(() => { hoverT = 0; const h = hit(x, y), me = currentPose && Math.hypot(x - currentPose.head[0], y - currentPose.head[1]) < 60; canvas.style.cursor = h || me ? "pointer" : ""; canvas.title = h ? h.title : me ? "Say hello" : ""; }); });
  on(canvas, "pointerleave", () => { gaze.active = false; dirty = true; });
  on(canvas, "click", e => { const [x, y] = toCore(e);
    if (currentPose && Math.hypot(x - currentPose.head[0], y - currentPose.head[1]) < 60) { greet(); return; }
    const h = hit(x, y); if (h && h.note && o.openNote) o.openNote(h.note); else if (h && h.folder && o.openFolder) o.openFolder(h.folder); });
  on(document, "visibilitychange", () => { lastFrame = 0; });
  on(window, "inquire:theme", () => { C = palette(); cacheDirty = true; dirty = true; });
  on(window, "inquire:notes-changed", () => { readData(); });
  on(motionQ, "change", () => { playing = !still(); dirty = true; });
  const ro = new ResizeObserver(() => resize()); ro.observe(canvas);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { cacheDirty = true; dirty = true; });

  readData(); resize(); catchUp(); if (!playing) { greeting = false; act = "idle"; } draw();
  frameId = requestAnimationFrame(frame);
  return {
    destroy() { abort.abort(); cancelAnimationFrame(frameId); ro.disconnect(); back.width = back.height = frontC.width = frontC.height = 0; canvas.width = canvas.height = 0; stage.remove(); },
    setPlaying(v) { playing = !!v && !still(); lastFrame = 0; dirty = true; }, get playing() { return playing; },
    state: () => ({ notes: notes.length, folders: folders.length, sheets: L ? L.sheets.length : 0, boxes: L ? L.boxes.length : 0, act, queue: queue.length, arrivals: arrivals.length, W, H, OX, OY, SC }),
    layout: () => L, poke: name => begin(name), pose: () => currentPose, greet: () => greet()
  };
}

/* ---------- the window (Main Menu → Note Office) ---------- */
let cur = null;
function open() {
  const A = window.InquireApp; if (!A || !A.modal) return;
  const m = A.modal("office", { title: "Note Office", cls: "mw-office", back: true, sub: `<span class="no-status">Very busy doing nothing.</span>` });
  if (cur) return m;
  m.head.innerHTML = `<span class="no-counts num" aria-live="polite"></span><button type="button" class="np-hb no-pause" aria-pressed="false" title="Pause or play the office">❚❚ Pause</button>`;
  const counts = m.head.querySelector(".no-counts"), status = m.win.querySelector(".no-status"), pause = m.head.querySelector(".no-pause");
  const goNotes = x => { A.go(Object.assign({ view: "notes", space: "notes" }, x)); };
  cur = mount(m.body, {
    onStatus: t => { status.textContent = t; },
    onCounts: c => { counts.textContent = `${c.notes.toLocaleString()} ${c.notes === 1 ? "note" : "notes"} · ${c.folders.toLocaleString()} ${c.folders === 1 ? "folder" : "folders"} · ${c.unfiled.toLocaleString()} unfiled`; },
    openNote: id => goNotes({ sel: id, folder: "all" }), openFolder: id => goNotes({ folder: id })
  });
  const paint = () => { pause.textContent = cur.playing ? "❚❚ Pause" : "▶ Play"; pause.setAttribute("aria-pressed", String(!cur.playing)); };
  pause.onclick = () => { cur.setPlaying(!cur.playing); paint(); }; paint();
  // once the window has faded in, the fogged app behind it is hidden: the window covers it all but a thin margin, and a
  // blurred page under an animating canvas would be re-blurred on every frame
  const fogT = setTimeout(() => document.body.classList.add("office-on"), 450);
  m.cleanup.push(() => { clearTimeout(fogT); document.body.classList.remove("office-on"); if (cur) { cur.destroy(); cur = null; } });
  return m;
}
window.NoteOffice = { open, mount, layout, get current() { return cur; } };
})();
