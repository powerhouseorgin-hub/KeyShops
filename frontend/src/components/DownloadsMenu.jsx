import React, { useEffect, useRef, useState } from 'react';
import { Ban, CheckCircle2, Download, FileArchive, XCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useDownloads } from '../context/DownloadsContext';

// The download icon in the top bar, like a browser's: it pulses with the percentage while a download runs, and opens the Downloads panel -
// the running download (progress bar, percentage, Cancel) above the history of recent downloads (what, when, how big, whether it finished).
const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtTime = (ms) => {
  try { return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
};

export default function DownloadsMenu({ t }) {
  const { active, history, cancelActive, clearHistory } = useDownloads();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const percent = active && active.total ? Math.round((active.done / active.total) * 100) : 0;

  // closes when the user taps anywhere else
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [open]);

  const stateIcon = (state) => (state === 'done'
    ? <CheckCircle2 size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
    : state === 'cancelled'
      ? <Ban size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      : <XCircle size={18} style={{ color: '#B3261E', flexShrink: 0 }} />);
  const stateText = (state) => (state === 'done' ? t('downloadsDone') : state === 'cancelled' ? t('downloadsCancelled') : t('downloadsFailed'));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="icon-btn"
        title={t('downloadsTitle')}
        aria-label={t('downloadsTitle')}
        aria-expanded={open}
        style={{ position: 'relative', width: 38, height: 38 }}
      >
        <Download className={`h-4 w-4${active ? ' animate-pulse' : ''}`} />
        {active && (
          <span style={{ position: 'absolute', top: -5, right: -6, background: 'var(--maroon)', color: '#fff', fontWeight: 800, fontSize: 9, minWidth: 17, height: 17, padding: '0 3px', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {percent}%
          </span>
        )}
      </button>

      {open && (
        <div className="card animate-fade-in" style={{ position: 'absolute', right: 0, top: 46, width: 'min(340px, calc(100vw - 32px))', padding: 14, zIndex: 9999, textAlign: 'left' }}>
          <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
            <h3 style={{ fontSize: 13 }}>{t('downloadsTitle')}</h3>
            {history.length > 0 && !active && (
              <button type="button" onClick={clearHistory} style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase' }}>{t('downloadsClear')}</button>
            )}
          </div>

          {active && (
            <div style={{ border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 12px', marginBottom: 10, background: 'var(--card-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileArchive size={18} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
                <div style={{ fontWeight: 800, fontSize: 13, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.title}</div>
                <span style={{ fontWeight: 800, fontSize: 12 }}>{percent}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', margin: '8px 0 6px' }}>
                <div style={{ height: '100%', width: `${percent}%`, background: 'var(--maroon)', transition: 'width .3s' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span className="cell-sub" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{active.label}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelActive} disabled={active.cancelling} style={{ flexShrink: 0 }}>{t('downloadsCancel')}</button>
              </div>
            </div>
          )}

          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.length === 0 && !active ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '24px 0' }}>{t('downloadsEmpty')}</div>
            ) : history.map((h) => (
              <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                {stateIcon(h.state)}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5 }}>{h.title} <span style={{ fontWeight: 700, color: h.state === 'done' ? 'var(--green)' : 'var(--text-3)' }}>· {stateText(h.state)}</span></div>
                  {(h.message || h.error) && <div className="cell-sub" style={{ marginTop: 1, overflowWrap: 'anywhere' }}>{h.state === 'failed' ? h.error : h.message}</div>}
                  {h.files.slice(0, 3).map((f) => (
                    <div key={f.name} className="cell-sub" style={{ marginTop: 1, display: 'flex', gap: 6, alignItems: 'center', overflowWrap: 'anywhere' }}>
                      <FileArchive size={11} style={{ flexShrink: 0 }} /> {f.name}{f.size ? ` · ${fmtSize(f.size)}` : ''}
                    </div>
                  ))}
                  {h.files.length > 3 && <div className="cell-sub" style={{ marginTop: 1 }}>+{h.files.length - 3}</div>}
                  <div className="cell-sub" style={{ marginTop: 2, fontSize: 11 }}>{fmtTime(h.finishedAt)}</div>
                </div>
              </div>
            ))}
          </div>
          {history.some((h) => h.state === 'done' && h.files.length) && Capacitor.isNativePlatform() && (
            <div className="cell-sub" style={{ marginTop: 8, fontSize: 11 }}>{t('downloadsSavedTo')}</div>
          )}
        </div>
      )}
    </div>
  );
}
