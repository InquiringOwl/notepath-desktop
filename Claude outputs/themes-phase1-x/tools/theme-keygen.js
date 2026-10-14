// Makes NotePath's theme-pack signing key pair, once, on Devon's own computer.
//   private key → ~/.notepath/theme-signing-key.pem (readable only by you; keep an offline backup: losing it blocks new packs)
//   public key  → theme-key.json in this folder (ships inside the app; commit it)
// Run: npm run theme:keygen   (refuses to replace an existing key unless you add --replace)
const fs = require('fs'), path = require('path'), os = require('os');
const T = require('../themes-core.js');
const dir = path.join(os.homedir(), '.notepath'), priv = path.join(dir, 'theme-signing-key.pem'), pubFile = path.join(__dirname, '..', 'theme-key.json');
if (fs.existsSync(priv) && !process.argv.includes('--replace')) { console.error(`A key already exists at ${priv}. Add --replace to make a new one (packs signed with the old key will stop installing).`); process.exit(1); }
const k = T.keyPair();
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(priv, k.privateKeyPem, { mode: 0o600 });
const cur = JSON.parse(fs.readFileSync(pubFile, 'utf8'));
cur.publicKey = k.publicKey; cur.made = new Date().toISOString().slice(0, 10);
fs.writeFileSync(pubFile, JSON.stringify(cur, null, 2) + '\n');
console.log(`✓ Private key: ${priv} (keep it secret, back it up offline)\n✓ Public key written to theme-key.json (commit it; the next release can install packs signed with this key)`);
