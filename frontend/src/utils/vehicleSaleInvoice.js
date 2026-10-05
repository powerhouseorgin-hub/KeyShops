import { normalizePhone } from './phone';

// Helpers shared by every screen that makes a vehicle-sale receipt (Vehicle Sales, All Sales, bulk download, send on WhatsApp).
const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function invoiceFileName(sale) {
  return `DeliveryReceipt_${safe(sale.registrationNumber) || 'Vehicle'}_${safe(sale.saleNumber) || sale.id}.pdf`;
}

// Builds the receipt PDF in the language the sale was made in (Tamil when none was stored). `shop` = { name, address, phone }.
export async function buildSaleInvoice({ sale, shop, registeredByName, localUrls }) {
  const { buildVehicleSaleInvoicePdf } = await import('./vehicleSaleInvoicePdf');
  const pdf = await buildVehicleSaleInvoicePdf({ sale, shop, lang: sale.lang || 'ta', registeredByName, localUrls });
  return { pdf, fileName: invoiceFileName(sale) };
}

// A shop row (as the Super Admin's shop list returns it) -> the header details of a receipt.
export function shopInfoFromRow(row) {
  let address = 'N/A';
  let phone = 'N/A';
  if (row) {
    try {
      const details = row.companyDetails ? JSON.parse(row.companyDetails) : {};
      address = details.address || row.address || 'N/A';
      phone = details.phone || row.phone || 'N/A';
    } catch (e) {
      address = row.address || 'N/A';
      phone = row.phone || 'N/A';
    }
  }
  return { name: (row && row.name) || '', address, phone };
}

// Which of the seller / buyer have a mobile number WhatsApp can be sent to.
export function sendableParties(sale) {
  return {
    seller: !!normalizePhone(String(sale?.sellerPhone || '')),
    buyer: !!normalizePhone(String(sale?.buyerPhone || '')),
  };
}

export const phoneProblem = (raw) => (!String(raw || '').trim() ? 'NO_PHONE' : normalizePhone(String(raw)) ? null : 'INVALID_PHONE');
