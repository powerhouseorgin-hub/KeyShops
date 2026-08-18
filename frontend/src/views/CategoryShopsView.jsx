import React, { useState, useEffect, useRef } from 'react';
import { useLocationFilter } from '../utils/locationFilter';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import { categoryImage } from '../utils/categoryIcon';
import CustomSelect from '../components/CustomSelect';
import {
  Key, Search, Filter, MapPin, RefreshCw, ChevronRight, Phone, Store, Tag,
  MessageCircle, Globe,
  X,
} from 'lucide-react';

// ============================================================================
// DEDICATED CATEGORY SHOPS VIEW
// Displays shops belonging specifically to Key Shops, ECM, Meter, or Scanning.
// Each screen has its own Title, Search, Filter, and Responsive Layout.
// ============================================================================
// In-memory cache per category (module scope, public data so no user-scoping
// needed) - this view unmounts/remounts on every tab switch (Key Shops/ECM/
// Meter/Scanning each mount a fresh instance), so without this every bare
// revisit blanked to a spinner before showing anything, same root cause as
// the DashboardView fix. Shape mirrors dealersFirstPageCache below (an
// `{items, nextCursor, hasMore}` page, not a flat array) now that this view
// paginates too.
const categoryShopsCache = {};
// Page size for this view's cursor pagination - see DEALERS_PAGE_SIZE below
// (same value, same rationale) and ShopService.searchPublicShops. This view
// previously fetched every shop in a category with no `limit` at all - the
// backend's unpaginated branch silently caps at 50, so any category (Key
// Shops/ECM/Meter/Scanning) with more than 50 active shops had entries that
// were simply unreachable, with no error and no "Load More" affordance.
const CATEGORY_SHOPS_PAGE_SIZE = 20;

