// Give the Mac app an ad-hoc signature. Apple Silicon refuses to run an app whose signature
// was broken by packaging, and there is no Developer ID yet. Replace with real signing later.
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  if (process.env.CSC_LINK) return; // a real certificate will sign the app instead
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
