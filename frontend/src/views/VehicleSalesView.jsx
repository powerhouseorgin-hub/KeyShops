import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Car, User, Phone, MapPin, IndianRupee, Calendar, Clock, FileText, Download, RefreshCw,
  MessageCircle, Plus, CheckCircle2, Palette, Wrench, StickyNote, UserCheck, ImagePlus, X, Languages,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { vehicleSaleText, fillText } from '../i18n/vehicleSaleText';
import { downloadPdf, sendPdfToWhatsApp } from '../utils/pdfDelivery';
import { IS_NATIVE_APP } from '../utils/platform';
import { toWhatsAppNumber } from '../utils/phone';
import { resizeImageFileToBlob } from '../utils/imageUtils';
import ImageZoomViewer from '../components/ImageZoomViewer';
import VehicleSaleDetail from '../components/VehicleSaleDetail';
import SignaturePad from '../components/SignaturePad';

// Vehicle Sales: record a bike/car sale and generate the "Delivery Receipt" invoice for the buyer.
// Everything on screen follows the app language (vehicleSaleText.js); the invoice is generated in the language
// that was selected when Sale was pressed, and that language is stored with the sale so re-downloading it later
// prints the same document. The invoice language is chosen on this screen (default Tamil), independent of the app
// language. Tapping a sale in Recent sales opens a read-only details screen (VehicleSaleDetail). Up to 5 photos can be attached: they are resized in the browser, then uploaded one by one to the saved
// sale (the server also refuses a 6th). The seller and the buyer each sign on a signature pad (both are required); the signatures are saved
// with the sale like the photos and both are printed on the receipt, with the photos on a second page. The receipt number is not entered here: the server generates a unique one for every sale.
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

