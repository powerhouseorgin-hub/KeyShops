import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { fileToDataUrl, urlToDataUrl, rasterizePdfFirstPage } from './pdfImage';

const MAROON = '#7A1220';
const MAROON_DARK = '#5C0E17';
const GOLD = '#E3A73E';
const CREAM = '#FFF8EC';
const BORDER = '#E7D8B8';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function infoRow(icon, label, value) {
  return `
    <tr>
      <td style="width:34px; padding:9px 8px; border-bottom:1px solid ${BORDER};">${icon}</td>
      <td style="padding:9px 8px; border-bottom:1px solid ${BORDER}; font-weight:700; color:${MAROON_DARK}; font-size:12.5px; white-space:nowrap;">${esc(label)}</td>
      <td style="padding:9px 12px; border-bottom:1px solid ${BORDER}; font-size:12.5px; color:#2a2a2a;">${esc(value)}</td>
    </tr>`;
}

function sectionHeader(icon, title) {
  return `
    <div style="display:flex; align-items:center; gap:8px; background:${MAROON}; color:#fff; padding:9px 14px; border-radius:8px 8px 0 0;">
      <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; background:${GOLD}; border-radius:5px; font-size:12px;">${icon}</span>
      <span style="font-weight:800; font-size:13.5px; letter-spacing:.02em;">${esc(title)}</span>
    </div>`;
}

function documentCard(label, imgDataUrl) {
  const body = imgDataUrl
    ? `<img src="${imgDataUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:6px;" />`
    : `<div style="width:100%; height:110px; display:flex; align-items:center; justify-content:center; background:#f4ede0; border-radius:6px; font-size:30px;">📄</div>`;
  return `
    <div style="flex:1 1 0; min-width:120px; background:#fff; border:1px solid ${BORDER}; border-radius:8px; overflow:hidden;">
      <div style="background:${GOLD}; color:${MAROON_DARK}; font-weight:800; font-size:10.5px; padding:5px 8px; text-transform:uppercase;">${esc(label)}</div>
      <div style="padding:6px;">${body}</div>
    </div>`;
}

function summaryRow(label, ok) {
  const badge = ok
    ? `<span style="color:#1f9d55; font-weight:800;">&#10003; Uploaded</span>`
    : `<span style="color:#c0392b; font-weight:800;">&#10007; Not Captured</span>`;
  return `
    <tr>
      <td style="padding:8px 12px; border-bottom:1px solid ${BORDER}; font-size:12px; font-weight:700; color:#2a2a2a;">${esc(label)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid ${BORDER}; font-size:12px; text-align:right;">${badge}</td>
    </tr>`;
}

