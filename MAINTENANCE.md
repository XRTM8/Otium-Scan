# Otium Scan — Long-Term Maintenance Guide (LTS)

> **Document Status:** Official Maintenance Guide  
> **Release Target:** v1.0.0 LTS  
> **Repository:** [XRTM8/Otium-Scan](https://github.com/XRTM8/Otium-Scan)

---

## 📌 Maintenance-Only Policy

Starting with **v1.0.0 LTS**, `Otium Scan` has reached complete feature maturity and enters the **Maintenance-Only** phase:

- **Core Goal:** Maximum stability, zero regressions, 120 FPS UI smoothness, offline independence, and permanent operational longevity.
- **Allowed Changes:** Security patches, Android OS SDK compliance bumps (e.g. Target SDK 35/36), critical bug fixes, or minor cosmetic adjustments.
- **Forbidden Changes:** Large architectural rewrites, adding heavy third-party cloud dependencies, or changing the lightweight offline-first philosophy.

---

## 🏛️ Architecture Overview & Code Map

```
otium-scan/
├── src/                                  # Frontend UI & Logic (React 19 + TypeScript + Vite)
│   ├── App.tsx                           # Master navigation, back gestures, session recovery
│   ├── components/                       # UI Views
│   │   ├── CameraView.tsx                # 3D live quad tracking, audio shutter, ID card mode
│   │   ├── CropView.tsx                  # 4-point perspective warp, smart magnifier loupe
│   │   ├── EnhanceView.tsx               # Filters, thumbnail strip, grid reorder, PDF export & print
│   │   ├── DocumentLibrary.tsx           # Offline vault, PIN encryption, search, backup/restore
│   │   ├── SignatureModal.tsx            # High-resolution vector signature pad
│   │   ├── SettingsModal.tsx             # Preferences & in-app auto-updater trigger
│   │   └── OtiumLogo.tsx                 # Official brand logo
│   └── core/                             # Algorithmic engine (zero cloud dependencies)
│       ├── barcode.ts                    # Barcode & QR detection (BarcodeDetector / zbar)
│       ├── edgeDetection.ts              # OpenCV-free Canny + Hull Quad detection
│       ├── geometry.ts                   # Perspective matrix transformation & book dewarping
│       ├── nativeBridge.ts               # Android JavascriptInterface bridge (Share, Save, Print)
│       ├── ocr/ocrEngine.ts              # Tesseract.js WASM engine (Arabic + English)
│       ├── pdf.ts                        # jsPDF builder (A4/Letter, compression presets, watermarks)
│       ├── storage/                      # IndexedDB + localStorage persistence
│       └── updater.ts                    # 3-Tier failover in-app update detector
│
├── src-tauri/                            # Tauri 2 Native Layer
│   ├── Cargo.toml                        # Rust dependencies & metadata
│   ├── tauri.conf.json                   # Window configs, bundle identifiers & permissions
│   ├── src/lib.rs                        # Rust entry point
│   └── gen/android/                      # Generated Android native shell
│       ├── app/src/main/AndroidManifest.xml # Permissions (Camera, Install packages, FileProvider)
│       ├── app/src/main/java/com/otium/scan/MainActivity.kt # Native bridge implementation
│       └── app/build.gradle.kts          # Android build targets, SDK versions & signing
│
├── .github/workflows/                    # CI/CD Workflows
│   ├── release.yml                       # Multi-ABI Android APK builder & GitHub release publisher
│   └── build-test.yml                    # Automated PR/push verification
│
├── scripts/
│   └── check-version.mjs                 # Version parity validator across all project files
└── MAINTENANCE.md                        # This document
```

---

## 🚀 How Releases Work (Continuous Delivery)

Releases are fully automated via GitHub Actions:

### 1. Version Bump Process
Whenever a new maintenance release or patch is needed:
1. Update version in:
   - `package.json` (`version`)
   - `src-tauri/Cargo.toml` (`version` under `[package]`)
   - `src-tauri/tauri.conf.json` (`version`)
   - `src/core/updater.ts` (`CURRENT_VERSION`)
2. Run the version validator:
   ```bash
   node scripts/check-version.mjs v1.X.X
   ```
3. Update `release-notes.md` with release highlights.

### 2. Triggering the Automated Build
Push a git tag matching the version format:
```bash
git add .
git commit -m "chore(release): v1.X.X"
git tag v1.X.X
git push origin main --tags
```
GitHub Actions (`.github/workflows/release.yml`) will automatically:
1. Checkout the repository.
2. Setup Node.js 20, Java 17, and Rust `nightly`/`stable` with Android targets (`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`).
3. Compile per-ABI split APKs (`arm64-v8a`, `armeabi-v7a`, `x86_64`).
4. Sign APKs with the release keystore stored in GitHub Secrets.
5. Create a GitHub Release, attach the APKs, and publish release notes.

---

## 🔄 In-App Auto-Updater: Architectural Guarantee

The updater in `src/core/updater.ts` is designed for **permanent operational continuity** (guaranteed to work across 10+ future updates without failure):

1. **Tier 1 (GitHub Releases API):**
   - Directly queries `https://api.github.com/repos/XRTM8/Otium-Scan/releases/latest`.
   - Uses `nativeFetchUrl` via `MainActivity.kt` to bypass Webview CSP/CORS restrictions.
2. **Tier 2 (HTTP 302 Location Header Redirect):**
   - If Tier 1 is rate-limited (HTTP 403 / 0 remaining quota), it queries `https://github.com/XRTM8/Otium-Scan/releases/latest`.
   - GitHub always returns a 302 redirect with the tag name in the `Location` header (`/tag/vX.Y.Z`).
   - **Zero Rate Limits:** Web redirect inspection requires no GitHub tokens and allows infinite requests.
3. **Tier 3 (Raw Git Manifest):**
   - Direct fetch of `raw.githubusercontent.com/.../package.json` as a final fallback.
4. **Native Installation:**
   - Native Android `DownloadManager` downloads the APK with system progress notifications.
   - When finished, `PackageInstaller` is triggered via `FileProvider` (`content://com.otium.scan.fileprovider/...`).
   - Requires `android.permission.REQUEST_INSTALL_PACKAGES` which is pre-configured.

---

## 🛠️ Routine Maintenance Operations

### 1. Bumping Android Target SDK (Google Play / Android OS Updates)
When Google requires a higher `targetSdkVersion`:
1. Open `src-tauri/gen/android/app/build.gradle.kts`.
2. Locate the `android` block:
   ```kotlin
   defaultConfig {
       compileSdk = 35 // Bump to latest
       targetSdk = 35  // Bump to latest
       minSdk = 26     // Android 8.0 Oreo minimum
   }
   ```
3. Test compilation:
   ```bash
   npm run build
   cd src-tauri && cargo check
   ```

### 2. Updating Node/NPM Dependencies
To keep security vulnerabilities at zero:
```bash
npm audit
npm update
npm run build
```
*Note:* Do not upgrade to unvetted major breaking versions of libraries without verifying compatibility with React 19.

### 3. Updating Rust / Cargo Dependencies
```bash
cd src-tauri
cargo update
cargo check
```

### 4. Updating App Icons
App icons are located in:
- Android: `src-tauri/gen/android/app/src/main/res/mipmap-*`
- Desktop/Tauri: `src-tauri/icons/`

Icons must always be 32-bit RGBA PNG files. Never place RGB-only (3-channel) PNGs in `src-tauri/icons/` as this breaks Tauri's icon compiler.

---

## 🔍 Local Verification & Quality Checklist

Before committing any future maintenance update, always execute:

| Step | Command | Expected Output |
| :--- | :--- | :--- |
| **1. TypeScript & Vite Build** | `npm run build` | `✓ built in <1s` (0 errors) |
| **2. Rust Typecheck** | `cd src-tauri && cargo check` | `Finished ... in <3s` (0 errors) |
| **3. Version Parity Check** | `node scripts/check-version.mjs <tag>` | `✓ All version checks passed!` |
| **4. Git Working Tree** | `git status` | Clean, no stray or untracked files |

---

*Otium Scan is engineered to run cleanly and sustainably for years to come.*
