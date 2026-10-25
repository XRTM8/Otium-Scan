<div align="center">

# Otium Scan

<p align="center">
  <em>A distraction-free, local-first document scanner.</em><br/>
  Zero watermarks · Zero telemetry · 100% offline document capture.
</p>

<br/>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Android%20·%20Windows-10B981?style=flat-square" alt="Platform" />
  &nbsp;
  <img src="https://img.shields.io/badge/stack-Rust%20·%20Tauri%20v2%20·%20React%2019-111827?style=flat-square" alt="Stack" />
  &nbsp;
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License" />
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#integration">Otium Ecosystem</a> &nbsp;·&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;·&nbsp;
  <a href="#build">Build</a>
</p>

</div>

---

**Otium Scan** is a private, lightweight document scanning companion designed to turn physical books, papers, and notes into clean, compact PDFs.

Built to solve the frustrations of existing scanner apps: no forced accounts, no cloud uploads, no watermarks, and no subscriptions.

---

## Features

- **Automatic Edge Detection** — Identifies document boundaries and automatically applies perspective correction (keystone correction).
- **Paper Clean Filters** — Magic color optimization removes finger shadows, uneven lighting, and paper yellowing while preserving high-contrast text.
- **B&W Document Mode** — High-contrast monochrome thresholding for contracts, receipts, and printouts with ultra-small file sizes.
- **Offline & Private** — All image processing runs locally on your device hardware. No documents ever touch an external server.
- **Compact PDF Export** — Vector-aligned, compressed PDF generation powered by Rust.

---

## Otium Ecosystem Integration

Otium Scan is designed as a focused companion to [**Otium Reader**](https://github.com/XRTM8/Otium):

```
  [ Physical Document ] 
           │
           ▼
    Otium Scan  ─── (One-tap export) ───►  Otium Reader
  (Detect & Clean)                       (Dual-page book spread,
                                          annotations, study)
```

- **Open in Otium** — Directly launch scanned documents inside Otium Reader with one tap into dual-page spread mode.
- **Shared Aesthetic** — Unified dark themes and tactile frosted-glass visual identity.

---

## Architecture

```
otium-scan/
├── src/
│   ├── components/      Camera viewport, crop quad handles, filter switcher
│   ├── core/
│   │   ├── cv/          Perspective warp, adaptive thresholding, shadow removal
│   │   └── pdf/         Rust-powered compact PDF generator
│   └── index.tsx        Entry point
├── src-tauri/           Rust backend & mobile camera transport
└── package.json
```

---

## Build

**Requirements:** Node.js ≥ 18, Rust (stable), JDK 17, Android SDK & NDK.

```bash
# 1. Clone & install
git clone https://github.com/XRTM8/otium-scan.git
cd otium-scan
npm install

# 2. Run Desktop preview
npm run tauri:dev

# 3. Build Android APK
npm run tauri:android
```

---

## License

GNU General Public License v3.0 — see [`LICENSE`](LICENSE).

<div align="center">
  <br/>
  <sub>Built by <a href="https://github.com/XRTM8">XRTM8</a> &nbsp;·&nbsp; Instagram: <a href="https://instagram.com/ma.xrt">@MA.XRT</a> &nbsp;·&nbsp; GPL-3.0</sub>
</div>
