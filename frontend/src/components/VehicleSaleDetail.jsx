import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Download, MessageCircle, RefreshCw } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

// Read-only "Sale details" screen: every detail that was recorded, laid out in sections, plus the sale's photos and the seller's and
// buyer's signatures (tap one to zoom). Nothing here is editable - values are plain text.
//
// Speed: the lists carry a light copy of each sale (no inline images). On opening, this screen asks for the sale in full - one request that
// brings small inline thumbnails of the photos and the signatures themselves - and shows grey placeholders until it arrives, so the page
// is usable at once and the pictures appear (fading in) without waiting for separate file downloads. Sales saved before thumbnails
// existed fall back to loading the stored file. The zoom viewer opens the full-size photo.
//
// Actions (footer): Download Invoice, and either Send Invoice (WhatsApp to the seller AND the buyer; All Sales) or the older "share with
// the buyer" button (Recent sales).
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, value, full }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: empty ? 'var(--text-3)' : 'var(--text-0)', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{empty ? '—' : value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 10px', letterSpacing: '.01em' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 14px' }}>{children}</div>
    </section>
  );
}

// An image that shows a pulsing placeholder until it has loaded, then fades in. `src` null = still waiting for the address.
function Pic({ src, alt, fit = 'cover', priority = false }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { setOk(false); }, [src]);
  return (
    <>
      {!ok && <div className="animate-pulse" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--border)' }} />}
      {src && (
        <img
          src={src} alt={alt} decoding="async" loading={priority ? 'eager' : 'lazy'} fetchpriority={priority ? 'high' : 'auto'}
          onLoad={() => setOk(true)} onError={() => setOk(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, display: 'block', opacity: ok ? 1 : 0, transition: 'opacity .2s ease' }}
        />
      )}
    </>
  );
}

