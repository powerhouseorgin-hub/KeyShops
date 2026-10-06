import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { vehicleSaleText, fillText } from '../i18n/vehicleSaleText';

// "Delivery Receipt" invoice for a bike/car sale, laid out like the supplied reference receipt: boxed title
// with date / time / number, seller and buyer on the left, the vehicle and money fields on the right, a
// declaration from each party, witness + signature lines and the closing note. Separate from the customer
// Service Invoice (customerInvoicePdf.js) - that one is for key services, this one is only for vehicle sales.
//
// Order of the receipt: basic details, vehicle details, seller and buyer details, then the PHOTOS (up to 5), then the declarations -
// the seller's signature inside the seller's declaration and the buyer's inside the buyer's. With photos that is two pages (page 1: details +
// photos, page 2: declarations, signatures, witness, closing note); without photos it is one page. Signatures and photos are read from the
// sale's stored files, so a receipt downloaded, shared or reprinted later always contains them.
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

// A stored image (photo / signature) as a data URL, so the rasteriser can never be blocked by a cross-origin image. Tried three
// times (a fresh upload can take a moment to be readable); null when it cannot be loaded.
async function toDataUrl(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok) {
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (dataUrl) return dataUrl;
      }
    } catch (e) { /* try again */ }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  return null;
}

// One signature slot: the signature image (when there is one) above the labelled line. Sits at the right of a declaration box.
function signatureSlot(dataUrl, label) {
  return `
    <div style="display:flex; justify-content:flex-end; margin-top:6px;">
      <div style="width:250px; text-align:center;">
        <div style="height:${dataUrl ? 66 : 34}px; display:flex; align-items:flex-end; justify-content:center;">
          ${dataUrl ? `<img src="${dataUrl}" style="max-width:230px; max-height:62px; object-fit:contain;" />` : ''}
        </div>
        <div style="border-top:1px solid #888; padding-top:5px; font-size:10.5px; font-weight:700; color:#444; line-height:1.4;">${esc(label)}</div>
      </div>
    </div>`;
}

// Draws an HTML fragment off-screen, waits for its images and fonts, and returns it as a canvas.
async function rasterise(html, scale = 2.5) {
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
    return await html2canvas(container.firstElementChild, { scale, useCORS: true, backgroundColor: '#ffffff' });
  } finally {
    document.body.removeChild(container);
  }
}

// Puts a canvas on the current PDF page, scaled to the page width and - if it is taller than the page (longer text, e.g.
// Malayalam) - shrunk to fit, so nothing is cut off.
function placeCanvas(pdf, canvas, quality = 0.95, collect) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  let imgWidth = pageWidth - margin * 2;
  let imgHeight = (canvas.height * imgWidth) / canvas.width;
  const maxHeight = pageHeight - margin * 2;
  if (imgHeight > maxHeight) {
    imgWidth = (imgWidth * maxHeight) / imgHeight;
    imgHeight = maxHeight;
  }
  const x = (pageWidth - imgWidth) / 2;
  const pageImage = canvas.toDataURL('image/jpeg', quality);
  pdf.addImage(pageImage, 'JPEG', x, margin, imgWidth, imgHeight);
  if (collect) collect.push(pageImage);
}

