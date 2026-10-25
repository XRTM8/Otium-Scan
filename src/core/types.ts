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

export interface ScannedDocument {
  id: string;
  originalImage: string; // base64 or blob URL
  quad: Quad;
  croppedImage: string;
  filteredImage: string;
  filter: FilterType;
  timestamp: number;
}

export type ScanStep = 'camera' | 'crop' | 'filter' | 'export';
