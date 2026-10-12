// Tiny static server for the tests: the built page at /index.html (without its CSP, which would block the test's mocked
// web services) and everything else from app/ (fonts, vendor/monaco). Over http, Monaco's workers load as in the app.
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
module.exports = function serve(R, html) {
  const app = path.join(R, 'app'), page = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/' || u === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page); return; }
    const f = path.normalize(path.join(app, u));
    if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}/index.html`, close: () => srv.close() })));
};
