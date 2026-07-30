import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X, RefreshCw } from 'lucide-react';

// Shared OTP entry dialog used by every verification flow in the app (Shop
// Registration, Customer Registration, Forgot Password, Shop Settings
// password reset). Owns the parts that used to be re-implemented at each
// call site: auto-send on open, the resend cooldown countdown, and closing
// itself automatically once the code is verified - callers only need to
// supply the identifier/method/purpose to verify and a callback for what
// happens next.
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
  resendCooldownSeconds = 30,
  t = (k) => k,
}) {
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [devCode, setDevCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const intervalRef = useRef(null);

  const startCooldown = useCallback(() => {
    setSecondsLeft(resendCooldownSeconds);
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
    try {
      const result = await api.sendOtp(identifier, method, purpose);
      if (result?.devCode) setDevCode(result.devCode);
      startCooldown();
    } catch (e) {
      setOtpError(e.message || t('failedSendOtpMsg'));
    } finally {
      setSending(false);
    }
  }, [api, identifier, method, purpose, startCooldown, t]);

  useEffect(() => {
    if (open) {
      setEnteredOtp('');
      setOtpError('');
      setDevCode('');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,4,3,0.72)' }}>
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

        {devCode && (
          <div style={{ background: 'var(--bg-1)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
              {t('testingModeNoProviderTemplate').split('{provider}')[0]}{method === 'email' ? 'SMTP' : 'SMS'}{t('testingModeNoProviderTemplate').split('{provider}')[1]}
            </p>
            <p style={{ fontSize: 20, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>{devCode}</p>
          </div>
        )}

        <input
          type="text" maxLength={4} value={enteredOtp}
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
          type="button" onClick={handleVerify} disabled={verifying || !enteredOtp}
          className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }}
        >
          {verifying ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('verifyOtpBtn')}
        </button>
        <div className="flex items-center justify-between" style={{ gap: 10 }}>
          <button
            type="button" onClick={sendCode} disabled={sending || secondsLeft > 0}
            className="btn btn-ghost btn-sm"
          >
            {secondsLeft > 0 ? t('resendInTemplate').replace('{time}', `${mm}:${ss}`) : t('resendOtpBtn')}
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
