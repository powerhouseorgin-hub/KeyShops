import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X, RefreshCw } from 'lucide-react';
import { IS_NATIVE_APP } from '../utils/platform';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../utils/phone';

// Shared OTP entry dialog used by every verification flow in the app (Shop
// Registration, Customer Registration, Forgot Password, Shop Settings
// password reset). Owns the parts that used to be re-implemented at each
// call site: auto-send on open, the resend cooldown countdown, and closing
// itself automatically once the code is verified - callers only need to
// supply the identifier/method/purpose to verify and a callback for what
// happens next.
//
// Phone verification always goes through the backend's WhatsApp-based send-otp/verify-otp endpoints
// (see WhatsappOtpService) - there is no on-device SMS / Firebase Phone Auth path.
export default function OtpVerificationModal({
  open,
  onClose,
  onVerified,
  api,
  identifier,
  method,
  purpose,
  title,
  description,
  resendCooldownSeconds = 60,
  t = (k) => k,
}) {
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [devCode, setDevCode] = useState('');
  // WhatsApp "inbound" mode (no template): the user's own WhatsApp sends us a message, we check it came from the number that was
  // entered, and reply with the code in that chat. waRef identifies the request; waState follows it (WAITING -> CODE_SENT ...).
  const [waRef, setWaRef] = useState('');
  const [waLink, setWaLink] = useState('');
  const [waState, setWaState] = useState('');
  const openedRef = useRef('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const intervalRef = useRef(null);
  const codeLength = 4;

  const startCooldown = useCallback((seconds = resendCooldownSeconds) => {
    setSecondsLeft(seconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [resendCooldownSeconds]);

  const sendCode = useCallback(async () => {
    setSending(true);
    setOtpError('');
    setDevCode('');
    // Validated here (inside the already-open popup) rather than by the
    // caller before opening it, so an invalid number shown in the field
    // still opens this dialog and explains what's wrong instead of a
    // blocking browser alert() that prevents the popup from ever appearing.
    if (method === 'phone' && !normalizePhone(identifier)) {
      setOtpError(PHONE_REGEX_MESSAGE);
      setSending(false);
      return;
    }
    try {
      const result = await api.sendOtp(identifier, method, purpose);
      if (result?.devCode) setDevCode(result.devCode);
      const inbound = result?.mode === 'inbound' && !!result.ref;
      setWaRef(inbound ? result.ref : '');
      setWaLink(inbound ? result.waLink || '' : '');
      setWaState(inbound ? 'WAITING' : '');
      startCooldown(inbound ? 20 : resendCooldownSeconds);
      // On the phone app, open WhatsApp straight away so the whole thing is one tap; the button below is the fallback.
      if (inbound && result.waLink && IS_NATIVE_APP && openedRef.current !== result.ref) {
        openedRef.current = result.ref;
        window.open(result.waLink, '_blank');
      }
    } catch (e) {
      setOtpError(e.message || t('failedSendOtpMsg'));
    } finally {
      setSending(false);
    }
  }, [api, identifier, method, purpose, startCooldown, t]);

  // While waiting for the WhatsApp message, follow its progress every few seconds (and straight away when the user comes back to the app).
  useEffect(() => {
    if (!open || !waRef || !['WAITING'].includes(waState)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.getOtpStatus(waRef);
        if (!cancelled && res?.state && res.state !== 'WAITING') {
          setWaState(res.state);
          if (['MISMATCH', 'EXPIRED', 'SEND_FAILED'].includes(res.state)) setSecondsLeft(0);
        }
      } catch (e) { /* a missed poll is fine - the next one will catch up */ }
    };
    const timer = setInterval(poll, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [open, waRef, waState, api]);

  const pasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const found = /\b(\d{4})\b/.exec(text || '');
      if (found) { setEnteredOtp(found[1]); setOtpError(''); }
    } catch (e) { /* clipboard access refused - the user can paste into the box by hand */ }
  };

  useEffect(() => {
    if (open) {
      setEnteredOtp('');
      setOtpError('');
      setDevCode('');
      setWaRef(''); setWaLink(''); setWaState(''); openedRef.current = '';
      sendCode();
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSecondsLeft(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleVerify = async () => {
    if (!enteredOtp) return;
    setVerifying(true);
    setOtpError('');
    try {
      await api.verifyOtp(identifier, method, purpose, enteredOtp);
      onVerified?.();
      onClose?.();
    } catch (e) {
      setOtpError(e.message || t('invalidOtpCodeMsg'));
    } finally {
      setVerifying(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      // Explicit inline z-index (not Tailwind's z-50/z-index:50) - this modal
      // can be opened from inside the Shop Registration/Forgot Password
      // screens, which are themselves a `.login-shell.login-overlay` with
      // z-index:500 on native (see the blurred login overlay backdrop) -
      // z-50 rendered this dialog visibly buried behind that overlay
      // despite being open, since 50 < 500. Must stay above every other
      // overlay z-index used in this app.
      style={{ background: 'rgba(5,4,3,0.72)', zIndex: 600 }}
    >
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <div className="icon-badge orange" style={{ width: 44, height: 44, borderRadius: '50%' }}>
            <ShieldCheck style={{ width: 21, height: 21 }} />
          </div>
          <button type="button" onClick={onClose} className="icon-btn" title={t('btnClose')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 style={{ marginTop: 12, marginBottom: 4 }}>{title}</h3>
        {description && <p className="desc" style={{ marginBottom: 18 }}>{description}</p>}

        {waRef && (
          <div style={{ background: 'var(--gold-dim)', border: '1.5px solid var(--gold)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{t('otpWaTitle')}</p>
            <p style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 10 }}>{t('otpWaIntro')}</p>
            {waLink && ['WAITING', 'CODE_SENT'].includes(waState) && (
              <button type="button" className="btn btn-sm" onClick={() => window.open(waLink, '_blank')}
                style={{ background: '#25D366', borderColor: '#25D366', color: '#fff', marginBottom: 10, width: '100%' }}>
                {t('otpWaOpen')}
              </button>
            )}
            <p role="status" style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: ['MISMATCH', 'EXPIRED', 'SEND_FAILED'].includes(waState) ? 'var(--red)' : 'inherit' }}>
              {waState === 'WAITING' && t('otpWaWaiting')}
              {(waState === 'CODE_SENT' || waState === 'DONE') && t('otpWaSent')}
              {waState === 'MISMATCH' && t('otpWaMismatch').replace('{phone}', identifier)}
              {waState === 'EXPIRED' && t('otpWaExpired')}
              {waState === 'SEND_FAILED' && t('otpWaFailed')}
            </p>
          </div>
        )}

        {devCode && (
          <div style={{ background: 'var(--bg-1)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
              {t('testingModeNoProviderTemplate').split('{provider}')[0]}{'WhatsApp'}{t('testingModeNoProviderTemplate').split('{provider}')[1]}
            </p>
            <p style={{ fontSize: 20, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>{devCode}</p>
          </div>
        )}

        {waRef && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={pasteCode}>{t('otpWaPaste')}</button>
          </div>
        )}
        <input
          type="text" maxLength={codeLength} value={enteredOtp}
          onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
          placeholder="1234"
          style={{
            width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)',
            borderRadius: 13, padding: '11px 15px', fontSize: 20, outline: 'none',
            textAlign: 'center', fontWeight: 800, letterSpacing: 8, marginBottom: 12, boxSizing: 'border-box',
          }}
        />
        {otpError && <p style={{ color: 'var(--red)', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>{otpError}</p>}

        <button
          type="button" onClick={handleVerify} disabled={verifying || sending || !enteredOtp}
          className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }}
        >
          {verifying ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('verifyOtpBtn')}
        </button>
        <div className="flex items-center justify-between" style={{ gap: 10 }}>
          <button
            type="button" onClick={sendCode} disabled={sending || verifying || secondsLeft > 0}
            className="btn btn-ghost btn-sm"
          >
            {secondsLeft > 0 ? t('resendInTemplate').replace('{time}', `${mm}:${ss}`) : (waRef ? t('otpWaStartAgain') : t('resendOtpBtn'))}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            {t('btnCancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
