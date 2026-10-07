import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, MessageCircle } from 'lucide-react';

// Super Admin > Support: the state of the WhatsApp side of the OTP flow. The server checks it by itself every day at 09:00 (India time)
// and keeps the last result; "Check now" runs the same check immediately. A problem is also pushed to the Super Admin's notifications.
export default function WhatsappHealthCard({ t, api }) {
  const [health, setHealth] = useState(null); // { ok, checkedAt, problems, stats } - ok === null: never checked yet
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setHealth(await api.getWhatsappHealth());
      setError('');
    } catch (e) {
      setError(String(e?.message || e).slice(0, 160));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      setHealth(await api.runWhatsappHealth());
      setError('');
    } catch (e) {
      setError(String(e?.message || e).slice(0, 160));
    } finally {
      setRunning(false);
    }
  };

  const never = !health || health.ok === null || health.ok === undefined;
  const ok = !never && health.ok;
  const tone = never ? 'var(--text-3)' : ok ? 'var(--green)' : '#B3261E';
  const when = health?.checkedAt ? new Date(health.checkedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const s = health?.stats;

  return (
    <div className="card" style={{ maxWidth: 720, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className="icon-badge jgreen" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }}><MessageCircle style={{ width: 19, height: 19 }} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{t('waHealthTitle')}</h3>
          <div className="cell-sub">{t('waHealthSubtitle')}</div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={runNow} disabled={running || loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <RefreshCw className={running ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} /> {running ? t('waHealthChecking') : t('waHealthCheckNow')}
        </button>
      </div>

      {loading ? (
        <div className="cell-sub">{t('waHealthLoading')}</div>
      ) : (
        <>
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: tone }}>
            {never ? null : ok ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            {never ? t('waHealthNever') : ok ? t('waHealthOk') : t('waHealthBad')}
          </div>
          {when && <div className="cell-sub" style={{ marginTop: 2 }}>{t('waHealthLastChecked')}: {when}</div>}

          {!never && !ok && health.problems?.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: '#8A1C1C', fontWeight: 600, overflowWrap: 'anywhere' }}>
              {health.problems.map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
            </ul>
          )}

          {!never && s && (
            <div className="cell-sub" style={{ marginTop: 10 }}>
              {t('waHealthStats')}: {s.otpRequests24h} {t('waHealthRequests')} · {s.answered24h} {t('waHealthAnswered')} · {s.replyFailures24h} {t('waHealthFailed')}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" style={{ color: '#8A1C1C', fontSize: 12.5, fontWeight: 700, margin: '10px 0 0' }}>{error}</p>}
    </div>
  );
}
