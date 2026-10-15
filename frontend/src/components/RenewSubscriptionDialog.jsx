import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';
import { openRazorpayCheckout } from '../utils/razorpay';
import { txt } from '../utils/i18nFallback';

// A Shop Admin renews their OWN subscription by paying - like recharging a SIM before it runs out: the new year is stacked AFTER the current
// end date, so no paid day is lost (a subscription that has already ended starts a new year today). The price and the stacking rule live on the
// server (POST /shop/subscription/renew/order and /verify); this dialog only shows them and runs Razorpay's checkout. The amount is never sent
// by the app. If the money was taken but the server could not apply it (a dropped connection after paying), the shop sees the payment ID and
// can retry applying it - the same payment can only ever be applied once.
const RENEW_MONTHS = 12;
const MAX_PREPAID_MONTHS = 36;

function addMonthsUTC(ms, months) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d.getTime();
}
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const rupees = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
const round2 = (n) => Math.round(n * 100) / 100;
const realEmail = (email) => (email && !/@phone\.keyshops\.internal$/i.test(email) ? email : undefined);

export default function RenewSubscriptionDialog({ open, onClose, t, api, user, onRenewed }) {
  const [phase, setPhase] = useState('loading'); // loading | ready | paying | verifying | done | error
  const [sub, setSub] = useState(null);
  const [loaded, setLoaded] = useState(false); // the subscription and the price were read (a shop may legitimately have no subscription)
  const [price, setPrice] = useState({ base: 999, gstPercent: 18 });
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [pending, setPending] = useState(null); // Razorpay's response when paid but not yet applied, for a retry
  useBackHandler(open && phase !== 'paying' && phase !== 'verifying', onClose);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPhase('loading'); setLoaded(false); setError(''); setDone(null); setPending(null);
    Promise.all([api.getSettings(), api.getSupportConfig()])
      .then(([settings, cfg]) => {
        if (cancelled) return;
        setSub((settings.subscriptions && settings.subscriptions[0]) || null);
        setPrice({ base: cfg.subscriptionPrice ?? 999, gstPercent: cfg.gstPercent ?? 18 });
        setLoaded(true);
        setPhase('ready');
      })
      .catch((e) => { if (!cancelled) { setError(String(e?.message || e).slice(0, 200)); setPhase('error'); } });
    return () => { cancelled = true; };
  }, [open, api]);

  if (!open) return null;

  const now = Date.now();
  const live = sub && sub.status === 'ACTIVE' ? sub : null;
  const running = !!live && live.endDate >= now;
  const newEnd = addMonthsUTC(running ? live.endDate : now, RENEW_MONTHS);
  const tooFar = newEnd > addMonthsUTC(now, MAX_PREPAID_MONTHS);
  const gst = round2(price.base * (price.gstPercent / 100));
  const total = round2(price.base + gst);
  const endedDays = live && !running ? Math.ceil((now - live.endDate) / 86400000) : null;

  const verify = async (resp) => {
    setPhase('verifying'); setError('');
    try {
      const res = await api.verifyRenewal({
        razorpayOrderId: resp.razorpay_order_id, razorpayPaymentId: resp.razorpay_payment_id, razorpaySignature: resp.razorpay_signature,
      });
      setDone(res); setPending(null); setPhase('done');
      onRenewed?.(res);
    } catch (e) {
      setPending(resp);
      setError(`${txt(t, 'renewPaymentIssue', 'We received your payment but could not apply it automatically. Please contact support and quote payment ID {id}.', { id: resp.razorpay_payment_id })} (${String(e?.message || e).slice(0, 120)})`);
      setPhase('error');
    }
  };

  const pay = async () => {
    setPhase('paying'); setError('');
    let order;
    try {
      order = await api.createRenewalOrder();
    } catch (e) {
      setError(String(e?.message || e).slice(0, 200));
      setPhase('ready');
      return;
    }
    openRazorpayCheckout({
      order,
      prefill: { name: user?.name, contact: user?.phone, ...(realEmail(user?.email) ? { email: user.email } : {}) },
      description: 'Key Shops - Yearly renewal',
      onSuccess: verify,
      onDismiss: () => setPhase('ready'),
      onError: (e) => { setError(String(e?.message || e).slice(0, 200)); setPhase('ready'); },
    });
  };

  const busy = phase === 'paying' || phase === 'verifying';
  const row = (label, value, strong) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: strong ? 15 : 13.5, fontWeight: strong ? 800 : 600, padding: '3px 0' }}>
      <span style={{ color: strong ? 'var(--text-0)' : 'var(--text-2)' }}>{label}</span><span style={{ color: 'var(--text-0)' }}>{value}</span>
    </div>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={txt(t, 'renewTitle', 'Renew subscription')}
      style={{ position: 'fixed', inset: 0, zIndex: 70000, background: 'rgba(5,4,3,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 24, position: 'relative', margin: 'auto' }}>
        {!busy && (
          <button type="button" onClick={onClose} aria-label={t('closeLabel') || 'Close'} className="icon-btn" style={{ position: 'absolute', top: 12, right: 12 }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <h3 style={{ margin: 0, fontSize: 19, paddingRight: 28 }}>{txt(t, 'renewTitle', 'Renew subscription')}</h3>

        {phase === 'loading' && <p className="cell-sub" style={{ marginTop: 14 }}>{txt(t, 'renewLoading', 'Loading...')}</p>}

        {phase === 'done' && done && (
          <div style={{ textAlign: 'center', padding: '18px 0 4px' }}>
            <CheckCircle2 size={44} style={{ color: 'var(--green)' }} />
            <p role="status" style={{ fontWeight: 800, fontSize: 15, margin: '10px 0 16px' }}>
              {txt(t, 'renewSuccess', 'Subscription renewed. Valid until {date}.', { date: fmtDate(done.endDate) })}
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>{txt(t, 'renewDone', 'Done')}</button>
          </div>
        )}

        {loaded && phase !== 'loading' && phase !== 'done' && (
          <>
            {live && (
              <p style={{ fontSize: 13.5, fontWeight: 800, margin: '12px 0 0' }}>
                {txt(t, 'renewValidUntil', 'Valid until')}: {fmtDate(live.endDate)}
                {endedDays !== null && <span style={{ marginLeft: 8, color: '#B3261E' }}>{txt(t, 'renewEnded', 'Ended {n} days ago', { n: endedDays })}</span>}
              </p>
            )}
            <p className="cell-sub" style={{ margin: '8px 0 0' }}>
              {running ? txt(t, 'renewExplain', 'Pay now and your next year starts after your current plan ends. You do not lose any days.') : txt(t, 'renewExplainEnded', 'Your subscription has ended. Pay now and a new year starts today.')}
            </p>
            <div style={{ margin: '14px 0', padding: 12, border: '1px solid var(--border-2)', borderRadius: 12, background: 'var(--card-2)' }}>
              {row(txt(t, 'renewNewEnd', 'New valid-until date'), fmtDate(newEnd), true)}
            </div>
            <div style={{ margin: '0 0 6px' }}>
              {row(txt(t, 'renewPriceLabel', 'Subscription (1 year)'), rupees(price.base))}
              {row(txt(t, 'renewGstLabel', 'GST ({p}%)', { p: price.gstPercent }), rupees(gst))}
              <div style={{ borderTop: '1px solid var(--border-2)', marginTop: 4, paddingTop: 4 }}>{row(txt(t, 'renewTotalLabel', 'Total'), rupees(total), true)}</div>
            </div>
            {tooFar && <p className="cell-sub" style={{ margin: '10px 0 0', fontWeight: 700 }}>{txt(t, 'renewMax', 'You are already paid up until {date}. You can renew again closer to that date.', { date: fmtDate(live.endDate) })}</p>}
            {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, fontWeight: 700, margin: '10px 0 0', overflowWrap: 'anywhere' }}>{error}</p>}
            {pending ? (
              <button type="button" className="btn btn-primary" onClick={() => verify(pending)} disabled={busy} style={{ width: '100%', marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {busy && <RefreshCw className="h-4 w-4 animate-spin" />} {txt(t, 'renewRetry', 'Try again')}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={pay} disabled={busy || tooFar || phase === 'error'}
                style={{ width: '100%', marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {busy ? txt(t, 'renewProcessing', 'Please wait...') : txt(t, 'renewPay', 'Pay {amount}', { amount: rupees(total) })}
              </button>
            )}
          </>
        )}

        {phase === 'error' && !loaded && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, fontWeight: 700, marginTop: 12 }}>{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
