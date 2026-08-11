import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { isAutomobileCategory } from './vehicleCategory';

// Theme constants matching the app design system
const MAROON = '#7A1220';
const MAROON_DARK = '#5A0D18';
const GOLD_BRIGHT = '#F5B800';
const CREAM = '#FFF8EC';
const BORDER = '#E7D8B8';

const NOT_AVAILABLE = 'N/A';

// Shared layout constants so all three section headers (Customer Information,
// Vehicle & Key Details, Bill & Payment Details) and every info-row are
// pixel-identical instead of separately hand-tuned inline styles.
const HEADER_PADDING = '12px 14px';
const ROW_PADDING_V = 8; // px vertical padding per info-row cell
const SECTION_GAP = 20; // px gap between major cards/sections

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

// Standardized section header - used identically by all three info cards so
// header height and title alignment can never drift apart between sections.
// No icon - the emoji glyphs used previously never rendered reliably
// vertically-centered under html2canvas's rasterization (font metrics for
// color/emoji glyphs don't line up with normal text line-box math the way
// they do in a live browser), so the title is the only content in the bar.
function sectionHeader(title) {
  return `
    <div style="display:flex; align-items:center; background:${MAROON}; color:#fff; padding:${HEADER_PADDING}; box-sizing:border-box;">
      <span style="font-weight:800; font-size:12.5px; line-height:1.2; letter-spacing:.02em;">${esc(title)}</span>
    </div>`;
}

// `isLast` drops the row's own bottom border so the final row doesn't sit
// flush against the card's own border and read as a doubled line.
function infoRow(label, value, isLast = false) {
  const border = isLast ? 'none' : `1px solid ${BORDER}`;
  return `
    <tr>
      <td style="width:150px; padding:${ROW_PADDING_V}px 8px ${ROW_PADDING_V}px 12px; border-bottom:${border}; font-weight:700; color:${MAROON_DARK}; font-size:11px; vertical-align:middle; line-height:1.4; word-break:break-word; overflow-wrap:break-word;">${esc(label)}</td>
      <td style="padding:${ROW_PADDING_V}px 12px; border-bottom:${border}; font-size:11px; color:#2a2a2a; vertical-align:middle; line-height:1.4; word-break:break-word; overflow-wrap:anywhere; white-space:normal;">${esc(naVal(value))}</td>
    </tr>`;
}

// Renders a full <tr> list from [label, value] tuples, automatically
// marking only the final row as `isLast` regardless of how many rows a
// given section ends up with (e.g. a variable number of attached documents).
function renderRows(rows) {
  return rows.map(([label, value], idx) => infoRow(label, value, idx === rows.length - 1)).join('');
}

