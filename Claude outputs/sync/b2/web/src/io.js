/* Import & export for My notes (NotePath, Oct 2026): window.NPIO.
   Export one note, a folder (with its subfolders) or everything, as:
     Markdown / Obsidian (.md; several notes → a .zip that keeps the folders, [[links]] between notes, photos in attachments/),
     Word (.docx: Microsoft Word, Google Docs, Pages, OneNote's Insert › File), Evernote / Apple Notes (.enex: Apple Notes
     File › Import to Notes, Evernote, Joplin), web page (.html), PDF and plain text (.txt). Several notes in a format that
     holds one note per file → a .zip with the same folders.
   Import files, a .zip or a whole folder (an Obsidian vault): .md / .markdown, .txt, .html / .htm (Google Docs, Notion),
   .docx (Word, Google Docs), .enex (Evernote, Apple Notes exports), Google Keep (Takeout .json), Notion exports (.zip of
   .md, ids stripped from names). The folder structure is kept: folders are made under the folder chosen.
   No libraries: a small zip reader / writer (the browser's own deflate), md5 for .enex, and converters both ways.
   Every format goes through one simple form of a note (blocks of runs: ir()), so the exporters agree with each other. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const xesc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const $ = (s, r) => r.querySelector(s);
const NS = () => window.InquireNotes;
const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- progress (v0.5.8, Devon): how big, how fast, how long, how far ----------
   track(onProgress, size, plan): plan = [[phase, weight], …] (weights add up to 1); begin(phase, total bytes), tick(phase,
   bytes, what), done(extra). Sends { f, pct, bytes (of size done), size, speed (bytes/s), eta (s, or null while it can't
   tell yet), what, phase, finished } about 12 times a second, and lets the page paint now and then (yield) so the bar
   moves while the notes are worked through. No onProgress = no reports and no pauses. */
function track(on, size, plan) {
  const t0 = performance.now(), ph = {}; let last = 0, lastYield = t0, what = "", cur = plan[0] && plan[0][0], fin = false;
  plan.forEach(([k, w]) => ph[k] = { w, total: 0, done: 0 });
  const frac = () => Math.min(1, plan.reduce((a, [k]) => a + (ph[k].total ? ph[k].w * Math.min(1, ph[k].done / ph[k].total) : 0), 0));
  const emit = force => {
    if (!on) return; const now = performance.now(); if (!force && now - last < 80) return; last = now;
    const f = fin ? 1 : frac(), el = (now - t0) / 1000, bytes = Math.round(f * size), speed = el > 0.05 ? bytes / el : 0;
    const eta = fin ? 0 : f >= 0.02 && el >= 0.3 ? Math.max(0, el * (1 - f) / f) : null;
    try { on({ f, pct: Math.floor(f * 100), bytes, size, elapsed: el, speed, eta, what, phase: cur, finished: fin }); } catch (e) {}
  };
  return {
    begin(k, total, w) { cur = k; if (ph[k]) ph[k].total = Math.max(1, total); if (w) what = w; emit(true); },
    tick(k, bytes, w) { cur = k; if (ph[k]) ph[k].done += bytes || 0; if (w) what = w; emit(); },
    done(w) { fin = true; if (w) what = w; emit(true); },
    async yield() { if (!on) return; const now = performance.now(); if (now - lastYield < 40) return; lastYield = now; await new Promise(r => setTimeout(r, 0)); }
  };
}
const fmtBytes = n => { n = +n || 0; if (n < 1024) return n + " B"; const u = ["KB", "MB", "GB"]; let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < 2); return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + " " + u[i]; };
const fmtTime = s => s == null ? "" : s < 1 ? "less than a second" : s < 60 ? Math.round(s) + " s" : s < 3600 ? Math.floor(s / 60) + " min " + String(Math.round(s % 60)).padStart(2, "0") + " s" : Math.floor(s / 3600) + " h " + Math.round((s % 3600) / 60) + " min";
// the bar in the window: size, speed, time left and a % meter (role=progressbar)
function progUI(host, label) {
  const el = document.createElement("div"); el.className = "io-prog"; el.hidden = true;
  el.innerHTML = `<div class="io-prog-top"><span class="io-prog-t"></span><span class="io-prog-size num"></span></div>
    <div class="io-prog-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i class="io-prog-fill"></i><span class="io-prog-pct num">0%</span></div>
    <div class="io-prog-stats num"><span class="io-prog-speed"></span><span class="io-prog-eta"></span></div><div class="io-prog-what"></div>`;
  host.appendChild(el);
  const q = c => el.querySelector(c), bar = q(".io-prog-bar");
  return {
    el,
    start(title) { el.hidden = false; el.className = "io-prog run"; q(".io-prog-t").textContent = title; this.paint({ f: 0, pct: 0, bytes: 0, size: 0, speed: 0, eta: null, what: "" }); },
    paint(p) {
      q(".io-prog-fill").style.width = (p.f * 100).toFixed(1) + "%"; q(".io-prog-pct").textContent = p.pct + "%"; bar.setAttribute("aria-valuenow", String(p.pct));
      q(".io-prog-size").textContent = p.size ? `${fmtBytes(p.bytes)} of ${fmtBytes(p.size)}` : "";
      q(".io-prog-speed").textContent = p.finished ? (p.elapsed != null ? `Took ${fmtTime(p.elapsed)}` : "") + (p.speed ? ` · ${fmtBytes(p.speed)}/s on average` : "") : p.speed ? `${fmtBytes(p.speed)}/s` : "Starting…";
      q(".io-prog-eta").textContent = p.finished ? "" : p.eta == null ? "Working out the time left…" : p.eta < 1 ? "Less than a second left" : `About ${fmtTime(p.eta)} left`;
      q(".io-prog-what").textContent = p.what || "";
    },
    end(ok, title) { el.className = "io-prog " + (ok ? "ok" : "bad"); q(".io-prog-t").textContent = title; if (!ok) q(".io-prog-eta").textContent = ""; }
  };
}

/* ---------- zip (store + deflate via CompressionStream; read via DecompressionStream) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function pipe(bytes, stream) { const r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
const deflate = b => pipe(b, new CompressionStream("deflate-raw")), inflate = b => pipe(b, new DecompressionStream("deflate-raw"));
const toBytes = d => typeof d === "string" ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d);
// entries: [{ name, data: string | Uint8Array }] → Blob (application/zip)
async function zip(entries, onEntry) {
  const parts = [], central = []; let off = 0;
  const now = new Date(), dtime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), ddate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name), raw = toBytes(e.data), crc = crc32(raw);
    let body = raw, method = 0;
    if (raw.length > 64 && !/\.(png|jpe?g|gif|webp|zip|docx|mp4|mov|webm)$/i.test(e.name)) { const d = await deflate(raw); if (d.length < raw.length) { body = d; method = 8; } }
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true); h.setUint16(10, dtime, true); h.setUint16(12, ddate, true);
    h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true); c.setUint16(12, dtime, true); c.setUint16(14, ddate, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + body.length;
    if (onEntry) await onEntry(raw.length, e.name);
  }
  const csize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}
// Blob → [{ name, size, bytes(), text() }] (folders left out)
async function unzip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("not a zip file");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const nameB = buf.subarray(p + 46, p + 46 + nl), name = flags & 0x800 ? dec.decode(nameB) : [...nameB].map(c => String.fromCharCode(c)).join("");
    p += 46 + nl + xl + cl;
    if (/\/$/.test(name)) continue;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = buf.subarray(start, start + csz);
    let cache = null;
    const bytes = async () => cache || (cache = method === 8 ? await inflate(data) : method === 0 ? data.slice() : Promise.reject(new Error("unsupported zip compression")));
    out.push({ name, size: usz, bytes, text: async () => dec.decode(await bytes()) });
  }
  return out;
}

/* ---------- md5 (Evernote names photos by the md5 of their bytes) ---------- */
function md5(bytes) {
  const K = new Int32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
  const len = bytes.length, nb = ((len + 8) >> 6) + 1, w = new Int32Array(nb * 16);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
  w[len >> 2] |= 0x80 << ((len % 4) * 8); w[nb * 16 - 2] = (len * 8) | 0; w[nb * 16 - 1] = Math.floor(len / 0x20000000);
  let a = 0x67452301, b = 0xefcdab89 | 0, c = 0x98badcfe | 0, d = 0x10325476;
  for (let o = 0; o < w.length; o += 16) {
    let A = a, B = b, C = c, D = d;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (B & C) | (~B & D); g = i; } else if (i < 32) { f = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { f = B ^ C ^ D; g = (3 * i + 5) % 16; } else { f = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D; D = C; C = B; const x = (A + f + K[i] + w[o + g]) | 0, s = S[(i >> 4) * 4 + (i % 4)]; B = (B + ((x << s) | (x >>> (32 - s)))) | 0; A = tmp;
    }
    a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
  }
  return [a, b, c, d].map(v => [0, 8, 16, 24].map(s => ((v >>> s) & 0xFF).toString(16).padStart(2, "0")).join("")).join("");
}
const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(String(s).replace(/\s+/g, "")), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };

/* ---------- one simple form of a note: blocks of runs ----------
   block: { t: "p" | "h" | "li" | "quote" | "code" | "text" | "img", runs, list: "ul"|"ol"|"ck", done, depth, lang, title, src, text, img, url }
   run: { text, b, i, u, s, color, size, font, link (note id) } | { br } | { img (media id) | url, alt } */
