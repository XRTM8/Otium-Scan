import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import { LibraryModal } from './components/LibraryModal';
import { Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilter } from './core/filters';
import { storePageToDisk, clearScanSession } from './core/storage/pageStore';

export const App: React.FC = () => {
  const [step, setStep] = useState<ScanStep>('camera');
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Hardware Back Button integration for Android
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      if (step === 'crop') {
        setStep('camera');
        setCurrentRawImage('');
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

  const handleCapture = (imageSrc: string) => {
    setCurrentRawImage(imageSrc);
    setStep('crop');
  };

  const handleCropConfirm = async (warpedCanvas: HTMLCanvasElement, quad: Quad) => {
    const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const filteredCanvas = applyFilter(warpedCanvas, 'magic');

    // Persist full-res raw & filtered buffers to disk storage to avoid mobile OOM
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

    setPages((prev) => [...prev, newPage]);
    setCurrentRawImage('');
    setStep('review');
  };

  const handleCropCancel = () => {
    setCurrentRawImage('');
    setStep(pages.length > 0 ? 'review' : 'camera');
  };

  const handleAddMorePages = () => {
    setStep('camera');
  };

  const handleDeletePage = (index: number) => {
    setPages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setStep('camera');
      }
      return updated;
    });
  };

  const handleResetAll = async () => {
    await clearScanSession();
    setPages([]);
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
          onResetAll={handleResetAll}
        />
      )}

      <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
    </main>
  );
};
