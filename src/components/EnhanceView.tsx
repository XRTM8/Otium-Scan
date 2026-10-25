import React, { useEffect, useState } from 'react';
import { FilterType, ScannedPage } from '../core/types';
import { applyFilter } from '../core/filters';
import { createPdfFromCanvases } from '../core/pdf';
import { ArrowLeft, Share2, Sparkles, BookOpen, Download, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface EnhanceViewProps {
  pages: ScannedPage[];
  onBackToCamera: () => void;
  onAddMorePages: () => void;
  onDeletePage: (index: number) => void;
  onUpdateFilter: (index: number, filter: FilterType, updatedCanvas: HTMLCanvasElement) => void;
  onResetAll: () => void;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  pages,
  onBackToCamera,
  onAddMorePages,
  onDeletePage,
  onUpdateFilter,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const safeIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex];

  // Whenever filter changes, update the current page's filtered canvas
  useEffect(() => {
    if (!currentPage) return;
    const filtered = applyFilter(currentPage.warpedCanvas, activeFilter);
    onUpdateFilter(safeIndex, activeFilter, filtered);
  }, [activeFilter]);

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  };

  const handleFilterChange = (filter: FilterType) => {
    triggerHaptic();
    setActiveFilter(filter);
  };

  const generateCompiledPdf = async (): Promise<Blob> => {
    const canvasesToCompile = pages.map((p) => p.filteredCanvas);
    return await createPdfFromCanvases(canvasesToCompile);
  };

  const handleSharePdf = async () => {
    triggerHaptic();
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      const filename = `Otium_Scan_${Date.now()}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: 'Otium Scan Document',
          text: `Scanned document (${pages.length} ${pages.length === 1 ? 'page' : 'pages'})`,
        });
      } else {
        downloadBlob(pdfBlob, filename);
      }
    } catch (err) {
      console.warn('Share failed, fallback to download:', err);
      const pdfBlob = await generateCompiledPdf();
      downloadBlob(pdfBlob, `Otium_Scan_${Date.now()}.pdf`);
    } finally {
      setPdfGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadPdf = async () => {
    triggerHaptic();
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      downloadBlob(pdfBlob, `Otium_Scan_${Date.now()}.pdf`);
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleOpenInOtium = async () => {
    triggerHaptic();
    setPdfGenerating(true);
    try {
      // In Tauri / mobile Android, we can share or pass content URI
      const pdfBlob = await generateCompiledPdf();
      const filename = `Otium_Scan_${Date.now()}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: 'Otium Document',
        });
      } else {
        downloadBlob(pdfBlob, filename);
      }
    } finally {
      setPdfGenerating(false);
    }
  };

  if (!currentPage) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-6 text-center">
        <p className="text-gray-400 text-sm">No scanned pages available</p>
      </div>
    );
  }

  const currentPreview = currentPage.filteredCanvas.toDataURL('image/jpeg', 0.9);

  return (
    <div className="relative w-full h-full bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-12 pb-4 glass-panel border-b-0">
        <button
          onClick={onBackToCamera}
          className="p-2.5 rounded-full glass-button text-gray-300 active:text-white"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold tracking-wide text-gray-200">
            Document Review
          </span>
          <span className="text-[11px] text-emerald-400 font-medium">
            Page {safeIndex + 1} of {pages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pages.length > 1 && (
            <button
              onClick={() => {
                triggerHaptic();
                onDeletePage(safeIndex);
                if (safeIndex > 0) setCurrentPageIndex(safeIndex - 1);
              }}
              className="p-2.5 rounded-full glass-button text-red-400 active:scale-90"
              title="Delete this page"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={handleSharePdf}
            disabled={pdfGenerating}
            className="p-2.5 rounded-full glass-button text-gray-300 active:text-emerald-400 disabled:opacity-50"
            title="Share PDF"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview with Carousel Navigation */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden">
        <div className="relative max-w-full max-h-[64vh] rounded-xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={currentPreview}
            alt={`Page ${safeIndex + 1}`}
            className="w-full h-full object-contain block pointer-events-none"
          />
        </div>

        {/* Previous Page arrow */}
        {safeIndex > 0 && (
          <button
            onClick={() => {
              triggerHaptic();
              setCurrentPageIndex(safeIndex - 1);
            }}
            className="absolute left-4 p-3 rounded-full glass-button text-white active:scale-90 shadow-xl"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next Page arrow */}
        {safeIndex < pages.length - 1 && (
          <button
            onClick={() => {
              triggerHaptic();
              setCurrentPageIndex(safeIndex + 1);
            }}
            className="absolute right-4 p-3 rounded-full glass-button text-white active:scale-90 shadow-xl"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Controls: Filter Pills & Multi-page Actions */}
      <div className="relative z-20 flex flex-col gap-3 px-6 pt-3 pb-12 glass-panel border-t-0">
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
            const isActive = activeFilter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleFilterChange(item.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
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

        {/* Multi-page Thumbnail Strip */}
        <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-1 scrollbar-none">
          {pages.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => {
                triggerHaptic();
                setCurrentPageIndex(idx);
              }}
              className={`relative flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                idx === safeIndex
                  ? 'border-emerald-400 scale-105 shadow-md'
                  : 'border-white/20 opacity-60'
              }`}
            >
              <img
                src={p.filteredCanvas.toDataURL('image/jpeg', 0.5)}
                alt={`Thumb ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] px-1 rounded text-white font-bold">
                {idx + 1}
              </span>
            </button>
          ))}

          {/* Add more pages button */}
          <button
            onClick={() => {
              triggerHaptic();
              onAddMorePages();
            }}
            className="flex-shrink-0 w-12 h-16 rounded-lg border-2 border-dashed border-emerald-500/50 flex flex-col items-center justify-center text-emerald-400 active:scale-95 glass-button"
            title="Scan another page"
          >
            <Plus className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] font-semibold">Add</span>
          </button>
        </div>

        {/* Action Row */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={handleOpenInOtium}
            disabled={pdfGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 text-black font-semibold text-sm active:scale-95 transition-transform emerald-glow shadow-lg disabled:opacity-50"
          >
            <BookOpen className="w-4 h-4 stroke-[2.5]" />
            <span>Open in Otium Reader</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="p-3 rounded-2xl glass-button text-gray-200 active:scale-95 transition-transform disabled:opacity-50"
            title="Download compiled PDF"
          >
            <Download className="w-5 h-5 text-gray-200" />
          </button>
        </div>
      </div>
    </div>
  );
};
