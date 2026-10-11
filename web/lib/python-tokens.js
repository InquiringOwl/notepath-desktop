/* ============ Subject kit: Computer Science (Programming Fundamentals onward) ============
   Every program a lab shows is REAL Python: write it in web/cs-src/<topic-id>.py and run
   `python3 tools/pytrace.py <topic-id>`; that records each step CPython takes into web/traces/<topic-id>.js
   (window.CSTraces["<id>/<program>"]). Labs only play traces back, so a lab can never disagree with Python.
   Two layers:
   1. window.CSRules (CR): pure, DOM-free rules, tested in tests/cs.test.js (node tools/labtest.js cs):
      tokens(line) Python highlighting · show(val, heap) Python-style display text · frames/out/changed per step ·
      watch(trace, name) a variable's value at every step · bits (toBase, fromBase, twos, fromTwos, utf8) · shuffle(arr, seed).
   2. window.CSKit.attach(k): k.trace(cfg) the whole Trace / Memory / Array lab in one call, k.predict(cfg) predict-then-run,
      k.bits(cfg) bit board, k.csModes(list, build) mode switching, k.guard(list), k.csro(o) standard readout.
   House colour keys for every CS page (the legend must use them): c1 amber = line about to run, c2 cyan = variable that
   just changed, c3 pink = output, c4 violet = references / objects, c5 green = return values. */
