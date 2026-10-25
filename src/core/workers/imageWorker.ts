// Web Worker for asynchronous, non-blocking image processing.
// Uses Zero-Copy Transferable ArrayBuffers for 60fps UI performance.

export type FilterType = 'original' | 'magic' | 'bw' | 'grayscale';

export interface WorkerFilterRequest {
  id: number;
  filter: FilterType;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface WorkerFilterResponse {
  id: number;
  buffer: ArrayBuffer;
  error?: string;
}

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
 * Enterprise Magic Color Filter with Color Stamp/Ink Preservation:
 * Automatically isolates high-saturation colored ink (blue pen, red official stamps)
 * while obliterating non-uniform paper shadows and whitening background.
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

      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const scale = 255 / Math.max(35, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const chroma = maxVal - minVal;

      // Color Stamp & Ink Preservation
      if (chroma > 32 && lum < 205) {
        // Boost saturation for blue signature or red notary stamp
        const mean = (nr + ng + nb) / 3;
        nr = mean + (nr - mean) * 1.35;
        ng = mean + (ng - mean) * 1.35;
        nb = mean + (nb - mean) * 1.35;
      } else if (lum > 218) {
        // Pure crisp white paper ceiling
        nr = 255;
        ng = 255;
        nb = 255;
      } else if (lum < 115) {
        // Deepen text ink
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
      const threshold = bgLum * 0.84;
      const val = lum < threshold ? 0 : 255;

      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }
}

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

self.onmessage = (e: MessageEvent<WorkerFilterRequest>) => {
  const { id, filter, width, height, buffer } = e.data;
  try {
    const data = new Uint8ClampedArray(buffer);

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
      case 'original':
      default:
        break;
    }

    const response: WorkerFilterResponse = { id, buffer: data.buffer };
    // Zero-copy transfer back to the main thread
    (self as any).postMessage(response, [data.buffer]);
  } catch (err: any) {
    const response: WorkerFilterResponse = {
      id,
      buffer,
      error: err?.message || 'Processing failed in worker',
    };
    (self as any).postMessage(response, [buffer]);
  }
};
