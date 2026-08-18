import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Home, Store, Wrench, Megaphone, Search, Bell, LogIn, X, ChevronLeft, ChevronRight,
  MapPin, Phone, Globe, Tag, RefreshCw, Package,
  MessageCircle, Menu, FileText, Building2, Mail, Headset,
} from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';
import CustomSelect from './CustomSelect';
import PriceTag from './PriceTag';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import { categoryImage } from '../utils/categoryIcon';
import { cleanGoogleImageUrl } from '../utils/imageUtils';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import ImageCarousel from './ImageCarousel';
import { useLocationFilter } from '../utils/locationFilter';

// Mirrors App.jsx's TERMS_AND_CONDITIONS_TITLE/BODY - duplicated rather than
// imported since App.jsx isn't a module other components import from
// anywhere in this codebase (no cross-import precedent), and this is the
// same fixed legal text a shop owner already agrees to at registration.
const TERMS_AND_CONDITIONS_BODY = `By creating an account and using this application, you agree to the following:

1. I understand that the server or mobile application may occasionally be slow or unavailable, and I will wait until the service is restored.
2. If I encounter any server errors, application issues, or temporary service interruptions, I understand that they will be resolved as soon as possible and will wait patiently.
3. I will keep all customer information, including photos, personal details, and documents, confidential and will not share them with any unauthorized person or third party.
4. I will use this application only for its intended purpose of managing and storing customer and business information. I will not misuse the application for any illegal, fraudulent, or unauthorized activities.
5. I understand that misuse of the application or violation of these terms may result in suspension or permanent termination of my account without prior notice.
6. Subscription fees are non-refundable. Once a subscription has been purchased, I will not request a refund or transfer the subscription to another person or account.
7. I agree to comply with all applicable laws, regulations, and these Terms and Conditions while using the application.
8. By proceeding with registration, I confirm that I have read, understood, and agree to these Terms and Conditions.`;

// The pre-login public browsing experience shown inside the packaged Android
// app (see App.jsx's render branch: `IS_NATIVE_APP ? <PublicMobileApp .../>
// : <PublicSite .../>` when !isAuthenticated && publicPage !== 'login').
// Deliberately separate from PublicSite.jsx (the web marketing site) rather
// than extending it - the two have different navigation models (bottom-nav
// mobile app vs. a flat 4-page marketing site) and this keeps the existing
// web experience completely untouched.
//
// Navigation is plain useState, matching the rest of this codebase (there is
// no router anywhere in this app - see App.jsx's `activeTab`/`publicPage`).
// Hardware back button support comes for free by registering with the same
// shared `useBackHandler` stack every other modal/wizard in the app uses -
// no changes to App.jsx's hardware back-button listener are needed, since an
// empty stack at the true root of this component correctly falls through to
// Android's standard double-back-to-exit behavior.

function safeUrl(url) {
  if (!url) return null;
  return url.startsWith('http') ? url : `https://${url}`;
}

