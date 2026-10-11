/* Lead sheet widget (NotePath): <div class="nw" data-w="sheet" data-src='{"title","composer","clef","key","time","tempo","bars","mel":[…],"chd":[…]}'>.
   A blank chart of bars, four to a line, like a jazz lead sheet: chord symbols above the staff, melody on it. Click a bar
   to pick it, then type its chords ("D-7 G7": spread evenly over the bar) and add melody notes with the keyboard, the
   length buttons and Rest (a full bar moves on to the next), or type the whole chart (bars split by "|"). Key signature,
   clef, time, tempo, ▶ Play (melody + soft chords), + / − 4 bars. Melody notation is the Music chart's ("C4/q E4 Bb4/e r/h").
   Made by ＋ New Note → Music chart, or the toolbar's 𝄞 Sheet. Loaded after notes-widgets.js (uses InquireWidgets.kit). */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MT = () => window.MusicTheory, W = () => window.InquireWidgets;
const KEYS = [["C", "C major · A minor"], ["G", "G major · E minor"], ["D", "D major · B minor"], ["A", "A major · F♯ minor"], ["E", "E major · C♯ minor"], ["B", "B major · G♯ minor"], ["F#", "F♯ major · D♯ minor"],
  ["F", "F major · D minor"], ["Bb", "B♭ major · G minor"], ["Eb", "E♭ major · C minor"], ["Ab", "A♭ major · F minor"], ["Db", "D♭ major · B♭ minor"], ["Gb", "G♭ major · E♭ minor"]];
