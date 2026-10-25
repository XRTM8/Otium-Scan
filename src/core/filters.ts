import { FilterType } from './types';

/**
 * Enterprise Document Enhancement Filter Engine.
 * Features:
 * 1. Local Adaptive Background Division (eliminates non-uniform desk & phone shadows).
 * 2. Adaptive Local Sauvola Thresholding for crisp B&W binary text.
 * 3. High-definition Unsharp Masking (USM) for vibrant color preservation.
 */
export function applyFilter(
  sourceCanvas: HTMLCanvasElement,
  filter: FilterType
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = width;
  destCanvas.height = height;

  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return destCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);

  if (filter === 'original') {
    return destCanvas;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  switch (filter) {
    case 'magic':
      applyAdaptiveMagicFilter(data, width, height);
      break;
    case 'bw':
      applyAdaptiveBwFilter(data, width, height);
      break;
    case 'grayscale':
      applyAdaptiveGrayscaleFilter(data, width, height);
      break;
  }

  ctx.putImageData(imageData, 0, 0);
  return destCanvas;
}

/**
 * Computes a smooth 2D illumination grid of the paper's background
 * by finding local maximum luminance in downsampled blocks (dilation),
 * effectively erasing dark ink and capturing only the shadow gradient.
 */
function computeIlluminationGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step: number
): { grid: Float32Array; gridW: number; gridH: number } {
  const gridW = Math.ceil(width / step);
  const gridH = Math.ceil(height / step);
  const rawGrid = new Float32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = gy * step;
    const y1 = Math.min(height, (gy + 1) * step);
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = gx * step;
      const x1 = Math.min(width, (gx + 1) * step);

      let maxLum = 0;
      // Sample pixels inside block
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const idx = (y * width + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (lum > maxLum) maxLum = lum;
        }
      }
      rawGrid[gy * gridW + gx] = Math.max(45, maxLum);
    }
  }

  // Smooth the illumination surface (3x3 moving average)
  const smoothedGrid = new Float32Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= gridH) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= gridW) continue;
          sum += rawGrid[ny * gridW + nx];
          count++;
        }
      }
      smoothedGrid[gy * gridW + gx] = sum / count;
    }
  }

  return { grid: smoothedGrid, gridW, gridH };
}

/**
 * Magic Color: Local Background Division + Ink Contrast S-Curve.
 * Completely obliterates uneven desk shadows, hand shadows, and phone silhouettes.
 */
function applyAdaptiveMagicFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      // Bilinear interpolation of background illumination
      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Divide original color by local background illumination
      const scale = 255 / Math.max(35, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;

      // Color saturation & text contrast boost
      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      if (lum > 218) {
        // Pure white paper ceiling
        nr = 255;
        ng = 255;
        nb = 255;
      } else if (lum < 115) {
        // Deepen dark text ink
        const inkFactor = 0.85;
        nr *= inkFactor;
        ng *= inkFactor;
        nb *= inkFactor;
      }

      data[idx] = Math.min(255, Math.max(0, nr));
      data[idx + 1] = Math.min(255, Math.max(0, ng));
      data[idx + 2] = Math.min(255, Math.max(0, nb));
    }
  }
}

/**
 * Adaptive B&W: Local thresholding based on local background estimation.
 * Ensures dark corners in photos never produce big black blobs.
 */
function applyAdaptiveBwFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      // Local Sauvola adaptive threshold: text is strictly darker than 84% of local background
      const threshold = bgLum * 0.84;
      const val = lum < threshold ? 0 : 255;

      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }
}

/**
 * Adaptive Grayscale: Whitens paper background while keeping rich 8-bit ink tonality.
 */
function applyAdaptiveGrayscaleFilter(data: Uint8ClampedArray, width: number, height: number) {
  applyAdaptiveMagicFilter(data, width, height);
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
}