// `localUrls` (optional): { storedUrl: localUrl } for images the app still holds (it has just uploaded them), so a fresh sale's
// receipt is drawn from those instead of downloading them again.
// `pageImages` (optional array): each rendered page is also pushed to it as a JPEG data URL - used by the Review preview before a sale is saved.
export async function buildVehicleSaleInvoicePdf({ sale, shop, lang = 'en', registeredByName, localUrls = {}, pageImages }) {
  const T = vehicleSaleText(lang);
  const shopName = (shop && shop.name) || '';
  const shopAddress = (shop && shop.address && shop.address !== 'N/A') ? shop.address : '';
  const shopPhone = (shop && shop.phone && shop.phone !== 'N/A') ? shop.phone : '';

  // The sale's stored attachments, loaded up front. A receipt that silently lacks a photo or a signature would be worse than no
  // receipt, so when one cannot be loaded this throws and the caller offers a retry.
  const photoUrls = (Array.isArray(sale.photos) ? sale.photos : []).map((p) => p && p.url).filter(Boolean).slice(0, 5);
  const load = (u) => toDataUrl(localUrls[u] || u);
  const [sellerSigImg, buyerSigImg, ...photoImgs] = await Promise.all([
    sale.sellerSignature?.url ? load(sale.sellerSignature.url) : Promise.resolve(null),
    sale.buyerSignature?.url ? load(sale.buyerSignature.url) : Promise.resolve(null),
    ...photoUrls.map((u) => load(u)),
  ]);
  if ((sale.sellerSignature?.url && !sellerSigImg) || (sale.buyerSignature?.url && !buyerSigImg) || photoImgs.some((x) => !x)) {
    throw new Error('Could not load the sale photos or signatures for the receipt');
  }

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

  const frame = (inner) => `
  <div style="width:794px; font-family:${FONT_STACK}; background:#ffffff; color:#222; box-sizing:border-box; padding:26px 34px;">
${inner}
  </div>`;

  // basic details + vehicle + seller and buyer
  const topHtml = `
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

`;

  // the declarations (with the signatures inside them), witness and closing note
  const declHtml = `
    <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px 10px; margin-bottom:10px; background:#FCFAF4;">
      <div style="text-align:center; margin-bottom:8px;"><span style="display:inline-block; border:1.5px solid #222; border-radius:8px; padding:5px 18px 7px; font-size:12.5px; line-height:1.35; font-weight:800;">${esc(T.sellerDeclTitle)}</span></div>
      <p style="font-size:10.8px; line-height:1.75; margin:0; color:#333; text-align:justify;">${sellerDecl}</p>
      ${signatureSlot(sellerSigImg, T.sellerSign)}
    </div>

    <div style="border:1px solid ${BORDER}; border-radius:6px; padding:12px 14px 10px; margin-bottom:12px; background:#FCFAF4;">
      <div style="text-align:center; margin-bottom:8px;"><span style="display:inline-block; border:1.5px solid #222; border-radius:8px; padding:5px 18px 7px; font-size:12.5px; line-height:1.35; font-weight:800;">${esc(T.buyerDeclTitle)}</span></div>
      <p style="font-size:10.8px; line-height:1.75; margin:0; color:#333; text-align:justify;">${buyerDecl}</p>
      ${signatureSlot(buyerSigImg, T.buyerSign)}
    </div>

    <div style="display:flex; justify-content:space-between; gap:30px; font-size:11px; margin-bottom:6px;">
      <div style="flex:1; line-height:2;">
        <div>${esc(T.witness)}: ${val(sale.witnessName, 180)}</div>
        <div>${esc(T.witnessAddr)}: ${val(sale.witnessAddress, 180)}</div>
      </div>
    </div>

    <div style="text-align:center; font-size:11px; line-height:1.45; font-weight:700; margin:14px 0 10px;">${esc(T.bothAgree)}</div>

    <div style="border:1.5px solid #333; border-radius:8px; padding:8px 14px 9px; text-align:center; font-size:11.5px; line-height:1.45; font-weight:800; background:#F4F4F4;">${esc(T.footerNote)}</div>

    ${blank(sale.notes) ? '' : `<div style="margin-top:8px; font-size:10px; color:#444; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${esc(sale.notes)}</div>`}


    <div style="text-align:center; font-size:8.5px; color:#999; margin-top:10px;">${esc(fillText(T.generated, { name: registeredByName || shopName || 'Shop Admin', date: formatDateTime(new Date()) }))}</div>
`;

  // the photos: one, two or three per row so a few photos are shown large and five still fit on the page
  const photosSection = (() => {
    if (!photoImgs.length) return '';
    const n = photoImgs.length;
    const cols = n === 1 ? 1 : n === 2 ? 2 : 3;
    const height = n === 1 ? 420 : n === 2 ? 300 : 240;
    const cells = photoImgs.map((src) => `
      <div style="box-sizing:border-box; width:100%; height:${height}px; border:1px solid ${BORDER}; border-radius:8px; background:#F6F3EA; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        <img src="${src}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;" />
      </div>`).join('');
    return `
    <div style="margin:2px 0 6px;">
      <div style="text-align:center; margin-bottom:10px;">
        <span style="display:inline-block; border:2px solid #222; border-radius:10px; padding:4px 26px 7px; font-size:15px; line-height:1.4; font-weight:900; color:#111;">${esc(T.photosTitle)}</span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:12px;">${cells}</div>
    </div>`;
  })();

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  if (!photoImgs.length) {
    placeCanvas(pdf, await rasterise(frame(topHtml + declHtml)), 0.95, pageImages);
    return pdf;
  }
  // page 1: details + photos (the photos are already compressed, so a lighter render keeps the file small)
  placeCanvas(pdf, await rasterise(frame(topHtml + photosSection), 2.2), 0.9, pageImages);

  // page 2: a slim header, then the declarations with the signatures
  const slimHeader = `
    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid ${MAROON}; padding-bottom:10px; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${keyShopLogo}" style="width:40px; height:40px; object-fit:contain;" />
        <div style="font-weight:900; font-size:16px; color:${MAROON};">${esc(shopName)}</div>
      </div>
      <div style="text-align:right; font-size:11px; line-height:1.7;">
        <div>${esc(T.docNo)}: <b>${val(sale.saleNumber, 90)}</b></div>
        <div>${esc(T.regNo)}: <b>${val(sale.registrationNumber, 90)}</b></div>
      </div>
    </div>`;
  pdf.addPage();
  placeCanvas(pdf, await rasterise(frame(slimHeader + declHtml)), 0.95, pageImages);
  return pdf;
}