const PAL = { amber: "#F2B84B", cyan: "#5CC8E0", pink: "#F07CA0", violet: "#B49BFF", green: "#7BD88F", magenta: "#D97AE6", lime: "#B5D65A", red: "#E5675B", muted: "#8B97AE" };
const OLDSIZE = { s: 12, n: 15, l: 19, xl: 24 };
const fontName = k => { const f = (NS() && NS().NFONTS || []).find(x => x[0] === k); return f ? f[1] : null; };
function ir(html) {
  const t = document.createElement("template"); t.innerHTML = String(html || ""); const out = [];
  const runs = (node, st, skipLists) => { const rs = [];
    const walk = (n, s) => n.childNodes.forEach(c => {
      if (c.nodeType === 3) { if (c.nodeValue) rs.push(Object.assign({ text: c.nodeValue.replace(/\u00a0/g, " ") }, s)); return; }
      if (c.nodeType !== 1) return; const tg = c.tagName;
      if (tg === "BR") { rs.push({ br: true }); return; }
      if (tg === "IMG") { rs.push({ img: c.getAttribute("data-img") || null, url: c.getAttribute("src") && /^https:/.test(c.getAttribute("src")) ? c.getAttribute("src") : null, alt: c.getAttribute("alt") || "" }); return; }
      if (skipLists && (tg === "UL" || tg === "OL")) return;
      if (tg === "DIV" && c.classList.contains("nw")) return;
      const s2 = Object.assign({}, s);
      if (tg === "B" || tg === "STRONG") s2.b = 1; if (tg === "I" || tg === "EM") s2.i = 1; if (tg === "U") s2.u = 1; if (tg === "S" || tg === "STRIKE") s2.s = 1;
      if (tg === "A" && c.getAttribute("data-note")) s2.link = c.getAttribute("data-note");
      if (tg === "SPAN") { const col = c.getAttribute("data-c"), sz = c.getAttribute("data-s"), f = c.getAttribute("data-f");
        if (col) s2.color = /^#/.test(col) ? col : PAL[col]; if (sz) s2.size = OLDSIZE[sz] || +sz || undefined; if (f) s2.font = f;
        const hl = c.getAttribute("data-h"); if (/^#[0-9a-f]{6}$/i.test(hl || "")) s2.hl = hl; }
      if (tg === "DIV" || tg === "P") { if (rs.length && !rs[rs.length - 1].br) rs.push({ br: true }); walk(c, s2); return; }
      walk(c, s2);
    });
    walk(node, st || {}); while (rs.length && rs[rs.length - 1].br) rs.pop(); return rs; };
  // a line's layout (v0.5.4): align, indent, line spacing, space after, from the line or the list / block around it
  const lay = el => { const o = {}; for (let x = el; x && x.nodeType === 1; x = x.parentElement) { [["al", "data-al"], ["ind", "data-in"], ["lh", "data-lh"], ["ps", "data-ps"]].forEach(([k, a]) => { if (o[k] == null && x.hasAttribute(a)) o[k] = x.getAttribute(a); }); } if (o.ind) o.ind = +o.ind; if (o.lh) o.lh = +o.lh; if (o.ps != null) o.ps = +o.ps; return Object.keys(o).length ? o : undefined; };
  const widget = el => { let d = {}; try { d = JSON.parse(el.getAttribute("data-src") || "{}"); } catch (e) {}
    if (el.getAttribute("data-w") === "code") return { t: "code", lang: d.lang || "", title: d.title || "", src: String(d.src || "") };
    let tx = ""; try { tx = window.InquireWidgets ? InquireWidgets.text(el).trim() : ""; } catch (e) {}
    if (el.getAttribute("data-w") === "audio" && d.vid) return { t: "text", text: tx, aud: d.vid, title: d.title || "Audio recording" }; // (v0.5.8) a recording
    return { t: "text", text: tx }; };
  const list = (el, depth) => { const kind = el.tagName === "OL" ? "ol" : el.getAttribute("data-ck") === "1" ? "ck" : "ul";
    [...el.children].forEach(li => { if (li.tagName !== "LI") return; out.push({ t: "li", list: kind, done: li.getAttribute("data-done") === "1", depth, runs: runs(li, {}, true), lay: lay(li) });
      [...li.children].forEach(x => { if (x.tagName === "UL" || x.tagName === "OL") list(x, depth + 1); }); }); };
  let pend = [];
  const flushInline = () => { if (pend.length) { const d = document.createElement("div"); pend.forEach(n => d.appendChild(n.cloneNode(true))); const r = runs(d); if (r.length) out.push({ t: "p", runs: r }); pend = []; } };
  const block = el => {
    const tg = el.tagName;
    if (tg === "DIV" && el.classList.contains("nw")) { out.push(widget(el)); return; }
    if (HLV[tg]) { out.push({ t: "h", lv: HLV[tg], runs: runs(el), lay: lay(el) }); return; } // lv: "title", "sub", 1, 2, 3
    if (tg === "UL" || tg === "OL") { list(el, 0); return; }
    if (tg === "BLOCKQUOTE") { out.push({ t: "quote", runs: runs(el), lay: lay(el) }); return; }
    if ((tg === "DIV" || tg === "P") && [...el.children].some(c => /^(DIV|P|UL|OL|H1|H2|H3|H4|H6|BLOCKQUOTE)$/.test(c.tagName))) { walkBlocks(el); return; }
    if (tg === "DIV" || tg === "P") { const r = runs(el); out.push({ t: "p", runs: r.length ? r : [], lay: lay(el) }); return; }
    pend.push(el);
  };
  const walkBlocks = root => { [...root.childNodes].forEach(c => { if (c.nodeType === 1 && /^(DIV|P|UL|OL|H1|H2|H3|H4|H6|BLOCKQUOTE)$/.test(c.tagName)) { flushInline(); block(c); } else if (c.nodeType === 3 || c.nodeType === 1) pend.push(c); }); flushInline(); };
  walkBlocks(t.content);
  while (out.length && out[out.length - 1].t === "p" && !out[out.length - 1].runs.length) out.pop();
  return out;
}
const imgIdsOf = blocks => [...new Set(blocks.flatMap(b => (b.runs || []).filter(r => r.img).map(r => r.img)))];
async function mediaBlob(id) { try { return NS() ? await NS().mediaBlob(id) : null; } catch (e) { return null; } }
const extOf = type => ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" })[String(type || "").split(";")[0]] || "bin";

/* ---------- exporters ---------- */
const safeName = s => (String(s || "").replace(/[\\/:*?"<>|#^\[\]\u0000-\u001F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)) || "Untitled";
// Markdown: Obsidian flavour ([[links]], - [ ] tasks, ``` fences). img(id) → the path of the photo in the export, title(id) → a note's file name
function toMD(n, ctx) {
  const blocks = ir(n.html), lines = [], mdEsc = s => s.replace(/([\\`*_\[\]])/g, "\\$1").replace(/^(\s*)([#>+-]|\d+\.)(\s)/, "$1\\$2$3");
  const inl = rs => rs.map(r => {
    if (r.br) return "  \n"; if (r.img || r.url) return r.img ? `![${r.alt || ""}](${encodeURI(ctx.img(r.img))})` : `![${r.alt || ""}](${r.url})`;
    let s = r.link ? `[[${ctx.title(r.link) || r.text}${ctx.title(r.link) && ctx.title(r.link) !== r.text ? "|" + r.text : ""}]]` : mdEsc(r.text);
    if (!s.trim() || r.link) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0]; let core = s.trim();
    if (r.font === "mono") core = "`" + core.replace(/\\(.)/g, "$1") + "`"; if (r.s) core = "~~" + core + "~~"; if (r.i) core = "*" + core + "*"; if (r.b) core = "**" + core + "**"; if (r.u) core = "<u>" + core + "</u>"; if (r.hl) core = "==" + core + "==";
    return lead + core + trail; }).join("").replace(/\*\*\*\*/g, "");
  let prev = null, prevList = null;
  blocks.forEach(b => {
    const gap = () => { if (lines.length && lines[lines.length - 1] !== "") lines.push(""); };
    if (b.t === "p") { if (prev && prev !== "p") gap(); lines.push(inl(b.runs)); }
    else if (b.t === "h") { gap(); lines.push(b.lv === "sub" ? "*" + inl(b.runs) + "*" : "#".repeat(b.lv === "title" ? 1 : b.lv + 1) + " " + inl(b.runs)); lines.push(""); }
    else if (b.t === "li") { if (prev !== "li" || (b.depth === 0 && prevList && prevList !== b.list)) gap(); prevList = b.depth === 0 ? b.list : prevList; lines.push("    ".repeat(b.depth) + (b.list === "ol" ? "1. " : b.list === "ck" ? (b.done ? "- [x] " : "- [ ] ") : "- ") + inl(b.runs)); }
    else if (b.t === "quote") { gap(); inl(b.runs).split("\n").forEach(l => lines.push("> " + l.replace(/ {2}$/, ""))); lines.push(""); }
    else if (b.t === "code") { gap(); lines.push("```" + (b.lang === "text" ? "" : b.lang || "") + (b.title ? " title=\"" + b.title + "\"" : ""), ...b.src.replace(/\n$/, "").split("\n"), "```"); lines.push(""); }
    else if (b.t === "text") { gap(); const ap = b.aud && ctx.img ? ctx.img(b.aud) : ""; lines.push(ap ? `🎙 [${mdEsc(b.title || "Audio recording")}](${encodeURI(ap)})` + (b.text.match(/\(([\d:]+)\)\s*$/) ? " (" + b.text.match(/\(([\d:]+)\)\s*$/)[1] + ")" : "") : b.text); lines.push(""); }
    prev = b.t;
  });
  const fm = ["---", "created: " + new Date(n.created).toISOString(), "updated: " + new Date(n.updated).toISOString()].concat(n.fav ? ["favourite: true"] : [], ["---", ""]);
  return fm.join("\n") + lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
// HTML (web page, PDF, and the .enex content): imgSrc(id) → a data: URL / resource; enml → Evernote's subset
function toHTMLBody(n, ctx, enml) {
  const blocks = ir(n.html), out = [];
  const st = r => { const a = []; if (r.color) a.push("color:" + r.color); if (r.hl) a.push("background-color:" + r.hl); if (r.size && r.size !== 15) a.push("font-size:" + (enml ? Math.round(r.size * .8) + "pt" : (r.size / 15).toFixed(2) + "em")); if (r.font && fontName(r.font)) a.push("font-family:" + (r.font === "mono" ? "monospace" : `'${fontName(r.font)}'`)); return a.join(";"); };
  // a line's layout as CSS (v0.5.4); more = CSS the line already has
  const bst = (b, more) => { const L = b.lay || {}, a = more ? [more] : []; if (L.al) a.push("text-align:" + L.al); if (L.ind) a.push(`margin-left:${L.ind * 2}em`); if (L.lh) a.push("line-height:" + L.lh); if (L.ps != null && !isNaN(L.ps)) a.push(`margin-bottom:${L.ps}px`); return a.length ? ` style="${a.join(";")}"` : ""; };
  const inl = rs => rs.map(r => {
    if (r.br) return "<br/>";
    if (r.img) return enml ? ctx.media(r.img) : `<img src="${ctx.src(r.img)}" alt="${xesc(r.alt)}" />`; if (r.url) return `<img src="${xesc(r.url)}" alt="${xesc(r.alt)}" />`;
    let s = xesc(r.text); const css = st(r);
    if (css) s = `<span style="${css}">${s}</span>`; if (r.s) s = `<s>${s}</s>`; if (r.u) s = `<u>${s}</u>`; if (r.i) s = `<i>${s}</i>`; if (r.b) s = `<b>${s}</b>`;
    if (r.link && !enml && ctx.href) s = `<a href="${xesc(ctx.href(r.link))}">${s}</a>`;
    return s; }).join("");
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === "p") out.push(`<div${bst(b)}>${b.runs.length ? inl(b.runs) : "<br/>"}</div>`);
    else if (b.t === "h") out.push(b.lv === "sub" ? `<p${enml ? bst(b, "font-style:italic;color:#666") : ` class="sub"` + bst(b)}><i>${inl(b.runs)}</i></p>` : `<h${b.lv === "title" ? 2 : b.lv + 2}${bst(b)}>${inl(b.runs)}</h${b.lv === "title" ? 2 : b.lv + 2}>`);
    else if (b.t === "quote") out.push(`<blockquote${bst(b)}>${inl(b.runs)}</blockquote>`);
    else if (b.t === "code") out.push(`<pre${enml ? ` style="font-family:monospace;background:#f4f4f4;padding:8px"` : ` class="code"`}>${b.title ? xesc(b.title) + "\n" : ""}${xesc(b.src)}</pre>`);
    else if (b.t === "text") out.push(`<pre>${xesc(b.text)}</pre>`);
    else if (b.t === "li") {
      if (b.list === "ck") { out.push(enml ? `<div${bst(b)}><en-todo checked="${b.done}"/>${inl(b.runs)}</div>` : `<div class="ck${b.done ? " done" : ""}"${bst(b, b.depth ? `margin-left:${b.depth * 24}px` : "")}><input type="checkbox" disabled${b.done ? " checked" : ""}/> ${inl(b.runs)}</div>`); continue; }
      // a run of list items of one kind → nested <ul>/<ol>, sub-lists inside their item
      const t0 = b.list, items = []; let j = i;
      for (; j < blocks.length && blocks[j].t === "li" && blocks[j].list !== "ck" && (blocks[j].depth > 0 || blocks[j].list === t0); j++) items.push(blocks[j]);
      let html = ""; const stack = [];
      items.forEach(x => { const tg = x.list === "ol" ? "ol" : "ul";
        if (!stack.length) { html += `<${tg}>`; stack.push(tg); }
        else if (x.depth + 1 > stack.length) { while (stack.length < x.depth + 1) { html += `<${tg}>`; stack.push(tg); } }
        else { html += "</li>"; while (stack.length > Math.max(1, x.depth + 1)) html += `</${stack.pop()}></li>`; }
        html += `<li${bst(x)}>${inl(x.runs)}`; });
      html += "</li>"; while (stack.length) { html += `</${stack.pop()}>`; if (stack.length) html += "</li>"; }
      out.push(html); i = j - 1;
    }
  }
  return out.join("\n");
}
const PAGECSS = `body{font:15px/1.6 -apple-system,"Segoe UI","IBM Plex Sans",Helvetica,Arial,sans-serif;color:#1b2230;max-width:760px;margin:40px auto;padding:0 24px}
h1{font:600 30px/1.2 Georgia,"STIX Two Text",serif;margin:0 0 6px}.meta{color:#7a8496;font-size:12px;margin:0 0 24px}h2{font-size:20px;margin:22px 0 8px}
blockquote{margin:12px 0;padding:6px 14px;border-left:3px solid #b49bff;color:#3a4458}pre{font:13px/1.5 Menlo,Consolas,monospace;background:#f3f5f9;border:1px solid #dde2ea;border-radius:4px;padding:10px 12px;white-space:pre-wrap}
img{max-width:100%;height:auto}.ck.done{color:#7a8496;text-decoration:line-through}article+article{margin-top:48px;padding-top:32px;border-top:1px solid #dde2ea}
a{color:#6b4fd8}@media print{body{margin:0 auto}article+article{break-before:page;border:0;margin:0;padding:0}}`;
const article = (n, ctx) => `<article id="n-${n.id}"><h1>${xesc(n.title)}</h1><p class="meta">${xesc(new Date(n.updated).toLocaleString())}${ctx.path ? " · " + xesc(ctx.path(n)) : ""}</p>\n${toHTMLBody(n, ctx)}</article>`;
const htmlDoc = (title, body) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xesc(title)}</title><meta name="generator" content="NotePath"><style>${PAGECSS}</style></head><body>\n${body}\n</body></html>\n`;
const dataURL = async id => { const b = await mediaBlob(id); return b ? `data:${b.type || "image/png"};base64,${b64(new Uint8Array(await b.arrayBuffer()))}` : ""; };

/* Word (.docx): WordprocessingML written by hand (styles, bullets / numbers, checkboxes, quotes, code, colours, sizes, fonts, photos) */
const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
// titles and headings in a note (v0.5.4): h1 Title · h6 Subtitle · h2 / h3 / h4 Heading 1 / 2 / 3 (h5 from elsewhere = Heading 3)
const HLV = { H1: "title", H6: "sub", H2: 1, H3: 2, H4: 3, H5: 3 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:i/><w:color w:val="595959"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="B49BFF"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="404858"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F5F9"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
</w:styles>`;
const NUMBERING = (() => { const lv = (fmt, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${fmt === "bullet" ? ["•", "◦", "▪"][i % 3] : "%" + (i + 1) + "."}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + i * 360}" w:hanging="360"/></w:pPr>${fmt === "bullet" ? `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>` : ""}</w:lvl>`;
  const ab = (id, fmt) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => lv(fmt, i)).join("")}</w:abstractNum>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${ab(0, "bullet")}${ab(1, "decimal")}<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`; })();
async function toDOCX(n) {
  const blocks = ir(n.html), media = []; let pid = 0;
  for (const id of imgIdsOf(blocks)) {
    let b = await mediaBlob(id); if (!b) continue;
    if (!/^image\/(png|jpeg|gif)$/.test(b.type)) { try { const bm = await createImageBitmap(b), c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; c.getContext("2d").drawImage(bm, 0, 0); b = await new Promise(r => c.toBlob(r, "image/png")); } catch (e) { continue; } }
    let w = 600, h = 400; try { const bm = await createImageBitmap(b); w = bm.width; h = bm.height; } catch (e) {}
    const sc = Math.min(1, 600 / w); media.push({ id, rid: "rIdImg" + media.length, file: "image" + media.length + "." + extOf(b.type), type: b.type, bytes: new Uint8Array(await b.arrayBuffer()), cx: Math.round(w * sc * 9525), cy: Math.round(h * sc * 9525) });
  }
  const M = Object.fromEntries(media.map(m => [m.id, m]));
  const rpr = r => { let x = ""; const f = r.font && fontName(r.font); if (f) x += `<w:rFonts w:ascii="${xesc(f)}" w:hAnsi="${xesc(f)}" w:cs="${xesc(f)}"/>`;
    if (r.b) x += "<w:b/>"; if (r.i) x += "<w:i/>"; if (r.s) x += "<w:strike/>"; const col = r.link ? "6B4FD8" : r.color && r.color.replace("#", ""); if (col) x += `<w:color w:val="${col.toUpperCase()}"/>`;
    if (r.size && r.size !== 15) { const hp = Math.round(r.size * 22 / 15); x += `<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/>`; } if (r.u || r.link) x += `<w:u w:val="single"/>`; if (r.hl) x += `<w:shd w:val="clear" w:color="auto" w:fill="${r.hl.slice(1).toUpperCase()}"/>`; return x ? `<w:rPr>${x}</w:rPr>` : ""; };
  // a line's layout (v0.5.4) in Word's order: spacing, ind, jc (base = the indent the line already has, in twips)
  const play = (b, base = 0) => { const L = b.lay || {}; let x = "";
    if (L.lh || (L.ps != null && !isNaN(L.ps))) x += `<w:spacing${L.ps != null && !isNaN(L.ps) ? ` w:after="${L.ps * 15}"` : ""}${L.lh ? ` w:line="${Math.round(240 * L.lh)}" w:lineRule="auto"` : ""}/>`;
    if (L.ind || base) x += `<w:ind w:left="${base + (L.ind || 0) * 720}"/>`;
    if (L.al) x += `<w:jc w:val="${L.al === "center" ? "center" : L.al === "right" ? "right" : "left"}"/>`; return x; };
  const runXML = r => {
    if (r.br) return "<w:r><w:br/></w:r>";
    if (r.img) { const m = M[r.img]; if (!m) return ""; pid++; return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${m.cx}" cy="${m.cy}"/><wp:docPr id="${pid}" name="Picture ${pid}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pid}" name="${m.file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${m.cx}" cy="${m.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; }
    if (r.url) return `<w:r><w:t xml:space="preserve">[photo: ${xesc(r.url)}]</w:t></w:r>`;
    return `<w:r>${rpr(r)}<w:t xml:space="preserve">${xesc(r.text)}</w:t></w:r>`; };
  const para = (style, inner, extra) => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra || ""}</w:pPr>` : ""}${inner}</w:p>`;
  const body = [para("Title", `<w:r><w:t xml:space="preserve">${xesc(n.title)}</w:t></w:r>`)];
  blocks.forEach(b => {
    if (b.t === "p") body.push(para("", b.runs.map(runXML).join(""), play(b)));
    else if (b.t === "h") body.push(para(b.lv === "title" ? "Title" : b.lv === "sub" ? "Subtitle" : "Heading" + b.lv, b.runs.map(runXML).join(""), play(b)));
    else if (b.t === "quote") body.push(para("Quote", b.runs.map(runXML).join(""), play(b)));
    else if (b.t === "li") body.push(b.list === "ck" ? para("ListParagraph", `<w:r><w:t xml:space="preserve">${b.done ? "☒" : "☐"} </w:t></w:r>` + b.runs.map(r => runXML(b.done && !r.br && !r.img ? Object.assign({}, r, { s: 1 }) : r)).join(""), play(b, 360 + b.depth * 360))
      : para("ListParagraph", b.runs.map(runXML).join(""), `<w:numPr><w:ilvl w:val="${Math.min(8, b.depth)}"/><w:numId w:val="${b.list === "ol" ? 2 : 1}"/></w:numPr>` + play(b, b.lay && b.lay.ind ? 720 + b.depth * 360 : 0)));
    else if (b.t === "code") { if (b.title) body.push(para("", `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xesc(b.title)}</w:t></w:r>`)); b.src.replace(/\n$/, "").split("\n").forEach(l => body.push(para("Code", `<w:r><w:t xml:space="preserve">${xesc(l.replace(/\t/g, "    "))}</w:t></w:r>`))); body.push(para("", "")); }
    else if (b.t === "text") b.text.split("\n").forEach(l => body.push(para("Code", `<w:r><w:t xml:space="preserve">${xesc(l)}</w:t></w:r>`)));
  });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const drels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${media.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.file}"/>`).join("")}</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(n.title)}</dc:title><dc:creator>NotePath</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date(n.created).toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date(n.updated).toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:modified></cp:coreProperties>`;
  return zip([{ name: "[Content_Types].xml", data: types }, { name: "_rels/.rels", data: rels }, { name: "docProps/core.xml", data: core }, { name: "word/document.xml", data: doc }, { name: "word/styles.xml", data: STYLES },
    { name: "word/numbering.xml", data: NUMBERING }, { name: "word/_rels/document.xml.rels", data: drels }, ...media.map(m => ({ name: "word/media/" + m.file, data: m.bytes }))]);
}

/* Evernote / Apple Notes (.enex) */
const enDate = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
async function toENEX(notes, tagOf) {
  const parts = [];
  for (const n of notes) {
    const res = {};
    for (const id of imgIdsOf(ir(n.html))) { const b = await mediaBlob(id); if (!b) continue; const bytes = new Uint8Array(await b.arrayBuffer()); res[id] = { hash: md5(bytes), type: b.type || "image/png", bytes }; }
    const body = toHTMLBody(n, { media: id => res[id] ? `<en-media type="${res[id].type}" hash="${res[id].hash}"/>` : "" }, true);
    const content = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">\n<en-note>${body}</en-note>`.replace(/]]>/g, "]]&gt;");
    const tag = tagOf && tagOf(n);
    parts.push(`<note><title>${xesc(n.title)}</title><content><![CDATA[${content}]]></content><created>${enDate(n.created)}</created><updated>${enDate(n.updated)}</updated>${tag ? `<tag>${xesc(tag)}</tag>` : ""}<note-attributes><source>NotePath</source></note-attributes>`
      + Object.values(res).map(r => `<resource><data encoding="base64">${b64(r.bytes)}</data><mime>${r.type}</mime><resource-attributes><file-name>${r.hash}.${extOf(r.type)}</file-name></resource-attributes></resource>`).join("") + `</note>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n<en-export export-date="${enDate(Date.now())}" application="NotePath" version="1">\n${parts.join("\n")}\n</en-export>\n`;
}