const MAX_PHOTOS = 5;
const DEFAULT_INVOICE_LANG = 'ta';
// Shown in each language's own script so a shop owner can always find theirs.
const INVOICE_LANGS = [
  ['ta', 'தமிழ்'], ['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'],
];

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
  const fileInputRef = useRef(null);
  const [invoiceLang, setInvoiceLang] = useState(DEFAULT_INVOICE_LANG);
  const [photos, setPhotos] = useState([]); // [{ id, file, preview }] chosen but not yet uploaded
  const [photoMsg, setPhotoMsg] = useState('');
  const [sigs, setSigs] = useState({ seller: null, buyer: null }); // each null or { blob, preview } once saved on its pad
  const [progress, setProgress] = useState(null); // { done, total } while photos upload
  const [viewer, setViewer] = useState(null); // { images, index }
  const [detail, setDetail] = useState(null); // the sale whose read-only details screen is open
  const photosRef = useRef([]);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);
  const sigsRef = useRef(sigs);
  sigsRef.current = sigs;
  useEffect(() => () => Object.values(sigsRef.current).forEach((x) => x && URL.revokeObjectURL(x.preview)), []);
  // stored url -> local object URL for the photos / signatures just uploaded, so the receipt is drawn without downloading them again
  const localUrlsRef = useRef({});
  const setSig = (party) => (value) => setSigs((cur) => ({ ...cur, [party]: value }));

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
    if (user?.role === 'SUPER_ADMIN') {
      // A Super Admin has no shop: the sale (and its invoice header) is under the Super Admin's own name.
      shopInfoRef.current = { name: user.name || 'Super Admin', address: 'N/A', phone: user.phone || 'N/A' };
      return shopInfoRef.current;
    }
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
    const pdf = await buildVehicleSaleInvoicePdf({ sale, shop, lang: sale.lang || lang, registeredByName: user?.name, localUrls: localUrlsRef.current });
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
    if (!sigs.seller || !sigs.buyer) return T.errSignatures;
    return '';
  };

  // Adds the chosen images, never going past MAX_PHOTOS: the picker may return more than the free slots, in which
  // case the extra ones are ignored and the user is told why.
  const onPickPhotos = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    const images = picked.filter((f) => /^image\//.test(f.type));
    let message = images.length < picked.length ? T.onlyImages : '';
    const room = MAX_PHOTOS - photos.length;
    if (images.length > room) message = T.maxPhotos;
    const accepted = images.slice(0, Math.max(0, room)).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, preview: URL.createObjectURL(file),
    }));
    setPhotoMsg(message);
    if (accepted.length) setPhotos((p) => [...p, ...accepted]);
  };

  const removePhoto = (id) => {
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((p) => p.id !== id);
    });
    setPhotoMsg('');
  };

  // Uploads files one after another to a saved sale. Returns the sale's photo list as the server last reported it
  // and the files that failed (so they can be retried). A failure never aborts the rest.
  const uploadPhotos = async (saleId, files, knownPhotos = []) => {
    let current = knownPhotos;
    const failed = [];
    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i += 1) {
      try {
        const blob = await resizeImageFileToBlob(files[i], 1280, 0.82);
        const result = await api.addVehicleSalePhoto(saleId, new File([blob], `sale-photo-${i + 1}.jpg`, { type: 'image/jpeg' }));
        if (Array.isArray(result?.photos)) {
          current = result.photos;
          const added = current[current.length - 1];
          if (added?.url) localUrlsRef.current[added.url] = URL.createObjectURL(blob);
        }
      } catch (err) {
        console.error('Photo upload failed:', err);
        failed.push(files[i]);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    return { photos: current, failed };
  };

  // Uploads the saved signatures ([[party, { blob }], ...]) to a saved sale. Returns the signature fields as the server last
  // reported them and the entries that failed (so they can be retried). A failure never aborts the other one.
  const uploadSignatures = async (saleId, entries) => {
    const fields = {};
    const failed = [];
    for (const [party, sig] of entries) {
      try {
        const result = await api.addVehicleSaleSignature(saleId, party, new File([sig.blob], `${party}-signature.png`, { type: 'image/png' }));
        if (result?.sellerSignature) fields.sellerSignature = result.sellerSignature;
        if (result?.buyerSignature) fields.buyerSignature = result.buyerSignature;
        const stored = party === 'seller' ? result?.sellerSignature : result?.buyerSignature;
        if (stored?.url) localUrlsRef.current[stored.url] = sig.preview;
      } catch (err) {
        console.error('Signature upload failed:', err);
        failed.push([party, sig]);
      }
    }
    return { fields, failed };
  };

  const handleSale = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setSaving(true);
    let sale;
    try {
      sale = await api.createVehicleSale({ ...form, lang: invoiceLang });
    } catch (err) {
      setSaving(false);
      setError(fillText(T.saveFailed, { message: err.message }));
      return;
    }
    // The sale is saved at this point. Photos are attached next (a failed photo never loses the sale and can be
    // retried from the success dialog), then the invoice is generated; a rendering problem must not lose the sale
    // either - it can be retried from "Recent sales".
    let failedFiles = [];
    if (photos.length) {
      const result = await uploadPhotos(sale.id, photos.map((p) => p.file));
      sale = { ...sale, photos: result.photos };
      failedFiles = result.failed;
    }
    const signed = await uploadSignatures(sale.id, [['seller', sigs.seller], ['buyer', sigs.buyer]]);
    sale = { ...sale, ...signed.fields };
    const failedSigs = signed.failed;
    let built = null;
    try {
      built = await buildInvoice(sale);
    } catch (err) {
      console.error('Failed to generate the vehicle sale invoice:', err);
    }
    setSaving(false);
    setDone({ sale, pdf: built?.pdf || null, fileName: built?.fileName || null, invoiceFailed: !built, failedFiles, failedSigs, photoTotal: photos.length });
    loadRecent();
  };

  // Retries whatever failed to upload (photos and/or signatures), then builds the receipt again so it includes them.
  const retryUploads = async () => {
    if (!done || (!done.failedFiles.length && !done.failedSigs.length && !done.invoiceFailed)) return;
    setSaving(true);
    let { sale, failedFiles, failedSigs } = done;
    if (failedFiles.length) {
      const result = await uploadPhotos(sale.id, failedFiles, sale.photos || []);
      sale = { ...sale, photos: result.photos };
      failedFiles = result.failed;
    }
    if (failedSigs.length) {
      const result = await uploadSignatures(sale.id, failedSigs);
      sale = { ...sale, ...result.fields };
      failedSigs = result.failed;
    }
    let built = null;
    try {
      built = await buildInvoice(sale);
    } catch (err) {
      console.error('Failed to generate the vehicle sale invoice:', err);
    }
    setSaving(false);
    setDone((d) => ({ ...d, sale, failedFiles, failedSigs, pdf: built?.pdf || null, fileName: built?.fileName || null, invoiceFailed: !built }));
    loadRecent();
  };

  const resetForNewSale = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setPhotoMsg('');
    Object.values(sigs).forEach((x) => x && URL.revokeObjectURL(x.preview));
    setSigs({ seller: null, buyer: null });
    // (signature previews are in this map too - already revoked above; revoking twice is harmless)
    Object.values(localUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    localUrlsRef.current = {};
    setInvoiceLang(DEFAULT_INVOICE_LANG);
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
    let built = cached;
    if (!built?.pdf) {
      try { built = await buildInvoice(sale); } catch (err) { err.stage = 'build'; throw err; }
    }
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
        // The invoice itself could not be made (an image could not be loaded, ...) vs WhatsApp could not be opened: say which,
        // and show the reason so a failure can be diagnosed from a screenshot.
        const base = kind === 'whatsapp' && err?.stage !== 'build' ? T.whatsappFailed : T.invoiceFailed;
        window.alert(`${base}\n(${String(err?.message || err).slice(0, 160)})`);
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

        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 3px', letterSpacing: '.01em' }}>
            {T.photosTitle} <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: 12 }}>· {fillText(T.photosCount, { count: photos.length, max: MAX_PHOTOS })}</span>
          </h3>
          <p className="cell-sub" style={{ margin: '0 0 8px' }}>{T.photosHint}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
            {photos.map((p, i) => (
              <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                <img src={p.preview} alt="" onClick={() => setViewer({ images: photos.map((x) => x.preview), index: i })} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
                <button type="button" onClick={() => removePhoto(p.id)} aria-label={T.removePhoto} disabled={saving}
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,.62)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                  <X size={13} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}
                style={{ aspectRatio: '1', borderRadius: 10, border: '1.5px dashed var(--border-2)', background: 'var(--card-2)', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 4 }}>
                <ImagePlus size={20} /> {T.addPhoto}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: 'none' }} />
          {photoMsg && <p role="alert" style={{ color: '#8A1C1C', fontSize: 12, fontWeight: 700, margin: '8px 0 0' }}>{photoMsg}</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 8px', letterSpacing: '.01em' }}>{T.signaturesTitle} <span className="req">*</span></h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
            <SignaturePad label={T.sellerSign} value={sigs.seller} onChange={setSig('seller')} T={T} disabled={saving} />
            <SignaturePad label={T.buyerSign} value={sigs.buyer} onChange={setSig('buyer')} T={T} disabled={saving} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 3px', letterSpacing: '.01em' }}>{T.invoiceLanguage}</h3>
          <p className="cell-sub" style={{ margin: '0 0 6px' }}>{T.invoiceLanguageHint}</p>
          <div className="input-wrap">
            <select value={invoiceLang} onChange={(e) => setInvoiceLang(e.target.value)} aria-label={T.invoiceLanguage} disabled={saving}>
              {INVOICE_LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {saving ? <>{spinner} {progress ? fillText(T.photosUploading, progress) : T.saving}</> : <><Car className="h-4 w-4" /> {T.sale}</>}
        </button>
      </form>

      <div className="card" style={{ marginTop: 22, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 14px' }}>{T.recentSales}</h3>
        {recent.length === 0 ? (
          <p className="desc" style={{ margin: 0 }}>{T.noSales}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recent.map((sale) => (
              <div key={sale.id} role="button" tabIndex={0} aria-label={`${T.detailsTitle}: ${sale.registrationNumber}`}
                onClick={() => setDetail(sale)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(sale); } }}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{sale.registrationNumber} <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>· {sale.saleNumber}</span></div>
                  {Array.isArray(sale.photos) && sale.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                      {sale.photos.map((p, i) => (
                        <img key={p.key || i} src={p.url} alt="" loading="lazy"
                          onClick={(e) => { e.stopPropagation(); setViewer({ images: sale.photos.map((x) => x.url), index: i }); }}
                          style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border-2)', cursor: 'zoom-in' }} />
                      ))}
                    </div>
                  )}
                  <div className="cell-sub" style={{ marginTop: 2 }}>
                    {T.buyerShort}: {sale.buyerName} · {sale.saleDate} · Rs. {inr(sale.vehiclePrice)} · {T.balanceShort}: Rs. {inr(sale.balanceAmount)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm" disabled={busy === `${sale.id}:download`} onClick={(e) => { e.stopPropagation(); run(sale, 'download')(); }}>
                    {busy === `${sale.id}:download` ? spinner : <Download className="h-4 w-4" />} <span>{T.invoiceBtn}</span>
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === `${sale.id}:whatsapp`} onClick={(e) => { e.stopPropagation(); run(sale, 'whatsapp')(); }} style={{ background: '#25D366', borderColor: '#25D366' }} aria-label={T.sendBuyer}>
                    {busy === `${sale.id}:whatsapp` ? spinner : <MessageCircle className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <VehicleSaleDetail
          sale={detail}
          T={T}
          languageName={(INVOICE_LANGS.find(([code]) => code === detail.lang) || [null, detail.lang])[1]}
          busy={busy}
          onClose={() => setDetail(null)}
          onDownload={run(detail, 'download')}
          onWhatsApp={run(detail, 'whatsapp')}
          onOpenPhoto={(images, index) => setViewer({ images, index })}
        />
      )}

      {viewer && <ImageZoomViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />}

      {done && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,4,3,0.72)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 380, padding: 28, textAlign: 'center' }}>
            <div className="icon-badge jgreen" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px' }}>
              <CheckCircle2 style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ marginBottom: 8 }}>{T.successTitle}</h3>
            <p className="desc" style={{ marginBottom: 6 }}>{done.sale.registrationNumber} · {done.sale.saleNumber}</p>
            <p className="desc" style={{ marginBottom: done.photoTotal ? 8 : 18 }}>{done.invoiceFailed ? T.invoiceFailed : T.successDesc}</p>
            {(done.photoTotal > 0 || done.failedSigs.length > 0 || done.invoiceFailed) && (
              <div style={{ marginBottom: 18 }}>
                {(done.sale.photos || []).length > 0 && (
                  <p className="desc" style={{ margin: '0 0 4px' }}>{fillText(T.photosAttached, { count: (done.sale.photos || []).length })}</p>
                )}
                {done.invoiceFailed && done.failedFiles.length === 0 && done.failedSigs.length === 0 && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={retryUploads} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {saving ? spinner : <RefreshCw className="h-4 w-4" />} {T.retryInvoice}
                  </button>
                )}
                {done.failedFiles.length > 0 && (
                  <p role="alert" style={{ color: '#8A1C1C', fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>
                    {fillText(T.photosPartial, { failed: done.failedFiles.length, total: done.photoTotal })}
                  </p>
                )}
                {done.failedSigs.length > 0 && (
                  <p role="alert" style={{ color: '#8A1C1C', fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>
                    {fillText(T.signaturesPartial, { failed: done.failedSigs.length })}
                  </p>
                )}
                {(done.failedFiles.length > 0 || done.failedSigs.length > 0) && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={retryUploads} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {saving ? spinner : <RefreshCw className="h-4 w-4" />} {saving && progress ? fillText(T.photosUploading, progress) : T.retryUploads}
                  </button>
                )}
              </div>
            )}
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
