import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { cleanGoogleImageUrl } from '../utils/imageUtils';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import usedMachinesImg from '../assets/dashboard-icons/used-machines.png';
import ecmServiceImg from '../assets/dashboard-icons/ecm-service.png';
import meterServiceImg from '../assets/dashboard-icons/meter-service.png';
import scanningServiceImg from '../assets/dashboard-icons/scanning-service.png';
import dealerIcon from '../assets/dashboard-icons/dealer.png';
import customerSupportIcon from '../assets/dashboard-icons/customer-support.png';
import {
  AlertTriangle, Sparkles, Wrench, Cpu, Gauge, ScanLine,
  X,
} from 'lucide-react';

// ============================================================================
// COMPONENT 1: DASHBOARD VIEW WITH INTERACTIVE CARD DETAILS
// ============================================================================
// Product-type shortcut cards shown on both the Shop Admin and Super Admin
// dashboards. `type` values must exactly match a product type name managed
// by the Super Admin (Support > Product Types, see PromotionsFeed below) so
// tapping a card can route straight into the Inventory screen pre-filtered
// to that category via searchDispatch.
// Flat two-tone "add customer" glyph (light-blue head/shoulders + a white
// plus-badge) used on the New/Add Customer cards on both dashboards,
// mirroring the look of the reference design the user asked for. This is
// original vector artwork drawn from scratch (plain circles/paths), not a
// copy of any third-party icon asset, so it carries none of the licensing
// concerns that reusing someone else's app screenshot/icon file would.
function AddCustomerIcon() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="22" r="13" fill="#29B6F6" />
      <path d="M8 56c0-13.3 9.8-21 22-21s22 7.7 22 21" fill="#1E88E5" />
      <circle cx="47" cy="45" r="13" fill="#ffffff" stroke="#1565C0" strokeWidth="3" />
      <path d="M47 39v12M41 45h12" stroke="#1565C0" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

const DASHBOARD_PRODUCT_CARDS = [
  { type: 'Used Machines', icon: Wrench, image: usedMachinesImg, description: 'View and manage used machines', imgScale: 1.25, accent: 'var(--purple)' },
  { type: 'ECM', icon: Cpu, image: ecmServiceImg, description: 'Manage ECM records', accent: 'var(--orange)' },
  // imgScale: the Meter product photo has more transparent padding baked
  // into the source image than the other three, so at the shared
  // .icon-badge.photo size it reads visibly smaller than its siblings even
  // though the box is identical - a small CSS scale-up (applied to the
  // <img> only, box size untouched) compensates for that without affecting
  // Used Machines/ECM/Scanning.
  { type: 'Meter', icon: Gauge, image: meterServiceImg, description: 'Track and manage meter records', imgScale: 1.14, accent: 'var(--skyblue)' },
  { type: 'Scanning', icon: ScanLine, image: scanningServiceImg, description: 'Scan & process compliance entries', accent: 'var(--teal)' },
];

// Generic 2-column "info card" grid used across the dashboards - an icon
// badge top-left, a bold title, and a short description underneath. Used for
// the product-type shortcuts, the shop-admin quick actions, and the
// subscription/inventory shortcuts so all of these read as one consistent
// card language. When an item provides an `image` (see
// DASHBOARD_PRODUCT_CARDS), that photo fills the badge instead of the
// lucide icon, so cards like "Used Machines" show an actual product photo
// rather than a generic outline glyph.
function DashCardGrid({ items }) {
  return (
    <div className="dash-card-grid">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <button
            key={idx}
            type="button"
            className={`dash-card animate-fade-in${item.fullWidth ? ' dash-card-full' : ''}${item.accent ? ' dash-card-tint' : ''}`}
            style={{ animationDelay: `${idx * 0.05}s`, ...(item.accent ? { '--tint': item.accent } : {}) }}
            onClick={item.onClick}
          >
            {item.image ? (
              <div className={`icon-badge photo${item.compact ? ' compact' : ''}`}>
                <img src={item.image} alt="" style={item.imgScale ? { transform: `scale(${item.imgScale})` } : undefined} />
              </div>
            ) : (
              <div className={`icon-badge big${item.iconVariant ? ` ${item.iconVariant}` : ''}${item.compact ? ' compact' : ''}`}><Icon /></div>
            )}
            <div className="dash-card-title">{item.title}</div>
            <div className="dash-card-desc">{item.description}</div>
          </button>
        );
      })}
    </div>
  );
}

