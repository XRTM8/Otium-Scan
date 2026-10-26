import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Zap,
  ZapOff,
  ScanLine,
  Sparkles,
  CreditCard,
  FileCheck2,
  FileText,
} from 'lucide-react';
import { OtiumLogo } from './OtiumLogo';
import { playShutterSound } from '../core/audio';
import { mergeIdCardSidesToA4 } from '../core/idCard';
import { calculateLaplacianSharpness } from '../core/edgeDetection';

interface CameraViewProps {
  onCapture: (imageDataUrl: string, isBatchMode: boolean) => void;
  pagesCount: number;
  lastThumbnail?: string;
  onFinishBatch: () => void;
  onOpenLibrary?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  pagesCount,
  lastThumbnail,
  onFinishBatch,
  onOpenLibrary,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanMode, setScanMode] = useState<'batch' | 'single' | 'idcard'>('batch');
  const [idCardStep, setIdCardStep] = useState<'front' | 'back'>('front');
  const [idFrontDataUrl, setIdFrontDataUrl] = useState<string | null>(null);
  const [idStatusToast, setIdStatusToast] = useState<string>('');
  const [capturing, setCapturing] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [captureToast, setCaptureToast] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initCamera = useCallback(async () => {
    // Ultra-compatible camera constraints for Android WebView
    const constraintList: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
      {
        video: { facingMode: 'environment' },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let acquiredStream: MediaStream | null = null;
    for (const constraints of constraintList) {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (acquiredStream) break;
      } catch (err) {
        console.warn('Camera constraint tier failed, trying next:', err);
      }
    }

    if (acquiredStream) {
      setStream(acquiredStream);
      setHasPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = acquiredStream;
        videoRef.current.play().catch(console.warn);
      }
    } else {
      console.warn('All camera constraints failed');
      setHasPermission(false);
    }
  }, []);

  useEffect(() => {
    initCamera();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTorchOn(false);
        setStream((prev) => {
          if (prev) {
            prev.getTracks().forEach((t) => t.stop());
          }
          return null;
        });
      } else {
        initCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setStream((prevStream) => {
        if (prevStream) {
          prevStream.getTracks().forEach((track) => track.stop());
        }
        return null;
      });
    };
  }, [initCamera]);

  // Synchronize stream with video DOM element reliably
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch((err) => {
        console.warn('Video auto-play interrupted:', err);
      });
    }
  }, [stream]);

  const triggerHaptic = (duration = 25) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  };

  const handleCapture = useCallback(async () => {
    if (capturing) return;
    triggerHaptic(35);
    playShutterSound();
    setCapturing(true);

    // Shutter flash animation
    setFlashAnimation(true);
    setTimeout(() => setFlashAnimation(false), 120);

    const processCapturedImage = async (dataUrl: string) => {
      if (scanMode === 'idcard') {
        if (idCardStep === 'front') {
          setIdFrontDataUrl(dataUrl);
          setIdCardStep('back');
          setIdStatusToast('✓ تم تصوير الوجه الأمامي — الآن اقلب الهوية وصور الوجه الخلفي');
          setTimeout(() => setIdStatusToast(''), 3500);
          setCapturing(false);
          return;
        } else if (idFrontDataUrl) {
          setIdStatusToast('⏳ جاري دمج وجهي الهوية على ورقة A4...');
          try {
            const [frontImg, backImg] = await Promise.all([
              new Promise<HTMLImageElement>((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = idFrontDataUrl;
              }),
              new Promise<HTMLImageElement>((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = dataUrl;
              }),
            ]);

            const makeCanvas = (img: HTMLImageElement) => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              const ctx = c.getContext('2d');
              if (ctx) ctx.drawImage(img, 0, 0);
              return c;
            };

            const mergedCanvas = await mergeIdCardSidesToA4(makeCanvas(frontImg), makeCanvas(backImg));
            const mergedDataUrl = mergedCanvas.toDataURL('image/jpeg', 0.92);

            setIdFrontDataUrl(null);
            setIdCardStep('front');
            setIdStatusToast('');
            setCapturing(false);
            setCaptureToast('✓ تم دمج الهوية بنجاح!');
            setTimeout(() => setCaptureToast(''), 2000);
            onCapture(mergedDataUrl, false);
            return;
          } catch (e) {
            console.warn('ID Card merge failed:', e);
          }
        }
      }

      setCapturing(false);
      const isBatch = scanMode === 'batch';
      setCaptureToast(isBatch ? `✓ تمت إضافة صفحة ${pagesCount + 1}` : '✓ تم حفظ الصورة');
      setTimeout(() => setCaptureToast(''), 1800);
      onCapture(dataUrl, isBatch);
    };

    const checkCanvasNonBlack = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
      try {
        const pts = [
          { x: Math.floor(w * 0.5), y: Math.floor(h * 0.5) },
          { x: Math.floor(w * 0.25), y: Math.floor(h * 0.25) },
          { x: Math.floor(w * 0.75), y: Math.floor(h * 0.25) },
          { x: Math.floor(w * 0.25), y: Math.floor(h * 0.75) },
          { x: Math.floor(w * 0.75), y: Math.floor(h * 0.75) },
          { x: Math.floor(w * 0.5), y: Math.floor(h * 0.3) },
          { x: Math.floor(w * 0.5), y: Math.floor(h * 0.7) },
        ];
        let total = 0;
        for (const p of pts) {
          const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
          total += pixel[0] + pixel[1] + pixel[2];
        }
        const avg = total / (pts.length * 3);
        return avg >= 5; // Valid non-black frame
      } catch {
        return true;
      }
    };

    const tryGrabFrame = async (): Promise<string | null> => {
      if (!stream) return null;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;

      const ImageCaptureConstructor = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => any }).ImageCapture;
      if (typeof ImageCaptureConstructor === 'function') {
        try {
          const capturer = new ImageCaptureConstructor(track);
          if (typeof capturer.grabFrame === 'function') {
            const bitmap = await capturer.grabFrame();
            if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
              const canvas = document.createElement('canvas');
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bitmap, 0, 0);
                if (checkCanvasNonBlack(ctx, canvas.width, canvas.height)) {
                  return canvas.toDataURL('image/jpeg', 0.95);
                }
              }
            }
          }
        } catch (e) {
          console.warn('ImageCapture.grabFrame fallback:', e);
        }
      }
      return null;
    };

    const tryTakePhoto = async (): Promise<string | null> => {
      if (!stream) return null;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;

      const ImageCaptureConstructor = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => any }).ImageCapture;
      if (typeof ImageCaptureConstructor === 'function') {
        try {
          const capturer = new ImageCaptureConstructor(track);
          if (typeof capturer.takePhoto === 'function') {
            const blob: Blob = await capturer.takePhoto();
            if (blob && blob.size > 2000) {
              return await new Promise<string>((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result as string);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
              });
            }
          }
        } catch (e) {
          console.warn('ImageCapture.takePhoto fallback:', e);
        }
      }
      return null;
    };

    const tryVideoCanvas = async (): Promise<string | null> => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (!checkCanvasNonBlack(ctx, canvas.width, canvas.height)) {
        await new Promise((r) => requestAnimationFrame(r));
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      return canvas.toDataURL('image/jpeg', 0.95);
    };

    try {
      let dataUrl = await tryGrabFrame();
      if (!dataUrl) {
        dataUrl = await tryTakePhoto();
      }
      if (!dataUrl) {
        dataUrl = await tryVideoCanvas();
      }

      if (dataUrl) {
        await processCapturedImage(dataUrl);
      } else {
        fileInputRef.current?.click();
        setCapturing(false);
      }
    } catch (err) {
      console.warn('Capture error:', err);
      fileInputRef.current?.click();
      setCapturing(false);
    }
  }, [capturing, idCardStep, idFrontDataUrl, onCapture, pagesCount, scanMode, stream]);

  // Enterprise Hands-Free Auto-Capture Engine
  useEffect(() => {
    if (!autoCaptureEnabled || hasPermission !== true) return;

    let isChecking = false;
    let steadyCount = 0;
    let lastSharpness = 0;
    let lastCaptureTime = 0;

    const intervalId = setInterval(async () => {
      const now = Date.now();
      if (isChecking || capturing || now - lastCaptureTime < 2800) return;
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

      isChecking = true;
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 160;
        testCanvas.height = Math.round(160 * (video.videoHeight / video.videoWidth));
        const ctx = testCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, testCanvas.width, testCanvas.height);
          const currentSharpness = calculateLaplacianSharpness(testCanvas);

          // Focus check: sharp image with minimal motion blur
          if (currentSharpness > 45 && Math.abs(currentSharpness - lastSharpness) < 25) {
            steadyCount++;
            if (steadyCount >= 2) {
              steadyCount = 0;
              lastCaptureTime = Date.now();
              setCaptureToast('🎯 ثبات تام — التقاط تلقائي');
              await handleCapture();
            }
          } else {
            steadyCount = 0;
          }
          lastSharpness = currentSharpness;
        }
      } catch (e) {
        console.warn('Auto-capture check error:', e);
      } finally {
        isChecking = false;
      }
    }, 450);

    return () => clearInterval(intervalId);
  }, [autoCaptureEnabled, hasPermission, capturing, handleCapture]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Support importing multiple photos from gallery at once
    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result, scanMode === 'batch');
          if (index === files.length - 1) {
            setCaptureToast(`✓ تم استيراد ${files.length} صورة من المعرض`);
            setTimeout(() => setCaptureToast(''), 2200);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    try {
      const capabilities = track.getCapabilities?.() as { torch?: boolean };
      if (capabilities?.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
        });
        setTorchOn(!torchOn);
        triggerHaptic(15);
      }
    } catch (e) {
      console.warn('Torch unsupported:', e);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Visual Shutter Flash */}
      {flashAnimation && <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-150" />}

      {/* Floating Status Toast */}
      {captureToast && (
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="px-5 py-2.5 rounded-full bg-emerald-500 text-black font-black text-xs shadow-2xl border border-white/20 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4" />
            <span>{captureToast}</span>
          </span>
        </div>
      )}

      {/* Floating ID Card Status Toast */}
      {idStatusToast && (
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
          <span className="px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-bold text-xs shadow-2xl flex items-center gap-2 border border-white/20">
            <CreditCard className="w-4 h-4" />
            <span>{idStatusToast}</span>
          </span>
        </div>
      )}

      {/* Top Header Bar — Clean 2-column layout */}
      <div className="relative z-20 flex items-center justify-between px-5 pt-12 pb-3.5 otium-chrome border-b border-white/[0.08]">
        {/* Brand Badge — Taps to Vault */}
        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenLibrary?.();
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-button hover:border-emerald-500/40 active:scale-95 transition-all shadow-sm"
          title="خزنة المستندات / Documents Vault"
        >
          <OtiumLogo size={20} className="text-emerald-400" />
          <div className="flex items-baseline gap-1">
            <span className="text-white text-xs font-black tracking-widest">OTIUM</span>
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider px-1 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
              SCAN
            </span>
          </div>
        </button>

        {/* Quick Flashlight & Auto Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic(15);
              setAutoCaptureEnabled(!autoCaptureEnabled);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              autoCaptureEnabled
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                : 'glass-button text-gray-300'
            }`}
            title="التقاط تلقائي عند ثبات الهاتف"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>تلقائي</span>
          </button>

          <button
            onClick={toggleTorch}
            className={`p-2 rounded-full glass-button transition-colors ${
              torchOn ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-gray-300'
            }`}
            title="فلاش الكاميرا / Flashlight"
          >
            {torchOn ? <Zap className="w-4 h-4 fill-emerald-400" /> : <ZapOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewfinder Screen */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          disablePictureInPicture
          onLoadedMetadata={() => {
            videoRef.current?.play().catch(console.warn);
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Fallback state when permission is pending or denied */}
        {hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 p-6 text-center z-30">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Camera className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-bold text-white font-arabic">إذن الكاميرا مطلوب</h3>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed font-arabic">
              يرجى منح صلاحية الكاميرا لمسح المستندات وتجميعها في ملف PDF، أو اختر صوراً من الاستوديو.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => {
                  triggerHaptic(20);
                  initCamera();
                }}
                className="px-5 py-2.5 bg-emerald-500 text-black font-bold text-xs rounded-xl active:scale-95 transition-transform"
              >
                تفعيل الكاميرا
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 glass-button text-gray-300 font-medium text-xs rounded-xl active:scale-95 transition-transform"
              >
                اختيار من المعرض
              </button>
            </div>
          </div>
        )}

        {/* Viewfinder Framing Guide — Sleek corner brackets without center clutter */}
        <div className="pointer-events-none absolute inset-x-6 inset-y-12 border border-emerald-500/20 rounded-2xl">
          <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
          <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
          <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

          {/* Simple non-intrusive status pill at the bottom of the viewfinder */}
          <div className="absolute bottom-4 inset-x-0 text-center">
            <span className="text-xs bg-black/70 backdrop-blur-md px-4 py-2 rounded-full text-gray-200 border border-white/10 inline-flex items-center justify-center gap-2 font-arabic shadow-lg">
              {scanMode === 'idcard' ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{idCardStep === 'front' ? 'ضع الوجه الأمامي للهوية داخل الإطار' : 'ضع الوجه الخلفي للهوية'}</span>
                </span>
              ) : pagesCount > 0 ? (
                <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{pagesCount} صفحات مجمعة — التقط المزيد أو اضغط إنهاء</span>
                </span>
              ) : (
                <span className="text-gray-300">وجّه الكاميرا نحو المستند ثم اضغط زر الالتقاط</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Mode Switcher Bar — Positioned above shutter dock like CamScanner */}
      <div className="relative z-20 flex justify-center py-2.5 px-4 bg-gradient-to-t from-[#07090e] via-[#07090e]/90 to-transparent">
        <div className="flex items-center p-1 rounded-full bg-white/[0.08] border border-white/[0.1] shadow-lg">
          <button
            onClick={() => {
              triggerHaptic(10);
              setScanMode('batch');
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              scanMode === 'batch'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>متعدد (تجميع PDF)</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic(10);
              setScanMode('single');
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              scanMode === 'single'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            مفرد
          </button>

          <button
            onClick={() => {
              triggerHaptic(10);
              setScanMode('idcard');
              setIdCardStep('front');
              setIdFrontDataUrl(null);
            }}
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              scanMode === 'idcard'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>هوية</span>
          </button>
        </div>
      </div>

      {/* Bottom Shutter Dock — CamScanner Layout */}
      <div className="relative z-20 flex items-center justify-around px-8 pt-2 pb-10 otium-chrome border-t border-white/[0.08]">
        {/* Left: Gallery Import */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1 p-3 rounded-2xl glass-button text-gray-300 active:scale-90 transition-transform"
          title="استيراد من المعرض / Import from Gallery"
        >
          <ImageIcon className="w-6 h-6 text-gray-200" />
          <span className="text-[10px] text-gray-400 font-arabic">المعرض</span>
        </button>

        {/* Center: Tactile Shutter Button */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-emerald-500/30 p-1 active:scale-95 transition-transform disabled:opacity-50"
          title="التقاط صورة"
        >
          <div className="w-full h-full rounded-full bg-emerald-500 emerald-glow flex items-center justify-center shadow-2xl">
            <div className={`w-8 h-8 rounded-full bg-white/25 ${capturing ? 'animate-ping' : ''}`} />
          </div>
        </button>

        {/* Right: CamScanner Multi-Page Review & Finish Button */}
        {pagesCount > 0 ? (
          <button
            onClick={() => {
              triggerHaptic(20);
              onFinishBatch();
            }}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform group"
            title="إنهاء ومراجعة ملف الـ PDF"
          >
            <div className="relative w-14 h-14 rounded-2xl border-2 border-emerald-400 bg-black overflow-hidden shadow-xl ring-2 ring-emerald-500/30">
              {lastThumbnail ? (
                <img src={lastThumbnail} alt="Page preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-emerald-950">
                  <FileText className="w-6 h-6 text-emerald-400" />
                </div>
              )}
              {/* Count badge */}
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-black flex items-center justify-center ring-2 ring-black">
                {pagesCount}
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-400 font-arabic">
              تجميع PDF ✓
            </span>
          </button>
        ) : (
          <div className="w-14 h-14 flex items-center justify-center opacity-30">
            <FileText className="w-6 h-6 text-gray-500" />
          </div>
        )}
      </div>

      {/* Hidden Gallery File Input (supports multiple selections) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
