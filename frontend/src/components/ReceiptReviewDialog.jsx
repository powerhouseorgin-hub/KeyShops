import React from 'react';
import { createPortal } from 'react-dom';
import { Car, ChevronLeft, RefreshCw } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

// "Review" before saving a vehicle sale: a full-screen preview of the receipt exactly as it will be printed (each page rendered from what is
// on the form - details, photos, signatures, in the chosen language). Nothing is saved or sent from here: *Edit* goes back to the form,
// *Sale* (the confirm button) saves the sale. `state`: { loading, pages (JPEG data URLs), error }.
export default function ReceiptReviewDialog({ state, T, saving, onEdit, onConfirm }) {
  useBackHandler(true, onEdit);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={T.receiptReviewTitle}
      style={{ position: 'fixed', inset: 0, zIndex: 60000, background: 'var(--bg-0, #FBF7F0)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border-2)', background: 'var(--card)', flexShrink: 0 }}>
        <button type="button" onClick={onEdit} aria-label={T.receiptReviewEdit}
          style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--border-2)', background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{T.receiptReviewTitle}</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 14 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <p className="desc" style={{ margin: '0 0 12px' }}>{T.receiptReviewHint}</p>
          {state.loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 0', color: 'var(--text-3)', fontWeight: 700 }}>
              <RefreshCw className="animate-spin" size={26} /> {T.receiptReviewBuilding}
            </div>
          )}
          {!state.loading && state.error && (
            <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>{T.receiptReviewFailed}</div>
          )}
          {state.pages.map((src, i) => (
            <img key={i} src={src} alt={`${T.receiptTitle} ${i + 1}`}
              style={{ width: '100%', height: 'auto', display: 'block', marginBottom: 12, background: '#fff', border: '1px solid var(--border-2)', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.08)' }} />
          ))}
        </div>
      </div>

      <footer style={{ display: 'flex', gap: 10, padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-2)', background: 'var(--card)', flexShrink: 0 }}>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={onEdit} disabled={saving} style={{ flex: '1 1 0' }}>{T.receiptReviewEdit}</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving || state.loading} style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <RefreshCw className="animate-spin h-4 w-4" /> : <Car className="h-4 w-4" />} {T.sale}
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