// In-memory cache (module scope, resets on a full page reload) so coming
// back to the Dashboard after visiting another tab shows the last-fetched
// data instantly instead of blanking to a loading spinner every time -
// DashboardView unmounts/remounts on every tab switch (see the
// `activeTab === 'dashboard' &&` gate around its render site), so without
// this every single revisit paid a full network round-trip before showing
// anything. Keyed by user.id so switching accounts (logout -> a different
// login, same page session) can't leak stale data across users.
let dashboardCache = null;

// Shared by both the Shop Admin and Super Admin Dashboard greetings.
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function DashboardView({ t, setActiveTab, setSearchDispatch, setAutoOpenListingModal }) {
  const { user, api, subscription } = useAuth();
  const cachedData = dashboardCache && dashboardCache.userId === user.id ? dashboardCache.data : null;
  const [data, setData] = useState(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [popupAds, setPopupAds] = useState([]);
  // Shown only if the very first load (no cache yet) is still pending after
  // a few seconds - see authSlowNotice's identical rationale (free-tier
  // backend cold-start after inactivity).
  const [slowNotice, setSlowNotice] = useState(false);
  useEffect(() => {
    if (!loading) { setSlowNotice(false); return; }
    const timer = setTimeout(() => setSlowNotice(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Tapping Key Shops, ECM, Meter, or Scanning category cards on the Dashboard navigates to
  // their dedicated category screens (key-shops, ecm, meter, scanning).
  const goToProductType = (productType) => {
    if (productType === 'Used Machines' || productType === 'USED_MACHINES') {
      setSearchDispatch(null);
      setActiveTab('promotions');
      return;
    }
    if (productType === 'Key Shops' || productType === 'KEY_SHOPS') {
      setActiveTab('key-shops');
    } else if (productType === 'ECM') {
      setActiveTab('ecm');
    } else if (productType === 'Meter') {
      setActiveTab('meter');
    } else if (productType === 'Scanning' || productType === 'Scanner') {
      setActiveTab('scanning');
    } else {
      setSearchDispatch({ query: productType, type: 'productType', nonce: Date.now() });
      setActiveTab('promotions');
    }
  };

  // "Add Machines" quick action jumps straight to the Inventory screen and
  // auto-opens its create-listing dialog (Shop Admin only - the Super Admin
  // cannot publish listings).
  const goToAddMachines = () => {
    setAutoOpenListingModal(true);
    setActiveTab('promotions');
  };

  // Super Admin "Offers" quick action jumps straight to Banner & Offer
  // Management (Advertisement Campaigns) - not the plain Inventory/Machines
  // feed ('promotions'), which is a different screen entirely.
  const goToOffers = () => {
    setActiveTab('banner-offer-management');
  };

  const dismissPopupAds = () => {
    popupAds.forEach(ad => sessionStorage.setItem(`dismissed_ad_${ad.id}`, 'true'));
    setPopupAds([]);
  };

  useEffect(() => {
    if (popupAds.length > 0) {
      const timer = setTimeout(dismissPopupAds, 10000);
      return () => clearTimeout(timer);
    }
  }, [popupAds]);

  useEffect(() => {
    fetchDashboardData();
    if (user.role === 'SHOP_ADMIN') {
      fetchPopupAds();
    }
  }, [user]);

  const fetchPopupAds = async () => {
    try {
      const ads = await api.getAdvertisements();
      const popups = ads
        .filter(ad => ad.type === 'POPUP')
        .filter(ad => !sessionStorage.getItem(`dismissed_ad_${ad.id}`))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3);
      if (popups.length > 0) setPopupAds(popups);
    } catch (e) {
      console.error('Failed to fetch advertisements for popup', e);
    }
  };

  const fetchDashboardData = async () => {
    // Only show the spinner on a genuinely first load for this user - if
    // we're rendering from cache already, refresh silently in the
    // background instead of blanking the screen the visitor just saw.
    if (!data) setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
      dashboardCache = { userId: user.id, data: res };
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 260 }}>
        <div className="brand-loading-track"><div className="brand-loading-fill" /></div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingDashboard')}</span>
        {slowNotice && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', textAlign: 'center', maxWidth: 260 }}>{t('serverWakingUpMsg')}</span>
        )}
      </div>
    );
  }

  if (user.role === 'SUPER_ADMIN') {
    return (
      <div className="animate-fade-in">
        {/* Dashboard-only compaction: page-head is shared across 16 other
            screens (list/table pages that scroll freely and want the full
            20px breathing room), so it's trimmed here via inline style
            rather than editing the shared class - part of fitting the
            dashboard's card grid on one screen without scrolling. */}
        <div className="page-head" style={{ marginBottom: 10 }}>
          <div>
            <h1>{getTimeBasedGreeting()}, {(user.name || 'Admin').split(' ')[0]} 👋</h1>
          </div>
        </div>

        {/* Compact, approved dashboard layout - only the essential shortcut
            cards, no reports/lists/charts below. New Customer first, then
            Shops (2nd card), then the 4 product-category shortcuts (6 cards
            = exactly 3 full rows in the 2-column grid), then a full-width,
            shorter Customer Support card spanning both columns. All cards
            share the same size/spacing via DashCardGrid. */}
        <DashCardGrid items={[
          { title: t('newCustomer'), description: t('registerComplianceEntry'), icon: AddCustomerIcon, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: () => setActiveTab('super-customers') },
          { title: t('shopsCardTitle'), description: t('viewManageShopsDesc'), image: keyShopLogo, accent: 'var(--maroon)', onClick: () => setActiveTab('shops') },
          { title: t('dealers'), description: t('dealersDesc'), image: dealerIcon, accent: 'var(--maroon)', onClick: () => setActiveTab('dealers') },
          { title: t('usedMachines'), description: t('usedMachinesDesc'), image: usedMachinesImg, imgScale: 1.25, accent: 'var(--purple)', onClick: () => goToProductType('Used Machines') },
          { title: t('ecm'), description: t('ecmDesc'), image: ecmServiceImg, accent: 'var(--orange)', onClick: () => goToProductType('ECM') },
          { title: t('scanning'), description: t('scanningDesc'), image: scanningServiceImg, accent: 'var(--teal)', onClick: () => goToProductType('Scanning') },
          { title: t('meter'), description: t('meterDesc'), image: meterServiceImg, imgScale: 1.14, accent: 'var(--skyblue)', onClick: () => goToProductType('Meter') },
          { title: t('offersLabel'), description: t('activeOffersBannersDesc') || 'Active offers, banners & promotions', icon: Sparkles, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: goToOffers },
          { title: t('customerSupport'), description: t('manageCustomerSupportDesc'), image: customerSupportIcon, fullWidth: true, compact: true, accent: 'var(--rose)', onClick: () => setActiveTab('support-config') },
        ]} />
      </div>
    );
  }

  // SHOP ADMIN DASHBOARD
  const sub = data.subscription;
  const firstName = (user.name || 'there').split(' ')[0];
  // Populated by AuthContext (GET /auth/me, refreshed whenever the session
  // token changes) only when the shop's subscription is in its 3-day
  // post-expiry grace period - see AuthService.getShopSubscriptionState on
  // the backend. Distinct from `sub` above (the pre-expiry "renewing soon"
  // nudge, still ACTIVE) - once truly in grace period this replaces it
  // rather than showing both at once.
  return (
    <div className="animate-fade-in">
      {/* Dashboard-only compaction: page-head is shared across 16 other
          screens (list/table pages that scroll freely and want the full
          20px breathing room), so it's trimmed here via inline style
          rather than editing the shared class - part of fitting the
          dashboard's card grid on one screen without scrolling. */}
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={keyShopLogo} alt="Key Shop" style={{ width: 84, height: 84, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <h1>{getTimeBasedGreeting()}, {firstName} 👋</h1>
          </div>
        </div>
      </div>

      {subscription && subscription.state === 'GRACE_PERIOD' ? (
        <div className="card" style={{ marginBottom: 10, padding: 14, borderColor: 'var(--red)', background: 'var(--red-dim)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div className="icon-badge" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}><AlertTriangle /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 800, color: 'var(--red)', fontSize: 14 }}>
              ⚠️ {t('subscriptionExpiredAlertTitle')}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600, marginTop: 2 }}>
              {t('subscriptionGracePeriodMsg')
                .replace('{days}', subscription.daysRemaining)
                .replace('{dayWord}', subscription.daysRemaining === 1 ? t('dayLabel') : t('daysLabel'))}
            </p>
          </div>
        </div>
      ) : sub && sub.daysRemaining > 0 && sub.daysRemaining <= 7 && (
        <div className="card" style={{ marginBottom: 10, padding: 14, borderColor: 'rgba(240,185,11,0.4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="icon-badge rose"><AlertTriangle /></div>
            <div>
              <p style={{ fontFamily: 'var(--display)', fontWeight: 700, color: 'var(--text-0)', fontSize: 14 }}>{t('subscriptionRenewalRequired')}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 2 }}>
                {t('subscriptionExpiresIn').split('{days}')[0]}<b style={{ color: 'var(--gold)' }}>{sub.daysRemaining}</b>{t('subscriptionExpiresIn').split('{days}')[1]}
              </p>
            </div>
          </div>
          <div className="pill-badge">
            <span className="dot"></span>
            {sub.plan} {t('planSuffix')}
          </div>
        </div>
      )}

      {/* Compact, approved dashboard layout - only the essential shortcut cards,
          no reports/lists/charts below. One combined grid so every card shares
          the same size/spacing: Quick Actions (New Customer, Search Keys), the
          4 product-category shortcuts, then a full-width, shorter Customer
          Support card spanning both columns. */}
      <DashCardGrid items={[
        { title: t('newCustomer'), description: t('registerComplianceEntry'), icon: AddCustomerIcon, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: () => setActiveTab('register') },
        { title: t('usedMachines'), description: t('usedMachinesDesc'), image: usedMachinesImg, imgScale: 1.25, accent: 'var(--purple)', onClick: () => goToProductType('Used Machines') },
        { title: t('keyShops'), description: t('keyShopsDesc'), image: keyShopLogo, accent: 'var(--maroon)', onClick: () => goToProductType('Key Shops') },
        { title: t('dealers'), description: t('dealersDesc'), image: dealerIcon, accent: 'var(--maroon)', onClick: () => setActiveTab('dealers') },
        { title: t('ecm'), description: t('ecmDesc'), image: ecmServiceImg, accent: 'var(--orange)', onClick: () => goToProductType('ECM') },
        { title: t('scanning'), description: t('scanningDesc'), image: scanningServiceImg, accent: 'var(--teal)', onClick: () => goToProductType('Scanning') },
        { title: t('meter'), description: t('meterDesc'), image: meterServiceImg, imgScale: 1.14, accent: 'var(--skyblue)', onClick: () => goToProductType('Meter') },
        { title: t('offersLabel'), description: t('activeOffersBannersDesc') || 'Active offers, banners & promotions', icon: Sparkles, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: () => setActiveTab('offers-ads-banners') },
        { title: t('customerSupport'), description: t('getHelpSupportDesc'), image: customerSupportIcon, fullWidth: true, compact: true, accent: 'var(--rose)', onClick: () => setActiveTab('customer-care') },
      ]} />

      {/* Active Announcements Popup Modal - shows 2-3 ads/banners/offers together
          in a colorful mixed grid, each tile the actual uploaded image with no
          placeholder copy. */}
      {popupAds.length > 0 && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 backdrop-blur-md flex justify-center items-center p-4 md:p-10">
          <div className="card animate-fade-in" style={{ width: 'clamp(320px, 80vw, 860px)', overflow: 'hidden', margin: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <span className="badge badge-gold">
                <Sparkles style={{ width: 11, height: 11 }} /> {t('featuredOffersBanners')}
              </span>
              <button onClick={dismissPopupAds} className="icon-btn">
                <X />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: popupAds.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                padding: 22,
              }}
            >
              {popupAds.map((ad, i) => {
                const accents = ['var(--gold)', 'var(--teal)', 'var(--rose)', 'var(--purple)', 'var(--skyblue)'];
                const accent = accents[i % accents.length];
                return (
                  <div
                    key={ad.id}
                    style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${accent}`, background: 'var(--card-2)', display: 'flex', flexDirection: 'column' }}
                  >
                    <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <span className="badge" style={{ alignSelf: 'flex-start', background: accent, color: 'var(--bg-0, #0a0908)', fontSize: 10 }}>
                        {ad.type === 'BANNER' ? t('banner') : ad.type === 'NOTICE' ? t('notice') : t('offer')}
                      </span>
                      <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-0)', lineHeight: 1.3 }}>{ad.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '16px 22px', display: 'flex', gap: 10 }}>
              <button onClick={dismissPopupAds} className="btn btn-ghost btn-block">
                {t('btnDismiss')}
              </button>
              <button
                onClick={() => {
                  dismissPopupAds();
                  setActiveTab('offers-ads-banners');
                }}
                className="btn btn-primary btn-block"
              >
                {t('viewAllOffersBanners')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default DashboardView;
