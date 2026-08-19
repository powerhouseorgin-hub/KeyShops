import React, { useState, useEffect, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBackHandler } from '../utils/backHandler';
import { getAssetUrl, downloadAsset, filenameForAsset } from '../apiConfig';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../utils/phone';
import { IS_NATIVE_APP, KEE_LANDING_PAGE_URL, primeStoragePermission } from '../utils/platform';
import {
  AlertTriangle, Award, BadgePercent, Ban, Calendar, Camera, Check, CheckCircle2, Copy,
  Download, Edit, Eye, EyeOff, FileCheck, FileText,
  KeyRound, Link2, Lock, Mail, MapPin, Phone, RefreshCw, ShieldCheck,
  Store, Trash, Upload, User, Users,
  X,
} from 'lucide-react';

// Lazy-loaded: pulls in the Capacitor Firebase Authentication SDK - see the
// identical import in App.jsx for why this is deferred rather than static.
const OtpVerificationModal = lazy(() => import('../components/OtpVerificationModal'));

// In-memory cache (module scope, keyed by shopId since Super Admin can open
// this for different shops) for the read-only Referral & Rewards overview
// section - unlike the rest of this screen (an editable settings form,
// deliberately left uncached so a revisit never shows stale values mid-edit),
// this is a passive display, safe to render instantly from cache while
// refreshing silently.
const referralOverviewCache = {};

