import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Download, MessageCircle, RefreshCw } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

// Read-only "Sale details" screen opened by tapping a sale in Recent sales: every detail that was recorded, laid out
// in sections, plus the sale's photos in a grid (tap one to zoom). Nothing here is editable - values are plain text.
// The only actions are the same two the list has: download the invoice or send it to the buyer on WhatsApp.
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

export default function VehicleSaleDetail({ sale, T, languageName, busy, onClose, onDownload, onWhatsApp, onOpenPhoto, showOwner = false, hideActions = false }) {
  useBackHandler(true, onClose);
  const photos = Array.isArray(sale.photos) ? sale.photos : [];
  const spinner = <RefreshCw className="animate-spin h-4 w-4" />;

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
          <div style={{ fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{sale.registrationNumber}</div>
        </div>
      </header>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 14 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Section title={T.secReceipt}>
            <Field label={T.receiptNo} value={sale.saleNumber} full />
            {showOwner && (
              <Field label={T.soldBy} value={sale.ownerType === 'SUPER_ADMIN' ? `${sale.ownerName || T.superAdminOwner} (${T.superAdminOwner})` : sale.ownerName} full />
            )}
            <Field label={T.saleDate} value={sale.saleDate} />
            <Field label={T.saleTime} value={sale.saleTime} />
            <Field label={T.invoiceLanguage} value={languageName} full />
          </Section>

          <Section title={T.secSeller}>
            <Field label={T.name} value={sale.sellerName} />
            <Field label={T.phone} value={sale.sellerPhone} />
            <Field label={T.address} value={sale.sellerAddress} full />
          </Section>

          <Section title={T.secBuyer}>
            <Field label={T.name} value={sale.buyerName} />
            <Field label={T.phone} value={sale.buyerPhone} />
            <Field label={T.address} value={sale.buyerAddress} full />
          </Section>

          <Section title={T.secVehicle}>
            <Field label={T.regNo} value={sale.registrationNumber} />
            <Field label={T.colour} value={sale.vehicleColor} />
            <Field label={T.vehicleName} value={sale.vehicleName} />
            <Field label={T.model} value={sale.vehicleModel} />
            <Field label={T.chassisNo} value={sale.chassisNumber} />
            <Field label={T.engineNo} value={sale.engineNumber} />
          </Section>

          <Section title={T.secPayment}>
            <Field label={T.price} value={`Rs. ${inr(sale.vehiclePrice)}`} full />
            <Field label={T.advance} value={`Rs. ${inr(sale.advanceAmount)}`} />
            <Field label={T.balance} value={`Rs. ${inr(sale.balanceAmount)}`} />
            <Field label={T.commission} value={sale.officeCommission === null || sale.officeCommission === undefined ? '' : `Rs. ${inr(sale.officeCommission)}`} />
            <Field label={T.lastDate} value={sale.balanceLastDate} />
          </Section>

          <Section title={T.secWitness}>
            <Field label={T.witnessName} value={sale.witnessName} />
            <Field label={T.witnessAddress} value={sale.witnessAddress} />
            <Field label={T.notes} value={sale.notes} full />
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
                  <button key={p.key || i} type="button" onClick={() => onOpenPhoto(photos.map((x) => x.url), i)}
                    style={{ padding: 0, border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden', aspectRatio: '1', background: 'var(--card-2)', cursor: 'zoom-in' }}>
                    <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--maroon)', margin: '0 0 10px' }}>{T.signaturesTitle}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {[[T.sellerSign, sale.sellerSignature], [T.buyerSign, sale.buyerSignature]].map(([label, sig]) => (
                <div key={label} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
                  {sig?.url ? (
                    <button type="button" onClick={() => onOpenPhoto([sig.url], 0)}
                      style={{ width: '100%', height: 110, padding: 8, border: '1px solid var(--border-2)', borderRadius: 12, background: '#fff', cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={sig.url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </button>
                  ) : (
                    <div style={{ height: 110, border: '1px dashed var(--border-2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, fontWeight: 700 }}>{T.noSignature}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* actions */}
      {!hideActions && <footer style={{ display: 'flex', gap: 10, padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-2)', background: 'var(--card)', flexShrink: 0 }}>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" disabled={busy === `${sale.id}:download`} onClick={onDownload} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25, padding: '10px 8px', fontSize: 13 }}>
            {busy === `${sale.id}:download` ? spinner : <Download className="h-4 w-4" />} {T.downloadInvoice}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy === `${sale.id}:whatsapp`} onClick={onWhatsApp} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25, padding: '10px 8px', fontSize: 13, background: '#25D366', borderColor: '#25D366' }}>
            {busy === `${sale.id}:whatsapp` ? spinner : <MessageCircle className="h-4 w-4" />} {T.sendBuyer}
          </button>
        </div>
      </footer>}
    </div>,
    document.body,
  );
}
