import { Point, Quad } from './types';
import { getDefaultQuad, orderCorners } from './geometry';

/**
 * Robust Document Edge Detector v2.
 * Uses Sobel edges + smart largest-rectangle finder instead of brittle ray-casting.
 * Falls back gracefully to a margin-padded default when no clear document is found.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) return getDefaultQuad(naturalW, naturalH);

  // Downsample to 400px for better accuracy while staying fast
  const scale = Math.min(1, 400 / Math.max(naturalW, naturalH));
  const workW = Math.max(20, Math.round(naturalW * scale));
  const workH = Math.max(20, Math.round(naturalH * scale));

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

  // Pass 1: Grayscale
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Pass 2: Sobel Edge Detection
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

  // Pass 3: Find document bounding box via projection profiles
  // Horizontal profile: sum of edge pixels per column
  const colProfile = new Float32Array(workW);
  const rowProfile = new Float32Array(workH);

  for (let y = 2; y < workH - 2; y++) {
    for (let x = 2; x < workW - 2; x++) {
      const v = edges[y * workW + x];
      colProfile[x] += v;
      rowProfile[y] += v;
    }
  }

  // Find the strongest edge band for each axis using sliding window
  const MARGIN = Math.round(Math.min(workW, workH) * 0.06); // 6% margin minimum

  function findEdgePair(profile: Float32Array, size: number): [number, number] {
    const windowSize = Math.max(4, Math.round(size * 0.06));
    let leftBest = 0, leftScore = -1;
    let rightBest = size - 1, rightScore = -1;

    // Search left half for left edge
    for (let i = MARGIN; i < size * 0.45; i++) {
      let s = 0;
      for (let k = -windowSize; k <= windowSize; k++) {
        const idx = Math.max(0, Math.min(size - 1, i + k));
        s += profile[idx];
      }
      if (s > leftScore) { leftScore = s; leftBest = i; }
    }

    // Search right half for right edge
    for (let i = Math.round(size * 0.55); i < size - MARGIN; i++) {
      let s = 0;
      for (let k = -windowSize; k <= windowSize; k++) {
        const idx = Math.max(0, Math.min(size - 1, i + k));
        s += profile[idx];
      }
      if (s > rightScore) { rightScore = s; rightBest = i; }
    }

    // Validate: if detection span is too small, use margin-based default
    const span = rightBest - leftBest;
    if (span < size * 0.25 || leftScore < 50 || rightScore < 50) {
      return [Math.round(size * 0.05), Math.round(size * 0.95)];
    }

    return [leftBest, rightBest];
  }

  const [xLeft, xRight] = findEdgePair(colProfile, workW);
  const [yTop, yBottom] = findEdgePair(rowProfile, workH);

  // Scale back to natural image coordinates
  const toNatX = (x: number) => Math.round((x / workW) * naturalW);
  const toNatY = (y: number) => Math.round((y / workH) * naturalH);

  const pTL: Point = { x: toNatX(xLeft),  y: toNatY(yTop)    };
  const pTR: Point = { x: toNatX(xRight), y: toNatY(yTop)    };
  const pBR: Point = { x: toNatX(xRight), y: toNatY(yBottom) };
  const pBL: Point = { x: toNatX(xLeft),  y: toNatY(yBottom) };

  try {
    return orderCorners([pTL, pTR, pBR, pBL]);
  } catch {
    return getDefaultQuad(naturalW, naturalH);
  }
}

/**
 * Calculates the focus sharpness of an image using Laplacian operator variance.
 * Blurry or out-of-focus camera frames yield low variance (< 30).
 * Crisp, in-focus documents yield high variance (> 60).
 */
export function calculateLaplacianSharpness(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): number {
  const w = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const h = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

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
