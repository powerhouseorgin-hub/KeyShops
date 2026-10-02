import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../apiConfig';
import { sendPdfToWhatsApp } from './pdfDelivery';
import { toWhatsAppNumber } from './phone';

// Shared upload-then-share flow for the Customer Key Registration Report,
// used by every WhatsApp-share entry point that operates on an
// already-persisted customer (has a real customer.id). The pre-save
// Registration wizard's "share" button does NOT use this - there is no
// customer.id yet to attach a CustomerReport to at that point, so it keeps
// its own simpler local-only share behavior instead.
//
// Android app: opens WhatsApp in the customer's own chat with the report PDF
// itself attached, ready to send in one tap (see sendPdfToWhatsApp). Falls
// back to the OS share sheet (PDF still attached) if WhatsApp is missing.
//
// Website: browsers can't attach a file to a WhatsApp chat, so this uploads
// the PDF via api.uploadCustomerReport for a stable, secure public download
// link (see backend PublicReportController) and opens WhatsApp with a message
// containing that link. (WhatsApp also drops caption text whenever a document
// is attached, so on the app the file name is what identifies the document.)
export async function shareCustomerReportViaWhatsApp({ api, pdf, customer }) {
  const customerName = (customer?.name || 'Customer').trim();
  const safeNamePart = customerName.replace(/[^a-zA-Z0-9]+/g, '_') || 'Customer';
  // Short, opaque report id for the human-readable filename only - the real
  // security token is the full CustomerReport.id used in the download URL.
  const reportIdShort = (customer?.id || '').replace(/-/g, '').slice(-8).toUpperCase() || Date.now().toString(36).toUpperCase();
  const fileName = `Customer_Key_Registration_${safeNamePart}_${reportIdShort}.pdf`;

  if (Capacitor.isNativePlatform()) {
    await sendPdfToWhatsApp(pdf, fileName, {
      phone: customer?.phone,
      title: 'Customer Key Registration Report',
      text: `Hi ${customerName}, please find your Customer Key Registration Report attached. Thank you for choosing Key Shops.`,
    });
    return;
  }

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

  const waNumber = toWhatsAppNumber(customer?.phone);
  const waUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

  window.open(waUrl, '_blank');
}

// Sends a customer's service invoice (the same PDF the registration wizard builds, see
// customerInvoicePdf.js) to their WhatsApp from Customer History. The invoice is rebuilt from the saved
// customer record, so this works for any customer, including ones registered before invoices existed.
//
// Android app: opens WhatsApp in the customer's own chat with the PDF attached (one tap on Send).
// Website: browsers can't attach files, so the PDF is uploaded for a private download link and WhatsApp
// opens with a message containing it. Unlike the report share above, a message with NO link would be
// useless here, so a failed upload is surfaced instead of sending an empty message.
export async function shareCustomerInvoiceViaWhatsApp({ api, pdf, fileName, customer, shopName }) {
  const customerName = (customer?.name || 'Customer').trim();
  const greeting = `Hi ${customerName}, thank you for visiting ${shopName || 'our shop'}.`;

  if (Capacitor.isNativePlatform()) {
    await sendPdfToWhatsApp(pdf, fileName, {
      phone: customer?.phone,
      title: 'Service Invoice',
      text: `${greeting} Your service invoice is attached.`,
    });
    return;
  }

  let downloadUrl = '';
  try {
    const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
    const { id } = await api.uploadCustomerReport(customer.id, file, fileName);
    downloadUrl = `${API_BASE}/api/public/reports/${id}/download`;
  } catch (err) {
    console.error('Failed to upload the invoice for a shareable link:', err);
    throw new Error('Could not create a download link for the invoice.');
  }

  const msg = `${greeting} Your service invoice is ready.\n\n📄 Download Invoice: ${downloadUrl}`;
  const waNumber = toWhatsAppNumber(customer?.phone);
  const waUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}