// No separate WhatsApp number exists on Shop/Promotion (only `phone`), so the
// WhatsApp action reuses the same contact number - the standard assumption
// for a small-business listing where one number serves both.
function waLink(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function AdCarousel({ api }) {
  const [ads, setAds] = useState([]);
  // `pos` indexes into `slides` below, which has one extra clone slide
  // appended after the real last one - the standard trick for a genuinely
  // continuous infinite carousel (Ad1 -> Ad2 -> Ad3 -> Ad1 -> ...) with CSS
  // transitions: slide normally onto the clone, then instantly (transition
  // disabled for one frame) snap back to the real first slide, which looks
  // identical to the clone so the jump is invisible.
  const [pos, setPos] = useState(0);
  const [noTransition, setNoTransition] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.getPublicAds().then((res) => { if (!cancelled) setAds(res || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (ads.length < 2) return;
    const id = setInterval(() => setPos((p) => p + 1), 3000);
    return () => clearInterval(id);
  }, [ads.length]);

  // After the snap-back to position 0 with transitions disabled, re-enable
  // them on the next frame so the *next* auto-advance slides smoothly again.
  useEffect(() => {
    if (!noTransition) return;
    const id = requestAnimationFrame(() => setNoTransition(false));
    return () => cancelAnimationFrame(id);
  }, [noTransition]);

  if (ads.length === 0) return null;

  const slides = ads.length > 1 ? [...ads, ads[0]] : ads;
  const activeDot = ((pos % ads.length) + ads.length) % ads.length;

  const handleTransitionEnd = () => {
    if (pos === ads.length) {
      setNoTransition(true);
      setPos(0);
    }
  };

  const goTo = (delta) => {
    setPos((p) => {
      const next = p + delta;
      return next < 0 ? ads.length - 1 : next;
    });
  };

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <div className="ad-carousel-wrap">
      <div className="ad-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="ad-carousel-track"
          onTransitionEnd={handleTransitionEnd}
          style={{ transform: `translateX(-${pos * 100}%) translateZ(0)`, transition: noTransition ? 'none' : undefined }}
        >
          {slides.map((ad, i) => (
            <div className="ad-carousel-slide" key={`${ad.id}-${i}`}>
              <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title || ''} />
            </div>
          ))}
        </div>
      </div>
      {ads.length > 1 && (
        <div className="ad-carousel-dots">
          {ads.map((ad, i) => (
            <span key={ad.id} className={`ad-carousel-dot ${i === activeDot ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// Shared card system for Popular Shops + Machines & Products (both the Home
// strips and the dedicated Shops/Machines tab grids) - deliberately its own
// `.pub-card*` classes rather than reusing PublicSite.jsx's `.public-shop-
// card`/`.icon-badge.solid`/`.pill-badge` (those are gold-accented and used
// by the untouched web marketing site - see file header). Fixed media/body
// heights + `overflow: hidden` + `text-overflow: ellipsis` on every text row
// keep every card exactly the same size no matter how long the content is.
function PublicShopCard({ shop, onOpen }) {
  return (
    <button type="button" className="pub-shop-card" onClick={() => onOpen(shop.id)}>
      <div className="pub-shop-card-icon pub-shop-card-icon-img">
        <img src={categoryImage(shop.category)} alt="" />
      </div>
      <div className="pub-shop-card-name">{shop.name}</div>
      {shop.address && <div className="pub-card-meta pub-card-meta-wrap"><MapPin className="h-3 w-3" /><span>{shop.address}</span></div>}
      {shop.phone && <div className="pub-card-meta"><Phone className="h-3 w-3" /><span>{shop.phone}</span></div>}
      {shop.website && <div className="pub-card-meta"><Globe className="h-3 w-3" /><span>{shop.website}</span></div>}
      {shop.phone && (
        <div className="pub-card-actions" onClick={(e) => e.stopPropagation()}>
          <a href={`tel:${shop.phone}`} className="pub-card-action-btn call"><Phone className="h-3.5 w-3.5" /> Call</a>
          <a href={waLink(shop.phone)} target="_blank" rel="noreferrer" className="pub-card-action-btn whatsapp"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
        </div>
      )}
    </button>
  );
}

function SkeletonShopCard() { return <div className="pub-skeleton pub-shop-card-skeleton" />; }
function SkeletonMachineCard() { return <div className="pub-skeleton pub-card-skeleton" />; }

// Product photos aren't a fixed aspect ratio - a tall/portrait photo shown
// with object-fit:contain inside the card's fixed-height media box ends up
// narrow and pillarboxed (lots of empty space on either side). Once the
// image loads, if it's clearly portrait, switch to object-fit:cover so it
// fills the card's full width instead (cropping top/bottom as needed) -
// landscape/square photos keep the uncropped contain fit.
function handleCardImageLoad(setFillWidth) {
  return (e) => setFillWidth(e.target.naturalHeight > e.target.naturalWidth * 1.2);
}

function PublicMachineCard({ item, onOpen }) {
  const [fillWidth, setFillWidth] = useState(false);
  return (
    <button type="button" className="pub-card" onClick={() => onOpen(item.id)}>
      <div className="pub-card-media">
        {item.imageUrl ? (
          <img
            src={cleanGoogleImageUrl(item.imageUrl)}
            alt={item.title}
            style={fillWidth ? { objectFit: 'cover' } : undefined}
            onLoad={handleCardImageLoad(setFillWidth)}
          />
        ) : <Package className="h-7 w-7" />}
      </div>
      <div className="pub-card-body">
        <div className="pub-card-title">{item.title}</div>
        {item.productType && <div className="pub-card-meta"><Tag className="h-3 w-3" /><span>{item.productType}</span></div>}
        {item.shop?.name && <div className="pub-card-meta"><Store className="h-3 w-3" /><span>{item.shop.name}</span></div>}
        {item.shop?.town && <div className="pub-card-meta"><MapPin className="h-3 w-3" /><span>{item.shop.town}</span></div>}
        <PriceTag price={item.price} discountPercentage={item.discountPercentage} />
      </div>
    </button>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="public-empty-state">
      <Icon className="h-8 w-8" />
      <p>{text}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="public-empty-state">
      <RefreshCw className="h-6 w-6 animate-spin" />
    </div>
  );
}

function CategoryChips({ options, value, onChange, renderLabel = (name) => name }) {
  return (
    <div className="store-tabs">
      <button type="button" className={`store-tab ${!value ? 'active' : ''}`} onClick={() => onChange('')}>All</button>
      {options.map((opt) => (
        <button
          key={opt.id || opt.name}
          type="button"
          className={`store-tab ${value === opt.name ? 'active' : ''}`}
          onClick={() => onChange(opt.name)}
        >
          {renderLabel(opt.name)}
        </button>
      ))}
    </div>
  );
}

// Display-only rename for the Shops page's category chips - the underlying
// ShopCategory.name value ("ECM", "Meter", "Scanner") is unchanged and still
// what's sent as the filter/onChange value, so this never touches the API
// or any stored data, matching the same Dashboard card rename in App.jsx.
const SHOP_CATEGORY_CHIP_SUFFIX = { ECM: 'ECM Service Center', Meter: 'Meter Service Center', Scanner: 'Scanner Service Center' };
function shopCategoryChipLabel(name) {
  return SHOP_CATEGORY_CHIP_SUFFIX[name] || name;
}

// Home's horizontal-scroll strips show at most HOME_STRIP_LIMIT cards, with
// a trailing "Show More" card that jumps straight to the full Shops/Machines
// tab - so fetching one extra item (HOME_STRIP_LIMIT + 1) tells us whether
// there's actually more to show without a separate count query.
const HOME_STRIP_LIMIT = 5;

function ShowMoreCard({ onClick }) {
  return (
    <button type="button" className="public-show-more-card" onClick={onClick}>
      <ChevronRight className="h-6 w-6" />
      <span>Show More</span>
    </button>
  );
}

function PublicHomeTab({ api, onOpenShop, onOpenMachine, onGoTab }) {
  const [shops, setShops] = useState(null);
  const [machines, setMachines] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.searchPublicShops({ limit: HOME_STRIP_LIMIT + 1 }).then((res) => { if (!cancelled) setShops(res.items); }).catch(() => setShops([]));
    api.getPublicMachines({ limit: HOME_STRIP_LIMIT + 1 }).then((res) => { if (!cancelled) setMachines(res.items); }).catch(() => setMachines([]));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="public-mobile-tab">
      <AdCarousel api={api} />

      <div className="public-mobile-section">
        <div className="public-mobile-section-head">
          <h3>Popular Shops</h3>
          <button type="button" className="btn-link-sm" onClick={() => onGoTab('shops')}>See all</button>
        </div>
        {shops === null ? (
          <div className="public-mobile-hscroll">
            {[1, 2, 3].map((i) => <div className="public-mobile-hcard" key={i}><SkeletonShopCard /></div>)}
          </div>
        ) : shops.length === 0 ? <EmptyState icon={Store} text="No shops found." /> : (
          <div className="public-mobile-hscroll">
            {shops.slice(0, HOME_STRIP_LIMIT).map((s) => <div className="public-mobile-hcard" key={s.id}><PublicShopCard shop={s} onOpen={onOpenShop} /></div>)}
            {shops.length > HOME_STRIP_LIMIT && <div className="public-mobile-hcard"><ShowMoreCard onClick={() => onGoTab('shops')} /></div>}
          </div>
        )}
      </div>

      <div className="public-mobile-section">
        <div className="public-mobile-section-head">
          <h3>Machines &amp; Products</h3>
          <button type="button" className="btn-link-sm" onClick={() => onGoTab('machines')}>See all</button>
        </div>
        {machines === null ? (
          <div className="public-mobile-hscroll">
            {[1, 2, 3].map((i) => <div className="public-mobile-hcard" key={i}><SkeletonMachineCard /></div>)}
          </div>
        ) : machines.length === 0 ? <EmptyState icon={Package} text="No machines available." /> : (
          <div className="public-mobile-hscroll">
            {machines.slice(0, HOME_STRIP_LIMIT).map((m) => <div className="public-mobile-hcard" key={m.id}><PublicMachineCard item={m} onOpen={onOpenMachine} /></div>)}
            {machines.length > HOME_STRIP_LIMIT && <div className="public-mobile-hcard"><ShowMoreCard onClick={() => onGoTab('machines')} /></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function PublicShopsTab({ api, categories, onOpenShop, initialCategory, defaultTown, locationReady }) {
  const [category, setCategory] = useState(initialCategory || '');
  const [items, setItems] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);

  // Waits for `filterReady` (useLocationFilter's 3rd return value - GPS
  // permission/coordinate resolution finished AND `town` already reflects
  // its resolved default) before firing the very first fetch - `items`
  // stays null (skeleton grid below) until then. Gating on the raw
  // `locationReady` prop instead would still let one fetch through with a
  // stale '' town before `town` catches up - see useLocationFilter's
  // comment for why.
  const fetchFirst = () => {
    if (!filterReady) return;
    setItems(null);
    setError(false);
    api.searchPublicShops({ category, town, limit: 20 })
      .then((res) => { setItems(res.items); setNextCursor(res.nextCursor); })
      .catch(() => setError(true));
  };

  useEffect(fetchFirst, [category, town, filterReady]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    api.searchPublicShops({ category, town, cursor: nextCursor, limit: 20 })
      .then((res) => { setItems((prev) => [...prev, ...res.items]); setNextCursor(res.nextCursor); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="public-mobile-tab">
      <div className="pub-page-header">
        <span className="pub-page-header-icon" style={{ background: 'var(--purple)' }}><Store className="h-5 w-5" /></span>
        <h2 className="pub-page-title">Shops</h2>
        <div className="pub-page-header-actions">
          <CustomSelect
            className="pub-location-select location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder="All Locations"
            searchable
            searchPlaceholder="Search district or town…"
            options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((t) => ({ value: t, label: t }))]}
          />
        </div>
      </div>
      <CategoryChips options={categories} value={category} onChange={setCategory} renderLabel={shopCategoryChipLabel} />
      {items === null ? (
        <div className="pub-card-grid">{[1, 2, 3, 4].map((i) => <SkeletonShopCard key={i} />)}</div>
      ) : error ? (
        <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." />
      ) : items.length === 0 ? (
        <EmptyState icon={Store} text="No shops found." />
      ) : (
        <>
          <div className="pub-card-grid">
            {items.map((s) => <PublicShopCard key={s.id} shop={s} onOpen={onOpenShop} />)}
          </div>
          {nextCursor && (
            <button type="button" className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PublicMachinesTab({ api, productTypes, onOpenMachine, initialCategory, defaultTown, locationReady }) {
  const [category, setCategory] = useState(initialCategory || '');
  const [items, setItems] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);

  // Waits for `filterReady` before the very first fetch - see
  // PublicShopsTab's identical guard for the full rationale.
  const fetchFirst = () => {
    if (!filterReady) return;
    setItems(null);
    setError(false);
    api.getPublicMachines({ category, town, limit: 20 })
      .then((res) => { setItems(res.items); setNextCursor(res.nextCursor); })
      .catch(() => setError(true));
  };

  useEffect(fetchFirst, [category, town, filterReady]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    api.getPublicMachines({ category, town, cursor: nextCursor, limit: 20 })
      .then((res) => { setItems((prev) => [...prev, ...res.items]); setNextCursor(res.nextCursor); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="public-mobile-tab">
      <div className="pub-page-header">
        <span className="pub-page-header-icon" style={{ background: 'var(--teal)' }}><Wrench className="h-5 w-5" /></span>
        <h2 className="pub-page-title">Machines &amp; Products</h2>
        <div className="pub-page-header-actions">
          <CustomSelect
            className="pub-location-select location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder="All Locations"
            searchable
            searchPlaceholder="Search district or town…"
            options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((t) => ({ value: t, label: t }))]}
          />
        </div>
      </div>
      <CategoryChips options={productTypes} value={category} onChange={setCategory} />
      {items === null ? (
        <div className="pub-card-grid">{[1, 2, 3, 4].map((i) => <SkeletonMachineCard key={i} />)}</div>
      ) : error ? (
        <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." />
      ) : items.length === 0 ? (
        <EmptyState icon={Package} text="No machines available." />
      ) : (
        <>
          <div className="pub-card-grid">
            {items.map((m) => <PublicMachineCard key={m.id} item={m} onOpen={onOpenMachine} />)}
          </div>
          {nextCursor && (
            <button type="button" className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PublicAdCard({ ad, onOpen }) {
  const [fillWidth, setFillWidth] = useState(false);
  return (
    <button type="button" className="pub-card" onClick={() => onOpen(ad)}>
      <div className="pub-card-media" style={{ height: 140 }}>
        {ad.imageUrl ? (
          <img
            src={cleanGoogleImageUrl(ad.imageUrl)}
            alt={ad.title || ''}
            style={fillWidth ? { objectFit: 'cover' } : undefined}
            onLoad={handleCardImageLoad(setFillWidth)}
          />
        ) : <Megaphone className="h-7 w-7" />}
      </div>
      {ad.title && (
        <div className="pub-card-body" style={{ height: 'auto' }}>
          <div className="pub-card-title" style={{ whiteSpace: 'normal' }}>{ad.title}</div>
        </div>
      )}
    </button>
  );
}

// Full-view poster overlay - tapping an ad card shows the poster at full
// size with its title, since v1 ads have no other detail (no CTA/link/
// description field on Advertisement) to navigate to.
function PublicAdViewer({ ad, onClose }) {
  useBackHandler(true, onClose);
  return (
    <div className="pub-ad-viewer">
      <button type="button" className="pub-ad-viewer-close" onClick={onClose} aria-label="Close"><X /></button>
      <div className="pub-ad-viewer-media">
        {ad.imageUrl ? <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title || ''} /> : <Megaphone className="h-10 w-10" />}
      </div>
      {ad.title && <div className="pub-ad-viewer-title">{ad.title}</div>}
    </div>
  );
}

// Same contact info + design as the authenticated Shop Admin's "Customer
// Service" screen (SupportContactView + CompanyDetailsCard in App.jsx) -
// backed by the same public /api/support-config endpoint, so no login or
// new backend work is needed to show it here too.
function PublicContactTab({ api }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getSupportConfig()
      .then((res) => { if (!cancelled) setConfig(res); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = [
    { icon: Phone, color: 'maroon', label: 'Customer Care Number', value: config?.customerCareNumber, href: config?.customerCareNumber ? `tel:${config.customerCareNumber}` : null },
    { icon: MessageCircle, color: 'jgreen', label: 'WhatsApp Number', value: config?.whatsapp, href: config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}` : null, external: true },
    { icon: Mail, color: 'purple', label: 'Email Address', value: config?.email, href: config?.email ? `mailto:${config.email}` : null },
  ].filter((r) => r.value);

  return (
    <div className="public-mobile-tab">
      <div className="pub-page-header">
        <span className="pub-page-header-icon" style={{ background: 'var(--rose)' }}><Headset className="h-5 w-5" /></span>
        <h2 className="pub-page-title">Contact Us</h2>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            {rows.length > 0 ? (
              <div className="space-y-3">
                {rows.map((r, idx) => (
                  <a
                    key={idx}
                    href={r.href}
                    {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="loc-box"
                    style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    <div className="loc-info">
                      <div className={`icon-badge ${r.color}`}><r.icon /></div>
                      <div className="loc-text">
                        <span className="t1" style={{ display: 'block' }}>{r.value}</span>
                        <span className="t2">{r.label}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
                Contact details have not been configured yet.
              </p>
            )}
          </div>

          <div className="card">
            <div className="section-title" style={{ marginBottom: 14 }}>
              <div className="flex items-center gap-3">
                <div className="icon-badge blue" style={{ width: 34, height: 34, borderRadius: 10 }}><Building2 style={{ width: 16, height: 16 }} /></div>
                <div><h2 style={{ fontSize: 15 }}>Company Details</h2></div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Company</div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>keyshops.in company is a yourprinting.in group of companies.</p>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Address</div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>Coimbatore, Tamil Nadu, South India.</p>
                </div>
              </div>
              <img src={keyShopLogo} alt="Key Shops" style={{ width: 120, height: 120, objectFit: 'contain', flexShrink: 0 }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Terms & Conditions / About Us - reached from the hamburger drawer. Reuses
// the same fixed content as the authenticated app (see the module-scope
// constants above).
function PublicStaticInfoScreen({ icon: Icon, color, title, body, onBack }) {
  useBackHandler(true, onBack);
  return (
    <div className="public-mobile-tab">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</button>
      <div className="pub-page-header" style={{ marginTop: 14 }}>
        <span className="pub-page-header-icon" style={{ background: color }}><Icon className="h-5 w-5" /></span>
        <h2 className="pub-page-title">{title}</h2>
      </div>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// Feedback & Suggestions - no backend endpoint for this, so it routes into
// the same support email/WhatsApp already configured for Contact Us rather
// than a form that would go nowhere.
function PublicFeedbackScreen({ api, onBack }) {
  useBackHandler(true, onBack);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getSupportConfig().then((res) => { if (!cancelled) setConfig(res); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const subject = encodeURIComponent('Key Shops - Feedback & Suggestions');
  const mailHref = config?.email ? `mailto:${config.email}?subject=${subject}` : null;
  const waHref = config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}?text=${subject}` : null;

  return (
    <div className="public-mobile-tab">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</button>
      <div className="pub-page-header" style={{ marginTop: 14 }}>
        <span className="pub-page-header-icon" style={{ background: 'var(--gold)' }}><MessageCircle className="h-5 w-5" /></span>
        <h2 className="pub-page-title">Feedback &amp; Suggestions</h2>
      </div>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.7, marginBottom: 18 }}>
          We would love to hear from you. Share your feedback, report an issue, or suggest an improvement, and our team will get back to you.
        </p>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {mailHref && (
            <a href={mailHref} className="btn btn-primary btn-sm">
              <Mail className="h-4 w-4" /> Send Feedback
            </a>
          )}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          {!mailHref && !waHref && (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              Contact details have not been configured yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Left-side slide-in navigation drawer, opened from the hamburger icon in
// PublicTopBar. Mirrors the authenticated app's .mobile-nav-drawer pattern
// (same z-index scale, same backdrop-click-to-close behavior) so it looks
// and behaves consistently across both pre-login and logged-in shells.
function PublicNavDrawer({ open, onClose, onNavigate }) {
  useBackHandler(open, onClose);
  const items = [
    { key: 'contact', icon: Headset, color: 'var(--rose)', label: 'Contact Us' },
    { key: 'terms', icon: FileText, color: 'var(--blue)', label: 'Terms & Conditions' },
    { key: 'feedback', icon: MessageCircle, color: 'var(--gold)', label: 'Feedback & Suggestions' },
  ];
  return (
    <>
      {open && (
        <div className="mobile-nav-drawer-backdrop fixed inset-0" style={{ background: 'rgba(5,4,3,0.6)' }} onClick={onClose} />
      )}
      <aside className={`pub-nav-drawer mobile-nav-drawer ${open ? 'open' : ''}`}>
        <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" />
          <button type="button" className="icon-btn" onClick={onClose}><X /></button>
        </div>
        <nav style={{ padding: '8px 12px' }}>
          {items.map((it) => (
            <button key={it.key} type="button" className="side-link" onClick={() => onNavigate(it.key)}>
              <span className="nav-ico" style={{ background: it.color }}><it.icon /></span>
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

function PublicShopDetailsScreen({ api, shopId, onBack, onOpenMachine, onOpenShop }) {
  const [shop, setShop] = useState(null);
  const [error, setError] = useState(false);
  const [related, setRelated] = useState(null);
  useBackHandler(true, onBack);

  useEffect(() => {
    let cancelled = false;
    setShop(null);
    setError(false);
    setRelated(null);
    api.getPublicShopById(shopId).then((res) => { if (!cancelled) setShop(res); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [shopId]);

  // "Related Shops" strip - other shops sharing this one's category, same
  // pattern as PublicMachineDetailsScreen's Related Products below.
  useEffect(() => {
    if (!shop) return;
    if (!shop.category) { setRelated([]); return; }
    let cancelled = false;
    api.searchPublicShops({ category: shop.category, limit: 7 })
      .then((res) => { if (!cancelled) setRelated((res.items || []).filter((s) => s.id !== shop.id).slice(0, 6)); })
      .catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [shop]);

  return (
    <div className="public-mobile-tab">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</button>
      {!shop && !error ? <LoadingState /> : error ? <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." /> : (
        <>
          <div className="card public-shop-card" style={{ marginTop: 14 }}>
            <div className="public-shop-card-top">
              {shop.logoUrl ? (
                <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-2)' }}>
                  <img src={cleanGoogleImageUrl(shop.logoUrl)} alt="" className="w-full h-full object-cover" />
                </div>
              ) : shop.category ? (
                <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={categoryImage(shop.category)} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                </div>
              ) : (
                <div className="icon-badge blue"><Store /></div>
              )}
              <div>
                <h3>{shop.name}</h3>
              </div>
            </div>
            {shop.category && <div className="public-shop-meta"><Tag className="h-3.5 w-3.5" /> {shop.category}</div>}
            {shop.address && <div className="public-shop-meta"><MapPin className="h-3.5 w-3.5" /> {shop.address}</div>}
            {shop.phone && <div className="public-shop-meta"><Phone className="h-3.5 w-3.5" /> <a href={`tel:${shop.phone}`}>{shop.phone}</a></div>}
            {shop.website && <div className="public-shop-meta"><Globe className="h-3.5 w-3.5" /> <a href={safeUrl(shop.website)} target="_blank" rel="noreferrer">{shop.website}</a></div>}

            {shop.products && shop.products.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Machines/products available</h4>
                <div className="pub-card-grid">
                  {shop.products.map((m) => <PublicMachineCard key={m.id} item={m} onOpen={onOpenMachine} />)}
                </div>
              </div>
            )}
          </div>

          {related && related.length > 0 && (
            <div className="public-mobile-section" style={{ marginTop: 20 }}>
              <div className="public-mobile-section-head"><h3>Related Shops</h3></div>
              <div className="pub-card-grid">
                {related.map((s) => <PublicShopCard key={s.id} shop={s} onOpen={onOpenShop} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PublicMachineDetailsScreen({ api, machineId, onBack, onOpenMachine }) {
  const [item, setItem] = useState(null);
  const [related, setRelated] = useState(null);
  const [error, setError] = useState(false);
  useBackHandler(true, onBack);

  useEffect(() => {
    let cancelled = false;
    setItem(null);
    setRelated(null);
    setError(false);
    api.getPublicMachineById(machineId).then((res) => { if (!cancelled) setItem(res); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [machineId]);

  // "Related products" strip - other listings sharing this item's product
  // type, so browsing a machine surfaces alternatives without going back to
  // the full Machines tab. Filters the current item out of its own results.
  useEffect(() => {
    if (!item) return;
    if (!item.productType) { setRelated([]); return; }
    let cancelled = false;
    api.getPublicMachines({ category: item.productType, limit: 7 })
      .then((res) => { if (!cancelled) setRelated((res.items || []).filter((m) => m.id !== item.id).slice(0, 6)); })
      .catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [item]);

  return (
    <div className="public-mobile-tab">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</button>
      {!item && !error ? <LoadingState /> : error ? <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." /> : (
        <>
          <div className="card" style={{ marginTop: 12, padding: 14 }}>
            {(item.imageUrls?.length || item.imageUrl) ? (
              <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                <ImageCarousel images={(item.imageUrls?.length ? item.imageUrls : [item.imageUrl]).map(cleanGoogleImageUrl)} />
              </div>
            ) : (
              <div className="pub-card-media" style={{ height: 170, borderRadius: 14, marginBottom: 12 }}>
                <Package className="h-10 w-10" />
              </div>
            )}
            <h3 style={{ marginBottom: 4 }}>{item.title}</h3>
            {item.productType && <div className="public-shop-meta" style={{ marginTop: 2 }}><Tag className="h-3.5 w-3.5" /> {item.productType}</div>}
            {item.shop?.name && <div className="public-shop-meta" style={{ marginTop: 4 }}><Store className="h-3.5 w-3.5" /> {item.shop.name}</div>}
            <div style={{ marginTop: 8 }}><PriceTag price={item.price} discountPercentage={item.discountPercentage} size="lg" /></div>
            {item.description && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{item.description}</p>}
            {/* Inline, not a screen-wide fixed bar pinned above the bottom
                nav - keeps the Call action right next to the details it
                belongs to instead of permanently reserving screen space. */}
            {item.phone && (
              <a href={`tel:${item.phone}`} className="btn btn-primary" style={{ marginTop: 12 }}>
                <Phone className="h-4 w-4" /> Call {item.phone}
              </a>
            )}
          </div>

          {related && related.length > 0 && (
            <div className="public-mobile-section" style={{ marginTop: 20 }}>
              <div className="public-mobile-section-head"><h3>Related Products</h3></div>
              <div className="pub-card-grid">
                {related.map((m) => <PublicMachineCard key={m.id} item={m} onOpen={onOpenMachine} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PublicSearchOverlay({ api, onClose, onOpenShop, onOpenMachine }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(false);
  // Bumped on every search fired; a response is only applied if it's still
  // the most recent one requested - otherwise a slower response for an
  // earlier keystroke can resolve after a faster one and overwrite the list
  // with results for a query the search box no longer shows.
  const searchTokenRef = useRef(0);
  useBackHandler(true, onClose);

  useEffect(() => {
    const query = q.trim();
    const token = ++searchTokenRef.current;
    if (!query) { setResults(null); setError(false); return; }
    setError(false);
    const timer = setTimeout(() => {
      api.getPublicSearch(query)
        .then((res) => { if (token === searchTokenRef.current) setResults(res); })
        .catch(() => { if (token === searchTokenRef.current) setError(true); });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="public-search-overlay">
      <div className="public-search-overlay-head">
        <div className="search-box" style={{ flex: 1 }}>
          <Search />
          <input autoFocus type="text" placeholder="Search shops, machines..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="button" className="icon-btn" onClick={onClose}><X /></button>
      </div>
      <div className="public-search-overlay-body">
        {!q.trim() ? null : error ? (
          <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." />
        ) : results === null ? (
          <LoadingState />
        ) : results.shops.length === 0 && results.machines.length === 0 ? (
          <EmptyState icon={Search} text={`No results found for "${q}".`} />
        ) : (
          <>
            {results.shops.length > 0 && (
              <div className="public-mobile-section">
                <div className="public-mobile-section-head"><h3>Shops</h3></div>
                <div className="pub-card-grid">
                  {results.shops.map((s) => <PublicShopCard key={s.id} shop={s} onOpen={(id) => { onOpenShop(id); onClose(); }} />)}
                </div>
              </div>
            )}
            {results.machines.length > 0 && (
              <div className="public-mobile-section">
                <div className="public-mobile-section-head"><h3>Machines &amp; Products</h3></div>
                <div className="pub-card-grid">
                  {results.machines.map((m) => <PublicMachineCard key={m.id} item={m} onOpen={(id) => { onOpenMachine(id); onClose(); }} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Shown when a logged-out visitor taps "Add Ads" (or any other action that
// actually requires an account) - explains why, and offers a direct path to
// the login screen instead of a dead end. Portaled to <body> so it sits
// above the bottom nav/topbar regardless of where it's triggered from.
function LoginRequiredModal({ onClose, onLogin }) {
  useBackHandler(true, onClose);
  return createPortal(
    <div className="pub-modal-backdrop" onClick={onClose}>
      <div className="card pub-login-required-modal" onClick={(e) => e.stopPropagation()}>
        <div className="icon-badge rose" style={{ margin: '0 auto 14px' }}><Megaphone /></div>
        <h3 style={{ textAlign: 'center', marginBottom: 6 }}>Login Required</h3>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 18 }}>
          You need to log in to add ads, register customers, or perform other shop operations.
        </p>
        <button type="button" className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={onLogin}>
          <LogIn className="h-4 w-4" /> Login
        </button>
        <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}

function PublicTopBar({ onSearch, onLogin, onMenu }) {
  const [showNotif, setShowNotif] = useState(false);
  return (
    <header className="public-mobile-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button type="button" className="icon-btn" onClick={onMenu} aria-label="Menu"><Menu /></button>
        <img src={keyShopLogo} alt="Key Shop" className="public-mobile-logo" />
      </div>
      <div className="public-mobile-topbar-actions">
        <button type="button" className="icon-btn" onClick={onSearch}><Search /></button>
        <div style={{ position: 'relative' }}>
          <button type="button" className="icon-btn" onClick={() => setShowNotif((v) => !v)}><Bell /></button>
          {showNotif && (
            <div className="public-notif-popover">
              <p>Login to view your notifications.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={onLogin}><LogIn className="h-3.5 w-3.5" /> Login</button>
            </div>
          )}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onLogin}><LogIn className="h-3.5 w-3.5" /> Login</button>
      </div>
    </header>
  );
}

// Exported so App.jsx can render the exact same bottom nav on the native
// login screen (which sits outside PublicMobileApp itself, but the user
// should be able to jump straight to Shops/Machines/My Ads from there
// without logging in - see App.jsx's login-shell rendering). Contact moved
// into the hamburger drawer (see PublicNavDrawer) to free this slot for
// "Add Ads" - a logged-out visitor tapping it sees a login-required prompt
// rather than a broken/empty create-ad screen (see onAddAds).
export function PublicBottomNav({ activeTab, onGoTab, onAddAds }) {
  return (
    <nav className="mobile-bottom-nav">
      <button className={`mbn-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => onGoTab('home')}>
        <span className="nav-ico-sm" style={{ background: 'var(--maroon)' }}><Home /></span>
        <span>Home</span>
      </button>
      <button className={`mbn-item ${activeTab === 'shops' ? 'active' : ''}`} onClick={() => onGoTab('shops')}>
        <span className="nav-ico-sm" style={{ background: 'var(--purple)' }}><Store /></span>
        <span>Shops</span>
      </button>
      <button className={`mbn-item ${activeTab === 'machines' ? 'active' : ''}`} onClick={() => onGoTab('machines')}>
        <span className="nav-ico-sm" style={{ background: 'var(--teal)' }}><Wrench /></span>
        <span>Machines</span>
      </button>
      <button className="mbn-item" onClick={onAddAds}>
        <span className="nav-ico-sm" style={{ background: 'var(--rose)' }}><Megaphone /></span>
        <span>Add Ads</span>
      </button>
    </nav>
  );
}

export default function PublicMobileApp({ api, onLogin, initialTab, defaultTown, locationReady }) {
  const [publicTab, setPublicTab] = useState(initialTab || 'home');
  const [screen, setScreen] = useState({ type: 'tab' });
  // Shop/Machine detail navigation stack - tapping a shop/machine card
  // pushes it; tapping a Related Shop/Product on a detail screen pushes
  // another level (so Back steps back through everything visited before
  // finally returning to the tab underneath), rather than replacing the
  // current one. Kept separate from `screen` above (which still handles
  // the simple non-stacked terms/feedback static screens) so the
  // Shops/Machines tab components below never get unmounted while this is
  // non-empty - see the `<main>` render below, where they stay mounted and
  // the top-of-stack detail renders as an overlay on top of them instead of
  // replacing them, which is what preserves their search/filter/scroll
  // state across an open-detail-then-Back round trip.
  const [detailStack, setDetailStack] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddAdsPrompt, setShowAddAdsPrompt] = useState(false);
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [tabCategoryHint, setTabCategoryHint] = useState('');

  useEffect(() => {
    api.getShopCategories().then(setCategories).catch(() => setCategories([]));
    api.getPublicProductTypes().then(setProductTypes).catch(() => setProductTypes([]));
  }, []);

  // Tab-level "back returns to Home" - registers on the same shared
  // back-handler stack as the shop/machine detail screens and the search
  // overlay below, so LIFO ordering naturally does the right thing: closing
  // a detail screen first, then a subsequent Back returns Shops/Machines/My
  // Ads to Home, and only then (empty stack) does the standard Android
  // double-back-to-exit behavior take over.
  useBackHandler(publicTab !== 'home' && screen.type === 'tab' && detailStack.length === 0 && !searchOpen, () => setPublicTab('home'));
  // One registration pops an arbitrary-depth stack one level at a time
  // (functional update avoids stale-closure issues) - same pattern used by
  // PromotionsFeed's detailStack in App.jsx.
  useBackHandler(detailStack.length > 0, () => setDetailStack((prev) => prev.slice(0, -1)));

  const openShop = (id) => setDetailStack((prev) => [...prev, { type: 'shop', id }]);
  const openMachine = (id) => setDetailStack((prev) => [...prev, { type: 'machine', id }]);
  const popDetail = () => setDetailStack((prev) => prev.slice(0, -1));
  const backToTab = () => setScreen({ type: 'tab' });
  const goTab = (tab, categoryHint) => {
    setScreen({ type: 'tab' });
    setDetailStack([]);
    setTabCategoryHint(categoryHint || '');
    setPublicTab(tab);
  };

  const openStatic = (key) => {
    setMenuOpen(false);
    if (key === 'contact') { goTab('contact'); return; }
    setScreen({ type: key });
  };

  let body;
  if (screen.type === 'terms') {
    body = <PublicStaticInfoScreen icon={FileText} color="var(--blue)" title="Terms & Conditions" body={TERMS_AND_CONDITIONS_BODY} onBack={backToTab} />;
  } else if (screen.type === 'feedback') {
    body = <PublicFeedbackScreen api={api} onBack={backToTab} />;
  } else if (publicTab === 'shops') {
    body = <PublicShopsTab api={api} categories={categories} onOpenShop={openShop} initialCategory={tabCategoryHint} defaultTown={defaultTown} locationReady={locationReady} />;
  } else if (publicTab === 'machines') {
    body = <PublicMachinesTab api={api} productTypes={productTypes} onOpenMachine={openMachine} initialCategory={tabCategoryHint} defaultTown={defaultTown} locationReady={locationReady} />;
  } else if (publicTab === 'contact') {
    body = <PublicContactTab api={api} />;
  } else {
    body = <PublicHomeTab api={api} onOpenShop={openShop} onOpenMachine={openMachine} onGoTab={goTab} />;
  }

  const topDetail = detailStack.length > 0 ? detailStack[detailStack.length - 1] : null;

  return (
    <div className="public-mobile-app">
      <PublicTopBar onSearch={() => setSearchOpen(true)} onLogin={onLogin} onMenu={() => setMenuOpen(true)} />
      <main className="public-mobile-main">{body}</main>
      {topDetail && (
        // position:fixed (not absolute-within-main) so this sits above
        // everything - including the bottom nav, reading as a proper
        // dedicated page - the same "escape any ancestor's layout"
        // approach already used by PublicAdViewer below. Rendered as a
        // sibling of <main>, not inside it, so the tab body above stays
        // mounted (and its search/filter/scroll state intact) underneath.
        <div className="pub-detail-overlay">
          {topDetail.type === 'shop' ? (
            <PublicShopDetailsScreen api={api} shopId={topDetail.id} onBack={popDetail} onOpenMachine={openMachine} onOpenShop={openShop} />
          ) : (
            <PublicMachineDetailsScreen api={api} machineId={topDetail.id} onBack={popDetail} onOpenMachine={openMachine} />
          )}
        </div>
      )}
      <PublicBottomNav activeTab={publicTab} onGoTab={goTab} onAddAds={() => setShowAddAdsPrompt(true)} />
      {searchOpen && <PublicSearchOverlay api={api} onClose={() => setSearchOpen(false)} onOpenShop={openShop} onOpenMachine={openMachine} />}
      <PublicNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={openStatic} />
      {showAddAdsPrompt && (
        <LoginRequiredModal onClose={() => setShowAddAdsPrompt(false)} onLogin={() => { setShowAddAdsPrompt(false); onLogin(); }} />
      )}
    </div>
  );
}
