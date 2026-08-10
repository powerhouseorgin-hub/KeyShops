import React, { useEffect, useRef, useState } from 'react';
import {
  Home, Store, Wrench, Megaphone, Search, Bell, LogIn, X, ChevronLeft, ChevronRight,
  MapPin, Phone, Globe, Tag, ShieldCheck, RefreshCw, Package, IndianRupee,
} from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';
import keyShopLogo from '../assets/branding/keyshop-logo.png';

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
    const id = setInterval(() => setPos((p) => p + 1), 4000);
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
    <div className="ad-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div
        className="ad-carousel-track"
        onTransitionEnd={handleTransitionEnd}
        style={{ transform: `translateX(-${pos * 100}%)`, transition: noTransition ? 'none' : undefined }}
      >
        {slides.map((ad, i) => (
          <div className="ad-carousel-slide" key={`${ad.id}-${i}`}>
            <img src={ad.imageUrl} alt={ad.title} />
            {ad.title && <div className="ad-carousel-caption">{ad.title}</div>}
          </div>
        ))}
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

function PublicShopCard({ shop, onOpen }) {
  return (
    <button type="button" className="card public-shop-card" onClick={() => onOpen(shop.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
      <div className="public-shop-card-top">
        <div className="icon-badge solid"><Store /></div>
        <div>
          <h3>{shop.name}</h3>
          <span className="pill-badge"><ShieldCheck className="h-3.5 w-3.5" /> Verified Kee shop</span>
        </div>
      </div>
      {shop.category && <div className="public-shop-meta"><Tag className="h-3.5 w-3.5" /> {shop.category}</div>}
      {shop.address && <div className="public-shop-meta"><MapPin className="h-3.5 w-3.5" /> {shop.address}</div>}
      {shop.phone && <div className="public-shop-meta"><Phone className="h-3.5 w-3.5" /> {shop.phone}</div>}
      {shop.website && <div className="public-shop-meta"><Globe className="h-3.5 w-3.5" /> {shop.website}</div>}
    </button>
  );
}

function PublicMachineCard({ item, onOpen }) {
  return (
    <button type="button" className="card public-machine-card" onClick={() => onOpen(item.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
      <div className="public-machine-card-img">
        {item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : <Package className="h-8 w-8" />}
      </div>
      <div className="public-machine-card-body">
        <h4>{item.title}</h4>
        {item.productType && <span className="public-shop-meta"><Tag className="h-3.5 w-3.5" /> {item.productType}</span>}
        {item.shop?.name && <span className="public-shop-meta"><Store className="h-3.5 w-3.5" /> {item.shop.name}</span>}
        {item.price != null && <span className="public-machine-price"><IndianRupee className="h-3.5 w-3.5" /> {Number(item.price).toLocaleString('en-IN')}</span>}
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

function LoginPrompt({ message, onLogin }) {
  return (
    <div className="public-login-prompt">
      <p>{message}</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={onLogin}><LogIn className="h-3.5 w-3.5" /> Login</button>
    </div>
  );
}

function CategoryChips({ options, value, onChange }) {
  return (
    <div className="store-tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
      <button type="button" className={`store-tab ${!value ? 'active' : ''}`} onClick={() => onChange('')}>All</button>
      {options.map((opt) => (
        <button
          key={opt.id || opt.name}
          type="button"
          className={`store-tab ${value === opt.name ? 'active' : ''}`}
          onClick={() => onChange(opt.name)}
        >
          {opt.name}
        </button>
      ))}
    </div>
  );
}

// Home's horizontal-scroll strips show at most HOME_STRIP_LIMIT cards, with
// a trailing "Show More" card that jumps straight to the full Shops/Machines
// tab - so fetching one extra item (HOME_STRIP_LIMIT + 1) tells us whether
// there's actually more to show without a separate count query.
const HOME_STRIP_LIMIT = 5;

function ShowMoreCard({ onClick }) {
  return (
    <button type="button" className="card public-show-more-card" onClick={onClick}>
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
        {shops === null ? <LoadingState /> : shops.length === 0 ? <EmptyState icon={Store} text="No shops found." /> : (
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
        {machines === null ? <LoadingState /> : machines.length === 0 ? <EmptyState icon={Package} text="No machines available." /> : (
          <div className="public-mobile-hscroll">
            {machines.slice(0, HOME_STRIP_LIMIT).map((m) => <div className="public-mobile-hcard" key={m.id}><PublicMachineCard item={m} onOpen={onOpenMachine} /></div>)}
            {machines.length > HOME_STRIP_LIMIT && <div className="public-mobile-hcard"><ShowMoreCard onClick={() => onGoTab('machines')} /></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function PublicShopsTab({ api, categories, onOpenShop, initialCategory }) {
  const [category, setCategory] = useState(initialCategory || '');
  const [items, setItems] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const fetchFirst = () => {
    setItems(null);
    setError(false);
    api.searchPublicShops({ category, limit: 20 })
      .then((res) => { setItems(res.items); setNextCursor(res.nextCursor); })
      .catch(() => setError(true));
  };

  useEffect(fetchFirst, [category]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    api.searchPublicShops({ category, cursor: nextCursor, limit: 20 })
      .then((res) => { setItems((prev) => [...prev, ...res.items]); setNextCursor(res.nextCursor); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="public-mobile-tab">
      <CategoryChips options={categories} value={category} onChange={setCategory} />
      {items === null ? <LoadingState /> : error ? (
        <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." />
      ) : items.length === 0 ? (
        <EmptyState icon={Store} text="No shops found." />
      ) : (
        <>
          <div className="public-shop-grid" style={{ gridTemplateColumns: '1fr' }}>
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

function PublicMachinesTab({ api, productTypes, onOpenMachine, initialCategory }) {
  const [category, setCategory] = useState(initialCategory || '');
  const [items, setItems] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const fetchFirst = () => {
    setItems(null);
    setError(false);
    api.getPublicMachines({ category, limit: 20 })
      .then((res) => { setItems(res.items); setNextCursor(res.nextCursor); })
      .catch(() => setError(true));
  };

  useEffect(fetchFirst, [category]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    api.getPublicMachines({ category, cursor: nextCursor, limit: 20 })
      .then((res) => { setItems((prev) => [...prev, ...res.items]); setNextCursor(res.nextCursor); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="public-mobile-tab">
      <CategoryChips options={productTypes} value={category} onChange={setCategory} />
      {items === null ? <LoadingState /> : error ? (
        <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." />
      ) : items.length === 0 ? (
        <EmptyState icon={Package} text="No machines available." />
      ) : (
        <>
          <div className="public-machine-grid">
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

function PublicMyAdsTab({ api, onLogin, onOpenMachine }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getPublicMachines({ limit: 20 }).then((res) => { if (!cancelled) setItems(res.items); }).catch(() => setItems([]));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="public-mobile-tab">
      <LoginPrompt message="Login to view your saved or personalized ads." onLogin={onLogin} />
      {items === null ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Megaphone} text="No ads available." /> : (
        <div className="public-machine-grid">
          {items.map((m) => <PublicMachineCard key={m.id} item={m} onOpen={onOpenMachine} />)}
        </div>
      )}
    </div>
  );
}

function PublicShopDetailsScreen({ api, shopId, onBack, onOpenMachine }) {
  const [shop, setShop] = useState(null);
  const [error, setError] = useState(false);
  useBackHandler(true, onBack);

  useEffect(() => {
    let cancelled = false;
    setShop(null);
    setError(false);
    api.getPublicShopById(shopId).then((res) => { if (!cancelled) setShop(res); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [shopId]);

  return (
    <div className="public-mobile-tab">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</button>
      {!shop && !error ? <LoadingState /> : error ? <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." /> : (
        <div className="card public-shop-card" style={{ marginTop: 14 }}>
          <div className="public-shop-card-top">
            <div className="icon-badge solid"><Store /></div>
            <div>
              <h3>{shop.name}</h3>
              <span className="pill-badge"><ShieldCheck className="h-3.5 w-3.5" /> Verified Kee shop</span>
            </div>
          </div>
          {shop.category && <div className="public-shop-meta"><Tag className="h-3.5 w-3.5" /> {shop.category}</div>}
          {shop.address && <div className="public-shop-meta"><MapPin className="h-3.5 w-3.5" /> {shop.address}</div>}
          {shop.phone && <div className="public-shop-meta"><Phone className="h-3.5 w-3.5" /> <a href={`tel:${shop.phone}`}>{shop.phone}</a></div>}
          {shop.website && <div className="public-shop-meta"><Globe className="h-3.5 w-3.5" /> <a href={safeUrl(shop.website)} target="_blank" rel="noreferrer">{shop.website}</a></div>}

          {shop.products && shop.products.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Machines/products available</h4>
              <div className="public-machine-grid">
                {shop.products.map((m) => <PublicMachineCard key={m.id} item={m} onOpen={onOpenMachine} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PublicMachineDetailsScreen({ api, machineId, onBack }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState(false);
  useBackHandler(true, onBack);

  useEffect(() => {
    let cancelled = false;
    setItem(null);
    setError(false);
    api.getPublicMachineById(machineId).then((res) => { if (!cancelled) setItem(res); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [machineId]);

  return (
    <div className="public-mobile-tab">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</button>
      {!item && !error ? <LoadingState /> : error ? <EmptyState icon={RefreshCw} text="Unable to load data. Please try again." /> : (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="public-machine-card-img" style={{ height: 180, borderRadius: 14, marginBottom: 14 }}>
            {item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : <Package className="h-10 w-10" />}
          </div>
          <h3 style={{ marginBottom: 6 }}>{item.title}</h3>
          {item.productType && <div className="public-shop-meta"><Tag className="h-3.5 w-3.5" /> {item.productType}</div>}
          {item.shop?.name && <div className="public-shop-meta"><Store className="h-3.5 w-3.5" /> {item.shop.name}</div>}
          {item.price != null && <div className="public-machine-price"><IndianRupee className="h-3.5 w-3.5" /> {Number(item.price).toLocaleString('en-IN')}</div>}
          {item.description && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{item.description}</p>}
          {item.phone && (
            <a href={`tel:${item.phone}`} className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
              <Phone className="h-3.5 w-3.5" /> Call {item.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function PublicSearchOverlay({ api, onClose, onOpenShop, onOpenMachine }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(false);
  useBackHandler(true, onClose);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults(null); setError(false); return; }
    setError(false);
    const timer = setTimeout(() => {
      api.getPublicSearch(query).then(setResults).catch(() => setError(true));
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
                <div className="public-shop-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {results.shops.map((s) => <PublicShopCard key={s.id} shop={s} onOpen={(id) => { onOpenShop(id); onClose(); }} />)}
                </div>
              </div>
            )}
            {results.machines.length > 0 && (
              <div className="public-mobile-section">
                <div className="public-mobile-section-head"><h3>Machines &amp; Products</h3></div>
                <div className="public-machine-grid">
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

function PublicTopBar({ onSearch, onLogin }) {
  const [showNotif, setShowNotif] = useState(false);
  return (
    <header className="public-mobile-topbar">
      <img src={keyShopLogo} alt="Key Shop" className="public-mobile-logo" />
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
// without logging in - see App.jsx's login-shell rendering).
export function PublicBottomNav({ activeTab, onGoTab }) {
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
      <button className={`mbn-item ${activeTab === 'myads' ? 'active' : ''}`} onClick={() => onGoTab('myads')}>
        <span className="nav-ico-sm" style={{ background: 'var(--rose)' }}><Megaphone /></span>
        <span>My Ads</span>
      </button>
    </nav>
  );
}

export default function PublicMobileApp({ api, onLogin, initialTab }) {
  const [publicTab, setPublicTab] = useState(initialTab || 'home');
  const [screen, setScreen] = useState({ type: 'tab' });
  const [searchOpen, setSearchOpen] = useState(false);
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
  useBackHandler(publicTab !== 'home' && screen.type === 'tab' && !searchOpen, () => setPublicTab('home'));

  const openShop = (id) => setScreen({ type: 'shop', id });
  const openMachine = (id) => setScreen({ type: 'machine', id });
  const backToTab = () => setScreen({ type: 'tab' });
  const goTab = (tab, categoryHint) => {
    setScreen({ type: 'tab' });
    setTabCategoryHint(categoryHint || '');
    setPublicTab(tab);
  };

  let body;
  if (screen.type === 'shop') {
    body = <PublicShopDetailsScreen api={api} shopId={screen.id} onBack={backToTab} onOpenMachine={openMachine} />;
  } else if (screen.type === 'machine') {
    body = <PublicMachineDetailsScreen api={api} machineId={screen.id} onBack={backToTab} />;
  } else if (publicTab === 'shops') {
    body = <PublicShopsTab api={api} categories={categories} onOpenShop={openShop} initialCategory={tabCategoryHint} />;
  } else if (publicTab === 'machines') {
    body = <PublicMachinesTab api={api} productTypes={productTypes} onOpenMachine={openMachine} initialCategory={tabCategoryHint} />;
  } else if (publicTab === 'myads') {
    body = <PublicMyAdsTab api={api} onLogin={onLogin} onOpenMachine={openMachine} />;
  } else {
    body = <PublicHomeTab api={api} onOpenShop={openShop} onOpenMachine={openMachine} onGoTab={goTab} />;
  }

  return (
    <div className="public-mobile-app">
      <PublicTopBar onSearch={() => setSearchOpen(true)} onLogin={onLogin} />
      <main className="public-mobile-main">{body}</main>
      <PublicBottomNav activeTab={publicTab} onGoTab={goTab} />
      {searchOpen && <PublicSearchOverlay api={api} onClose={() => setSearchOpen(false)} onOpenShop={openShop} onOpenMachine={openMachine} />}
    </div>
  );
}
