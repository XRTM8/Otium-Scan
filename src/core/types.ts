export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export type FilterType = 'magic' | 'bw' | 'grayscale' | 'original';

export interface ScannedPage {
  id: string;
  originalImage: string;
  quad: Quad;
  warpedCanvas: HTMLCanvasElement;
  filteredCanvas: HTMLCanvasElement;
  filter: FilterType;
  timestamp: number;
}

export type ScanStep = 'camera' | 'crop' | 'review';
