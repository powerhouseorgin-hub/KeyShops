import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { isAutomobileCategory } from './vehicleCategory';

// English service invoice, styled after a formal delivery-receipt template
// (title block, dated header, two-party declaration paragraphs, signature
// lines) rather than the more casual card layout customerReportPdf.js uses
// for the Shop Admin's own verification record. This is the document meant
// for the CUSTOMER - see invoiceShare.js for the auto-send-after-registration
// flow and the public download link.
const MAROON = '#7A1220';
const MAROON_DARK = '#5A0D18';
const GOLD_BRIGHT = '#F5B800';
const BORDER = '#D9C7A0';
const NOT_AVAILABLE = 'N/A';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function naVal(value) {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  const str = String(value).trim();
  return str ? str : NOT_AVAILABLE;
}

function formatDate(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return NOT_AVAILABLE;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatTime(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return NOT_AVAILABLE;
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(d.getMinutes())} ${ampm}`;
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:6px 10px 6px 0; font-size:10.5px; font-weight:700; color:${MAROON_DARK}; white-space:nowrap; vertical-align:top;">${esc(label)}</td>
      <td style="padding:6px 0; font-size:10.5px; color:#2a2a2a; vertical-align:top; word-break:break-word;">: ${esc(naVal(value))}</td>
    </tr>`;
}

