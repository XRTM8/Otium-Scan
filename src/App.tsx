import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import { FilterType, Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilter } from './core/filters';

export const App: React.FC = () => {
  const [step, setStep] = useState<ScanStep>('camera');
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [pages, setPages] = useState<ScannedPage[]>([]);

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

  const handleCropConfirm = (warpedCanvas: HTMLCanvasElement, quad: Quad) => {
    // Generate default filtered canvas (Magic Color)
    const filteredCanvas = applyFilter(warpedCanvas, 'magic');

    const newPage: ScannedPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      originalImage: currentRawImage,
      quad,
      warpedCanvas,
      filteredCanvas,
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

  const handleUpdateFilter = (index: number, filter: FilterType, updatedCanvas: HTMLCanvasElement) => {
    setPages((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              filter,
              filteredCanvas: updatedCanvas,
            }
          : p
      )
    );
  };

  const handleResetAll = () => {
    setPages([]);
    setCurrentRawImage('');
    setStep('camera');
  };

  const lastThumb =
    pages.length > 0
      ? pages[pages.length - 1].filteredCanvas.toDataURL('image/jpeg', 0.5)
      : undefined;

  return (
    <main className="fixed inset-0 w-screen h-screen overflow-hidden bg-black select-none">
      {step === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          pagesCount={pages.length}
          lastThumbnail={lastThumb}
          onFinishBatch={() => setStep('review')}
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
          onUpdateFilter={handleUpdateFilter}
          onResetAll={handleResetAll}
        />
      )}
    </main>
  );
};
