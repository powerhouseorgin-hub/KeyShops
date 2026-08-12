import { Capacitor, registerPlugin } from '@capacitor/core';
import { SaveToDownloads } from '../apiConfig';

// Native bridge to ShareToWhatsAppPlugin.java - see shareToWhatsApp() below
// for why this exists instead of the generic Capacitor Share plugin.
const ShareToWhatsApp = registerPlugin('ShareToWhatsApp');

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

// Shares a PDF + caption straight to WhatsApp on native, guaranteeing both
// arrive in the same message (see ShareToWhatsAppPlugin.java for why the
// generic sharePdf()/Share.share() above can silently drop the caption -
// its universal OS chooser has a "direct share" contact-avatar row that
// bypasses WhatsApp's own caption screen entirely). Falls back to the
// generic native share sheet if WhatsApp isn't installed or the plugin
// isn't available (e.g. an older installed build before this was added),
// so the user can still pick a share target manually instead of hitting a
// dead end.
export async function shareToWhatsApp(pdf, filename, text) {
  if (!Capacitor.isNativePlatform()) {
    return sharePdf(pdf, filename, { title: 'Customer Key Registration Report', text, fallbackText: text });
  }

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
    await ShareToWhatsApp.share({ filePath: uri, text, mimeType: 'application/pdf' });
  } catch (err) {
    console.warn('Direct WhatsApp share failed, falling back to the OS share sheet:', err);
    const { Share } = await import('@capacitor/share');
    await Share.share({ files: [uri], text, title: 'Customer Key Registration Report' });
  }
}
