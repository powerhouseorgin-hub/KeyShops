import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { isAutomobileCategory } from './vehicleCategory';

// Theme constants matching the app design system
const MAROON = '#7A1220';
const MAROON_DARK = '#5A0D18';
const GOLD = '#C89416';
const GOLD_BRIGHT = '#F5B800';
const CREAM = '#FFF8EC';
const BORDER = '#E7D8B8';

const NOT_AVAILABLE = 'N/A';

// Every displayed value goes through this helper - missing or empty data returns "N/A"
function naVal(value) {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  const str = String(value).trim();
  return str && str !== 'Not Available' && str !== 'null' && str !== 'undefined' ? str : NOT_AVAILABLE;
}

function boolLabel(value) {
  if (value === true || value === 'true' || value === 1 || value === 'YES' || value === 'Yes') return 'Yes';
  if (value === false || value === 'false' || value === 0 || value === 'NO' || value === 'No') return 'No';
  return NOT_AVAILABLE;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(value) {
  if (!value) return NOT_AVAILABLE;
  const d = new Date(value);
  if (isNaN(d.getTime())) return NOT_AVAILABLE;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function infoRow(icon, label, value) {
  return `
    <tr>
      <td style="width:28px; padding:6px 5px; border-bottom:1px solid ${BORDER}; vertical-align:middle; text-align:center;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; font-size:11px; line-height:1; vertical-align:middle;">${icon}</span>
      </td>
      <td style="width:150px; padding:6px 5px; border-bottom:1px solid ${BORDER}; font-weight:700; color:${MAROON_DARK}; font-size:11px; vertical-align:middle; line-height:1.2;">${esc(label)}</td>
      <td style="padding:6px 8px; border-bottom:1px solid ${BORDER}; font-size:11px; color:#2a2a2a; vertical-align:middle; line-height:1.2; word-break:break-word;">${esc(naVal(value))}</td>
    </tr>`;
}

// Builds a single branded, comprehensive PDF report containing all customer registration details
export async function buildCustomerReportPdf({ customer, shop, registeredByName }) {
  const idSource = customer.id || `DRAFT${Date.now()}`;
  const reportId = `RPT-KEY-${idSource.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8).toUpperCase()}`;

  const gpsCaptured = !!(customer.latitude && customer.longitude);
  const isAutomobile = isAutomobileCategory(customer.vehicleCategory);

  const shopName = shop?.name || 'Key Shops';
  const ownerName = registeredByName || shop?.ownerName || 'Shop Admin';
  const shopAddress = shop?.address || NOT_AVAILABLE;
  const shopPhone = shop?.phone || NOT_AVAILABLE;

  const keyName = customer.vehicleName || customer.homeOfficeName || (isAutomobile ? 'Vehicle Key' : 'Home / Office Key');
  const keyCategory = customer.vehicleCategory || customer.lockCategory || customer.keyType || NOT_AVAILABLE;
  const keyCode = customer.keyNumber || customer.keyCode || NOT_AVAILABLE;
  const idType = customer.idType || customer.idProofType || NOT_AVAILABLE;
  const idNumber = customer.idNumber || customer.idProofNumber || NOT_AVAILABLE;

  const hasBillAmount = customer.billAmount !== null && customer.billAmount !== undefined && customer.billAmount !== '';
  const billId = customer.billNumber || customer.billId || (hasBillAmount ? `BILL-${idSource.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8).toUpperCase()}` : NOT_AVAILABLE);
  const billAmountFormatted = hasBillAmount ? `₹ ${Number(customer.billAmount).toFixed(2)}` : NOT_AVAILABLE;

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:${CREAM}; color:#2a2a2a; box-sizing:border-box;">
    <!-- Top Header Banner: Shop Information -->
    <div style="display:flex; align-items:center; justify-content:space-between; background:linear-gradient(90deg, ${MAROON_DARK}, ${MAROON}); padding:16px 24px;">
      <div style="display:flex; align-items:center; gap:14px;">
        <img src="${keyShopLogo}" style="width:50px; height:50px; object-fit:contain; background:#fff; border-radius:50%; padding:3px; flex-shrink:0;" />
        <div>
          <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:19px; letter-spacing:.02em;">${esc(shopName)}</div>
          <div style="color:#fff; font-size:11px; font-weight:700; margin-top:2px;">Owner / Admin: ${esc(ownerName)}</div>
          <div style="color:#f0d9b5; font-size:10px; margin-top:1px;">Address: ${esc(shopAddress)}</div>
          <div style="color:#f0d9b5; font-size:10px;">Phone: ${esc(shopPhone)}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:${GOLD_BRIGHT}; font-size:8.5px; font-weight:800; letter-spacing:.1em;">REPORT ID</div>
        <div style="background:#fff; color:${MAROON_DARK}; font-weight:800; font-size:11px; padding:3px 8px; border-radius:5px; margin:3px 0 5px; white-space:nowrap; display:inline-block;">${esc(reportId)}</div>
        <div style="color:#f0d9b5; font-size:8.5px;">Registration Date</div>
        <div style="color:#fff; font-size:10.5px; font-weight:700; white-space:nowrap;">${formatDateTime(customer.createdAt)}</div>
      </div>
    </div>

    <div style="padding:14px 24px 4px;">
      <!-- Grid 2-column: Customer Information Box & Key / Vehicle Details Box -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <!-- BOX A: Customer Information -->
        <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; display:flex; flex-direction:column;">
          <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:7px 12px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:${GOLD}; border-radius:4px; font-size:10px; flex-shrink:0;">&#128100;</span>
            <span style="font-weight:800; font-size:12.5px; letter-spacing:.02em;">Customer Information</span>
          </div>
          <table style="width:100%; border-collapse:collapse; table-layout:fixed; flex:1;">
            ${infoRow('&#128100;', 'Customer Name', customer.name)}
            ${infoRow('&#128241;', 'Mobile Number', customer.phone)}
            ${infoRow('&#128205;', 'Address', customer.address || customer.capturedAddress)}
            ${infoRow('&#127968;', 'Captured Address', customer.capturedAddress)}
            ${infoRow('&#127380;', 'ID Verification Type', idType)}
            ${infoRow('&#128195;', 'ID Number', idNumber)}
            ${infoRow('&#128225;', 'GPS Coordinates', gpsCaptured ? `${customer.latitude}, ${customer.longitude}` : NOT_AVAILABLE)}
          </table>
        </div>

        <!-- BOX B: Key & Vehicle Details -->
        <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; display:flex; flex-direction:column;">
          <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:7px 12px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:${GOLD}; border-radius:4px; font-size:10px; flex-shrink:0;">&#128273;</span>
            <span style="font-weight:800; font-size:12.5px; letter-spacing:.02em;">Key & Vehicle Details</span>
          </div>
          <table style="width:100%; border-collapse:collapse; table-layout:fixed; flex:1;">
            ${infoRow('&#127991;', 'Key / Vehicle Name', keyName)}
            ${infoRow('&#128663;', 'Vehicle / Key Type', keyCategory)}
            ${infoRow('&#128273;', 'Key / Blank Code', keyCode)}
            ${infoRow('&#128663;', 'Vehicle Number', customer.vehicleNumber)}
            ${infoRow('&#9989;', 'Add Key Status', boolLabel(customer.addKey))}
            ${infoRow('&#10060;', 'Lost Key Status', boolLabel(customer.lostKey))}
          </table>
        </div>
      </div>

      <!-- BOX C: Billing & Financial Information Box -->
      <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:7px 12px;">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:${GOLD}; border-radius:4px; font-size:10px; flex-shrink:0;">&#128176;</span>
          <span style="font-weight:800; font-size:12.5px; letter-spacing:.02em;">Bill & Payment Details</span>
        </div>
        <div style="padding:12px 18px; display:flex; align-items:center; justify-content:space-between; background:#FAFAFA;">
          <div>
            <div style="font-size:10px; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:.05em;">Bill ID / Number</div>
            <div style="font-size:13.5px; font-weight:800; color:${MAROON_DARK}; margin-top:2px;">${esc(naVal(billId))}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:.05em;">Total Bill Amount</div>
            <div style="font-size:20px; font-weight:900; color:${MAROON}; margin-top:2px;">${esc(billAmountFormatted)}</div>
          </div>
        </div>
      </div>

      <!-- Confirmation Declaration Strip -->
      <div style="background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:9px 12px; margin-bottom:8px;">
        <p style="font-size:9.5px; color:#4a4a4a; line-height:1.35; margin:0;">I hereby confirm that the above key registration details are accurate and verified during customer registration.</p>
      </div>
    </div>

    <!-- Footer Strip -->
    <div style="display:flex; align-items:center; justify-content:space-between; background:${MAROON_DARK}; color:#fff; padding:10px 24px; font-size:9.5px; gap:16px;">
      <div>Generated On<br/><b>${formatDateTime(new Date())}</b></div>
      <div>Generated By<br/><b>${esc(naVal(registeredByName))}</b></div>
      <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:11.5px; text-align:right;">THANK YOU FOR CHOOSING KEY SHOPS</div>
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
