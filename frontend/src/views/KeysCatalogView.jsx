import React, { useState, useEffect, useRef } from 'react';
import { getFresh, setCache } from '../utils/fetchCache';
import { keyTypeDisplayLabel } from '../utils/keyType';
import {
  Key, KeyRound, RefreshCw, Search, Store,
  X,
} from 'lucide-react';

// ============================================================================
// COMPONENT 4: MASTER KEY DATABASE CRUD (SUPER ADMIN ONLY)
// ============================================================================
// Page size for the Master Catalogue's cursor pagination - see
// KeyService.getKeys.
const KEY_CATALOGUE_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope, same rationale as shopsFirstPageCache above.
let keysFirstPageCache = null;
// Within this many ms of the last fetch, a revisit skips the network/DB
// round-trip entirely (see fetchCache.js) instead of just avoiding the
// blank-spinner flash keysFirstPageCache above already handled.
const KEYS_TTL_MS = 30 * 1000;
const KEYS_CACHE_KEY = 'keys-catalogue:default';

function KeysCatalogView({ t, api, searchDispatch }) {
  const [keys, setKeys] = useState(keysFirstPageCache ? keysFirstPageCache.items : []);
  const [loading, setLoading] = useState(!keysFirstPageCache);
  // Infinite-scroll pagination state - `keys` only ever holds the pages
  // loaded so far, never the whole platform-wide catalog.
  const [nextCursor, setNextCursor] = useState(keysFirstPageCache ? keysFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(keysFirstPageCache ? keysFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request instead of
  // filtering an already-fully-loaded list).
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Picks up a query dispatched from the global header search panel (filter = "Key").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'key') {
      setSearchQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchKeys = async () => {
    // A fresh-enough default-view cache skips the network/DB round-trip
    // entirely, not just the loading spinner (see KEYS_TTL_MS).
    if (!debouncedSearchQuery) {
      const fresh = getFresh(KEYS_CACHE_KEY, KEYS_TTL_MS);
      if (fresh) {
        setKeys(fresh.items);
        setNextCursor(fresh.nextCursor);
        setHasMore(fresh.hasMore);
        setLoading(false);
        return;
      }
    }
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedSearchQuery || keys.length === 0) setLoading(true);
    try {
      const res = await api.getSuperKeysCatalogue({ search: debouncedSearchQuery, limit: KEY_CATALOGUE_PAGE_SIZE });
      setKeys(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (!debouncedSearchQuery) {
        const page = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
        keysFirstPageCache = page;
        setCache(KEYS_CACHE_KEY, page);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreKeys = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getSuperKeysCatalogue({ search: debouncedSearchQuery, cursor: nextCursor, limit: KEY_CATALOGUE_PAGE_SIZE });
      setKeys((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreKeys();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedSearchQuery]);

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Key /> {t('platformCatalogueLabel')}</div>
          <h1>{t('masterKeyCatalogueTitle')}</h1>
          <p>{t('registeredKeysAcrossShopsDesc')}</p>
        </div>
      </div>

      {/* Central catalog lookup search input */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, marginBottom: 24 }}>
        <div className="search-box" style={{ width: '100%', minWidth: 0, border: 'none', background: 'transparent', padding: '18px 22px' }}>
          <Search />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchCataloguePlaceholder')}
            style={{ fontSize: 14 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingCatalogueMsg')}</span>
        </div>
      ) : keys.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge maroon"><KeyRound /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noRegisteredKeysMatch')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {keys.map((c) => {
            const typeLabel = keyTypeDisplayLabel(t, c.vehicleCategory);
            return (
              <div key={c.id} className="product-card">
                <div className="product-img" style={{ background: 'var(--maroon)' }}>
                  <KeyRound style={{ color: '#ffffff' }} />
                  <span className="product-tag">{c.addKey ? t('addKeyLabel') : c.lostKey ? t('lostKeyLabel') : t('registeredKeyLabel')}</span>
                </div>
                <div className="product-body">
                  <span className="pname">{c.keyNumber}</span>
                  <p className="pcat">{c.name}</p>
                  {typeLabel && (
                    <span className="badge" style={{ alignSelf: 'flex-start', background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {typeLabel}
                    </span>
                  )}
                  <div className="cell-sub" style={{ fontSize: 11 }}>
                    <Store className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                    {c.shop?.name || '—'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
          PromotionsFeed's identical pattern for why both exist. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
          ) : (
            <button type="button" onClick={fetchMoreKeys} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default KeysCatalogView;
