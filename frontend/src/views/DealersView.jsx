import React, { useState, useEffect, useRef } from 'react';
import { getFresh, setCache } from '../utils/fetchCache';
import { useLocationFilter } from '../utils/locationFilter';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import { categoryImage } from '../utils/categoryIcon';
import CustomSelect from '../components/CustomSelect';
import {
  ChevronRight, Globe, MapPin, MessageCircle, Phone, RefreshCw, Search, Store, Tag,
  X,
} from 'lucide-react';

// ============================================================================
// DEALERS DIRECTORY VIEW (SHOP ADMIN & SUPER ADMIN)
// Displays registered public shop/dealer listings across India with non-scrollable
// category filter cards (All, Key Shops, ECM, Meter, Scanning).
// ============================================================================
// Page size for the Dealers directory's cursor pagination - see
// ShopService.searchPublicShops.
const DEALERS_PAGE_SIZE = 20;

// Caches only the first page of the default (no search, "ALL" category)
// list - module scope, same rationale as shopsFirstPageCache above.
let dealersFirstPageCache = null;
// Within this many ms of the last fetch, a revisit skips the network/DB
// round-trip entirely (see fetchCache.js) instead of just avoiding the
// blank-spinner flash dealersFirstPageCache above already handled.
const DEALERS_TTL_MS = 30 * 1000;
const DEALERS_CACHE_KEY = 'dealers:default';

function DealersView({ t, api, defaultTown, locationReady }) {
  const [dealers, setDealers] = useState(dealersFirstPageCache ? dealersFirstPageCache.items : []);
  const [loading, setLoading] = useState(!dealersFirstPageCache);
  // Infinite-scroll pagination state - `dealers` only ever holds the pages
  // loaded so far, never the whole directory (see fetchDealers/fetchMoreDealers).
  const [nextCursor, setNextCursor] = useState(dealersFirstPageCache ? dealersFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(dealersFirstPageCache ? dealersFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Loads the first page for the current search, replacing whatever was
  // loaded before. The category filter cards were removed - this always
  // browses every category now (see ShopService.searchPublicShops's
  // `category` param, simply omitted here).
  const fetchDealers = async () => {
    // "Default view" means town is either empty or whatever GPS resolved as
    // the default (not just empty) - see CategoryShopsView's identical
    // comment for why: locationReady gating means the very first fetch may
    // already carry a GPS-resolved town.
    const isDefaultView = !debouncedQuery && (!town || town === defaultTown);
    // A fresh-enough default-view cache skips the network/DB round-trip
    // entirely, not just the loading spinner (see DEALERS_TTL_MS).
    if (isDefaultView) {
      const fresh = getFresh(DEALERS_CACHE_KEY, DEALERS_TTL_MS);
      if (fresh) {
        setDealers(fresh.items);
        setNextCursor(fresh.nextCursor);
        setHasMore(fresh.hasMore);
        setLoading(false);
        return;
      }
    }
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (!isDefaultView || dealers.length === 0) setLoading(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, town, limit: DEALERS_PAGE_SIZE });
      setDealers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (isDefaultView) {
        const page = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
        dealersFirstPageCache = page;
        setCache(DEALERS_CACHE_KEY, page);
      }
    } catch (e) {
      console.error('Failed to fetch dealers', e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreDealers = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, town, cursor: nextCursor, limit: DEALERS_PAGE_SIZE });
      setDealers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error('Failed to fetch more dealers', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Waits for `filterReady` before the very first fetch - see
  // ShopsManagementView's identical guard for the full rationale.
  useEffect(() => {
    if (!filterReady) return;
    fetchDealers();
  }, [debouncedQuery, town, filterReady]);

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

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Store /> {t('dealersEyebrow')}</div>
          <h1>{t('dealersPageTitle')}</h1>
          <p>{t('dealersPageDesc')}</p>
        </div>
      </div>

      {/* Search Panel + location filter */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '2 1 260px' }}>
          <Search />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDealersPlaceholder') || 'Search dealers by name, location, category...'}
          />
          {query && (
            <button onClick={() => setQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <CustomSelect
          className="location-filter-select"
          icon={MapPin}
          value={town}
          onChange={setTown}
          placeholder="All Locations"
          searchable
          searchPlaceholder="Search district or town…"
          options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
          triggerStyle={{ minWidth: 180 }}
        />
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingEllipsis')}</span>
        </div>
      ) : dealers.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge rose"><Store /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noDealersFoundMsg') || 'No dealers found matching your search.'}</span>
        </div>
      ) : (
        <div className="dealer-list stagger-in">
          {dealers.map((dealer) => (
            <div key={dealer.id} className="dealer-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                <div className="dealer-logo">
                  <img src={categoryImage(dealer.category)} alt={dealer.name} loading="lazy" />
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
          PromotionsFeed's identical pattern for why both exist. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
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

export default DealersView;