const TIMES = ["4/4", "3/4", "2/4", "6/8", "2/2", "5/4", "12/8"];
const DEF = { title: "", composer: "", clef: "treble", key: "C", time: "4/4", tempo: 120, bars: 16, mel: [], chd: [] };
const PER = 4, VW = 760, SP = 9, SYS_H = 116;
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3]; // letters (C=0 … B=6) in key-signature order
const barLen = time => { const [n, b] = String(time || "4/4").split("/").map(Number); return n * (64 / b); };
// accidentals the key gives each letter
function keyMap(key) { let k = 0; try { k = MT().keySig(key, "major"); } catch (e) {} const m = {}; (k > 0 ? SHARPS.slice(0, k) : FLATS.slice(0, -k)).forEach(l => m[l] = k > 0 ? 1 : -1); return { m, k }; }
// a chord symbol as people write it on charts (D-7, BbΔ7, F#ø) → one MusicTheory.chordNotes understands, for playback
const playable = s => String(s).replace(/^([A-G](?:#|b|♯|♭)?)-(?=\d|$)/, "$1m").replace(/^([A-G](?:#|b|♯|♭)?)-/, "$1m").replace(/Δ/g, "maj").replace(/♯/g, "#").replace(/♭/g, "b");
const pretty = s => esc(s).replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯").replace(/\/([A-G])b/, "/$1♭").replace(/\/([A-G])#/, "/$1♯");
const toks = s => String(s || "").trim().match(/\[[^\]]*\](?:\/\S+)?|\S+/g) || [];

function read(el) { let d; try { d = Object.assign({}, DEF, JSON.parse(el.dataset.src || "{}")); } catch (e) { d = Object.assign({}, DEF); }
  d.bars = Math.max(4, Math.min(128, Math.round(d.bars / 4) * 4 || 16)); d.mel = Array.from({ length: d.bars }, (_, i) => String((d.mel || [])[i] || "")); d.chd = Array.from({ length: d.bars }, (_, i) => String((d.chd || [])[i] || "")); return d; }

/* ---------- drawing ---------- */
function noteSVG(parts, e, cx, Y, clef, accOf, hot) {
  const K = W().kit, h = hot ? " ms-hot" : "";
  if (e.r) {
    const ry = Y(4);
    if (e.d === "w") parts.push(`<rect x="${cx - 5}" y="${Y(6)}" width="10" height="4.5" class="ms-fill${h}"/>`);
    else if (e.d === "h") parts.push(`<rect x="${cx - 5}" y="${Y(4) - 4.5}" width="10" height="4.5" class="ms-fill${h}"/>`);
    else if (e.d === "q") parts.push(`<path d="M${cx - 2} ${ry - 12} l5 6 -4 5 5 6 c-5 -2 -8 2 -3 6" class="ms-ink${h}" fill="none" stroke-width="2" stroke-linejoin="round"/>`);
    else { const n = e.d === "e" ? 1 : 2; for (let k = 0; k < n; k++) parts.push(`<circle cx="${cx - 2 - k * 2}" cy="${ry - 5 + k * 7}" r="2.2" class="ms-fill${h}"/><path d="M${cx - 1 - k * 2} ${ry - 4 + k * 7} q4 1 5 -3" class="ms-ink${h}" fill="none" stroke-width="1.5"/>`); parts.push(`<path d="M${cx + 4} ${ry - 8} l-5 ${13 + 7 * (n - 1)}" class="ms-ink${h}" stroke-width="1.5"/>`); }
    if (e.dots) parts.push(`<circle cx="${cx + 10}" cy="${ry - 2}" r="1.6" class="ms-fill${h}"/>`);
    return;
  }
  const ps = e.n.map(p => { const q = MT().parse(p); return { p, q, pos: MT().staffPos(p, clef), acc: accOf(q) }; }).sort((a, b) => a.pos - b.pos);
  const avg = ps.reduce((s, q) => s + q.pos, 0) / ps.length, down = avg >= 4, hollow = e.d === "w" || e.d === "h";
  let prev = null; ps.forEach(q => { q.dx = prev && q.pos - prev.pos === 1 && !prev.dx ? 10 : 0; prev = q; });
  ps.forEach(q => {
    MT().ledgers(q.pos).forEach(l => parts.push(`<line x1="${cx - 8 + q.dx}" x2="${cx + 8 + q.dx}" y1="${Y(l)}" y2="${Y(l)}" class="ms-line"/>`));
    if (q.acc != null) parts.push(`<text x="${cx - 16}" y="${Y(q.pos) + 4}" class="ms-acc${h}">${q.acc === 0 ? "♮" : q.acc > 0 ? (q.acc > 1 ? "𝄪" : "♯") : (q.acc < -1 ? "♭♭" : "♭")}</text>`);
    parts.push(`<ellipse cx="${cx + q.dx}" cy="${Y(q.pos)}" rx="5.2" ry="3.7" transform="rotate(-20 ${cx + q.dx} ${Y(q.pos)})" class="${hollow ? "ms-hollow" : "ms-fill"}${h}"/>`);
    if (e.dots) parts.push(`<circle cx="${cx + 10 + q.dx}" cy="${Y(q.pos) - (q.pos % 2 === 0 ? SP / 2 : 0)}" r="1.6" class="ms-fill${h}"/>`);
  });
  if (e.d !== "w") {
    const lo = ps[0], hi = ps[ps.length - 1], sx = down ? cx - 4.9 : cx + 4.9, y1 = down ? Y(hi.pos) : Y(lo.pos), y2 = down ? Y(lo.pos) + 3.4 * SP : Y(hi.pos) - 3.4 * SP;
    parts.push(`<line x1="${sx}" x2="${sx}" y1="${y1}" y2="${y2}" class="ms-ink${h}" stroke-width="1.2"/>`);
    const flags = e.d === "e" ? 1 : e.d === "s" ? 2 : 0;
    for (let k = 0; k < flags; k++) { const fy = y2 + (down ? -k * 6 : k * 6); parts.push(`<path d="M${sx} ${fy} c1 ${down ? -5 : 5} 8 ${down ? -7 : 7} 6 ${down ? -14 : 14}" class="ms-ink${h}" fill="none" stroke-width="1.5"/>`); }
  }
}
function sheetSVG(d, sel, hotBar, hotEv) {
  const K = W().kit, clef = d.clef === "bass" ? "bass" : "treble", L = barLen(d.time), km = keyMap(d.key), lines = Math.ceil(d.bars / PER);
  const parts = [], H = lines * SYS_H + 10;
  for (let li = 0; li < lines; li++) {
    const top = li * SYS_H + 44, base = top + 4 * SP, Y = pos => base - pos * SP / 2;
    // clef, key signature, time (first line only)
    if (clef === "bass") { const X = a => 16 + a * SP, Yc = b => Y(6) - b * SP; parts.push(`<path d="${K.splinePath(K.F_CLEF, X, Yc)}" class="ms-ink" fill="none" stroke-width="1.7"/><circle cx="${X(0.02)}" cy="${Yc(0)}" r="2.7" class="ms-fill"/><circle cx="${X(1.72)}" cy="${Yc(0.5)}" r="1.3" class="ms-fill"/><circle cx="${X(1.72)}" cy="${Yc(-0.5)}" r="1.3" class="ms-fill"/>`); }
    else { const X = a => 22 + a * SP * 1.12, Yc = b => Y(2) - b * SP * 1.12; parts.push(`<path d="${K.splinePath(K.G_CLEF, X, Yc)}" class="ms-ink" fill="none" stroke-width="1.6"/><circle cx="${X(-0.32)}" cy="${Yc(-2.28)}" r="2.6" class="ms-fill"/>`); }
    let hx = 44;
    const sharpPos = clef === "bass" ? [6, 3, 7, 4, 1, 5, 2] : [8, 5, 9, 6, 3, 7, 4], flatPos = clef === "bass" ? [2, 5, 1, 4, 0, 3, -1] : [4, 7, 3, 6, 2, 5, 1];
    for (let i = 0; i < Math.abs(km.k); i++) { parts.push(`<text x="${hx}" y="${Y(km.k > 0 ? sharpPos[i] : flatPos[i]) + 4}" class="ms-acc">${km.k > 0 ? "♯" : "♭"}</text>`); hx += 8; }
    if (li === 0) { const [tn, tb] = String(d.time).split("/"); hx += 4; parts.push(`<text x="${hx}" y="${Y(6) + 5.5}" class="ms-time">${tn}</text><text x="${hx}" y="${Y(2) + 5.5}" class="ms-time">${tb}</text>`); hx += 20; }
    hx += 6;
    const bw = (VW - 8 - hx) / PER;
    parts.push([0, 2, 4, 6, 8].map(p => `<line x1="6" x2="${VW - 4}" y1="${Y(p)}" y2="${Y(p)}" class="ms-line"/>`).join(""));
    for (let bi = 0; bi < PER; bi++) {
      const b = li * PER + bi, bx = hx + bi * bw;
      if (b >= d.bars) break;
      parts.push(`<rect class="sh-bar${b === sel ? " on" : ""}" data-bar="${b}" x="${bx}" y="${top - 30}" width="${bw}" height="${SYS_H - 20}" rx="2"/>`);
      if (bi === 0) parts.push(`<text x="${bx + 2}" y="${Y(8) - 26}" class="sh-num">${b + 1}</text>`);
      // chords: evenly over the bar
      const cs = (d.chd[b] || "").trim().split(/\s+/).filter(Boolean);
      cs.forEach((c, i) => parts.push(`<text x="${bx + 10 + i * (bw - 14) / cs.length}" y="${top - 12}" class="sh-chord">${pretty(c)}</text>`));
      // melody: placed by time inside the bar; accidentals against the key (and earlier notes in this bar)
      const r = W().parseSeq(d.mel[b] || "", clef), state = {};
      let t = 0;
      r.ev.forEach((e, i) => {
        const cx = bx + 16 + (t / L) * (bw - 26);
        const accOf = q => { const k = q.l + "_" + q.o, now = k in state ? state[k] : (km.m[q.l] || 0); state[k] = q.a; return q.a === now ? null : q.a; };
        noteSVG(parts, e, cx, Y, clef, accOf, b === hotBar && i === hotEv);
        t += K.len(e);
      });
      const over = t > L + 1e-9;
      const last = b === d.bars - 1, ex = bx + bw;
      if (last) parts.push(`<line x1="${ex - 5}" x2="${ex - 5}" y1="${Y(8)}" y2="${Y(0)}" class="ms-line"/><line x1="${ex - 1.5}" x2="${ex - 1.5}" y1="${Y(8)}" y2="${Y(0)}" class="ms-ink" stroke-width="3"/>`);
      else parts.push(`<line x1="${ex}" x2="${ex}" y1="${Y(8)}" y2="${Y(0)}" class="ms-line${over ? " ms-over" : ""}"/>`);
      if (over) parts.push(`<text x="${ex - 4}" y="${Y(0) + 16}" text-anchor="end" class="sh-over">too long</text>`);
    }
    parts.push(`<line x1="6" x2="6" y1="${Y(8)}" y2="${Y(0)}" class="ms-line"/>`);
  }
  return `<svg class="ms sh-svg" viewBox="0 0 ${VW} ${H}" role="img" aria-label="Lead sheet, ${d.bars} bars: click a bar to edit it">${parts.join("")}</svg>`;
}

/* ---------- playback: melody + soft chords ---------- */
let AC = null, stopFn = null;
function play(d, onStep, onEnd) {
  const A = window.AudioContext || window.webkitAudioContext; if (!A) return () => {};
  if (!AC) AC = new A(); if (AC.state === "suspended") AC.resume();
  const K = W().kit, clef = d.clef === "bass" ? "bass" : "treble", L = barLen(d.time), q = 60 / Math.max(30, Math.min(260, d.tempo || 120)), u = q / 16;
  let lastBar = 0; for (let b = 0; b < d.bars; b++) if ((d.mel[b] || "").trim() || (d.chd[b] || "").trim()) lastBar = b;
  const out = AC.createGain(); out.gain.value = 0.3; const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(out); out.connect(AC.destination);
  const t0 = AC.currentTime + 0.08, timers = [];
  const tone = (p, at, dur, amp) => { const f = MT().freq(p); [["triangle", 1, amp], ["sine", 2, amp * .2]].forEach(([type, mul, a]) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f * mul;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(a, at + 0.015); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, a * 0.35), at + Math.min(0.4, dur * 0.6)); g.gain.setTargetAtTime(0, at + dur * 0.92, 0.04);
    o.connect(g); g.connect(lp); o.start(at); o.stop(at + dur + 0.3); }); };
  for (let b = 0; b <= lastBar; b++) {
    const bs = t0 + b * L * u;
    const cs = (d.chd[b] || "").trim().split(/\s+/).filter(Boolean);
    cs.forEach((c, i) => { const ns = W().chordNotes(playable(c), "bass"); if (!ns) return; const at = bs + i * L / cs.length * u, dur = L / cs.length * u; ns.forEach(p => tone(p, at, dur, 0.09 / Math.sqrt(ns.length))); });
    let t = 0; W().parseSeq(d.mel[b] || "", clef).ev.forEach((e, i) => { const at = bs + t * u, dur = K.len(e) * u; timers.push(setTimeout(() => onStep(b, i), (at - AC.currentTime) * 1000)); if (!e.r) e.n.forEach(p => tone(p, at, dur, 0.5 / Math.sqrt(e.n.length))); t += K.len(e); });
  }
  const end = t0 + (lastBar + 1) * L * u, endT = setTimeout(() => { onEnd(); out.disconnect(); }, (end - AC.currentTime) * 1000 + 150);
  return () => { timers.forEach(clearTimeout); clearTimeout(endT); try { out.gain.setTargetAtTime(0, AC.currentTime, 0.03); setTimeout(() => out.disconnect(), 200); } catch (e) {} onEnd(); };
}

