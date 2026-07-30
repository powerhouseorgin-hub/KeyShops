import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { isAutomobileCategory } from './vehicleCategory';

// Matches the app's own theme (see frontend/src/styles/index.css --maroon /
// --maroon-dark / --gold) so the report reads as part of the same product,
// not a separate design.
const MAROON = '#7A1220';
const MAROON_DARK = '#5A0D18';
const GOLD = '#C89416';
const GOLD_BRIGHT = '#F5B800';
const CREAM = '#FFF8EC';
const BORDER = '#E7D8B8';

const NOT_AVAILABLE = 'Not Available';

// Every displayed value goes through this - missing/blank data reads as
// "Not Available" instead of a blank cell or a stray "N/A".
function naVal(value) {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  const str = String(value).trim();
  return str && str !== 'N/A' ? str : NOT_AVAILABLE;
}

function boolLabel(value) {
  return value ? 'Yes' : 'No';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(value) {
  if (!value) return NOT_AVAILABLE;
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function infoRow(icon, label, value) {
  return `
    <tr>
      <td style="width:34px; padding:10px 8px; border-bottom:1px solid ${BORDER}; vertical-align:top;">${icon}</td>
      <td style="width:170px; padding:10px 8px; border-bottom:1px solid ${BORDER}; font-weight:700; color:${MAROON_DARK}; font-size:12.5px; vertical-align:top;">${esc(label)}</td>
      <td style="padding:10px 12px; border-bottom:1px solid ${BORDER}; font-size:12.5px; color:#2a2a2a; vertical-align:top; word-break:break-word;">${esc(naVal(value))}</td>
    </tr>`;
}

function sectionHeader(icon, title) {
  return `
    <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:10px 14px; border-radius:8px 8px 0 0;">
      <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; background:${GOLD}; border-radius:5px; font-size:12px; flex-shrink:0;">${icon}</span>
      <span style="font-weight:800; font-size:13.5px; letter-spacing:.02em;">${esc(title)}</span>
    </div>`;
}

// Builds a single branded, compact PDF report - a consolidated info table
// (customer/vehicle-or-home-office/key/shop details, whichever apply to this
// customer's category) plus a thin declaration/footer strip. Always exactly
// one A4 page: the rendered report is scaled down to fit the page if needed
// (see the ratio math below) instead of paginating, so it can never spill
// onto a second page regardless of how tall the content renders on a given
// device. Renders an HTML template through html2canvas + jsPDF (rather than
// jsPDF's own primitive draw calls) so the layout can closely follow the Key
// Shops report design. Used by both:
//  - Customer History's Download/WhatsApp actions, where `customer` is an
//    already-saved row;
//  - the Registration wizard's Download/Share actions, where `customer` is a
//    customer-like object built from in-progress wizard state (see
//    buildDraftReportPdf in App.jsx).
export async function buildCustomerReportPdf({ customer, shop, registeredByName }) {
  const idSource = customer.id || `DRAFT${Date.now()}`;
  const reportId = `RPT-KEY-${idSource.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const gpsCaptured = !!(customer.latitude && customer.longitude);
  const isAutomobile = isAutomobileCategory(customer.vehicleCategory);

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:${CREAM}; color:#2a2a2a;">
    <div style="display:flex; align-items:center; justify-content:space-between; background:linear-gradient(90deg, ${MAROON_DARK}, ${MAROON}); padding:22px 24px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${keyShopLogo}" style="width:52px; height:52px; object-fit:contain; background:#fff; border-radius:50%; padding:4px; flex-shrink:0;" />
        <div>
          <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:22px; letter-spacing:.03em;">CUSTOMER KEY</div>
          <div style="color:#fff; font-weight:900; font-size:16px; letter-spacing:.05em;">REGISTRATION REPORT</div>
          <div style="color:#f0d9b5; font-size:9.5px; letter-spacing:.15em; margin-top:2px;">SECURE REGISTRATION &middot; TRUSTED SERVICE</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:${GOLD_BRIGHT}; font-size:9px; font-weight:800; letter-spacing:.1em;">REPORT ID</div>
        <div style="background:#fff; color:${MAROON_DARK}; font-weight:800; font-size:12px; padding:4px 10px; border-radius:6px; margin:4px 0 8px; white-space:nowrap;">${esc(reportId)}</div>
        <div style="color:#f0d9b5; font-size:9px;">Registration Date</div>
        <div style="color:#fff; font-size:11.5px; font-weight:700; white-space:nowrap;">${formatDateTime(customer.createdAt)}</div>
      </div>
    </div>

    <div style="padding:20px 24px 4px;">
      ${sectionHeader('&#128100;', 'Registration Details')}
      <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid ${BORDER}; border-top:none; table-layout:fixed;">
        ${infoRow('&#128100;', 'Customer Name', customer.name)}
        ${infoRow('&#128241;', 'Mobile Number', customer.phone)}
        ${infoRow('&#128205;', 'Address', customer.capturedAddress || customer.address)}
        ${isAutomobile
          ? `${infoRow('&#128663;', 'Vehicle Number', customer.vehicleNumber)}${infoRow('&#128663;', 'Vehicle Name', customer.vehicleName)}`
          : infoRow('&#127968;', 'Home / Office Name', customer.homeOfficeName)}
        ${infoRow('&#128273;', isAutomobile ? 'Key Code' : 'Home / Office Key Code', customer.keyNumber)}
        ${infoRow('&#9989;', 'Add Key', boolLabel(customer.addKey))}
        ${infoRow('&#10060;', 'Lost Key', boolLabel(customer.lostKey))}
        ${infoRow('&#128176;', 'Bill Amount', customer.billAmount)}
        ${infoRow('&#127978;', 'Shop Name', shop?.name)}
        ${infoRow('&#128225;', 'GPS Coordinates', gpsCaptured ? `${customer.latitude}, ${customer.longitude}` : null)}
      </table>
    </div>

    <div style="padding:14px 24px 4px;">
      <div style="background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 16px;">
        <p style="font-size:10.5px; color:#4a4a4a; line-height:1.4; margin:0;">I hereby confirm that the above information is true and was submitted during customer key registration.</p>
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; background:${MAROON_DARK}; color:#fff; padding:14px 24px; margin-top:16px; font-size:10.5px; gap:16px;">
      <div>Generated On<br/><b>${formatDateTime(new Date())}</b></div>
      <div>Generated By<br/><b>${esc(naVal(registeredByName))}</b></div>
      <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:13px; text-align:right;">THANK YOU FOR CHOOSING KEY SHOPS</div>
    </div>
  </div>`;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container.firstElementChild, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Always exactly one page: scale the whole report to fit within the A4
    // page (by whichever dimension is the binding constraint) rather than
    // pagination logic that could spill a second page depending on how tall
    // the content happens to render on a given device.
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imgWidth = canvas.width * ratio;
    const imgHeight = canvas.height * ratio;
    const x = (pageWidth - imgWidth) / 2;

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, 0, imgWidth, imgHeight);

    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}
