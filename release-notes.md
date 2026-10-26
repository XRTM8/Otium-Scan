# Otium Scan 1.0.0 LTS — Official Milestone & Maintenance-Mode Release

الإصدار الرسمي المستقر الأول طويل الأمد (LTS - Long-Term Support)، واكتمال كافة الميزات والصلابة التشغيلية، والانتقال النهائي إلى مرحلة الصيانة فقط (Maintenance-Only Mode):

## 🌟 أبرز التحديثات في الإصدار v1.0.0 LTS
- **طباعة المستندات مباشرة عبر الطابعات اللاسلكية (Native Direct Print Integration):**
  - زر طباعة مباشر في شريط الإجراءات يفتح محاور الطباعة الرسمي للنظام (`PrintManager` عبر `Intent.createChooser`).
  - دعم الطباعة اللاسلكية المباشرة (Wi-Fi / Mopria / Cloud Print) وحفظ النسخ بصيغة PDF قياسية.
- **استئناف الجلسات غير المكتملة وحماية الذاكرة (Crash Recovery & Session Resume):**
  - كشف تلقائي للجلسات المفتوحة التي لم تُحفظ عند إغلاق التطبيق فجأة أو نفاد البطارية، مع شريط علوي أنيق يتيح "استئناف" الجلسة فوراً أو "تجاهلها".
  - مراقبة سعة تخزين الجهاز (`navigator.storage.estimate`) وتنبيه المستخدم استباقياً في حال انخفاض المساحة المتبقية لمنع انهيار المعالجة.
- **شبكة المعاينة وإعادة الترتيب التفاعلية (Visual Grid Reorder & Bulk Actions):**
  - وضع الشبكة الكاملة (3 أعمدة) لتقليب الصفحات، والتحديد المتعدد، والحذف الجماعي، وإعادة ترتيب الصفحات يميناً ويساراً بنقرة واحدة.
- **منظومة التحديثات المستدامة ثلاثية الطبقات (Bulletproof 3-Tier Updater):**
  - تحديث مباشر من داخل التطبيق ومثبت الحزم الأصلي (`PackageInstaller`) مع تجاوز قيود الـ Rate Limits بنسبة 100% لضمان استمرار التحديث لسنوات قادمة.
- **دليل الصيانة طويل الأجل (Official Maintenance Guide):**
  - إضافة `MAINTENANCE.md` الشامل لتوثيق إجراءات البناء، والتحديث، ورفع إصدارات الـ SDK المستقبلية، وإدارة مفاتيح التوقيع.

---

# Otium Scan 0.2.10 — Bulletproof In-App Auto-Updater Release

الحل النهائي والمستدام لمنظومة التحديثات الذاتية من داخل التطبيق بضمانة استمرار التحديث الدائم:

## 🌟 أبرز التحديثات في الإصدار v0.2.10
- **منظومة اكتشاف التحديثات ثلاثية الطبقات (Triple-Tier Failover Discovery):**
  - **الطبقة 1 (GitHub API الرسمية):** جلب الملاحظات ومقاسات الحزم عبر الجسر الأصلي.
  - **الطبقة 2 (تتبع إعادة التوجيه 302 Web Redirect):** في حال حدوث أي حظر أو تجاوز لحد الـ Rate Limit، يتم جلب الإصدار من مسار الويب العام برصيد طلبات غير محدود نهائياً وبدون أي قيود (Zero Rate Limit).
  - **الطبقة 3 (الـ Raw package.json المباشر):** فحص مباشر من المستودع كطبقة أمان ثالثة تضمن اكتشاف التحديثات حتى لو تم حظر نطاق الـ API بالكامل.
  - **بناء روابط الحزم المباشرة رياضياً:** توليد مسارات التنزيل الصحيحة تلقائياً لمطابقة معمارية معالج المستخدم (`arm64-v8a`, `armeabi-v7a`, `x86_64`).
- **تنزيل وتثبيت الـ APK المباشر من داخل التطبيق (Native In-App Installer):**
  - استخدام `DownloadManager` النظام الرسمي في أندرويد لتنزيل ملف الـ APK في الخلفية مع شريط تقدم نظامي.
  - تشغيل نافذة مثبت الحزم التلقائية (`PackageInstaller` عبر `FileProvider`) فور اكتمال التنزيل لتمكين المستخدم من الضغط على "تحديث / Update" دون الحاجة لفتح المتصفح أو البحث في الملفات.
  - تفعيل صلاحية `REQUEST_INSTALL_PACKAGES` وتوجيه المستخدم لإعدادات المصدر بنقرة واحدة عند الحاجة.

---

# Otium Scan 0.2.9 — Zero-Bug & Native Navigation Release

إصدار الاستقرار المطلق، وسلاسة اللمس 120Hz، ودعم إيماءات نظام أندرويد الأصيل:

## 🌟 أبرز التحديثات في الإصدار v0.2.9
- **دعم زر وإيماءة الرجوع في أندرويد (Hardware Back & Gesture Navigation):**
  - ربط كامل بين `OnBackPressedCallback` في أندرويد ومكدس التنقل الداخلي للتطبيق عبر حدث `otium:back`.
  - إغلاق النوافذ المنبثقة أولاً، ثم الرجوع من شاشات القص والمراجعة للكاميرا، مع تنبيه ذكي وتأكيد نقر مزدوج لمنع فقدان الصفحات غير المحفوظة.
- **تثبيت المكبرة الذكية (Smart Flip Magnifier Loupe):**
  - منع خروج عدسة التكبير عن حدود الشاشة العلوية أو السفلية نهائياً عبر تقييد الإحداثيات والانقلاب الديناميكي.
