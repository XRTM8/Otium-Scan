const fs = require('fs');
const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require('c:/Users/mjd20/OneDrive/Desktop/pdf/node_modules/sharp');
}

const ADAPTIVE_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432
};

const LEGACY_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

const TAURI_SIZES = [
  { file: '32x32.png', size: 32 },
  { file: '64x64.png', size: 64 },
  { file: '128x128.png', size: 128 },
  { file: '128x128@2x.png', size: 256 },
  { file: 'icon.png', size: 512 },
  { file: 'Square30x30Logo.png', size: 30 },
  { file: 'Square44x44Logo.png', size: 44 },
  { file: 'Square71x71Logo.png', size: 71 },
  { file: 'Square89x89Logo.png', size: 89 },
  { file: 'Square107x107Logo.png', size: 107 },
  { file: 'Square142x142Logo.png', size: 142 },
  { file: 'Square150x150Logo.png', size: 150 },
  { file: 'Square284x284Logo.png', size: 284 },
  { file: 'Square310x310Logo.png', size: 310 },
  { file: 'StoreLogo.png', size: 50 }
];

function getSvgTemplates(variant = 'concept1') {
  // Common book glyph
  const bookAmber = `
    <g>
      <path d="M256 198C222 176 182 169 147 173V338C182 334 222 341 256 363V198Z" fill="#F7D08A"/>
      <path d="M256 198C290 176 330 169 365 173V338C330 334 290 341 256 363V198Z" fill="#F7D08A"/>
      <path d="M256 204V357" stroke="#070B09" stroke-width="11" stroke-linecap="round"/>
      <path d="M178 218C204 217 229 221 245 231M178 250C204 249 229 253 245 263M334 218C308 217 283 221 267 231M334 250C308 249 283 253 267 263" stroke="#070B09" stroke-width="8" stroke-linecap="round" opacity="0.38"/>
    </g>`;

  const bookEmerald = `
    <g>
      <path d="M256 198C222 176 182 169 147 173V338C182 334 222 341 256 363V198Z" fill="url(#emGrad)"/>
      <path d="M256 198C290 176 330 169 365 173V338C330 334 290 341 256 363V198Z" fill="url(#emGrad)"/>
      <path d="M256 204V357" stroke="#070B09" stroke-width="11" stroke-linecap="round"/>
      <path d="M178 218C204 217 229 221 245 231M178 250C204 249 229 253 245 263M334 218C308 217 283 221 267 231M334 250C308 249 283 253 267 263" stroke="#070B09" stroke-width="8" stroke-linecap="round" opacity="0.4"/>
    </g>`;

  const reticleCorners = (color = '#10B981') => `
    <path d="M152 130H122C115.4 130 110 135.4 110 142V172" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M360 130H390C396.6 130 402 135.4 402 142V172" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M110 340V370C110 376.6 115.4 382 122 382H152" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M402 340V370C402 376.6 396.6 382 390 382H360" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  const laserLine = `
    <polygon points="147,205 365,205 390,265 122,265" fill="url(#laserGlow)"/>
    <line x1="90" y1="265" x2="422" y2="265" stroke="url(#laserGrad)" stroke-width="6.5" stroke-linecap="round"/>
    <circle cx="256" cy="265" r="4.5" fill="#FFFFFF"/>
  `;

  let innerContent = '';
  if (variant === 'concept1') {
    innerContent = `${reticleCorners('#10B981')}${bookAmber}${laserLine}`;
  } else if (variant === 'concept2') {
    innerContent = `${reticleCorners('#34D399')}${bookEmerald}`;
  } else {
    // concept3
    innerContent = `
      <polygon points="147,173 365,173 420,262 92,262" fill="url(#laserGlow)"/>
      ${bookAmber}
      <line x1="50" y1="262" x2="462" y2="262" stroke="url(#laserGrad)" stroke-width="7" stroke-linecap="round"/>
      <circle cx="256" cy="262" r="5" fill="#FFFFFF"/>
    `;
  }

  // Full opaque plate
  const plateSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="laserGrad" x1="90" y1="265" x2="422" y2="265" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#10B981" stop-opacity="0"/>
        <stop offset="15%" stop-color="#10B981" stop-opacity="0.9"/>
        <stop offset="50%" stop-color="#A7F3D0" stop-opacity="1"/>
        <stop offset="85%" stop-color="#10B981" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="laserGlow" x1="256" y1="205" x2="256" y2="265" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#10B981" stop-opacity="0"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0.32"/>
      </linearGradient>
      <linearGradient id="emGrad" x1="147" y1="170" x2="365" y2="360" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#34D399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="112" fill="#070B09"/>
    <rect x="2" y="2" width="508" height="508" rx="110" stroke="#10B981" stroke-opacity="0.3" stroke-width="4"/>
    ${innerContent}
  </svg>`;

  // Adaptive glyph (scaled to fit perfectly in 66% Android safe zone circle)
  const glyphSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="laserGrad" x1="90" y1="265" x2="422" y2="265" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#10B981" stop-opacity="0"/>
        <stop offset="15%" stop-color="#10B981" stop-opacity="0.9"/>
        <stop offset="50%" stop-color="#A7F3D0" stop-opacity="1"/>
        <stop offset="85%" stop-color="#10B981" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="laserGlow" x1="256" y1="205" x2="256" y2="265" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#10B981" stop-opacity="0"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0.32"/>
      </linearGradient>
      <linearGradient id="emGrad" x1="147" y1="170" x2="365" y2="360" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#34D399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>
    <g transform="translate(256 256) scale(0.96) translate(-256 -256)">
      ${innerContent}
    </g>
  </svg>`;

  return { plateSvg, glyphSvg };
}

async function buildIcons(variant = 'concept1') {
  const root = path.resolve(__dirname, '..');
  const iconsDir = path.join(root, 'src-tauri', 'icons');
  const androidAssetDir = path.join(iconsDir, 'android');
  const androidResDir = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');

  const { plateSvg, glyphSvg } = getSvgTemplates(variant);

  console.log(`Building Otium Scan icons using [${variant}]...`);

  // 1. Master Tauri and App icons
  for (const item of TAURI_SIZES) {
    const targetPath = path.join(iconsDir, item.file);
    await sharp(Buffer.from(plateSvg))
      .resize(item.size, item.size)
      .png()
      .toFile(targetPath);
  }
  console.log('Tauri desktop & app-icon PNGs generated.');

  // 2. Android Adaptive Icons (Foreground)
  for (const [density, size] of Object.entries(ADAPTIVE_SIZES)) {
    const dir = path.join(androidAssetDir, `mipmap-${density}`);
    if (fs.existsSync(dir)) {
      await sharp(Buffer.from(glyphSvg))
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(dir, 'ic_launcher_foreground.png'));
    }
  }

  // 3. Android Legacy / Fallback Icons (Plate & Round)
  for (const [density, size] of Object.entries(LEGACY_SIZES)) {
    const dir = path.join(androidAssetDir, `mipmap-${density}`);
    if (!fs.existsSync(dir)) continue;

    await sharp(Buffer.from(plateSvg))
      .resize(size, size)
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    const square = await sharp(Buffer.from(plateSvg)).resize(size, size).png().toBuffer();
    const roundMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
    await sharp(square)
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
  }

  // 4. Update background XML color
  const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#070B09</color>
</resources>
`;
  const bgXmlPath = path.join(androidAssetDir, 'values', 'ic_launcher_background.xml');
  if (fs.existsSync(path.dirname(bgXmlPath))) {
    fs.writeFileSync(bgXmlPath, backgroundXml);
  }

  // 5. Sync to Android main res
  if (fs.existsSync(androidResDir)) {
    fs.cpSync(androidAssetDir, androidResDir, { recursive: true, force: true });
    const resBg = path.join(androidResDir, 'values', 'ic_launcher_background.xml');
    fs.writeFileSync(resBg, backgroundXml);
    console.log('Synchronized to Android res directory.');
  }

  console.log('Icon generation completed successfully!');
}

const variant = process.argv[2] || 'concept1';
buildIcons(variant).catch(console.error);
