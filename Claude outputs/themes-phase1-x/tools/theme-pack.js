// Builds and signs a theme pack: <folder> → dist-themes/<id>-<version>.nptheme (a zip with signature.json).
// Run: npm run theme:pack <folder>   The private key is read from --key <file>, NOTEPATH_THEME_KEY, or ~/.notepath/theme-signing-key.pem
// (made by npm run theme:keygen; it never goes in the repo or the app).
const fs = require('fs'), path = require('path'), os = require('os');
const T = require('../themes-core.js');
const args = process.argv.slice(2), ki = args.indexOf('--key');
const keyFile = ki >= 0 ? args.splice(ki, 2)[1] : process.env.NOTEPATH_THEME_KEY || path.join(os.homedir(), '.notepath', 'theme-signing-key.pem');
const dir = args[0];
if (!dir) { console.error('Usage: npm run theme:pack <pack folder> [--key <private key file>]'); process.exit(2); }
const files = T.readFolder(dir); files.delete('signature.json');
const check = T.validate(new Map([...files, ['signature.json', Buffer.from('{}')]]));
if (!check.ok) { check.errors.forEach(e => console.log('✗ ' + e)); console.log('Fix these first (npm run theme:check ' + dir + ').'); process.exit(1); }
if (!fs.existsSync(keyFile)) { console.error(`No signing key at ${keyFile}. Make one with npm run theme:keygen (once, on your own computer).`); process.exit(1); }
files.set('signature.json', T.sign(files, fs.readFileSync(keyFile, 'utf8')));
const m = check.manifest, out = path.join(__dirname, '..', 'dist-themes', `${m.id}-${m.version}.nptheme`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, T.writeZip(files));
const pub = require('../theme-key.json').publicKey, ok = !!pub && !T.verify(T.readZip(fs.readFileSync(out)), pub);
console.log(`✓ ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)` + (ok ? ', signature checks out with theme-key.json' : !pub ? '\n! theme-key.json has no public key yet (npm run theme:keygen), so NotePath will not install it' : '\n! the signature does not match theme-key.json: is this the key theme:keygen made?'));
