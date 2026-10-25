import { Point, Quad } from './types';

export function distance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function orderCorners(pts: Point[]): Quad {
  if (pts.length !== 4) {
    throw new Error('Quad requires exactly 4 points');
  }

  const sortedByY = [...pts].sort((a, b) => a.y - b.y);
  const topPair = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomPair = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

  return {
    topLeft: topPair[0],
    topRight: topPair[1],
    bottomLeft: bottomPair[0],
    bottomRight: bottomPair[1],
  };
}

export function getDefaultQuad(width: number, height: number): Quad {
  const insetX = width * 0.08;
  const insetY = height * 0.08;

  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: width - insetX, y: insetY },
    bottomRight: { x: width - insetX, y: height - insetY },
    bottomLeft: { x: insetX, y: height - insetY },
  };
}

/**
 * High-performance Perspective Warp via 8x8 Subdivision Mesh
 */
export function warpPerspective(
  source: HTMLImageElement | HTMLCanvasElement,
  quad: Quad,
  targetWidth?: number,
  targetHeight?: number
): HTMLCanvasElement {
  const { topLeft, topRight, bottomRight, bottomLeft } = quad;

  const widthTop = distance(topLeft, topRight);
  const widthBottom = distance(bottomLeft, bottomRight);
  const heightLeft = distance(topLeft, bottomLeft);
  const heightRight = distance(topRight, bottomRight);

  const outW = Math.round(targetWidth || Math.max(widthTop, widthBottom));
  const outH = Math.round(targetHeight || Math.max(heightLeft, heightRight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(outW, 100);
  canvas.height = Math.max(outH, 100);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  renderQuadSubdivision(ctx, source, quad, outW, outH);
  return canvas;
}

/**
 * 3D Book Spine Curvature Dewarping Engine.
 * Flattens arched and curved text lines in thick bound books.
 * @param curvature 0 to 1 intensity of spine curvature correction
 */
export function dewarpBookCurvature(
  sourceCanvas: HTMLCanvasElement,
  curvature: number = 0.25
): HTMLCanvasElement {
  if (curvature <= 0.02) return sourceCanvas;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = w;
  destCanvas.height = h;
  const ctx = destCanvas.getContext('2d');
  if (!ctx) return sourceCanvas;

  // Split into 64 fine vertical strips and shift along cylindrical arc
  const strips = 64;
  const stripW = w / strips;
  const maxLift = h * 0.08 * curvature;

  for (let i = 0; i < strips; i++) {
    const normX = i / strips;
    // Parabolic/sine cylindrical deflection model
    const deflection = Math.sin(normX * Math.PI) * maxLift;

    const sx = i * stripW;
    const sy = 0;
    const sHeight = h;

    const dx = sx;
    const dy = -deflection / 2;
    const dHeight = h + deflection;

    ctx.drawImage(
      sourceCanvas,
      sx, sy, stripW, sHeight,
      dx, dy, stripW, dHeight
    );
  }

  return destCanvas;
}

function renderQuadSubdivision(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  quad: Quad,
  w: number,
  h: number
) {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = quad;
  const steps = 8;

  for (let y = 0; y < steps; y++) {
    for (let x = 0; x < steps; x++) {
      const u0 = x / steps;
      const v0 = y / steps;
      const u1 = (x + 1) / steps;
      const v1 = (y + 1) / steps;

      const p00 = bilinearInterpolate(tl, tr, bl, br, u0, v0);
      const p10 = bilinearInterpolate(tl, tr, bl, br, u1, v0);
      const p01 = bilinearInterpolate(tl, tr, bl, br, u0, v1);
      const p11 = bilinearInterpolate(tl, tr, bl, br, u1, v1);

      renderTriangle(ctx, image, p00, p10, p01, u0 * w, v0 * h, u1 * w, v0 * h, u0 * w, v1 * h);
      renderTriangle(ctx, image, p10, p11, p01, u1 * w, v0 * h, u1 * w, v1 * h, u0 * w, v1 * h);
    }
  }
}

function bilinearInterpolate(tl: Point, tr: Point, bl: Point, br: Point, u: number, v: number): Point {
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const botX = bl.x + (br.x - bl.x) * u;
  const botY = bl.y + (br.y - bl.y) * u;
  return {
    x: topX + (botX - topX) * v,
    y: topY + (botY - topY) * v,
  };
}

function renderTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  s0: Point, s1: Point, s2: Point,
  d0x: number, d0y: number,
  d1x: number, d1y: number,
  d2x: number, d2y: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0x, d0y);
  ctx.lineTo(d1x, d1y);
  ctx.lineTo(d2x, d2y);
  ctx.closePath();
  ctx.clip();

  const denom = (s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y));
  if (Math.abs(denom) < 0.0001) {
    ctx.restore();
    return;
  }

  const m11 = -(s0.y * (d1x - d2x) + s1.y * (d2x - d0x) + s2.y * (d0x - d1x)) / denom;
  const m12 = (s0.y * (d1y - d2y) + s1.y * (d2y - d0y) + s2.y * (d0y - d1y)) / denom;
  const m21 = (s0.x * (d1x - d2x) + s1.x * (d2x - d0x) + s2.x * (d0x - d1x)) / denom;
  const m22 = -(s0.x * (d1y - d2y) + s1.x * (d2y - d0y) + s2.x * (d0y - d1y)) / denom;
  const dx = (s0.x * (s1.y * d2x - s2.y * d1x) + s0.y * (s2.x * d1x - s1.x * d2x) + (s1.x * s2.y - s2.x * s1.y) * d0x) / denom;
  const dy = (s0.x * (s1.y * d2y - s2.y * d1y) + s0.y * (s2.x * d1y - s1.x * d2y) + (s1.x * s2.y - s2.x * s1.y) * d0y) / denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
