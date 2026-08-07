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
      <td style="width:30px; padding:11px 6px; border-bottom:1px solid ${BORDER}; vertical-align:top; text-align:center;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; font-size:11px; line-height:1; margin-top:1px;">${icon}</span>
      </td>
      <td style="width:135px; padding:11px 8px; border-bottom:1px solid ${BORDER}; font-weight:700; color:${MAROON_DARK}; font-size:11px; vertical-align:top; line-height:1.5; word-break:break-word; overflow-wrap:break-word;">${esc(label)}</td>
      <td style="padding:11px 10px; border-bottom:1px solid ${BORDER}; font-size:11px; color:#2a2a2a; vertical-align:top; line-height:1.5; word-break:break-word; overflow-wrap:anywhere; white-space:normal;">${esc(naVal(value))}</td>
    </tr>`;
}

// Builds a single branded, comprehensive PDF report containing all customer registration details
export async function buildCustomerReportPdf({ customer, shop, registeredByName }) {
  const idSource = customer.id || `DRAFT${Date.now()}`;
  const reportId = `RPT-KEY-${idSource.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8).toUpperCase()}`;

  const gpsCaptured = !!(customer.latitude && customer.longitude);
  const catRaw = (customer.vehicleCategory || customer.lockCategory || customer.keyType || '').toUpperCase();
  const isHome = catRaw === 'HOME' || catRaw === 'HOUSE';
  const isOffice = catRaw === 'OFFICE' || catRaw === 'COMMERCIAL';
  const isAutomobile = !isHome && !isOffice;

  const shopName = shop?.name || 'Key Shops';
  const ownerName = registeredByName || shop?.ownerName || 'Shop Admin';
  const shopAddress = shop?.address || NOT_AVAILABLE;
  const shopPhone = shop?.phone || NOT_AVAILABLE;

  const idType = customer.idType || customer.idProofType || NOT_AVAILABLE;
  const idNumber = customer.idNumber || customer.idProofNumber || NOT_AVAILABLE;

  const hasBillAmount = customer.billAmount !== null && customer.billAmount !== undefined && customer.billAmount !== '';
  const billId = customer.billNumber || customer.billId || (hasBillAmount ? `BILL-${idSource.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8).toUpperCase()}` : NOT_AVAILABLE);
  const billAmountFormatted = hasBillAmount ? `₹ ${Number(customer.billAmount).toFixed(2)}` : NOT_AVAILABLE;

  let boxBTitle = 'Vehicle & Key Details';
  let boxBRows = '';

  if (isHome) {
    boxBTitle = 'Home Key Details';
    boxBRows += infoRow('&#127968;', 'Home / Property Description', customer.homeOfficeName || customer.vehicleName);
    boxBRows += infoRow('&#127991;', 'Key Category', 'Home');
    boxBRows += infoRow('&#128273;', 'Key / Blank Code', customer.keyNumber || customer.keyCode);
    boxBRows += infoRow('&#9989;', 'Add Key Status', boolLabel(customer.addKey));
    boxBRows += infoRow('&#10060;', 'Lost Key Status', boolLabel(customer.lostKey));
  } else if (isOffice) {
    boxBTitle = 'Office Key Details';
    boxBRows += infoRow('&#127970;', 'Office Description', customer.homeOfficeName || customer.vehicleName);
    boxBRows += infoRow('&#127991;', 'Key Category', 'Office');
    boxBRows += infoRow('&#128273;', 'Key / Blank Code', customer.keyNumber || customer.keyCode);
    boxBRows += infoRow('&#9989;', 'Add Key Status', boolLabel(customer.addKey));
    boxBRows += infoRow('&#10060;', 'Lost Key Status', boolLabel(customer.lostKey));
  } else {
    // Automobile Category (Two Wheeler, Four Wheeler, Truck / Lorry)
    boxBTitle = 'Vehicle & Key Details';
    const formattedCatName = catRaw === 'TWO_WHEELER' ? 'Two Wheeler' : catRaw === 'FOUR_WHEELER' ? 'Four Wheeler' : catRaw === 'TRUCK_LORRY' ? 'Truck / Lorry' : (customer.vehicleCategory || 'Vehicle');
    boxBRows += infoRow('&#127991;', 'Vehicle Model / Key Name', customer.vehicleName);
    boxBRows += infoRow('&#128663;', 'Vehicle Category', formattedCatName);
    boxBRows += infoRow('&#128273;', 'Key / Blank Code', customer.keyNumber || customer.keyCode);
    boxBRows += infoRow('&#128663;', 'Vehicle Number', customer.vehicleNumber);
    boxBRows += infoRow('&#9989;', 'Add Key Status', boolLabel(customer.addKey));
    boxBRows += infoRow('&#10060;', 'Lost Key Status', boolLabel(customer.lostKey));
  }

  // Filter out vehicle-specific documents (e.g. RC Book) for Home / Office key types
  const docsToDisplay = (customer.documents || []).filter(d => {
    const dtName = (d.documentType || d.type || '').toLowerCase();
    if ((isHome || isOffice) && dtName.includes('rc')) return false;
    return true;
  });

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:${CREAM}; color:#2a2a2a; box-sizing:border-box;">
    <div>
      <!-- Top Header Banner: Shop Information -->
      <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px; background:linear-gradient(90deg, ${MAROON_DARK}, ${MAROON}); padding:20px 24px;">
        <div style="display:flex; align-items:flex-start; gap:14px; min-width:0; flex:1;">
          <img src="${keyShopLogo}" style="width:52px; height:52px; object-fit:contain; background:#fff; border-radius:50%; padding:3px; flex-shrink:0;" />
          <div style="min-width:0;">
            <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:19px; letter-spacing:.02em; line-height:1.3; word-break:break-word;">${esc(shopName)}</div>
            <div style="color:#fff; font-size:11px; font-weight:700; margin-top:4px; line-height:1.4; word-break:break-word;">Owner / Admin: ${esc(ownerName)}</div>
            <div style="color:#f0d9b5; font-size:10px; margin-top:3px; line-height:1.4; word-break:break-word;">Address: ${esc(shopAddress)}</div>
            <div style="color:#f0d9b5; font-size:10px; margin-top:2px; line-height:1.4; word-break:break-word;">Phone: ${esc(shopPhone)}</div>
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div style="color:${GOLD_BRIGHT}; font-size:8.5px; font-weight:800; letter-spacing:.1em;">REPORT ID</div>
          <div style="background:#fff; color:${MAROON_DARK}; font-weight:800; font-size:11px; padding:4px 9px; border-radius:5px; margin:4px 0 6px; white-space:nowrap; display:inline-block;">${esc(reportId)}</div>
          <div style="color:#f0d9b5; font-size:8.5px;">Registration Date</div>
          <div style="color:#fff; font-size:10.5px; font-weight:700; white-space:nowrap;">${formatDateTime(customer.createdAt)}</div>
        </div>
      </div>

      <div style="padding:20px 24px 16px;">
        <!-- Grid 2-column: Customer Information Box & Key / Vehicle Details Box -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px;">
          <!-- BOX A: Customer Information -->
          <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff;">
            <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:10px 12px;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:${GOLD}; border-radius:4px; font-size:10px; flex-shrink:0;">&#128100;</span>
              <span style="font-weight:800; font-size:12.5px; letter-spacing:.02em;">Customer Information</span>
            </div>
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
              ${infoRow('&#128100;', 'Customer Name', customer.name)}
              ${infoRow('&#128241;', 'Mobile Number', customer.phone)}
              ${infoRow('&#128205;', 'Address', customer.address || customer.capturedAddress)}
              ${infoRow('&#127380;', 'ID Verification Type', idType)}
              ${infoRow('&#128195;', 'ID Number', idNumber)}
              ${infoRow('&#128225;', 'GPS Coordinates', gpsCaptured ? `${customer.latitude}, ${customer.longitude}` : NOT_AVAILABLE)}
              ${(docsToDisplay.length > 0) ? docsToDisplay.map(d => {
                const dtName = (d.documentType || d.type || 'Document').replace(/\s+Copy$/i, '');
                return infoRow('&#128196;', 'Attached Document', dtName);
              }).join('') : ''}
            </table>
          </div>

          <!-- BOX B: Dynamic Key Details (Home / Office / Vehicle) -->
          <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff;">
            <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:10px 12px;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:${GOLD}; border-radius:4px; font-size:10px; flex-shrink:0;">&#128273;</span>
              <span style="font-weight:800; font-size:12.5px; letter-spacing:.02em;">${esc(boxBTitle)}</span>
            </div>
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
              ${boxBRows}
            </table>
          </div>
        </div>

        <!-- BOX C: Billing & Financial Information Box -->
        <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:10px 12px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:${GOLD}; border-radius:4px; font-size:10px; flex-shrink:0;">&#128176;</span>
            <span style="font-weight:800; font-size:12.5px; letter-spacing:.02em;">Bill & Payment Details</span>
          </div>
          <div style="padding:16px 20px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:16px; background:#FAFAFA;">
            <div style="min-width:140px;">
              <div style="font-size:10px; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:.05em;">Bill ID / Number</div>
              <div style="font-size:14px; font-weight:800; color:${MAROON_DARK}; margin-top:4px; line-height:1.4; word-break:break-word;">${esc(naVal(billId))}</div>
            </div>
            <div style="text-align:right; min-width:140px;">
              <div style="font-size:10px; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:.05em;">Total Bill Amount</div>
              <div style="font-size:20px; font-weight:900; color:${MAROON}; margin-top:4px; line-height:1.3; word-break:break-word;">${esc(billAmountFormatted)}</div>
            </div>
          </div>
        </div>

        <!-- Confirmation Declaration Strip -->
        <div style="background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 16px;">
          <p style="font-size:9.5px; color:#4a4a4a; line-height:1.5; margin:0;">I hereby confirm that the above key registration details are accurate and verified during customer registration.</p>
        </div>
      </div>
    </div>

    <!-- Footer Strip at Bottom -->
    <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; background:${MAROON_DARK}; color:#fff; padding:14px 24px; font-size:10px; line-height:1.5; gap:16px;">
      <div style="min-width:110px; word-break:break-word;">Generated On<br/><b>${formatDateTime(new Date())}</b></div>
      <div style="min-width:110px; word-break:break-word; flex:1;">Generated By<br/><b>${esc(naVal(registeredByName))}</b></div>
      <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:12px; text-align:right; word-break:break-word;">THANK YOU FOR CHOOSING KEY SHOPS</div>
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
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // The report's real height only ever exceeds one A4 page for unusually
    // long content (many wrapped addresses/documents). Rather than shrinking
    // the whole page to force a fit - which can make text illegibly small -
    // draw the same full-height image on successive pages, shifting it
    // upward each time so the next unshown slice lands at the top margin.
    // jsPDF clips anything past the physical page edge, so each page shows
    // only its own slice; no content is lost, it simply continues onto the
    // next page.
    let heightLeft = imgHeight;
    let renderedHeight = 0;

    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    heightLeft -= usableHeight;
    renderedHeight += usableHeight;

    while (heightLeft > 0) {
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, margin - renderedHeight, imgWidth, imgHeight);
      heightLeft -= usableHeight;
      renderedHeight += usableHeight;
    }

    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}
