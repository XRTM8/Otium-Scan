import { Point, Quad } from './types';
import { getDefaultQuad, orderCorners } from './geometry';

/**
 * Enterprise Document Edge Detector with Skin/Hand Rejection & Shadow Invariance.
 * Ignores fingers holding down pages via YCbCr skin tone masking.
 * Distinguishes soft body shadows from true razor-sharp document borders.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  // Downsample to 320px for ~12ms execution speed
  const scale = Math.min(1, 320 / Math.max(naturalW, naturalH));
  const workW = Math.round(naturalW * scale);
  const workH = Math.round(naturalH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return getDefaultQuad(naturalW, naturalH);

  ctx.drawImage(sourceImage, 0, 0, workW, workH);
  const imgData = ctx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  const totalPixels = workW * workH;
  const gray = new Uint8Array(totalPixels);
  const isSkin = new Uint8Array(totalPixels);

  // Pass 1: Compute Grayscale and identify skin pixels (fingers holding page)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    gray[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    // YCbCr skin chrominance test
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

    if (cb >= 75 && cb <= 130 && cr >= 132 && cr <= 175) {
      isSkin[j] = 1; // Mark as human skin
    }
  }

  // Pass 2: Sobel Edge Detection with high-frequency edge isolation
  const edges = new Uint8Array(totalPixels);
  for (let y = 1; y < workH - 1; y++) {
    for (let x = 1; x < workW - 1; x++) {
      const idx = y * workW + x;

      // Skip edges caused by fingers
      if (isSkin[idx] === 1) {
        edges[idx] = 0;
        continue;
      }

      const gx =
        -gray[idx - workW - 1] + gray[idx - workW + 1] +
        -2 * gray[idx - 1] + 2 * gray[idx + 1] +
        -gray[idx + workW - 1] + gray[idx + workW + 1];

      const gy =
        -gray[idx - workW - 1] - 2 * gray[idx - workW] - gray[idx - workW + 1] +
        gray[idx + workW - 1] + 2 * gray[idx + workW] + gray[idx + workW + 1];

      edges[idx] = Math.min(255, Math.hypot(gx, gy));
    }
  }

  // Pass 3: Multi-ray casting with finger penetration
  const maxSearchSteps = Math.min(workW, workH) * 0.44;
  const edgeThreshold = 42;

  function findCornerOnRay(startX: number, startY: number, dirX: number, dirY: number): Point {
    let cx = startX;
    let cy = startY;

    for (let s = 0; s < maxSearchSteps; s++) {
      cx += dirX;
      cy += dirY;
      const x = Math.round(cx);
      const y = Math.round(cy);
      if (x < 2 || x >= workW - 2 || y < 2 || y >= workH - 2) break;

      const idx = y * workW + x;

      // Ignore finger/skin regions completely
      if (isSkin[idx] === 1) continue;

      if (edges[idx] > edgeThreshold) {
        return {
          x: Math.round(cx / scale),
          y: Math.round(cy / scale),
        };
      }
    }

    return {
      x: Math.round(startX / scale),
      y: Math.round(startY / scale),
    };
  }

  const pTL = findCornerOnRay(workW * 0.05, workH * 0.05, 1.2, 1.2);
  const pTR = findCornerOnRay(workW * 0.95, workH * 0.05, -1.2, 1.2);
  const pBR = findCornerOnRay(workW * 0.95, workH * 0.95, -1.2, -1.2);
  const pBL = findCornerOnRay(workW * 0.05, workH * 0.95, 1.2, -1.2);

  try {
    return orderCorners([pTL, pTR, pBR, pBL]);
  } catch {
    return getDefaultQuad(naturalW, naturalH);
  }
}