/* ---------- what to export: one note, a folder (and the folders in it), everything ---------- */
function folderPath(fid, fs) { const out = []; let f = fs.find(x => x.id === fid), guard = 0; while (f && guard++ < 50) { out.unshift(safeName(f.name)); f = fs.find(x => x.id === f.parent); } return out; }
function pick(scope, o) {
  const N = NS(), all = N.list(), fs = N.folders();
  if (scope === "note") { const n = all.find(x => x.id === o.note); return { notes: n ? [n] : [], base: n ? folderPath(n.folder, fs) : [] }; }
  if (scope === "folder") {
    if (o.folder === "fav") return { notes: all.filter(n => n.fav), base: [], name: "Favourites" };
    if (o.folder === "none") return { notes: all.filter(n => !n.folder), base: [], name: "Unfiled" };
    if (o.folder && o.folder !== "all") { const sub = N.subtree(o.folder), base = folderPath(o.folder, fs).slice(0, -1); return { notes: all.filter(n => sub.has(n.folder)), base, name: (fs.find(f => f.id === o.folder) || {}).name }; }
  }
  return { notes: all, base: [], name: "NotePath notes" };
}
const FORMATS = [
  { k: "md", name: "Markdown", ext: "md", for: "Obsidian · Notion · Bear · Joplin · Logseq", note: "Keeps headings, lists, checklists, code, links between notes ([[…]]) and photos." },
  { k: "docx", name: "Word", ext: "docx", for: "Microsoft Word · Google Docs · Pages · OneNote (Insert › File)", note: "A Word document per note, with its formatting and photos." },
  { k: "enex", name: "Evernote / Apple Notes", ext: "enex", for: "Apple Notes (File › Import to Notes) · Evernote · Joplin", note: "One .enex per folder; Apple Notes and Evernote import it with photos and checklists." },
  { k: "html", name: "Web page", ext: "html", for: "Any browser · Notion · Google Docs (upload)", note: "Readable anywhere; photos are inside the page." },
  { k: "pdf", name: "PDF", ext: "pdf", for: "Print, share, archive", note: "One PDF; each note starts on a new page." },
  { k: "txt", name: "Plain text", ext: "txt", for: "Anything", note: "Words only." }];
