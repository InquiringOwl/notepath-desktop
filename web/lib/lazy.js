/* NotePath lazy modules (v0.5.7). Big, rarely used scripts (Note Office, Import & Export, Sheet, Graph, Map, AI Chat helpers) sit in the
   page as inert <script type="text/plain" data-np-lazy="name"> text and run the first time something touches their global
   (window.NoteOffice, NPIO, NPSheet, NPGraph, NPMap, NPAssist). Until then they cost no parse, no memory and no start-up time.
   The global is an accessor: the first read runs the script (synchronously, so callers see no difference); the script's own
   `window.X = {…}` then replaces the accessor with a plain value. tools/build-web.js decides which files are lazy (LAZY). */
(function () {
  const done = Object.create(null);
  function load(name) {
    if (done[name]) return;
    done[name] = 1;
    const el = document.querySelector('script[data-np-lazy="' + name + '"]');
    if (!el) return;
    const s = document.createElement("script");
    s.textContent = el.textContent;
    el.remove();                       // the source text is no longer kept in the page
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }
  function lazy(name, glob) {
    Object.defineProperty(window, glob, {
      configurable: true, enumerable: true,
      get() { load(name); const d = Object.getOwnPropertyDescriptor(window, glob); return d && "value" in d ? d.value : undefined; },
      set(v) { Object.defineProperty(window, glob, { value: v, writable: true, configurable: true, enumerable: true }); }
    });
  }
  window.NPLazy = { load, lazy, loaded: () => Object.keys(done) };
})();
