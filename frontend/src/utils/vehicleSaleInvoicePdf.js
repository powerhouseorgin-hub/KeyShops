import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { vehicleSaleText, fillText } from '../i18n/vehicleSaleText';

// "Delivery Receipt" invoice for a bike/car sale, laid out like the supplied reference receipt: boxed title
// with date / time / number, seller and buyer on the left, the vehicle and money fields on the right, a
// declaration from each party, witness + signature lines and the closing note. Separate from the customer
// Service Invoice (customerInvoicePdf.js) - that one is for key services, this one is only for vehicle sales.
//
// Drawn as HTML and rasterised with html2canvas (like the other invoices) so the device's own fonts render
// every script - Tamil, Hindi, Telugu, Kannada and Malayalam text come out correctly without bundling fonts.
// Blank optional fields print as a dotted line, as on the paper receipt, so they can still be filled by hand.
const MAROON = '#7A1220';
const MAROON_DARK = '#5A0D18';
const BORDER = '#D9C7A0';
const FONT_STACK =
  "'Noto Sans','Noto Sans Tamil','Noto Sans Devanagari','Noto Sans Telugu','Noto Sans Kannada','Noto Sans Malayalam'," +
  "'Nirmala UI','Latha','Mangal','Gautami','Tunga','Kartika','Segoe UI',Arial,Helvetica,sans-serif";

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const blank = (value) => value === null || value === undefined || String(value).trim() === '';

// A value, or a dotted writing line when empty.
function val(value, minWidth = 120) {
  if (blank(value)) return `<span style="display:inline-block; min-width:${minWidth}px; border-bottom:1px dotted #777;">&nbsp;</span>`;
  return esc(String(value).trim());
}

