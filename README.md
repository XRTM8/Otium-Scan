<div align="center">

# Otium Scan

<p align="center">
  <em>otium</em> &nbsp;/ˈoː.ti.um/&nbsp; <sup>n. Latin</sup><br/>
  A distraction-free, local-first document scanner companion for <a href="https://github.com/XRTM8/Otium">Otium Reader</a>.<br/>
  Zero telemetry &nbsp;·&nbsp; Zero forced accounts &nbsp;·&nbsp; 100% offline document capture
</p>

<br/>

<p align="center">
  <a href="https://github.com/XRTM8/Otium-Scan/releases/latest">
    <img src="https://img.shields.io/github/v/release/XRTM8/Otium-Scan?style=flat-square&color=10B981&label=release" alt="Release" />
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/platform-Android-10B981?style=flat-square" alt="Platform" />
  &nbsp;
  <img src="https://img.shields.io/badge/stack-Rust%20·%20Tauri%20v2%20·%20React%2019-111827?style=flat-square" alt="Stack" />
  &nbsp;
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License" />
  </a>
</p>

<p align="center">
  <a href="#downloads">Downloads</a> &nbsp;·&nbsp;
  <a href="#about-the-name--فلسفة-الاسم">About the Name</a> &nbsp;·&nbsp;
  <a href="#companion-app-otium-reader--التطبيق-المرافق">Companion App</a> &nbsp;·&nbsp;
  <a href="#project-status--حالة-المشروع">Project Status</a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;·&nbsp;
  <a href="#build">Build</a>
</p>

</div>

---

**Otium Scan** is a private, lightweight document scanner for Android. It turns physical books, paper notes, academic handouts, and contracts into clean, high-contrast, compact PDF documents without ads, watermarks, or subscription paywalls.

All computer vision and PDF rendering pipelines execute directly on the device hardware using WebAssembly and Rust. No documents or telemetry ever leave your device.

The interface is fully localized in **English and Arabic** (RTL layout, full right-to-left navigation).

---

## About the Name · فلسفة الاسم

> **Otium** /ˈoː.ti.um/ *(noun, Latin)*: In classical Roman philosophy (Seneca, Cicero), *otium* was the deliberate time set aside for intellectual study, reading, writing, and tranquil contemplation. Its antithesis was **negotium** (*nec-otium*): business, worldly hurry, commercial obligation, and noise.

Mainstream document scanning apps have become the embodiment of *negotium*: invasive telemetry trackers, aggressive annual subscriptions, forced cloud accounts, and watermarks plastered across your homework or contracts.

**Otium Scan** was built to protect the quiet study routine: photograph your paper, adjust the corners if needed, apply a clean paper filter, and produce a sharp, lightweight PDF instantly on your own hardware without interference.

**باللغة العربية:**  
اسم **أوتيوم (Otium)** كلمة لاتينية تعني الوقت المخصص للقراءة المتأنية، الفكر الهادئ، والتأمل المعرفي بعيداً عن صخب الأعمال والضغوطات اليومية (*Negotium*).  
تطبيقات المسح الضوئي التقليدية امتلأت بالإعلانات المزعجة، الاشتراكات الإجبارية، والعلامات المائية القسرية. أتى **أوتيوم سكان** ليقدم حلاً بسيطاً، محلياً، ونظيفاً: التقط صورة للورقة أو الكتاب، اضبط الحواف، وحوّلها إلى ملف PDF عالي الوضوح بدون إعلانات وبدون إرسال أي معلومة إلى أي خادم خارجي.

---

## Companion App: Otium Reader · التطبيق المرافق