// Builds a single branded, comprehensive PDF report containing all customer registration details
export async function buildCustomerReportPdf({ customer, shop, registeredByName }) {
  const idSource = customer.id || `DRAFT${Date.now()}`;

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
  let boxBRowsData = [];

  if (isHome) {
    boxBTitle = 'Home Key Details';
    boxBRowsData = [
      ['Home / Property Description', customer.homeOfficeName || customer.vehicleName],
      ['Key Category', 'Home'],
      ['Key / Blank Code', customer.keyNumber || customer.keyCode],
      ['Add Key Status', boolLabel(customer.addKey)],
      ['Lost Key Status', boolLabel(customer.lostKey)],
    ];
  } else if (isOffice) {
    boxBTitle = 'Office Key Details';
    boxBRowsData = [
      ['Office Description', customer.homeOfficeName || customer.vehicleName],
      ['Key Category', 'Office'],
      ['Key / Blank Code', customer.keyNumber || customer.keyCode],
      ['Add Key Status', boolLabel(customer.addKey)],
      ['Lost Key Status', boolLabel(customer.lostKey)],
    ];
  } else {
    // Automobile Category (Two Wheeler, Four Wheeler, Truck / Lorry)
    boxBTitle = 'Vehicle & Key Details';
    const formattedCatName = catRaw === 'TWO_WHEELER' ? 'Two Wheeler' : catRaw === 'FOUR_WHEELER' ? 'Four Wheeler' : catRaw === 'TRUCK_LORRY' ? 'Truck / Lorry' : (customer.vehicleCategory || 'Vehicle');
    boxBRowsData = [
      ['Vehicle Model / Key Name', customer.vehicleName],
      ['Vehicle Category', formattedCatName],
      ['Key / Blank Code', customer.keyNumber || customer.keyCode],
      ['Vehicle Number', customer.vehicleNumber],
      ['Add Key Status', boolLabel(customer.addKey)],
      ['Lost Key Status', boolLabel(customer.lostKey)],
    ];
  }
  const boxBRows = renderRows(boxBRowsData);

  // Filter out vehicle-specific documents (e.g. RC Book) for Home / Office key types
  const docsToDisplay = (customer.documents || []).filter(d => {
    const dtName = (d.documentType || d.type || '').toLowerCase();
    if ((isHome || isOffice) && dtName.includes('rc')) return false;
    return true;
  });

  const boxARowsData = [
    ['Customer Name', customer.name],
    ['Mobile Number', customer.phone],
    ['Address', customer.address || customer.capturedAddress],
    ['ID Verification Type', idType],
    ['ID Number', idNumber],
    ['GPS Coordinates', gpsCaptured ? `${customer.latitude}, ${customer.longitude}` : NOT_AVAILABLE],
    ...docsToDisplay.map((d) => {
      const dtName = (d.documentType || d.type || 'Document').replace(/\s+Copy$/i, '');
      return ['Attached Document', dtName];
    }),
  ];
  const boxARows = renderRows(boxARowsData);

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:${CREAM}; color:#2a2a2a; box-sizing:border-box;">
    <div>
      <!-- Top Header Banner: Shop Information -->
      <!-- position:relative + an absolutely-positioned Report ID block instead of a
           flex "space-between" pair - html2canvas doesn't always reproduce a flex
           row's computed widths perfectly (especially once flex-wrap enters the
           picture), which was letting the right-hand block get pushed partly
           outside the 794px canvas depending on how long the shop name/address
           rendered. Absolute positioning is exact pixel math instead, so the
           Report ID corner is guaranteed to render fully on-canvas regardless of
           how much space the left-hand shop info takes up. -->
      <div style="position:relative; background:linear-gradient(90deg, ${MAROON_DARK}, ${MAROON}); padding:20px 24px;">
        <!-- align-items:center (not flex-start) so the 52px logo centers
             against the full height of the 4-line shop info text block
             instead of pinning to its top edge. -->
        <div style="display:flex; align-items:center; gap:14px; padding-right:110px;">
          <img src="${keyShopLogo}" style="width:52px; height:52px; object-fit:contain; background:#fff; border-radius:50%; padding:3px; flex-shrink:0;" />
          <div style="min-width:0;">
            <div style="color:${GOLD_BRIGHT}; font-weight:900; font-size:19px; letter-spacing:.02em; line-height:1.3; word-break:break-word;">${esc(shopName)}</div>
            <div style="color:#fff; font-size:11px; font-weight:700; margin-top:4px; line-height:1.4; word-break:break-word;">Owner / Admin: ${esc(ownerName)}</div>
            <div style="color:#f0d9b5; font-size:10px; margin-top:3px; line-height:1.4; word-break:break-word;">Address: ${esc(shopAddress)}</div>
            <div style="color:#f0d9b5; font-size:10px; margin-top:2px; line-height:1.4; word-break:break-word;">Phone: ${esc(shopPhone)}</div>
          </div>
        </div>
        <div style="position:absolute; top:20px; right:24px; width:100px; text-align:right;">
          <div style="color:${GOLD_BRIGHT}; font-size:8.5px; font-weight:800; letter-spacing:.1em; line-height:1.4;">Registration Date</div>
          <div style="color:#fff; font-size:10.5px; font-weight:700; line-height:1.4; white-space:nowrap; margin-top:4px;">${formatDateTime(customer.createdAt)}</div>
        </div>
      </div>

      <div style="padding:${SECTION_GAP}px 24px 16px;">
        <!-- Grid 2-column: Customer Information Box & Key / Vehicle Details Box -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:${SECTION_GAP}px;">
          <!-- BOX A: Customer Information -->
          <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff;">
            ${sectionHeader('Customer Information')}
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
              ${boxARows}
            </table>
          </div>

          <!-- BOX B: Dynamic Key Details (Home / Office / Vehicle) -->
          <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff;">
            ${sectionHeader(boxBTitle)}
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
              ${boxBRows}
            </table>
          </div>
        </div>

        <!-- BOX C: Billing & Financial Information Box -->
        <div style="border:1.5px solid ${BORDER}; border-radius:8px; overflow:hidden; background:#fff; margin-bottom:${SECTION_GAP}px;">
          ${sectionHeader('Bill & Payment Details')}
          <div style="padding:14px 20px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:16px; background:#FAFAFA;">
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
