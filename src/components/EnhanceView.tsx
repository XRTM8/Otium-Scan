import React, { useEffect, useRef, useState } from 'react';
import { FilterType } from '../core/types';
import { applyFilter } from '../core/filters';
import { ArrowLeft, Share2, Sparkles, BookOpen, Download } from 'lucide-react';

interface EnhanceViewProps {
  warpedCanvas: HTMLCanvasElement;
  onBack: () => void;
  onDone: () => void;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({ warpedCanvas, onBack }) => {
  const [filter, setFilter] = useState<FilterType>('magic');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [splitPos, setSplitPos] = useState<number>(50); // percentage for split comparison
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Generate filtered result
    const filteredCanvas = applyFilter(warpedCanvas, filter);
    setPreviewDataUrl(filteredCanvas.toDataURL('image/jpeg', 0.92));
  }, [warpedCanvas, filter]);

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  };

  const handleSelectFilter = (type: FilterType) => {
    triggerHaptic();
    setFilter(type);
  };

  const handleShare = async () => {
    triggerHaptic();
    try {
      const response = await fetch(previewDataUrl);
      const blob = await response.blob();
      const file = new File([blob], `Otium_Scan_${Date.now()}.jpg`, { type: 'image/jpeg' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Otium Scan',
          text: 'Scanned with Otium Scan (Local & Private)',
        });
      } else {
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = previewDataUrl;
    a.download = `Otium_Scan_${Date.now()}.jpg`;
    a.click();
  };

  const handleOpenInOtium = () => {
    triggerHaptic();
    // In Tauri mobile, we dispatch an intent to open with Otium or trigger deep link
    window.location.href = `otium://open?source=${encodeURIComponent(previewDataUrl.slice(0, 100))}`;
    setTimeout(() => {
      // Fallback if Otium reader is not installed or on web
      handleShare();
    }, 400);
  };

  const handleSliderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setSplitPos((x / rect.width) * 100);
  };

  return (
    <div className="relative w-full h-full bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-12 pb-4 glass-panel border-b-0">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full glass-button text-gray-300 active:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="text-sm font-semibold tracking-wide text-gray-200">
          Document Enhancement
        </span>

        <button
          onClick={handleShare}
          className="p-2.5 rounded-full glass-button text-gray-300 active:text-emerald-400"
          title="Share"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main Preview with Before/After Split */}
      <div
        ref={containerRef}
        onPointerMove={handleSliderMove}
        className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden touch-none"
      >
        <div className="relative max-w-full max-h-[68vh] rounded-lg overflow-hidden shadow-2xl border border-white/10">
          {/* Enhanced Version (Underneath) */}
          <img
            src={previewDataUrl}
            alt="Enhanced"
            className="w-full h-full object-contain block pointer-events-none"
          />

          {/* Original Version (Clipped Over Top for Split Comparison) */}
          <div
            style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
            className="absolute inset-0 overflow-hidden pointer-events-none"
          >
            <img
              src={warpedCanvas.toDataURL('image/jpeg', 0.85)}
              alt="Original raw"
              className="w-full h-full object-contain block"
            />
          </div>

          {/* Vertical Divider Line */}
          <div
            style={{ left: `${splitPos}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none"
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-black border-2 border-emerald-400 flex items-center justify-center shadow-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Filter Controls & Otium Ecosystem Integration */}
      <div className="relative z-20 flex flex-col gap-4 px-6 pt-4 pb-12 glass-panel border-t-0">
        {/* Filter Pills */}
        <div className="flex items-center justify-center gap-2">
          {(
            [
              { id: 'magic', label: 'Magic Color', icon: Sparkles },
              { id: 'bw', label: 'B&W Doc' },
              { id: 'grayscale', label: 'Grayscale' },
              { id: 'original', label: 'Original' },
            ] as const
          ).map((item) => {
            const isActive = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectFilter(item.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-black font-semibold shadow-md emerald-glow'
                    : 'glass-button text-gray-300'
                }`}
              >
                {'icon' in item && item.icon && <item.icon className="w-3.5 h-3.5" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Row */}
        <div className="flex items-center gap-3 mt-1">
          {/* Prominent "Open in Otium Reader" Integration Button */}
          <button
            onClick={handleOpenInOtium}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold text-sm active:scale-95 transition-transform emerald-glow shadow-lg"
          >
            <BookOpen className="w-4 h-4 stroke-[2.5]" />
            <span>Open in Otium Reader</span>
          </button>

          {/* Quick Download / Export */}
          <button
            onClick={handleDownload}
            className="p-3.5 rounded-2xl glass-button text-gray-200 active:scale-95 transition-transform"
            title="Download image"
          >
            <Download className="w-5 h-5 text-gray-200" />
          </button>
        </div>
      </div>
    </div>
  );
};
