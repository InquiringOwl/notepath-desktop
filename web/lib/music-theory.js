/* ============ Subject kit: Music ============
   Two layers, so labs only write what is unique to their topic:
   1. window.MusicTheory (MT): pure, DOM-free rules: pitch spelling, MIDI and frequency, intervals,
      transposition, scales, key signatures, clef positions, exact rhythm values, meters, harmonics.
      Tested in tests/music.test.js (node tools/labtest.js music). Put any new rule a lab needs HERE, with a test.
   2. window.MusicKit.attach(k): drawing and sound on top of the lab kit `k` (web/kits/universal/core.js):
      staff with vector clefs, notes, rests, accidentals, time and key signatures, beams, a piano keyboard,
      and a small Web Audio synth (never autoplays; sound starts only from a button or a key press).
   API summary is in web/WRITER-PACK-MUSIC.md. */
(function(){
const W = window;

/* ---------------- 1. MusicTheory: rules ---------------- */
const LET = "CDEFGAB", NAT = [0, 2, 4, 5, 7, 9, 11];
const ACC_U = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" }, ACC_A = { "-2": "bb", "-1": "b", "0": "", "1": "#", "2": "x" };
const mod = (a, n) => ((a % n) + n) % n;

// Exact rationals for rhythm (durations in whole notes).
function R(n, d = 1){ if (d < 0) { n = -n; d = -d; } const g = gcdI(Math.abs(n), d) || 1; return Object.freeze({ n: n / g, d: d / g, add: o => R(n * o.d + o.n * d, d * o.d), sub: o => R(n * o.d - o.n * d, d * o.d), mul: o => R(n * o.n, d * o.d), div: o => R(n * o.d, d * o.n), eq: o => n * o.d === o.n * d, lt: o => n * o.d < o.n * d, val: n / d, toString: () => d / g === 1 ? String(n / g) : `${n / g}/${d / g}` }); }
function gcdI(a, b){ while (b) [a, b] = [b, a % b]; return a; }

function parse(s){
  if (typeof s === "object") return s;
  const m = String(s).trim().match(/^([A-Ga-g])(𝄪|𝄫|♯|♭|♮|##|bb|#|b|x|n)?(-?\d+)?$/);
  if (!m) throw new Error(`MusicTheory.parse: "${s}" is not a pitch like C4, F#3, Bb5`);
  const a = { "𝄪": 2, "x": 2, "##": 2, "♯": 1, "#": 1, "♭": -1, "b": -1, "𝄫": -2, "bb": -2, "♮": 0, "n": 0 }[m[2] || ""] || 0;
  return { l: LET.indexOf(m[1].toUpperCase()), a, o: m[3] === undefined ? 4 : +m[3] };
}
const accSym = (a, ascii) => (ascii ? ACC_A : ACC_U)[a] ?? (a > 0 ? "♯".repeat(a) : "♭".repeat(-a));
const name = (p, o = {}) => { p = parse(p); return LET[p.l] + accSym(p.a, o.ascii) + (o.octave === false ? "" : p.o); };
const midi = p => { p = parse(p); return 12 * (p.o + 1) + NAT[p.l] + p.a; };
const pc = p => mod(midi(p), 12);
const dia = p => { p = parse(p); return p.o * 7 + p.l; };            // diatonic step number (letter + octave)
const freq = (p, a4 = 440) => a4 * Math.pow(2, ((typeof p === "number" ? p : midi(p)) - 69) / 12);
const fromDia = (d, a = 0) => ({ l: mod(d, 7), a, o: Math.floor(d / 7) });
// All reasonable spellings (accidentals −2…+2) of a MIDI note, simplest first.
function spellings(m){ const out = []; for (let l = 0; l < 7; l++) for (const a of [0, 1, -1, 2, -2]) { const base = NAT[l] + a, o = Math.floor((m - base) / 12) - 1; if (12 * (o + 1) + base === m) out.push({ l, a, o }); } return out.sort((x, y) => Math.abs(x.a) - Math.abs(y.a)); }
// Default spelling for a key on the keyboard: naturals, else sharp (flats if prefer < 0).
const fromMidi = (m, prefer = 1) => { const s = spellings(m); return s.find(x => x.a === 0) || s.find(x => Math.sign(x.a) === Math.sign(prefer) && Math.abs(x.a) === 1) || s[0]; };

const SIZE = ["unison", "second", "third", "fourth", "fifth", "sixth", "seventh", "octave", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "double octave"];
const PERFECT = s => [1, 4, 5].includes(s);
const QLONG = { P: "perfect", M: "major", m: "minor", A: "augmented", d: "diminished", AA: "doubly augmented", dd: "doubly diminished" };
// Interval from p up to q (q must not be below p in letter+octave).
function interval(p, q){
  const size = dia(q) - dia(p) + 1;
  if (size < 1) throw new Error("MusicTheory.interval: second pitch is below the first; pass the lower note first");
  const simple = mod(size - 1, 7) + 1, semis = midi(q) - midi(p);
  const ref = NAT[simple - 1] + 12 * Math.floor((size - 1) / 7), diff = semis - ref;
  const quality = PERFECT(simple) ? ({ 0: "P", 1: "A", "-1": "d", 2: "AA", "-2": "dd" })[diff] : ({ 0: "M", "-1": "m", 1: "A", "-2": "d", 2: "AA", "-3": "dd" })[diff];
  if (!quality) return { size, simple, semis, quality: "?", short: `?${size}`, long: "not a standard interval", compound: size > 8 };
  return { size, simple, semis, quality, short: quality + size, long: `${QLONG[quality]} ${SIZE[size - 1] || size + "th"}`, compound: size > 8 };
}
function ivParse(s){ const m = String(s).match(/^(AA|dd|P|M|m|A|d)(\d+)$/); if (!m) throw new Error(`MusicTheory: "${s}" is not an interval like M3, P5, A4`); return { q: m[1], size: +m[2] }; }
function ivSemis(q, size){ const simple = mod(size - 1, 7) + 1, ref = NAT[simple - 1] + 12 * Math.floor((size - 1) / 7);
  const off = PERFECT(simple) ? { P: 0, A: 1, d: -1, AA: 2, dd: -2 }[q] : { M: 0, m: -1, A: 1, d: -2, AA: 2, dd: -3 }[q];
  if (off === undefined) throw new Error(`MusicTheory: ${q}${size} does not exist (${PERFECT(simple) ? "perfect" : "major/minor"} class)`); return ref + off; }
function up(p, iv){ p = parse(p); const { q, size } = ivParse(iv); const t = fromDia(dia(p) + size - 1); t.a = midi(p) + ivSemis(q, size) - midi({ ...t, a: 0 }); return t; }
function down(p, iv){ p = parse(p); const { q, size } = ivParse(iv); const t = fromDia(dia(p) - size + 1); t.a = midi(p) - ivSemis(q, size) - midi({ ...t, a: 0 }); return t; }
// Interval inversion (simple intervals): sizes sum to 9, M↔m, A↔d, P stays P.
const invert = iv => { const { q, size } = ivParse(iv); const s = mod(size - 1, 7) + 1; return ({ P: "P", M: "m", m: "M", A: "d", d: "A", AA: "dd", dd: "AA" })[q] + (9 - s); };

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], "natural minor": [0, 2, 3, 5, 7, 8, 10], "harmonic minor": [0, 2, 3, 5, 7, 8, 11], "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], locrian: [0, 1, 3, 5, 6, 8, 10]
};
// A seven-note scale spelled with one of each letter, ascending from tonic, plus the octave.
function scale(tonic, kind = "major"){ tonic = parse(tonic); const pat = SCALES[kind]; if (!pat) throw new Error("MusicTheory.scale: unknown kind " + kind);
  const out = pat.map((s, i) => { const t = fromDia(dia(tonic) + i); t.a = midi(tonic) + s - midi({ ...t, a: 0 }); return t; });
  out.push({ ...tonic, o: tonic.o + 1 }); return out; }
const DEGREE = ["tonic", "supertonic", "mediant", "subdominant", "dominant", "submediant", "leading tone"];
// Key signature as signed count: +n sharps, −n flats. Major from the circle of fifths; a minor key shares its relative major's.
const FIFTHS = [0, 2, 4, -1, 1, 3, 5];          // C D E F G A B majors
function keySig(tonic, mode = "major"){ const t = parse(tonic); return FIFTHS[t.l] + 7 * t.a - (mode === "minor" ? 3 : 0); }
const sigLetters = n => n >= 0 ? "FCGDAEB".slice(0, n).split("") : "BEADGCF".slice(0, -n).split("");
// Pitch spelled under a key signature: the letter's accidental from the signature.
const sigAcc = (n, l) => (n > 0 && sigLetters(n).includes(LET[l])) ? 1 : (n < 0 && sigLetters(n).includes(LET[l])) ? -1 : 0;

// Staff positions: 0 = bottom line, 1 = first space, 2 = second line … 8 = top line. Clefs named by their bottom-line pitch.
const CLEFS = { treble: { bottom: "E4", line: 2, pitch: "G4" }, bass: { bottom: "G2", line: 6, pitch: "F3" }, alto: { bottom: "F3", line: 4, pitch: "C4" }, tenor: { bottom: "D3", line: 6, pitch: "C4" } };
const staffPos = (p, clef = "treble") => dia(p) - dia(CLEFS[clef].bottom);
const fromStaffPos = (pos, clef = "treble", a = 0) => fromDia(dia(CLEFS[clef].bottom) + pos, a);
const ledgers = pos => { const out = []; for (let y = -2; y >= pos; y -= 2) out.push(y); for (let y = 10; y <= pos; y += 2) out.push(y); return out; };

// Rhythm. Durations in whole notes (exact).
const DUR = { whole: R(1), half: R(1, 2), quarter: R(1, 4), eighth: R(1, 8), sixteenth: R(1, 16), "thirty-second": R(1, 32) };
const dur = (kind, dots = 0) => { const v = DUR[kind]; if (!v) throw new Error("MusicTheory.dur: unknown value " + kind); return v.mul(R(2 ** (dots + 1) - 1, 2 ** dots)); };
// Meter from a time signature like "3/4". Compound when the top is 6, 9 or 12 (beat = dotted note, three divisions).
function meter(sig){ const [top, bottom] = String(sig).split("/").map(Number);
  if (!(top > 0) || ![1, 2, 4, 8, 16, 32].includes(bottom)) throw new Error("MusicTheory.meter: bad time signature " + sig);
  const unit = R(1, bottom), measure = R(top, bottom);
  const compound = top > 3 && top % 3 === 0, asym = !compound && [5, 7, 11, 13].includes(top);
  const beats = compound ? top / 3 : top, beat = compound ? unit.mul(R(3)) : unit;
  const kind = compound ? "compound" : asym ? "asymmetric" : "simple";
  const group = asym ? `${top} unequal` : ({ 1: "single", 2: "duple", 3: "triple", 4: "quadruple" })[beats] || `${beats}-beat`;
  return { top, bottom, unit, measure, beats, beat, kind, group, division: compound ? 3 : 2, name: `${kind} ${group}` }; }
// Split a list of durations into measures; reports overflow (a note crossing the bar line).
function bar(sig, durs){ const m = meter(sig); const bars = []; let cur = [], sum = R(0);
  for (const d of durs) { cur.push(d); sum = sum.add(d); if (sum.eq(m.measure)) { bars.push({ notes: cur, sum, full: true }); cur = []; sum = R(0); } else if (m.measure.lt(sum)) { bars.push({ notes: cur, sum, full: false, over: sum.sub(m.measure) }); cur = []; sum = R(0); } }
  if (cur.length) bars.push({ notes: cur, sum, full: false, short: m.measure.sub(sum) }); return bars; }

// Acoustics
const harmonics = (f0, n = 8) => Array.from({ length: n }, (_, i) => ({ n: i + 1, f: f0 * (i + 1) }));
const cents = r => 1200 * Math.log2(r);
const nearest = f => { const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m); return { midi: r, cents: 100 * (m - r) }; };
const period = f => 1 / f;

W.MusicTheory = { LET, NAT, R, parse, name, midi, pc, dia, freq, fromDia, spellings, fromMidi, accSym, interval, up, down, invert, ivSemis: (s) => { const { q, size } = ivParse(s); return ivSemis(q, size); },
  SCALES, scale, DEGREE, keySig, sigLetters, sigAcc, CLEFS, staffPos, fromStaffPos, ledgers, DUR, dur, meter, bar, harmonics, cents, nearest, period, SIZE, QLONG };

})();
