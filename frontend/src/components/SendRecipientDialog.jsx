import React from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Users, User, X } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

// "Send the invoice to": the buyer, the seller or both. An option whose person has no usable mobile number is disabled and says why
// (the sale's saved phone number is what WhatsApp is sent to). `problems`: { seller, buyer } = null | 'NO_PHONE' | 'INVALID_PHONE'.
export default function SendRecipientDialog({ sale, problems, T, onChoose, onClose }) {
  useBackHandler(true, onClose);
  const reason = (p) => (p === 'NO_PHONE' ? T.reasonNoPhone : p === 'INVALID_PHONE' ? T.reasonInvalidPhone : '');
  const option = (key, parties, Icon, label, detail, blocked) => (
    <button key={key} type="button" disabled={!!blocked} onClick={() => onChoose(parties)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 14, border: '1.5px solid var(--border-2)', background: blocked ? 'var(--card-2)' : 'var(--card)', opacity: blocked ? 0.6 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
      <span className="icon-badge jgreen" style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0 }}><Icon size={18} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{label}</span>
        <span className="cell-sub" style={{ display: 'block', marginTop: 1, overflowWrap: 'anywhere', color: blocked ? '#8A1C1C' : undefined }}>{blocked ? reason(blocked) : detail}</span>
      </span>
    </button>
  );
  const show = (name, phone) => [name, phone ? `+91 ${String(phone).replace(/\D/g, '').slice(-10)}` : ''].filter(Boolean).join(' · ');
  const bothBlocked = problems.seller || problems.buyer;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={T.chooseRecipientTitle} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70000, background: 'rgba(5,4,3,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, padding: 20, position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label={T.closeLabel} className="icon-btn" style={{ position: 'absolute', top: 12, right: 12 }}><X className="h-4 w-4" /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingRight: 28 }}>
          <div className="icon-badge jgreen" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }}><MessageCircle style={{ width: 20, height: 20 }} /></div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{T.chooseRecipientTitle}</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {option('buyer', ['buyer'], User, T.toBuyer, show(sale.buyerName, sale.buyerPhone), problems.buyer)}
          {option('seller', ['seller'], User, T.toSeller, show(sale.sellerName, sale.sellerPhone), problems.seller)}
          {option('both', ['seller', 'buyer'], Users, T.toBoth, `${show(sale.buyerName, sale.buyerPhone)} + ${show(sale.sellerName, sale.sellerPhone)}`, bothBlocked)}
        </div>
      </div>
    </div>,
    document.body,
  );
}
