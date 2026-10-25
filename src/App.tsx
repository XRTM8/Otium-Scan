import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';

type Step = 'camera' | 'crop' | 'enhance';

export const App: React.FC = () => {
  const [step, setStep] = useState<Step>('camera');
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [warpedCanvas, setWarpedCanvas] = useState<HTMLCanvasElement | null>(null);

  // Hardware Back Button integration for Android
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      if (step === 'enhance') {
        setStep('crop');
        window.history.pushState(null, '', window.location.href);
      } else if (step === 'crop') {
        setStep('camera');
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  const handleCapture = (imageSrc: string) => {
    setCapturedImage(imageSrc);
    setStep('crop');
  };

  const handleCropConfirm = (canvas: HTMLCanvasElement) => {
    setWarpedCanvas(canvas);
    setStep('enhance');
  };

  const handleCropCancel = () => {
    setStep('camera');
    setCapturedImage('');
  };

  const handleEnhanceBack = () => {
    setStep('crop');
  };

  const handleDone = () => {
    setStep('camera');
    setCapturedImage('');
    setWarpedCanvas(null);
  };

  return (
    <main className="fixed inset-0 w-screen h-screen overflow-hidden bg-black select-none">
      {step === 'camera' && <CameraView onCapture={handleCapture} />}
      {step === 'crop' && (
        <CropView
          imageSrc={capturedImage}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
      {step === 'enhance' && warpedCanvas && (
        <EnhanceView
          warpedCanvas={warpedCanvas}
          onBack={handleEnhanceBack}
          onDone={handleDone}
        />
      )}
    </main>
  );
};
