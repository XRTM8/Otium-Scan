import React, { useRef, useState, useCallback } from 'react';
import { Point, Quad } from '../core/types';
import { getDefaultQuad, warpPerspective } from '../core/geometry';
import { detectDocumentCorners } from '../core/edgeDetection';
import { Check, RotateCcw, X, Wand2, RotateCw, Maximize2 } from 'lucide-react';

interface CropViewProps {
  imageSrc: string;
  onConfirm: (warpedCanvas: HTMLCanvasElement, quad: Quad) => void;
  onCancel: () => void;
}

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
type EdgeKey = 'top' | 'right' | 'bottom' | 'left';

export const CropView: React.FC<CropViewProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [currentSrc, setCurrentSrc] = useState<string>(imageSrc);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [activeEdge, setActiveEdge] = useState<EdgeKey | null>(null);
  const [edgeDragStart, setEdgeDragStart] = useState<{ client: Point; quad: Quad } | null>(null);
  const [pointerPos, setPointerPos] = useState<Point | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const hasInitializedRef = useRef(false);

  const triggerHaptic = useCallback((duration = 10) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  }, []);

  const handleImageLoad = () => {
    if (!imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    setImageSize({ width: naturalWidth, height: naturalHeight });

    // Run auto corner detection on first image load
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      try {
        const detected = detectDocumentCorners(imageRef.current);
        setQuad(detected);
      } catch {
        setQuad(getDefaultQuad(naturalWidth, naturalHeight));
      }
    }
  };

  const handleAutoDetect = () => {
    if (!imageRef.current) return;
    triggerHaptic(15);
    const detected = detectDocumentCorners(imageRef.current);
    setQuad(detected);
  };

  const handleSelectFullImage = () => {
    if (imageSize.width === 0 || imageSize.height === 0) return;
    triggerHaptic(15);
    setQuad({
      topLeft: { x: 0, y: 0 },
      topRight: { x: imageSize.width, y: 0 },
      bottomRight: { x: imageSize.width, y: imageSize.height },
      bottomLeft: { x: 0, y: imageSize.height },
    });
  };

  const handleResetQuad = () => {
    triggerHaptic(15);
    setQuad(getDefaultQuad(imageSize.width, imageSize.height));
  };

  // Map viewport client coords to natural image coords
  const clientToImageCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!imageRef.current || imageSize.width === 0) return { x: 0, y: 0 };
      const rect = imageRef.current.getBoundingClientRect();
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;

      const imgX = Math.max(0, Math.min(imageSize.width, (clientX - rect.left) * scaleX));
      const imgY = Math.max(0, Math.min(imageSize.height, (clientY - rect.top) * scaleY));

      return { x: imgX, y: imgY };
    },
    [imageSize]
  );

  // Map natural image coords to viewport client coords
  const imageToClientCoords = useCallback(
    (point: Point): Point => {
      if (!imageRef.current || imageSize.width === 0) return { x: 0, y: 0 };
      const rect = imageRef.current.getBoundingClientRect();
      const scaleX = rect.width / imageSize.width;
      const scaleY = rect.height / imageSize.height;

      return {
        x: rect.left + point.x * scaleX,
        y: rect.top + point.y * scaleY,
      };
    },
    [imageSize]
  );

  const handleCornerPointerDown = (corner: CornerKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveCorner(corner);
    setActiveEdge(null);
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerHaptic(15);
  };

  const handleEdgePointerDown = (edge: EdgeKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!quad) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveEdge(edge);
    setActiveCorner(null);
    setEdgeDragStart({ client: { x: e.clientX, y: e.clientY }, quad: { ...quad } });
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerHaptic(15);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!quad) return;

    // Corner dragging with magnetic edge snapping
    if (activeCorner) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });
      const imgCoord = clientToImageCoords(e.clientX, e.clientY);

      const SNAP = 24;
      if (Math.abs(imgCoord.x - 0) < SNAP) {
        imgCoord.x = 0;
        triggerHaptic(8);
      } else if (Math.abs(imgCoord.x - imageSize.width) < SNAP) {
        imgCoord.x = imageSize.width;
        triggerHaptic(8);
      }

      if (Math.abs(imgCoord.y - 0) < SNAP) {
        imgCoord.y = 0;
        triggerHaptic(8);
      } else if (Math.abs(imgCoord.y - imageSize.height) < SNAP) {
        imgCoord.y = imageSize.height;
        triggerHaptic(8);
      }

      setQuad((prev) => (prev ? { ...prev, [activeCorner]: imgCoord } : prev));
      return;
    }

    // Edge Midpoint dragging
    if (activeEdge && edgeDragStart && imageRef.current) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });

      const rect = imageRef.current.getBoundingClientRect();
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;

      const dx = (e.clientX - edgeDragStart.client.x) * scaleX;
      const dy = (e.clientY - edgeDragStart.client.y) * scaleY;
      const orig = edgeDragStart.quad;

      const clampPt = (pt: Point, deltaX: number, deltaY: number): Point => ({
        x: Math.max(0, Math.min(imageSize.width, Math.round(pt.x + deltaX))),
        y: Math.max(0, Math.min(imageSize.height, Math.round(pt.y + deltaY))),
      });

      setQuad((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (activeEdge === 'top') {
          next.topLeft = clampPt(orig.topLeft, dx, dy);
          next.topRight = clampPt(orig.topRight, dx, dy);
        } else if (activeEdge === 'right') {
          next.topRight = clampPt(orig.topRight, dx, dy);
          next.bottomRight = clampPt(orig.bottomRight, dx, dy);
        } else if (activeEdge === 'bottom') {
          next.bottomLeft = clampPt(orig.bottomLeft, dx, dy);
          next.bottomRight = clampPt(orig.bottomRight, dx, dy);
        } else if (activeEdge === 'left') {
          next.topLeft = clampPt(orig.topLeft, dx, dy);
          next.bottomLeft = clampPt(orig.bottomLeft, dx, dy);
        }
        return next;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner || activeEdge) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setActiveCorner(null);
      setActiveEdge(null);
      setEdgeDragStart(null);
      setPointerPos(null);
      triggerHaptic(10);
    }
  };

  const handleRotate = () => {
    triggerHaptic(15);
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0) return;

    // Create rotated canvas
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = imageSize.height;
    rotCanvas.height = imageSize.width;
    const ctx = rotCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
    ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(imageRef.current, -imageSize.width / 2, -imageSize.height / 2);

    const rotatedDataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);

    const oldH = imageSize.height;
    const rotPt = (p: Point): Point => ({
      x: Math.round(oldH - p.y),
      y: Math.round(p.x),
    });

    if (quad) {
      setQuad({
        topLeft: rotPt(quad.bottomLeft),
        topRight: rotPt(quad.topLeft),
        bottomRight: rotPt(quad.topRight),
        bottomLeft: rotPt(quad.bottomRight),
      });
    }

    setImageSize({ width: imageSize.height, height: imageSize.width });
    setCurrentSrc(rotatedDataUrl);
  };

  const handleApply = () => {
    if (!imageRef.current || !quad) return;
    triggerHaptic(20);

    const warped = warpPerspective(imageRef.current, quad);
    onConfirm(warped, quad);
  };

  const renderPolyPoints = () => {
    if (!quad) return '';
    const tl = imageToClientCoords(quad.topLeft);
    const tr = imageToClientCoords(quad.topRight);
    const br = imageToClientCoords(quad.bottomRight);
    const bl = imageToClientCoords(quad.bottomLeft);
    return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  };

  // Loupe target coordinates
  let loupeTargetPt: Point | null = null;
  if (quad) {
    if (activeCorner) {
      loupeTargetPt = quad[activeCorner];
    } else if (activeEdge) {
      if (activeEdge === 'top') {
        loupeTargetPt = { x: (quad.topLeft.x + quad.topRight.x) / 2, y: (quad.topLeft.y + quad.topRight.y) / 2 };
      } else if (activeEdge === 'right') {
        loupeTargetPt = { x: (quad.topRight.x + quad.bottomRight.x) / 2, y: (quad.topRight.y + quad.bottomRight.y) / 2 };
      } else if (activeEdge === 'bottom') {
        loupeTargetPt = { x: (quad.bottomLeft.x + quad.bottomRight.x) / 2, y: (quad.bottomLeft.y + quad.bottomRight.y) / 2 };
      } else if (activeEdge === 'left') {
        loupeTargetPt = { x: (quad.topLeft.x + quad.bottomLeft.x) / 2, y: (quad.topLeft.y + quad.bottomLeft.y) / 2 };
      }
    }
  }

  const edgeMidpoints = quad
    ? {
        top: {
          x: (imageToClientCoords(quad.topLeft).x + imageToClientCoords(quad.topRight).x) / 2,
          y: (imageToClientCoords(quad.topLeft).y + imageToClientCoords(quad.topRight).y) / 2,
        },
        right: {
          x: (imageToClientCoords(quad.topRight).x + imageToClientCoords(quad.bottomRight).x) / 2,
          y: (imageToClientCoords(quad.topRight).y + imageToClientCoords(quad.bottomRight).y) / 2,
        },
        bottom: {
          x: (imageToClientCoords(quad.bottomLeft).x + imageToClientCoords(quad.bottomRight).x) / 2,
          y: (imageToClientCoords(quad.bottomLeft).y + imageToClientCoords(quad.bottomRight).y) / 2,
        },
        left: {
          x: (imageToClientCoords(quad.topLeft).x + imageToClientCoords(quad.bottomLeft).x) / 2,
          y: (imageToClientCoords(quad.topLeft).y + imageToClientCoords(quad.bottomLeft).y) / 2,
        },
      }
    : null;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans"
    >
      {/* Top Action Bar */}
      <div className="relative z-30 flex items-center justify-between px-4 pt-12 pb-3 otium-chrome border-b border-white/[0.08]">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-button text-gray-300 active:text-white"
          title="إلغاء / Cancel"
        >
          <X className="w-4 h-4" />
          <span className="text-xs">إلغاء</span>
        </button>

        <span className="text-xs font-bold tracking-wide text-white font-arabic">
          تحديد أبعاد المستند
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSelectFullImage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full glass-button text-emerald-400 active:scale-95 text-[11px] font-bold"
            title="تحديد كامل الصورة / Full Image"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>الكل</span>
          </button>
          <button
            onClick={handleAutoDetect}
            className="p-2 rounded-full glass-button text-emerald-400 active:scale-90"
            title="كشف ذكي / Auto Detect"
          >
            <Wand2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-2 rounded-full glass-button text-gray-300 active:scale-90"
            title="تدوير 90° / Rotate"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetQuad}
            className="p-2 rounded-full glass-button text-gray-300 active:text-emerald-400"
            title="إعادة ضبط / Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-3 overflow-hidden">
        <img
          ref={imageRef}
          src={currentSrc}
          alt="Scan target"
          onLoad={handleImageLoad}
          className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl pointer-events-none"
        />

        {/* SVG Quad Overlay */}
        {quad && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none z-20">
            <polygon
              points={renderPolyPoints()}
              fill="rgba(16, 185, 129, 0.18)"
              stroke="#10B981"
              strokeWidth="2.5"
              strokeDasharray="6 4"
            />
          </svg>
        )}

        {/* 4 Corner Handles */}
        {quad &&
          (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as CornerKey[]).map((corner) => {
            const clientPt = imageToClientCoords(quad[corner]);
            const isTargeted = activeCorner === corner;
            return (
              <div
                key={corner}
                onPointerDown={(e) => handleCornerPointerDown(corner, e)}
                style={{
                  transform: `translate3d(${clientPt.x}px, ${clientPt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className={`fixed z-30 w-12 h-12 flex items-center justify-center cursor-pointer touch-none transition-transform ${
                  isTargeted ? 'scale-125' : 'active:scale-125'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-emerald-400 border-2 border-white shadow-xl flex items-center justify-center ring-4 ring-emerald-500/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-black" />
                </div>
              </div>
            );
          })}

        {/* 4 Edge Midpoint Handles */}
        {edgeMidpoints &&
          (['top', 'right', 'bottom', 'left'] as EdgeKey[]).map((edge) => {
            const pt = edgeMidpoints[edge];
            const isTargeted = activeEdge === edge;
            return (
              <div
                key={edge}
                onPointerDown={(e) => handleEdgePointerDown(edge, e)}
                style={{
                  transform: `translate3d(${pt.x}px, ${pt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className={`fixed z-30 w-10 h-10 flex items-center justify-center cursor-pointer touch-none transition-transform ${
                  isTargeted ? 'scale-125' : 'active:scale-115'
                }`}
                title={`Drag ${edge} edge`}
              >
                <div className="w-6 h-2.5 rounded-full bg-emerald-500 border border-white/90 shadow-md flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-black/80 rounded-full" />
                </div>
              </div>
            );
          })}

        {/* Precision Magnifier Loupe */}
        {pointerPos && loupeTargetPt && (
          <div
            style={{
              left: `${Math.max(68, Math.min(window.innerWidth - 68, pointerPos.x))}px`,
              top: `${pointerPos.y < 170 ? pointerPos.y + 115 : pointerPos.y - 115}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="fixed z-50 w-28 h-28 rounded-full border-4 border-emerald-400 overflow-hidden shadow-2xl bg-black pointer-events-none ring-4 ring-black/70 animate-in fade-in zoom-in-95 duration-100"
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url(${currentSrc})`,
                backgroundSize: `${imageSize.width * 2.5}px ${imageSize.height * 2.5}px`,
                backgroundPosition: `-${loupeTargetPt.x * 2.5 - 56}px -${loupeTargetPt.y * 2.5 - 56}px`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-[1.5px] bg-emerald-400/80 shadow-sm" />
              <div className="absolute h-full w-[1.5px] bg-emerald-400/80 shadow-sm" />
              <div className="absolute w-3 h-3 rounded-full border-2 border-emerald-400 bg-emerald-400/20" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Confirm Bar */}
      <div className="relative z-30 flex items-center justify-between px-5 pt-3 pb-8 glass-panel border-t-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectFullImage}
            className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-200 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>كامل الصورة</span>
          </button>
          <button
            onClick={handleAutoDetect}
            className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-200 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>كشف ذكي</span>
          </button>
        </div>

        <button
          onClick={handleApply}
          className="flex items-center gap-2 px-7 py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm active:scale-95 transition-transform emerald-glow shadow-xl"
        >
          <Check className="w-5 h-5 stroke-[3]" />
          <span>تطبيق القص</span>
        </button>
      </div>
    </div>
  );
};
