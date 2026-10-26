import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import { LibraryModal } from './components/LibraryModal';
import { Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilterAsync } from './core/filters';
import {
  storePageToDisk,
  clearScanSession,
  rotateStoredPage,
  loadOriginalDataUrlFromDisk,
  deleteStoredPage,
} from './core/storage/pageStore';
import { detectDocumentCorners } from './core/edgeDetection';
import { warpPerspective } from './core/geometry';

export const App: React.FC = () => {
  const [step, setStep] = useState<ScanStep>('camera');
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Hardware Back Button integration for Android
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      if (step === 'crop') {
        setStep(pages.length > 0 ? 'review' : 'camera');
        setCurrentRawImage('');
        setRetakeTargetIndex(null);
        window.history.pushState(null, '', window.location.href);
      } else if (step === 'review') {
        if (pages.length > 0) {
          setStep('camera');
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step, pages.length]);

  const handleCapture = (imageSrc: string, isBatchMode: boolean) => {
    // If retaking or in single mode, immediately open CropView
    if (retakeTargetIndex !== null || !isBatchMode) {
      setCurrentRawImage(imageSrc);
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

        const quad = detectDocumentCorners(canvas);
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
      setRetakeTargetIndex(index);
      setStep('crop');
    } catch (e) {
      console.warn('Could not load original image for crop:', e);
    }
  };

  const handleCropCancel = () => {
    setCurrentRawImage('');
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
    await clearScanSession();
    setPages([]);
    setRetakeTargetIndex(null);
    setCurrentRawImage('');
    setStep('camera');
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
        />
      )}

      {step === 'crop' && (
        <CropView
          imageSrc={currentRawImage}
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
          onResetAll={handleResetAll}
        />
      )}

      <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
    </main>
  );
};
