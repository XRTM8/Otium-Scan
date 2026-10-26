import fs from 'node:fs';

const tag = process.argv[2] || process.env.RELEASE_TAG;
if (!tag) {
  console.error('Usage: node check-version.mjs <vX.Y.Z>');
  process.exit(1);
}

const cleanTag = tag.replace(/^v/, '');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tauriConf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargoToml = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
const updaterTs = fs.readFileSync('src/core/updater.ts', 'utf8');

console.log(`Checking version consistency for tag: ${tag}`);

if (pkg.version !== cleanTag) {
  console.error(`package.json version (${pkg.version}) does not match tag (${cleanTag})`);
  process.exit(1);
}

if (tauriConf.version !== cleanTag) {
  console.error(`tauri.conf.json version (${tauriConf.version}) does not match tag (${cleanTag})`);
  process.exit(1);
}

if (!cargoToml.includes(`version = "${cleanTag}"`)) {
  console.error(`Cargo.toml does not contain version = "${cleanTag}"`);
  process.exit(1);
}

if (!updaterTs.includes(`APP_CURRENT_VERSION = '${cleanTag}'`)) {
  console.error(`updater.ts does not contain APP_CURRENT_VERSION = '${cleanTag}'`);
  process.exit(1);
}

console.log(`✓ All version checks passed across package.json, tauri.conf.json, Cargo.toml, and updater.ts: ${cleanTag}`);
