import { Point, Quad } from './types';
import { getDefaultQuad, orderCorners } from './geometry';

/**
 * Enterprise Document Edge Detector.
 * Analyzes contrast boundaries to locate documents on backgrounds.
 * If no clear document contour is found with high confidence,
 * it returns a clean default quad with a 5% margin (full document view).
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) return getDefaultQuad(1000, 1000);

  // Default fallback: 5% inset
  const fallbackQuad: Quad = {
    topLeft: { x: Math.round(naturalW * 0.05), y: Math.round(naturalH * 0.05) },
    topRight: { x: Math.round(naturalW * 0.95), y: Math.round(naturalH * 0.05) },
    bottomRight: { x: Math.round(naturalW * 0.95), y: Math.round(naturalH * 0.95) },
    bottomLeft: { x: Math.round(naturalW * 0.05), y: Math.round(naturalH * 0.95) },
  };

  // Downsample to 320px for rapid ~8ms execution
  const scale = Math.min(1, 320 / Math.max(naturalW, naturalH));
  const workW = Math.max(20, Math.round(naturalW * scale));
  const workH = Math.max(20, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallbackQuad;

  ctx.drawImage(sourceImage, 0, 0, workW, workH);
  const imgData = ctx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  const totalPixels = workW * workH;
  const gray = new Uint8Array(totalPixels);

  // Compute grayscale
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Sobel Edge Detection
  const edges = new Uint8Array(totalPixels);
  for (let y = 1; y < workH - 1; y++) {
    for (let x = 1; x < workW - 1; x++) {
      const idx = y * workW + x;
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

  // Cast inward rays from the 4 outer margins towards center
  const marginX = Math.round(workW * 0.04);
  const marginY = Math.round(workH * 0.04);
  const maxSearchX = Math.round(workW * 0.38);
  const maxSearchY = Math.round(workH * 0.38);
  const edgeThreshold = 45;

  // Find top edge
  let topY = marginY;
  for (let y = marginY; y < maxSearchY; y++) {
    let edgeCount = 0;
    const row = y * workW;
    for (let x = Math.round(workW * 0.2); x < Math.round(workW * 0.8); x++) {
      if (edges[row + x] > edgeThreshold) edgeCount++;
    }
    if (edgeCount > workW * 0.22) {
      topY = y;
      break;
    }
  }

  // Find bottom edge
  let bottomY = workH - marginY;
  for (let y = workH - marginY; y > workH - maxSearchY; y--) {
    let edgeCount = 0;
    const row = y * workW;
    for (let x = Math.round(workW * 0.2); x < Math.round(workW * 0.8); x++) {
      if (edges[row + x] > edgeThreshold) edgeCount++;
    }
    if (edgeCount > workW * 0.22) {
      bottomY = y;
      break;
    }
  }

  // Find left edge
  let leftX = marginX;
  for (let x = marginX; x < maxSearchX; x++) {
    let edgeCount = 0;
    for (let y = Math.round(workH * 0.2); y < Math.round(workH * 0.8); y++) {
      if (edges[y * workW + x] > edgeThreshold) edgeCount++;
    }
    if (edgeCount > workH * 0.22) {
      leftX = x;
      break;
    }
  }

  // Find right edge
  let rightX = workW - marginX;
  for (let x = workW - marginX; x > workW - maxSearchX; x--) {
    let edgeCount = 0;
    for (let y = Math.round(workH * 0.2); y < Math.round(workH * 0.8); y++) {
      if (edges[y * workW + x] > edgeThreshold) edgeCount++;
    }
    if (edgeCount > workH * 0.22) {
      rightX = x;
      break;
    }
  }

  // Sanity check: span must be at least 40% of the image
  const detectedWidth = (rightX - leftX) / scale;
  const detectedHeight = (bottomY - topY) / scale;

  if (detectedWidth < naturalW * 0.4 || detectedHeight < naturalH * 0.4) {
    return fallbackQuad;
  }

  const pTL: Point = { x: Math.round(leftX / scale), y: Math.round(topY / scale) };
  const pTR: Point = { x: Math.round(rightX / scale), y: Math.round(topY / scale) };
  const pBR: Point = { x: Math.round(rightX / scale), y: Math.round(bottomY / scale) };
  const pBL: Point = { x: Math.round(leftX / scale), y: Math.round(bottomY / scale) };

  try {
    return orderCorners([pTL, pTR, pBR, pBL]);
  } catch {
    return fallbackQuad;
  }
}

/**
 * Calculates focus sharpness of an image using Laplacian operator variance.
 */
export function calculateLaplacianSharpness(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): number {
  const w = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const h = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (w === 0 || h === 0) return 0;

  const scale = Math.min(1, 160 / Math.max(w, h));
  const workW = Math.max(10, Math.round(w * scale));
  const workH = Math.max(10, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 100;

  ctx.drawImage(sourceImage, 0, 0, workW, workH);
  const imgData = ctx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  const total = workW * workH;
  const gray = new Uint8Array(total);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  let sum = 0;
  let count = 0;
  const lapScores = new Float32Array(total);

  for (let y = 1; y < workH - 1; y++) {
    const row = y * workW;
    for (let x = 1; x < workW - 1; x++) {
      const idx = row + x;
      const val =
        gray[idx - workW] +
        gray[idx + workW] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      lapScores[count] = val;
      sum += val;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;

  let variance = 0;
  for (let i = 0; i < count; i++) {
    const diff = lapScores[i] - mean;
    variance += diff * diff;
  }

  return Math.round(variance / count);
}
