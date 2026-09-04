import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '../utils/backHandler';
import { getFresh, setCache } from '../utils/fetchCache';
import { useSubmitting } from '../hooks/useSubmitting';
import { cleanGoogleImageUrl, resizeImageFileToBlob } from '../utils/imageUtils';
import { primeStoragePermission } from '../utils/platform';
import CustomSelect from '../components/CustomSelect';
import {
  Users, Radio, Plus, AlertTriangle, Trash, RefreshCw, Edit, Sliders, Bell,
  Upload, Calendar, Sparkles, Megaphone, CalendarRange, Smartphone,
  X,
} from 'lucide-react';

// ============================================================================
// In-memory caches (module scope) - the Banner/Offer Management sub-tab
// toggle unmounts/remounts this view on every click between "Banner
// Management" and "Offer Management", which admins do repeatedly in one
// visit, so without this every toggle blanked to a spinner and re-fetched
// both the ad list and the platform-wide shop dropdown from scratch. Shops
// list is also shared with the Create Customer wizard's shop-selector,
// which rarely needs the platform list to have changed since it was last
// fetched.
let adsListCache = null;
let platformShopsCache = null;
// Within this many ms of the last fetch, a revisit skips the network/DB
// round-trip entirely (see fetchCache.js) instead of just avoiding the
// blank-spinner flash the caches above already handled.
const ADS_TTL_MS = 30 * 1000;
const ADS_LIST_CACHE_KEY = 'super-ads:default';
const PLATFORM_SHOPS_CACHE_KEY = 'platform-shops:default';

