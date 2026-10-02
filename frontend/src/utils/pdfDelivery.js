import { Capacitor, registerPlugin } from '@capacitor/core';
import { SaveToDownloads } from '../apiConfig';
import { toWhatsAppNumber } from './phone';

// Native bridge to WhatsAppSharePlugin.java - opens WhatsApp in the given
// contact's chat with a file already attached.
const WhatsAppShare = registerPlugin('WhatsAppShare');

// Shared save/share plumbing for every generated (jsPDF) report in the app -
// used by both the Registration wizard's Review step and the Customer
// History report. Reuses the exact same native flow apiConfig.js's
// downloadAsset() uses for remote files (write to cache -> SaveToDownloads
// plugin -> share-sheet fallback) since it's the already-proven way to get a
// file out of this app's sandbox into a place the user can find it.
export async function downloadPdf(pdf, filename) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('document_downloaded'));
    }
  } catch (e) {}
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base64 = pdf.output('datauristring').split(',')[1];
    let uri;
    try {
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      ({ uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache }));
    } catch (err) {
      throw new Error(`Could not save the PDF to this device: ${err.message || err}`);
    }
    try {
      await SaveToDownloads.saveFile({ sourcePath: uri, fileName: filename, mimeType: 'application/pdf' });
    } catch (err) {
      console.warn('Direct save to Downloads failed, falling back to share sheet:', err);
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({ files: [uri], dialogTitle: `Save ${filename}` });
      } catch (shareErr) {
        console.warn('Share sheet dismissed or result unreported (file was already downloaded):', shareErr);
      }
    }
  } else {
    pdf.save(filename);
  }
}

// `text` (when given) is passed straight to the OS share sheet alongside the
// file, so apps that support it (WhatsApp included) receive both the PDF and
// the message in one share action instead of just the file. `fallbackText`
// is shown when the platform can't attach a file to a share at all
// (older/desktop browsers) - mirrors this app's other navigator.share
// fallbacks rather than failing silently.
export async function sharePdf(pdf, filename, { title, text, fallbackText } = {}) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base64 = pdf.output('datauristring').split(',')[1];
    let uri;
    try {
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      ({ uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache }));
    } catch (err) {
      throw new Error(`Could not prepare the PDF for sharing: ${err.message || err}`);
    }
    const { Share } = await import('@capacitor/share');
    await Share.share({ files: [uri], text, title, dialogTitle: title });
    return;
  }

  const blob = pdf.output('blob');
  const pdfFile = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    await navigator.share({ files: [pdfFile], text, title });
  } else if (navigator.share) {
    await navigator.share({ title, text: text || fallbackText });
  } else {
    pdf.save(filename);
  }
}

// Android app only. Hands the PDF itself (not a link) to WhatsApp, opened
// directly in the customer's chat with the document attached - the shop admin
// just taps Send. WhatsApp ignores the text/caption whenever a document is
// attached, so the file name is what identifies the document to the customer
// (callers should keep it descriptive).
//
// Falls back to the generic OS share sheet (still attaching the PDF) when
// WhatsApp isn't installed or the direct hand-off fails, so the document is
// never silently dropped. Resolves 'chat' when WhatsApp was opened on the
// customer's chat, 'sheet' when the share sheet was used instead.
export async function sendPdfToWhatsApp(pdf, filename, { phone, text, title } = {}) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const base64 = pdf.output('datauristring').split(',')[1];
  let uri;
  try {
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    ({ uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache }));
  } catch (err) {
    throw new Error(`Could not prepare the PDF for sharing: ${err.message || err}`);
  }

  try {
    await WhatsAppShare.sendDocument({
      path: uri,
      phone: phone ? toWhatsAppNumber(phone) : '',
      mimeType: 'application/pdf',
      text,
    });
    return 'chat';
  } catch (err) {
    if (err && err.code !== 'NOT_INSTALLED') {
      console.warn('Direct WhatsApp hand-off failed, using the share sheet instead:', err);
    }
  }

  const { Share } = await import('@capacitor/share');
  await Share.share({ files: [uri], text, title, dialogTitle: title });
  return 'sheet';
}