// shopId is only passed when the Super Admin is managing a specific shop's
// settings from Shops Management (see ShopsManagementView's "Manage Settings"
// button) - a normal Shop Admin visiting their own Settings tab omits it and
// the backend falls back to req.user.shopId.
function ShopSettingsView({ t, api, shopId }) {
  const { user } = useAuth();
  const referralCacheKey = shopId || 'own';
  const cachedReferral = referralOverviewCache[referralCacheKey] || null;
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [gst, setGst] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationDoc, setVerificationDoc] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  // The shop's current subscription, straight from getSettings()'s
  // `subscriptions` relation (already fetched, just wasn't rendered before) -
  // shown read-only here so a Shop Admin can see their own renewal date
  // without needing to hit the grace-period alert first.
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  // Workspace Profile fields are read-only until Edit is tapped - guards
  // against an accidental keystroke/paste silently changing the shop's
  // name/phone/address while just viewing this screen.
  const [editMode, setEditMode] = useState(false);
  // Only meaningful (and only rendered) when a Super Admin is managing
  // another shop's settings (shopId is set) - a Shop Admin viewing their own
  // settings has no use for suspending themselves.
  const [shopIsActive, setShopIsActive] = useState(true);
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [referralCode, setReferralCode] = useState(cachedReferral ? cachedReferral.referralCode : null);
  const [referralGenerating, setReferralGenerating] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [referralPoints, setReferralPoints] = useState(cachedReferral ? cachedReferral.referralPoints : 0);
  const [totalReferrals, setTotalReferrals] = useState(cachedReferral ? cachedReferral.totalReferrals : 0);
  const [referralHistory, setReferralHistory] = useState(cachedReferral ? cachedReferral.history : []);

  // Verification states
  const [revealPassword, setRevealPassword] = useState(false);
  const [showPassVerifyModal, setShowPassVerifyModal] = useState(false);
  const [passVerifyInput, setPassVerifyInput] = useState('');
  const [passVerifyError, setPassVerifyError] = useState('');
  useBackHandler(showPassVerifyModal, () => { setShowPassVerifyModal(false); setPassVerifyError(''); });
  const [passVerifyLoading, setPassVerifyLoading] = useState(false);
  const [showVerifyPass, setShowVerifyPass] = useState(false);
  const [otpShowNewPass, setOtpShowNewPass] = useState(false);
  const [otpShowConfirmPass, setOtpShowConfirmPass] = useState(false);
  const [revealedPasswordVal, setRevealedPasswordVal] = useState('');

  // OTP Reset states inside Settings
  const [otpResetOpen, setOtpResetOpen] = useState(false);
  const [otpResetMethod] = useState('phone'); // phone-only - email OTP removed
  const [otpResetIdentifier, setOtpResetIdentifier] = useState('');
  const [otpResetVerified, setOtpResetVerified] = useState(false);
  const [showShopOtpResetModal, setShowShopOtpResetModal] = useState(false);
  const [otpResetNewPassword, setOtpResetNewPassword] = useState('');
  const [otpResetConfirmPassword, setOtpResetConfirmPassword] = useState('');
  const [otpResetLoading, setOtpResetLoading] = useState(false);
  const [otpResetError, setOtpResetError] = useState('');

  // Edit Login Credentials - phone-only (email verification removed; email
  // is shown read-only above). The new phone number must be OTP-verified
  // (OtpVerificationModal, purpose 'change-credentials') before
  // AuthService.updateLoginCredentials will accept it - see that method for
  // the verification-window check.
  const [editingCredField, setEditingCredField] = useState(null); // 'phone' | null
  const [credNewValue, setCredNewValue] = useState('');
  const [credFieldError, setCredFieldError] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [showCredOtpModal, setShowCredOtpModal] = useState(false);
  useBackHandler(showCredOtpModal, () => setShowCredOtpModal(false));

  // Delete Account - requires the same OTP-verification-window pattern as the
  // credential edit above (purpose 'delete-account'), against the account's
  // own already-on-file phone number rather than a newly-entered one.
  const [showDeleteOtpModal, setShowDeleteOtpModal] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  useBackHandler(showDeleteOtpModal, () => setShowDeleteOtpModal(false));

  useEffect(() => {
    fetchSettings();
    fetchReferralOverview();
  }, []);

  // Single unified verification document type for Shop Settings uploads (see
  // SHOP_DOCUMENT_TYPES.VERIFICATION_DOCUMENT in backend/src/common/shop-document.util.ts).
  // The legacy SHOP_PHOTO/SHOP_LICENSE/OWNER_AADHAAR rows created at registration
  // time are left dormant in the DB - not shown or editable here anymore.
  const VERIFICATION_DOC_TYPE = 'VERIFICATION_DOCUMENT';

  const fetchSettings = async () => {
    setLoading(true);
    setSettingsError('');
    try {
      const res = await api.getSettings(shopId);
      setShopName(res.name);
      setShopIsActive(res.isActive);
      // getSettings() already includes the shop's most recent subscription
      // row (see ShopService.getSettings's `subscriptions` include) - just
      // wasn't being read into state or rendered before.
      setSubscriptionInfo((res.subscriptions && res.subscriptions[0]) || null);

      if (res.companyDetails) {
        try {
          const details = JSON.parse(res.companyDetails);
          setAddress(details.address || '');
          setGst(details.gst || '');
          setPhone(details.phone || '');
        } catch (err) {
          setAddress('');
          setGst('');
          setPhone('');
        }
      }

      // Verification document now comes from the relational ShopDocument
      // table (res.documents), not from companyDetails JSON. Only the
      // most-recent active VERIFICATION_DOCUMENT row is kept (the backend
      // already soft-deletes the previous one on replace, but findMany could
      // still return more than one in edge cases, so pick the newest
      // defensively).
      const verificationDocs = (res.documents || []).filter(d => d.documentType === VERIFICATION_DOC_TYPE);
      verificationDocs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setVerificationDoc(verificationDocs[0] || null);
    } catch (e) {
      console.error(e);
      // Surfaced so a failed fetch (flaky mobile network, expired session,
      // etc.) doesn't silently leave every field blank with no indication
      // anything went wrong - previously this just logged to the console.
      setSettingsError(e.message || t('failedLoadShopSettingsMsg'));
    } finally {
      setLoading(false);
    }
  };

  const persistCompanyDetails = async (overrides = {}) => {
    const companyDetails = JSON.stringify({ address, phone, gst, ...overrides });
    await api.updateSettings({ name: shopName, companyDetails }, shopId);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(phone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    try {
      await persistCompanyDetails();
      alert(t('shopWorkspaceSettingsSavedMsg'));
      setEditMode(false);
    } catch (e) {
      alert(e.message);
    }
  };

  // Discards any unsaved edits by re-fetching the last-saved values from the
  // server, rather than tracking a separate "original" snapshot in state.
  const handleCancelEdit = () => {
    fetchSettings();
    setEditMode(false);
  };

  const handleDocFileSelected = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('fileSizeExceeds5MBMsg'));
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert(t('onlyJpegPngPdfMsg'));
      return;
    }
    setDocUploading(true);
    try {
      // Backend soft-deletes any existing active VERIFICATION_DOCUMENT row and
      // creates a new one - no separate delete call needed here.
      const uploaded = await api.uploadSettingsDocument(VERIFICATION_DOC_TYPE, file, shopId);
      setVerificationDoc(uploaded);
    } catch (err) {
      alert(err.message || t('documentUploadFailedMsg'));
    } finally {
      setDocUploading(false);
    }
  };


  const handleCaptureDocPhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 85,
      });
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `verification_document.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
      await handleDocFileSelected(file);
    } catch (err) {
      // User cancelling the native camera sheet rejects the promise - not a
      // real error, so only surface genuine failures.
      if (err && err.message && !/cancell?ed/i.test(err.message)) {
        alert(err.message || t('documentUploadFailedMsg'));
      }
    }
  };

  const handleDocRemove = async () => {
    if (!verificationDoc) return;
    if (!confirm(t('removeThisDocumentConfirm'))) return;
    try {
      await api.deleteSettingsDocument(verificationDoc.id, shopId);
      setVerificationDoc(null);
    } catch (err) {
      alert(err.message || t('failedRemoveDocumentMsg'));
    }
  };

  const fetchReferralOverview = async () => {
    try {
      const res = await api.getReferralOverview(shopId);
      const overview = {
        referralCode: res.referralCode || null,
        referralPoints: res.referralPoints || 0,
        totalReferrals: res.totalReferrals || 0,
        history: res.history || [],
      };
      setReferralCode(overview.referralCode);
      setReferralPoints(overview.referralPoints);
      setTotalReferrals(overview.totalReferrals);
      setReferralHistory(overview.history);
      referralOverviewCache[referralCacheKey] = overview;
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateReferralCode = async () => {
    setReferralGenerating(true);
    try {
      const { referralCode: code } = await api.generateReferralCode(shopId);
      setReferralCode(code);
    } catch (err) {
      alert(err.message || t('failedGenerateReferralCodeMsg'));
    } finally {
      setReferralGenerating(false);
    }
  };

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch (err) {
      // Clipboard API unavailable - fall through silently, user can still
      // read/copy the code manually from the screen.
    }
  };

  const referralShareMessage = () => t('referralShareMessageTemplate').replace('{code}', referralCode || '').replace('{url}', KEE_LANDING_PAGE_URL);

  const handleShareReferralWhatsApp = () => {
    if (!referralCode) return;
    const url = `https://wa.me/?text=${encodeURIComponent(referralShareMessage())}`;
    window.open(url, '_blank');
  };

  const handleCopyReferralLink = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralShareMessage());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      // Clipboard API unavailable - nothing further to fall back to here.
    }
  };

  const handlePasswordVerificationSubmit = async (e) => {
    e.preventDefault();
    setPassVerifyError('');
    setPassVerifyLoading(true);
    try {
      await api.changePassword(passVerifyInput, passVerifyInput);
      setRevealedPasswordVal(passVerifyInput);
      setRevealPassword(true);
      setShowPassVerifyModal(false);
      setPassVerifyInput('');
    } catch (err) {
      setPassVerifyError(err.message || t('incorrectPasswordEnteredMsg'));
    } finally {
      setPassVerifyLoading(false);
    }
  };

  // OTP Reset handlers
  const handleOtpResetSend = () => {
    if (!otpResetIdentifier) {
      alert(t('pleaseEnterRegisteredEmailPhoneMsg'));
      return;
    }
    setOtpResetError('');
    setShowShopOtpResetModal(true);
  };

  const handleOtpResetSubmit = async (e) => {
    e.preventDefault();
    if (otpResetNewPassword !== otpResetConfirmPassword) {
      setOtpResetError(t('passwordsDoNotMatchMsg'));
      return;
    }
    setOtpResetLoading(true);
    try {
      await api.resetPasswordPublic(otpResetIdentifier, 'phone', otpResetNewPassword);
      setRevealedPasswordVal(otpResetNewPassword);
      alert(t('passwordUpdatedSuccessfullyMsg'));
      setOtpResetOpen(false);
      // Reset flow variables
      setOtpResetVerified(false);
      setOtpResetIdentifier('');
      setOtpResetNewPassword('');
      setOtpResetConfirmPassword('');
    } catch (err) {
      setOtpResetError(err.message || t('failedUpdatePasswordMsg'));
    } finally {
      setOtpResetLoading(false);
    }
  };

  // Edit Login Credentials handlers
  const startEditCredential = (field) => {
    setEditingCredField(field);
    setCredNewValue('');
    setCredFieldError('');
  };

  const cancelEditCredential = () => {
    setEditingCredField(null);
    setCredNewValue('');
    setCredFieldError('');
  };

  const handleRequestCredentialOtp = () => {
    const value = credNewValue.trim();
    if (!value) {
      setCredFieldError(t('pleaseEnterNewValueMsg'));
      return;
    }
    if (!PHONE_REGEX.test(value)) {
      setCredFieldError(PHONE_REGEX_MESSAGE);
      return;
    }
    if (user.phone && value === user.phone) {
      setCredFieldError(t('newValueSameAsCurrentMsg'));
      return;
    }
    setCredFieldError('');
    setShowCredOtpModal(true);
  };

  const handleCredentialOtpVerified = async () => {
    setCredSaving(true);
    setCredFieldError('');
    try {
      const value = credNewValue.trim();
      await api.updateLoginCredentials({ newPhone: value });
      alert(t('loginCredentialsUpdatedMsg'));
      cancelEditCredential();
    } catch (err) {
      setCredFieldError(err.message || t('failedUpdateCredentialsMsg'));
    } finally {
      setCredSaving(false);
    }
  };

  const handleRequestDeleteAccount = () => {
    if (!window.confirm(t('deleteAccountConfirmPrompt'))) return;
    setDeleteAccountError('');
    setShowDeleteOtpModal(true);
  };

  const handleDeleteAccountOtpVerified = async () => {
    setDeleteAccountBusy(true);
    setDeleteAccountError('');
    try {
      await api.deleteAccount();
      // api.deleteAccount() already clears the local session on success - the
      // app shell's own isAuthenticated check takes it from here, the same
      // way it does after a normal logout.
    } catch (err) {
      setDeleteAccountError(err.message || t('failedDeleteAccountMsg'));
      setShowDeleteOtpModal(false);
    } finally {
      setDeleteAccountBusy(false);
    }
  };

  const refreshAll = () => {
    fetchSettings();
    fetchReferralOverview();
  };

  // Super Admin only (shopId set) - only suspending needs a confirm, since it
  // blocks the shop's login immediately (see AuthService.login's
  // suspended-account check), while reactivating is safe/reversible-in-place.
  const handleToggleShopStatus = async () => {
    if (shopIsActive && !confirm(t('confirmSuspendShopMsg').replace('{name}', shopName))) return;
    setSuspendBusy(true);
    try {
      await api.suspendShop(shopId, !shopIsActive);
      setShopIsActive(!shopIsActive);
    } catch (e) {
      alert(e.message);
    } finally {
      setSuspendBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingWorkspaceSettingsMsg')}</span>
      </div>
    );
  }

  // A failed fetch (flaky network, expired session, etc.) used to leave every
  // field silently blank with no indication anything went wrong. Show a
  // dedicated error state with a retry action instead of a broken-looking form.
  if (settingsError) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 260, textAlign: 'center' }}>
        <div className="icon-badge red" style={{ width: 44, height: 44, borderRadius: '50%' }}><AlertTriangle /></div>
        <div>
          <p style={{ fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)', marginBottom: 4 }}>{t('failedLoadShopSettingsMsg')}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{settingsError}</p>
        </div>
        <button onClick={refreshAll} className="btn btn-primary">
          <RefreshCw className="h-4 w-4" /><span>{t('btnRetry')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>{t('settings')}</h1>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card">
            <div className="section-title">
              <div>
                <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Store style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                  {t('workspaceProfileTitle')}
                </h2>
                <span className="sub">{t('businessIdentityContactDesc')}</span>
              </div>
              {!editMode && (
                <button type="button" onClick={() => setEditMode(true)} className="btn btn-outline btn-sm">
                  <Edit style={{ width: 14, height: 14 }} />
                  <span>{t('btnEdit')}</span>
                </button>
              )}
            </div>

            <form onSubmit={handleUpdate}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>{t('workspaceDisplayNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="text" required readOnly={!editMode} disabled={!editMode} value={shopName} onChange={(e) => setShopName(e.target.value)} />
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('phoneNumberLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="tel" required readOnly={!editMode} disabled={!editMode} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
                  </div>
                </div>

                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><MapPin /></div><b>{t('registeredAddressLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="text" required readOnly={!editMode} disabled={!editMode} value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Subscription Validity - read-only, sourced from
                  getSettings()'s `subscriptions` relation. Renewal itself is
                  a Super Admin action (see ShopService.updateSubscription);
                  this is purely informational so a Shop Admin can check their
                  own expiry date without waiting for the grace-period alert. */}
              {subscriptionInfo && (
                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="reg-field" style={{ marginBottom: 0 }}>
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Calendar /></div><b>{t('subscriptionValidUntilLabel')}</b></div>
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>
                        {new Date(subscriptionInfo.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      <span className={`badge ${subscriptionInfo.status === 'ACTIVE' ? 'badge-active' : 'badge-suspended'}`}>
                        <span className="dot"></span>{subscriptionInfo.plan}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Status - Super Admin only. Placed here (inside the
                  shop being managed's own Workspace Profile) rather than as
                  an icon on the Shops Management list card, so the action
                  sits alongside the rest of that shop's details instead of
                  cluttering the list with a per-row control. */}
              {shopId && (
                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="reg-field" style={{ marginBottom: 0 }}>
                    <div className="reg-field-label">
                      <div className="reg-ico" style={{ background: shopIsActive ? 'var(--jgreen)' : 'var(--red)' }}>
                        {shopIsActive ? <ShieldCheck /> : <Ban />}
                      </div>
                      <b>{t('accountStatusLabel')}</b>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`badge ${shopIsActive ? 'badge-active' : 'badge-suspended'}`}>
                        <span className="dot"></span>{shopIsActive ? t('active') : t('suspended')}
                      </span>
                      <button
                        type="button"
                        onClick={handleToggleShopStatus}
                        disabled={suspendBusy}
                        className="btn btn-sm"
                        style={{
                          background: shopIsActive ? 'var(--red-dim)' : 'var(--jgreen-dim)',
                          color: shopIsActive ? 'var(--red)' : 'var(--jgreen)',
                          border: `1px solid ${shopIsActive ? 'var(--red)' : 'var(--jgreen)'}`,
                        }}
                      >
                        {suspendBusy && <RefreshCw className="h-4 w-4 animate-spin" />}
                        <span>{shopIsActive ? t('suspendShopBtn') : t('reactivateShopBtn')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Shop Verification Document Section */}
              <div className="reg-section" style={{ marginBottom: 0 }}>
                {(() => {
                  const value = verificationDoc;
                  const isPdf = value && value.fileUrl && value.fileUrl.toLowerCase().endsWith('.pdf');
                  return (
                    <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          <span className="icon-badge purple" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }}><FileCheck style={{ width: 10, height: 10 }} /></span>
                          {t('verificationDocumentLabel')}
                        </span>
                        <span className={`badge ${value ? 'badge-active' : 'badge-pending'}`} style={{ padding: '2px 8px', fontSize: 9 }}>
                          <span className="dot"></span>{value ? t('uploadedBadge') : t('missingBadge')}
                        </span>
                      </div>
                      {value ? (
                        <div style={{ height: 140, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isPdf ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--red)', fontWeight: 800 }}>
                              <FileText style={{ width: 15, height: 15 }} /> {t('pdfFileLabel')}
                            </span>
                          ) : (
                            <img src={getAssetUrl(value.fileUrl)} className="w-full h-full object-cover" alt={t('verificationDocumentLabel')} />
                          )}
                        </div>
                      ) : (
                        <div style={{ height: 140, borderRadius: 10, border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                          <FileCheck style={{ width: 24, height: 24 }} />
                        </div>
                      )}
                      <div className="flex gap-2">
                        {value ? (
                          <>
                            <button
                              type="button"
                              onClick={() => downloadAsset(value.fileUrl, value.originalName || filenameForAsset(value.fileUrl, 'verification_document'))}
                              className="btn btn-primary btn-sm"
                              style={{ flex: 1, fontSize: 10.5, padding: '8px 10px' }}
                            >
                              <Download style={{ width: 12, height: 12 }} />
                              <span>{t('downloadTitleLabel')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleDocRemove}
                              className="btn btn-danger-outline btn-sm"
                              style={{ flex: 1, fontSize: 10.5, padding: '8px 10px' }}
                            >
                              <Trash style={{ width: 12, height: 12 }} />
                              <span>{t('btnRemove')}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            {IS_NATIVE_APP && (
                              <button
                                type="button"
                                onClick={handleCaptureDocPhoto}
                                disabled={docUploading}
                                className="btn btn-ghost btn-sm"
                                style={{ flex: 1, fontSize: 10.5, padding: '8px 10px', opacity: docUploading ? 0.6 : 1 }}
                              >
                                <Camera style={{ width: 12, height: 12 }} />
                                <span>{t('useCameraBtn')}</span>
                              </button>
                            )}
                            <label className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 10.5, padding: '8px 10px', cursor: docUploading ? 'not-allowed' : 'pointer', opacity: docUploading ? 0.6 : 1 }}>
                              {docUploading ? <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
                              <span>{docUploading ? t('uploadingEllipsisLabel') : t('chooseFromGalleryBtn')}</span>
                              <input
                                type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={docUploading}
                                onClick={primeStoragePermission}
                                onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; handleDocFileSelected(file); }}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {editMode && (
                <div className="form-action-bar flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20, gap: 10 }}>
                  <button type="button" onClick={handleCancelEdit} className="btn btn-ghost">
                    <span>{t('btnCancel')}</span>
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <Check />
                    <span>{t('saveWorkspaceDetailsBtn')}</span>
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        <div>
          {/* Admin User Credentials Block - this is the logged-in user's own
          account/password, so it's meaningless (and hidden) when a Super
          Admin is managing another shop's settings on its behalf. */}
          {!shopId && (
            <div className="card">
              <div className="section-title">
                <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                  {t('adminCredentialsTitle')}
                </h2>
              </div>

              <div className="reg-section">
                <div className="reg-field" style={{ marginBottom: 12 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('usernameNameLabel')}</b></div>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)' }}>{user.name}</p>
                </div>
                <div className="reg-field" style={{ marginBottom: 12 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Mail /></div><b>{t('emailAddressLabel')}</b></div>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>{user.email || t('noEmailOnFileLabel')}</p>
                </div>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Phone /></div><b>{t('phoneNumberLabel')}</b></div>
                  {editingCredField === 'phone' ? (
                    <div>
                      <div className="input-wrap">
                        <input
                          type="tel"
                          autoFocus
                          disabled={credSaving}
                          value={credNewValue}
                          onChange={(e) => setCredNewValue(e.target.value)}
                          placeholder={t('enterNewPhonePlaceholder')}
                        />
                      </div>
                      {credFieldError && <p style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700, marginTop: 6 }}>{credFieldError}</p>}
                      <div className="flex gap-2" style={{ marginTop: 8 }}>
                        <button type="button" disabled={credSaving} onClick={cancelEditCredential} className="btn btn-ghost" style={{ flex: 1 }}>{t('btnCancel')}</button>
                        <button type="button" disabled={credSaving} onClick={handleRequestCredentialOtp} className="btn btn-primary" style={{ flex: 2 }}>
                          {credSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('sendOtpBtn')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>{user.phone || 'N/A'}</p>
                      <button onClick={() => startEditCredential('phone')} className="icon-btn" title={t('editLoginCredentialTitle')}>
                        <Edit style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="reg-section" style={{ marginBottom: 0 }}>
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><KeyRound /></div><b>{t('workspacePasswordLabel')}</b></div>
                  <div className="flex items-center justify-between" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '10px 14px' }}>
                    <div className="flex items-center gap-2">
                      {revealPassword ? (
                        <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800, fontSize: 13 }}>{revealedPasswordVal}</span>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', letterSpacing: '.15em' }}>••••••••</span>
                      )}
                    </div>
                    <button
                      onClick={() => (revealPassword ? setRevealPassword(false) : setShowPassVerifyModal(true))}
                      className="icon-btn"
                      title={revealPassword ? t('hidePasswordTitle') : t('revealPasswordTitle')}
                    >
                      {revealPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setOtpResetOpen(true)}
                  className="btn btn-outline btn-block"
                >
                  <Lock />
                  <span>{t('forgotPasswordResetOtpBtn')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Delete Account Block - own account only, same !shopId guard as
          Admin Credentials above (a Super Admin managing another shop's
          settings should use Suspend from Shops Management instead, not this). */}
          {!shopId && (
            <div className="card" style={{ marginTop: 20, borderColor: 'var(--red-dim)' }}>
              <div className="section-title">
                <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
                  <Trash style={{ width: 16, height: 16, color: 'var(--red)' }} />
                  {t('deleteAccountTitle')}
                </h2>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.6, marginBottom: 14 }}>
                {t('deleteAccountWarning')}
              </p>
              {deleteAccountError && <p style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700, marginBottom: 10 }}>{deleteAccountError}</p>}
              <button
                type="button"
                disabled={deleteAccountBusy}
                onClick={handleRequestDeleteAccount}
                className="btn btn-block"
                style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)' }}
              >
                {deleteAccountBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash style={{ width: 16, height: 16 }} />}
                <span>{t('deleteAccountBtn')}</span>
              </button>
            </div>
          )}

          {/* Referral & Rewards Block */}
          <div className="card" style={{ marginTop: shopId ? 0 : 20 }}>
            <div className="section-title">
              <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BadgePercent style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                {t('referralProgramTitle')}
              </h2>
              <span className="sub">{t('referralProgramDesc')}</span>
            </div>

            {referralCode ? (
              <div>
                <div className="flex items-center justify-between" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '12px 16px', marginBottom: 14 }}>
                  <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800, fontSize: 16, letterSpacing: '.1em' }}>{referralCode}</span>
                  <button onClick={handleCopyReferralCode} className="icon-btn" title={t('copyTitle')}>
                    {referralCopied ? <CheckCircle2 style={{ color: 'var(--green)' }} /> : <Copy />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '14px 16px', textAlign: 'center' }}>
                    <Award style={{ width: 15, height: 15, color: 'var(--gold)' }} />
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', color: 'var(--text-0)', marginTop: 4 }}>{referralPoints}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 2 }}>{t('totalReferralPointsLabel')}</div>
                  </div>
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '14px 16px', textAlign: 'center' }}>
                    <Users style={{ width: 15, height: 15, color: 'var(--blue)' }} />
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', color: 'var(--text-0)', marginTop: 4 }}>{totalReferrals}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 2 }}>{t('totalSuccessfulReferralsLabel')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 16 }}>
                  <button onClick={handleShareReferralWhatsApp} className="btn btn-primary">
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }} fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z"/></svg>
                    <span>{t('shareViaWhatsAppBtn')}</span>
                  </button>
                  <button onClick={handleCopyReferralLink} className="btn btn-outline">
                    {linkCopied ? <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--green)' }} /> : <Link2 style={{ width: 16, height: 16 }} />}
                    <span>{t('copyLinkBtn')}</span>
                  </button>
                </div>

                <div>
                  <span className="side-section-label" style={{ padding: 0, marginBottom: 8, display: 'block' }}>{t('referralHistoryTitle')}</span>
                  {referralHistory.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{t('noReferralsYetMsg')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {referralHistory.map((r, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '10px 14px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shopName}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>{new Date(r.registeredAt).toLocaleDateString()}</div>
                          </div>
                          <span style={{ flexShrink: 0, background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '4px 10px' }}>+{r.pointsEarned} pt</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={handleGenerateReferralCode} disabled={referralGenerating} className="btn btn-primary btn-block">
                {referralGenerating ? <RefreshCw className="animate-spin" /> : <BadgePercent />}
                <span>{referralGenerating ? t('generatingEllipsisLabel') : t('generateReferralCodeBtn')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Password Verification Modal overlay */}
      {showPassVerifyModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 380, margin: 'auto', padding: 28, position: 'relative' }}>
            <button
              onClick={() => { setShowPassVerifyModal(false); setPassVerifyError(''); }}
              className="icon-btn"
              style={{ position: 'absolute', top: 18, right: 18 }}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center mb-6" style={{ textAlign: 'center' }}>
              <div className="icon-badge maroon" style={{ marginBottom: 10 }}><Lock /></div>
              <h2 style={{ fontSize: 18 }}>{t('confirmYourPasswordTitle')}</h2>
              <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('verifyIdentityRevealDesc')}</p>
            </div>

            <form onSubmit={handlePasswordVerificationSubmit}>
              {passVerifyError && (
                <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', marginBottom: 16, fontWeight: 600 }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{passVerifyError}</span>
                </div>
              )}

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('accountPasswordLabel')} <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type={showVerifyPass ? "text" : "password"} required value={passVerifyInput} onChange={(e) => setPassVerifyInput(e.target.value)}
                    placeholder={t('enterPasswordPlaceholder')} style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPass(!showVerifyPass)}
                    className="pwd-toggle-btn"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                  >
                    {showVerifyPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowPassVerifyModal(false); setPassVerifyError(''); }} className="btn btn-ghost" style={{ flex: 1 }}>{t('btnCancel')}</button>
                <button type="submit" disabled={passVerifyLoading} className="btn btn-primary" style={{ flex: 2 }}>
                  {passVerifyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('btnConfirm')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <Suspense fallback={null}>
      <OtpVerificationModal
        open={showCredOtpModal}
        onClose={() => setShowCredOtpModal(false)}
        onVerified={handleCredentialOtpVerified}
        api={api}
        identifier={credNewValue.trim()}
        method="phone"
        purpose="change-credentials"
        title={t('verifyOtpModalTitle')}
        description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', credNewValue.trim())}
        t={t}
      />
      </Suspense>

      <Suspense fallback={null}>
      <OtpVerificationModal
        open={showDeleteOtpModal}
        onClose={() => setShowDeleteOtpModal(false)}
        onVerified={handleDeleteAccountOtpVerified}
        api={api}
        identifier={user.phone}
        method="phone"
        purpose="delete-account"
        title={t('verifyOtpModalTitle')}
        description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', user.phone)}
        t={t}
      />
      </Suspense>

      {/* OTP Password Reset Modal inside Settings */}
      {otpResetOpen && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 440, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Lock /> {t('accountRecoveryEyebrow')}</span>
                <h2 style={{ fontSize: 18 }}>{t('resetAccountPasswordTitle')}</h2>
              </div>
              <button onClick={() => setOtpResetOpen(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!otpResetVerified ? (
              <div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Phone /></div><b>{t('registeredPhoneNumberLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={otpResetIdentifier} onChange={(e) => setOtpResetIdentifier(e.target.value)}
                      placeholder="+91 99999 99999"
                    />
                  </div>
                </div>
                {otpResetError && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{otpResetError}</div>}
                <button
                  onClick={handleOtpResetSend}
                  className="btn btn-primary btn-block"
                >
                  <Phone />
                  <span>{t('sendOtpVerificationCodeBtn')}</span>
                </button>

                <Suspense fallback={null}>
                <OtpVerificationModal
                  open={showShopOtpResetModal}
                  onClose={() => setShowShopOtpResetModal(false)}
                  onVerified={() => setOtpResetVerified(true)}
                  api={api}
                  identifier={otpResetIdentifier}
                  method="phone"
                  purpose="reset"
                  title={t('verifyOtpModalTitle')}
                  description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', otpResetIdentifier)}
                  t={t}
                />
                </Suspense>
              </div>
            ) : (
              <form onSubmit={handleOtpResetSubmit}>
                {otpResetError && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{otpResetError}</div>}
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('newPasswordLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type={otpShowNewPass ? "text" : "password"} required value={otpResetNewPassword} onChange={(e) => setOtpResetNewPassword(e.target.value)}
                      placeholder={t('min6CharactersPlaceholder')} style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      onClick={() => setOtpShowNewPass(!otpShowNewPass)}
                      className="pwd-toggle-btn"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                    >
                      {otpShowNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('confirmPasswordLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type={otpShowConfirmPass ? "text" : "password"} required value={otpResetConfirmPassword} onChange={(e) => setOtpResetConfirmPassword(e.target.value)}
                      placeholder={t('retypePasswordPlaceholder')} style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      onClick={() => setOtpShowConfirmPass(!otpShowConfirmPass)}
                      className="pwd-toggle-btn"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                    >
                      {otpShowConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit" disabled={otpResetLoading}
                  className="btn btn-primary btn-block"
                >
                  {otpResetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('updatePasswordBtn')}
                </button>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

export default ShopSettingsView;
