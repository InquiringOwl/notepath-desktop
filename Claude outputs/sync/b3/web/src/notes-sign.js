/* Signature widget (NotePath v0.5.8, Devon; Professional only: it is added from the Tool bar's Widgets):
   <div class="nw" data-w="sign" data-src='{"name","at","img","how","hash"}'>.
   Before signing: Draw (mouse, trackpad or pen), Type (your name in a handwriting font) or Photo (a picture of your
   signature: the paper is made see-through), the signer's name, "Remember my signature on this computer", Sign.
   Signing makes a PNG (navy ink, see-through, trimmed) kept in the notes' photo store (putImage; "img" in data-src, so it is
   deleted, undone and backed up with the note), the name, the date and time, and a fingerprint (SHA-256) of the note's
   words at that moment. Signed, it is locked: the picture, "Signed by … · date", and a seal that says whether the note's
   words are still the ones that were signed. Only ✕ (twice) takes it away. The remembered signature is a small data URL in
   notepath.signature (never in the notes' store, so tidying photos can't remove it). Exports show the picture and the line
   (io.js). This is a signature drawn in NotePath on this computer: no identity check or certificate. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const INK = "#1B2A57", SAVED = "notepath.signature";
const FONTS = [["flow", "Flowing", '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive'],
  ["classic", "Classic", '"Lucida Handwriting", "Apple Chancery", "Segoe Print", "Bradley Hand", cursive'],
  ["bold", "Bold", '"Brush Script MT", "Bradley Hand", "Segoe Script", "Marker Felt", cursive']];
const DEF = { name: "", at: 0, img: "", how: "", hash: "" };
const saved = () => { try { const o = JSON.parse(localStorage.getItem(SAVED) || "null"); return o && /^data:image\/png;base64,/.test(o.png || "") ? o : null; } catch (e) { return null; } };
const stamp = t => { const d = new Date(t), p = n => String(n).padStart(2, "0"), h = d.getHours() % 12 || 12;
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)} ${p(h)}:${p(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`; };
const line = d => `Signed by ${d.name || "(no name)"} · ${stamp(d.at)}`;
function text(d) { d = Object.assign({}, DEF, d || {}); return d.at ? "\n✍ " + line(d) + "\n" : "\n✍ Signature (not signed yet)\n"; }

// the note's words, without widgets (so the signature itself and other boxes don't change the fingerprint)
function noteWords(ed) {
  let t = ""; const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, { acceptNode: x => x.parentElement && x.parentElement.closest(".nw, .nann-layer, .np-ck") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let x; while ((x = tw.nextNode())) t += x.data + " ";
  return t.replace(/​/g, "").replace(/\s+/g, " ").trim();
}
async function fingerprint(s) {
  try { if (!crypto.subtle) return ""; const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); } catch (e) { return ""; }
}
// trim a canvas to its ink, with a little room
function trimmed(cv) {
  const g = cv.getContext("2d"), { width: W, height: H } = cv, px = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(W, H) * 0.02) + 4; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1; out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
const hostOf = el => el.closest(".nb-rich") || (el.parentElement && el.parentElement.closest('[contenteditable="true"]'));
const toBlob = cv => new Promise(res => cv.toBlob(res, "image/png"));
const dataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

function mount(el) {
  const read = () => { try { return Object.assign({}, DEF, JSON.parse(el.dataset.src || "{}")); } catch (e) { return Object.assign({}, DEF); } };
  const write = o => { el.dataset.src = JSON.stringify(o); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const d = read();
  if (d.at && d.img) return signedView(el, d);
  padView(el, read, write);
}

function signedView(el, d) {
  el.classList.add("ns-done");
  el.innerHTML = `<div class="nw-h"><span class="nw-tag ns-tag" aria-hidden="true">✍</span><span class="ns-ht">Signature</span><span class="ns-lock" title="Signed signatures are locked">🔒 Locked</span><button type="button" class="nw-b nw-del" data-a="del" title="Remove this signature" aria-label="Remove signature">✕</button></div>
    <div class="ns-card"><img class="ns-img" alt="Signature of ${esc(d.name)}"><div class="ns-rule"></div><p class="ns-by">${esc(line(d))}</p>
      <p class="ns-seal" role="status"><span class="ns-sealic" aria-hidden="true">✓</span> <span class="ns-sealt">Signed</span></p></div>`;
  const img = el.querySelector(".ns-img");
  if (window.InquireNotes) InquireNotes.imageURL(d.img).then(u => { if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement("p"), { className: "nw-vmiss", textContent: "This signature's picture is missing." })); });
  if (window.InquireWidgets && InquireWidgets.kit && InquireWidgets.kit.delButton) InquireWidgets.kit.delButton(el);
  // is the note still what was signed?
  const seal = el.querySelector(".ns-seal"), check = async () => {
    const ed = hostOf(el); if (!ed || !d.hash) { seal.querySelector(".ns-sealt").textContent = "Signed"; return; }
    const same = (await fingerprint(noteWords(ed))) === d.hash;
    seal.classList.toggle("bad", !same); seal.querySelector(".ns-sealic").textContent = same ? "✓" : "⚠";
    seal.querySelector(".ns-sealt").textContent = same ? "Signed · the note's words are as they were when signed" : "The note's words have changed since it was signed";
  };
  setTimeout(check, 0);
  setTimeout(() => { const e = hostOf(el); if (e && !e._nsWatch) { e._nsWatch = true; e.addEventListener("input", () => { clearTimeout(e._nsT); e._nsT = setTimeout(() => e.querySelectorAll(".nw[data-w=sign].ns-done").forEach(w => w._nsCheck && w._nsCheck()), 500); }); } }, 0);
  el._nsCheck = check;
}

function padView(el, read, write) {
  const sv = saved(); let how = sv ? "saved" : "draw", font = FONTS[0][0], photo = null, inked = false;
  el.classList.remove("ns-done");
  el.innerHTML = `<div class="nw-h"><span class="nw-tag ns-tag" aria-hidden="true">✍</span><span class="ns-ht">Signature</span><span class="ns-hint">Not signed yet</span><button type="button" class="nw-b nw-del" data-a="del" title="Remove this signature box" aria-label="Remove signature box">✕</button></div>
    <div class="ns-pad">
      <div class="ns-tabs" role="tablist" aria-label="How to sign">${sv ? `<button type="button" role="tab" data-how="saved">My saved signature</button>` : ""}<button type="button" role="tab" data-how="draw">Draw</button><button type="button" role="tab" data-how="type">Type</button><button type="button" role="tab" data-how="photo">Photo</button></div>
      <div class="ns-stage"><canvas class="ns-cv" aria-label="Signature area: draw your signature here" role="img"></canvas><span class="ns-x" aria-hidden="true">✕</span><span class="ns-ph"></span></div>
      <div class="ns-row ns-typ" hidden><input class="ns-in ns-tname" maxlength="60" placeholder="Type your name" aria-label="Name to write as your signature"><span class="ns-fonts" role="radiogroup" aria-label="Handwriting">${FONTS.map(([k, n, f]) => `<button type="button" role="radio" data-font="${k}" style="font-family:${esc(f)}">${n}</button>`).join("")}</span></div>
      <div class="ns-row ns-pho" hidden><button type="button" class="btn-s" data-a="pick">Choose a photo of your signature…</button><small>Sign on white paper, take a photo, and the paper is taken out.</small><input type="file" accept="image/*" hidden></div>
      <div class="ns-row"><label class="ns-lab">Signed by <input class="ns-in ns-name" maxlength="80" placeholder="Your full name" aria-label="Signed by" value="${esc((sv && sv.name) || "")}"></label>
        <button type="button" class="btn-s" data-a="clear">Clear</button></div>
      <div class="ns-row ns-go"><label class="ns-rem"><input type="checkbox" class="ns-keep"${sv ? " checked" : ""}> Remember my signature on this computer</label><button type="button" class="btn good ns-sign" data-a="sign" disabled>Sign</button></div>
      <p class="ns-note">Signing locks it with your name, the date and time. NotePath also notes whether the note's words change afterwards. It is not a certified e-signature (there is no identity check).</p>
    </div>`;
  const $ = s => el.querySelector(s), cv = $(".ns-cv"), stage = $(".ns-stage"), nameIn = $(".ns-name"), tname = $(".ns-tname"), signB = $(".ns-sign"), ph = $(".ns-ph");
  if (window.InquireWidgets && InquireWidgets.kit && InquireWidgets.kit.delButton) InquireWidgets.kit.delButton(el);
  // keep typing in the fields to the fields (the note's editor must not take the keys)
  el.querySelectorAll("input").forEach(i => { i.addEventListener("keydown", e => e.stopPropagation()); i.addEventListener("input", e => { e.stopPropagation(); ready(); }); });
  const g = cv.getContext("2d");
  const size = () => { const r = stage.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), w = Math.max(240, Math.round(r.width)), h = 170;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px"; redraw(); } };
  const clear = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); };
  let strokes = [];
  function redraw() {
    clear(); const dpr = cv.width / (parseFloat(cv.style.width) || cv.width); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cv.width / dpr, H = cv.height / dpr;
    if (how === "draw") { g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = "round"; g.lineJoin = "round";
      strokes.forEach(s => { if (s.length === 1) { g.beginPath(); g.arc(s[0].x, s[0].y, 1.6, 0, Math.PI * 2); g.fill(); return; }
        for (let i = 1; i < s.length; i++) { const a = s[i - 1], b = s[i], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; g.lineWidth = b.w; g.beginPath(); g.moveTo(i > 1 ? (s[i - 2].x + a.x) / 2 : a.x, i > 1 ? (s[i - 2].y + a.y) / 2 : a.y); g.quadraticCurveTo(a.x, a.y, mx, my); g.stroke(); } }); }
    else if (how === "type") { const t = tname.value.trim(); if (t) { const f = FONTS.find(x => x[0] === font)[2]; let fs = 64; g.font = `${fs}px ${f}`; while (fs > 18 && g.measureText(t).width > W - 40) { fs -= 4; g.font = `${fs}px ${f}`; } g.fillStyle = INK; g.textBaseline = "middle"; g.textAlign = "center"; g.fillText(t, W / 2, H / 2 + 4); } }
    else if (how === "photo" && photo) { const s = Math.min((W - 20) / photo.width, (H - 20) / photo.height, 1); g.drawImage(photo, (W - photo.width * s) / 2, (H - photo.height * s) / 2, photo.width * s, photo.height * s); }
    else if (how === "saved" && sv && sv._img) { const im = sv._img, s = Math.min((W - 20) / im.width, (H - 20) / im.height, 1); g.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); }
    inked = how === "draw" ? strokes.length > 0 : how === "type" ? !!tname.value.trim() : how === "photo" ? !!photo : how === "saved" ? !!(sv && sv._img) : false;
    ph.textContent = inked ? "" : how === "draw" ? "Sign here with your mouse, trackpad or pen" : how === "type" ? "Type your name below" : how === "photo" ? "Choose a photo below" : "";
    ready();
  }
  function ready() { signB.disabled = !(inked && nameIn.value.trim()); signB.title = !inked ? "Make your signature first" : !nameIn.value.trim() ? "Write the signer's name" : "Sign and lock it"; }
  const tab = k => { how = k; el.querySelectorAll("[data-how]").forEach(b => { b.setAttribute("aria-selected", String(b.dataset.how === k)); b.tabIndex = b.dataset.how === k ? 0 : -1; });
    $(".ns-typ").hidden = k !== "type"; $(".ns-pho").hidden = k !== "photo"; stage.classList.toggle("draw", k === "draw"); $('[data-a="clear"]').hidden = k === "saved"; redraw(); if (k === "type") tname.focus({ preventScroll: true }); };
  el.querySelector(".ns-tabs").addEventListener("click", e => { const b = e.target.closest("[data-how]"); if (b) tab(b.dataset.how); });
  el.querySelectorAll("[data-font]").forEach(b => b.onclick = () => { font = b.dataset.font; el.querySelectorAll("[data-font]").forEach(x => x.setAttribute("aria-checked", String(x === b))); redraw(); });
  el.querySelector('[data-font="flow"]').setAttribute("aria-checked", "true");
  tname.addEventListener("input", () => { redraw(); if (!nameIn.value.trim() || nameIn._auto) { nameIn.value = tname.value; nameIn._auto = true; ready(); } });
  nameIn.addEventListener("input", () => { nameIn._auto = false; });
  $('[data-a="clear"]').onclick = () => { if (how === "draw") strokes = []; else if (how === "type") tname.value = ""; else if (how === "photo") photo = null; redraw(); };
  // drawing: pointer events; faster strokes are a little thinner, like ink
  let cur = null;
  cv.addEventListener("pointerdown", e => { if (how !== "draw" || e.button > 0) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); cur = [{ x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, w: 2.6 }]; strokes.push(cur); redraw(); });
  cv.addEventListener("pointermove", e => { if (!cur) return; const r = cv.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }, l = cur[cur.length - 1];
    const dist = Math.hypot(p.x - l.x, p.y - l.y); if (dist < 1.2) return; const v = dist / Math.max(1, p.t - l.t);
    p.w = Math.max(1.4, Math.min(3.6, (e.pressure && e.pointerType === "pen" ? 1.4 + e.pressure * 2.6 : 3.4 - v * 1.1))) * 0.6 + l.w * 0.4; cur.push(p); redraw(); });
  const up = () => { cur = null; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  // a photo of a signature: the light paper becomes see-through, the ink becomes navy
  const fin = $('input[type="file"]');
  $('[data-a="pick"]').onclick = () => fin.click();
  fin.onchange = () => { const f = fin.files[0]; fin.value = ""; if (!f || !/^image\//.test(f.type)) return;
    const im = new Image(); im.onload = () => { const s = Math.min(1, 900 / im.width, 400 / im.height), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
      const x = c.getContext("2d"); x.drawImage(im, 0, 0, c.width, c.height); const id = x.getImageData(0, 0, c.width, c.height), p = id.data;
      for (let i = 0; i < p.length; i += 4) { const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2], a = Math.max(0, Math.min(255, (200 - lum) * 2.2)); p[i] = 0x1B; p[i + 1] = 0x2A; p[i + 2] = 0x57; p[i + 3] = Math.round(a * p[i + 3] / 255); }
      x.putImageData(id, 0, 0); photo = trimmed(c) || c; URL.revokeObjectURL(im.src); redraw(); };
    im.src = URL.createObjectURL(f); };
  if (sv) { const im = new Image(); im.onload = () => { sv._img = im; if (how === "saved") redraw(); }; im.src = sv.png; }
  // sign: trim, keep the picture in the notes' store, fingerprint the words, lock
  signB.onclick = async () => {
    if (signB.disabled) return; signB.disabled = true; signB.textContent = "Signing…";
    try {
      const out = trimmed(cv); if (!out) throw new Error("empty");
      const blob = await toBlob(out), N = window.InquireNotes; if (!N || !blob) throw new Error("no store");
      const img = await N.putImage(blob), ed = hostOf(el), hash = ed ? await fingerprint(noteWords(ed)) : "";
      const name = nameIn.value.trim();
      if ($(".ns-keep").checked) { try { localStorage.setItem(SAVED, JSON.stringify({ png: await dataURL(blob), name })); } catch (e) {} }
      else if (how === "saved") { try { localStorage.removeItem(SAVED); } catch (e) {} }
      const d = Object.assign(read(), { name, at: Date.now(), img, how, hash });
      write(d); signedView(el, d);
      if (N.toast) N.toast("Signed and locked.", null, 2500);
    } catch (e) { signB.textContent = "Sign"; ready(); if (window.InquireNotes && InquireNotes.toast) InquireNotes.toast("The signature could not be made. Draw or type it again.", null, 3500); }
  };
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!el.isConnected) { ro.disconnect(); return; } size(); }); ro.observe(stage); }
  tab(how); size();
}

window.NPSign = { mount, text, line, fingerprint, noteWords, FONTS, DEF };
})();
