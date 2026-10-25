import React, { useEffect, useState } from 'react';
import { FilterType, ScannedPage } from '../core/types';
import { createPdfFromCanvases, PdfPageInput } from '../core/pdf';
import { loadPageCanvasFromDisk } from '../core/storage/pageStore';
import { saveDocumentToLibrary } from '../core/storage/documentLibrary';
import { dewarpBookCurvature } from '../core/geometry';
import { performOcr } from '../core/ocr/ocrEngine';
import {
  ArrowLeft,
  Share2,
  Sparkles,
  BookOpen,
  Download,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BookA,
  Search,
} from 'lucide-react';

interface EnhanceViewProps {
  pages: ScannedPage[];
  onBackToCamera: () => void;
  onAddMorePages: () => void;
  onDeletePage: (index: number) => void;
  onResetAll: () => void;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  pages,
  onBackToCamera,
  onAddMorePages,
  onDeletePage,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [curvature, setCurvature] = useState<number>(0); // 0 to 1
  const [spinePos, setSpinePos] = useState<number>(0.5); // 0.15 (left), 0.5 (center), 0.85 (right)
  const [enableOcr, setEnableOcr] = useState<boolean>(true); // Searchable PDF toggle
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [fullResPreviewUrl, setFullResPreviewUrl] = useState<string>('');

  const safeIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex];

  useEffect(() => {
    let active = true;
    if (!currentPage) return;

    loadPageCanvasFromDisk(currentPage.id)
      .then((canvas) => {
        if (!active) return;
        const finalCanvas = curvature > 0 ? dewarpBookCurvature(canvas, curvature, spinePos) : canvas;
        setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
      })
      .catch(() => {
        if (active) {
          setFullResPreviewUrl(currentPage.thumbnailDataUrl);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPage?.id, curvature, spinePos]);

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  };

  const generateCompiledPdf = async (): Promise<Blob> => {
    const pageInputs: PdfPageInput[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const rawCanvas = await loadPageCanvasFromDisk(page.id);
      const processed = curvature > 0 ? dewarpBookCurvature(rawCanvas, curvature, spinePos) : rawCanvas;

      let words: import('../core/pdf').OcrWordToken[] = [];
      if (enableOcr) {
        setOcrStatus(`OCR scanning page ${i + 1} of ${pages.length}...`);
        words = await performOcr(processed, 'eng');
      }

      pageInputs.push({
        canvas: processed,
        words,
      });
    }

    setOcrStatus('');
    return await createPdfFromCanvases(pageInputs);
  };

  const persistToLibrary = async (pdfBlob: Blob) => {
    try {
      await saveDocumentToLibrary({
        id: `doc_${Date.now()}`,
        title: `Scan — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        pageCount: pages.length,
        thumbnail: pages[0].thumbnailDataUrl,
        pdfBlob,
      });
    } catch (e) {
      console.warn('Could not cache document to library:', e);
    }
  };

  const handleSharePdf = async () => {
    triggerHaptic();
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);

      const filename = `Otium_Scan_${Date.now()}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: 'Otium Scan Document',
          text: `Scanned document (${pages.length} pages)`,
        });
      } else {
        downloadBlob(pdfBlob, filename);
      }
    } catch {
      const pdfBlob = await generateCompiledPdf();
      downloadBlob(pdfBlob, `Otium_Scan_${Date.now()}.pdf`);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
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
      await persistToLibrary(pdfBlob);
      downloadBlob(pdfBlob, `Otium_Scan_${Date.now()}.pdf`);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handleOpenInOtium = async () => {
    triggerHaptic();
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);

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
      setOcrStatus('');
    }
  };

  if (!currentPage) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-6 text-center">
        <p className="text-gray-400 text-sm">No scanned pages available</p>
      </div>
    );
  }

  const previewSource = fullResPreviewUrl || currentPage.thumbnailDataUrl;

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

      {/* Main Preview */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden">
        <div className="relative max-w-full max-h-[56vh] rounded-xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={previewSource}
            alt={`Page ${safeIndex + 1}`}
            className="w-full h-full object-contain block pointer-events-none"
          />

          {pdfGenerating && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-semibold text-white">
                {ocrStatus || 'Generating Searchable PDF...'}
              </p>
            </div>
          )}
        </div>

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

      {/* Bottom Controls: Filters, Book Spine Dewarp, OCR & Multi-page Actions */}
      <div className="relative z-20 flex flex-col gap-2.5 px-6 pt-2 pb-12 glass-panel border-t-0">
        {/* Book Spine & OCR Tools Bar */}
        <div className="flex items-center justify-between gap-2 px-2 py-1 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-300">
          {/* Asymmetric Book Spine Flatten */}
          <div className="flex items-center gap-1 text-emerald-400">
            <BookA className="w-3.5 h-3.5" />
            <span className="font-semibold text-[10px]">Spine:</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSpinePos(0.15)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${spinePos <= 0.25 ? 'bg-emerald-500 text-black font-bold' : 'text-gray-400'}`}
            >
              L
            </button>
            <button
              onClick={() => setSpinePos(0.5)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${spinePos > 0.25 && spinePos < 0.75 ? 'bg-emerald-500 text-black font-bold' : 'text-gray-400'}`}
            >
              Center
            </button>
            <button
              onClick={() => setSpinePos(0.85)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${spinePos >= 0.75 ? 'bg-emerald-500 text-black font-bold' : 'text-gray-400'}`}
            >
              R
            </button>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={curvature}
            onChange={(e) => setCurvature(parseFloat(e.target.value))}
            className="w-20 accent-emerald-500 cursor-pointer"
          />

          {/* Searchable OCR Toggle */}
          <button
            onClick={() => {
              triggerHaptic();
              setEnableOcr(!enableOcr);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              enableOcr
                ? 'bg-emerald-500 text-black shadow-sm'
                : 'bg-white/10 text-gray-400'
            }`}
            title="Enable OCR text layer for Ctrl+F search & copy"
          >
            <Search className="w-3 h-3" />
            <span>OCR {enableOcr ? 'ON' : 'OFF'}</span>
          </button>
        </div>

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
                onClick={() => {
                  triggerHaptic();
                  setActiveFilter(item.id);
                }}
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
                src={p.thumbnailDataUrl}
                alt={`Thumb ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] px-1 rounded text-white font-bold">
                {idx + 1}
              </span>
            </button>
          ))}

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
