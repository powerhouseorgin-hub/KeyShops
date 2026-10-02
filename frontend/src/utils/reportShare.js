import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../apiConfig';
import { sendPdfToWhatsApp } from './pdfDelivery';
import { toWhatsAppNumber } from './phone';

// WhatsApp sharing of a customer's service invoice (the registration report that used to live here was
// replaced by the invoice everywhere - see customerInvoicePdf.js).
//
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
