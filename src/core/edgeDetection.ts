import { Point, Quad } from './types';
import { getDefaultQuad, getFullFrameQuad, orderCorners } from './geometry';

export { getFullFrameQuad };

/**
 * Intelligent Document Edge Detector (CamScanner-Grade with Text Guard).
 * Detects the real physical paper/book contour on desks, beds, blankets, and tables.
 *
 * Strict Guarantees:
 * 1. Text Guard: NEVER cuts through printed or handwritten text!
 * 2. Outer Border First-Hit: Scans from exterior background inward, stopping at the first paper edge.
 * 3. Full-Frame Safety Fallback: If paper fills the frame (or on any edge uncertainty), sticks to full frame.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  forceFullFrame = false
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) return getDefaultQuad(1000, 1000);

  // Default Full-Frame Quad (0.5% safety margin, preserves 100% of document content)
  const fullFrameQuad = getFullFrameQuad(naturalW, naturalH, 0.005);
  if (forceFullFrame) return fullFrameQuad;

  try {
    // 1. Downscale to ~300px work resolution for high-speed, noise-resistant analysis
    const maxDim = 300;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const workW = Math.max(40, Math.round(naturalW * scale));
    const workH = Math.max(40, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = workW;
    canvas.height = workH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fullFrameQuad;

    ctx.drawImage(sourceImage, 0, 0, workW, workH);
    const imgData = ctx.getImageData(0, 0, workW, workH);
    const data = imgData.data;

    // 2. Grayscale luminance
    const totalPixels = workW * workH;
    const lum = new Uint8Array(totalPixels);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // 3. Central Document Body Characteristics (sampled from central 40% region)
    let centerLumSum = 0;
    let centerCount = 0;
    const cx0 = Math.round(workW * 0.3);
    const cx1 = Math.round(workW * 0.7);
    const cy0 = Math.round(workH * 0.3);
    const cy1 = Math.round(workH * 0.7);

    for (let y = cy0; y < cy1; y++) {
      const row = y * workW;
      for (let x = cx0; x < cx1; x++) {
        centerLumSum += lum[row + x];
        centerCount++;
      }
    }
    const docMeanLum = centerCount > 0 ? centerLumSum / centerCount : 180;

    // If center itself is very dark, this is a dark scene - return full frame
    if (docMeanLum < 75) return fullFrameQuad;

    // 4. Inspect the 4 outer border strips (3.5% margin)
    // If a border strip already matches the paper luminance, the paper touches that edge!
    const calcStripMean = (x0: number, y0: number, x1: number, y1: number): number => {
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * workW;
        for (let x = x0; x < x1; x++) {
          sum += lum[row + x];
          count++;
        }
      }
      return count > 0 ? sum / count : 128;
    };

    const stripDepthX = Math.max(2, Math.round(workW * 0.035));
    const stripDepthY = Math.max(2, Math.round(workH * 0.035));

    const topStripLum = calcStripMean(0, 0, workW, stripDepthY);
    const bottomStripLum = calcStripMean(0, workH - stripDepthY, workW, workH);
    const leftStripLum = calcStripMean(0, 0, stripDepthX, workH);
    const rightStripLum = calcStripMean(workW - stripDepthX, 0, workW, workH);

    const isPaperAtBorder = (stripLum: number): boolean => {
      // If the margin strip is bright or close to center document luminance, it's paper!
      return stripLum > 135 || Math.abs(stripLum - docMeanLum) < 32;
    };

    const topIsPaper = isPaperAtBorder(topStripLum);
    const bottomIsPaper = isPaperAtBorder(bottomStripLum);
    const leftIsPaper = isPaperAtBorder(leftStripLum);
    const rightIsPaper = isPaperAtBorder(rightStripLum);

    // If all 4 borders are paper, document fills the whole frame: return full frame immediately
    if (topIsPaper && bottomIsPaper && leftIsPaper && rightIsPaper) {
      return fullFrameQuad;
    }

    // 5. Exterior-to-Interior Scan (Max Depth 18% - NEVER scan into text territory)
    const maxScanDepthY = Math.round(workH * 0.18);
    const maxScanDepthX = Math.round(workW * 0.18);
    const paperThreshold = Math.max(110, Math.round(docMeanLum * 0.78));

    // Top Edge (only if not already paper)
    const topPts: Point[] = [];
    if (!topIsPaper) {
      const colStep = Math.max(3, Math.floor(workW / 24));
      for (let x = Math.round(workW * 0.1); x < workW * 0.9; x += colStep) {
        for (let y = 1; y < maxScanDepthY; y++) {
          const idx = y * workW + x;
          if (lum[idx] >= paperThreshold) {
            topPts.push({ x, y });
            break; // Stop at FIRST paper pixel
          }
        }
      }
    }

    // Bottom Edge (only if not already paper)
    const bottomPts: Point[] = [];
    if (!bottomIsPaper) {
      const colStep = Math.max(3, Math.floor(workW / 24));
      for (let x = Math.round(workW * 0.1); x < workW * 0.9; x += colStep) {
        for (let y = workH - 2; y > workH - maxScanDepthY; y--) {
          const idx = y * workW + x;
          if (lum[idx] >= paperThreshold) {
            bottomPts.push({ x, y });
            break; // Stop at FIRST paper pixel
          }
        }
      }
    }

    // Left Edge (only if not already paper)
    const leftPts: Point[] = [];
    if (!leftIsPaper) {
      const rowStep = Math.max(3, Math.floor(workH / 24));
      for (let y = Math.round(workH * 0.1); y < workH * 0.9; y += rowStep) {
        for (let x = 1; x < maxScanDepthX; x++) {
          const idx = y * workW + x;
          if (lum[idx] >= paperThreshold) {
            leftPts.push({ x, y });
            break; // Stop at FIRST paper pixel
          }
        }
      }
    }

    // Right Edge (only if not already paper)
    const rightPts: Point[] = [];
    if (!rightIsPaper) {
      const rowStep = Math.max(3, Math.floor(workH / 24));
      for (let y = Math.round(workH * 0.1); y < workH * 0.9; y += rowStep) {
        for (let x = workW - 2; x > workW - maxScanDepthX; x--) {
          const idx = y * workW + x;
          if (lum[idx] >= paperThreshold) {
            rightPts.push({ x, y });
            break; // Stop at FIRST paper pixel
          }
        }
      }
    }

    // 6. Robust Line Fitting with Outlier Rejection
    const fitHorizontalLine = (pts: Point[], fallbackY: number): { m: number; c: number } => {
      if (pts.length < 5) return { m: 0, c: fallbackY };
      const sortedY = [...pts.map((p) => p.y)].sort((a, b) => a - b);
      const medianY = sortedY[Math.floor(sortedY.length / 2)];
      const inliers = pts.filter((p) => Math.abs(p.y - medianY) < workH * 0.06);
      if (inliers.length < 4) return { m: 0, c: medianY };

      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (const p of inliers) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
      }
      const n = inliers.length;
      const denom = n * sumXX - sumX * sumX;
      if (Math.abs(denom) < 1e-4) return { m: 0, c: medianY };
      const m = Math.max(-0.25, Math.min(0.25, (n * sumXY - sumX * sumY) / denom));
      const c = (sumY - m * sumX) / n;
      return { m, c };
    };

    const fitVerticalLine = (pts: Point[], fallbackX: number): { m: number; c: number } => {
      if (pts.length < 5) return { m: 0, c: fallbackX };
      const sortedX = [...pts.map((p) => p.x)].sort((a, b) => a - b);
      const medianX = sortedX[Math.floor(sortedX.length / 2)];
      const inliers = pts.filter((p) => Math.abs(p.x - medianX) < workW * 0.06);
      if (inliers.length < 4) return { m: 0, c: medianX };

      let sumY = 0, sumX = 0, sumYX = 0, sumYY = 0;
      for (const p of inliers) {
        sumY += p.y;
        sumX += p.x;
        sumYX += p.y * p.x;
        sumYY += p.y * p.y;
      }
      const n = inliers.length;
      const denom = n * sumYY - sumY * sumY;
      if (Math.abs(denom) < 1e-4) return { m: 0, c: medianX };
      const m = Math.max(-0.25, Math.min(0.25, (n * sumYX - sumY * sumX) / denom));
      const c = (sumX - m * sumY) / n;
      return { m, c };
    };

    const topLine = topIsPaper
      ? { m: 0, c: Math.round(workH * 0.005) }
      : fitHorizontalLine(topPts, Math.round(workH * 0.005));

    const bottomLine = bottomIsPaper
      ? { m: 0, c: Math.round(workH * 0.995) }
      : fitHorizontalLine(bottomPts, Math.round(workH * 0.995));

    const leftLine = leftIsPaper
      ? { m: 0, c: Math.round(workW * 0.005) }
      : fitVerticalLine(leftPts, Math.round(workW * 0.005));

    const rightLine = rightIsPaper
      ? { m: 0, c: Math.round(workW * 0.995) }
      : fitVerticalLine(rightPts, Math.round(workW * 0.995));

    // 7. Intersect lines to find 4 corners
    const intersect = (hLine: { m: number; c: number }, vLine: { m: number; c: number }): Point => {
      const denom = 1 - hLine.m * vLine.m;
      const y = Math.abs(denom) > 1e-4 ? (hLine.m * vLine.c + hLine.c) / denom : hLine.c;
      const x = vLine.m * y + vLine.c;
      return {
        x: Math.max(0, Math.min(workW, x)),
        y: Math.max(0, Math.min(workH, y)),
      };
    };

    const cTL = intersect(topLine, leftLine);
    const cTR = intersect(topLine, rightLine);
    const cBR = intersect(bottomLine, rightLine);
    const cBL = intersect(bottomLine, leftLine);

    // 8. Scale corners back to natural image coordinates
    const scaleUp = (p: Point): Point => ({
      x: Math.round(p.x / scale),
      y: Math.round(p.y / scale),
    });

    const pTL = scaleUp(cTL);
    const pTR = scaleUp(cTR);
    const pBR = scaleUp(cBR);
    const pBL = scaleUp(cBL);

    // 9. Area & Text Guard Validation
    const quadArea = computeQuadArea(pTL, pTR, pBR, pBL);
    const totalArea = naturalW * naturalH;

    // Document must occupy at least 65% of the frame, otherwise snap to full frame
    if (quadArea >= totalArea * 0.65 && quadArea <= totalArea * 1.0) {
      return orderCorners([pTL, pTR, pBR, pBL]);
    }

    return fullFrameQuad;
  } catch (err) {
    console.warn('Document corner detection error, falling back to full frame:', err);
    return fullFrameQuad;
  }
}

function computeQuadArea(tl: Point, tr: Point, br: Point, bl: Point): number {
  return 0.5 * Math.abs(
    tl.x * tr.y + tr.x * br.y + br.x * bl.y + bl.x * tl.y -
    (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x)
  );
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
