/* Graph widget (NotePath): <div class="nw" data-w="graph" data-src='{"title","pts":[[x,y]…],"fit","snap","view"}'>.
   Click the grid to add a point, drag a point to move it, click a point (without dragging) to remove it, or type "x, y".
   The grid sizes itself to the points (unless zoomed with − / +; "Fit" goes back to automatic) and the side panel writes the
   equations: one curve through every point (default), straight lines between neighbours, a best-fit line or a best-fit parabola.
   The maths (NPGraph.analyse, fmt, solve) touches no DOM so tools/unit.js can check it. Loaded after notes-widgets.js. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FITS = [["curve", "Curve through all points"], ["lines", "Straight lines between points"], ["best", "Best-fit line"], ["quad", "Best-fit parabola"]];
const SNAPS = [["1", "Snap to 1"], ["0.5", "Snap to ½"], ["0.1", "Snap to 0.1"], ["0", "No snap"]];
const MAXPTS = 40, MAXEXACT = 10;
const DEF = { title: "", pts: [], fit: "curve", snap: 1, view: null };

/* ---------- maths ---------- */
const MINUS = "−";
// a number as people write it: whole numbers, simple fractions (denominator ≤ 12), otherwise up to 3 decimals
function fmt(v, plain) {
  if (!isFinite(v)) return "undefined";
  if (Math.abs(v) < 1e-9) return "0";
  const sg = v < 0 ? MINUS : "", a = Math.abs(v);
  if (Math.abs(a - Math.round(a)) < 1e-9) return sg + Math.round(a);
  if (!plain) for (let d = 2; d <= 12; d++) { const n = a * d; if (Math.abs(n - Math.round(n)) < 1e-7) { const N = Math.round(n), g = gcd(N, d); return sg + (N / g) + "/" + (d / g); } }
  return sg + (a >= 1000 ? a.toFixed(1) : a >= 100 ? a.toFixed(2) : parseFloat(a.toFixed(3)).toString());
}
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = n => String(n).split("").map(c => SUP[c]).join("");
// coefficients c[0] + c[1]x + c[2]x² … → "y = 2x² − 3x + 1/2"
function polyStr(c) {
  let out = "";
  for (let k = c.length - 1; k >= 0; k--) {
    const v = Math.abs(c[k]) < 1e-9 ? 0 : c[k]; if (!v) continue;
    const a = Math.abs(v), f = fmt(a), body = k === 0 ? f : (f === "1" ? "" : f.includes("/") ? "(" + f + ")" : f) + "x" + (k > 1 ? sup(k) : "");
    out += out ? (v < 0 ? " " + MINUS + " " : " + ") + body : (v < 0 ? MINUS : "") + body;
  }
  return "y = " + (out || "0");
}
const evalPoly = (c, x) => c.reduceRight((acc, v) => acc * x + v, 0);
// solve A·x = b (Gaussian elimination, partial pivoting); null when singular
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const clean = c => c.map(v => Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);
function exactPoly(pts) { const n = pts.length; const c = solve(pts.map(([x]) => Array.from({ length: n }, (_, k) => Math.pow(x, k))), pts.map(p => p[1])); return c && clean(c); }
function leastSq(pts, deg) {
  const A = [], b = [];
  for (let i = 0; i <= deg; i++) { A.push([]); for (let j = 0; j <= deg; j++) A[i].push(pts.reduce((s, [x]) => s + Math.pow(x, i + j), 0)); b.push(pts.reduce((s, [x, y]) => s + y * Math.pow(x, i), 0)); }
  const c = solve(A, b); if (!c) return null;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length, tot = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0), res = pts.reduce((s, [x, y]) => s + (y - evalPoly(c, x)) ** 2, 0);
  return { c: clean(c), r2: tot ? 1 - res / tot : 1 };
}
const P = (pts, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
const pt = p => `(${fmt(p[0])}, ${fmt(p[1])})`;
// extra facts for a line or a parabola
function facts(c) {
  const out = [];
  if (c.length === 2 || (c.length === 3 && Math.abs(c[2]) < 1e-9)) {
    out.push(["Slope", fmt(c[1])], ["y-intercept", pt([0, c[0]])]);
    if (Math.abs(c[1]) > 1e-9) out.push(["x-intercept", pt([-c[0] / c[1], 0])]);
  } else if (c.length === 3) {
    const [k, b, a] = c, vx = -b / (2 * a); out.push(["Vertex", pt([vx, evalPoly(c, vx)])], ["Opens", a > 0 ? "upward" : "downward"], ["y-intercept", pt([0, k])]);
    const D = b * b - 4 * a * k;
    if (D > 1e-12) out.push(["x-intercepts", pt([(-b - Math.sqrt(D)) / (2 * a), 0]) + " and " + pt([(-b + Math.sqrt(D)) / (2 * a), 0])]);
    else if (Math.abs(D) <= 1e-12) out.push(["x-intercept", pt([vx, 0])]);
  } else out.push(["y-intercept", pt([0, c[0]])]);
  return out;
}
// → { eqs: [{label, eq}], facts: [[name, value]], note, draw: [{type:"poly", c} | {type:"seg", a, b} | {type:"vline", x}] }
function analyse(d) {
  const pts = (d.pts || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
  const r = { eqs: [], facts: [], note: "", draw: [] };
  if (!pts.length) { r.note = "Click the grid to add a point."; return r; }
  if (pts.length === 1) { r.eqs.push({ label: "Point A", eq: `x = ${fmt(pts[0][0])},  y = ${fmt(pts[0][1])}` }); r.note = "Add another point to get a line."; return r; }
  const xs = pts.map(p => p[0]), sameX = new Set(xs.map(x => x.toFixed(9))).size < xs.length;
  if (xs.every(x => Math.abs(x - xs[0]) < 1e-9)) { r.eqs.push({ label: "Vertical line", eq: `x = ${fmt(xs[0])}` }); r.facts.push(["Slope", "undefined (vertical)"]); r.draw.push({ type: "vline", x: xs[0] }); return r; }
  let fit = d.fit || "curve";
  if (fit === "curve" && (sameX || pts.length > MAXEXACT)) { r.note = sameX ? "Two points share the same x, so no single y = … curve passes through all of them: showing straight lines instead." : `A single curve through more than ${MAXEXACT} points gets wild: showing straight lines instead (try a best fit).`; fit = "lines"; }
  if (fit === "quad" && pts.length < 3) fit = "best";
  if (fit === "curve") {
    const c = exactPoly(pts); if (!c) { r.note = "Those points can't be joined by one curve."; return r; }
    const deg = c.reduce((m, v, k) => Math.abs(v) > 1e-9 ? k : m, 0);
    r.eqs.push({ label: ["Constant", "Line", "Parabola", "Cubic", "Quartic", "Quintic"][deg] || `Degree ${deg} polynomial`, eq: polyStr(c.slice(0, deg + 1)) });
    r.facts = facts(c.slice(0, Math.max(2, deg + 1))); r.draw.push({ type: "poly", c });
  } else if (fit === "lines") {
    const s = pts.map((p, i) => ({ p, n: P(pts, i) })).sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1]);
    for (let i = 0; i + 1 < s.length; i++) {
      const [a, b] = [s[i], s[i + 1]], dx = b.p[0] - a.p[0];
      if (Math.abs(dx) < 1e-9) { r.eqs.push({ label: `${a.n}${b.n}`, eq: `x = ${fmt(a.p[0])}`, dom: `${fmt(Math.min(a.p[1], b.p[1]))} ≤ y ≤ ${fmt(Math.max(a.p[1], b.p[1]))}` }); }
      else { const m = (b.p[1] - a.p[1]) / dx, k = a.p[1] - m * a.p[0]; r.eqs.push({ label: `${a.n}${b.n}`, eq: polyStr(clean([k, m])), dom: `${fmt(a.p[0])} ≤ x ≤ ${fmt(b.p[0])}` }); }
      r.draw.push({ type: "seg", a: a.p, b: b.p });
    }
    if (s.length === 2) { const m = (s[1].p[1] - s[0].p[1]) / (s[1].p[0] - s[0].p[0]); r.facts = facts([s[0].p[1] - m * s[0].p[0], m]); }
    const len = s.slice(1).reduce((t, x, i) => t + Math.hypot(x.p[0] - s[i].p[0], x.p[1] - s[i].p[1]), 0);
    r.facts.push(["Length", fmt(len, true)]);
  } else {
    const f = leastSq(pts, fit === "quad" ? 2 : 1); if (!f) { r.note = "Not enough different x values for that fit."; return r; }
    r.eqs.push({ label: fit === "quad" ? "Best-fit parabola" : "Best-fit line", eq: polyStr(f.c) });
    r.facts = facts(f.c); r.facts.push(["r²", f.r2.toFixed(3) + (f.r2 > .999 ? " (exact)" : "")]);
    r.draw.push({ type: "poly", c: f.c });
  }
  return r;
}

