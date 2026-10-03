import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Search, Store, ShieldCheck, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { vehicleSaleText, fillText } from '../i18n/vehicleSaleText';
import VehicleSaleDetail from '../components/VehicleSaleDetail';
import ImageZoomViewer from '../components/ImageZoomViewer';

// "All Sales": a read-only review of vehicle sales, newest first, with a search box over what is loaded and paging.
//   - Super Admin: every sale on the platform (each shop's and the Super Admin's own), with a filter by shop / Super Admin,
//     and who sold each one.
//   - Shop Admin: only their own shop's complete history (no shop filter - it is all theirs).
// Tapping a sale opens the read-only details screen. Nothing here edits, sends or deletes a sale.
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LANG_NAMES = { ta: 'தமிழ்', en: 'English', hi: 'हिन्दी', te: 'తెలుగు', kn: 'ಕನ್ನಡ', ml: 'മലയാളം' };
const PAGE = 30;

export default function SuperVehicleSalesView({ api, lang = 'en', scope = 'platform' }) {
  const T = vehicleSaleText(lang);
  const isShop = scope === 'shop';
  const [shops, setShops] = useState([]);
  const [filter, setFilter] = useState(''); // '' = everyone, 'SUPER_ADMIN', or a shop id
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    if (isShop) return undefined; // a shop has no shop filter
    let cancelled = false;
    api.getShops()
      .then((list) => { if (!cancelled) setShops((Array.isArray(list) ? list : list?.items || []).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => String(a.name).localeCompare(String(b.name)))); })
      .catch((e) => console.error('Failed to load shops for the filter:', e));
    return () => { cancelled = true; };
  }, [api, isShop]);

  const load = useCallback(async (reset) => {
    if (reset) { setLoading(true); setError(''); } else { setLoadingMore(true); }
    try {
      const cursor = reset ? '' : nextCursor || '';
      const res = isShop
        ? await api.getShopVehicleSalesPage({ cursor, limit: PAGE })
        : await api.getAllVehicleSales({ shopId: filter, cursor, limit: PAGE });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor || null);
    } catch (e) {
      setError(e.message || 'Failed to load sales');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [api, filter, nextCursor, isShop]);

  // reload from the first page whenever the filter changes
  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, api]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => [s.registrationNumber, s.saleNumber, s.buyerName, s.sellerName, s.ownerName, s.vehicleName, s.buyerPhone]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [items, search]);

  const ownerChip = (s) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: s.ownerType === 'SUPER_ADMIN' ? 'var(--gold-dim-2)' : 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)', maxWidth: '100%' }}>
      {s.ownerType === 'SUPER_ADMIN' ? <ShieldCheck size={12} /> : <Store size={12} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ownerType === 'SUPER_ADMIN' ? T.superAdminOwner : (s.ownerName || '—')}</span>
    </span>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-head reg-wizard-head">
        <div>
          <div className="eyebrow"><Receipt /> {T.reviewEyebrow}</div>
          <h1>{T.reviewTitle}</h1>
          <p className="desc" style={{ marginTop: 6 }}>{isShop ? T.reviewSubtitleShop : T.reviewSubtitle}</p>
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {!isShop && (
            <div className="input-wrap">
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={T.filterShop} style={{ paddingLeft: 12 }}>
                <option value="">{T.allShops}</option>
                <option value="SUPER_ADMIN">{T.superAdminOwner}</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="input-wrap" style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-3)' }} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.reviewSearch} aria-label={T.reviewSearch} style={{ paddingLeft: 36 }} />
          </div>
        </div>
      </div>

      {error && <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}><p className="desc" style={{ margin: 0 }}>{T.noResults}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((s) => (
            <div key={s.path || s.id} role="button" tabIndex={0} onClick={() => setDetail(s)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(s); } }}
              aria-label={`${T.detailsTitle}: ${s.registrationNumber}`}
              className="card" style={{ padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{s.registrationNumber} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 12 }}>· {s.saleNumber}</span></div>
                  <div className="cell-sub" style={{ marginTop: 3 }}>{T.buyerShort}: {s.buyerName} · {s.saleDate}</div>
                </div>
                {!isShop && ownerChip(s)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontSize: 12.5, fontWeight: 700, flexWrap: 'wrap' }}>
                <span>Rs. {inr(s.vehiclePrice)}</span>
                <span style={{ color: 'var(--text-2)' }}>{T.balanceShort}: Rs. {inr(s.balanceAmount)}</span>
                {Array.isArray(s.photos) && s.photos.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-2)' }}><ImageIcon size={13} /> {s.photos.length}</span>
                )}
              </div>
            </div>
          ))}
          {nextCursor && !search.trim() && (
            <button type="button" className="btn btn-outline" onClick={() => load(false)} disabled={loadingMore} style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {loadingMore && <RefreshCw className="animate-spin h-4 w-4" />} {T.loadMore}
            </button>
          )}
          {nextCursor && search.trim() && <p className="cell-sub" style={{ textAlign: 'center' }}>{fillText(T.searchLoadedOnly, { count: items.length })}</p>}
        </div>
      )}

      {detail && (
        <VehicleSaleDetail
          sale={detail}
          T={T}
          languageName={LANG_NAMES[detail.lang] || detail.lang}
          showOwner={!isShop}
          hideActions
          onClose={() => setDetail(null)}
          onOpenPhoto={(images, index) => setViewer({ images, index })}
        />
      )}
      {viewer && <ImageZoomViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  );
}
