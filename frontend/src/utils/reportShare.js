import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../apiConfig';
import { shareFileToWhatsApp, downloadPdf } from './pdfDelivery';

// Shared upload-then-share flow for the Customer Key Registration Report,
// used by every WhatsApp-share entry point that operates on an
// already-persisted customer (has a real customer.id). The pre-save
// Registration wizard's "share" button does NOT use this - there is no
// customer.id yet to attach a CustomerReport to at that point, so it keeps
// its own simpler local-only share behavior instead.
//
// Uploads the PDF via api.uploadCustomerReport so it gets a stable, secure
// public download link (see backend PublicReportController), then delivers
// both the message (with that link) and the PDF file to WhatsApp.
//
// This happens in two separate steps, not one combined share. WhatsApp's
// Android/iOS apps silently drop any caption text (EXTRA_TEXT) whenever the
// shared attachment is a document (non-image/video) mimetype - this is a
// confirmed platform limitation of WhatsApp itself, not something fixable
// via Intent flags or which share-sheet entry point is used (verified after
// a first attempt at combining file+text into one native share still
// arrived with no message, exactly like the plain OS share sheet had).
// Image/video attachments DO support a caption; PDFs don't. So instead:
//   1. Open WhatsApp with the message (incl. the download link) pre-filled
//      via the wa.me deep link - this is guaranteed to arrive, since it's
//      a real WhatsApp API for pre-filling a text message.
//   2. Hand off the PDF file on its own right after, so the user's next
//      tap attaches it to the same chat.
export async function shareCustomerReportViaWhatsApp({ api, pdf, customer }) {
  const customerName = (customer?.name || 'Customer').trim();
  const safeNamePart = customerName.replace(/[^a-zA-Z0-9]+/g, '_') || 'Customer';
  // Short, opaque report id for the human-readable filename only - the real
  // security token is the full CustomerReport.id used in the download URL.
  const reportIdShort = (customer?.id || '').replace(/-/g, '').slice(-8).toUpperCase() || Date.now().toString(36).toUpperCase();
  const fileName = `Customer_Key_Registration_${safeNamePart}_${reportIdShort}.pdf`;

  let downloadUrl = '';
  try {
    const blob = pdf.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const { id } = await api.uploadCustomerReport(customer.id, file, fileName);
    downloadUrl = `${API_BASE}/api/public/reports/${id}/download`;
  } catch (err) {
    // The share still proceeds without the link below rather than blocking
    // entirely - the PDF attachment/local download matters more than the
    // extra convenience link, and upload failures (offline, etc.) shouldn't
    // stop the user from sharing the document at all.
    console.error('Failed to upload customer report for a shareable link:', err);
  }

  const msg = [
    `Hi ${customerName},`,
    '',
    'Please find your Customer Key Registration Report below.',
    '',
    downloadUrl ? `📄 Download Document: ${downloadUrl}` : null,
    '',
    'Thank you for choosing Key Shops.',
  ].filter((line) => line !== null).join('\n');

  const cleanPhone = (customer?.phone || '').replace(/[^0-9]/g, '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

  // Step 1: message with the link, pre-filled and ready to send.
  window.open(waUrl, '_blank');

  // Step 2: hand off the file. A short delay avoids firing a second
  // app-switching intent on top of WhatsApp still opening from step 1.
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (Capacitor.isNativePlatform()) {
    await shareFileToWhatsApp(pdf, fileName);
  } else {
    await downloadPdf(pdf, fileName);
  }
}
