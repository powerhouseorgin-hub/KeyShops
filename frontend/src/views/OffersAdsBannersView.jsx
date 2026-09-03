import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cleanGoogleImageUrl } from '../utils/imageUtils';
import {
  Sparkles, RefreshCw, Megaphone, BadgePercent, Percent, Clock, Phone,
  X,
} from 'lucide-react';

// ============================================================================
// SHOP ADMIN: OFFERS, ADS & BANNERS - read-only browse screen for every active
// advertisement (popup/banner/notice) and every independent (shopId === null)
// offer the Super Admin has published. Ads are already active+targeted-filtered
// server-side (AdService.getTargetedAds); offers are filtered here client-side.
// ============================================================================
function OffersAdsBannersView({ t, api }) {
  const [ads, setAds] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Ads have no other detail to navigate to (no CTA/link/description field on
  // Advertisement) - tapping a card just shows its image at full size, same
  // pattern as the public pre-login app's PublicAdViewer.
  const [viewingAd, setViewingAd] = useState(null);

  // Locks background scroll while the full-screen poster is open - it's a
  // `position: fixed` overlay so the page behind it can't visually move,
  // but without this the body itself could still scroll underneath it on
  // touch devices.
  useEffect(() => {
    if (!viewingAd) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [viewingAd]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [adsRes, promosRes] = await Promise.all([api.getAdvertisements(), api.getPromotions()]);
        setAds(adsRes || []);
        const now = new Date();
        setOffers(
          (promosRes || []).filter(
            (p) => p.type === 'OFFER' && !p.shopId && (!p.validUntil || new Date(p.validUntil) >= now)
          )
        );
      } catch (e) {
        console.error('Failed to load offers/ads/banners', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const typeLabel = { POPUP: t('interactivePopupLabel'), BANNER: t('mainBannerLabel'), NOTICE: t('textNoticeLabel') };
  const accents = ['var(--gold)', 'var(--teal)', 'var(--rose)', 'var(--purple)', 'var(--skyblue)', 'var(--jgreen)'];

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Sparkles /> {t('fromKeyShopHqLabel')}</div>
          <h1>{t('offersAdsBannersTitle')}</h1>
          <p>{t('everyActiveAdOfferDesc')}</p>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingEllipsis')}</span>
        </div>
      ) : ads.length === 0 && offers.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge teal"><Megaphone /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('nothingPublishedYet')}</span>
        </div>
      ) : (
        <>
          {ads.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '4px 0 12px' }}>{t('advertisementsAndBannersLabel')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16, marginBottom: 26 }}>
                {ads.map((ad, i) => (
                  <div
                    key={ad.id}
                    onClick={() => setViewingAd(ad)}
                    style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${accents[i % accents.length]}`, background: 'var(--card-2)', cursor: 'pointer' }}
                  >
                    <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title} loading="lazy" style={{ width: '100%', height: 150, objectFit: 'cover' }} />
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="badge" style={{ alignSelf: 'flex-start', background: accents[i % accents.length], color: 'var(--bg-0, #0a0908)', fontSize: 10 }}>
                        {typeLabel[ad.type] || ad.type}
                      </span>
                      <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-0)' }}>{ad.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {offers.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '4px 0 12px' }}>{t('offersLabel')}</h3>
              <div className="product-grid stagger-in">
                {offers.map((promo) => (
                  <div key={promo.id} className="product-card">
                    <div className="product-img" style={{ height: 150, aspectRatio: '1 / 1', maxHeight: 190 }}>
                      {promo.imageUrl ? (
                        <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} loading="lazy" className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                      ) : (
                        <div className="icon-badge rose"><BadgePercent /></div>
                      )}
                    </div>
                    <div className="product-body">
                      <span className="pname">{promo.title}</span>
                      {promo.description && <p className="cell-sub" style={{ fontSize: 11.5 }}>{promo.description}</p>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {promo.discountPercentage != null && (
                          <span className="badge badge-active">
                            <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                            {promo.discountPercentage}{t('percentOffSuffix')}
                          </span>
                        )}
                        {promo.validUntil && (
                          <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                            <Clock className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                            {t('validTillPrefix')} {new Date(promo.validUntil).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {promo.phone && (
                        <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{t('callPrefix')}: {promo.phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {viewingAd && createPortal(
        // Portaled to document.body - rendering this inline (as it was
        // before) put it under app-main's own stacking/scroll context, so
        // `position: fixed` was computing relative to that scrolled
        // ancestor instead of the true viewport: tapping a poster near the
        // bottom of a long list opened it below the visible screen,
        // requiring a scroll to find it. Every other full-screen modal in
        // this file already portals to document.body for exactly this
        // reason - this one had been missed.
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          style={{ overflow: 'hidden' }}
          onClick={() => setViewingAd(null)}
        >
          <button
            type="button"
            onClick={() => setViewingAd(null)}
            className="icon-btn"
            style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            aria-label={t('btnClose')}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={cleanGoogleImageUrl(viewingAd.imageUrl)}
            alt={viewingAd.title}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12 }}
          />
          {viewingAd.title && (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 14, textAlign: 'center' }}>{viewingAd.title}</span>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default OffersAdsBannersView;