function AdsManagementView({ t, api }) {
  const [ads, setAds] = useState(adsListCache || []);
  const [shops, setShops] = useState(platformShopsCache || []);
  const [loading, setLoading] = useState(!adsListCache);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editingAdId, setEditingAdId] = useState(null);
  const { submitting, run } = useSubmitting();

  // Form states
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  // True only while a picked file is being resized+uploaded (see
  // handleImageFileSelect) - mirrors PromotionsFeed's identical pattern.
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [type, setType] = useState('BANNER');
  // Default both dates to today rather than leaving them blank - a fresh
  // campaign almost always starts today, and it saves having to open the
  // date picker just to set a sensible default.
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState(0);
  const [targetAll, setTargetAll] = useState(true);
  const [targetShops, setTargetShops] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Resizes the picked file client-side, uploads it to real file storage,
  // and sets imageUrl to the returned URL - see PromotionsFeed's identical
  // handleImageFileSelect for the full rationale.
  const handleImageFileSelect = async (file) => {
    if (!file) return;
    setImageUploadError('');
    setImageUploading(true);
    try {
      const blob = await resizeImageFileToBlob(file);
      const { url } = await api.uploadAdImage(blob);
      setImageUrl(url);
    } catch (e) {
      console.error('Failed to upload banner image:', e);
      setImageUploadError(e.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  useEffect(() => {
    fetchAds();
    fetchShops();
  }, []);

  const fetchAds = async () => {
    // A fresh-enough cache skips the network/DB round-trip entirely, not
    // just the loading spinner (see ADS_TTL_MS).
    const freshAds = getFresh(ADS_LIST_CACHE_KEY, ADS_TTL_MS);
    if (freshAds) {
      setAds(freshAds);
      setLoading(false);
      return;
    }
    // Only blank to a spinner when there's nothing on screen yet - a
    // revisit renders the cached list instantly and refreshes silently.
    if (ads.length === 0) setLoading(true);
    try {
      const res = await api.getAdvertisements();
      setAds(res);
      adsListCache = res;
      setCache(ADS_LIST_CACHE_KEY, res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchShops = async () => {
    const fresh = getFresh(PLATFORM_SHOPS_CACHE_KEY, ADS_TTL_MS);
    if (fresh) {
      setShops(fresh);
      return;
    }
    try {
      const res = await api.getShops();
      setShops(res);
      platformShopsCache = res;
      setCache(PLATFORM_SHOPS_CACHE_KEY, res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    run(async () => {
      setErrorMsg('');
      try {
        const dto = {
          title, imageUrl, type,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          priority: Number(priority),
          targetAll,
          targetShops
        };
        if (editingAdId) {
          await api.updateAdvertisement(editingAdId, dto);
        } else {
          await api.createAdvertisement(dto);
        }
        setShowAddModal(false);
        resetForm();
        fetchAds();
      } catch (err) {
        setErrorMsg(err.message || (editingAdId ? t('failedUpdateCampaign') : t('failedScheduleCampaign')));
      }
    });
  };

  const resetForm = () => {
    setEditingAdId(null);
    setTitle('');
    setImageUrl('');
    setImageUploadError('');
    setType('BANNER');
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setPriority(0);
    setTargetAll(true);
    setTargetShops([]);
    setErrorMsg('');
  };

  const handleEditClick = (ad) => {
    setEditingAdId(ad.id);
    setTitle(ad.title);
    setImageUrl(ad.imageUrl);
    setType(ad.type);
    setStartDate(new Date(ad.startDate).toISOString().slice(0, 10));
    setEndDate(new Date(ad.endDate).toISOString().slice(0, 10));
    setPriority(ad.priority ?? 0);
    setTargetAll(ad.targetAll);
    setTargetShops(ad.targetShops || []);
    setErrorMsg('');
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('confirmTerminateAdCampaign'))) return;
    try {
      await api.deleteAdvertisement(id);
      fetchAds();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleShopSelectChange = (shopId) => {
    if (targetShops.includes(shopId)) {
      setTargetShops(targetShops.filter(id => id !== shopId));
    } else {
      setTargetShops([...targetShops, shopId]);
    }
  };

  const adTypeMeta = (type) => {
    if (type === 'POPUP') return { label: t('interactivePopupLabel'), icon: Sparkles };
    if (type === 'NOTICE') return { label: t('textNoticeLabel'), icon: Bell };
    if (type === 'APP_POSTER') return { label: t('appOpenPosterLabel'), icon: Smartphone };
    return { label: t('mainBannerLabel'), icon: Radio };
  };

  const isLive = (ad) => {
    const now = Date.now();
    return new Date(ad.startDate).getTime() <= now && new Date(ad.endDate).getTime() >= now;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Megaphone /> {t('growthMarketingLabel')}</div>
          <h1>{t('adCampaignsTitle')}</h1>
          <p>{t('publishBannersPopupsDesc')}</p>
        </div>
      </div>

      {/* Portaled to escape .animate-fade-in's permanent transform (fill-mode
          forwards) - see ShopsManagementView's identical FAB for why. */}
      {createPortal(
        <button
          type="button"
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="fab"
          aria-label={t('newAdCampaignBtn')}
          title={t('newAdCampaignBtn')}
        >
          <Plus />
        </button>,
        document.body
      )}

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingCampaignsMsg')}</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge"><Megaphone /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noAdCampaignsScheduled')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {ads.map(ad => {
            const meta = adTypeMeta(ad.type);
            const Icon = meta.icon;
            const live = isLive(ad);
            return (
              <div key={ad.id} className="product-card">
                <div className="product-img" style={{ height: 160 }}>
                  {ad.imageUrl ? (
                    <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title} loading="lazy" className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                  ) : (
                    <Icon />
                  )}
                  <span className="product-tag"><Icon className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{meta.label}</span>
                  <span className={`badge ${live ? 'badge-active' : 'badge-suspended'}`} style={{ position: 'absolute', top: 10, right: 10 }}>
                    <span className="dot" />{live ? t('liveLabel') : t('scheduledLabel')}
                  </span>
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between">
                    <span className="pname">{ad.title}</span>
                    <span className="badge badge-gold">{t('priorityLabel')} {ad.priority}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--text-2)', background: 'var(--card-2)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, fontWeight: 600 }}>
                    <div>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('startLabel')}</span>
                      {new Date(ad.startDate).toLocaleDateString()}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('endLabel')}</span>
                      {new Date(ad.endDate).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Users className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {ad.targetAll ? t('allKeyShopsLabel') : (ad.targetShops.length === 1 ? t('targetedShopSingular').replace('{n}', ad.targetShops.length) : t('targetedShopsPlural').replace('{n}', ad.targetShops.length))}
                  </div>

                  <div className="flex gap-2" style={{ marginTop: 4 }}>
                    <button
                      onClick={() => handleEditClick(ad)}
                      className="btn btn-ghost btn-sm btn-block"
                      style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                    >
                      <Edit className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                      <span>{t('editBtn')}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(ad.id)}
                      className="btn btn-danger-outline btn-sm btn-block"
                      style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                    >
                      <Trash className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                      <span>{t('cancelCampaignBtn')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign Add Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Radio /> {t('adCampaignLabel')}</span>
                <h2 style={{ fontSize: 19 }}>{editingAdId ? t('editAdCampaignTitle') : t('newVisualAdCampaignTitle')}</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>{t('adTitleAnnouncementLabel')}</label>
                <div className="input-wrap">
                  <Megaphone />
                  <input
                    type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('adTitlePlaceholderEg')}
                  />
                </div>
              </div>

              <div className="field">
                <label>{t('bannerImageSourceLabel')}</label>
                <label className="btn btn-ghost btn-sm" style={{ cursor: imageUploading ? 'default' : 'pointer', opacity: imageUploading ? 0.6 : 1 }}>
                  {imageUploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{imageUploading ? t('uploadingLabel') : t('uploadBtn')}</span>
                  <input
                    type="file" accept="image/*" className="hidden" disabled={imageUploading}
                    onClick={primeStoragePermission}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      e.target.value = '';
                      handleImageFileSelect(file);
                    }}
                  />
                </label>
                {imageUploadError && (
                  <p style={{ marginTop: 6, fontSize: 11, color: 'var(--rose)', fontWeight: 700 }}>{imageUploadError}</p>
                )}
                {imageUrl && (
                  <div style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', height: 110, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={cleanGoogleImageUrl(imageUrl)} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>{t('adFormatLabel')}</label>
                  <CustomSelect
                    value={type} onChange={setType}
                    options={[
                      { value: 'BANNER', label: t('mainBannerNoticeOption') },
                      { value: 'POPUP', label: t('interactiveLoginPopupOption') },
                      { value: 'APP_POSTER', label: t('appOpenPosterOption') },
                    ]}
                  />
                </div>
                <div className="field">
                  <label>{t('campaignPriorityLabel')}</label>
                  <div className="input-wrap">
                    <Sliders />
                    <input
                      type="number" required value={priority} onChange={(e) => setPriority(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="form-grid" style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                <div className="field">
                  <label>{t('startDateLabel')}</label>
                  <div className="input-wrap">
                    <Calendar />
                    <input
                      type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>{t('endDateLabelShort')}</label>
                  <div className="input-wrap">
                    <CalendarRange />
                    <input
                      type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                <label className="eyebrow" style={{ marginBottom: 10 }}><Users /> {t('targetAudienceLabel')}</label>
                <div className="flex gap-4 items-center" style={{ marginBottom: 10 }}>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>
                    <input
                      type="radio" name="target" checked={targetAll} onChange={() => setTargetAll(true)}
                      style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                    />
                    <span>{t('broadcastAllKeyShops')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>
                    <input
                      type="radio" name="target" checked={!targetAll} onChange={() => setTargetAll(false)}
                      style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                    />
                    <span>{t('targetSpecificShops')}</span>
                  </label>
                </div>

                {!targetAll && (
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: 12, maxHeight: 140, overflowY: 'auto' }}>
                    {shops.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600, padding: '5px 4px' }}>
                        <input
                          type="checkbox" checked={targetShops.includes(s.id)} onChange={() => handleShopSelectChange(s.id)}
                          style={{ accentColor: 'var(--gold)', width: 14, height: 14 }}
                        />
                        <span>{s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={imageUploading || submitting}
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {editingAdId ? t('saveChangesBtn') : t('scheduleCampaignBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default AdsManagementView;
