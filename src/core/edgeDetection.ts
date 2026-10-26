import { Point, Quad } from './types';
import { getDefaultQuad, orderCorners } from './geometry';

/**
 * Intelligent Document Edge Detector.
 * Only returns an inset polygon if a clear, high-contrast document contour is detected.
 * For general scenes, walls, books, or low-contrast backgrounds, it safely defaults
 * to a clean full-frame quad (2% margin) so the user's photo is never truncated.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) return getDefaultQuad(1000, 1000);

  // Default: Full frame with subtle 2% margin for clean touch handle positioning
  const fullFrameQuad: Quad = {
    topLeft: { x: Math.round(naturalW * 0.02), y: Math.round(naturalH * 0.02) },
    topRight: { x: Math.round(naturalW * 0.98), y: Math.round(naturalH * 0.02) },
    bottomRight: { x: Math.round(naturalW * 0.98), y: Math.round(naturalH * 0.98) },
    bottomLeft: { x: Math.round(naturalW * 0.02), y: Math.round(naturalH * 0.98) },
  };

  try {
    // Downsample to 240px for rapid contrast analysis
    const scale = Math.min(1, 240 / Math.max(naturalW, naturalH));
    const workW = Math.max(20, Math.round(naturalW * scale));
    const workH = Math.max(20, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = workW;
    canvas.height = workH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fullFrameQuad;

    ctx.drawImage(sourceImage, 0, 0, workW, workH);
    const imgData = ctx.getImageData(0, 0, workW, workH);
    const data = imgData.data;

    // Calculate luminance & variance
    let sumLum = 0;
    const totalPixels = workW * workH;
    const lum = new Uint8Array(totalPixels);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      lum[j] = l;
      sumLum += l;
    }

    // Check if the center area differs significantly in brightness from the outer border
    // (the classic hallmark of a sheet of paper on a desk)
    const marginX = Math.round(workW * 0.1);
    const marginY = Math.round(workH * 0.1);

    let borderLumSum = 0;
    let borderCount = 0;

    for (let x = 0; x < workW; x++) {
      borderLumSum += lum[x]; // top border
      borderLumSum += lum[(workH - 1) * workW + x]; // bottom border
      borderCount += 2;
    }
    for (let y = 1; y < workH - 1; y++) {
      borderLumSum += lum[y * workW]; // left border
      borderLumSum += lum[y * workW + (workW - 1)]; // right border
      borderCount += 2;
    }

    const borderAvgLum = borderLumSum / Math.max(1, borderCount);

    let centerLumSum = 0;
    let centerCount = 0;
    for (let y = marginY; y < workH - marginY; y++) {
      const row = y * workW;
      for (let x = marginX; x < workW - marginX; x++) {
        centerLumSum += lum[row + x];
        centerCount++;
      }
    }

    const centerAvgLum = centerLumSum / Math.max(1, centerCount);
    const contrastDifference = Math.abs(centerAvgLum - borderAvgLum);

    // If there is no strong global contrast between center document and background (< 32),
    // do NOT guess random lines! Return the full frame.
    if (contrastDifference < 32) {
      return fullFrameQuad;
    }

    // High contrast detected: compute Sobel to locate document edges
    const edges = new Uint8Array(totalPixels);
    for (let y = 1; y < workH - 1; y++) {
      for (let x = 1; x < workW - 1; x++) {
        const idx = y * workW + x;
        const gx =
          -lum[idx - workW - 1] + lum[idx - workW + 1] +
          -2 * lum[idx - 1] + 2 * lum[idx + 1] +
          -lum[idx + workW - 1] + lum[idx + workW + 1];
        const gy =
          -lum[idx - workW - 1] - 2 * lum[idx - workW] - lum[idx - workW + 1] +
          lum[idx + workW - 1] + 2 * lum[idx + workW] + lum[idx + workW + 1];
        edges[idx] = Math.min(255, Math.hypot(gx, gy));
      }
    }

    // Search for the 4 bounds, restricting search to maximum 22% from each outer edge
    // so we never create a small rectangle in the middle of the screen!
    const maxSearchX = Math.round(workW * 0.22);
    const maxSearchY = Math.round(workH * 0.22);
    const edgeThreshold = 55;

    let topY = Math.round(workH * 0.02);
    for (let y = Math.round(workH * 0.02); y < maxSearchY; y++) {
      let count = 0;
      const row = y * workW;
      for (let x = Math.round(workW * 0.25); x < Math.round(workW * 0.75); x++) {
        if (edges[row + x] > edgeThreshold) count++;
      }
      if (count > workW * 0.25) {
        topY = y;
        break;
      }
    }

    let bottomY = workH - Math.round(workH * 0.02);
    for (let y = workH - Math.round(workH * 0.02); y > workH - maxSearchY; y--) {
      let count = 0;
      const row = y * workW;
      for (let x = Math.round(workW * 0.25); x < Math.round(workW * 0.75); x++) {
        if (edges[row + x] > edgeThreshold) count++;
      }
      if (count > workW * 0.25) {
        bottomY = y;
        break;
      }
    }

    let leftX = Math.round(workW * 0.02);
    for (let x = Math.round(workW * 0.02); x < maxSearchX; x++) {
      let count = 0;
      for (let y = Math.round(workH * 0.25); y < Math.round(workH * 0.75); y++) {
        if (edges[y * workW + x] > edgeThreshold) count++;
      }
      if (count > workH * 0.25) {
        leftX = x;
        break;
      }
    }

    let rightX = workW - Math.round(workW * 0.02);
    for (let x = workW - Math.round(workW * 0.02); x > workW - maxSearchX; x--) {
      let count = 0;
      for (let y = Math.round(workH * 0.25); y < Math.round(workH * 0.75); y++) {
        if (edges[y * workW + x] > edgeThreshold) count++;
      }
      if (count > workH * 0.25) {
        rightX = x;
        break;
      }
    }

    const pTL: Point = { x: Math.round(leftX / scale), y: Math.round(topY / scale) };
    const pTR: Point = { x: Math.round(rightX / scale), y: Math.round(topY / scale) };
    const pBR: Point = { x: Math.round(rightX / scale), y: Math.round(bottomY / scale) };
    const pBL: Point = { x: Math.round(leftX / scale), y: Math.round(bottomY / scale) };

    return orderCorners([pTL, pTR, pBR, pBL]);
  } catch (err) {
    console.warn('Corner detection error, falling back to full frame:', err);
    return fullFrameQuad;
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
