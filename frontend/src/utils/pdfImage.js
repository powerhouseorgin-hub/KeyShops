// Shared image-loading helpers for customerReportPdf.js, used both for
// already-saved customer records (remote fileUrl) and in-memory registration
// uploads (local File objects) - kept in one place so both stay in sync.

// Reads a local File (already in-memory, not yet uploaded to the server) as a
// data URL so it can be embedded directly into a generated PDF.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Fetches an already-uploaded document (a remote URL - Supabase signed URL or
// backend-relative path) and reads it back as a data URL, for reports built
// from saved customer records rather than in-memory uploads.
export async function urlToDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document (${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Uploaded ID documents may be a scanned PDF instead of a photo/image (allowed
// types are jpeg/png/pdf). Since these reports embed every document as an
// image, a PDF's first page is rasterized to a canvas via pdfjs-dist rather
// than being skipped. Accepts either a data URL string or a File/Blob.
export async function rasterizePdfFirstPage(source) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const data = typeof source === 'string'
    ? await (await fetch(source)).arrayBuffer()
    : await source.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  return canvas.toDataURL('image/png');
}
