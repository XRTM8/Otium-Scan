import { Point, Quad } from './types';
import { getDefaultQuad, orderCorners } from './geometry';

/**
 * Enterprise Intelligent Document Edge Detector (CamScanner-grade).
 * Detects the real physical paper/book contour on desks, beds, blankets, and tables,
 * cropping out the background and extracting only the document.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): Quad {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) return getDefaultQuad(1000, 1000);

  // Fallback: Full frame with 1.5% margin
  const fullFrameQuad: Quad = {
    topLeft: { x: Math.round(naturalW * 0.015), y: Math.round(naturalH * 0.015) },
    topRight: { x: Math.round(naturalW * 0.985), y: Math.round(naturalH * 0.015) },
    bottomRight: { x: Math.round(naturalW * 0.985), y: Math.round(naturalH * 0.985) },
    bottomLeft: { x: Math.round(naturalW * 0.015), y: Math.round(naturalH * 0.985) },
  };

  try {
    // 1. Downscale to ~360px work resolution for high-speed, noise-resistant analysis
    const maxDim = 360;
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

    // 3. Document body characteristics (sampled from central 40% region)
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

    // 4. Sobel Gradient Magnitude & Direction
    const gradX = new Int16Array(totalPixels);
    const gradY = new Int16Array(totalPixels);
    const gradMag = new Uint8Array(totalPixels);

    for (let y = 1; y < workH - 1; y++) {
      const rPrev = (y - 1) * workW;
      const rCurr = y * workW;
      const rNext = (y + 1) * workW;

      for (let x = 1; x < workW - 1; x++) {
        const gx =
          -lum[rPrev + x - 1] + lum[rPrev + x + 1] -
          2 * lum[rCurr + x - 1] + 2 * lum[rCurr + x + 1] -
          lum[rNext + x - 1] + lum[rNext + x + 1];

        const gy =
          -lum[rPrev + x - 1] - 2 * lum[rPrev + x] - lum[rPrev + x + 1] +
          lum[rNext + x - 1] + 2 * lum[rNext + x] + lum[rNext + x + 1];

        const idx = rCurr + x;
        gradX[idx] = gx;
        gradY[idx] = gy;
        gradMag[idx] = Math.min(255, Math.round(Math.hypot(gx, gy)));
      }
    }

    // 5. Multi-Scanline Boundary Transition Detection
    // Top Edge: Scan down from y = 0 to y = workH * 0.45 across columns
    const topPts: Point[] = [];
    const minEdgeGrad = 28;
    const colStep = Math.max(2, Math.floor(workW / 36));

    for (let x = Math.round(workW * 0.08); x < workW * 0.92; x += colStep) {
      let bestY = -1;
      let maxScore = minEdgeGrad;

      for (let y = 3; y < workH * 0.45; y++) {
        const idx = y * workW + x;
        const gy = Math.abs(gradY[idx]);
        const mag = gradMag[idx];
        const lumDiff = Math.abs(lum[idx] - docMeanLum);

        // Score emphasizes horizontal gradient & entering document brightness
        const score = gy * 0.7 + mag * 0.3 - lumDiff * 0.2;
        if (score > maxScore) {
          maxScore = score;
          bestY = y;
        }
      }
      if (bestY > 0) {
        topPts.push({ x, y: bestY });
      }
    }

    // Bottom Edge: Scan up from y = workH - 1 to y = workH * 0.55 across columns
    const bottomPts: Point[] = [];
    for (let x = Math.round(workW * 0.08); x < workW * 0.92; x += colStep) {
      let bestY = -1;
      let maxScore = minEdgeGrad;

      for (let y = workH - 4; y > workH * 0.55; y--) {
        const idx = y * workW + x;
        const gy = Math.abs(gradY[idx]);
        const mag = gradMag[idx];
        const lumDiff = Math.abs(lum[idx] - docMeanLum);

        const score = gy * 0.7 + mag * 0.3 - lumDiff * 0.2;
        if (score > maxScore) {
          maxScore = score;
          bestY = y;
        }
      }
      if (bestY > 0) {
        bottomPts.push({ x, y: bestY });
      }
    }

    // Left Edge: Scan right from x = 0 to x = workW * 0.45 across rows
    const leftPts: Point[] = [];
    const rowStep = Math.max(2, Math.floor(workH / 36));

    for (let y = Math.round(workH * 0.08); y < workH * 0.92; y += rowStep) {
      let bestX = -1;
      let maxScore = minEdgeGrad;

      for (let x = 3; x < workW * 0.45; x++) {
        const idx = y * workW + x;
        const gx = Math.abs(gradX[idx]);
        const mag = gradMag[idx];
        const lumDiff = Math.abs(lum[idx] - docMeanLum);

        const score = gx * 0.7 + mag * 0.3 - lumDiff * 0.2;
        if (score > maxScore) {
          maxScore = score;
          bestX = x;
        }
      }
      if (bestX > 0) {
        leftPts.push({ x: bestX, y });
      }
    }

    // Right Edge: Scan left from x = workW - 1 to x = workW * 0.55 across rows
    const rightPts: Point[] = [];
    for (let y = Math.round(workH * 0.08); y < workH * 0.92; y += rowStep) {
      let bestX = -1;
      let maxScore = minEdgeGrad;

      for (let x = workW - 4; x > workW * 0.55; x--) {
        const idx = y * workW + x;
        const gx = Math.abs(gradX[idx]);
        const mag = gradMag[idx];
        const lumDiff = Math.abs(lum[idx] - docMeanLum);

        const score = gx * 0.7 + mag * 0.3 - lumDiff * 0.2;
        if (score > maxScore) {
          maxScore = score;
          bestX = x;
        }
      }
      if (bestX > 0) {
        rightPts.push({ x: bestX, y });
      }
    }

    // 6. Robust Line Fitting (Horizontal: y = mx + c, Vertical: x = my + c)
    const fitHorizontalLine = (pts: Point[], defaultY: number): { m: number; c: number } => {
      if (pts.length < 4) return { m: 0, c: defaultY };
      // Filter outliers based on median Y
      const sortedY = [...pts.map((p) => p.y)].sort((a, b) => a - b);
      const medianY = sortedY[Math.floor(sortedY.length / 2)];
      const inliers = pts.filter((p) => Math.abs(p.y - medianY) < workH * 0.12);
      if (inliers.length < 3) return { m: 0, c: medianY };

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
      const m = Math.max(-0.4, Math.min(0.4, (n * sumXY - sumX * sumY) / denom));
      const c = (sumY - m * sumX) / n;
      return { m, c };
    };

    const fitVerticalLine = (pts: Point[], defaultX: number): { m: number; c: number } => {
      if (pts.length < 4) return { m: 0, c: defaultX };
      // Filter outliers based on median X
      const sortedX = [...pts.map((p) => p.x)].sort((a, b) => a - b);
      const medianX = sortedX[Math.floor(sortedX.length / 2)];
      const inliers = pts.filter((p) => Math.abs(p.x - medianX) < workW * 0.12);
      if (inliers.length < 3) return { m: 0, c: medianX };

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
      const m = Math.max(-0.4, Math.min(0.4, (n * sumYX - sumY * sumX) / denom));
      const c = (sumX - m * sumY) / n;
      return { m, c };
    };

    const topLine = fitHorizontalLine(topPts, Math.round(workH * 0.02));
    const bottomLine = fitHorizontalLine(bottomPts, Math.round(workH * 0.98));
    const leftLine = fitVerticalLine(leftPts, Math.round(workW * 0.02));
    const rightLine = fitVerticalLine(rightPts, Math.round(workW * 0.98));

    // 7. Intersect the 4 lines to get the 4 corner points
    const intersect = (hLine: { m: number; c: number }, vLine: { m: number; c: number }): Point => {
      // y = hLine.m * x + hLine.c, x = vLine.m * y + vLine.c
      // y = hLine.m * (vLine.m * y + vLine.c) + hLine.c
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

    // 9. Quadrilateral Convexity & Area Validation
    const quadArea = computeQuadArea(pTL, pTR, pBR, pBL);
    const totalArea = naturalW * naturalH;

    // The document must occupy between 25% and 99% of total image area
    if (quadArea > totalArea * 0.25 && quadArea < totalArea * 0.995) {
      return orderCorners([pTL, pTR, pBR, pBL]);
    }

    return fullFrameQuad;
  } catch (err) {
    console.warn('Document corner detection error, using full frame:', err);
    return fullFrameQuad;
  }
}

function computeQuadArea(tl: Point, tr: Point, br: Point, bl: Point): number {
  // Shoelace formula for quadrilateral
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
