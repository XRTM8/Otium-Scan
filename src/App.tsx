import React, { useState, useEffect, useRef } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import { LibraryModal } from './components/LibraryModal';
import { SettingsModal } from './components/SettingsModal';
import { Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilterAsync } from './core/filters';
import {
  storePageToDisk,
  clearScanSession,
  rotateStoredPage,
  loadOriginalDataUrlFromDisk,
  deleteStoredPage,
  checkStorageQuota,
  saveActiveSessionPages,
  getActiveSessionPages,
  clearActiveSessionPages,
} from './core/storage/pageStore';
import { getFullFrameQuad } from './core/edgeDetection';
import { warpPerspective } from './core/geometry';

export const App: React.FC = () => {
  const [step, setStep] = useState<ScanStep>('camera');
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [currentInitialQuad, setCurrentInitialQuad] = useState<Quad | null>(null);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [exitToast, setExitToast] = useState(false);
  const [resumablePages, setResumablePages] = useState<ScannedPage[] | null>(null);
  const [lowStorageWarning, setLowStorageWarning] = useState(false);
  const lastBackPressTimeRef = useRef(0);

  // Check storage quota and previous unfinished session on startup
  useEffect(() => {
    checkStorageQuota().then(({ hasLowStorage }) => {
      if (hasLowStorage) setLowStorageWarning(true);
    });

    const saved = getActiveSessionPages();
    if (saved && saved.length > 0) {
      setResumablePages(saved);
    }
  }, []);

  // Synchronize active session pages with disk metadata for crash recovery
  useEffect(() => {
    saveActiveSessionPages(pages);
  }, [pages]);

  // Hardware Back Button & Gesture Navigation for Android & Web
  useEffect(() => {
    const handleBackAction = (e: Event) => {
      // 1. If Settings modal is open, close it
      if (isSettingsOpen) {
        e.preventDefault();
        setIsSettingsOpen(false);
        return;
      }

      // 2. If Library modal is open, close it
      if (isLibraryOpen) {
        e.preventDefault();
        setIsLibraryOpen(false);
        return;
      }

      // 3. If in CropView, cancel crop and return to review or camera
      if (step === 'crop') {
        e.preventDefault();
        handleCropCancel();
        return;
      }

      // 4. If in Review (EnhanceView), return to camera
      if (step === 'review') {
        e.preventDefault();
        setStep('camera');
        return;
      }

      // 5. If on root CameraView
      if (step === 'camera') {
        const now = Date.now();
        if (now - lastBackPressTimeRef.current < 2000) {
          // Double-tap threshold reached: let event bubble so Android can exit
          return;
        }
        e.preventDefault();
        lastBackPressTimeRef.current = now;
        setExitToast(true);
        setTimeout(() => setExitToast(false), 2000);
      }
    };

    window.addEventListener('otium:back', handleBackAction);
    const handlePopState = (e: PopStateEvent) => {
      handleBackAction(e);
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => {
      window.removeEventListener('otium:back', handleBackAction);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [step, pages.length, isSettingsOpen, isLibraryOpen]);

  const handleCapture = (imageSrc: string, isBatchMode: boolean, detectedQuad?: Quad) => {
    // If retaking or in single mode, immediately open CropView
    if (retakeTargetIndex !== null || !isBatchMode) {
      setCurrentRawImage(imageSrc);
      setCurrentInitialQuad(detectedQuad ?? null);
      setStep('crop');
      return;
    }

    // CamScanner Multi-Page Mode: Process page in background
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const quad = detectedQuad ?? getFullFrameQuad(canvas.width, canvas.height, 0.005);
        const warpedCanvas = warpPerspective(canvas, quad);
        const filteredCanvas = await applyFilterAsync(warpedCanvas, 'magic');

        const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const thumbnailDataUrl = await storePageToDisk(
          pageId,
          imageSrc,
          warpedCanvas,
          filteredCanvas,
          'magic'
        );

        const newPage: ScannedPage = {
          id: pageId,
          thumbnailDataUrl,
          quad,
          filter: 'magic',
          timestamp: Date.now(),
        };

        setPages((prev) => [...prev, newPage]);
      } catch (err) {
        console.warn('Batch page capture error:', err);
      }
    };
    img.onerror = (e) => {
      console.warn('Captured image load error:', e);
    };
    img.src = imageSrc;
  };

  const handleCropConfirm = async (warpedCanvas: HTMLCanvasElement, quad: Quad) => {
    try {
      const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const filteredCanvas = await applyFilterAsync(warpedCanvas, 'magic');

      // Persist full-res raw & filtered buffers to disk storage
      const thumbnailDataUrl = await storePageToDisk(
        pageId,
        currentRawImage,
        warpedCanvas,
        filteredCanvas,
        'magic'
      );

      const newPage: ScannedPage = {
        id: pageId,
        thumbnailDataUrl,
        quad,
        filter: 'magic',
        timestamp: Date.now(),
      };

      if (retakeTargetIndex !== null) {
        setPages((prev) => {
          const updated = [...prev];
          if (retakeTargetIndex >= 0 && retakeTargetIndex < updated.length) {
            updated[retakeTargetIndex] = newPage;
          }
          return updated;
        });
        setRetakeTargetIndex(null);
      } else {
        setPages((prev) => [...prev, newPage]);
      }
    } catch (err) {
      console.warn('Crop confirm error:', err);
    } finally {
      setCurrentRawImage('');
      setCurrentInitialQuad(null);
      // Single mode or recrop always goes directly to review to see the document!
      setStep('review');
    }
  };

  const handleEditCrop = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    try {
      const originalDataUrl = await loadOriginalDataUrlFromDisk(page.id);
      setCurrentRawImage(originalDataUrl);
      setCurrentInitialQuad(page.quad);
      setRetakeTargetIndex(index);
      setStep('crop');
    } catch (e) {
      console.warn('Could not load original image for crop:', e);
    }
  };

  const handleCropCancel = () => {
    setCurrentRawImage('');
    setCurrentInitialQuad(null);
    setRetakeTargetIndex(null);
    setStep(pages.length > 0 ? 'review' : 'camera');
  };

  const handleAddMorePages = () => {
    setRetakeTargetIndex(null);
    setStep('camera');
  };

  const handleDeletePage = (index: number) => {
    const pageToDelete = pages[index];
    if (pageToDelete) {
      deleteStoredPage(pageToDelete.id).catch(console.warn);
    }
    setPages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setStep('camera');
      }
      return updated;
    });
  };

  const handleMovePage = (fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const handleRetakePage = (index: number) => {
    setRetakeTargetIndex(index);
    setStep('camera');
  };

  const handleDuplicatePage = (index: number) => {
    const page = pages[index];
    if (!page) return;
    const duplicated: ScannedPage = {
      ...page,
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };
    setPages((prev) => {
      const updated = [...prev];
      updated.splice(index + 1, 0, duplicated);
      return updated;
    });
  };

  const handleRotatePage = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    const newThumb = await rotateStoredPage(page.id);
    setPages((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], thumbnailDataUrl: newThumb };
      }
      return updated;
    });
  };

  const handleResetAll = async () => {
    clearActiveSessionPages();
    await clearScanSession();
    setPages([]);
    setRetakeTargetIndex(null);
    setCurrentRawImage('');
    setStep('camera');
  };

  const handleResumeSession = () => {
    if (resumablePages && resumablePages.length > 0) {
      setPages(resumablePages);
      setResumablePages(null);
      setStep('review');
    }
  };

  const handleDiscardResumableSession = async () => {
    clearActiveSessionPages();
    await clearScanSession();
    setResumablePages(null);
  };

  const lastThumb = pages.length > 0 ? pages[pages.length - 1].thumbnailDataUrl : undefined;

  return (
    <main className="fixed inset-0 w-screen h-screen overflow-hidden bg-black select-none">
      {step === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          pagesCount={pages.length}
          lastThumbnail={lastThumb}
          onFinishBatch={() => setStep('review')}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {step === 'crop' && (
        <CropView
          imageSrc={currentRawImage}
          initialQuad={currentInitialQuad ?? undefined}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {step === 'review' && (
        <EnhanceView
          pages={pages}
          onBackToCamera={() => setStep('camera')}
          onAddMorePages={handleAddMorePages}
          onDeletePage={handleDeletePage}
          onMovePage={handleMovePage}
          onRetakePage={handleRetakePage}
          onRotatePage={handleRotatePage}
          onEditCrop={handleEditCrop}
          onDuplicatePage={handleDuplicatePage}
          onResetAll={handleResetAll}
        />
      )}

      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenVault={() => setIsLibraryOpen(true)}
      />

      {/* Low Storage Alert */}
      {lowStorageWarning && step === 'camera' && (
        <div className="fixed top-2.5 inset-x-4 z-50 px-3 py-1.5 rounded-xl bg-red-950/85 border border-red-500/30 text-[11px] text-red-200 flex items-center justify-between font-arabic shadow-xl animate-in fade-in">
          <span>تنبيه: مساحة التخزين المتبقية على الهاتف منخفضة جداً</span>
          <button onClick={() => setLowStorageWarning(false)} className="text-red-400 hover:text-white text-xs px-1">✕</button>
        </div>
      )}

      {/* Session Resume Recovery Banner */}
      {resumablePages && step === 'camera' && (
        <div className="fixed top-12 inset-x-4 z-50 p-3 rounded-2xl bg-slate-900/95 border border-amber-500/40 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 font-arabic">
          <div className="flex items-center gap-2.5 overflow-hidden text-right">
            <span className="text-amber-400 text-lg shrink-0">📋</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">جلسة مسح سابقة غير محفوظة</span>
              <span className="text-[11px] text-gray-400">توجد {resumablePages.length} صفحة من الجلسة السابقة</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleResumeSession}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-xs shadow-md transition-all"
            >
              استئناف
            </button>
            <button
              onClick={handleDiscardResumableSession}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-gray-400 hover:text-white text-xs transition-all"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {exitToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-900/95 border border-emerald-500/30 text-xs text-emerald-300 font-bold shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 font-arabic">
          {pages.length > 0 ? 'اضغط رجوع مرة أخرى لإلغاء الجلسة والخروج' : 'اضغط رجوع مرة أخرى للخروج من التطبيق'}
        </div>
      )}
    </main>
  );
};
