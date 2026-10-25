import { FilterType } from './types';

/**
 * Applies document enhancement filter onto a canvas and returns the result
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
      applyMagicFilter(data, width, height);
      break;
    case 'bw':
      applyBwFilter(data, width, height);
      break;
    case 'grayscale':
      applyGrayscaleFilter(data);
      break;
  }

  ctx.putImageData(imageData, 0, 0);
  return destCanvas;
}

/**
 * Magic Color: Whitens background, eliminates shadow gradients, amplifies ink contrast
 */
function applyMagicFilter(data: Uint8ClampedArray, _width: number, _height: number) {
  // Pass 1: Local background estimation & contrast expansion
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Perceived luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // S-curve contrast stretching with white-point boost
    // Values above ~140 get pushed toward 255 (clean white paper)
    // Values below ~110 get deepened toward 0 (crisp ink)
    const factor = 1.35;
    const shift = 25;

    let nr = (r - 128) * factor + 128 + shift;
    let ng = (g - 128) * factor + 128 + shift;
    let nb = (b - 128) * factor + 128 + shift;

    // Highlight ceiling compression
    if (lum > 165) {
      const boost = (lum - 165) * 1.5;
      nr += boost;
      ng += boost;
      nb += boost;
    }

    data[i] = Math.min(255, Math.max(0, nr));
    data[i + 1] = Math.min(255, Math.max(0, ng));
    data[i + 2] = Math.min(255, Math.max(0, nb));
  }
}

/**
 * Pure High-Contrast Document B&W (Adaptive Threshold)
 */
function applyBwFilter(data: Uint8ClampedArray, _w: number, _h: number) {
  const len = data.length;
  // Calculate dynamic threshold average
  let sum = 0;
  for (let i = 0; i < len; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avg = (sum / (len / 4)) * 0.92;

  for (let i = 0; i < len; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = lum < avg ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
}

/**
 * Smooth Neutral Grayscale
 */
function applyGrayscaleFilter(data: Uint8ClampedArray) {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
}
