import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Zap, ZapOff, CheckCheck, Layers, Sparkles, FolderArchive } from 'lucide-react';

interface CameraViewProps {
  onCapture: (imageDataUrl: string) => void;
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
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 4096 }, // Request 4K/Max sensor dimensions
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

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {}
    }
  };

  /**
   * Captures at full sensor hardware resolution in-app using ImageCapture API
   * without launching external apps or losing WebView state.
   */
  const handleCapture = async () => {
    if (capturing) return;
    triggerHaptic();
    setCapturing(true);

    try {
      if (stream) {
        const track = stream.getVideoTracks()[0];

        // Modern Android WebView ImageCapture API (Full 12MP-48MP Sensor capture)
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
                onCapture(reader.result);
              }
            };
            reader.readAsDataURL(blob);
            return;
          } catch (e) {
            console.warn('ImageCapture fallback to video canvas:', e);
          }
        }
      }

      // High-resolution Canvas fallback from live stream
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
          setCapturing(false);
          onCapture(dataUrl);
          return;
        }
      }

      fileInputRef.current?.click();
    } catch {
      fileInputRef.current?.click();
    } finally {
      setCapturing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result);
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
        triggerHaptic();
      }
    } catch (e) {
      console.warn('Torch unsupported:', e);
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex flex-col justify-between overflow-hidden">
      {/* Top Header Bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-12 pb-4 glass-panel border-b-0">
        <div className="flex items-center gap-2">
          {onOpenLibrary && (
            <button
              onClick={() => {
                triggerHaptic();
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

        {/* Status Indicators & Tools */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
            <Sparkles className="w-3 h-3" />
            <span>4K Sensor</span>
          </div>

          {pagesCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>{pagesCount}</span>
            </div>
          )}

          <button
            onClick={toggleTorch}
            className="p-2.5 rounded-full glass-button text-gray-300 active:text-emerald-400"
            title="Flashlight"
          >
            {torchOn ? <Zap className="w-5 h-5 text-emerald-400" /> : <ZapOff className="w-5 h-5" />}
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

          <div className="absolute bottom-4 inset-x-0 text-center">
            <span className="text-xs bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-gray-200 border border-white/10">
              Align document inside frame
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

        {/* Tactile In-App Shutter Button */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-emerald-500/30 p-1 active:scale-95 transition-transform disabled:opacity-50"
        >
          <div className="w-full h-full rounded-full bg-emerald-500 emerald-glow flex items-center justify-center shadow-lg">
            <div className={`w-7 h-7 rounded-full bg-white/20 ${capturing ? 'animate-ping' : ''}`} />
          </div>
        </button>

        {/* Multi-page review thumbnail or finish button */}
        {pagesCount > 0 ? (
          <button
            onClick={() => {
              triggerHaptic();
              onFinishBatch();
            }}
            className="relative flex items-center justify-center w-12 h-12 rounded-2xl border-2 border-emerald-400 bg-black overflow-hidden active:scale-90 transition-transform shadow-lg"
            title="Finish & Review"
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

      {/* Gallery file picker input */}
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
