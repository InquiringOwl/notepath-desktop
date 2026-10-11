// One-command release. Installed copies of NotePath pick the new version up through auto-update.
//   npm run release -- patch "Short note"     1.2.0 → 1.2.1
//   npm run release -- minor "Templates"      1.2.0 → 1.3.0
//   npm run release -- 2.0.0 "Big change"     exact version
// Steps: make sure main is up to date → run every check → bump the version →
// commit everything → push → tag → push the tag (GitHub then builds and publishes).
// Stops at the first problem; nothing is pushed unless all checks pass.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: R, stdio: 'inherit', ...opts });
const out = cmd => execSync(cmd, { cwd: R, encoding: 'utf8' }).trim();
const stop = msg => { console.error('\n✗ ' + msg + '\nNothing was released.'); process.exit(1); };

const [kind, ...noteParts] = process.argv.slice(2);
const note = noteParts.join(' ').trim();
if (!kind || !/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(kind)) stop('Say which version: patch, minor, major or an exact X.Y.Z.\n  e.g. npm run release -- patch "Fix the checklist ticks"');

const pkg = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8'));
const [a, b, c] = pkg.version.split('.').map(Number);
const next = { patch: `${a}.${b}.${c + 1}`, minor: `${a}.${b + 1}.0`, major: `${a + 1}.0.0` }[kind] || kind;
const cmp = (x, y) => { const p = x.split('.').map(Number), q = y.split('.').map(Number); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0; };
if (cmp(next, pkg.version) <= 0) stop(`${next} is not newer than the current ${pkg.version}.`);

if (out('git rev-parse --abbrev-ref HEAD') !== 'main') stop('Switch to the main branch first.');
console.log(`\n▸ NotePath ${pkg.version} → ${next}${note ? ': ' + note : ''}\n▸ Checking GitHub for newer commits…`);
sh('git fetch -q origin main');
if (out('git rev-list --count HEAD..origin/main') !== '0') stop('GitHub has commits this Mac does not. Run "git pull" first.');
if (out(`git tag -l v${next}`)) stop(`Tag v${next} already exists.`);

console.log('▸ Running all checks (about 2–3 minutes)…');
try { sh('npm run --silent check'); } catch (e) { stop('A check failed (see above). Fix it, then run the release again.'); }

console.log(`▸ Bumping version to ${next}…`);
sh(`npm version ${next} --no-git-tag-version --allow-same-version`, { stdio: 'ignore' });
sh('node tools/build-web.js', { stdio: 'ignore' });

const changes = out('git status --short');
console.log('▸ Committing:\n' + changes.split('\n').map(l => '    ' + l).join('\n'));
sh('git add -A');
sh(`git commit -q -m ${JSON.stringify(`NotePath ${next}${note ? ': ' + note : ''}`)}`);
console.log('▸ Pushing…');
sh('git push -q origin main');
sh(`git tag v${next}`);
sh(`git push -q origin v${next}`);
console.log(`\n✓ NotePath ${next} is on its way. GitHub is building it now (about 5 minutes):\n  https://github.com/InquiringOwl/notepath-desktop/actions\nInstalled copies update themselves after that.`);