- **حماية البطارية والحرارة عند تعليق التطبيق:**
  - تجميد دورة الـ CV ومعالجة الإطارات فورياً بمجرد قفل الشاشة أو وضع التطبيق في الخلفية (`document.hidden`).
- **عرض تدريجي فوري في المعاينة (0ms Progressive Rendering):**
  - عرض الصورة المصغرة فوراً عند تقليب الصفحات بالسحب لإلغاء أي تأخير بصري (Zero-stutter)، ثم استبدالها بالدقة الفائقة في الخلفية.
- **محرك OCR متزامن متعدد اللغات (Arabic + English):**
  - خريطة عمال متعددة (`workers Map`) تدعم التعرف على النصوص العربية والإنجليزية معاً (`ara+eng`) مع تحرير كامل للذاكرة عند الإغلاق.

---

# Otium Scan 0.2.8 — Architecture Polish & Clean Enterprise Release

إصدار استقرار وتحسين شامل للهوية البصرية، وتنظيف الشيفرة البرمجية، وتحرير ذاكرة النظام:

## 🌟 أبرز التحديثات في الإصدار v0.2.8
- **تنظيف شامل للأكواد الميتة (Dead Code Elimination):**
  - إزالة `imageWorker.ts` القديم وحزمته غير المستخدمة لمنع تكرار منطق المعالجة.
  - إزالة سكربتات بناء الأيقونات القديمة والمؤقتة (`build-icons.cjs`).
  - تحويل وتخصيص الدوال والواجهات الداخلية غير المصدرة لتسريع عملية الربط وتقليل مساحة الحزمة.
- **إدارة ذكية للذاكرة وتحرير موارد OCR (Memory Leak Prevention):**
  - إنهاء تلقائي لـ WebAssembly Worker الخاص بمحرك Tesseract.js عند مغادرة شاشة المعاينة لتحرير أكثر من 35 ميجابايت من ذاكرة الوصول العشوائي (RAM).
- **اعتماد هوية PAIR 01 ثنائية الألوان مع قنوات RGBA كاملة:**
  - توليد وتضمين حزمة الأيقونات الرسمية بدقة 4 قنوات (RGBA) لجميع قياسات Tauri وسطح المكتب وجميع مجلدات Android Mipmaps (المربعة، والدائرية، والتكيفية Adaptive Foreground).
  - حل مشكلة بناء Rust Macro على بيئة لينكس وGitHub Actions بنسبة 100%.
- **استقرار عدسة الكاميرا بنظام WYSIWYG والحدود الذكية:**
  - احتواء كامل للحساس بنسبة 100% دون قص الحواف أو تشويه الأبعاد.

---



The ultimate privacy-first, ultra-compact mobile document scanner companion to Otium Reader. Distributed strictly as standalone Android APKs per ABI architecture (~7MB).

## 🌟 Major Highlights & Super-Enterprise Features

### 🎯 3D Live Computer Vision & Auto-Capture
- **Real-Time 3D Live Quad Tracking:** High-speed frame analyzer tracks document corners on live camera stream and renders a dynamic pulsating SVG quad mesh overlay at 30fps.
- **Tri-Condition Hands-Free Auto-Capture:** Automatically captures without touching the screen when:
  1. Phone is level (<3.5° deviation).
  2. Document quad is actively tracked.
  3. Laplacian variance focus check confirms image sharpness.
- **Mechanical Acoustic Shutter:** Synthesized SLR dual-stage mechanical shutter click using Web Audio API (100% offline, 0KB assets).

### 🪪 ID Card & Passport 2-in-1 Shooting Mode
- **Dual-Side Alignment:** Guided shooting of Front and Back sides of national IDs, driver licenses, or passports.
- **ISO A4 Standardized Merge:** Automatically composites both sides onto a single ISO A4 document with official ISO/IEC 7810 ID-1 card proportions, rounded corners, subtle shadows, and side markers.

### 🛡️ Privacy Redaction & Anti-Fraud Security
- **Privacy Redaction / Blackout Brush:** Drag your finger over sensitive data, credit card numbers, or signatures to permanently burn `#000000` blackout censorship into pixels before export.
- **Tiled Anti-Fraud Security Watermark Grid:** Toggle between single diagonal stamp or full-page 45° repeating banking-grade security grid.
- **Cryptographic PIN Vault:** 4-digit PIN security hashed with SHA-256 and device-bound salt via `crypto.subtle`.
- **Portable Encrypted Vault Backup:** 1-tap backup and restore of the entire document library via `.otiumvault` portable archive files.

### ⚡ Blazing Speed & Concurrency
- **Non-Blocking Web Worker Pipeline:** Zero-copy Transferable ArrayBuffers offload Sauvola binarization, local background illumination division (Retinex), and grayscale filters from the UI thread, ensuring butter-smooth 60/120 FPS.
- **Ink & Stamp Color Preservation:** Automatically isolates high-saturation ink (blue ballpoint signatures, red official notary stamps) and deepens text while whitening paper to pure `#FFFFFF`.
- **Hardware-Accelerated QR & Barcode Detection:** Instant barcode recognition on invoices and shipping labels with 1-tap Copy and Open actions.

### 📲 Mobile OS Integration
- **Android Native Share Sheet:** 1-tap sharing of compiled PDF documents and single-page JPG images directly to WhatsApp, Gmail, Telegram, and Google Drive.
- **Per-ABI Split APKs:** Distributed strictly as independent architecture packages (`arm64-v8a`, `armeabi-v7a`, `x86_64`) for ultra-compact ~7MB install size.
- **Ecosystem Integration:** Instant handoff to Otium Reader.