function save(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function exportNotes(scope, fmt, o = {}) {
  const N = NS(), { notes, base, name } = pick(scope, o), fs = N.folders();
  if (!notes.length) throw new Error("There are no notes there to export.");
  const one = notes.length === 1, stem = one ? safeName(notes[0].title) : safeName(name || "NotePath notes");
  // where each note goes inside the export: its folders below the folder being exported
  const rel = n => folderPath(n.folder, fs).slice(base.length);
  const used = new Set(), fileOf = {}, uniq = (dir, nm, ext) => { let f = (dir.length ? dir.join("/") + "/" : "") + nm + "." + ext, i = 2; while (used.has(f.toLowerCase())) f = (dir.length ? dir.join("/") + "/" : "") + nm + " " + i++ + "." + ext; used.add(f.toLowerCase()); return f; };
  notes.forEach(n => { fileOf[n.id] = uniq(rel(n), safeName(n.title), fmt === "pdf" ? "md" : FORMATS.find(f => f.k === fmt).ext); });
  // (v0.5.8) progress: the size is the notes' text plus their photos; a .zip is packed in a second phase
  const on = o.onProgress, many = fmt === "pdf" ? false : fmt === "enex" ? new Set(notes.map(n => rel(n).join(" - "))).size > 1 : !one || (fmt === "md" && notes.some(n => /data-img=|data-w="audio"/.test(n.html || "")));
  const textOf = n => (n.html || n.body || "").length + (n.title || "").length, mediaSize = {};
  if (on) for (const n of notes) for (const id of imgIdsOf(ir(n.html))) if (!(id in mediaSize)) { const b = await mediaBlob(id); mediaSize[id] = b ? b.size : 0; }
  const seen = new Set(), noteBytes = n => textOf(n) + (on ? imgIdsOf(ir(n.html)).reduce((a, id) => { if (seen.has(id)) return a; seen.add(id); return a + (mediaSize[id] || 0); }, 0) : 0);
  const size = notes.reduce((a, n) => a + textOf(n), 0) + Object.values(mediaSize).reduce((a, b) => a + b, 0);
  const T = track(on, size, many ? [["notes", .6], ["zip", .4]] : fmt === "pdf" ? [["notes", .5], ["pdf", .5]] : [["notes", 1]]);
  T.begin("notes", size, notes.length === 1 ? "Preparing " + notes[0].title : `Preparing ${notes.length} notes`);
  let ni = 0; const step = async n => { ni++; T.tick("notes", noteBytes(n), `Note ${ni} of ${notes.length}: ${n.title || "Untitled"}`); await T.yield(); };
  const packZip = async es => { T.begin("zip", es.reduce((a, e) => a + toBytes(e.data).length, 0) || 1, "Packing the .zip"); return zip(es, async (b, nm) => { T.tick("zip", b, "Packing " + nm.split("/").pop()); await T.yield(); }); };
  const titleOf = id => { const n = N.get(id); return n ? (fileOf[id] ? fileOf[id].replace(/^.*\//, "").replace(/\.[a-z]+$/, "") : safeName(n.title)) : null; };
  let blob, file;
  if (fmt === "md") {
    const atts = {}, entries = [];
    for (const n of notes) {
      const imgs = imgIdsOf(ir(n.html)).concat(ir(n.html).filter(b => b.aud).map(b => b.aud)); // photos and (v0.5.8) recordings
      for (const id of imgs) if (!atts[id]) { const b = await mediaBlob(id); if (b) atts[id] = { path: "attachments/" + id + "." + extOf(b.type), bytes: new Uint8Array(await b.arrayBuffer()) }; }
      const depth = fileOf[n.id].split("/").length - 1;
      entries.push({ name: fileOf[n.id], data: toMD(n, { img: id => atts[id] ? "../".repeat(depth) + atts[id].path : "", title: titleOf }) });
      await step(n);
    }
    Object.values(atts).forEach(a => entries.push({ name: a.path, data: a.bytes }));
    if (one && !Object.keys(atts).length) { blob = new Blob([entries[0].data], { type: "text/markdown" }); file = stem + ".md"; }
    else { blob = await packZip(entries.map(e => one ? e : Object.assign({}, e, { name: stem + "/" + e.name }))); file = stem + ".zip"; }
  } else if (fmt === "txt") {
    const entries = []; for (const n of notes) { entries.push({ name: fileOf[n.id], data: n.title + "\n\n" + N.toText(n.html) + "\n" }); await step(n); }
    if (one) { blob = new Blob([entries[0].data], { type: "text/plain" }); file = stem + ".txt"; } else { blob = await packZip(entries.map(e => Object.assign({}, e, { name: stem + "/" + e.name }))); file = stem + ".zip"; }
  } else if (fmt === "docx") {
    if (one) { blob = await toDOCX(notes[0]); file = stem + ".docx"; await step(notes[0]); }
    else { const entries = []; for (const n of notes) { entries.push({ name: stem + "/" + fileOf[n.id], data: new Uint8Array(await (await toDOCX(n)).arrayBuffer()) }); await step(n); } blob = await packZip(entries); file = stem + ".zip"; }
  } else if (fmt === "html" || fmt === "pdf") {
    const urls = {}; for (const n of notes) { for (const id of imgIdsOf(ir(n.html))) if (!(id in urls)) urls[id] = await dataURL(id); await step(n); }
    const ctx = { src: id => urls[id] || "", href: id => fileOf[id] ? "#n-" + id : "", path: one ? null : n => rel(n).join(" › ") };
    if (fmt === "pdf" || one) {
      const page = htmlDoc(one ? notes[0].title : name || "NotePath notes", notes.map(n => article(n, ctx)).join("\n"));
      if (fmt === "pdf") { T.begin("pdf", 1, "Making the PDF"); blob = await pdf(page); T.tick("pdf", 1); file = stem + ".pdf"; if (!blob) { T.done("Sent to the print window"); return { printed: true, count: notes.length }; } }
      else { blob = new Blob([page], { type: "text/html" }); file = stem + ".html"; }
    } else {
      const entries = notes.map(n => { const depth = fileOf[n.id].split("/").length - 1;
        return { name: stem + "/" + fileOf[n.id], data: htmlDoc(n.title, article(n, Object.assign({}, ctx, { path: null, href: id => fileOf[id] ? "../".repeat(depth) + encodeURI(fileOf[id]) : "" }))) }; });
      blob = await packZip(entries); file = stem + ".zip";
    }
  } else if (fmt === "enex") {
    // one notebook per folder (Evernote) / one import per file (Apple Notes): the folder path is the file name, and a tag
    const groups = {}; notes.forEach(n => { const k = rel(n).join(" - ") || (one ? "" : name ? safeName(name) : "Notes"); (groups[k] = groups[k] || []).push(n); });
    const keys = Object.keys(groups);
    const grp = async k => { const x = await toENEX(groups[k], n => rel(n).join("/")); for (const n of groups[k]) await step(n); return x; };
    if (keys.length === 1) { blob = new Blob([await grp(keys[0])], { type: "application/enex+xml" }); file = (one ? stem : safeName(keys[0] || stem)) + ".enex"; }
    else { const entries = []; for (const k of keys) entries.push({ name: stem + "/" + safeName(k) + ".enex", data: await grp(k) }); blob = await packZip(entries); file = stem + ".zip"; }
  }
  if (!o.noSave) save(blob, file);
  T.done(`${file} · ${fmtBytes(blob.size)}`);
  return { file, count: notes.length, bytes: blob.size, blob };
}
/* ---------- Share → Email and Print (v0.5.6, Devon) ----------
   Email: a new message in the person's own mail app (a mailto: link: the title as the subject, the note's words as the text;
   long notes are cut, as mail apps refuse very long links). "Email with a PDF" also makes the PDF, keeps it in
   Downloads/NotePath (desktop: main.js share:file) and shows it in Finder / File Explorer so it can be dragged into the
   message: a mailto: link cannot carry a file. Print: the note as a clean page (the web page export), sent to the printer
   (desktop: main.js print:html opens the system print window; the browser build prints a hidden frame). The hooks can be
   replaced by the tests. */
const MAIL_MAX = 1800;
const hooks = {
  openMail: async url => { const D = window.inquireDesktop; if (D && D.share && D.share.mail) return D.share.mail(url); const a = document.createElement("a"); a.href = url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); return true; },
  keepFile: async (name, blob) => { const D = window.inquireDesktop; if (D && D.share && D.share.file) return D.share.file({ name, bytes: new Uint8Array(await blob.arrayBuffer()) }); save(blob, name); return null; },
  printPage: async html => { const D = window.inquireDesktop; if (D && D.share && D.share.print) return D.share.print(html);
    const fr = document.createElement("iframe"); fr.style.cssText = "position:fixed;width:0;height:0;border:0;left:-10px"; fr.srcdoc = html; document.body.appendChild(fr);
    await new Promise(r => fr.onload = r); try { fr.contentWindow.print(); } catch (e) {} setTimeout(() => fr.remove(), 60000); return true; }
};
function mailURL(n, extra) {
  const N = window.InquireNotes, words = N.toText(n.html || "").replace(/\n{3,}/g, "\n\n").trim();
  let body = words.length > MAIL_MAX ? words.slice(0, MAIL_MAX).replace(/\s+\S*$/, "") + "\n\n[…] The note goes on: " + (extra || "the full note is in NotePath.") : words;
  if (extra && words.length <= MAIL_MAX) body += "\n\n" + extra;
  return "mailto:?subject=" + encodeURIComponent(n.title || "Note") + "&body=" + encodeURIComponent(body + "\n\n— Sent from NotePath");
}
async function email(id, o = {}) {
  const N = window.InquireNotes, n = N.get(id); if (!n) throw new Error("Pick a note first.");
  let file = null, where = null;
  if (o.pdf) {
    const r = await exportNotes("note", "pdf", { note: id, noSave: true });
    if (r.printed) return { printed: true }; // the browser build: the print window is open, Save as PDF there
    file = r.file; where = await hooks.keepFile(r.file, r.blob);
  }
  await hooks.openMail(mailURL(n, file ? `see the PDF “${file}”, attached.` : ""));
  return { file, where };
}
async function printNote(id) {
  const N = window.InquireNotes; if (!N.get(id)) throw new Error("Pick a note first.");
  const r = await exportNotes("note", "html", { note: id, noSave: true });
  const page = (await r.blob.text()).replace("</head>", "<style>@media print{body{margin:0}}</style></head>");
  await hooks.printPage(page); return true;
}
// PDF: the desktop app prints the page to a PDF file (main.js export:pdf); the browser preview opens the print dialog instead
async function pdf(page) {
  const D = window.inquireDesktop;
  if (D && D.exportPDF) { const bytes = await D.exportPDF(page); if (!bytes) throw new Error("The PDF could not be made."); return new Blob([bytes], { type: "application/pdf" }); }
  const fr = document.createElement("iframe"); fr.style.cssText = "position:fixed;width:0;height:0;border:0;left:-10px"; fr.srcdoc = page; document.body.appendChild(fr);
  await new Promise(r => fr.onload = r); try { fr.contentWindow.print(); } catch (e) {} setTimeout(() => fr.remove(), 60000);
  return null;
}

/* ---------- importers: each turns a file into { title, html, created?, updated?, fav?, tags? } (html is sanitised when the note is made) ---------- */
const LANGMAP = { py: "python", python: "python", js: "javascript", javascript: "javascript", ts: "javascript", typescript: "javascript", jsx: "javascript", c: "c", h: "c", cpp: "cpp", "c++": "cpp", cc: "cpp", hpp: "cpp", java: "java", html: "html", xml: "html", css: "css", sql: "sql" };
const codeWidget = (lang, src, title) => `<div class="nw" data-w="code" data-src="${esc(JSON.stringify({ lang: LANGMAP[String(lang || "").toLowerCase()] || "text", title: title || "", src: String(src || "") }))}"></div>`;
const WL = "wl0link"; // placeholder note id for [[links]] until every imported note has its id
function mdInline(s, ctx) {
  const keep = []; const hold = h => "\u0000" + (keep.push(h) - 1) + "\u0000";
  s = s.replace(/`([^`]+)`/g, (m, c) => hold(`<span data-f="mono">${esc(c)}</span>`));
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, f) => hold(ctx.img(f.trim(), "")));
  s = s.replace(/!\[([^\]]*)\]\(<?([^)>\s]+)>?(?:\s+"[^"]*")?\)/g, (m, alt, src) => hold(ctx.img(src, alt)));
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (m, t, a) => hold(ctx.link(t.trim(), (a || t).trim())));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, t, u) => { const local = !/^[a-z]+:/i.test(u) && /\.md$/i.test(decodeURIComponent(u.split("#")[0])); return hold(local ? ctx.link(decodeURIComponent(u.split("#")[0]).replace(/^.*\//, "").replace(/\.md$/i, ""), t) : esc(t) + (/^https?:/.test(u) ? ` (${esc(u)})` : "")); });
  s = s.replace(/<u>(.*?)<\/u>/g, (m, t) => "\u0001u" + t + "\u0001/u");
  s = esc(s.replace(/\\([\\`*_{}\[\]()#+\-.!~>|])/g, (m, c) => hold(esc(c))));
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<b>$1</b>").replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<i>$2</i>").replace(/(^|\W)_(?!\s)(.+?)_(?!\w)/g, "$1<i>$2</i>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>").replace(/==(.+?)==/g, '<span data-c="#F2B84B">$1</span>').replace(/\u0001u/g, "<u>").replace(/\u0001\/u/g, "</u>");
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
function mdToHTML(md, ctx) {
  const L = md.replace(/\r\n?/g, "\n").split("\n"), out = []; let i = 0, title = null, meta = {};
  if (L[0] === "---") { const e = L.indexOf("---", 1); if (e > 0) { L.slice(1, e).forEach(l => { const m = l.match(/^(\w[\w-]*):\s*(.*)$/); if (m) meta[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, ""); }); i = e + 1; } }
  const stack = []; // open lists: { tag, indent } (the last item of each stays open, so a deeper list goes inside it)
  const closeTo = ind => { while (stack.length && stack[stack.length - 1].indent >= ind) out.push(`</li></${stack.pop().tag}>`); };
  const BLANK = "<div><br></div>", blockStart = () => { if (out[out.length - 1] === BLANK) out.pop(); };
  let firstText = true;
  for (; i < L.length; i++) {
    const line = L[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)(.*)$/);
    if (fence) { closeTo(0); blockStart(); const end = L.findIndex((x, j) => j > i && x.trim().startsWith(fence[1])); const body = L.slice(i + 1, end < 0 ? L.length : end).join("\n"); const t = (fence[3].match(/title="([^"]*)"/) || [])[1]; out.push(codeWidget(fence[2], body, t)); i = end < 0 ? L.length : end; firstText = false; continue; }
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[([ xX])\]\s+)?(.*)$/);
    if (li) {
      const ind = li[1].replace(/\t/g, "    ").length, ck = li[3] != null, tag = /\d/.test(li[2]) ? "ol" : "ul";
      if (!stack.length) blockStart();
      while (stack.length && stack[stack.length - 1].indent > ind) out.push(`</li></${stack.pop().tag}>`);
      const top = stack[stack.length - 1], want = ck ? "ul" : tag, open = () => { out.push(ck ? `<ul data-ck="1">` : `<${tag}>`); stack.push({ tag: want, indent: ind, ck }); };
      if (!top || top.indent < ind) open();
      else if (top.tag !== want || !!top.ck !== ck) { out.push(`</li></${stack.pop().tag}>`); open(); }
      else out.push("</li>");
      out.push(`<li${ck && /x/i.test(li[4]) ? ` data-done="1"` : ""}>${mdInline(li[5], ctx)}`); firstText = false; continue;
    }
    closeTo(0);
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { if (firstText && h[1].length === 1 && !title) { title = h[2]; firstText = false; continue; } blockStart(); const ht = ["h1", "h2", "h3", "h4"][Math.min(h[1].length, 4) - 1]; out.push(`<${ht}>${mdInline(h[2], ctx)}</${ht}>`); firstText = false; continue; }
    if (/^\s*>/.test(line)) { blockStart(); const q = []; while (i < L.length && /^\s*>/.test(L[i])) q.push(L[i++].replace(/^\s*>\s?/, "")); i--; out.push(`<blockquote>${q.map(x => mdInline(x, ctx)).join("<br>")}</blockquote>`); firstText = false; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<div><br></div>"); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) { if (/^\s*\|?\s*:?-+/.test(line.replace(/\|/g, ""))) continue; out.push(`<div>${mdInline(line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()).join("  ·  "), ctx)}</div>`); continue; }
    if (!line.trim()) { if (out.length && /^<div>(?!<br>)/.test(out[out.length - 1])) out.push(BLANK); continue; } // a blank line only shows between lines of text
    out.push(`<div>${mdInline(line.replace(/ {2,}$/, ""), ctx)}</div>`); firstText = false;
  }
  closeTo(0);
  while (out.length && out[0] === "<div><br></div>") out.shift(); while (out.length && out[out.length - 1] === "<div><br></div>") out.pop();
  return { title: title || meta.title || null, html: out.join(""), created: Date.parse(meta.created || meta.date || "") || null, updated: Date.parse(meta.updated || meta.modified || "") || null, fav: /^(true|yes)$/i.test(meta.favourite || meta.favorite || "") };
}
// web pages (Google Docs, Notion, any HTML): styles → bold / italic / colours, headings → h3, code → code boxes, photos kept
async function htmlToNote(text, ctx) {
  const doc = new DOMParser().parseFromString(text, "text/html"), body = doc.body || doc.documentElement;
  body.querySelectorAll("script,style,noscript,iframe,head,meta,link,title,p.meta").forEach(x => x.remove());
  // checkboxes outside a list (NotePath's own web pages, other apps) → a checklist
  body.querySelectorAll("input[type=checkbox]").forEach(cb => { if (cb.closest("li")) return; const blk = cb.closest("div,p") || cb.parentElement; if (!blk || blk === body) { cb.remove(); return; }
    const li = doc.createElement("li"); if (cb.checked || cb.hasAttribute("checked")) li.setAttribute("data-done", "1"); cb.remove(); li.innerHTML = blk.innerHTML.trim();
    const prev = blk.previousElementSibling; if (prev && prev.tagName === "UL" && prev.getAttribute("data-ck") === "1") { prev.appendChild(li); blk.remove(); } else { const ul = doc.createElement("ul"); ul.setAttribute("data-ck", "1"); ul.appendChild(li); blk.replaceWith(ul); } });
  let title = (doc.querySelector("title") || {}).textContent || null;
  const h1 = body.querySelector("h1"); if (h1 && (!title || h1.textContent.trim() === title.trim() || body.firstElementChild === h1)) { title = h1.textContent.trim(); h1.remove(); }
  body.querySelectorAll("pre").forEach(p => { const c = p.querySelector("code"), lang = c && (c.className.match(/language-([\w+#-]+)/) || [])[1]; const t = document.createElement("template"); t.innerHTML = codeWidget(lang, p.textContent); p.replaceWith(t.content); });
  body.querySelectorAll("h1,h2,h4,h5,h6").forEach(h => { const n = doc.createElement("h3"); n.innerHTML = h.innerHTML; h.replaceWith(n); });
  body.querySelectorAll("[style]").forEach(el => { const st = el.getAttribute("style") || ""; let inner = el.innerHTML;
    if (/font-weight:\s*(bold|[6-9]00)/i.test(st)) inner = `<b>${inner}</b>`; if (/font-style:\s*italic/i.test(st)) inner = `<i>${inner}</i>`; if (/text-decoration[^;]*underline/i.test(st)) inner = `<u>${inner}</u>`; if (/text-decoration[^;]*line-through/i.test(st)) inner = `<s>${inner}</s>`;
    if (/font-family:[^;]*mono|font-family:[^;]*(courier|consolas|menlo)/i.test(st)) inner = `<span data-f="mono">${inner}</span>`;
    const col = (st.match(/(?:^|;)\s*color:\s*([^;]+)/i) || [])[1]; if (col && !/^(#000|#000000|black|rgb\(0,\s*0,\s*0\)|inherit|windowtext)$/i.test(col.trim())) inner = `<font color="${esc(col.trim())}">${inner}</font>`;
    const bg = cssHex((st.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/i) || [])[1]); if (bg && bg !== "#ffffff" && !/^(DIV|P|H\d|LI|UL|OL|BLOCKQUOTE|BODY|TD|TR|TABLE)$/.test(el.tagName)) inner = `<span data-h="${bg}">${inner}</span>`; // highlights (v0.5.4)
    const ta = (st.match(/(?:^|;)\s*text-align:\s*(left|center|right)/i) || [])[1]; if (ta && /^(DIV|P|H\d|LI|BLOCKQUOTE)$/.test(el.tagName)) el.setAttribute("data-al", ta.toLowerCase());
    el.innerHTML = inner; el.removeAttribute("style"); });
  body.querySelectorAll("input[type=checkbox]").forEach(cb => { const li = cb.closest("li"); if (li) { if (cb.checked || cb.hasAttribute("checked")) li.setAttribute("data-done", "1"); const ul = li.parentElement; if (ul) ul.setAttribute("data-ck", "1"); } cb.remove(); });
  body.querySelectorAll("table").forEach(tb => { const d = doc.createElement("div"); d.innerHTML = [...tb.rows].map(r => `<div>${[...r.cells].map(c => esc(c.textContent.trim())).join("  ·  ")}</div>`).join(""); tb.replaceWith(d); });
  body.querySelectorAll("a").forEach(a => { const href = a.getAttribute("href") || "", local = !/^[a-z]+:/i.test(href) && /\.(md|html?)$/i.test(href.split("#")[0]);
    if (local) { const t = document.createElement("template"); t.innerHTML = ctx.link(decodeURIComponent(href.split("#")[0]).replace(/^.*\//, "").replace(/\.(md|html?)$/i, ""), a.textContent); a.replaceWith(t.content); }
    else if (/^https?:/.test(href) && a.textContent.trim() && a.textContent.trim() !== href) a.replaceWith(doc.createTextNode(a.textContent + " (" + href + ")")); });
  for (const im of [...body.querySelectorAll("img")]) { const t = document.createElement("template"); t.innerHTML = await ctx.imgAsync(im.getAttribute("src") || "", im.getAttribute("alt") || ""); im.replaceWith(t.content); }
  body.querySelectorAll("p").forEach(p => { const d = doc.createElement("div"); d.innerHTML = p.innerHTML || "<br>"; if (p.hasAttribute("data-al")) d.setAttribute("data-al", p.getAttribute("data-al")); p.replaceWith(d); });
  return { title, html: body.innerHTML };
}
// a CSS colour (#abc, #aabbcc, rgb()) → #aabbcc, or "" (v0.5.4)
const cssHex = v => { v = String(v || "").trim().toLowerCase(); if (/^#[0-9a-f]{3}$/.test(v)) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]; const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); if (m) { if (m[4] != null && +m[4] === 0) return ""; v = "#" + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join(""); } return /^#[0-9a-f]{6}$/.test(v) ? v : ""; };
// Word's named highlight colours (v0.5.4)
const WHL = { yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000", darkblue: "#000080", darkcyan: "#008080", darkgreen: "#008000", darkmagenta: "#800080", darkred: "#800000", darkyellow: "#808000", darkgray: "#808080", lightgray: "#c0c0c0", black: "#000000" };
// Word (.docx): paragraphs, headings, lists, bold / italic / underline / strike / colour, line breaks, tables, photos
async function docxToNote(bytes, ctx) {
  const files = await unzip(new Blob([bytes])), get = n => files.find(f => f.name === n);
  const xml = async n => { const f = get(n); return f ? new DOMParser().parseFromString(await f.text(), "application/xml") : null; };
  const doc = await xml("word/document.xml"); if (!doc) throw new Error("not a Word document");
  const rels = await xml("word/_rels/document.xml.rels"), numx = await xml("word/numbering.xml"), core = await xml("docProps/core.xml");
  const rel = {}; if (rels) [...rels.getElementsByTagName("Relationship")].forEach(r => { rel[r.getAttribute("Id")] = r.getAttribute("Target"); });
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", A = (el, n) => el.getAttributeNS(W, n) || el.getAttribute("w:" + n);
  const kids = (el, n) => [...el.childNodes].filter(c => c.nodeType === 1 && c.localName === n), kid = (el, n) => kids(el, n)[0];
  const fmt = {}; // numId → ilvl → bullet / decimal
  if (numx) { const abs = {}; [...numx.getElementsByTagNameNS(W, "abstractNum")].forEach(a => { abs[A(a, "abstractNumId")] = {}; kids(a, "lvl").forEach(l => { const f = kid(l, "numFmt"); abs[A(a, "abstractNumId")][A(l, "ilvl")] = f ? A(f, "val") : "bullet"; }); });
    [...numx.getElementsByTagNameNS(W, "num")].forEach(n => { const a = kid(n, "abstractNumId"); fmt[A(n, "numId")] = a ? abs[A(a, "val")] || {} : {}; }); }
  const runHTML = async r => {
    let h = "";
    for (const c of [...r.childNodes].filter(x => x.nodeType === 1)) {
      if (c.localName === "t") h += esc(c.textContent); else if (c.localName === "tab") h += "    "; else if (c.localName === "br" || c.localName === "cr") h += "<br>";
      else if (c.localName === "drawing" || c.localName === "pict") { const blip = c.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip")[0] || c.getElementsByTagName("v:imagedata")[0];
        const id = blip && (blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed") || blip.getAttribute("r:id"));
        const target = id && rel[id], f = target && get("word/" + target.replace(/^\/?word\//, "").replace(/^\.\//, ""));
        if (f) h += await ctx.imgBytes(await f.bytes(), f.name); }
    }
    const pr = kid(r, "rPr"); if (pr && h) { const on = n => { const e = kid(pr, n); return e && !/^(0|false|none)$/.test(A(e, "val") || ""); };
      const col = kid(pr, "color"), cv = col && A(col, "val");
      if (cv && /^[0-9a-f]{6}$/i.test(cv) && cv !== "000000") h = `<font color="#${cv}">${h}</font>`;
      const shd = kid(pr, "shd"), hi = kid(pr, "highlight"), fill = shd && A(shd, "fill"), hv = hi && WHL[(A(hi, "val") || "").toLowerCase()];
      const hx = fill && /^[0-9a-f]{6}$/i.test(fill) && !/^(ffffff|auto)$/i.test(fill) ? "#" + fill.toLowerCase() : hv; if (hx) h = `<span data-h="${hx}">${h}</span>`; if (on("strike")) h = `<s>${h}</s>`; if (on("u")) h = `<u>${h}</u>`; if (on("i")) h = `<i>${h}</i>`; if (on("b")) h = `<b>${h}</b>`; }
    return h; };
  const paraHTML = async p => { let h = ""; for (const c of [...p.childNodes].filter(x => x.nodeType === 1)) { if (c.localName === "r") h += await runHTML(c); else if (c.localName === "hyperlink" || c.localName === "ins" || c.localName === "smartTag") for (const r of kids(c, "r")) h += await runHTML(r); } return h; };
  const out = []; let list = []; let title = null, code = [];
  const flushCode = () => { if (code.length) { out.push(codeWidget("text", code.join("\n"))); code = []; } };
  const flushList = () => { if (!list.length) return; let html = ""; const tags = [];
    list.forEach(x => { const want = Math.max(0, x.lvl) + 1;
      if (!tags.length || want > tags.length) { while (tags.length < want) { html += `<${x.tag}>`; tags.push(x.tag); } }
      else { html += "</li>"; while (tags.length > want) html += `</${tags.pop()}></li>`; if (tags[tags.length - 1] !== x.tag) { html += `</${tags.pop()}><${x.tag}>`; tags.push(x.tag); } }
      html += `<li>${x.html}`; });
    html += "</li>"; while (tags.length) { html += `</${tags.pop()}>`; if (tags.length) html += "</li>"; } out.push(html); list = []; };
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  for (const el of [...body.childNodes].filter(x => x.nodeType === 1)) {
    if (el.localName === "tbl") { flushList(); flushCode(); for (const tr of kids(el, "tr")) { const cells = []; for (const tc of kids(tr, "tc")) { let t = ""; for (const p of kids(tc, "p")) t += (t ? " " : "") + await paraHTML(p); cells.push(t); } out.push(`<div>${cells.join("  ·  ")}</div>`); } continue; }
    if (el.localName !== "p") continue;
    const pPr = kid(el, "pPr"), sty = pPr && kid(pPr, "pStyle"), style = sty ? A(sty, "val") : "", np = pPr && kid(pPr, "numPr");
    let html = await paraHTML(el);
    const jc = pPr && kid(pPr, "jc"), jv = jc && A(jc, "val"), al = jv === "center" ? "center" : jv === "right" || jv === "end" ? "right" : "", alA = al ? ` data-al="${al}"` : ""; // Word's alignment (v0.5.4)
    if (/^(code|HTMLPreformatted|SourceCode|PlainText)$/i.test(style)) { flushList(); code.push(el.textContent); continue; } else flushCode();
    if (np) { const nid = kid(np, "numId"), il = kid(np, "ilvl"), id = nid ? A(nid, "val") : "0", lvl = il ? +A(il, "val") : 0; if (id !== "0") { const f = (fmt[id] || {})[String(lvl)]; list.push({ lvl, tag: f && f !== "bullet" && f !== "none" ? "ol" : "ul", html }); continue; } }
    if (/^ListBullet|^ListNumber/i.test(style)) { list.push({ lvl: +(style.match(/(\d)$/) || [0, 1])[1] - 1, tag: /Number/i.test(style) ? "ol" : "ul", html }); continue; }
    const cbm = html.match(/^(?:<[^>]+>)*([☐☑☒])\s*/); // NotePath's own checklists in Word: ☐ / ☒
    if (cbm) { flushList(); const item = `<li${cbm[1] !== "☐" ? ` data-done="1"` : ""}>${html.replace(/[☐☑☒]\s*/, "").replace(/<\/?s>/g, "")}</li>`; const last = out[out.length - 1]; if (last && /^<ul data-ck="1">/.test(last)) out[out.length - 1] = last.replace(/<\/ul>$/, item + "</ul>"); else out.push(`<ul data-ck="1">${item}</ul>`); continue; }
    flushList();
    if (/^title$/i.test(style) && !title && !out.length) { title = html.replace(/<[^>]+>/g, "").trim() || null; continue; }
    if (/^title$/i.test(style)) out.push(`<h1${alA}>${html}</h1>`);
    else if (/^subtitle$/i.test(style)) out.push(`<h6${alA}>${html}</h6>`);
    else if (/^heading/i.test(style)) { const lv = +(style.match(/(\d)/) || [0, 2])[1], tg = lv <= 1 ? "h2" : lv === 2 ? "h3" : "h4"; out.push(`<${tg}${alA}>${html}</${tg}>`); }
    else if (/quote/i.test(style)) out.push(`<blockquote${alA}>${html}</blockquote>`);
    else out.push(`<div${alA}>${html || "<br>"}</div>`);
  }
  flushList(); flushCode();
  const ct = core && core.getElementsByTagName("dc:title")[0];
  return { title: title || (ct && ct.textContent.trim()) || null, html: out.join(""), created: core && Date.parse((core.getElementsByTagName("dcterms:created")[0] || {}).textContent || "") || null };
}
// Evernote / Apple Notes exports (.enex): every note, its photos (by md5) and checkboxes
async function enexToNotes(text, ctx) {
  const x = new DOMParser().parseFromString(text, "application/xml"); if (x.getElementsByTagName("parsererror").length) throw new Error("not an Evernote export");
  const ed = s => { const m = String(s || "").match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
  const out = [];
  for (const n of [...x.getElementsByTagName("note")]) {
    const res = {};
    for (const r of [...n.getElementsByTagName("resource")]) { const d = r.getElementsByTagName("data")[0]; if (!d) continue; const bytes = unb64(d.textContent), mime = (r.getElementsByTagName("mime")[0] || {}).textContent || "application/octet-stream"; res[md5(bytes)] = { bytes, mime, name: ((r.getElementsByTagName("file-name")[0] || {}).textContent) || "file" }; }
    const content = (n.getElementsByTagName("content")[0] || {}).textContent || "";
    const doc = new DOMParser().parseFromString(content.replace(/<\?xml[^>]*>/, "").replace(/<!DOCTYPE[^>]*>/, "").replace(/<(en-todo|en-media|en-crypt)([^>]*?)\/>/g, "<$1$2></$1>"), "text/html"), body = doc.body;
    for (const m of [...body.querySelectorAll("en-media")]) { const r = res[(m.getAttribute("hash") || "").toLowerCase()]; const t = document.createElement("template"); t.innerHTML = r && /^image\//.test(r.mime) ? await ctx.imgBytes(r.bytes, r.name, r.mime) : r ? `<div>[${esc(r.name)}]</div>` : ""; m.replaceWith(t.content); }
    // <div><en-todo checked="true"/>Buy milk</div> runs → a checklist
    body.querySelectorAll("en-todo").forEach(td => { const blk = td.closest("div,p,li") || td.parentElement; const li = doc.createElement("li"); if (/true/i.test(td.getAttribute("checked") || "")) li.setAttribute("data-done", "1"); td.remove(); li.innerHTML = blk.innerHTML;
      const prev = blk.previousElementSibling; if (prev && prev.tagName === "UL" && prev.getAttribute("data-ck") === "1") { prev.appendChild(li); blk.remove(); } else { const ul = doc.createElement("ul"); ul.setAttribute("data-ck", "1"); ul.appendChild(li); blk.replaceWith(ul); } });
    const h = await htmlToNote("<body>" + body.innerHTML + "</body>", ctx);
    out.push({ title: (n.getElementsByTagName("title")[0] || {}).textContent || "Untitled note", html: h.html, created: ed((n.getElementsByTagName("created")[0] || {}).textContent), updated: ed((n.getElementsByTagName("updated")[0] || {}).textContent),
      tags: [...n.getElementsByTagName("tag")].map(t => t.textContent) });
  }
  return out;
}
// Google Keep (Google Takeout → Keep → one .json per note)
async function keepToNote(j, ctx) {
  if (j.isTrashed) return null;
  let html = "";
  if (j.textContent) html += j.textContent.split("\n").map(l => `<div>${l ? esc(l) : "<br>"}</div>`).join("");
  if (Array.isArray(j.listContent) && j.listContent.length) html += `<ul data-ck="1">${j.listContent.map(x => `<li${x.isChecked ? ` data-done="1"` : ""}>${esc(x.text || "")}</li>`).join("")}</ul>`;
  for (const a of j.attachments || []) if (/^image\//.test(a.mimetype || "")) html += await ctx.imgAsync(a.filePath, "");
  const us = v => v ? Math.round(v / 1000) : null;
  return { title: j.title || (j.textContent || "").split("\n")[0].slice(0, 80) || "Keep note", html, created: us(j.createdTimestampUsec), updated: us(j.userEditedTimestampUsec), fav: !!j.isPinned, label: (j.labels || [])[0] && j.labels[0].name };
}

/* ---------- import: files / a folder / zips → notes and folders ---------- */
const NOTION_ID = /\s[0-9a-f]{32}$/i, cleanName = s => s.replace(/\.[^.\/]+$/, "").replace(NOTION_ID, "").trim();
const SKIP = /(^|\/)(\.obsidian|\.trash|\.git|__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/i;
const NOTE_EXT = /\.(md|markdown|txt|html?|docx|enex|json)$/i;
// items: [{ path ("Vault/Projects/Idea.md"), bytes(), text(), size }] (zips are opened; a zip's own name becomes a folder)
async function gather(files, T) {
  const items = [];
  for (const f of files) {
    if (T && /\.zip$/i.test(f.name)) { T.tick("read", 0, "Opening " + f.name); await T.yield(); }
    const path = String(f.webkitRelativePath || f.relPath || f.name).replace(/\\/g, "/");
    if (/\.zip$/i.test(f.name)) {
      const ents = await unzip(f), stem = f.name.replace(/\.zip$/i, "");
      const tops = new Set(ents.map(e => e.name.split("/")[0])), single = tops.size === 1 && ents.every(e => e.name.includes("/"));
      ents.forEach(e => items.push({ path: (path.includes("/") ? path.replace(/[^/]+$/, "") : "") + (single ? e.name : stem + "/" + e.name), bytes: e.bytes, text: e.text, size: e.size, zip: true }));
    } else items.push({ path, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()), text: () => f.text(), file: f });
    if (T) { T.tick("read", f.size || 0); await T.yield(); }
  }
  return items.filter(x => !SKIP.test(x.path));
}
async function importFiles(files, o = {}) {
  // (v0.5.8) progress: the size is the files picked; a .zip is read first, then each note (and the photos it brings in)
  const size = files.reduce((a, f) => a + (f.size || 0), 0), zipped = files.some(f => /\.zip$/i.test(f.name));
  const T = track(o.onProgress, size, zipped ? [["read", .25], ["notes", .75]] : [["notes", 1]]);
  if (zipped) T.begin("read", files.filter(f => /\.zip$/i.test(f.name)).reduce((a, f) => a + (f.size || 0), 0) + files.filter(f => !/\.zip$/i.test(f.name)).length, "Reading the files");
  const N = NS(), items = await gather(files, zipped ? T : null), report = { notes: 0, folders: 0, photos: 0, skipped: [], made: [] };
  let photoBytes = 0;
  const byPath = new Map(items.map(it => [it.path.toLowerCase(), it])), byBase = new Map();
  items.forEach(it => { const b = it.path.split("/").pop().toLowerCase(); if (!byBase.has(b)) byBase.set(b, it); });
  const findFile = (src, from) => { if (!src || /^[a-z]+:/i.test(src)) return null; let p = decodeURIComponent(src.split(/[?#]/)[0]); const dir = from.split("/").slice(0, -1);
    const parts = (p.startsWith("/") ? p.slice(1).split("/") : dir.concat(p.split("/"))), norm = []; parts.forEach(x => { if (x === "..") norm.pop(); else if (x && x !== ".") norm.push(x); });
    return byPath.get(norm.join("/").toLowerCase()) || byBase.get(p.split("/").pop().toLowerCase()) || null; };
  const stored = new Map(); // a photo used by several notes is stored once
  const storeBytes = async (bytes, name, mime) => { const type = mime || ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" })[(name.match(/\.(\w+)$/) || [])[1] && name.match(/\.(\w+)$/)[1].toLowerCase()];
    if (!/^image\//.test(type || "")) return null; const id = await N.putImage(new Blob([bytes], { type })); report.photos++; photoBytes += bytes.length || 0; return id; };
  const ctxFor = it => {
    const pend = [];
    const imgTag = (id, alt) => id ? `<img data-img="${id}" alt="${esc(alt || "")}">` : "";
    const fromFile = async (src, alt) => {
      if (/^https:\/\//i.test(src)) return `<img src="${esc(src)}" alt="${esc(alt)}">`;
      const du = src.match(/^data:(image\/[\w.+-]+);base64,(.*)$/i);
      if (du) { try { const id = await N.putImage(new Blob([unb64(du[2])], { type: du[1] })); report.photos++; return imgTag(id, alt); } catch (e) { return ""; } }
      const f = findFile(src, it.path); if (!f) return alt ? `[${esc(alt)}]` : "";
      if (!stored.has(f.path)) stored.set(f.path, storeBytes(await f.bytes(), f.path)); return imgTag(await stored.get(f.path), alt); };
    return {
      img: (src, alt) => { const k = "\u0002img" + pend.length + "\u0002"; pend.push(fromFile(src, alt)); return k; },
      imgAsync: fromFile,
      imgBytes: async (bytes, name, mime) => imgTag(await storeBytes(bytes, name, mime), ""),
      link: (title, text) => `<a class="nlink" data-note="${WL}" data-wl="${esc(title)}">${esc(text)}</a>`,
      done: async html => { const r = await Promise.all(pend); return html.replace(/\u0002img(\d+)\u0002/g, (m, i) => r[+i] || ""); }
    };
  };
  // folders: one per directory in the path, under the folder chosen (the structure is kept)
  const fmap = new Map(), under = o.folder || null;
  const folderFor = dirs => { let parent = under, key = "";
    for (const d of dirs) { key += "/" + d.toLowerCase(); if (!fmap.has(key)) { const f = N.addFolder(cleanName(d) || d, parent); fmap.set(key, f.id); report.folders++; } parent = fmap.get(key); }
    return parent; };
  const made = []; // { id, html, wl titles }
  const add = (it, n, dirs) => {
    const folder = folderFor(dirs), title = (n.title || cleanName(it.path.split("/").pop()) || "Untitled note").slice(0, 140);
    const note = N.create({ title, html: "", folder, fav: !!n.fav });
    made.push({ id: note.id, html: n.html, created: n.created, updated: n.updated, title, path: it.path }); report.notes++;
  };
  const notePaths = items.filter(it => NOTE_EXT.test(it.path));
  items.filter(it => !NOTE_EXT.test(it.path) && !/\.(png|jpe?g|gif|webp|svg|bmp|css|js|csv|ico)$/i.test(it.path)).forEach(it => report.skipped.push(it.path.split("/").pop() + (/\.pdf$/i.test(it.path) ? " (PDF import: coming soon)" : /\.(one|onepkg)$/i.test(it.path) ? " (OneNote: connect Microsoft in a later update)" : /\.(rtf|pages|doc)$/i.test(it.path) ? " (save it as .docx first)" : "")));
  const IMG = /\.(png|jpe?g|gif|webp|svg|bmp)$/i, work = notePaths.reduce((a, it) => a + (it.size || 0), 0) + items.filter(it => IMG.test(it.path)).reduce((a, it) => a + (it.size || 0), 0);
  T.begin("notes", work || 1, notePaths.length ? `Reading ${notePaths.length} file${notePaths.length === 1 ? "" : "s"}` : "Nothing to import");
  let ii = 0;
  for (const it of notePaths) {
    ii++; T.tick("notes", 0, `File ${ii} of ${notePaths.length}: ${it.path.split("/").pop()}`); photoBytes = 0;
    const dirs = it.path.split("/").slice(0, -1), ext = (it.path.match(/\.(\w+)$/) || [])[1].toLowerCase();
    try {
      if (ext === "md" || ext === "markdown") { const c = ctxFor(it), r = mdToHTML(await it.text(), c); r.html = await c.done(r.html); add(it, r, dirs); }
      else if (ext === "txt") { const t = (await it.text()).replace(/\s+$/, ""); add(it, { html: t.replace(/\r\n?/g, "\n").split("\n").map(l => `<div>${l ? esc(l) : "<br>"}</div>`).join("") }, dirs); }
      else if (ext === "html" || ext === "htm") { const c = ctxFor(it), r = await htmlToNote(await it.text(), c); add(it, r, dirs); }
      else if (ext === "docx") { const c = ctxFor(it), r = await docxToNote(await it.bytes(), c); add(it, r, dirs); }
      else if (ext === "enex") { const c = ctxFor(it), list = await enexToNotes(await it.text(), c), nb = cleanName(it.path.split("/").pop());
        list.forEach(n => add(it, n, notePaths.length > 1 || list.length > 1 ? dirs.concat(nb) : dirs)); }
      else if (ext === "json") {
        let j = null; try { j = JSON.parse(await it.text()); } catch (e) {}
        if (j && j.app === "NotePath") { report.skipped.push(it.path.split("/").pop() + " (a NotePath backup: restore it in Settings › Data & backups)"); continue; }
        if (!j || (j.textContent == null && !Array.isArray(j.listContent))) continue; // other JSON (Keep's Labels.txt etc.) is not a note
        const c = ctxFor(it), n = await keepToNote(j, c); if (!n) continue;
        const kd = dirs.map(d => /^keep$/i.test(d) ? "Google Keep" : d).filter(d => !/^takeout$/i.test(d)); add(it, n, n.label ? kd.concat(n.label) : kd);
      }
    } catch (e) { report.skipped.push(it.path.split("/").pop() + " (" + (e.message || "could not be read") + ")"); }
    T.tick("notes", (it.size || 0) + photoBytes); await T.yield();
  }
  // links between the imported notes ([[Title]], [text](Other.md)) now that every note has its id
  const tmap = new Map(); made.forEach(m => { tmap.set(m.title.toLowerCase(), m.id); tmap.set(cleanName(m.path.split("/").pop()).toLowerCase(), m.id); });
  made.forEach(m => {
    const html = String(m.html || "").replace(/<a class="nlink" data-note="wl0link" data-wl="([^"]*)">([\s\S]*?)<\/a>/g, (x, t, txt) => { const id = tmap.get(t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").toLowerCase()); return id ? `<a class="nlink" data-note="${id}">${txt}</a>` : txt; });
    const patch = { html, quiet: true }; if (m.created) patch.created = m.created; patch.updated = m.updated || m.created || Date.now();
    N.update(m.id, patch);
  });
  report.made = made.map(m => m.id);
  T.done(`${report.notes} note${report.notes === 1 ? "" : "s"} · ${fmtBytes(size)}`);
  return report;
}

/* ---------- the window: My notes › ⇅ Import / Export ---------- */
function open(o = {}) {
  const A = window.InquireApp, N = NS(); if (!A || !N) return;
  const w = A.modal("io", { title: "Import & Export", sub: "Notes to and from Word, Obsidian, Apple Notes, Evernote, Google, Notion…", cls: "io-win" });
  const all = N.list(), fs = N.folders(), cur = o.note && N.get(o.note), fid = o.folder || "all";
  const fname = fid === "fav" ? "Favourites" : fid === "none" ? "Unfiled" : (fs.find(f => f.id === fid) || {}).name;
  const fcount = pick("folder", { folder: fid }).notes.length;
  let scope = o.scope || (cur ? "note" : fid !== "all" ? "folder" : "all"), fmt = o.format || "md";
  w.body.innerHTML = `<div class="io">
    <section class="io-col"><h3 class="io-h">Export</h3>
      <div class="io-scope" role="radiogroup" aria-label="What to export">
        <button type="button" role="radio" data-s="note"${cur ? "" : " disabled"}><b>This note</b><small>${cur ? esc(cur.title) : "Open a note first"}</small></button>
        <button type="button" role="radio" data-s="folder"${fname && fcount ? "" : " disabled"}><b>This folder</b><small>${fname ? esc(fname) + " · " + fcount + " note" + (fcount === 1 ? "" : "s") : "Pick a folder first"}</small></button>
        <button type="button" role="radio" data-s="all"${all.length ? "" : " disabled"}><b>Everything</b><small>${all.length} note${all.length === 1 ? "" : "s"}, with their folders</small></button></div>
      <div class="io-fmts" role="radiogroup" aria-label="Format">${FORMATS.map(f => `<button type="button" role="radio" class="io-fmt" data-f="${f.k}"><span class="io-ext">.${f.ext}</span><b>${esc(f.name)}</b><small class="io-for">${esc(f.for)}</small><small>${esc(f.note)}</small></button>`).join("")}</div>
      <div class="io-go"><button type="button" class="btn good" data-a="export">Export</button><p class="io-msg" role="status" aria-live="polite"></p></div><div class="io-progx"></div></section>
    <section class="io-col"><h3 class="io-h">Import</h3>
      <div class="io-drop" tabindex="0" role="button" aria-label="Choose files to import">Drop files, a .zip or a whole folder here<br><small>or</small><span class="io-btns"><button type="button" class="btn-s" data-a="files">Choose files…</button><button type="button" class="btn-s" data-a="dir">Choose a folder…</button></span></div>
      <label class="io-into">Put them in <select class="io-sel" aria-label="Folder for imported notes"><option value="">Top level</option>${fs.map(f => `<option value="${f.id}"${f.id === fid ? " selected" : ""}>${"  ".repeat(f.depth)}${esc(f.name)}</option>`).join("")}</select></label>
      <ul class="io-works"><li><b>Obsidian</b> vault (pick its folder) or Markdown files, with [[links]] and attachments</li><li><b>Notion</b> export (.zip, Markdown &amp; CSV)</li><li><b>Word</b> and <b>Google Docs</b> (.docx; in Google Docs: File › Download › Word)</li>
        <li><b>Apple Notes</b> and <b>Evernote</b> (.enex), web pages (.html), plain text (.txt)</li><li><b>Google Keep</b> (Google Takeout .zip, or its .json files)</li><li class="io-soon">Coming later: PDF, and OneNote / Google Drive straight from your account</li></ul>
      <div class="io-progi"></div><p class="io-log" role="status" aria-live="polite"></p>
      <input type="file" class="io-fin" multiple accept=".md,.markdown,.txt,.html,.htm,.docx,.enex,.json,.zip" hidden><input type="file" class="io-din" webkitdirectory multiple hidden></section></div>`;
  const b = w.body, msg = $(".io-msg", b), log = $(".io-log", b);
  const px = progUI($(".io-progx", b), "Export progress"), pi = progUI($(".io-progi", b), "Import progress");
  const paint = () => { b.querySelectorAll("[data-s]").forEach(x => x.setAttribute("aria-checked", String(x.dataset.s === scope))); b.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-checked", String(x.dataset.f === fmt)));
    const n = pick(scope, { note: o.note, folder: fid }).notes.length; $('[data-a="export"]', b).textContent = `Export ${n} note${n === 1 ? "" : "s"} as ${FORMATS.find(f => f.k === fmt).name}`; };
  b.querySelectorAll("[data-s]").forEach(x => x.onclick = () => { scope = x.dataset.s; paint(); });
  b.querySelectorAll("[data-f]").forEach(x => x.onclick = () => { fmt = x.dataset.f; paint(); });
  paint();
  $('[data-a="export"]', b).onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true; msg.className = "io-msg"; msg.textContent = "Exporting…";
    px.start("Exporting as " + FORMATS.find(f => f.k === fmt).name);
    try { const r = await exportNotes(scope, fmt, { note: o.note, folder: fid, onProgress: p => px.paint(p) }); msg.classList.add("ok");
      px.end(true, r.printed ? "Ready to print" : "Export finished");
      msg.textContent = r.printed ? "Choose “Save as PDF” in the print window." : `Saved ${r.file} (${r.count} note${r.count === 1 ? "" : "s"}, ${fmtBytes(r.bytes)}).`; }
    catch (err) { px.end(false, "Export stopped"); msg.classList.add("bad"); msg.textContent = err.message || "The export did not work."; }
    btn.disabled = false;
  };
  const fin = $(".io-fin", b), din = $(".io-din", b), drop = $(".io-drop", b);
  const run = async files => {
    if (!files.length) return; log.className = "io-log"; log.textContent = "Importing…";
    pi.start(`Importing ${files.length} file${files.length === 1 ? "" : "s"}`);
    try {
      const r = await importFiles(files, { folder: $(".io-sel", b).value || null, onProgress: p => pi.paint(p) });
      pi.end(!!r.notes, r.notes ? "Import finished" : "Nothing imported");
      log.classList.add(r.notes ? "ok" : "bad");
      log.innerHTML = (r.notes ? `Imported <b>${r.notes}</b> note${r.notes === 1 ? "" : "s"}${r.folders ? `, ${r.folders} folder${r.folders === 1 ? "" : "s"}` : ""}${r.photos ? `, ${r.photos} photo${r.photos === 1 ? "" : "s"}` : ""}.` : "Nothing to import there.")
        + (r.skipped.length ? `<br><span class="io-skip">Skipped: ${r.skipped.slice(0, 8).map(esc).join(", ")}${r.skipped.length > 8 ? ` and ${r.skipped.length - 8} more` : ""}</span>` : "");
      if (r.notes && o.onImported) o.onImported(r);
    } catch (err) { pi.end(false, "Import stopped"); log.classList.add("bad"); log.textContent = err.message || "The import did not work."; }
  };
  $('[data-a="files"]', b).onclick = e => { e.stopPropagation(); fin.click(); }; $('[data-a="dir"]', b).onclick = e => { e.stopPropagation(); din.click(); };
  drop.onclick = () => fin.click(); drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fin.click(); } };
  fin.onchange = () => { const f = [...fin.files]; fin.value = ""; run(f); }; din.onchange = () => { const f = [...din.files]; din.value = ""; run(f); };
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); }); drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", async e => { e.preventDefault(); drop.classList.remove("over"); run(await droppedFiles(e.dataTransfer)); });
}
// a dropped folder: walk it (webkitGetAsEntry) so its structure is kept
async function droppedFiles(dt) {
  const ents = [...dt.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!ents.some(x => x.isDirectory)) return [...dt.files];
  const out = [];
  const walk = async (en, path) => {
    if (en.isFile) { const f = await new Promise((res, rej) => en.file(res, rej)); f.relPath = path + en.name; out.push(f); return; }
    const rd = en.createReader(); let batch;
    do { batch = await new Promise((res, rej) => rd.readEntries(res, rej)); for (const c of batch) await walk(c, path + en.name + "/"); } while (batch.length);
  };
  for (const en of ents) await walk(en, "");
  return out;
}

window.NPIO = { open, exportNotes, track, fmtBytes, fmtTime, email, printNote, mailURL, hooks, importFiles, zip, unzip, md5, ir, toMD, toHTMLBody, toDOCX, toENEX, mdToHTML, htmlToNote, docxToNote, enexToNotes, keepToNote, FORMATS };
})();
