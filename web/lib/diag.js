/* NotePath diagnostics (v0.5.7). Everything stays on this computer: nothing is sent anywhere.
   - a ring of the last 30 page errors,
   - a frame sampler (sample(ms, onSlow)): counts frames slower than 50 ms while the window is visible. It runs only when asked
     (the first 90 s of Auto mode, settings.js; "Run a frame test" in Settings → About), because an always-on loop would cost the energy it measures,
   - report(): the text behind Settings → About → Copy diagnostics (version, system, performance mode, sizes, errors, frame stats). */
(function () {
  const errs = [];
  const add = (k, m) => { errs.push({ t: new Date().toISOString().slice(11, 19), k, m: String(m).slice(0, 300) }); if (errs.length > 30) errs.shift(); };
  window.addEventListener("error", e => add("error", (e.message || "") + (e.filename ? " @ " + String(e.filename).split("/").pop() + ":" + e.lineno : "")));
  window.addEventListener("unhandledrejection", e => add("promise", (e.reason && e.reason.message) || e.reason));
  const stats = { frames: 0, slow: 0, worst: 0, ms: 0, label: "not run" };
  let running = null, cur = null; // cur = the sample in progress, so a report made during the 90 s watch still shows its numbers
  function sample(ms, onSlow, label) {
    if (running) running.stop();
    const s = { frames: 0, slow: 0, worst: 0, ms: 0, label: label || "sample" }; let last = 0, t0 = 0, stopped = false, done;
    const p = new Promise(r => { done = r; });
    const stop = () => { if (stopped) return; stopped = true; s.ms = Math.round(performance.now() - t0); Object.assign(stats, s); running = null; cur = null; done(s); };
    const tick = ts => {
      if (stopped) return;
      if (!t0) { t0 = performance.now(); s.t0 = t0; }
      const vis = document.visibilityState === "visible";
      if (vis && last) { const g = ts - last; if (g < 1500) { s.frames++; if (g > s.worst) s.worst = Math.round(g); if (g > 50) { s.slow++; if (onSlow) onSlow(g, ts); } } }
      last = vis ? ts : 0;
      if (performance.now() - t0 >= ms) { stop(); return; }
      requestAnimationFrame(tick);
    };
    running = { stop }; cur = s; requestAnimationFrame(tick);
    return p;
  }
  async function report() {
    const D = window.inquireDesktop, NS = window.InquireNotes, L = [];
    let ver = ""; try { if (D && D.version) ver = await D.version(); } catch (e) {}
    let est = null; try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) {}
    let auto = {}; try { auto = JSON.parse(localStorage.getItem("notepath.perf.auto") || "{}") || {}; } catch (e) {}
    const S = window.InquireSettings ? InquireSettings.get() : {}, mb = n => (n / 1048576).toFixed(0) + " MB";
    L.push("NotePath diagnostics (kept on this computer; nothing was sent)");
    L.push("Version: " + (ver ? "v" + ver : "web preview") + " · " + new Date().toISOString());
    L.push("System: " + (D ? D.platform : navigator.platform) + " · " + (navigator.hardwareConcurrency || "?") + " cores · " + (navigator.deviceMemory ? navigator.deviceMemory + " GB (rounded down by the browser)" : "memory unknown"));
    L.push("Graphics: " + (auto.gpu || "not read yet") + " · screen " + screen.width + "×" + screen.height + " @" + (window.devicePixelRatio || 1) + "x");
    L.push("Performance: setting " + (S.perf || "auto") + " → running " + document.documentElement.dataset.perf + (auto.reason ? " (" + auto.reason + ")" : "") + " · reduce motion " + (document.documentElement.hasAttribute("data-reduce-motion") ? "on" : "off") + " · glass theme " + document.documentElement.hasAttribute("data-glass"));
    if (NS && NS.readAll) { try { L.push("Notes: " + NS.readAll().length + " notes, " + NS.readFolders().length + " folders"); } catch (e) {} }
    if (est) L.push("Storage: " + mb(est.usage || 0) + " used of " + mb(est.quota || 0) + " available");
    L.push("Loaded on demand so far: " + ((window.NPLazy && NPLazy.loaded().join(", ")) || "none") + (window.monaco ? " · code editor loaded" : ""));
    const st = cur && cur.t0 ? Object.assign({}, cur, { ms: Math.round(performance.now() - cur.t0) }) : stats;
    L.push("Frames (" + st.label + (cur ? ", still running" : "") + "): " + (st.frames ? st.frames + " frames, " + st.slow + " slower than 50 ms, worst " + st.worst + " ms, over " + (st.ms / 1000).toFixed(1) + " s" : "no sample yet"));
    L.push("Recent errors: " + (errs.length ? "\n" + errs.map(e => "  " + e.t + " " + e.k + ": " + e.m).join("\n") : "none"));
    return L.join("\n");
  }
  window.NPDiag = { sample, report, errors: () => errs.slice(), stats: () => Object.assign({}, stats) };
})();
