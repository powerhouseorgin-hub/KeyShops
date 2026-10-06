import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, MessageCircle, RefreshCw, X, XCircle } from 'lucide-react';

// The result of "Send Invoice": the receipt goes to the seller and the buyer on WhatsApp at the same time, and this dialog says, for
// EACH of them, whether it was sent - and if not, why - so a failure for one never hides the success of the other. A failed recipient can
// be retried on its own. `state`: { phase: 'sending' | 'result' | 'blocked' | 'error', sale, results, message }.
const PARTIES = ['seller', 'buyer'];

export default function SendInvoiceDialog({ state, T, onRetry, onClose }) {
  if (!state) return null;
  const { phase, sale, results = {}, message } = state;
  // only the people the invoice was sent to (the buyer, the seller or both) get a row
  const shown = PARTIES.filter((p) => !state.requested || state.requested.includes(p) || results[p]);
  const sending = phase === 'sending';
  const failed = PARTIES.filter((p) => results[p] && !results[p].sent);
  // only a delivery that failed can be retried; a missing / invalid number needs fixing on the sale first
  const retryable = failed.filter((p) => results[p].reason === 'SEND_FAILED');
  const allSent = phase === 'result' && shown.length > 0 && shown.every((p) => results[p]?.sent);

  const reasonText = (r) => {
    if (!r || r.sent) return '';
    if (r.reason === 'NO_PHONE') return T.reasonNoPhone;
    if (r.reason === 'INVALID_PHONE') return T.reasonInvalidPhone;
    return r.message || T.sendFailed;
  };

  const row = (party) => {
    const r = results[party];
    const name = party === 'seller' ? sale.sellerName : sale.buyerName;
    const phone = party === 'seller' ? sale.sellerPhone : sale.buyerPhone;
    return (
      <div key={party} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid var(--border-2)', borderRadius: 12, background: 'var(--card)' }}>
        <div style={{ flexShrink: 0, marginTop: 1 }}>
          {sending || !r ? <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--text-3)' }} />
            : r.sent ? <CheckCircle2 size={20} style={{ color: 'var(--green)' }} /> : <XCircle size={20} style={{ color: '#B3261E' }} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{party === 'seller' ? T.seller : T.buyer}{name ? ` · ${name}` : ''}</div>
          <div className="cell-sub" style={{ marginTop: 1 }}>{phone ? `+91 ${String(phone).replace(/\D/g, '').slice(-10)}` : '—'}</div>
          {!sending && r && (
            <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 700, color: r.sent ? 'var(--green)' : '#B3261E', overflowWrap: 'anywhere' }}>
              {r.sent ? T.sentOk : `${T.sendFailed}: ${reasonText(r)}`}
            </div>
          )}
        </div>
      </div>
    );
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={T.sendInvoiceTitle} style={{ position: 'fixed', inset: 0, zIndex: 70000, background: 'rgba(5,4,3,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 400, padding: 22, position: 'relative' }}>
        {!sending && (
          <button type="button" onClick={onClose} aria-label={T.closeLabel} className="icon-btn" style={{ position: 'absolute', top: 12, right: 12 }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingRight: 28 }}>
          <div className="icon-badge jgreen" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }}><MessageCircle style={{ width: 20, height: 20 }} /></div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{T.sendInvoiceTitle}</h3>
        </div>

        {phase === 'blocked' && <p role="alert" style={{ color: '#8A1C1C', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{T.noValidNumbers}</p>}
        {phase === 'error' && <p role="alert" style={{ color: '#8A1C1C', fontSize: 13, fontWeight: 700, margin: '0 0 12px', overflowWrap: 'anywhere' }}>{message}</p>}
        {sending && <p className="desc" style={{ margin: '0 0 12px' }}>{T.sendingInvoice}</p>}
        {allSent && <p role="status" style={{ color: 'var(--green)', fontSize: 13, fontWeight: 800, margin: '0 0 12px' }}>{shown.length === 2 ? T.sendAllOk : `${T.sentOk} ✓`}</p>}
        {phase === 'result' && failed.length > 0 && <p role="alert" style={{ color: '#8A1C1C', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{T.sendPartial}</p>}

        {phase !== 'error' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>{shown.map(row)}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(phase === 'error' || (phase === 'result' && retryable.length > 0)) && (
            <button type="button" className="btn btn-primary" onClick={() => onRetry(phase === 'error' ? undefined : retryable)} style={{ flex: '1 1 140px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <RefreshCw className="h-4 w-4" /> {T.retryFailed}
            </button>
          )}
          {!sending && <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: '1 1 100px' }}>{T.closeLabel}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
