// Mac self-updater for builds without an Apple Developer ID.
//
// Squirrel (electron-updater's Mac installer) only works for Developer-ID-signed apps, so on
// an ad-hoc-signed build NotePath updates itself the same way Coven Wallet does:
//   1. Ask GitHub for the latest release of the public releases repo.
//   2. Read latest-mac.yml (written by electron-builder) for the zip name, size and sha512.
//   3. Download the zip for this Mac's chip, check the sha512, unzip it with ditto.
//   4. After NotePath quits, a small script swaps the new NotePath.app into place and reopens it.
// If macOS refuses the swap (Privacy & Security > App Management), the old app is put back
// and the new one is left in ~/Downloads with instructions.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (e, out, err) => e ? rej(new Error(String(err || e.message).trim())) : res(String(out))));
function newer(a, b) { const p = s => String(s).split('.').map(n => parseInt(n, 10) || 0); const [x, y] = [p(a), p(b)]; for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

// Minimal reader for electron-builder's latest-mac.yml "files:" list.
function parseYml(text) {
  const files = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^\s*-\s*url:\s*(.+)$/))) { cur = { url: m[1].trim().replace(/^['"]|['"]$/g, '') }; files.push(cur); }
    else if (cur && (m = line.match(/^\s+sha512:\s*(.+)$/))) cur.sha512 = m[1].trim().replace(/^['"]|['"]$/g, '');
    else if (cur && (m = line.match(/^\s+size:\s*(\d+)/))) cur.size = +m[1];
    else if (/^\S/.test(line)) cur = null;
  }
  const version = ((text.match(/^version:\s*(.+)$/m) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
  return { version, files };
}

class MacUpdater {
  constructor({ app, net, owner, repo, notify, log }) {
    Object.assign(this, { app, net, owner, repo, notify, log });
    this.state = { status: 'idle' };
    this.ready = null; // { version, appPath, work }
    this.busy = false;
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.notify(this.state); }
  headers() { return { 'User-Agent': 'NotePath-Updater', Accept: 'application/vnd.github+json' }; }

  async latestRelease() {
    const res = await this.net.fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`, { headers: this.headers() });
    if (res.status === 404) return null; // no release published yet
    if (!res.ok) throw new Error('GitHub answered ' + res.status);
    return res.json();
  }

  // Returns 'current' | 'downloading' | 'ready' | 'error'
  async check() {
    if (this.busy) return this.state.status;
    if (this.ready) return 'ready';
    this.busy = true;
    try {
      this.set({ status: 'checking' });
      const rel = await this.latestRelease();
      const latest = rel ? String(rel.tag_name || '').replace(/^v/, '') : '';
      if (!rel || !latest || !newer(latest, this.app.getVersion())) { this.set({ status: 'current', version: this.app.getVersion() }); return 'current'; }
      const assets = rel.assets || [];
      const ymlAsset = assets.find(a => a.name === 'latest-mac.yml');
      if (!ymlAsset) throw new Error('Release ' + latest + ' has no latest-mac.yml yet. The build may still be running.');
      const yml = parseYml(await (await this.net.fetch(ymlAsset.browser_download_url, { headers: { 'User-Agent': 'NotePath-Updater' } })).text());
      const wantArm = process.arch === 'arm64';
      const entry = yml.files.find(f => f.url.endsWith('.zip') && (wantArm ? /arm64/.test(f.url) : !/arm64/.test(f.url)));
      if (!entry) throw new Error('Release ' + latest + ' has no zip for this Mac (' + process.arch + ').');
      const zipAsset = assets.find(a => a.name === entry.url || a.name === entry.url.replace(/ /g, '.'));
      if (!zipAsset) throw new Error('Could not find ' + entry.url + ' in the release.');
      await this.download(latest, zipAsset.browser_download_url, entry);
      return 'ready';
    } catch (e) {
      this.log.warn('mac update failed', e);
      this.set({ status: 'error', message: e.message });
      return 'error';
    } finally { this.busy = false; }
  }

  async download(version, url, entry) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'inquire-update-'));
    const zip = path.join(work, 'update.zip');
    this.set({ status: 'downloading', version, percent: 0 });
    const res = await this.net.fetch(url, { headers: { 'User-Agent': 'NotePath-Updater' } });
    if (!res.ok || !res.body) throw new Error('Download failed (' + res.status + ').');
    const total = entry.size || +res.headers.get('content-length') || 0;
    const out = fs.createWriteStream(zip); const hash = crypto.createHash('sha512');
    const reader = res.body.getReader(); let got = 0, lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      const buf = Buffer.from(value); hash.update(buf); got += buf.length;
      if (!out.write(buf)) await new Promise(r => out.once('drain', r));
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; this.set({ status: 'downloading', version, percent: pct }); }
    }
    await new Promise((r, j) => out.end(e => e ? j(e) : r()));
    if (entry.sha512 && hash.digest('base64') !== entry.sha512) throw new Error('The downloaded update failed its checksum. It will be retried later.');
    const dest = path.join(work, 'unpacked'); fs.mkdirSync(dest);
    await run('/usr/bin/ditto', ['-x', '-k', zip, dest]);
    const appName = fs.readdirSync(dest).find(f => f.endsWith('.app'));
    if (!appName) throw new Error('The update does not contain NotePath.app.');
    fs.rmSync(zip, { force: true });
    this.ready = { version, appPath: path.join(dest, appName), work };
    this.set({ status: 'ready', version });
  }

  bundlePath() { const p = path.resolve(process.execPath, '..', '..', '..'); return p.endsWith('.app') ? p : null; }

  install() {
    const r = this.ready; if (!r) return false;
    const target = this.bundlePath();
    if (!target) { this.set({ status: 'error', message: 'Updates install only into the packaged app.' }); return false; }
    if (target.includes('AppTranslocation') || target.startsWith('/Volumes/')) { this.set({ status: 'error', message: 'Drag NotePath into your Applications folder, open it from there, then install the update.' }); return false; }
    const backup = path.join(r.work, 'previous.app');
    // A copy installed under another name moves to NotePath.app (the name inside the zip) unless that name is already taken.
    const named = path.join(path.dirname(target), path.basename(r.appPath));
    const dest = named !== target && !fs.existsSync(named) ? named : target;
    const result = path.join(this.app.getPath('userData'), 'update-result.json');
    const fallback = path.join(os.homedir(), 'Downloads', `NotePath ${r.version}.app`);
    const q = s => s.replace(/"/g, '\\"');
    const script = path.join(r.work, 'swap.sh');
    fs.writeFileSync(script, [
      '#!/bin/bash',
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `if mv "${q(target)}" "${q(backup)}" && mv "${q(r.appPath)}" "${q(dest)}"; then`,
      `  /usr/bin/xattr -cr "${q(dest)}" 2>/dev/null`,
      `  echo '{"ok":true,"version":"${r.version}"}' > "${q(result)}"`,
      `  rm -rf "${q(backup)}"`,
      'else',
      `  [ -d "${q(backup)}" ] && [ ! -d "${q(target)}" ] && mv "${q(backup)}" "${q(target)}"; DEST="${q(target)}"`,
      `  rm -rf "${q(fallback)}"; mv "${q(r.appPath)}" "${q(fallback)}"; /usr/bin/xattr -cr "${q(fallback)}" 2>/dev/null`,
      `  echo '{"ok":false,"version":"${r.version}","fallback":"${q(fallback)}"}' > "${q(result)}"`,
      'fi',
      `/usr/bin/open "\${DEST:-${q(dest)}}"`
    ].join('\n'), { mode: 0o755 });
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
    this.set({ status: 'installing', version: r.version });
    setTimeout(() => this.app.quit(), 300);
    return true;
  }

  // What the swap script reported after the last install. Read once at startup.
  lastResult() {
    const f = path.join(this.app.getPath('userData'), 'update-result.json');
    try { const r = JSON.parse(fs.readFileSync(f, 'utf8')); fs.unlinkSync(f); return r; } catch (_) { return null; }
  }
}

module.exports = { MacUpdater, newer, parseYml };