/* ---------- the widget ---------- */
const PKEYS = [["C", 0], ["C#", 1], ["D", 2], ["Eb", 3], ["E", 4], ["F", 5], ["F#", 6], ["G", 7], ["Ab", 8], ["A", 9], ["Bb", 10], ["B", 11]];
function mount(el) {
  if (!MT() || !W() || !W().kit) { el.innerHTML = `<div class="nw-h"><span class="nw-tag">𝄞</span><span>Lead sheets need the music kit.</span></div>`; return; }
  const d = read(el);
  let sel = 0, dur = "q", dot = 0, oct = d.clef === "bass" ? 3 : 4, hot = [-1, -1];
  el.innerHTML = `<div class="nw-h"><span class="nw-tag">𝄞</span><input class="nw-title" maxlength="80" placeholder="Title" aria-label="Lead sheet title" value="${esc(d.title)}"><input class="nw-title sh-comp" maxlength="60" placeholder="Composer" aria-label="Composer" value="${esc(d.composer)}">
      <select class="sh-key" aria-label="Key signature">${KEYS.map(([k, n]) => `<option value="${k}"${d.key === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <select class="sh-clef" aria-label="Clef"><option value="treble"${d.clef !== "bass" ? " selected" : ""}>Treble</option><option value="bass"${d.clef === "bass" ? " selected" : ""}>Bass</option></select>
      <select class="sh-time" aria-label="Time signature">${TIMES.map(t => `<option${d.time === t ? " selected" : ""}>${t}</option>`).join("")}</select>
      <label class="nw-tempo" title="Tempo in quarter notes per minute">♩=<input type="number" min="30" max="260" step="2" value="${d.tempo}" aria-label="Tempo"></label>
      <button type="button" class="nw-b nw-play" data-a="play">▶ Play</button><button type="button" class="nw-b nw-del" data-a="del" title="Remove this lead sheet" aria-label="Remove lead sheet">✕</button></div>
    <div class="sh-head"><div class="sh-t"></div><div class="sh-c"></div></div>
    <div class="sh-staff"></div>
    <div class="nw-mtools sh-tools">
      <div class="sh-barrow"><button type="button" class="nw-b" data-a="prev" aria-label="Previous bar">◀</button><b class="sh-barn" aria-live="polite"></b><button type="button" class="nw-b" data-a="next" aria-label="Next bar">▶</button>
        <label class="sh-chordl">Chords <input class="sh-chords" spellcheck="false" placeholder="D-7 G7" aria-label="Chords in this bar"></label>
        <button type="button" class="nw-b" data-a="undo" title="Take off the last note of this bar">Undo note</button><button type="button" class="nw-b" data-a="clearbar">Clear bar</button>
        <span class="sh-sp"></span><button type="button" class="nw-b" data-a="less" title="Remove the last line of bars (only if empty)">− 4 bars</button><button type="button" class="nw-b" data-a="more">＋ 4 bars</button></div>
      <div class="nw-durs" role="radiogroup" aria-label="Note length">${[["w", "𝅝", "Whole"], ["h", "𝅗𝅥", "Half"], ["q", "♩", "Quarter"], ["e", "♪", "Eighth"], ["s", "𝅘𝅥𝅯", "Sixteenth"]].map(([k, g, n]) => `<button type="button" role="radio" data-dur="${k}" title="${n} note" aria-label="${n}">${g}<small>${n}</small></button>`).join("")}<button type="button" data-a="dot" aria-pressed="false" title="Dotted (½ longer)">•<small>Dot</small></button><button type="button" data-a="rest" title="Add a rest">𝄽<small>Rest</small></button></div>
      <div class="nw-keys"><button type="button" class="nw-b" data-a="odown" aria-label="Octave down">◀</button><div class="nw-piano" role="group" aria-label="Keyboard: click a key to add the note to the bar"></div><button type="button" class="nw-b" data-a="oup" aria-label="Octave up">▶</button></div>
      <label class="nw-nota"><span>This bar's melody <small>C4/q E4 G4 · [C4 E4]/h · r/q · dotted q.</small></span><input class="sh-mel" spellcheck="false" aria-label="Melody in this bar"></label>
      <details class="sh-all"><summary>Type the whole chart</summary>
        <label class="nw-nota"><span>Chords <small>bars split by | : D-7 G7 | E-7 A7 | …</small></span><textarea class="sh-allc" rows="2" spellcheck="false" aria-label="All chords"></textarea></label>
        <label class="nw-nota"><span>Melody <small>bars split by |</small></span><textarea class="sh-allm" rows="3" spellcheck="false" aria-label="All melody"></textarea></label></details>
      <p class="nw-msg" aria-live="polite"></p></div>`;
  const $ = s => el.querySelector(s), staff = $(".sh-staff"), msg = $(".nw-msg"), chords = $(".sh-chords"), mel = $(".sh-mel"), allc = $(".sh-allc"), allm = $(".sh-allm");
  const L = () => barLen(d.time);
  const fill = b => W().parseSeq(d.mel[b] || "", d.clef).ev.reduce((s, e) => s + W().kit.len(e), 0);
  const save = () => { el.dataset.src = JSON.stringify(d); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const trimEnd = a => { let n = a.length; while (n && !a[n - 1]) n--; return a.slice(0, n); };
  const syncAll = () => { if (document.activeElement !== allc) allc.value = trimEnd(d.chd.map(s => s.trim())).join(" | "); if (document.activeElement !== allm) allm.value = trimEnd(d.mel.map(s => s.trim())).join(" | "); };
  const draw = () => {
    staff.innerHTML = sheetSVG(d, sel, hot[0], hot[1]);
    $(".sh-t").textContent = d.title; $(".sh-c").textContent = d.composer;
    $(".sh-barn").textContent = `Bar ${sel + 1} of ${d.bars}`;
    if (document.activeElement !== chords) chords.value = d.chd[sel] || "";
    if (document.activeElement !== mel) mel.value = d.mel[sel] || "";
    const r = W().parseSeq(d.mel[sel] || "", d.clef), bad = (d.chd[sel] || "").trim().split(/\s+/).filter(c => c && !W().chordNotes(playable(c), "bass"));
    const f = fill(sel), Ln = L();
    msg.textContent = r.errs.length ? "Not understood: " + r.errs.join(" ") : bad.length ? `Shown as written, not played: ${bad.join(" ")}` : f > Ln + 1e-9 ? `Bar ${sel + 1} is too long for ${d.time}.` : f ? `Bar ${sel + 1}: ${Math.round(f / Ln * 100)}% full` : "Click a bar, type its chords, and add notes with the keyboard.";
    msg.classList.toggle("bad", !!(r.errs.length || f > Ln + 1e-9));
    syncAll();
  };
  const pick = b => { sel = Math.max(0, Math.min(d.bars - 1, b)); draw(); };
  const tokDur = () => "/" + dur + ".".repeat(dot);
  const addTok = tok => { d.mel[sel] = (d.mel[sel].trim() + " " + tok).trim(); save(); if (fill(sel) >= L() - 1e-9 && sel < d.bars - 1) sel++; draw(); };
  const piano = () => { $(".nw-piano").innerHTML = PKEYS.map(([n]) => `<button type="button" class="${/[#b]$/.test(n) && n.length > 1 ? "bk" : "wk"}" data-k="${n}${oct}" title="${n.replace("#", "♯").replace(/^(.)b$/, "$1♭")}${oct}"><span>${n.length > 1 ? "" : n + (n === "C" ? oct : "")}</span></button>`).join("") + `<button type="button" class="wk" data-k="C${oct + 1}" title="C${oct + 1}"><span>C${oct + 1}</span></button>`; };
  const marks = () => { el.querySelectorAll("[data-dur]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.dur === dur))); $('[data-a="dot"]').setAttribute("aria-pressed", String(!!dot)); };
  staff.addEventListener("click", e => { const r = e.target.closest("[data-bar]"); if (r) pick(+r.dataset.bar); });
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !el.contains(b) || b.closest(".sh-staff")) return;
    if (b.dataset.dur) { dur = b.dataset.dur; marks(); return; }
    if (b.dataset.k) { const p = b.dataset.k; tone1(p); addTok(p + tokDur()); return; }
    const a = b.dataset.a;
    if (a === "dot") { dot = dot ? 0 : 1; marks(); }
    else if (a === "rest") addTok("r" + tokDur());
    else if (a === "prev" || a === "next") pick(sel + (a === "next" ? 1 : -1));
    else if (a === "undo") { const t = toks(d.mel[sel]); t.pop(); d.mel[sel] = t.join(" "); save(); draw(); }
    else if (a === "clearbar") { d.mel[sel] = ""; d.chd[sel] = ""; chords.value = ""; save(); draw(); }
    else if (a === "more") { if (d.bars < 128) { d.bars += 4; d.mel.push("", "", "", ""); d.chd.push("", "", "", ""); save(); draw(); } }
    else if (a === "less") { const tail = d.bars - 4; if (d.bars > 4 && d.mel.slice(tail).every(s => !s.trim()) && d.chd.slice(tail).every(s => !s.trim())) { d.bars = tail; d.mel.length = tail; d.chd.length = tail; sel = Math.min(sel, tail - 1); save(); draw(); } else { msg.textContent = "The last line has notes or chords: clear them first."; msg.classList.add("bad"); } }
    else if (a === "oup" || a === "odown") { oct = Math.max(1, Math.min(6, oct + (a === "oup" ? 1 : -1))); piano(); }
    else if (a === "play") {
      if (stopFn) { stopFn(); return; }
      b.textContent = "■ Stop";
      stopFn = play(d, (bar, i) => { hot = [bar, i]; draw(); }, () => { stopFn = null; hot = [-1, -1]; draw(); b.textContent = "▶ Play"; });
    }
  });
  const tone1 = p => { try { const st = play({ bars: 1, time: "4/4", tempo: 120, clef: d.clef, mel: [p + "/e"], chd: [""] }, () => {}, () => {}); } catch (e) {} };
  const stop = e => e.stopPropagation();
  [$(".nw-title"), $(".sh-comp"), $(".nw-tempo input"), chords, mel, allc, allm].forEach(i => i.addEventListener("input", stop));
  $(".nw-title").addEventListener("input", () => { d.title = $(".nw-title").value.trim(); save(); $(".sh-t").textContent = d.title; });
  $(".sh-comp").addEventListener("input", () => { d.composer = $(".sh-comp").value.trim(); save(); $(".sh-c").textContent = d.composer; });
  $(".nw-tempo input").addEventListener("input", () => { d.tempo = +$(".nw-tempo input").value || 120; save(); });
  chords.addEventListener("input", () => { d.chd[sel] = chords.value; save(); draw(); });
  mel.addEventListener("input", () => { d.mel[sel] = mel.value; save(); draw(); });
  const split = v => v.split("|").map(s => s.trim());
  allc.addEventListener("input", () => { const a = split(allc.value); while (a.length > d.bars) { d.bars += 4; d.mel.push("", "", "", ""); d.chd.push("", "", "", ""); } d.chd = d.chd.map((_, i) => a[i] || ""); save(); draw(); });
  allm.addEventListener("input", () => { const a = split(allm.value); while (a.length > d.bars) { d.bars += 4; d.mel.push("", "", "", ""); d.chd.push("", "", "", ""); } d.mel = d.mel.map((_, i) => a[i] || ""); save(); draw(); });
  [[".sh-key", "key"], [".sh-clef", "clef"], [".sh-time", "time"]].forEach(([s, k]) => $(s).addEventListener("change", () => { d[k] = $(s).value; if (k === "clef") { oct = d.clef === "bass" ? 3 : 4; piano(); } save(); draw(); }));
  W().kit.delButton(el);
  piano(); marks(); draw();
}
function text(el) {
  const d = read(el), cs = d.chd.map(s => s.trim() || "/"), last = Math.max(0, ...d.chd.map((s, i) => s.trim() || d.mel[i].trim() ? i + 1 : 0));
  return "\n𝄞 " + (d.title || "Lead sheet") + (d.composer ? " (" + d.composer + ")" : "") + ` [${d.key}, ${d.time}]` + (last ? "\n| " + cs.slice(0, last).join(" | ") + " |" : "") + "\n";
}
window.NPSheet = { mount, text, DEF, read, playable, keyMap };
})();
