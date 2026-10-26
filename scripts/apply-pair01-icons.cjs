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

async function generateSuite(masterImagePath, targetBaseDir, isTauriProject = false) {
  const masterBuffer = await sharp(masterImagePath).toBuffer();

  // 1. Desktop & web sizes if tauri project
  if (isTauriProject) {
    for (const item of TAURI_SIZES) {
      const targetPath = path.join(targetBaseDir, item.file);
      await sharp(masterBuffer)
        .resize(item.size, item.size)
        .png({ quality: 100 })
        .toFile(targetPath);
    }
  }

  // 2. Android Mipmaps
  const mipmapDir = isTauriProject ? path.join(targetBaseDir, 'android') : targetBaseDir;

  for (const [density, size] of Object.entries(LEGACY_SIZES)) {
    const dir = path.join(mipmapDir, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });

    // Legacy square/squircle
    await sharp(masterBuffer)
      .resize(size, size)
      .png({ quality: 100 })
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Round icon with anti-aliased circular mask
    const squareBuffer = await sharp(masterBuffer).resize(size, size).png().toBuffer();
    const roundMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
    await sharp(squareBuffer)
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .png({ quality: 100 })
      .toFile(path.join(dir, 'ic_launcher_round.png'));
  }

  // Adaptive foreground icons (scaled to 72% safe zone on transparent background)
  for (const [density, size] of Object.entries(ADAPTIVE_SIZES)) {
    const dir = path.join(mipmapDir, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });

    const innerSize = Math.round(size * 0.72);
    const pad = Math.round((size - innerSize) / 2);

    const innerPng = await sharp(masterBuffer)
      .resize(innerSize, innerSize)
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 7, g: 8, b: 11, alpha: 0 }
      }
    })
      .composite([{ input: innerPng, left: pad, top: pad }])
      .png({ quality: 100 })
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Background XML
  const bgDir = path.join(mipmapDir, 'values');
  fs.mkdirSync(bgDir, { recursive: true });
  fs.writeFileSync(
    path.join(bgDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#07080B</color>\n</resources>\n`
  );
}

async function run() {
  const masterScan = 'C:/Users/mjd20/.gemini/antigravity/brain/d22cdf39-aaa4-43b8-92f8-2397d9328ee4/otium_scan_master_icon_fullbleed_1793018330144.jpg';
  const masterReader = 'C:/Users/mjd20/.gemini/antigravity/brain/d22cdf39-aaa4-43b8-92f8-2397d9328ee4/otium_reader_master_icon_1793018480236.jpg';

  console.log('Generating Otium Scan PAIR 01 production icons...');
  const scanIconsDir = path.resolve(__dirname, '..', 'src-tauri', 'icons');
  await generateSuite(masterScan, scanIconsDir, true);

  // Sync to Android main res
  const androidResDir = path.resolve(__dirname, '..', 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(androidResDir)) {
    fs.cpSync(path.join(scanIconsDir, 'android'), androidResDir, { recursive: true, force: true });
    console.log('Synced Otium Scan icons to Android res directory.');
  }

  console.log('Generating Otium Reader PAIR 01 package...');
  const readerPackageDir = 'C:/Users/mjd20/.gemini/antigravity/brain/d22cdf39-aaa4-43b8-92f8-2397d9328ee4/otium_reader_icons';
  fs.mkdirSync(readerPackageDir, { recursive: true });
  await generateSuite(masterReader, readerPackageDir, true);
  // Also save high-res master 1024x1024
  fs.copyFileSync(masterReader, path.join(readerPackageDir, 'master_1024x1024.jpg'));
  console.log('Otium Reader icon suite generated in:', readerPackageDir);

  console.log('ALL ICONS APPLIED AND GENERATED SUCCESSFULLY!');
}

run().catch(console.error);
