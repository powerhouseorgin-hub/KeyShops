import React, { useState } from 'react';
import { Calendar, Check, RefreshCw } from 'lucide-react';

// Super Admin only (rendered by ShopSettingsView when it is opened for a specific shop): change THIS shop's free trial.
//   "Add days"       - extends the trial by N days (from its current end date, or from today when it has already ended).
//   "Set total days" - the trial lasts N days in total, counted from the day it started.
// A shop with no live trial gets a new trial starting today; a shop on a paid yearly plan is left alone. The rules mirror
// backend/src/common/trial.ts (planTrialUpdate) - the server is the authority, this only previews the result.
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 365;

const fmt = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const daysBetween = (end, now) => Math.ceil((end - now) / DAY_MS);
const txt = (t, key, fallback, vars = {}) => {
  const raw = t(key);
  const base = !raw || raw === key ? fallback : raw;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), base);
};

export default function TrialControl({ t, api, shopId, subscription, onChanged }) {
  const [mode, setMode] = useState('extend');
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const now = Date.now();

  const live = subscription && subscription.status === 'ACTIVE' ? subscription : null;
  const onTrial = !!live && live.plan === 'TRIAL';
  const paidRunning = !!live && live.plan !== 'TRIAL' && live.endDate > now;

  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_DAYS;
  let newEnd = null;
  if (valid && !paidRunning) {
    if (!onTrial) newEnd = now + n * DAY_MS;
    else if (mode === 'set') newEnd = live.startDate + n * DAY_MS;
    else newEnd = Math.max(live.endDate, now) + n * DAY_MS;
  }

  const apply = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const res = await api.updateShopTrial(shopId, { mode, days: n });
      setDone(txt(t, 'trialUpdated', 'Trial updated'));
      onChanged?.(res);
    } catch (e) {
      setError(String(e?.message || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  const left = onTrial ? daysBetween(live.endDate, now) : null;
  const modeBtn = (id, label) => (
    <button
      type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
      className="btn btn-sm"
      style={{ flex: 1, background: mode === id ? 'var(--gold-dim)' : 'transparent', border: `1.5px solid ${mode === id ? 'var(--gold)' : 'var(--border-2)'}`, color: 'var(--text-0)', fontWeight: 800 }}
    >
      {label}
    </button>
  );

  return (
    <div className="reg-section" style={{ marginBottom: 0 }}>
      <div className="reg-field" style={{ marginBottom: 0 }}>
        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>{txt(t, 'trialTitle', 'Trial period')}</b></div>

        {onTrial ? (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)', margin: 0 }}>
              {txt(t, 'trialEnds', 'Ends')} {fmt(live.endDate)}
              <span style={{ marginLeft: 8, color: left >= 0 ? 'var(--green)' : '#B3261E' }}>
                {left >= 0 ? txt(t, 'trialDaysLeft', '{n} days left', { n: left }) : txt(t, 'trialEndedAgo', 'Ended {n} days ago', { n: -left })}
              </span>
            </p>
            <span className="cell-sub">{txt(t, 'trialLength', 'Trial length: {n} days', { n: Math.round((live.endDate - live.startDate) / DAY_MS) })}</span>
          </div>
        ) : (
          <p className="cell-sub" style={{ marginBottom: 10 }}>
            {paidRunning ? txt(t, 'trialPaidNote', 'Paid yearly plan - trial settings do not apply.') : txt(t, 'trialNoneNote', 'No active trial. Applying starts a new trial from today.')}
          </p>
        )}

        {!paidRunning && (
          <>
            {onTrial && <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>{modeBtn('extend', txt(t, 'trialModeExtend', 'Add days'))}{modeBtn('set', txt(t, 'trialModeSet', 'Set total days'))}</div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="input-wrap" style={{ flex: 1 }}>
                <input
                  type="number" min="1" max={MAX_DAYS} step="1" inputMode="numeric" value={days}
                  onChange={(e) => { setDays(e.target.value); setError(''); setDone(''); }}
                  aria-label={txt(t, 'trialDaysLabel', 'Days')}
                />
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={busy || !valid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {txt(t, 'trialApply', 'Apply')}
              </button>
            </div>
            {!valid && <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, fontWeight: 700, color: '#B3261E' }}>1 - {MAX_DAYS}</span>}
            {newEnd && (
              <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>
                {txt(t, 'trialNewEnd', 'New end date')}: <b>{fmt(newEnd)}</b>
                {newEnd < now && <span style={{ color: '#B3261E', marginLeft: 6 }}>{txt(t, 'trialAlreadyPassed', 'This date has already passed.')}</span>}
              </span>
            )}
          </>
        )}
        {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, fontWeight: 700, margin: '8px 0 0' }}>{error}</p>}
        {done && <p role="status" style={{ color: 'var(--green)', fontSize: 12.5, fontWeight: 800, margin: '8px 0 0' }}>{done}</p>}
      </div>
    </div>
  );
}
