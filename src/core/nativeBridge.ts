/**
 * Otium Native Bridge
 * Connects the web frontend to native Android capabilities in MainActivity.kt
 * via JavascriptInterface: FileProvider sharing, MediaStore/Downloads saving,
 * and seamless handoff to Otium Reader (com.otium.reader).
 */

declare global {
  interface Window {
    OtiumNative?: {
      sharePdf: (base64Data: string, filename: string) => void;
      savePdfToDownloads: (base64Data: string, filename: string) => boolean;
      openInOtiumReader: (base64Data: string, filename: string) => void;
    };
  }
}

export function isNativeAndroid(): boolean {
  return typeof window !== 'undefined' && Boolean(window.OtiumNative);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      resolve(res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Share PDF using native Android Share Sheet or Web Share API
 */
export async function nativeSharePdf(blob: Blob, filename: string, title?: string): Promise<void> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (window.OtiumNative?.sharePdf) {
    try {
      const base64 = await blobToBase64(blob);
      window.OtiumNative.sharePdf(base64, cleanFilename);
      return;
    } catch (e) {
      console.warn('Native share failed, falling back:', e);
    }
  }

  // Web Share fallback
  const file = new File([blob], cleanFilename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title || cleanFilename,
        text: `مستند ممسوح ضوئياً بواسطة Otium Scan`,
      });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.warn('Web Share failed, downloading instead:', e);
    }
  }

  // Fallback download
  downloadBlob(blob, cleanFilename);
}

/**
 * Save PDF directly to Android Downloads directory with system toast
 */
export async function nativeSavePdf(blob: Blob, filename: string): Promise<boolean> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (window.OtiumNative?.savePdfToDownloads) {
    try {
      const base64 = await blobToBase64(blob);
      return window.OtiumNative.savePdfToDownloads(base64, cleanFilename);
    } catch (e) {
      console.warn('Native save failed, falling back:', e);
    }
  }

  // Web download fallback
  downloadBlob(blob, cleanFilename);
  return true;
}

/**
 * Open PDF directly in Otium Reader (com.otium.reader) or system PDF viewer
 */
export async function nativeOpenInOtium(blob: Blob, filename: string): Promise<void> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (window.OtiumNative?.openInOtiumReader) {
    try {
      const base64 = await blobToBase64(blob);
      window.OtiumNative.openInOtiumReader(base64, cleanFilename);
      return;
    } catch (e) {
      console.warn('Native open in Otium Reader failed:', e);
    }
  }

  // Fallback to sharing
  await nativeSharePdf(blob, cleanFilename, 'فتح بواسطة');
}

/**
 * Standard browser blob download helper
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
