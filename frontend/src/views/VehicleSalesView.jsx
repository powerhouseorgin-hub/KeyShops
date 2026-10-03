import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Car, User, Phone, MapPin, IndianRupee, Calendar, Clock, FileText, Download, RefreshCw,
  MessageCircle, Plus, CheckCircle2, Palette, Wrench, StickyNote, UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { vehicleSaleText, fillText } from '../i18n/vehicleSaleText';
import { downloadPdf, sendPdfToWhatsApp } from '../utils/pdfDelivery';
import { IS_NATIVE_APP } from '../utils/platform';
import { toWhatsAppNumber } from '../utils/phone';

// Vehicle Sales: record a bike/car sale and generate the "Delivery Receipt" invoice for the buyer.
// Everything on screen follows the app language (vehicleSaleText.js); the invoice is generated in the language
// that was selected when Sale was pressed, and that language is stored with the sale so re-downloading it later
// prints the same document. The receipt number is not entered here: the server generates a unique one for every sale.
// Layout: on a phone, short fields (date/time, price/advance, ...) sit two to a row (marked `half`) and the rest
// take the full width; the spacing is tightened by the .vs-form rules in index.css.

const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const emptyForm = () => ({
  saleDate: todayIso(), saleTime: nowTime(),
  sellerName: '', sellerAddress: '', sellerPhone: '',
  buyerName: '', buyerAddress: '', buyerPhone: '',
  registrationNumber: '', vehicleModel: '', vehicleColor: '', vehicleName: '', chassisNumber: '', engineNumber: '',
  vehiclePrice: '', advanceAmount: '', officeCommission: '', balanceLastDate: '',
  witnessName: '', witnessAddress: '', notes: '',
});

