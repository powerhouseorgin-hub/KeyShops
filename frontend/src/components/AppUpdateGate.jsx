import React, { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { checkForUpdate, downloadAndInstall } from '../utils/appUpdate';
import { updateText, fillUpdateText } from '../i18n/appUpdateText';

// Runs once every time the Android app is launched: compares the installed build with the version published on
// the landing page and, when a newer one exists, shows a dialog with an Update button that downloads and installs
// it. When the versions match (or the check cannot run, e.g. offline) nothing is rendered and the app opens
// normally. A published manifest with "required": false adds a Later button; by default the dialog has none.
//
// Language comes from localStorage ('kee_lang') rather than props: this mounts above the app, before its
// translation bundles load.
export default function AppUpdateGate() {
  const [update, setUpdate] = useState(null);
  // 'ready' | 'downloading' | 'opened' | 'needsPermission' | 'failed' | 'badChecksum'
  const [phase, setPhase] = useState('ready');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((result) => { if (!cancelled && result) setUpdate(result); });
    return () => { cancelled = true; };
  }, []);

  if (!update || dismissed) return null;

  let lang = 'en';
  try { lang = localStorage.getItem('kee_lang') || 'en'; } catch { /* storage unavailable */ }
  const t = updateText(lang);

  const startUpdate = async () => {
    setPhase('downloading');
    setPercent(0);
    try {
      await downloadAndInstall(update, setPercent);
      setPhase('opened');
    } catch (err) {
      if (err?.code === 'NEEDS_PERMISSION') setPhase('needsPermission');
      else if (err?.code === 'BAD_CHECKSUM') setPhase('badChecksum');
      else setPhase('failed');
    }
  };

  const busy = phase === 'downloading';
  const note = {
    downloading: fillUpdateText(t('downloading'), { percent }),
    opened: t('opened'),
    needsPermission: t('allowInstall'),
    failed: t('failed'),
    badChecksum: t('checksum'),
  }[phase];
  const isProblem = phase === 'failed' || phase === 'badChecksum';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="kee-update-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: 'rgba(20, 14, 6, 0.72)', backdropFilter: 'blur(3px)',
      }}
    >
      <style>{'@keyframes kee-update-spin { to { transform: rotate(360deg); } }'}</style>
      <div
        style={{
          width: '100%', maxWidth: 380, background: 'var(--bg-1, #fff)', color: 'var(--text-1, #2A2117)',
          borderRadius: 20, padding: '26px 22px 20px', boxShadow: '0 20px 60px rgba(0,0,0,.35)', textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--gold-dim-2, rgba(245,184,0,.22))', color: 'var(--gold, #C89416)',
          }}
        >
          <Download size={28} />
        </div>
        <h2 id="kee-update-title" style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>{t('title')}</h2>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 10px', color: 'var(--text-2, #5a4a38)' }}>{t('message')}</p>
        <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 14px', color: 'var(--gold, #C89416)' }}>
          {fillUpdateText(t('versions'), { installed: update.installedVersionName, latest: update.versionName })}
        </p>

        {note && (
          <p
            role={isProblem ? 'alert' : 'status'}
            style={{
              fontSize: 13, lineHeight: 1.5, margin: '0 0 14px', padding: '9px 12px', borderRadius: 10,
              background: isProblem ? 'rgba(220,38,38,.10)' : 'var(--gold-dim, rgba(245,184,0,.14))',
              color: isProblem ? '#b91c1c' : 'inherit',
            }}
          >
            {note}
          </p>
        )}

        {busy && (
          <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,.08)', margin: '0 0 14px', overflow: 'hidden' }}>
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--gold-2, #F5B800)', transition: 'width .2s' }} />
          </div>
        )}

        <button
          type="button"
          onClick={startUpdate}
          disabled={busy}
          style={{
            width: '100%', minHeight: 48, border: 0, borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'var(--gold-2, #F5B800)', color: '#2A2117', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <Loader2 size={18} style={{ animation: 'kee-update-spin 1s linear infinite' }} /> : isProblem ? <RefreshCw size={18} /> : <Download size={18} />}
          {isProblem ? t('retry') : t('update')}
        </button>

        {!update.required && !busy && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{ width: '100%', minHeight: 44, marginTop: 8, border: 0, background: 'transparent', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: 'var(--text-2, #5a4a38)' }}
          >
            {t('later')}
          </button>
        )}
      </div>
    </div>
  );
}