// Builds the customer-facing English service invoice, matching the supplied
// delivery-receipt reference: a titled header with date/time, service-
// provider and customer detail blocks, a charges table, a declaration
// paragraph from each party, and signature lines.
export async function buildCustomerInvoicePdf({ customer, shop, registeredByName }) {
  const now = new Date();
  const isAutomobile = isAutomobileCategory(customer.vehicleCategory);
  const categoryLabel = {
    TWO_WHEELER: 'Two Wheeler', FOUR_WHEELER: 'Four Wheeler', TRUCK_LORRY: 'Truck / Lorry',
    HOME: 'Home', OFFICE: 'Office',
  }[customer.vehicleCategory] || (customer.vehicleCategory || NOT_AVAILABLE);

  const shopName = shop?.name || 'Key Shops';
  const shopAddress = shop?.address || NOT_AVAILABLE;
  const shopPhone = shop?.phone || NOT_AVAILABLE;

  const invoiceNo = customer.billNumber || `INV-${(customer.id || Date.now().toString(36)).toString().replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;
  const hasAmount = customer.billAmount !== null && customer.billAmount !== undefined && customer.billAmount !== '';
  const amountFormatted = hasAmount ? `Rs. ${Number(customer.billAmount).toFixed(2)}` : NOT_AVAILABLE;

  const serviceRows = isAutomobile
    ? [
      ['Vehicle Category', categoryLabel],
      ['Vehicle Number', customer.vehicleNumber],
      ['Vehicle / Key Name', customer.vehicleName],
      ['Key Blank Code', customer.keyNumber],
    ]
    : [
      ['Key Category', categoryLabel],
      ['Property Description', customer.homeOfficeName],
      ['Key Blank Code', customer.keyNumber],
    ];

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:#ffffff; color:#2a2a2a; box-sizing:border-box; padding:32px 40px;">

    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid ${MAROON}; padding-bottom:14px; margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${keyShopLogo}" style="width:46px; height:46px; object-fit:contain;" />
        <div>
          <div style="font-weight:900; font-size:18px; color:${MAROON};">${esc(shopName)}</div>
          <div style="font-size:9.5px; color:#666; margin-top:2px;">${esc(shopAddress)}${shopPhone !== NOT_AVAILABLE ? ` &nbsp;|&nbsp; Ph: ${esc(shopPhone)}` : ''}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:900; font-size:16px; letter-spacing:.04em; color:${MAROON_DARK};">SERVICE INVOICE</div>
        <div style="font-size:9.5px; color:#666; margin-top:4px;">Date: <b>${formatDate(customer.createdAt || now)}</b> &nbsp; Time: <b>${formatTime(customer.createdAt || now)}</b></div>
        <div style="font-size:9.5px; color:#666; margin-top:2px;">Invoice No: <b>${esc(invoiceNo)}</b></div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:18px;">
      <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px;">
        <div style="font-size:10px; font-weight:800; color:${MAROON}; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">Service Provider</div>
        <table style="border-collapse:collapse;">
          ${detailRow('Name', shopName)}
          ${detailRow('Address', shopAddress)}
          ${detailRow('Phone', shopPhone)}
        </table>
      </div>
      <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px;">
        <div style="font-size:10px; font-weight:800; color:${MAROON}; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">Customer Details</div>
        <table style="border-collapse:collapse;">
          ${detailRow('Name', customer.name)}
          ${detailRow('Phone', customer.phone)}
          ${detailRow('Address', customer.address || customer.capturedAddress)}
        </table>
      </div>
    </div>

    <div style="border:1px solid ${BORDER}; border-radius:6px; overflow:hidden; margin-bottom:18px;">
      <div style="background:${MAROON}; color:#fff; padding:8px 14px; font-size:11px; font-weight:800;">Service &amp; Charge Details</div>
      <table style="width:100%; border-collapse:collapse;">
        ${serviceRows.map(([label, value], idx) => `
          <tr>
            <td style="padding:8px 14px; font-size:10.5px; font-weight:700; color:${MAROON_DARK}; border-bottom:${idx === serviceRows.length - 1 ? 'none' : `1px solid ${BORDER}`}; width:180px;">${esc(label)}</td>
            <td style="padding:8px 14px; font-size:10.5px; border-bottom:${idx === serviceRows.length - 1 ? 'none' : `1px solid ${BORDER}`};">${esc(naVal(value))}</td>
          </tr>`).join('')}
        <tr>
          <td style="padding:10px 14px; font-size:11.5px; font-weight:900; color:${MAROON_DARK}; background:#FAF6ED; border-top:1.5px solid ${BORDER};">Amount Charged</td>
          <td style="padding:10px 14px; font-size:13px; font-weight:900; color:${MAROON}; background:#FAF6ED; border-top:1.5px solid ${BORDER};">${esc(amountFormatted)}</td>
        </tr>
      </table>
    </div>

    <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px; margin-bottom:14px; background:#FCFAF4;">
      <div style="font-size:10px; font-weight:800; color:${MAROON}; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">Declaration by Service Provider</div>
      <p style="font-size:9.5px; color:#4a4a4a; line-height:1.55; margin:0;">
        I/We, the undersigned, confirm that the duplicate key / compliance registration service described above has been duly rendered
        to the customer named above, that the customer's identity and contact details were verified at the time of registration, and
        that the details recorded in this invoice are true and accurate to the best of our knowledge.
      </p>
    </div>

    <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px; margin-bottom:26px; background:#FCFAF4;">
      <div style="font-size:10px; font-weight:800; color:${MAROON}; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">Acknowledgement by Customer</div>
      <p style="font-size:9.5px; color:#4a4a4a; line-height:1.55; margin:0;">
        I, ${esc(customer.name || 'the customer')}, acknowledge that the service and/or key described above has been received by me,
        and that the details recorded in this invoice - including my personal and vehicle/key details - are correct as provided by me
        at the time of registration.
      </p>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:8px;">
      <div>
        <div style="border-top:1px solid #888; padding-top:6px; font-size:9.5px; color:#555;">Authorized Signatory<br/><b>${esc(shopName)}</b></div>
      </div>
      <div>
        <div style="border-top:1px solid #888; padding-top:6px; font-size:9.5px; color:#555;">Customer Signature<br/><b>${esc(customer.name || NOT_AVAILABLE)}</b></div>
      </div>
    </div>

    <div style="text-align:center; margin-top:18px; padding-top:12px; border-top:1px dashed ${BORDER};">
      <div style="color:${MAROON}; font-weight:900; font-size:11px;">THANK YOU FOR CHOOSING ${esc(shopName.toUpperCase())}</div>
      <div style="font-size:8.5px; color:#999; margin-top:4px;">This is a system-generated invoice. Generated by ${esc(registeredByName || 'Shop Admin')} on ${formatDate(now)} ${formatTime(now)}.</div>
    </div>
  </div>`;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    const canvas = await html2canvas(container.firstElementChild, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}