/* ---------- view ---------- */
const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
function autoView(pts) {
  let x0 = -10, x1 = 10, y0 = -10, y1 = 10;
  pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const mx = (x1 - x0) * .08, my = (y1 - y0) * .08;
  if (x0 < -10) x0 -= mx; if (x1 > 10) x1 += mx; if (y0 < -10) y0 -= my; if (y1 > 10) y1 += my;
  const sx = nice((x1 - x0) / 10), sy = nice((y1 - y0) / 10);
  return [Math.floor(x0 / sx) * sx, Math.ceil(x1 / sx) * sx, Math.floor(y0 / sy) * sy, Math.ceil(y1 / sy) * sy];
}

/* ---------- the widget ---------- */
const VW = 480, VH = 360;
function mount(el) {
  const readSrc = () => { try { return Object.assign({}, DEF, JSON.parse(el.dataset.src || "{}")); } catch (e) { return Object.assign({}, DEF); } };
  const d = readSrc(); d.pts = (Array.isArray(d.pts) ? d.pts : []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).slice(0, MAXPTS);
  el.innerHTML = `<div class="nw-h"><span class="nw-tag">∿</span><input class="nw-title" maxlength="80" placeholder="Graph" aria-label="Graph title" value="${esc(d.title)}">
      <select class="ng-fit" aria-label="Equation">${FITS.map(([k, n]) => `<option value="${k}"${d.fit === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <select class="ng-snap" aria-label="Snap">${SNAPS.map(([k, n]) => `<option value="${k}"${String(d.snap) === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <button type="button" class="nw-b" data-a="out" title="Zoom out" aria-label="Zoom out">−</button><button type="button" class="nw-b" data-a="in" title="Zoom in" aria-label="Zoom in">+</button><button type="button" class="nw-b" data-a="fit" title="Size the grid to the points">Fit</button>
      <button type="button" class="nw-b" data-a="clear" title="Remove every point">Clear</button><button type="button" class="nw-b nw-del" data-a="del" title="Remove this graph" aria-label="Remove graph">✕</button></div>
    <div class="ng-body"><div class="ng-plot"><svg class="ng-svg" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Graph grid: click to add a point"></svg><div class="ng-hint">Click to add a point · drag a point to move it · click a point to remove it</div></div>
      <div class="ng-side" aria-live="polite"><div class="ng-eqs"></div><div class="ng-facts"></div><div class="ng-note"></div>
        <div class="ng-pts-h">Points</div><ol class="ng-pts"></ol>
        <form class="ng-add"><input class="ng-in" placeholder="x, y" aria-label="Add a point: x, y" spellcheck="false"><button type="submit" class="nw-b">Add</button></form></div></div>`;
  const svg = el.querySelector(".ng-svg"), title = el.querySelector(".nw-title"), fitS = el.querySelector(".ng-fit"), snapS = el.querySelector(".ng-snap");
  const view = () => d.view && d.view.length === 4 && d.view.every(isFinite) && d.view[1] > d.view[0] && d.view[3] > d.view[2] ? d.view : autoView(d.pts);
  const save = () => { el.dataset.src = JSON.stringify({ title: title.value.trim(), pts: d.pts, fit: d.fit, snap: d.snap, view: d.view }); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const snap = v => { const s = +d.snap; return s ? Math.round(v / s) * s : Math.round(v * 1000) / 1000; };
  let V = view();
  const sx = x => (x - V[0]) / (V[1] - V[0]) * VW, sy = y => VH - (y - V[2]) / (V[3] - V[2]) * VH;
  function draw() {
    V = view();
    const stx = nice((V[1] - V[0]) / 10), sty = nice((V[3] - V[2]) / 8);
    let g = "";
    for (let x = Math.ceil(V[0] / stx) * stx; x <= V[1] + 1e-9; x += stx) g += `<line class="ng-grid" x1="${sx(x)}" x2="${sx(x)}" y1="0" y2="${VH}"/>`;
    for (let y = Math.ceil(V[2] / sty) * sty; y <= V[3] + 1e-9; y += sty) g += `<line class="ng-grid" y1="${sy(y)}" y2="${sy(y)}" x1="0" x2="${VW}"/>`;
    const ax = Math.min(VH - 4, Math.max(4, sy(0))), ay = Math.min(VW - 4, Math.max(4, sx(0)));
    g += `<line class="ng-axis" x1="0" x2="${VW}" y1="${ax}" y2="${ax}"/><line class="ng-axis" y1="0" y2="${VH}" x1="${ay}" x2="${ay}"/>`;
    for (let x = Math.ceil(V[0] / stx) * stx; x <= V[1] + 1e-9; x += stx) if (Math.abs(x) > 1e-9 && sx(x) > 10 && sx(x) < VW - 10) g += `<text class="ng-lab" x="${sx(x)}" y="${ax > VH - 18 ? ax - 6 : ax + 14}" text-anchor="middle">${fmt(x, true)}</text>`;
    for (let y = Math.ceil(V[2] / sty) * sty; y <= V[3] + 1e-9; y += sty) if (Math.abs(y) > 1e-9 && sy(y) > 10 && sy(y) < VH - 6) g += `<text class="ng-lab" x="${ay > VW - 40 ? ay - 6 : ay + 6}" y="${sy(y) + 4}" text-anchor="${ay > VW - 40 ? "end" : "start"}">${fmt(y, true)}</text>`;
    const r = analyse(d);
    r.draw.forEach(o => {
      if (o.type === "seg") g += `<line class="ng-curve" x1="${sx(o.a[0])}" y1="${sy(o.a[1])}" x2="${sx(o.b[0])}" y2="${sy(o.b[1])}"/>`;
      else if (o.type === "vline") g += `<line class="ng-curve" x1="${sx(o.x)}" x2="${sx(o.x)}" y1="0" y2="${VH}"/>`;
      else { const N = 320, lim = (V[3] - V[2]) * 20; let path = "", pen = false;
        for (let i = 0; i <= N; i++) { const x = V[0] + (V[1] - V[0]) * i / N, y = evalPoly(o.c, x); if (!isFinite(y) || Math.abs(y - V[2]) > lim) { pen = false; continue; } path += (pen ? "L" : "M") + sx(x).toFixed(1) + " " + sy(y).toFixed(1); pen = true; }
        g += `<path class="ng-curve" d="${path}"/>`; }
    });
    d.pts.forEach((p, i) => { const X = sx(p[0]), Y = sy(p[1]); g += `<g class="ng-pt" data-i="${i}"><circle cx="${X}" cy="${Y}" r="11" class="ng-hit"/><circle cx="${X}" cy="${Y}" r="5"/><text x="${X + 8}" y="${Y - 8}">${P(d.pts, i)}</text></g>`; });
    svg.innerHTML = g;
    el.querySelector(".ng-eqs").innerHTML = r.eqs.map(e => `<div class="ng-eq"><span class="ng-eql">${esc(e.label)}</span><span class="ng-eqv">${esc(e.eq)}</span>${e.dom ? `<span class="ng-dom">for ${esc(e.dom)}</span>` : ""}</div>`).join("");
    el.querySelector(".ng-facts").innerHTML = r.facts.length ? `<dl>${r.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "";
    el.querySelector(".ng-note").textContent = r.note;
    el.querySelector(".ng-pts").innerHTML = d.pts.map((p, i) => `<li><b>${P(d.pts, i)}</b><span class="num">${esc(pt(p))}</span><button type="button" data-rm="${i}" title="Remove point ${P(d.pts, i)}" aria-label="Remove point ${P(d.pts, i)}">✕</button></li>`).join("");
  }
  const toData = e => { const r = svg.getBoundingClientRect(); return [V[0] + (e.clientX - r.left) / r.width * (V[1] - V[0]), V[3] - (e.clientY - r.top) / r.height * (V[3] - V[2])]; };
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    if (e.button) return; e.preventDefault(); svg.setPointerCapture(e.pointerId);
    const g = e.target.closest(".ng-pt"); drag = { i: g ? +g.dataset.i : -1, x: e.clientX, y: e.clientY, moved: false };
  });
  svg.addEventListener("pointermove", e => {
    if (!drag || drag.i < 0) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    drag.moved = true; const [x, y] = toData(e); d.pts[drag.i] = [snap(x), snap(y)]; const keep = d.view; d.view = V; draw(); d.view = keep;
  });
  svg.addEventListener("pointerup", e => {
    if (!drag) return; const k = drag; drag = null;
    if (k.i >= 0 && !k.moved) d.pts.splice(k.i, 1);
    else if (k.i < 0) { if (d.pts.length >= MAXPTS) return; const [x, y] = toData(e); d.pts.push([snap(x), snap(y)]); }
    draw(); save();
  });
  svg.addEventListener("pointercancel", () => { drag = null; draw(); });
  el.querySelector(".ng-pts").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (!b) return; d.pts.splice(+b.dataset.rm, 1); draw(); save(); });
  el.querySelector(".ng-add").addEventListener("submit", e => {
    e.preventDefault(); const inp = el.querySelector(".ng-in"), m = inp.value.replace(/[()]/g, "").replace(/−/g, "-").match(/^\s*(-?\d*\.?\d+(?:e-?\d+)?)\s*[,; ]\s*(-?\d*\.?\d+(?:e-?\d+)?)\s*$/i);
    if (!m || d.pts.length >= MAXPTS) { inp.classList.add("bad"); setTimeout(() => inp.classList.remove("bad"), 900); return; }
    d.pts.push([+m[1], +m[2]]); d.view = null; inp.value = ""; draw(); save();
  });
  el.querySelector(".ng-in").addEventListener("input", e => e.stopPropagation());
  title.addEventListener("input", e => { e.stopPropagation(); save(); });
  fitS.addEventListener("change", () => { d.fit = fitS.value; draw(); save(); });
  snapS.addEventListener("change", () => { d.snap = +snapS.value; save(); });
  const zoom = f => { const v = view(), cx = (v[0] + v[1]) / 2, cy = (v[2] + v[3]) / 2, hx = (v[1] - v[0]) / 2 * f, hy = (v[3] - v[2]) / 2 * f; d.view = [cx - hx, cx + hx, cy - hy, cy + hy]; draw(); save(); };
  el.querySelector('[data-a="in"]').onclick = () => zoom(.5);
  el.querySelector('[data-a="out"]').onclick = () => zoom(2);
  el.querySelector('[data-a="fit"]').onclick = () => { d.view = null; draw(); save(); };
  const clr = el.querySelector('[data-a="clear"]'); let armed = 0;
  clr.onclick = () => { if (!d.pts.length) return; if (!armed) { clr.textContent = "Clear all?"; clr.classList.add("armed"); armed = setTimeout(() => { armed = 0; clr.textContent = "Clear"; clr.classList.remove("armed"); }, 3000); return; }
    clearTimeout(armed); armed = 0; clr.textContent = "Clear"; clr.classList.remove("armed"); d.pts = []; d.view = null; draw(); save(); };
  draw();
}
function text(d) {
  d = Object.assign({}, DEF, d); const r = analyse(d);
  return "\n∿ " + (d.title ? d.title + ": " : "Graph: ") + (d.pts.length ? d.pts.map((p, i) => P(d.pts, i) + pt(p)).join(" ") : "(no points)") + (r.eqs.length ? "\n" + r.eqs.map(e => e.eq + (e.dom ? "  (" + e.dom + ")" : "")).join("\n") : "") + "\n";
}
window.NPGraph = { mount, text, analyse, fmt, polyStr, solve, DEF };
})();
