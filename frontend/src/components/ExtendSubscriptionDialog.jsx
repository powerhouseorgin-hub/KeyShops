import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';
import { txt } from '../utils/i18nFallback';

// Super Admin: extend ONE shop's subscription by 1, 3, 6, 12 or 24 months, with a reason and internal notes (kept in the activity log).
// A running subscription is extended from its current end date; one that has ended starts a new subscription today. The server is the
// authority (backend/src/common/subscription-extension.ts) - this only previews the new end date.
const PERIODS = [[1, '1 Month'], [3, '3 Months'], [6, '6 Months'], [12, '1 Year'], [24, '2 Years']];
const MAX_REASON = 200;
const MAX_NOTES = 1000;

// calendar months, clamped to the end of a shorter month (30 Nov + 3 months = 28 Feb) - the same rule as the server
function addMonthsUTC(ms, months) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d.getTime();
}
const fmt = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export default function ExtendSubscriptionDialog({ open, onClose, t, api, shopId, shopName, subscription, onExtended }) {
  const [months, setMonths] = useState(12);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useBackHandler(open, () => { if (!busy) onClose(); });
  useEffect(() => { if (open) { setMonths(12); setReason(''); setNotes(''); setError(''); } }, [open]);
  if (!open) return null;

  const now = Date.now();
  const live = subscription && subscription.status === 'ACTIVE' ? subscription : null;
  const running = !!live && live.endDate >= now;
  const newEnd = addMonthsUTC(running ? live.endDate : now, months);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.extendShopSubscription(shopId, { months, reason: reason.trim() || undefined, notes: notes.trim() || undefined });
      onExtended?.(res);
      onClose();
    } catch (e) {
      setError(String(e?.message || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  const label = { display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)', margin: '14px 0 6px' };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={txt(t, 'extendSubscriptionTitle', 'Extend Subscription')}
      style={{ position: 'fixed', inset: 0, zIndex: 70000, background: 'rgba(5,4,3,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 440, padding: 24, position: 'relative', margin: 'auto' }}>
        <button type="button" onClick={onClose} disabled={busy} aria-label={t('closeLabel') || 'Close'} className="icon-btn" style={{ position: 'absolute', top: 12, right: 12 }}>
          <X className="h-4 w-4" />
        </button>
        <h3 style={{ margin: 0, fontSize: 19, paddingRight: 28 }}>{txt(t, 'extendSubscriptionTitle', 'Extend Subscription')}</h3>
        <p className="cell-sub" style={{ margin: '4px 0 0' }}>{shopName}</p>

        <span style={label}>{txt(t, 'extendPeriodLabel', 'Select Extension Period')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PERIODS.map(([m, text]) => (
            <button
              key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m}
              className="btn btn-sm"
              style={{ flex: '1 1 28%', minWidth: 0, background: months === m ? 'var(--gold-dim)' : 'transparent', border: `1.5px solid ${months === m ? 'var(--gold)' : 'var(--border-2)'}`, color: 'var(--text-0)', fontWeight: 800 }}
            >
              {txt(t, `extendPeriod${m}`, text)}
            </button>
          ))}
        </div>

        <p className="cell-sub" style={{ margin: '10px 0 0' }}>
          {running ? `${txt(t, 'extendCurrentEnd', 'Current end date')}: ${fmt(live.endDate)} · ` : `${txt(t, 'extendStartsToday', 'Starts today')} · `}
          {txt(t, 'trialNewEnd', 'New end date')}: <b>{fmt(newEnd)}</b>
        </p>

        <span style={label}>{txt(t, 'extendReasonLabel', 'Reason for Extension')}</span>
        <div className="input-wrap">
          <input type="text" value={reason} maxLength={MAX_REASON} onChange={(e) => setReason(e.target.value)} placeholder={txt(t, 'extendReasonPlaceholder', 'e.g., Promotional extension / Payment received')} />
        </div>

        <span style={label}>{txt(t, 'extendNotesLabel', 'Internal Notes')}</span>
        <div className="input-wrap">
          <textarea rows={3} value={notes} maxLength={MAX_NOTES} onChange={(e) => setNotes(e.target.value)} placeholder={txt(t, 'extendNotesPlaceholder', 'Additional audit notes...')}
            style={{ width: '100%', resize: 'vertical', font: 'inherit' }} />
        </div>

        {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, fontWeight: 700, margin: '12px 0 0', overflowWrap: 'anywhere' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy} style={{ flex: 1 }}>{t('btnCancel')}</button>
          <button type="button" className="btn" onClick={submit} disabled={busy}
            style={{ flex: 2, background: 'var(--gold)', borderColor: 'var(--gold)', color: '#1a1100', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {busy && <RefreshCw className="h-4 w-4 animate-spin" />} {txt(t, 'extendConfirm', 'Confirm Extension')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
