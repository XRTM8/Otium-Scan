import { createWorker } from 'tesseract.js';
import { OcrWordToken } from '../pdf';

const workers = new Map<string, Promise<any>>();

async function getWorker(lang: string = 'ara+eng') {
  if (!workers.has(lang)) {
    const promise = (async () => {
      // Configure local cache persistence so language weights are saved to IndexedDB
      const worker = await createWorker(lang, 1, {
        cacheMethod: 'write',
        gzip: true,
        logger: () => {}, // silent
      });
      return worker;
    })();
    workers.set(lang, promise);
  }
  return workers.get(lang)!;
}

/**
 * Performs optical character recognition on a canvas and extracts
 * word tokens with normalized bounding box coordinates for Searchable PDF embedding.
 */
export async function performOcr(
  canvas: HTMLCanvasElement,
  lang: string = 'ara+eng',
  timeoutMs: number = 7000
): Promise<OcrWordToken[]> {
  // If user is completely offline and worker is uninitialized, avoid stalling export
  const effectiveTimeout =
    typeof navigator !== 'undefined' && !navigator.onLine && !workers.has(lang)
      ? 1500
      : timeoutMs;

  const ocrTask = async (): Promise<OcrWordToken[]> => {
    try {
      const worker = await getWorker(lang);
      const ret = await worker.recognize(canvas);
      const words: OcrWordToken[] = [];

      const width = canvas.width;
      const height = canvas.height;

      const dataAny = ret.data as any;
      const rawWords: any[] = dataAny.words || dataAny.lines?.flatMap((l: any) => l.words || []) || [];

      for (const w of rawWords) {
        if (!w || !w.text || typeof w.text !== 'string' || w.text.trim().length === 0) continue;
        const bbox = w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        words.push({
          text: w.text.trim(),
          x: bbox.x0 / width,
          y: bbox.y0 / height,
          width: Math.max(0.01, (bbox.x1 - bbox.x0) / width),
          height: Math.max(0.01, (bbox.y1 - bbox.y0) / height),
        });
      }

      return words;
    } catch (err) {
      console.warn('OCR processing failed or skipped:', err);
      return [];
    }
  };

  const timeoutPromise = new Promise<OcrWordToken[]>((resolve) =>
    setTimeout(() => {
      console.warn(`OCR timed out after ${effectiveTimeout}ms; proceeding without text layer for this page.`);
      resolve([]);
    }, effectiveTimeout)
  );

  return Promise.race([ocrTask(), timeoutPromise]);
}

export async function terminateOcrWorker() {
  for (const [, promise] of workers.entries()) {
    try {
      const worker = await promise;
      await worker.terminate();
    } catch {}
  }
  workers.clear();
}