const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function VehicleSalesView({ t, api, lang = 'en' }) {
  const { user } = useAuth();
  const T = vehicleSaleText(lang);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { sale, pdf, fileName, invoiceFailed }
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(null); // `${saleId}:download|whatsapp`
  const shopInfoRef = useRef(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const price = parseFloat(form.vehiclePrice);
  const advance = parseFloat(form.advanceAmount);
  const balance = Number.isFinite(price) ? Math.max(0, price - (Number.isFinite(advance) ? advance : 0)) : null;

  const loadRecent = useCallback(async () => {
    try {
      const rows = await api.getVehicleSales(20);
      setRecent(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error('Failed to load recent vehicle sales:', e);
    }
  }, [api]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  // Shop details printed in the invoice header - fetched once.
  const ensureShopInfo = async () => {
    if (shopInfoRef.current) return shopInfoRef.current;
    const res = await api.getSettings();
    let address = 'N/A';
    let phone = 'N/A';
    if (res.companyDetails) {
      try {
        const details = JSON.parse(res.companyDetails);
        address = details.address || 'N/A';
        phone = details.phone || 'N/A';
      } catch (e) { /* keep defaults */ }
    }
    shopInfoRef.current = { name: res.name, address, phone };
    return shopInfoRef.current;
  };

  const buildInvoice = async (sale) => {
    const shop = await ensureShopInfo();
    const { buildVehicleSaleInvoicePdf } = await import('../utils/vehicleSaleInvoicePdf');
    const pdf = await buildVehicleSaleInvoicePdf({ sale, shop, lang: sale.lang || lang, registeredByName: user?.name });
    const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const fileName = `DeliveryReceipt_${safe(sale.registrationNumber) || 'Vehicle'}_${safe(sale.saleNumber) || sale.id}.pdf`;
    return { pdf, fileName, shop };
  };

  const validate = () => {
    const required = [
      ['sellerName', T.seller], ['buyerName', T.buyer], ['registrationNumber', T.regNo],
    ];
    for (const [key, label] of required) {
      if (!String(form[key]).trim()) return fillText(T.errRequired, { field: label });
    }
    if (!(price > 0)) return T.errPrice;
    if (Number.isFinite(advance) && advance > price) return T.errAdvance;
    return '';
  };

  const handleSale = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setSaving(true);
    let sale;
    try {
      sale = await api.createVehicleSale({ ...form, lang });
    } catch (err) {
      setSaving(false);
      setError(fillText(T.saveFailed, { message: err.message }));
      return;
    }
    // The sale is saved at this point; the invoice is generated right away, but a rendering problem must not
    // lose the sale - it can be retried from "Recent sales".
    let built = null;
    try {
      built = await buildInvoice(sale);
    } catch (err) {
      console.error('Failed to generate the vehicle sale invoice:', err);
    }
    setSaving(false);
    setDone({ sale, pdf: built?.pdf || null, fileName: built?.fileName || null, invoiceFailed: !built });
    loadRecent();
  };

  const resetForNewSale = () => {
    setDone(null);
    setForm(emptyForm());
    setError('');
  };

  const downloadFor = async (sale, cached) => {
    const built = cached?.pdf ? cached : await buildInvoice(sale);
    await downloadPdf(built.pdf, built.fileName);
  };

  // App: opens WhatsApp in the buyer's chat with the PDF attached. Website: browsers can't attach files to a
  // WhatsApp chat, so the PDF is shared through the OS share sheet where available, otherwise downloaded and
  // a chat to the buyer is opened for the file to be attached by hand.
  const whatsappFor = async (sale, cached) => {
    const built = cached?.pdf ? cached : await buildInvoice(sale);
    const shopName = built.shop?.name || (await ensureShopInfo()).name || '';
    const text = `${T.receiptTitle} - ${sale.registrationNumber}${shopName ? ` (${shopName})` : ''}`;
    if (IS_NATIVE_APP) {
      await sendPdfToWhatsApp(built.pdf, built.fileName, { phone: sale.buyerPhone, title: T.receiptTitle, text });
      return;
    }
    const file = new File([built.pdf.output('blob')], built.fileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: T.receiptTitle, text });
      return;
    }
    await downloadPdf(built.pdf, built.fileName);
    const wa = toWhatsAppNumber(sale.buyerPhone);
    window.open(`https://${wa ? `wa.me/${wa}` : 'api.whatsapp.com/send'}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const run = (sale, kind, cached) => async () => {
    setBusy(`${sale.id}:${kind}`);
    try {
      if (kind === 'download') await downloadFor(sale, cached);
      else await whatsappFor(sale, cached);
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error(`Vehicle sale invoice ${kind} failed:`, err);
        window.alert(kind === 'whatsapp' ? T.whatsappFailed : T.invoiceFailed);
      }
    } finally {
      setBusy(null);
    }
  };

  const field = (key, label, { icon: Icon = FileText, required, type = 'text', inputMode, colour = 'var(--purple)', placeholder, full, half } = {}) => (
    <div className={half ? 'reg-field vs-half' : 'reg-field'} style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div className="reg-field-label">
        <div className="reg-ico" style={{ background: colour }}><Icon /></div>
        <b>{label}{required && <> <span className="req">*</span></>}</b>
      </div>
      <div className="input-wrap">
        <input type={type} inputMode={inputMode} value={form[key]} onChange={set(key)} placeholder={placeholder || ''} />
      </div>
    </div>
  );

  const section = (title, children) => (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 7px', letterSpacing: '.01em' }}>{title}</h3>
      <div className="form-grid">{children}</div>
    </div>
  );

  const spinner = <RefreshCw className="animate-spin h-4 w-4" />;

  return (
    <div className="animate-fade-in">
      <div className="page-head reg-wizard-head">
        <div>
          <div className="eyebrow"><Car /> {T.eyebrow}</div>
          <h1>{T.title}</h1>
          <p className="desc" style={{ marginTop: 6 }}>{T.subtitle}</p>
        </div>
      </div>

      <form className="card vs-form" onSubmit={handleSale} style={{ padding: 16 }} noValidate>
        {section(T.secReceipt, <>
          {field('saleDate', T.saleDate, { icon: Calendar, type: 'date', colour: 'var(--green)', half: true })}
          {field('saleTime', T.saleTime, { icon: Clock, type: 'time', colour: 'var(--orange)', half: true })}
        </>)}

        {section(T.secSeller, <>
          {field('sellerName', T.name, { icon: User, required: true })}
          {field('sellerPhone', T.phone, { icon: Phone, type: 'tel', inputMode: 'tel', colour: 'var(--orange)' })}
          {field('sellerAddress', T.address, { icon: MapPin, colour: 'var(--green)', full: true })}
        </>)}

        {section(T.secBuyer, <>
          {field('buyerName', T.name, { icon: User, required: true })}
          {field('buyerPhone', T.phone, { icon: Phone, type: 'tel', inputMode: 'tel', colour: 'var(--orange)' })}
          {field('buyerAddress', T.address, { icon: MapPin, colour: 'var(--green)', full: true })}
        </>)}

        {section(T.secVehicle, <>
          {field('registrationNumber', T.regNo, { icon: Car, required: true, colour: 'var(--blue)', half: true })}
          {field('vehicleName', T.vehicleName, { icon: Car, colour: 'var(--blue)', half: true })}
          {field('vehicleModel', T.model, { icon: Car, colour: 'var(--blue)', half: true })}
          {field('vehicleColor', T.colour, { icon: Palette, colour: 'var(--pink, #d6336c)', half: true })}
          {field('chassisNumber', T.chassisNo, { icon: Wrench, colour: 'var(--maroon)', half: true })}
          {field('engineNumber', T.engineNo, { icon: Wrench, colour: 'var(--maroon)', half: true })}
        </>)}

        {section(T.secPayment, <>
          {field('vehiclePrice', T.price, { icon: IndianRupee, required: true, type: 'number', inputMode: 'decimal', colour: 'var(--gold)', full: true })}
          {field('advanceAmount', T.advance, { icon: IndianRupee, type: 'number', inputMode: 'decimal', colour: 'var(--gold)', half: true })}
          <div className="reg-field vs-half">
            <div className="reg-field-label">
              <div className="reg-ico" style={{ background: 'var(--gold)' }}><IndianRupee /></div>
              <b>{T.balance}</b>
            </div>
            <div className="input-wrap">
              <input type="text" readOnly value={balance === null ? '' : inr(balance)} style={{ background: 'var(--card-2)', fontWeight: 800 }} aria-label={T.balance} />
            </div>
          </div>
          {field('officeCommission', T.commission, { icon: IndianRupee, type: 'number', inputMode: 'decimal', colour: 'var(--gold)', half: true })}
          {field('balanceLastDate', T.lastDate, { icon: Calendar, type: 'date', colour: 'var(--green)', half: true })}
        </>)}

        {section(T.secWitness, <>
          {field('witnessName', T.witnessName, { icon: UserCheck })}
          {field('witnessAddress', T.witnessAddress, { icon: MapPin, colour: 'var(--green)' })}
          {field('notes', T.notes, { icon: StickyNote, colour: 'var(--text-3)', full: true })}
        </>)}

        {error && (
          <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {saving ? <>{spinner} {T.saving}</> : <><Car className="h-4 w-4" /> {T.sale}</>}
        </button>
      </form>

      <div className="card" style={{ marginTop: 22, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 14px' }}>{T.recentSales}</h3>
        {recent.length === 0 ? (
          <p className="desc" style={{ margin: 0 }}>{T.noSales}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recent.map((sale) => (
              <div key={sale.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{sale.registrationNumber} <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>· {sale.saleNumber}</span></div>
                  <div className="cell-sub" style={{ marginTop: 2 }}>
                    {T.buyerShort}: {sale.buyerName} · {sale.saleDate} · Rs. {inr(sale.vehiclePrice)} · {T.balanceShort}: Rs. {inr(sale.balanceAmount)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm" disabled={busy === `${sale.id}:download`} onClick={run(sale, 'download')}>
                    {busy === `${sale.id}:download` ? spinner : <Download className="h-4 w-4" />} <span>{T.invoiceBtn}</span>
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === `${sale.id}:whatsapp`} onClick={run(sale, 'whatsapp')} style={{ background: '#25D366', borderColor: '#25D366' }} aria-label={T.sendBuyer}>
                    {busy === `${sale.id}:whatsapp` ? spinner : <MessageCircle className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {done && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,4,3,0.72)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 380, padding: 28, textAlign: 'center' }}>
            <div className="icon-badge jgreen" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px' }}>
              <CheckCircle2 style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ marginBottom: 8 }}>{T.successTitle}</h3>
            <p className="desc" style={{ marginBottom: 6 }}>{done.sale.registrationNumber} · {done.sale.saleNumber}</p>
            <p className="desc" style={{ marginBottom: 18 }}>{done.invoiceFailed ? T.invoiceFailed : T.successDesc}</p>
            {!done.invoiceFailed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                <button type="button" className="btn btn-outline" disabled={busy === `${done.sale.id}:download`} onClick={run(done.sale, 'download', done)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {busy === `${done.sale.id}:download` ? spinner : <Download style={{ width: 16, height: 16 }} />} {T.downloadInvoice}
                </button>
                <button type="button" className="btn btn-outline" disabled={busy === `${done.sale.id}:whatsapp`} onClick={run(done.sale, 'whatsapp', done)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {busy === `${done.sale.id}:whatsapp` ? spinner : <MessageCircle style={{ width: 16, height: 16 }} />} {T.sendBuyer}
                </button>
              </div>
            )}
            <button type="button" className="btn btn-primary" onClick={resetForNewSale} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Plus style={{ width: 16, height: 16 }} /> {T.newSale}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default VehicleSalesView;
