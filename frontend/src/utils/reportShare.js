import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../apiConfig';
import { shareToWhatsApp, downloadPdf } from './pdfDelivery';

// Shared upload-then-share flow for the Customer Key Registration Report,
// used by every WhatsApp-share entry point that operates on an
// already-persisted customer (has a real customer.id). The pre-save
// Registration wizard's "share" button does NOT use this - there is no
// customer.id yet to attach a CustomerReport to at that point, so it keeps
// its own simpler local-only share behavior instead.
//
// Uploads the PDF via api.uploadCustomerReport so it gets a stable, secure
// public download link (see backend PublicReportController), then shares
// both the file and a message containing that link via WhatsApp (or the OS
// share sheet on native, which forwards both the file and text to
// WhatsApp when picked).
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

  if (Capacitor.isNativePlatform()) {
    await shareToWhatsApp(pdf, fileName, msg);
    return;
  }

  // Web: try a combined file+text share first (supported on most mobile
  // browsers and routes straight into WhatsApp when picked from the share
  // sheet). Desktop browsers generally don't support sharing files this way,
  // so fall back to the previous behavior - open WhatsApp with the message
  // (including the download link) and separately save the file locally.
  const blob = pdf.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: msg, title: 'Customer Key Registration Report' });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // fall through to the WhatsApp deep-link fallback below
    }
  }

  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
  await downloadPdf(pdf, fileName);
}