Otium Scan is designed to integrate directly with [**Otium Reader**](https://github.com/XRTM8/Otium) — a local-first, distraction-free PDF and e-book reader.

```
  [ Physical Textbook / Notes ] 
                 │
                 ▼
          Otium Scan
  • Corner detection & perspective warp
  • Document cleaning & B&W filters
  • Rust-powered compact PDF engine
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
[ Save / Share ]    [ Open in Otium Reader ]
(Storage, Print)    (Dual-page book spread, annotations, study)
```

- **One-Tap "Open in Reader"** — Export your scan directly into Otium Reader's dual-page spread mode for immediate reading and annotation.
- **Shared Design Language** — Matching OLED dark surfaces, tactile emerald accents, and bilingual typography (Tajawal & Plus Jakarta Sans).

---

## Project Status & Honesty · حالة المشروع

> [!NOTE]
> **Active Development / المشروع قيد التطوير النشط:**  
> This project is an independent personal open-source tool developed by a student. While functional and actively used for academic study, **it is still in active development**.  
>  
> Camera sensors, lens distortions, camera APIs, and screen aspect ratios differ widely across Android manufacturers (Samsung, Xiaomi, Pixel, Transsion, etc.). You may encounter edge cases, layout quirks, or imperfect edge detection in challenging lighting conditions. We make no corporate claims of perfection.  
>  
> If you encounter a bug or unexpected behavior, please [open an issue on GitHub](https://github.com/XRTM8/Otium-Scan/issues) with your device model, Android version, and steps to reproduce. Every report directly helps improve the application for everyone.
>  
> **ملاحظة للمستخدمين باللغة العربية:**  
> هذا التطبيق مشروع مفتوح المصدر (FOSS) نابع من جهد شخصي ومستمر، وهو قيد التطوير والتجربة. نظراً للتباين الكبير بين كاميرات الهواتف الذكية وحساساتها وظروف الإضاءة وأبعاد الشاشات، قد تواجه بعض المشاكل غير المتوقعة أو عدم الدقة في التقاط حواف معينة. لا نعد بكمال تجاري زائف؛ بل نرحب بكل تجربة وبلاغ خطأ على صفحة الـ Issues لمساعدتنا في سد الثغرات وتطوير التطبيق باستمرار.

---

## Downloads

[**GitHub Releases →**](https://github.com/XRTM8/Otium-Scan/releases/latest)

| Platform | Package | Architecture | Notes |
| :--- | :--- | :--- | :--- |
| Android | `Otium_Scan_<version>_universal.apk` | ARM64, ARMv7, x86_64 | Android 7.0+ (API 24+) |

---

## Features

- **Full-Frame by Default** — Captures the full photograph without aggressive automated zoom or accidental text cropping.
- **Perspective Correction (Keystone)** — Quad detection with tactile draggable corners and edge handles for angle correction.
- **Paper Clean Filters** — Contrast enhancement that neutralizes uneven room lighting and paper yellowing while keeping text sharp.
- **B&W Monochrome Mode** — Adaptive thresholding producing ultra-small file sizes suitable for printouts, contracts, and receipts.
- **Book Dewarping** — Curve adjustment tools for flattening bound book spines.
- **Privacy & Security Watermarking** — Optional diagonal or tiled custom watermark text and hand-drawn vector signature placement before export.
- **100% Offline & Local** — Zero telemetry, no analytics, no external network requests.
- **No Watermarks Enforced** — Your documents belong to you. No promotional branding is ever added to your output.

---

## Architecture

```
otium-scan/
├── src/
│   ├── components/      CameraView, CropView, EnhanceView, modals
│   ├── core/
│   │   ├── geometry.ts  Homography matrix, perspective warp, quad validation
│   │   ├── edgeDetection.ts Gradient analysis & corner identification
│   │   ├── filters.ts   Color enhancement, B&W threshold, greyscale
│   │   └── pdf.ts       Client-side vector-aligned PDF compilation
│   └── index.tsx        Application entry point
├── src-tauri/           Rust backend & Android camera interface
└── scripts/             Version verification & release utilities
```

---

## Build

**Requirements:**
- Node.js ≥ 18
- Rust (latest stable)
- JDK 17 *(Android build)*
- Android SDK & NDK *(Android build)*

```bash
# 1. Clone repository
git clone https://github.com/XRTM8/Otium-Scan.git
cd Otium-Scan
npm install

# 2. Run Desktop preview
npm run tauri:dev

# 3. Build Android APK
npm run tauri:android

# 4. Verify version consistency
node scripts/check-version.mjs <vX.Y.Z>
```

---

## Contributing

Contributions, feedback, and bug reports are welcome. Please open an issue to discuss significant changes before submitting a pull request.

---

## License

GNU General Public License v3.0 — see [`LICENSE`](LICENSE).

<div align="center">
  <br/>
  <sub>Built by <a href="https://github.com/XRTM8">XRTM8</a> &nbsp;·&nbsp; Instagram: <a href="https://instagram.com/ma.xrt">@MA.XRT</a> &nbsp;·&nbsp; GPL-3.0</sub>
</div>