export default function VehicleSaleDetail({
  sale, T, languageName, busy, onClose, onDownload, onWhatsApp, onSendInvoice, onOpenPhoto, showOwner = false, hideActions = false, api,
}) {
  useBackHandler(true, onClose);
  const spinner = <RefreshCw className="animate-spin h-4 w-4" />;

  // the full record (inline thumbnails + signatures); `ready` once that request has finished, successfully or not
  const [full, setFull] = useState(null);
  const [ready, setReady] = useState(!api?.getVehicleSaleFull);
  useEffect(() => {
    if (!api?.getVehicleSaleFull) return undefined;
    let cancelled = false;
    setFull(null);
    setReady(false);
    api.getVehicleSaleFull(sale)
      .then((f) => { if (!cancelled) setFull(f); })
      .catch((e) => console.error('Failed to load the full sale record:', e))
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.id, sale.path, api]);

  // the screen's own copy of the sale wins for every plain field (the parent keeps e.g. the delivery status up to date); the images
  // come from the full record when it has them
  const view = {
    ...sale,
    photos: full?.photos ?? sale.photos,
    sellerSignature: full?.sellerSignature ?? sale.sellerSignature,
    buyerSignature: full?.buyerSignature ?? sale.buyerSignature,
  };
  const photos = Array.isArray(view.photos) ? view.photos : [];
  const delivery = view.invoiceDelivery || null;

  const reasonText = (d) => (d.reason === 'NO_PHONE' ? T.reasonNoPhone : d.reason === 'INVALID_PHONE' ? T.reasonInvalidPhone : d.message || T.sendFailed);
  const deliveryLine = (party) => {
    const d = delivery?.[party];
    if (!d) return T.notSentYet;
    return d.sent ? `${T.sentOk} ✓` : `${T.sendFailed}: ${reasonText(d)}`;
  };

  const sigBox = (label, sig) => (
    <div key={label} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      {!ready && !sig?.data ? (
        <div style={{ position: 'relative', height: 110, border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}><Pic src={null} alt="" /></div>
      ) : sig?.url || sig?.data ? (
        <button type="button" onClick={() => onOpenPhoto([sig.data || sig.url], 0)} aria-label={label}
          style={{ position: 'relative', width: '100%', height: 110, padding: 0, border: '1px solid var(--border-2)', borderRadius: 12, background: '#fff', cursor: 'zoom-in', overflow: 'hidden', display: 'block' }}>
          <Pic src={sig.data || sig.url} alt={label} fit="contain" priority />
        </button>
      ) : (
        <div style={{ height: 110, border: '1px dashed var(--border-2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, fontWeight: 700 }}>{T.noSignature}</div>
      )}
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={T.detailsTitle}
      style={{ position: 'fixed', inset: 0, zIndex: 60000, background: 'var(--bg-0, #FBF7F0)', display: 'flex', flexDirection: 'column' }}
    >
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border-2)', background: 'var(--card)', flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label={T.back}
          style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--border-2)', background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{T.detailsTitle}</div>
          <div style={{ fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{view.registrationNumber}</div>
        </div>
      </header>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 14 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Section title={T.secReceipt}>
            <Field label={T.receiptNo} value={view.saleNumber} full />
            {showOwner && (
              <Field label={T.soldBy} value={view.ownerType === 'SUPER_ADMIN' ? `${view.ownerName || T.superAdminOwner} (${T.superAdminOwner})` : view.ownerName} full />
            )}
            <Field label={T.saleDate} value={view.saleDate} />
            <Field label={T.saleTime} value={view.saleTime} />
            <Field label={T.invoiceLanguage} value={languageName} full />
          </Section>

          <Section title={T.secSeller}>
            <Field label={T.name} value={view.sellerName} />
            <Field label={T.phone} value={view.sellerPhone} />
            <Field label={T.address} value={view.sellerAddress} full />
          </Section>

          <Section title={T.secBuyer}>
            <Field label={T.name} value={view.buyerName} />
            <Field label={T.phone} value={view.buyerPhone} />
            <Field label={T.address} value={view.buyerAddress} full />
          </Section>

          <Section title={T.secVehicle}>
            <Field label={T.regNo} value={view.registrationNumber} />
            <Field label={T.colour} value={view.vehicleColor} />
            <Field label={T.vehicleName} value={view.vehicleName} />
            <Field label={T.model} value={view.vehicleModel} />
            <Field label={T.chassisNo} value={view.chassisNumber} />
            <Field label={T.engineNo} value={view.engineNumber} />
          </Section>

          <Section title={T.secPayment}>
            <Field label={T.price} value={`Rs. ${inr(view.vehiclePrice)}`} full />
            <Field label={T.advance} value={`Rs. ${inr(view.advanceAmount)}`} />
            <Field label={T.balance} value={`Rs. ${inr(view.balanceAmount)}`} />
            <Field label={T.commission} value={view.officeCommission === null || view.officeCommission === undefined ? '' : `Rs. ${inr(view.officeCommission)}`} />
            <Field label={T.lastDate} value={view.balanceLastDate} />
          </Section>

          <Section title={T.secWitness}>
            <Field label={T.witnessName} value={view.witnessName} />
            <Field label={T.witnessAddress} value={view.witnessAddress} />
            <Field label={T.notes} value={view.notes} full />
          </Section>

          <section style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 10px' }}>
              {T.photosTitle} <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: 12 }}>· {photos.length}</span>
            </h3>
            {photos.length === 0 ? (
              <p className="cell-sub" style={{ margin: 0 }}>{T.noPhotos}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                {photos.map((p, i) => (
                  <button key={p.key || i} type="button" onClick={() => onOpenPhoto(photos.map((x) => x.url), i, photos.map((x) => x.thumb || null))} aria-label={`${T.photosTitle} ${i + 1}`}
                    style={{ position: 'relative', padding: 0, border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden', aspectRatio: '1', background: 'var(--card-2)', cursor: 'zoom-in' }}>
                    {/* the inline thumbnail when there is one; a photo saved before thumbnails existed loads its stored file instead */}
                    <Pic src={p.thumb || (ready ? p.url : null)} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 10px' }}>{T.signaturesTitle}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {sigBox(T.sellerSign, view.sellerSignature)}
              {sigBox(T.buyerSign, view.buyerSignature)}
            </div>
          </section>

          {onSendInvoice && (
            <section style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 8px' }}>{T.deliveryTitle}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 14px', fontSize: 13, fontWeight: 700 }}>
                {['seller', 'buyer'].map((party) => (
                  <div key={party} style={{ minWidth: 0, overflowWrap: 'anywhere', color: delivery?.[party]?.sent ? 'var(--green)' : delivery?.[party] ? '#B3261E' : 'var(--text-3)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{party === 'seller' ? T.seller : T.buyer}: </span>{deliveryLine(party)}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* actions */}
      {!hideActions && (
        <footer style={{ display: 'flex', gap: 10, padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-2)', background: 'var(--card)', flexShrink: 0 }}>
          <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" disabled={busy === `${sale.id}:download`} onClick={() => onDownload(view)} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25, padding: '10px 8px', fontSize: 13 }}>
              {busy === `${sale.id}:download` ? spinner : <Download className="h-4 w-4" />} {T.downloadInvoice}
            </button>
            {onSendInvoice ? (
              <button type="button" className="btn btn-primary" disabled={busy === `${sale.id}:send`} onClick={() => onSendInvoice(view)} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25, padding: '10px 8px', fontSize: 13, background: '#25D366', borderColor: '#25D366' }}>
                {busy === `${sale.id}:send` ? spinner : <MessageCircle className="h-4 w-4" />} {T.sendInvoice}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy === `${sale.id}:whatsapp`} onClick={() => onWhatsApp(view)} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25, padding: '10px 8px', fontSize: 13, background: '#25D366', borderColor: '#25D366' }}>
                {busy === `${sale.id}:whatsapp` ? spinner : <MessageCircle className="h-4 w-4" />} {T.sendBuyer}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>,
    document.body,
  );
}
