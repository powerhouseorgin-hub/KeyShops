import { jsPDF } from 'jspdf';
import { fileToDataUrl, rasterizePdfFirstPage } from './pdfImage';

// Builds a single PDF containing the typed registration details plus every
// staged ID document embedded as an image (labeled with its document type) -
// used by both the Review step's Download and Share actions. `uploadedDocs`
// entries are still local { type, file } File objects at this point (upload
// to the server only happens after final Submit), so everything needed is
// already in browser memory - no network fetch required.
export async function buildRegistrationPdf({
  name, phone, vehicleNumber, keyNumber, keyType, address,
  latitude, longitude, uploadedDocs = [],
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Customer Registration Summary', margin, y);
  y += 30;

  const fields = [
    ['Customer Name', name || 'N/A'],
    ['Phone', phone || 'N/A'],
    ['Vehicle Number', vehicleNumber || 'N/A'],
    ['Key Blank Code', keyType ? `${keyNumber} (${keyType})` : (keyNumber || 'N/A')],
    ['Address', address || 'N/A'],
    ['GPS Coordinates', (latitude && longitude) ? `${latitude}, ${longitude}` : 'Not captured'],
  ];

  doc.setFontSize(11);
  fields.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    const labelText = `${label}: `;
    doc.text(labelText, margin, y);
    const labelWidth = doc.getTextWidth(labelText);
    doc.setFont(undefined, 'normal');
    const wrapped = doc.splitTextToSize(String(value), pageWidth - margin * 2 - labelWidth);
    doc.text(wrapped, margin + labelWidth, y);
    y += 16 * Math.max(1, wrapped.length);
  });

  y += 12;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(`Uploaded Documents (${uploadedDocs.length})`, margin, y);
  if (uploadedDocs.length === 0) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text('None attached.', margin, y + 20);
  }

  for (const { type, file } of uploadedDocs) {
    doc.addPage();
    const headY = margin;
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text(`Document Type: ${type}`, margin, headY);

    let imgDataUrl = null;
    let imgFormat = 'JPEG';
    try {
      if (file.type === 'application/pdf') {
        imgDataUrl = await rasterizePdfFirstPage(file);
        imgFormat = 'PNG';
      } else {
        imgDataUrl = await fileToDataUrl(file);
        imgFormat = file.type === 'image/png' ? 'PNG' : 'JPEG';
      }
    } catch (err) {
      // Degrade to a text-only page rather than breaking the whole export -
      // the original file is still attached to the customer record separately.
      console.error(`Failed to embed document "${type}" in registration PDF:`, err);
    }

    if (imgDataUrl) {
      const imgProps = doc.getImageProperties(imgDataUrl);
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - headY - margin - 20;
      let renderWidth = maxWidth;
      let renderHeight = (imgProps.height / imgProps.width) * renderWidth;
      if (renderHeight > maxHeight) {
        renderHeight = maxHeight;
        renderWidth = (imgProps.width / imgProps.height) * renderHeight;
      }
      doc.addImage(imgDataUrl, imgFormat, margin, headY + 20, renderWidth, renderHeight);
    } else {
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text('(Could not render a preview for this document - see the original file.)', margin, headY + 24);
    }
  }

  return doc;
}
