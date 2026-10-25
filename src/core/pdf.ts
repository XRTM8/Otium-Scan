export interface OcrWordToken {
  text: string;
  x: number; // percentage (0 to 1) or natural px
  y: number;
  width: number;
  height: number;
}

export interface PdfPageInput {
  canvas: HTMLCanvasElement;
  words?: OcrWordToken[];
}

/**
 * Enterprise Searchable PDF 1.4 Compiler.
 * Renders high-res scanned image with an invisible OCR text layer underneath.
 * Fully supports Ctrl+F search, text selection, copy/paste, and accessibility in all PDF viewers.
 */
export async function createPdfFromCanvases(
  pagesInput: (HTMLCanvasElement | PdfPageInput)[]
): Promise<Blob> {
  const pages: PdfPageInput[] = pagesInput.map((item) =>
    'canvas' in item ? item : { canvas: item, words: [] }
  );

  const offsets: number[] = [];

  // Convert canvases to JPEG bytes
  const imageSpecs = await Promise.all(
    pages.map(async ({ canvas, words }) => {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const base64Data = dataUrl.split(',')[1];
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return {
        width: canvas.width,
        height: canvas.height,
        bytes,
        words: words || [],
      };
    })
  );

  const catalogIndex = 1;
  const pagesContainerIndex = 2;
  const fontObjIndex = 3; // Standard Helvetica for OCR

  const pageObjIndices: number[] = [];
  let currentIndex = 4;

  for (let i = 0; i < imageSpecs.length; i++) {
    currentIndex++; // Image XObject
    pageObjIndices.push(currentIndex++); // Page Object
    currentIndex++; // Content stream
  }

  // Pre-calculate page references
  const pageRefs = pageObjIndices.map((idx) => `${idx} 0 R`).join(' ');

  const finalChunks: (Uint8Array | string)[] = [];
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let byteOffset = 0;

  function writeText(str: string) {
    finalChunks.push(str);
    byteOffset += new TextEncoder().encode(str).length;
  }

  function writeBytes(bytes: Uint8Array) {
    finalChunks.push(bytes);
    byteOffset += bytes.length;
  }

  function recordOffset(objIndex: number) {
    offsets[objIndex] = byteOffset;
  }

  writeText(header);

  // 1: Catalog
  recordOffset(catalogIndex);
  writeText(`${catalogIndex} 0 obj\n<< /Type /Catalog /Pages ${pagesContainerIndex} 0 R >>\nendobj\n`);

  // 2: Pages
  recordOffset(pagesContainerIndex);
  writeText(`${pagesContainerIndex} 0 obj\n<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pageObjIndices.length} >>\nendobj\n`);

  // 3: Base Font (Helvetica for invisible search layer)
  recordOffset(fontObjIndex);
  writeText(`${fontObjIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);

  let objCounter = 4;
  for (let i = 0; i < imageSpecs.length; i++) {
    const spec = imageSpecs[i];
    const imgObjIdx = objCounter++;
    const pageObjIdx = objCounter++;
    const contentObjIdx = objCounter++;

    const ptWidth = Math.round(spec.width * 0.75);
    const ptHeight = Math.round(spec.height * 0.75);

    // Image XObject
    recordOffset(imgObjIdx);
    writeText(
      `${imgObjIdx} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${spec.width} /Height ${spec.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${spec.bytes.length} >>\nstream\n`
    );
    writeBytes(spec.bytes);
    writeText('\nendstream\nendobj\n');

    // Build Content Stream: (1) Paint image background (2) Invisible OCR text layer
    let contentStream = `q\n${ptWidth} 0 0 ${ptHeight} 0 0 cm\n/Im0 Do\nQ\n`;

    // If OCR words exist, write them with rendering mode 3 (Neither fill nor stroke = Invisible text)
    if (spec.words.length > 0) {
      contentStream += 'BT\n/F1 10 Tf\n3 Tr\n'; // Invisible text mode
      for (const w of spec.words) {
        const cleanText = w.text.replace(/[()\\]/g, '\\$&');
        const wx = Math.round(w.x * ptWidth);
        const wy = Math.round(ptHeight - w.y * ptHeight - 10);
        contentStream += `1 0 0 1 ${wx} ${wy} Tm (${cleanText}) Tj\n`;
      }
      contentStream += 'ET\n';
    }

    const streamLen = new TextEncoder().encode(contentStream).length;

    recordOffset(contentObjIdx);
    writeText(`${contentObjIdx} 0 obj\n<< /Length ${streamLen} >>\nstream\n${contentStream}endstream\nendobj\n`);

    // Page Object
    recordOffset(pageObjIdx);
    writeText(
      `${pageObjIdx} 0 obj\n<< /Type /Page /Parent ${pagesContainerIndex} 0 R /MediaBox [ 0 0 ${ptWidth} ${ptHeight} ] /Contents ${contentObjIdx} 0 R /Resources << /XObject << /Im0 ${imgObjIdx} 0 R >> /Font << /F1 ${fontObjIndex} 0 R >> >> >>\nendobj\n`
    );
  }

  // Cross-reference table
  const xrefStart = byteOffset;
  const totalObjs = objCounter;
  writeText(`xref\n0 ${totalObjs}\n`);
  writeText('0000000000 65535 f \n');

  for (let i = 1; i < totalObjs; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    writeText(`${off} 00000 n \n`);
  }

  writeText(
    `trailer\n<< /Size ${totalObjs} /Root ${catalogIndex} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  return new Blob(finalChunks as BlobPart[], { type: 'application/pdf' });
}
