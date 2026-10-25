import React, { useEffect, useState } from 'react';
import { FilterType, ScannedPage } from '../core/types';
import { createPdfFromCanvases, PdfCompressionPreset, PdfPageFormat, PdfPageInput } from '../core/pdf';
import { loadPageCanvasFromDisk } from '../core/storage/pageStore';
import { saveDocumentToLibrary } from '../core/storage/documentLibrary';
import { dewarpBookCurvature } from '../core/geometry';
import { performOcr } from '../core/ocr/ocrEngine';
import { SignatureModal } from './SignatureModal';
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
  RotateCcw,
  RotateCw,
  Edit3,
  PenTool,
  CheckCircle2,
} from 'lucide-react';

interface EnhanceViewProps {
  pages: ScannedPage[];
  onBackToCamera: () => void;
  onAddMorePages: () => void;
  onDeletePage: (index: number) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  onRetakePage: (index: number) => void;
  onRotatePage: (index: number) => Promise<void>;
  onResetAll: () => void;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  pages,
  onBackToCamera,
  onAddMorePages,
  onDeletePage,
  onMovePage,
  onRetakePage,
  onRotatePage,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [curvature, setCurvature] = useState<number>(0);
  const [spinePos, setSpinePos] = useState<number>(0.5);
  const [enableOcr, setEnableOcr] = useState<boolean>(true);
  const [compressionPreset, setCompressionPreset] = useState<PdfCompressionPreset>('balanced');
  const [pageFormat, setPageFormat] = useState<PdfPageFormat>('a4');
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatures, setSignatures] = useState<Record<number, { dataUrl: string; x: number; y: number }>>({});
  const [toastMsg, setToastMsg] = useState<string>('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [fullResPreviewUrl, setFullResPreviewUrl] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>(() => {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toTimeString().slice(0, 5).replace(':', '-');
    return `Otium_Doc_${dateStr}_${timeStr}`;
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);

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

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  };

  const generateCompiledPdf = async (): Promise<Blob> => {
    const pageInputs: PdfPageInput[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const rawCanvas = await loadPageCanvasFromDisk(page.id);
      const processed = curvature > 0 ? dewarpBookCurvature(rawCanvas, curvature, spinePos) : rawCanvas;

      // Overlay digital signature if present for this page
      const sig = signatures[i];
      if (sig) {
        const sigImg = new Image();
        sigImg.src = sig.dataUrl;
        await new Promise((res) => {
          sigImg.onload = res;
          sigImg.onerror = res;
        });
        const ctx = processed.getContext('2d');
        if (ctx) {
          const sigW = Math.round(processed.width * 0.32);
          const sigH = Math.round((sigImg.naturalHeight / sigImg.naturalWidth) * sigW);
          const posX = Math.round(sig.x * processed.width);
          const posY = Math.round(sig.y * processed.height);
          ctx.drawImage(sigImg, posX, posY, sigW, sigH);
        }
      }

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
    return await createPdfFromCanvases(pageInputs, compressionPreset, pageFormat);
  };

  const handleRotateCurrentPage = async () => {
    triggerHaptic(20);
    try {
      await onRotatePage(safeIndex);
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? dewarpBookCurvature(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Rotation failed:', e);
    }
  };

  const persistToLibrary = async (pdfBlob: Blob) => {
    try {
      await saveDocumentToLibrary({
        id: `doc_${Date.now()}`,
        title: docTitle.trim() || `Scan — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        pageCount: pages.length,
        thumbnail: pages[0].thumbnailDataUrl,
        pdfBlob,
      });
    } catch (e) {
      console.warn('Could not cache document to library:', e);
    }
  };

  const handleSharePdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);

      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: docTitle.trim() || 'Otium Document',
          text: `Scanned document (${pages.length} pages)`,
        });
      } else {
        downloadBlob(pdfBlob, filename);
      }
    } catch {
      const pdfBlob = await generateCompiledPdf();
      downloadBlob(pdfBlob, `${docTitle.trim() || 'Otium_Scan'}.pdf`);
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
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      downloadBlob(pdfBlob, `${docTitle.trim() || 'Otium_Scan'}.pdf`);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handleOpenInOtium = async () => {
    triggerHaptic(25);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);

      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: docTitle.trim() || 'Otium Document',
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

        <div className="flex flex-col items-center max-w-[48%]">
          {isEditingTitle ? (
            <input
              type="text"
              value={docTitle}
              autoFocus
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              onChange={(e) => setDocTitle(e.target.value)}
              className="text-xs bg-white/10 text-white px-2 py-0.5 rounded border border-emerald-400 focus:outline-none text-center max-w-full"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1 text-sm font-semibold tracking-wide text-gray-200 truncate max-w-full hover:text-emerald-400"
              title="Click to rename document"
            >
              <span className="truncate">{docTitle}</span>
              <Edit3 className="w-3 h-3 text-emerald-400 opacity-70 shrink-0" />
            </button>
          )}
          <span className="text-[11px] text-emerald-400 font-medium">
            Page {safeIndex + 1} of {pages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sign Document */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsSignatureOpen(true);
            }}
            className={`p-2.5 rounded-full glass-button transition-colors ${
              signatures[safeIndex] ? 'text-emerald-400 border-emerald-500/50' : 'text-gray-300 active:text-emerald-400'
            }`}
            title="Sign this document"
          >
            <PenTool className="w-4 h-4" />
          </button>

          {/* Rotate 90° Clockwise */}
          <button
            onClick={handleRotateCurrentPage}
            className="p-2.5 rounded-full glass-button text-gray-300 active:text-emerald-400"
            title="Rotate 90° Clockwise"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Retake this page button */}
          <button
            onClick={() => {
              triggerHaptic(15);
              onRetakePage(safeIndex);
            }}
            className="p-2.5 rounded-full glass-button text-gray-300 active:text-emerald-400"
            title="Retake this photo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {pages.length > 1 && (
            <button
              onClick={() => {
                triggerHaptic(15);
                onDeletePage(safeIndex);
                if (safeIndex > 0) setCurrentPageIndex(safeIndex - 1);
              }}
              className="p-2.5 rounded-full glass-button text-red-400 active:scale-90"
              title="Delete this page"
            >
              <Trash2 className="w-4 h-4" />
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
        {toastMsg && (
          <div className="absolute top-4 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
            <span className="px-4 py-1.5 rounded-full bg-emerald-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-1.5 border border-white/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{toastMsg}</span>
            </span>
          </div>
        )}

        <div className="relative max-w-full max-h-[54vh] rounded-xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={previewSource}
            alt={`Page ${safeIndex + 1}`}
            className="w-full h-full object-contain block pointer-events-none"
          />

          {/* Attached Digital Signature */}
          {signatures[safeIndex] && (
            <div
              style={{
                left: `${signatures[safeIndex].x * 100}%`,
                top: `${signatures[safeIndex].y * 100}%`,
              }}
              className="absolute z-20 w-32 -translate-x-1/2 -translate-y-1/2 p-1.5 border-2 border-dashed border-emerald-400 bg-emerald-500/10 rounded-xl shadow-2xl flex items-center justify-center group"
            >
              <img
                src={signatures[safeIndex].dataUrl}
                alt="Signature"
                className="w-full h-auto object-contain pointer-events-none"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic(10);
                  setSignatures((prev) => {
                    const next = { ...prev };
                    delete next[safeIndex];
                    return next;
                  });
                }}
                className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md active:scale-90"
                title="Remove signature"
              >
                ✕
              </button>
            </div>
          )}

          {pdfGenerating && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-semibold text-white">
                {ocrStatus || 'Compiling Optimized PDF...'}
              </p>
            </div>
          )}
        </div>

        {safeIndex > 0 && (
          <button
            onClick={() => {
              triggerHaptic(10);
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
              triggerHaptic(10);
              setCurrentPageIndex(safeIndex + 1);
            }}
            className="absolute right-4 p-3 rounded-full glass-button text-white active:scale-90 shadow-xl"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Controls: Tools, Reordering & Export */}
      <div className="relative z-20 flex flex-col gap-2 px-6 pt-2 pb-12 glass-panel border-t-0">
        {/* Tier 1 Bar: Compression Quality & OCR Settings */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-300">
          {/* Smart Compression Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 font-semibold">Size:</span>
            {(['compact', 'balanced', 'max'] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => {
                  triggerHaptic(10);
                  setCompressionPreset(tier);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  compressionPreset === tier
                    ? 'bg-emerald-500 text-black font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tier === 'compact' ? 'Compact (~1.5MB)' : tier === 'balanced' ? 'Balanced' : 'Full'}
              </button>
            ))}
          </div>

          {/* Page Format: ISO A4 vs Fit */}
          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <span className="text-[10px] text-gray-400 font-semibold">Format:</span>
            <button
              onClick={() => {
                triggerHaptic(10);
                setPageFormat('a4');
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                pageFormat === 'a4'
                  ? 'bg-emerald-500 text-black font-bold shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Standard ISO A4 (595x842 pt)"
            >
              A4
            </button>
            <button
              onClick={() => {
                triggerHaptic(10);
                setPageFormat('fit');
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                pageFormat === 'fit'
                  ? 'bg-emerald-500 text-black font-bold shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Fit to Sensor Dimensions"
            >
              Fit
            </button>
          </div>

          {/* OCR Toggle */}
          <button
            onClick={() => {
              triggerHaptic(10);
              setEnableOcr(!enableOcr);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              enableOcr ? 'bg-emerald-500 text-black shadow-sm' : 'bg-white/10 text-gray-400'
            }`}
          >
            <Search className="w-3 h-3" />
            <span>OCR {enableOcr ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Tier 2 Bar: Book Spine Dewarp & Page Reorder Controls */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-300">
          {/* Book Spine Flattening */}
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
            className="w-16 accent-emerald-500 cursor-pointer"
          />

          {/* Page Reorder Buttons */}
          {pages.length > 1 && (
            <div className="flex items-center gap-1 border-l border-white/10 pl-2">
              <span className="text-[10px] text-gray-400">Order:</span>
              <button
                disabled={safeIndex === 0}
                onClick={() => {
                  triggerHaptic(10);
                  onMovePage(safeIndex, safeIndex - 1);
                  setCurrentPageIndex(safeIndex - 1);
                }}
                className="px-1.5 py-0.5 rounded bg-white/10 text-white disabled:opacity-30 text-[10px] font-bold"
                title="Move page left"
              >
                ◀
              </button>
              <button
                disabled={safeIndex === pages.length - 1}
                onClick={() => {
                  triggerHaptic(10);
                  onMovePage(safeIndex, safeIndex + 1);
                  setCurrentPageIndex(safeIndex + 1);
                }}
                className="px-1.5 py-0.5 rounded bg-white/10 text-white disabled:opacity-30 text-[10px] font-bold"
                title="Move page right"
              >
                ▶
              </button>
            </div>
          )}
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
                  triggerHaptic(10);
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

          {pages.length > 1 && (
            <button
              onClick={() => {
                triggerHaptic(15);
                setToastMsg('Applied filter to all pages');
                setTimeout(() => setToastMsg(''), 2200);
              }}
              className="text-[10px] text-emerald-400 font-semibold underline underline-offset-2 ml-1 active:opacity-60"
              title="Apply current filter to all pages"
            >
              Apply to all
            </button>
          )}
        </div>

        {/* Multi-page Thumbnail Strip */}
        <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-1 scrollbar-none">
          {pages.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => {
                triggerHaptic(10);
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
              triggerHaptic(15);
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
        <div className="flex items-center gap-3 mt-0.5">
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

      <SignatureModal
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onSaveSignature={(sigUrl) => {
          triggerHaptic(20);
          setSignatures((prev) => ({
            ...prev,
            [safeIndex]: { dataUrl: sigUrl, x: 0.58, y: 0.72 },
          }));
          setToastMsg('Signature placed on current page');
          setTimeout(() => setToastMsg(''), 2200);
        }}
      />
    </div>
  );
};
