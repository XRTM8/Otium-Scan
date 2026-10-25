import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Zap,
  ZapOff,
  CheckCheck,
  FolderArchive,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { playShutterSound } from '../core/audio';

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
  const [scanMode, setScanMode] = useState<'single' | 'batch'>('batch'); // default to fast batch
  const [capturing, setCapturing] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const [tilt, setTilt] = useState<{ x: number; y: number; isLevel: boolean }>({
    x: 0,
    y: 0,
    isLevel: false,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const roll = Math.max(-20, Math.min(20, e.gamma));
      const rawPitch = e.beta > 90 ? e.beta - 180 : e.beta;
      const pitch = Math.max(-20, Math.min(20, rawPitch));

      const isLevel = Math.abs(roll) < 3.5 && Math.abs(pitch) < 3.5;
      setTilt({ x: roll, y: pitch, isLevel });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 4096 },
            height: { ideal: 2160 },
          },
          audio: false,
        });

        currentStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
        }
        setHasPermission(true);
      } catch (err) {
        console.warn('Camera stream fallback to upload:', err);
        setHasPermission(false);
      }
    }

    initCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

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

    // Trigger visual shutter flash
    setFlashAnimation(true);
    setTimeout(() => setFlashAnimation(false), 120);

    try {
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if ('ImageCapture' in window) {
          try {
            const imageCapture = new (window as any).ImageCapture(track);
            const blob: Blob = await imageCapture.takePhoto({
              imageWidth: 4000,
              imageHeight: 3000,
            });

            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                setCapturing(false);
                onCapture(reader.result, scanMode === 'batch');
              }
            };
            reader.readAsDataURL(blob);
            return;
          } catch {
            // fallback below
          }
        }
      }

      if (videoRef.current && videoRef.current.videoWidth > 0) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          setCapturing(false);
          onCapture(dataUrl, scanMode === 'batch');
          return;
        }
      }

      fileInputRef.current?.click();
    } catch {
      fileInputRef.current?.click();
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture, scanMode, stream]);

  // Hands-Free Auto-Capture Monitor: Triggers snap when document is steady & level
  useEffect(() => {
    if (!autoCaptureEnabled || capturing) {
      setAutoCaptureProgress(0);
      return;
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    if (tilt.isLevel) {
      interval = setInterval(() => {
        setAutoCaptureProgress((prev) => {
          if (prev >= 100) {
            handleCapture();
            return 0;
          }
          return prev + 14; // ~450ms smooth countdown
        });
      }, 50);
    } else {
      setAutoCaptureProgress(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoCaptureEnabled, tilt.isLevel, capturing, handleCapture]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result, false);
        }
      };
      reader.readAsDataURL(file);
    }
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
    <div className="relative w-full h-full bg-black flex flex-col justify-between overflow-hidden">
      {/* Visual Shutter Flash */}
      {flashAnimation && <div className="absolute inset-0 z-50 bg-white pointer-events-none" />}

      {/* Top Header Bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-12 pb-4 glass-panel border-b-0">
        <div className="flex items-center gap-2">
          {onOpenLibrary && (
            <button
              onClick={() => {
                triggerHaptic(15);
                onOpenLibrary();
              }}
              className="p-2 rounded-xl glass-button text-emerald-400 active:scale-90"
              title="Saved Documents Library"
            >
              <FolderArchive className="w-4 h-4" />
            </button>
          )}
          <span className="text-sm font-semibold tracking-wider text-emerald-400 uppercase">
            Otium Scan
          </span>
        </div>

        {/* Scan Mode Switcher (Single vs Rapid Batch) & Tools */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 rounded-full bg-white/10 border border-white/10 text-xs">
            <button
              onClick={() => {
                triggerHaptic(10);
                setScanMode('single');
              }}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                scanMode === 'single'
                  ? 'bg-emerald-500 text-black font-semibold shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => {
                triggerHaptic(10);
                setScanMode('batch');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-all ${
                scanMode === 'batch'
                  ? 'bg-emerald-500 text-black font-semibold shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              <ScanLine className="w-3 h-3" />
              <span>Batch</span>
            </button>
          </div>

          {/* Hands-Free Auto Capture Toggle */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setAutoCaptureEnabled(!autoCaptureEnabled);
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
              autoCaptureEnabled
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                : 'glass-button text-gray-300'
            }`}
            title="Hands-Free Auto Capture (snaps automatically when steady)"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto</span>
          </button>

          <button
            onClick={toggleTorch}
            className="p-2 rounded-full glass-button text-gray-300 active:text-emerald-400"
            title="Flashlight"
          >
            {torchOn ? <Zap className="w-4 h-4 text-emerald-400" /> : <ZapOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewfinder */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
        {hasPermission ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="text-center px-6">
            <Camera className="w-16 h-16 mx-auto mb-4 text-emerald-400/60" />
            <p className="text-gray-300 text-sm mb-4">
              Tap below to take a photo or import from your gallery
            </p>
          </div>
        )}

        {/* Viewfinder Framing Guide */}
        <div className="pointer-events-none absolute inset-x-8 inset-y-16 border-2 border-emerald-500/30 rounded-2xl">
          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

          {/* Gyroscope Spirit Level Bubble */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${
                tilt.isLevel
                  ? 'border-emerald-400 bg-emerald-500/20 shadow-xl'
                  : 'border-white/20 bg-black/25'
              }`}
            >
              <div
                style={{
                  transform: `translate3d(${tilt.x * 1.6}px, ${tilt.y * 1.6}px, 0)`,
                }}
                className={`w-3.5 h-3.5 rounded-full transition-transform duration-75 ${
                  tilt.isLevel
                    ? 'bg-emerald-400 scale-125 shadow-md shadow-emerald-400/80'
                    : 'bg-white/60'
                }`}
              />
              <div className="absolute w-2 h-2 rounded-full border border-white/30" />
            </div>
          </div>

          <div className="absolute bottom-4 inset-x-0 text-center">
            <span className="text-xs bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-gray-200 border border-white/10">
              {tilt.isLevel ? (
                <span className="text-emerald-400 font-semibold">Perfect Alignment (Level)</span>
              ) : scanMode === 'batch' ? (
                `Rapid Batch Mode — ${pagesCount} captured`
              ) : (
                'Align document inside frame'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Shutter Dock */}
      <div className="relative z-20 flex items-center justify-around px-8 pt-4 pb-12 glass-panel border-t-0">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-3.5 rounded-full glass-button text-gray-300 active:scale-90 transition-transform"
          title="Import photo"
        >
          <ImageIcon className="w-6 h-6 text-gray-200" />
        </button>

        {/* Tactile Shutter Button with Auto-Capture Progress Ring */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-emerald-500/30 p-1 active:scale-95 transition-transform disabled:opacity-50"
          title={autoCaptureEnabled ? 'Auto-capture enabled (holding phone steady will snap automatically)' : 'Tap to capture'}
        >
          {autoCaptureEnabled && (
            <svg className="absolute -inset-1 w-[88px] h-[88px] -rotate-90 pointer-events-none" viewBox="0 0 88 88">
              <circle
                cx="44"
                cy="44"
                r="39"
                fill="none"
                stroke="#10b981"
                strokeWidth="4"
                strokeDasharray={245}
                strokeDashoffset={245 - (245 * autoCaptureProgress) / 100}
                className="transition-all duration-75"
              />
            </svg>
          )}
          <div className="w-full h-full rounded-full bg-emerald-500 emerald-glow flex items-center justify-center shadow-lg">
            <div className={`w-7 h-7 rounded-full bg-white/20 ${capturing ? 'animate-ping' : ''}`} />
          </div>
        </button>

        {/* Multi-page review thumbnail or finish button */}
        {pagesCount > 0 ? (
          <button
            onClick={() => {
              triggerHaptic(20);
              onFinishBatch();
            }}
            className="relative flex items-center justify-center w-12 h-12 rounded-2xl border-2 border-emerald-400 bg-black overflow-hidden active:scale-90 transition-transform shadow-lg"
            title="Finish & Review Batch"
          >
            {lastThumbnail ? (
              <img src={lastThumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
            ) : (
              <CheckCheck className="w-6 h-6 text-emerald-400" />
            )}
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-black text-[10px] font-bold flex items-center justify-center">
              {pagesCount}
            </div>
          </button>
        ) : (
          <div className="w-12 h-12" />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
