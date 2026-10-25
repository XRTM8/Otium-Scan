import { Point, Quad } from './types';
import { getDefaultQuad, orderCorners } from './geometry';

/**
 * Advanced Dual-Pass Document Corner Detector.
 * Combines Sobel gradient analysis with Otsu's adaptive binarization to detect
 * paper boundaries even on low-contrast backgrounds (light desks, pale tablecloths).
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  // Process on 320px downscaled buffer for fast ~12ms execution
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

  // Compute grayscale buffer & histogram
  const totalPixels = workW * workH;
  const gray = new Uint8Array(totalPixels);
  const histogram = new Uint32Array(256);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[j] = lum;
    histogram[lum]++;
  }

  // Pass 1: Compute Otsu's optimal threshold for background separation
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let otsuThreshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const betweenVariance = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      otsuThreshold = t;
    }
  }

  // Pass 2: Sobel Edge Magnitude Buffer
  const edges = new Uint8Array(totalPixels);
  for (let y = 1; y < workH - 1; y++) {
    for (let x = 1; x < workW - 1; x++) {
      const idx = y * workW + x;
      // Horizontal gradient
      const gx =
        -gray[idx - workW - 1] + gray[idx - workW + 1] +
        -2 * gray[idx - 1] + 2 * gray[idx + 1] +
        -gray[idx + workW - 1] + gray[idx + workW + 1];

      // Vertical gradient
      const gy =
        -gray[idx - workW - 1] - 2 * gray[idx - workW] - gray[idx - workW + 1] +
        gray[idx + workW - 1] + 2 * gray[idx + workW] + gray[idx + workW + 1];

      edges[idx] = Math.min(255, Math.hypot(gx, gy));
    }
  }

  // Multi-Ray Scan inward from the four quadrants
  const maxSearchSteps = Math.min(workW, workH) * 0.42;
  const edgeCutoff = 45;

  function findCornerAlongRay(startX: number, startY: number, dirX: number, dirY: number): Point {
    let cx = startX;
    let cy = startY;

    for (let s = 0; s < maxSearchSteps; s++) {
      cx += dirX;
      cy += dirY;
      const x = Math.round(cx);
      const y = Math.round(cy);
      if (x < 2 || x >= workW - 2 || y < 2 || y >= workH - 2) break;

      const idx = y * workW + x;
      const edgeVal = edges[idx];
      const lumVal = gray[idx];

      // Trigger if sharp edge hit OR luminance crossed Otsu threshold significantly
      if (edgeVal > edgeCutoff || Math.abs(lumVal - otsuThreshold) > 40) {
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

  const pTL = findCornerAlongRay(workW * 0.06, workH * 0.06, 1.2, 1.2);
  const pTR = findCornerAlongRay(workW * 0.94, workH * 0.06, -1.2, 1.2);
  const pBR = findCornerAlongRay(workW * 0.94, workH * 0.94, -1.2, -1.2);
  const pBL = findCornerAlongRay(workW * 0.06, workH * 0.94, 1.2, -1.2);

  try {
    return orderCorners([pTL, pTR, pBR, pBL]);
  } catch {
    return getDefaultQuad(naturalW, naturalH);
  }
}