// Builds a single branded PDF report - customer info, key details, shop
// information and every document embedded as an image (rasterizing PDF
// uploads via pdfjs) on one printable page. Renders an HTML template through
// html2canvas + jsPDF (rather than jsPDF's own primitive draw calls) so the
// layout can closely follow the Key Shops report template this was designed
// against. Used by both:
//  - Customer History's Download/WhatsApp actions, where `documents` are
//    already-saved rows with a remote `fileUrl` (Supabase signed URL or
//    backend path);
//  - the Registration wizard's Download/Share actions, where `documents` are
//    still local, in-memory `{ type, file }` File objects (upload to the
//    server only happens after Submit) - so no network fetch is needed or
//    even possible there yet.
export async function buildCustomerReportPdf({ customer, shop, registeredByName }) {
  const reportId = `RPT-KEY-${(customer.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  let photoDataUrl = null;
  if (customer.photoUrl) {
    try { photoDataUrl = await urlToDataUrl(customer.photoUrl); } catch (err) {
      console.error('Failed to load customer photo for report:', err);
    }
  }

  const docs = customer.documents || [];
  const docCards = [];
  for (const d of docs) {
    const label = d.documentType || d.type;
    let imgDataUrl = null;
    try {
      if (d.file) {
        // Local, not-yet-uploaded File (registration wizard) - read/rasterize
        // directly, no network involved.
        imgDataUrl = d.file.type === 'application/pdf'
          ? await rasterizePdfFirstPage(d.file)
          : await fileToDataUrl(d.file);
      } else if (/\.pdf($|\?)/i.test(d.fileUrl) || d.fileKey?.toLowerCase().endsWith('.pdf')) {
        imgDataUrl = await rasterizePdfFirstPage(d.fileUrl);
      } else {
        imgDataUrl = await urlToDataUrl(d.fileUrl);
      }
    } catch (err) {
      console.error(`Failed to load document "${label}" for report:`, err);
    }
    docCards.push(documentCard(label, imgDataUrl));
  }

  const gpsCaptured = !!(customer.latitude && customer.longitude);

  const html = `
  <div style="width:794px; font-family:Arial, Helvetica, sans-serif; background:${CREAM}; color:#2a2a2a;">
    <div style="display:flex; align-items:center; justify-content:space-between; background:linear-gradient(90deg, ${MAROON_DARK}, ${MAROON}); padding:20px 24px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${keyShopLogo}" style="width:52px; height:52px; object-fit:contain; background:#fff; border-radius:50%; padding:4px;" />
        <div>
          <div style="color:${GOLD}; font-weight:900; font-size:22px; letter-spacing:.03em;">CUSTOMER KEY</div>
          <div style="color:#fff; font-weight:900; font-size:16px; letter-spacing:.05em;">REGISTRATION REPORT</div>
          <div style="color:#f0d9b5; font-size:9.5px; letter-spacing:.15em; margin-top:2px;">SECURE REGISTRATION &middot; TRUSTED SERVICE</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:${GOLD}; font-size:9px; font-weight:800; letter-spacing:.1em;">REPORT ID</div>
        <div style="background:#fff; color:${MAROON_DARK}; font-weight:800; font-size:12px; padding:4px 10px; border-radius:6px; margin:4px 0 8px;">${esc(reportId)}</div>
        <div style="color:#f0d9b5; font-size:9px;">Registration Date</div>
        <div style="color:#fff; font-size:11.5px; font-weight:700;">${formatDateTime(customer.createdAt)}</div>
      </div>
    </div>

    <div style="display:flex; gap:16px; padding:18px 24px 0;">
      <div style="flex:2;">
        ${sectionHeader('&#128100;', 'Customer Information')}
        <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid ${BORDER}; border-top:none;">
          ${infoRow('&#128100;', 'Customer Name', customer.name)}
          ${infoRow('&#128241;', 'Mobile Number', customer.phone)}
          ${infoRow('&#128663;', 'Vehicle Number', customer.vehicleNumber || 'N/A')}
          ${infoRow('&#128273;', 'Key Blank Code', customer.keyNumber)}
          ${infoRow('&#128272;', 'Key Type', customer.keyType || 'N/A')}
          ${infoRow('&#128205;', 'Address', customer.capturedAddress || customer.address || 'N/A')}
          ${infoRow('&#128225;', 'GPS Coordinates', gpsCaptured ? `${customer.latitude}, ${customer.longitude}` : 'Not Captured')}
          ${infoRow('&#128100;', 'Registered By', registeredByName || 'N/A')}
        </table>
      </div>
      <div style="flex:1;">
        ${sectionHeader('&#128247;', 'Customer Photograph')}
        <div style="background:#fff; border:1px solid ${BORDER}; border-top:none; border-radius:0 0 8px 8px; padding:12px; display:flex; align-items:center; justify-content:center; height:172px;">
          ${photoDataUrl
            ? `<img src="${photoDataUrl}" style="max-width:100%; max-height:100%; border-radius:8px; object-fit:cover;" />`
            : `<div style="text-align:center; color:#b0a48a;"><div style="font-size:46px;">&#128100;</div><div style="font-size:11px; font-weight:700; margin-top:6px;">No Photo Captured</div></div>`}
        </div>
      </div>
    </div>

    <div style="padding:16px 24px 0;">
      ${sectionHeader('&#128193;', `Uploaded Documents (${docs.length})`)}
      <div style="background:#fff; border:1px solid ${BORDER}; border-top:none; border-radius:0 0 8px 8px; padding:12px; display:flex; gap:10px; flex-wrap:wrap;">
        ${docs.length > 0 ? docCards.join('') : `<div style="font-size:12px; color:#8a7f68; font-style:italic; padding:8px;">No documents were uploaded for this customer.</div>`}
      </div>
    </div>

    <div style="display:flex; gap:16px; padding:16px 24px 0;">
      <div style="flex:1;">
        ${sectionHeader('&#128273;', 'Key Details')}
        <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid ${BORDER}; border-top:none;">
          ${infoRow('&#127991;', 'Key Blank Code', customer.keyNumber)}
          ${infoRow('&#128193;', 'Key Category', customer.masterKey?.category || 'N/A')}
          ${infoRow('&#128272;', 'Key Type', customer.keyType || 'N/A')}
          ${infoRow('&#128221;', 'Remarks', customer.reason && customer.reason !== 'N/A' ? customer.reason : '&mdash;')}
        </table>
      </div>
      <div style="flex:1;">
        ${sectionHeader('&#127978;', 'Shop Information')}
        <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid ${BORDER}; border-top:none;">
          ${infoRow('&#127978;', 'Shop Name', shop?.name || 'N/A')}
          ${infoRow('&#128205;', 'Shop Address', shop?.address || 'N/A')}
          ${infoRow('&#128222;', 'Contact Number', shop?.phone || 'N/A')}
        </table>
      </div>
    </div>

    <div style="display:flex; gap:16px; padding:16px 24px 0;">
      <div style="flex:1;">
        ${sectionHeader('&#128737;', 'Registration Summary')}
        <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid ${BORDER}; border-top:none;">
          ${summaryRow('Customer Photo', !!photoDataUrl)}
          ${docs.map((d) => summaryRow(d.documentType || d.type, true)).join('')}
          ${summaryRow('GPS Location', gpsCaptured)}
        </table>
      </div>
      <div style="flex:1;">
        ${sectionHeader('&#128203;', 'Declaration')}
        <div style="background:#fff; border:1px solid ${BORDER}; border-top:none; border-radius:0 0 8px 8px; padding:14px;">
          <p style="font-size:11px; color:#4a4a4a; line-height:1.5; margin:0 0 14px;">I hereby confirm that the above information and uploaded documents are true and submitted during customer key registration.</p>
          <div style="display:flex; gap:14px;">
            <div style="flex:1;">
              <div style="font-size:10px; font-weight:800; color:${MAROON_DARK}; margin-bottom:22px;">CUSTOMER SIGNATURE</div>
              <div style="border-top:1px solid #b0a48a; font-size:9.5px; color:#8a7f68; padding-top:4px;">Date: ____ / ____ / ______</div>
            </div>
            <div style="flex:1;">
              <div style="font-size:10px; font-weight:800; color:${MAROON_DARK}; margin-bottom:22px;">SHOP ADMIN SIGNATURE</div>
              <div style="border-top:1px solid #b0a48a; font-size:9.5px; color:#8a7f68; padding-top:4px;">Date: ____ / ____ / ______</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; background:${MAROON_DARK}; color:#fff; padding:12px 24px; margin-top:20px; font-size:10.5px;">
      <div>Generated On<br/><b>${formatDateTime(new Date())}</b></div>
      <div>Generated By<br/><b>${esc(registeredByName || 'N/A')}</b></div>
      <div style="color:${GOLD}; font-weight:900; font-size:13px;">THANK YOU FOR CHOOSING KEY SHOPS</div>
    </div>
  </div>`;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const pxPerPage = Math.floor((canvas.width * pageHeight) / imgWidth);

    let renderedPx = 0;
    let first = true;
    while (renderedPx < canvas.height) {
      const sliceHeight = Math.min(pxPerPage, canvas.height - renderedPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      sliceCanvas.getContext('2d').drawImage(
        canvas, 0, renderedPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight,
      );
      if (!first) pdf.addPage();
      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidth, (sliceHeight * imgWidth) / canvas.width);
      renderedPx += sliceHeight;
      first = false;
    }

    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}
