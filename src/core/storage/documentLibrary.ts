/**
 * Persistent Document Library Store for Otium Scan.
 * Saves compiled PDFs and scan sessions so users can access, re-read,
 * and share previous scans days or weeks later.
 */

const DB_NAME = 'otium_scan_library';
const STORE_NAME = 'documents';

export interface LibraryDocument {
  id: string;
  title: string;
  pageCount: number;
  thumbnail: string;
  pdfBlob: Blob;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

async function getLibraryDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function saveDocumentToLibrary(
  doc: Omit<LibraryDocument, 'createdAt'>
): Promise<void> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item: LibraryDocument = {
      ...doc,
      createdAt: Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllLibraryDocuments(): Promise<LibraryDocument[]> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const docs = (req.result as LibraryDocument[]) || [];
      docs.sort((a, b) => b.createdAt - a.createdAt);
      resolve(docs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDocumentFromLibrary(id: string): Promise<void> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