function money(value) {
  if (blank(value)) return val(null, 90);
  const n = Number(value);
  if (!Number.isFinite(n)) return val(null, 90);
  return esc(n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
function formatIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// 'HH:MM' (24h) -> 'hh:MM AM/PM'
function formatTime(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  let h = Number(m[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m[2]} ${ampm}`;
}

function formatDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  return `${d} ${formatTime(`${pad(date.getHours())}:${pad(date.getMinutes())}`)}`;
}

function row(label, valueHtml) {
  return `
    <tr>
      <td style="padding:6px 8px 6px 0; font-size:11.5px; line-height:1.4; font-weight:700; color:${MAROON_DARK}; vertical-align:top; width:46%;">${esc(label)}</td>
      <td style="padding:6px 0; font-size:11.5px; line-height:1.4; color:#222; vertical-align:top; word-break:break-word;">: ${valueHtml}</td>
    </tr>`;
}

export async function buildVehicleSaleInvoicePdf({ sale, shop, lang = 'en', registeredByName }) {
  const T = vehicleSaleText(lang);
  const shopName = (shop && shop.name) || '';
  const shopAddress = (shop && shop.address && shop.address !== 'N/A') ? shop.address : '';
  const shopPhone = (shop && shop.phone && shop.phone !== 'N/A') ? shop.phone : '';

  const sellerName = sale.sellerName || '';
  const buyerName = sale.buyerName || '';
  const bold = (name) => `<b>${blank(name) ? '.........................' : esc(name)}</b>`;
  // fillText runs on the template BEFORE escaping the names in, so the names are injected pre-escaped and bold
  const sellerDecl = fillText(esc(T.sellerDecl), { seller: bold(sellerName) });
  const buyerDecl = fillText(esc(T.buyerDecl), { buyer: bold(buyerName) });

  const modelColour = [sale.vehicleModel, sale.vehicleColor].filter((x) => !blank(x));
  const modelValue = blank(sale.vehicleModel) && blank(sale.vehicleColor)
    ? val(null, 120)
    : `${blank(sale.vehicleModel) ? '' : esc(sale.vehicleModel)}${modelColour.length === 2 ? ` &nbsp;&nbsp; <b>${esc(T.colour)}:</b> ` : (blank(sale.vehicleModel) ? `<b>${esc(T.colour)}:</b> ` : '')}${blank(sale.vehicleColor) ? '' : esc(sale.vehicleColor)}`;

  const partyBlock = (title, name, address, phone) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px; font-weight:800; color:${MAROON}; margin-bottom:5px;">${esc(title)}</div>
      <div style="font-size:11px; line-height:1.9; color:#222;">
        <div>${esc(T.name)}: ${val(name, 150)}</div>
        <div>${esc(T.address)}: ${val(address, 150)}</div>
        <div>${esc(T.phoneShort)}: ${val(phone, 110)}</div>
      </div>
    </div>`;

  const html = `
  <div style="width:794px; font-family:${FONT_STACK}; background:#ffffff; color:#222; box-sizing:border-box; padding:26px 34px;">

    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid ${MAROON}; padding-bottom:10px; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${keyShopLogo}" style="width:40px; height:40px; object-fit:contain;" />
        <div>
          <div style="font-weight:900; font-size:16px; color:${MAROON};">${esc(shopName)}</div>
          <div style="font-size:9.5px; color:#666; margin-top:2px;">${esc(shopAddress)}${shopPhone ? ` &nbsp;|&nbsp; ${esc(T.phoneShort)}: ${esc(shopPhone)}` : ''}</div>
        </div>
      </div>
      <div style="text-align:right; font-size:11px; line-height:1.7;">
        <div>${esc(T.docDate)}: <b>${val(formatIsoDate(sale.saleDate), 90)}</b></div>
        <div>${esc(T.docTime)}: <b>${val(formatTime(sale.saleTime), 80)}</b></div>
        <div>${esc(T.docNo)}: <b>${val(sale.saleNumber, 90)}</b></div>
      </div>
    </div>

    <div style="text-align:center; margin-bottom:16px;">
      <span style="display:inline-block; border:2px solid #222; border-radius:10px; padding:6px 34px 9px; font-size:20px; line-height:1.4; font-weight:900; letter-spacing:.02em; color:#111;">${esc(T.receiptTitle)}</span>
    </div>

    <div style="display:flex; gap:26px; margin-bottom:14px;">
      <div style="width:42%;">
        ${partyBlock(T.seller, sellerName, sale.sellerAddress, sale.sellerPhone)}
        ${partyBlock(T.buyer, buyerName, sale.buyerAddress, sale.buyerPhone)}
      </div>
      <div style="width:58%;">
        <table style="border-collapse:collapse; width:100%;">
          ${row(T.regNo, val(sale.registrationNumber, 120))}
          ${row(T.model, modelValue)}
          ${row(T.vehicleName, val(sale.vehicleName, 120))}
          ${row(T.chassisNo, val(sale.chassisNumber, 120))}
          ${row(T.engineNo, val(sale.engineNumber, 120))}
          ${row(T.priceRs, money(sale.vehiclePrice))}
          ${row(T.advanceRs, money(sale.advanceAmount))}
          ${row(T.balanceRs, money(sale.balanceAmount))}
          ${row(T.commissionRs, money(sale.officeCommission))}
          ${row(T.lastDate, val(formatIsoDate(sale.balanceLastDate), 110))}
        </table>
      </div>
    </div>

    <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px 10px; margin-bottom:10px; background:#FCFAF4;">
      <div style="text-align:center; margin-bottom:8px;"><span style="display:inline-block; border:1.5px solid #222; border-radius:8px; padding:5px 18px 7px; font-size:12.5px; line-height:1.35; font-weight:800;">${esc(T.sellerDeclTitle)}</span></div>
      <p style="font-size:10.8px; line-height:1.75; margin:0; color:#333; text-align:justify;">${sellerDecl}</p>
      <div style="display:flex; justify-content:flex-end; margin-top:6px;">
        <div style="width:220px; text-align:center; padding-top:30px;">
          <div style="border-top:1px solid #888; padding-top:5px; font-size:10px; color:#555; line-height:1.4;">${esc(T.sellerSign)}</div>
        </div>
      </div>
    </div>

    <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px 10px; margin-bottom:12px; background:#FCFAF4;">
      <div style="text-align:center; margin-bottom:8px;"><span style="display:inline-block; border:1.5px solid #222; border-radius:8px; padding:5px 18px 7px; font-size:12.5px; line-height:1.35; font-weight:800;">${esc(T.buyerDeclTitle)}</span></div>
      <p style="font-size:10.8px; line-height:1.75; margin:0; color:#333; text-align:justify;">${buyerDecl}</p>
    </div>

    <div style="display:flex; justify-content:space-between; gap:30px; font-size:11px; margin-bottom:6px;">
      <div style="flex:1; line-height:2;">
        <div>${esc(T.witness)}: ${val(sale.witnessName, 180)}</div>
        <div>${esc(T.witnessAddr)}: ${val(sale.witnessAddress, 180)}</div>
      </div>
      <div style="width:220px; text-align:center; align-self:flex-end; padding-top:30px;">
        <div style="border-top:1px solid #888; padding-top:5px; font-size:10px; color:#555; line-height:1.4;">${esc(T.buyerSign)}</div>
      </div>
    </div>

    <div style="text-align:center; font-size:11px; line-height:1.45; font-weight:700; margin:14px 0 10px;">${esc(T.bothAgree)}</div>

    <div style="border:1.5px solid #333; border-radius:8px; padding:8px 14px 9px; text-align:center; font-size:11.5px; line-height:1.45; font-weight:800; background:#F4F4F4;">${esc(T.footerNote)}</div>

    ${blank(sale.notes) ? '' : `<div style="margin-top:8px; font-size:10px; color:#444; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${esc(sale.notes)}</div>`}

    <div style="text-align:center; font-size:8.5px; color:#999; margin-top:10px;">${esc(fillText(T.generated, { name: registeredByName || shopName || 'Shop Admin', date: formatDateTime(new Date()) }))}</div>
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
      return new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
    }));
    // let web fonts / system script fonts settle before rasterising
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }

    const canvas = await html2canvas(container.firstElementChild, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    // A receipt is one page: scale to the page width, and if the (longer, e.g. Malayalam) text makes it taller
    // than the page, shrink it to fit instead of cutting the signatures off.
    let imgWidth = pageWidth - margin * 2;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;
    const maxHeight = pageHeight - margin * 2;
    if (imgHeight > maxHeight) {
      imgWidth = (imgWidth * maxHeight) / imgHeight;
      imgHeight = maxHeight;
    }
    const x = (pageWidth - imgWidth) / 2;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, margin, imgWidth, imgHeight);
    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}
