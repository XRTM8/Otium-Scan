/**
 * IndexedDB Page Storage Engine.
 * Swaps high-resolution raw images and canvases to local disk storage,
 * keeping only lightweight thumbnails in RAM.
 * Prevents mobile Out-Of-Memory (OOM) crashes during large 50+ page scanning sessions.
 */

const DB_NAME = 'otium_scan_storage';
const DB_VERSION = 1;
const STORE_NAME = 'scanned_pages';

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export interface StoredPageRecord {
  id: string;
  originalBlob: Blob;
  warpedBlob: Blob;
  filteredBlob: Blob;
  thumbnailDataUrl: string;
  filter: string;
  timestamp: number;
}

/**
 * Saves a scanned page to local disk cache and returns its thumbnail
 */
export async function storePageToDisk(
  id: string,
  originalDataUrl: string,
  warpedCanvas: HTMLCanvasElement,
  filteredCanvas: HTMLCanvasElement,
  filter: string
): Promise<string> {
  const db = await getDB();

  // Convert raw images to compact Blobs
  const [originalBlob, warpedBlob, filteredBlob] = await Promise.all([
    fetch(originalDataUrl).then((r) => r.blob()),
    new Promise<Blob>((resolve) =>
      warpedCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
    ),
    new Promise<Blob>((resolve) =>
      filteredCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
    ),
  ]);

  // Create ultra-compact 120px thumbnail for RAM
  const thumbCanvas = document.createElement('canvas');
  const aspect = filteredCanvas.width / filteredCanvas.height;
  thumbCanvas.width = 120;
  thumbCanvas.height = Math.round(120 / aspect);
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) {
    tCtx.drawImage(filteredCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);

  const record: StoredPageRecord = {
    id,
    originalBlob,
    warpedBlob,
    filteredBlob,
    thumbnailDataUrl,
    filter,
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);

    req.onsuccess = () => resolve(thumbnailDataUrl);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Loads a filtered canvas for a specific page from disk
 */
export async function loadPageCanvasFromDisk(id: string): Promise<HTMLCanvasElement> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result as StoredPageRecord | undefined;
      if (!record) {
        reject(new Error(`Page not found: ${id}`));
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(record.filteredBlob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode cached page blob'));
      };
      img.src = url;
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Rotates a stored page 90 degrees clockwise and updates cache and thumbnail
 */
export async function rotateStoredPage(id: string): Promise<string> {
  const db = await getDB();
  const record: StoredPageRecord = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!record) throw new Error('Page not found');

  const rotateBlob = async (blob: Blob): Promise<Blob> => {
    const img = await createImageFromBlob(blob);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    }
    return new Promise((res) => canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.9));
  };

  const [newFilteredBlob, newWarpedBlob] = await Promise.all([
    rotateBlob(record.filteredBlob),
    rotateBlob(record.warpedBlob),
  ]);

  const thumbImg = await createImageFromBlob(newFilteredBlob);
  const thumbCanvas = document.createElement('canvas');
  const aspect = thumbImg.naturalWidth / thumbImg.naturalHeight;
  thumbCanvas.width = 120;
  thumbCanvas.height = Math.round(120 / aspect);
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) tCtx.drawImage(thumbImg, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const newThumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);

  record.filteredBlob = newFilteredBlob;
  record.warpedBlob = newWarpedBlob;
  record.thumbnailDataUrl = newThumbDataUrl;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return newThumbDataUrl;
}

function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load blob as image'));
    };
    img.src = url;
  });
}

/**
 * Clears current scan session from disk cache
 */
export async function clearScanSession(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
