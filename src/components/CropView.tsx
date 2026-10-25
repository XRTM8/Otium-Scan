import React, { useRef, useState, useCallback } from 'react';
import { Point, Quad } from '../core/types';
import { getDefaultQuad, warpPerspective } from '../core/geometry';
import { Check, RotateCcw, X } from 'lucide-react';

interface CropViewProps {
  imageSrc: string;
  onConfirm: (croppedCanvas: HTMLCanvasElement) => void;
  onCancel: () => void;
}

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

export const CropView: React.FC<CropViewProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [pointerPos, setPointerPos] = useState<Point | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // On image load, initialize quad to 8% margin
  const handleImageLoad = () => {
    if (!imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    setImageSize({ width: naturalWidth, height: naturalHeight });
    setQuad(getDefaultQuad(naturalWidth, naturalHeight));
  };

  const triggerHaptic = useCallback(() => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  }, []);

  // Map viewport client coords to natural image coords
  const clientToImageCoords = useCallback((clientX: number, clientY: number): Point => {
    if (!imageRef.current) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageSize.width / rect.width;
    const scaleY = imageSize.height / rect.height;

    const imgX = Math.max(0, Math.min(imageSize.width, (clientX - rect.left) * scaleX));
    const imgY = Math.max(0, Math.min(imageSize.height, (clientY - rect.top) * scaleY));

    return { x: imgX, y: imgY };
  }, [imageSize]);

  // Map natural image coords to viewport client coords
  const imageToClientCoords = useCallback((point: Point): Point => {
    if (!imageRef.current || imageSize.width === 0) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / imageSize.width;
    const scaleY = rect.height / imageSize.height;

    return {
      x: rect.left + point.x * scaleX,
      y: rect.top + point.y * scaleY,
    };
  }, [imageSize]);

  const handlePointerDown = (corner: CornerKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveCorner(corner);
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerHaptic();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeCorner || !quad) return;
    e.preventDefault();

    setPointerPos({ x: e.clientX, y: e.clientY });
    const imgCoord = clientToImageCoords(e.clientX, e.clientY);

    setQuad((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [activeCorner]: imgCoord,
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setActiveCorner(null);
      setPointerPos(null);
      triggerHaptic();
    }
  };

  const handleApply = () => {
    if (!imageRef.current || !quad) return;
    triggerHaptic();
    const warped = warpPerspective(imageRef.current, quad);
    onConfirm(warped);
  };

  const handleResetQuad = () => {
    triggerHaptic();
    setQuad(getDefaultQuad(imageSize.width, imageSize.height));
  };

  const renderPolyPoints = () => {
    if (!quad) return '';
    const tl = imageToClientCoords(quad.topLeft);
    const tr = imageToClientCoords(quad.topRight);
    const br = imageToClientCoords(quad.bottomRight);
    const bl = imageToClientCoords(quad.bottomLeft);
    return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-full bg-black flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Top Action Bar */}
      <div className="relative z-30 flex items-center justify-between px-6 pt-12 pb-4 glass-panel border-b-0">
        <button
          onClick={onCancel}
          className="p-2.5 rounded-full glass-button text-gray-300 active:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="text-sm font-semibold tracking-wide text-gray-200">
          Adjust Document Boundaries
        </span>

        <button
          onClick={handleResetQuad}
          className="p-2.5 rounded-full glass-button text-gray-300 active:text-emerald-400"
          title="Reset Corners"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden">
        <img
          ref={imageRef}
          src={imageSrc}
          alt="Scan target"
          onLoad={handleImageLoad}
          className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl pointer-events-none"
        />

        {/* SVG Quad Overlay */}
        {quad && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none z-20">
            {/* Shaded Document Polygon */}
            <polygon
              points={renderPolyPoints()}
              fill="rgba(16, 185, 129, 0.15)"
              stroke="#10B981"
              strokeWidth="2.5"
              strokeDasharray="4 4"
            />
          </svg>
        )}

        {/* Corner Handles */}
        {quad &&
          (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as CornerKey[]).map((corner) => {
            const clientPt = imageToClientCoords(quad[corner]);
            return (
              <div
                key={corner}
                onPointerDown={(e) => handlePointerDown(corner, e)}
                style={{
                  transform: `translate3d(${clientPt.x}px, ${clientPt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className="fixed z-30 w-11 h-11 flex items-center justify-center cursor-pointer touch-none active:scale-125 transition-transform"
              >
                {/* Visual pin point */}
                <div className="w-5 h-5 rounded-full bg-emerald-400 border-2 border-white shadow-lg flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-black" />
                </div>
              </div>
            );
          })}

        {/* Floating Precision Magnifier Loupe */}
        {activeCorner && pointerPos && quad && (
          <div
            style={{
              left: `${pointerPos.x}px`,
              top: `${Math.max(60, pointerPos.y - 110)}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="fixed z-40 w-28 h-28 rounded-full border-2 border-emerald-400 overflow-hidden shadow-2xl bg-black pointer-events-none"
          >
            {/* Magnified preview canvas/image */}
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url(${imageSrc})`,
                backgroundSize: `${imageSize.width * 2.2}px ${imageSize.height * 2.2}px`,
                backgroundPosition: `-${quad[activeCorner].x * 2.2 - 56}px -${quad[activeCorner].y * 2.2 - 56}px`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-0.5 bg-emerald-400/70" />
              <div className="absolute h-full w-0.5 bg-emerald-400/70" />
              <div className="absolute w-2 h-2 rounded-full border border-emerald-400" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Confirm Bar */}
      <div className="relative z-30 flex items-center justify-between px-8 pt-4 pb-12 glass-panel border-t-0">
        <span className="text-xs text-gray-400">
          Drag pins to document corners
        </span>

        <button
          onClick={handleApply}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500 text-black font-semibold text-sm active:scale-95 transition-transform emerald-glow"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Next</span>
        </button>
      </div>
    </div>
  );
};