(function(){
const W = window;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- 1. CSRules ---------------- */
const KW = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
const BI = new Set("print input int float str bool len range list dict set tuple sum min max abs round sorted enumerate zip type isinstance open map filter reversed any all chr ord".split(" "));
function tokens(line){
  const out = []; let i = 0;
  const push = (t, s) => { if (s) out.push({ t, s }); };
  while (i < line.length) {
    const r = line.slice(i);
    let m;
    if ((m = r.match(/^#.*/))) { push("com", m[0]); break; }
    if ((m = r.match(/^[rRbBfF]{0,2}("""|'''|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)/)) && (m[1] !== '"""' && m[1] !== "'''" || true)) { push("str", m[0]); i += m[0].length; continue; }
    if ((m = r.match(/^\d+(\.\d*)?([eE][+-]?\d+)?j?|^\.\d+/))) { push("num", m[0]); i += m[0].length; continue; }
    if ((m = r.match(/^[A-Za-z_]\w*/))) { const w = m[0]; push(KW.has(w) ? "kw" : BI.has(w) ? "bi" : "name", w); i += w.length; continue; }
    if ((m = r.match(/^\s+/))) { push("ws", m[0]); i += m[0].length; continue; }
    push("op", line[i]); i++;
  }
  // merge neighbouring ops/ws so the HTML stays small
  return out.reduce((a, x) => { const l = a[a.length - 1]; if (l && l.t === x.t && (x.t === "op" || x.t === "ws")) l.s += x.s; else a.push({ ...x }); return a; }, []);
}

// Display text for a traced value, Python style. Cycles show as [...].
function show(v, heap, seen = new Set()){
  if (!v) return "";
  const [kind, x] = v;
  if (kind === "v") return x;
  if (kind === "fn") return `function ${x}`;
  if (kind === "cls") return `class ${x}`;
  const o = heap[x]; if (!o) return "…";
  if (o.t === "val") return o.v;
  if (seen.has(x)) return o.t === "dict" ? "{...}" : "[...]";
  const s2 = new Set(seen); s2.add(x);
  const items = o.t === "dict" || o.t === "obj" ? null : o.v.map(e => show(e, heap, s2));
  if (o.t === "list") return `[${items.join(", ")}]`;
  if (o.t === "tuple") return items.length === 1 ? `(${items[0]},)` : `(${items.join(", ")})`;
  if (o.t === "set") return items.length ? `{${items.join(", ")}}` : "set()";
  if (o.t === "dict") return `{${o.v.map(([a, b]) => show(a, heap, s2) + ": " + show(b, heap, s2)).join(", ")}}`;
  return `${o.c}(${o.v.map(([a, b]) => a + "=" + show(b, heap, s2)).join(", ")})`;
}

const stepAt = (T, i) => T.steps[Math.max(0, Math.min(T.steps.length - 1, i))];
const outAt = (T, i) => T.out.slice(0, stepAt(T, i).o);
// How many times line `line` has started running in steps 0…i (loop passes: give the first line of the body).
const hits = (T, i, line) => T.steps.slice(0, Math.max(0, i) + 1).filter(s => s.ev === "line" && s.l === line).length;
// Names whose shown value differs from the step before: Set of "depth:name" (depth 0 = global frame).
function changed(T, i){
  const res = new Set(); if (i <= 0) return res;
  const a = stepAt(T, i - 1), b = stepAt(T, i);
  b.f.forEach((fr, d) => {
    const pf = a.f[d] && a.f[d].fn === fr.fn ? a.f[d] : null;
    for (const [n, v] of Object.entries(fr.vars)) if (!pf || !(n in pf.vars) || show(pf.vars[n], a.h) !== show(v, b.h)) res.add(d + ":" + n);
  });
  return res;
}
// A global (or innermost-frame, inner: true) variable's shown value at every step; undefined before it exists.
const watch = (T, name, inner) => T.steps.map(s => { const fr = inner ? s.f[s.f.length - 1] : s.f[0]; return fr && name in fr.vars ? show(fr.vars[name], s.h) : undefined; });
// Python list of numbers at step i as a JS array (for the array view), or null.
function nums(T, i, name){
  const s = stepAt(T, i); const fr = s.f.find(f => name in f.vars) ; const v = fr && fr.vars[name];
  if (!v || v[0] !== "r" || !s.h[v[1]] || s.h[v[1]].t !== "list") return null;
  return s.h[v[1]].v.map(e => (e[0] === "v" ? Number(e[1]) : NaN));
}
const evText = (T, i) => { const s = stepAt(T, i), fn = s.f.length ? s.f[s.f.length - 1].fn : "";
  return s.ev === "end" ? "program finished" : s.ev === "call" ? `calling ${fn}()` : s.ev === "return" ? `${fn}() returns ${show(s.r, s.h)}` : s.ev === "exc" ? "an exception is raised" : `about to run line ${s.l}`; };

// Bits. toBase(13, 2, 8) = "00001101"; fromBase("ff", 16) = 255; twos(-3, 8) = "11111101"; fromTwos("11111101") = -3.
const toBase = (n, b, w = 0) => { if (!Number.isInteger(n) || n < 0) throw new Error("CSRules.toBase: needs a whole number ≥ 0 (use twos for negatives)"); return n.toString(b).toUpperCase().padStart(w, "0"); };
const fromBase = (s, b) => { const v = parseInt(String(s).replace(/_/g, ""), b); if (!Number.isFinite(v)) throw new Error(`CSRules.fromBase: "${s}" is not base ${b}`); return v; };
const twos = (n, w) => { const lo = -(2 ** (w - 1)), hi = 2 ** (w - 1) - 1; if (n < lo || n > hi) throw new Error(`CSRules.twos: ${n} does not fit in ${w} bits (${lo}…${hi})`); return toBase(n < 0 ? 2 ** w + n : n, 2, w); };
const fromTwos = bits => { const w = bits.length, u = fromBase(bits, 2); return bits[0] === "1" ? u - 2 ** w : u; };
const utf8 = ch => { const c = ch.codePointAt(0); if (c < 0x80) return [c]; if (c < 0x800) return [0xC0 | c >> 6, 0x80 | c & 63];
  if (c < 0x10000) return [0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63]; return [0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63]; };
const shuffle = (arr, seed) => { const a = arr.slice(); let s = seed == null ? null : seed;
  const rnd = () => { if (s == null) return Math.random(); s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const CR = W.CSRules = { tokens, show, stepAt, outAt, hits, changed, watch, nums, evText, toBase, fromBase, twos, fromTwos, utf8, shuffle, esc };
})();
