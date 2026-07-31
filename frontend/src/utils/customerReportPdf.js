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
      <td style="width:28px; padding:8px 6px; border-bottom:1px solid ${BORDER}; vertical-align:top; text-align:center;">${icon}</td>
      <td style="width:160px; padding:8px 6px; border-bottom:1px solid ${BORDER}; font-weight:700; color:${MAROON_DARK}; font-size:11.5px; vertical-align:top;">${esc(label)}</td>
      <td style="padding:8px 10px; border-bottom:1px solid ${BORDER}; font-size:11.5px; color:#2a2a2a; vertical-align:top; word-break:break-word;">${esc(naVal(value))}</td>
    </tr>`;
}

// Builds a single branded, compact PDF report - structured into 3 separate bordered
// information boxes: Customer Information, Shop Information, and Bill Amount.
// Always exactly one A4 page: the rendered report is scaled down to fit the page.
export async function buildCustomerReportPdf({ customer, shop, registeredByName }) {
  const idSource = customer.id || `DRAFT${Date.now()}`;
  const reportId = `RPT-KEY-${idSource.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const gpsCaptured = !!(customer.latitude && customer.longitude);
  const isAutomobile = isAutomobileCategory(customer.vehicleCategory);

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:${CREAM}; color:#2a2a2a; box-sizing:border-box;">
    <!-- Top Header Banner -->
    <div style="display:flex; align-items:center; justify-content:space-between; background:linear-gradient(90deg, ${MAROON_DARK}, ${MAROON}); padding:18px 24px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${keyShopLogo}" style="width:48px; height:48px; object-fit:contain; background:#fff; border-radius:50%; padding:3px; flex-shrink:0;" />
        <div>
          <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:20px; letter-spacing:.03em;">CUSTOMER KEY</div>
          <div style="color:#fff; font-weight:900; font-size:15px; letter-spacing:.05em;">REGISTRATION REPORT</div>
          <div style="color:#f0d9b5; font-size:9px; letter-spacing:.15em; margin-top:2px;">SECURE REGISTRATION &middot; TRUSTED SERVICE</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:${GOLD_BRIGHT}; font-size:8.5px; font-weight:800; letter-spacing:.1em;">REPORT ID</div>
        <div style="background:#fff; color:${MAROON_DARK}; font-weight:800; font-size:11.5px; padding:3px 8px; border-radius:5px; margin:3px 0 6px; white-space:nowrap; display:inline-block;">${esc(reportId)}</div>
        <div style="color:#f0d9b5; font-size:8.5px;">Registration Date</div>
        <div style="color:#fff; font-size:11px; font-weight:700; white-space:nowrap;">${formatDateTime(customer.createdAt)}</div>
      </div>
    </div>

    <div style="padding:16px 24px 4px;">
      <!-- BOX 1: Customer Information Box -->
      <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:8px 14px;">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; background:${GOLD}; border-radius:4px; font-size:11px; flex-shrink:0;">&#128100;</span>
          <span style="font-weight:800; font-size:13px; letter-spacing:.02em;">Customer Information</span>
        </div>
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
          ${infoRow('&#128100;', 'Customer Name', customer.name)}
          ${infoRow('&#128241;', 'Mobile Number', customer.phone)}
          ${infoRow('&#128205;', 'Address', customer.capturedAddress || customer.address)}
          ${isAutomobile
            ? `${infoRow('&#128663;', 'Vehicle Number', customer.vehicleNumber)}${infoRow('&#128663;', 'Vehicle Name', customer.vehicleName)}`
            : infoRow('&#127968;', 'Home / Office Name', customer.homeOfficeName)}
          ${infoRow('&#128273;', isAutomobile ? 'Key Code' : 'Home / Office Key Code', customer.keyNumber)}
          ${infoRow('&#9989;', 'Add Key', boolLabel(customer.addKey))}
          ${infoRow('&#10060;', 'Lost Key', boolLabel(customer.lostKey))}
          ${infoRow('&#128225;', 'GPS Coordinates', gpsCaptured ? `${customer.latitude}, ${customer.longitude}` : null)}
        </table>
      </div>

      <!-- Grid 2-column for Shop Info Box & Bill Amount Box -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px;">
        <!-- BOX 2: Shop Information Box -->
        <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; display:flex; flex-direction:column;">
          <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:8px 14px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; background:${GOLD}; border-radius:4px; font-size:11px; flex-shrink:0;">&#127978;</span>
            <span style="font-weight:800; font-size:13px; letter-spacing:.02em;">Shop Information</span>
          </div>
          <table style="width:100%; border-collapse:collapse; table-layout:fixed; flex:1;">
            ${infoRow('&#127978;', 'Shop Name', shop?.name)}
            ${infoRow('&#128205;', 'Shop Address', shop?.address)}
            ${infoRow('&#128241;', 'Shop Contact', shop?.phone)}
          </table>
        </div>

        <!-- BOX 3: Bill Amount Box -->
        <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; display:flex; flex-direction:column;">
          <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:8px 14px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; background:${GOLD}; border-radius:4px; font-size:11px; flex-shrink:0;">&#128176;</span>
            <span style="font-weight:800; font-size:13px; letter-spacing:.02em;">Bill Amount</span>
          </div>
          <div style="padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; text-align:center; background:#FAFAFA;">
            <div style="font-size:11px; color:#777; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">Total Bill Amount</div>
            <div style="font-size:24px; font-weight:900; color:${MAROON_DARK};">
              ${customer.billAmount !== null && customer.billAmount !== undefined && customer.billAmount !== '' ? `&#8377; ${Number(customer.billAmount).toFixed(2)}` : NOT_AVAILABLE}
            </div>
          </div>
        </div>
      </div>

      <!-- Confirmation Declaration Strip -->
      <div style="background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:10px 14px; margin-bottom:10px;">
        <p style="font-size:10px; color:#4a4a4a; line-height:1.35; margin:0;">I hereby confirm that the above information is true and was submitted during customer key registration.</p>
      </div>
    </div>

    <!-- Footer Strip -->
    <div style="display:flex; align-items:center; justify-content:space-between; background:${MAROON_DARK}; color:#fff; padding:12px 24px; font-size:10px; gap:16px;">
      <div>Generated On<br/><b>${formatDateTime(new Date())}</b></div>
      <div>Generated By<br/><b>${esc(naVal(registeredByName))}</b></div>
      <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:12px; text-align:right;">THANK YOU FOR CHOOSING KEY SHOPS</div>
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
