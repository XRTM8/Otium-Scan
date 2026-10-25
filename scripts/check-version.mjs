import fs from 'node:fs';

const tag = process.argv[2] || process.env.RELEASE_TAG;
if (!tag) {
  console.error('Usage: node check-version.mjs <vX.Y.Z>');
  process.exit(1);
}

const cleanTag = tag.replace(/^v/, '');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tauriConf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));

console.log(`Checking version consistency for tag: ${tag}`);

if (pkg.version !== cleanTag) {
  console.error(`package.json version (${pkg.version}) does not match tag (${cleanTag})`);
  process.exit(1);
}

if (tauriConf.version !== cleanTag) {
  console.error(`tauri.conf.json version (${tauriConf.version}) does not match tag (${cleanTag})`);
  process.exit(1);
}

console.log(`Version verification passed: ${cleanTag}`);