function CategoryShopsView({ categoryKey, icon: IconComponent, t, api, defaultTown, locationReady }) {
  const cachedPage = categoryShopsCache[categoryKey] || null;
  const [dealers, setDealers] = useState(cachedPage ? cachedPage.items : []);
  const [loading, setLoading] = useState(!cachedPage);
  // Infinite-scroll pagination state - `dealers` only ever holds the pages
  // loaded so far, never every shop in the category (see fetchDealers/
  // fetchMoreDealers below) - mirrors DealersView's identical state.
  const [nextCursor, setNextCursor] = useState(cachedPage ? cachedPage.nextCursor : null);
  const [hasMore, setHasMore] = useState(cachedPage ? cachedPage.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  // Debounced before it reaches the server - see DealersView/PromotionsFeed's
  // identical pattern for why (every change now triggers a network request).
  // A separate debounced value (not just a debounced fetch call) matters
  // here specifically because fetchMoreDealers below needs a stable filter
  // to page through - if it read the raw, still-being-typed `query` instead,
  // a "Load More" that fires while the user is mid-keystroke would page
  // through a different filter than the one the visible list was loaded
  // with.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const fetchDealers = async () => {
    // "Default view" means town is either empty or whatever GPS resolved as
    // the default (not just empty) - locationReady gating (see App()'s
    // locationReady) means the very first fetch may already carry a
    // GPS-resolved town, so comparing against '' only would mean this cache
    // never populates for any user with a resolved location.
    const isDefaultView = !debouncedQuery && (!town || town === defaultTown);
    // Only blank to a spinner for a real search/filter or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (!isDefaultView || dealers.length === 0) setLoading(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, category: categoryKey, town, limit: CATEGORY_SHOPS_PAGE_SIZE });
      setDealers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (isDefaultView) {
        categoryShopsCache[categoryKey] = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error('Failed to fetch category dealers', e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button. Mirrors DealersView's identical
  // fetchMoreDealers.
  const fetchMoreDealers = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, category: categoryKey, town, cursor: nextCursor, limit: CATEGORY_SHOPS_PAGE_SIZE });
      setDealers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error('Failed to fetch more category dealers', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Also waits for `filterReady` (useLocationFilter's 3rd return value),
  // not the raw `locationReady` prop, before the very first fetch - see
  // that hook's comment for the full "no flicker, no stale intermediate
  // fetch" rationale.
  useEffect(() => {
    if (!filterReady) return;
    fetchDealers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, town, categoryKey, filterReady]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreDealers();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedQuery, town]);

  let title = t('dealers');
  let description = t('dealersDesc');
  let accentColor = 'var(--gold)';

  if (categoryKey === 'KEY_SHOPS') {
    title = t('keyShops');
    description = t('keyShopsDesc');
    accentColor = 'var(--purple)';
  } else if (categoryKey === 'ECM') {
    title = t('ecm');
    description = t('ecmDesc');
    accentColor = 'var(--orange)';
  } else if (categoryKey === 'METER') {
    title = t('meter');
    description = t('meterDesc');
    accentColor = 'var(--skyblue)';
  } else if (categoryKey === 'SCANNER') {
    title = t('scanning');
    description = t('scanningDesc');
    accentColor = 'var(--teal)';
  }

  // `dealers` is already exactly-filtered to this category server-side (see
  // ShopService.searchPublicShops's `category` where-clause) - no client-side
  // re-filtering needed here anymore.

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ color: accentColor }}>
            {IconComponent ? <IconComponent className="h-4 w-4 inline-block mr-1" /> : <Store className="h-4 w-4 inline-block mr-1" />}
            {title} {t('directory') || 'Directory'}
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      {/* Search Bar + location filter - category filter buttons completely
          removed per earlier user request (this view is already scoped to
          one category via categoryKey). Equal 50/50 split, always on one
          row (no wrap) at every viewport width - `minWidth: 0` on both
          overrides .search-box's own 220px min-width and the location
          select's default sizing so a true 50/50 flex split governs both,
          even on narrow phones. */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        <div className="search-box" style={{ flex: '1 1 0', minWidth: 0 }}>
          <Search />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDealersPlaceholder') || 'Search shops by name, address, phone...'}
          />
          {query && (
            <button onClick={() => setQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <CustomSelect
            className="location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder="All Locations"
            searchable
            searchPlaceholder="Search district or town…"
            options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
          />
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: accentColor }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingEllipsis')}</span>
        </div>
      ) : dealers.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge" style={{ background: accentColor, color: '#ffffff' }}>
            {IconComponent ? <IconComponent style={{ width: 24, height: 24 }} /> : <Store style={{ width: 24, height: 24 }} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noShopsFound')}</span>
        </div>
      ) : (
        <div className="dealer-list stagger-in">
          {dealers.map((dealer) => (
            <div key={dealer.id} className="dealer-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                <div className="dealer-logo" style={{ background: 'var(--card-2)', padding: 4 }}>
                  <img src={categoryImage(dealer.category)} alt={dealer.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div className="dealer-info">
                  <div className="dealer-name">{dealer.name}</div>
                  {dealer.category && (
                    <div className="dealer-line">
                      <Tag /> <span>{dealer.category}</span>
                    </div>
                  )}
                  {dealer.address && (
                    <div className="dealer-line">
                      <MapPin /> <span>{dealer.address}</span>
                    </div>
                  )}
                  {dealer.website && (
                    <div className="dealer-line">
                      <Globe />
                      <a href={dealer.website.startsWith('http') ? dealer.website : `https://${dealer.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {dealer.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="dealer-quick-actions">
                {dealer.phone && (
                  <>
                    <a href={`tel:${dealer.phone}`} className="dealer-quick-btn call">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix') || 'Call'}</span>
                    </a>
                    <a href={`https://wa.me/${dealer.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="dealer-quick-btn whatsapp">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                )}
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-3)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
          DealersView/PromotionsFeed's identical pattern for why both exist. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: accentColor }} />
          ) : (
            <button type="button" onClick={fetchMoreDealers} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default CategoryShopsView;
