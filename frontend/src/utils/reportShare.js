import { API_BASE } from '../apiConfig';

// Shared upload-then-share flow for the Customer Key Registration Report,
// used by every WhatsApp-share entry point that operates on an
// already-persisted customer (has a real customer.id). The pre-save
// Registration wizard's "share" button does NOT use this - there is no
// customer.id yet to attach a CustomerReport to at that point, so it keeps
// its own simpler local-only share behavior instead.
//
// Uploads the PDF via api.uploadCustomerReport so it gets a stable, secure
// public download link (see backend PublicReportController), then opens
// WhatsApp with a single message containing that link, pre-filled and ready
// to send in one tap.
//
// This intentionally does NOT also attach the raw PDF as a second share
// step. WhatsApp's Android/iOS apps silently drop any caption text
// (EXTRA_TEXT) whenever the shared attachment is a document (non-image/
// video) mimetype - a confirmed platform limitation, not something fixable
// via Intent flags or which share-sheet screen is used - so combining both
// into one WhatsApp send isn't possible, and a separate "attach the file"
// step after the message requires picking the contact a second time (not a
// single tap, and a worse experience than just tapping the link). Since the
// download link itself serves the exact same PDF (see
// PublicReportController - it auto-downloads with the correct filename),
// the link alone fully delivers the document without a second step.
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
    // The message still gets sent without a working link rather than
    // blocking entirely - an upload failure (offline, etc.) shouldn't stop
    // the user from reaching out to the customer at all.
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

  window.open(waUrl, '_blank');
}
