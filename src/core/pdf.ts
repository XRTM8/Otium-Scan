/**
 * Lightweight, zero-dependency PDF 1.4 compiler.
 * Directly compiles multiple canvas elements into a single compressed PDF binary.
 */
export async function createPdfFromCanvases(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const objects: string[] = [];
  const offsets: number[] = [];

  // Convert all canvases to JPEG byte arrays & dimensions
  const imageSpecs = await Promise.all(
    canvases.map(async (canvas) => {
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
      };
    })
  );

  // Object 1: Catalog
  // Object 2: Pages container
  const pageObjIndices: number[] = [];
  const imageObjIndices: number[] = [];

  // Allocate indices
  const catalogIndex = 1;
  const pagesContainerIndex = 2;

  let currentIndex = 3;
  for (let i = 0; i < imageSpecs.length; i++) {
    imageObjIndices.push(currentIndex++); // Image XObject
    pageObjIndices.push(currentIndex++); // Page Object
    currentIndex++; // Content stream
  }

  // Build Objects
  // 1: Catalog
  objects.push(`<< /Type /Catalog /Pages ${pagesContainerIndex} 0 R >>`);

  // 2: Pages root
  const pageRefs = pageObjIndices.map((idx) => `${idx} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pageObjIndices.length} >>`);

  // We will build final PDF as array of chunks
  let header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let byteOffset = header.length;

  // Track each indirect object's byte offset
  // We need to write objects in order: 1, 2, 3...
  // Let's create object streams
  const finalChunks: (Uint8Array | string)[] = [header];

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

  // Write Obj 1: Catalog
  recordOffset(catalogIndex);
  writeText(`${catalogIndex} 0 obj\n<< /Type /Catalog /Pages ${pagesContainerIndex} 0 R >>\nendobj\n`);

  // Write Obj 2: Pages
  recordOffset(pagesContainerIndex);
  writeText(`${pagesContainerIndex} 0 obj\n<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pageObjIndices.length} >>\nendobj\n`);

  // Write individual pages
  let objCounter = 3;
  for (let i = 0; i < imageSpecs.length; i++) {
    const spec = imageSpecs[i];
    const imgObjIdx = objCounter++;
    const pageObjIdx = objCounter++;
    const contentObjIdx = objCounter++;

    // Standard A4 aspect or native image dimensions (points: 72 dpi)
    // Scale image dimensions down so 1px ~= 0.75 pt
    const ptWidth = Math.round(spec.width * 0.75);
    const ptHeight = Math.round(spec.height * 0.75);

    // Image XObject
    recordOffset(imgObjIdx);
    writeText(
      `${imgObjIdx} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${spec.width} /Height ${spec.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${spec.bytes.length} >>\nstream\n`
    );
    writeBytes(spec.bytes);
    writeText('\nendstream\nendobj\n');

    // Content Stream: paint image to fill page
    const streamContent = `q\n${ptWidth} 0 0 ${ptHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    const streamLen = streamContent.length;

    recordOffset(contentObjIdx);
    writeText(`${contentObjIdx} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}endstream\nendobj\n`);

    // Page Object
    recordOffset(pageObjIdx);
    writeText(
      `${pageObjIdx} 0 obj\n<< /Type /Page /Parent ${pagesContainerIndex} 0 R /MediaBox [ 0 0 ${ptWidth} ${ptHeight} ] /Contents ${contentObjIdx} 0 R /Resources << /XObject << /Im0 ${imgObjIdx} 0 R >> >> >>\nendobj\n`
    );
  }

  // Cross-reference table (xref)
  const xrefStart = byteOffset;
  const totalObjs = objCounter;
  writeText(`xref\n0 ${totalObjs}\n`);
  writeText('0000000000 65535 f \n');

  for (let i = 1; i < totalObjs; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    writeText(`${off} 00000 n \n`);
  }

  // Trailer
  writeText(
    `trailer\n<< /Size ${totalObjs} /Root ${catalogIndex} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  return new Blob(finalChunks as BlobPart[], { type: 'application/pdf' });
}
