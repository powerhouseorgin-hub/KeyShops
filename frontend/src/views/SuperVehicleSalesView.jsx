import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, Search, Store, ShieldCheck, Image as ImageIcon, RefreshCw, Download, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { vehicleSaleText, fillText } from '../i18n/vehicleSaleText';
import VehicleSaleDetail from '../components/VehicleSaleDetail';
import ImageZoomViewer from '../components/ImageZoomViewer';
import useSaleInvoiceActions from '../hooks/useSaleInvoiceActions';
import { shopInfoFromRow } from '../utils/vehicleSaleInvoice';
import { downloadBlobFile } from '../utils/pdfDelivery';

// "All Sales": a review of vehicle sales, newest first, with a search box over what is loaded and paging.
//   - Super Admin: every sale on the platform (each shop's and the Super Admin's own), with a filter by shop / Super Admin,
//     and who sold each one.
//   - Shop Admin: only their own shop's complete history (no shop filter - it is all theirs).
// Tapping a sale opens its details screen (all recorded details, photos and both signatures) with Download Invoice and Send Invoice
// (the receipt to the seller AND the buyer on WhatsApp, at the same time). "Download All" turns the list into a selection list
// (checkboxes, Select All, deselect) and downloads the chosen receipts as ZIP files. What can be selected is exactly what the screen
// can list: the server only ever returns a Shop Admin their own shop's sales, so a shop can never reach another shop's records,
// while a Super Admin's selection spans every shop. The receipts are made on this device from the saved data, one language per sale
// (the language it was sold in, Tamil by default).
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LANG_NAMES = { ta: 'தமிழ்', en: 'English', hi: 'हिन्दी', te: 'తెలుగు', kn: 'ಕನ್ನಡ', ml: 'മലയാളം' };
const PAGE = 30;
const FETCH_ALL_PAGE = 100;
const FETCH_ALL_MAX = 2000; // Select All never pulls more than this many records
const ZIP_CHUNK = 50; // invoices per ZIP, so a phone never holds hundreds of PDFs in memory at once
const POOL = 3; // invoices built at the same time
const keyOf = (s) => s.path || s.id;

export default function SuperVehicleSalesView({ api, lang = 'en', scope = 'platform' }) {
  const T = vehicleSaleText(lang);
  const { user } = useAuth();
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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // { phase: 'loading' } | { phase: 'working', done, total, part, parts }
  const [bulkMsg, setBulkMsg] = useState('');
  const cancelRef = useRef(false);
  const shopRowsRef = useRef(new Map());
  const shopsReadyRef = useRef(Promise.resolve());
  const settingsRef = useRef(null);

  useEffect(() => {
    if (isShop) return undefined; // a shop has no shop filter
    let cancelled = false;
    shopsReadyRef.current = api.getShops()
      .then((list) => {
        const rows = Array.isArray(list) ? list : list?.items || [];
        rows.forEach((r) => shopRowsRef.current.set(r.id, r));
        if (!cancelled) setShops(rows.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))));
      })
      .catch((e) => console.error('Failed to load shops:', e));
    return () => { cancelled = true; };
  }, [api, isShop]);

  // The receipt header (shop name, address, phone) for a sale.
  const resolveShop = useCallback(async (sale) => {
    if (isShop) {
      if (!settingsRef.current) {
        const res = await api.getSettings();
        let address = 'N/A';
        let phone = 'N/A';
        try {
          const details = res.companyDetails ? JSON.parse(res.companyDetails) : {};
          address = details.address || 'N/A';
          phone = details.phone || 'N/A';
        } catch (e) { /* keep the defaults */ }
        settingsRef.current = { name: res.name, address, phone };
      }
      return settingsRef.current;
    }
    if (sale.ownerType === 'SUPER_ADMIN') return { name: sale.ownerName || user?.name || 'Super Admin', address: 'N/A', phone: user?.phone || 'N/A' };
    await shopsReadyRef.current;
    const row = shopRowsRef.current.get(sale.shopId);
    return row ? shopInfoFromRow(row) : { name: sale.ownerName || '', address: 'N/A', phone: 'N/A' };
  }, [api, isShop, user]);

  // keeps the delivery status shown on the list and on the open details screen up to date after a send
  const onDelivery = useCallback((sale, results) => {
    const now = Date.now();
    const patch = (s) => {
      if (keyOf(s) !== keyOf(sale)) return s;
      const inv = { ...(s.invoiceDelivery || {}) };
      for (const [party, r] of Object.entries(results)) {
        inv[party] = { sent: r.sent, at: now, ...(r.reason ? { reason: r.reason } : {}), ...(r.message ? { message: r.message } : {}) };
      }
      return { ...s, invoiceDelivery: inv };
    };
    setItems((list) => list.map(patch));
    setDetail((d) => (d ? patch(d) : d));
  }, []);

  const actions = useSaleInvoiceActions({ api, T, resolveShop, registeredByName: user?.name, onDelivery });

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

  // reload from the first page whenever the filter changes (and leave selection mode - the list it referred to is gone)
  useEffect(() => { setSelected(new Set()); setSelectMode(false); load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, api]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => [s.registrationNumber, s.saleNumber, s.buyerName, s.sellerName, s.ownerName, s.vehicleName, s.buyerPhone]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [items, search]);

  // ---- selection ----------------------------------------------------------------------------------------------------
  const toggle = (s) => setSelected((cur) => {
    const next = new Set(cur);
    const k = keyOf(s);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const allShownSelected = shown.length > 0 && shown.every((s) => selected.has(keyOf(s))) && (!nextCursor || !!search.trim());

  // Select All: first brings in every remaining page (so "all" really means all the records the user may see - for a Super Admin,
  // every shop), then ticks them. With a search active it ticks the matching ones.
  const selectAll = async () => {
    if (allShownSelected) { setSelected(new Set()); return; }
    let list = items;
    let cursor = nextCursor;
    if (cursor && !search.trim()) {
      setBulk({ phase: 'loading' });
      try {
        while (cursor && list.length < FETCH_ALL_MAX) {
          const res = isShop
            ? await api.getShopVehicleSalesPage({ cursor, limit: FETCH_ALL_PAGE })
            : await api.getAllVehicleSales({ shopId: filter, cursor, limit: FETCH_ALL_PAGE });
          list = [...list, ...res.items];
          cursor = res.nextCursor || null;
        }
        setItems(list);
        setNextCursor(cursor);
      } catch (e) {
        setError(e.message || 'Failed to load sales');
      } finally {
        setBulk(null);
      }
    }
    const q = search.trim().toLowerCase();
    const pool = q ? list.filter((s) => [s.registrationNumber, s.saleNumber, s.buyerName, s.sellerName, s.ownerName, s.vehicleName, s.buyerPhone].some((v) => String(v || '').toLowerCase().includes(q))) : list;
    setSelected(new Set(pool.map(keyOf)));
  };

  const leaveSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  // ---- bulk download --------------------------------------------------------------------------------------------------
  const downloadSelected = async () => {
    const chosen = items.filter((s) => selected.has(keyOf(s)));
    if (!chosen.length) { setBulkMsg(T.bulkNone); return; }
    setBulkMsg('');
    cancelRef.current = false;
    const JSZip = (await import('jszip')).default;
    const parts = Math.ceil(chosen.length / ZIP_CHUNK);
    const stamp = new Date().toISOString().slice(0, 10);
    let done = 0;
    let failed = 0;
    let saved = 0;
    try {
      for (let part = 0; part < parts && !cancelRef.current; part += 1) {
        const slice = chosen.slice(part * ZIP_CHUNK, (part + 1) * ZIP_CHUNK);
        const zip = new JSZip();
        const used = new Set();
        let next = 0;
        setBulk({ phase: 'working', done, total: chosen.length, part: part + 1, parts });
        const worker = async () => {
          while (next < slice.length && !cancelRef.current) {
            const sale = slice[next]; next += 1;
            try {
              const { pdf, fileName } = await actions.buildInvoiceFile(sale);
              let name = fileName;
              for (let n = 2; used.has(name); n += 1) name = fileName.replace(/\.pdf$/, `_${n}.pdf`);
              used.add(name);
              zip.file(name, pdf.output('arraybuffer'));
              saved += 1;
            } catch (e) {
              failed += 1;
              console.error('Bulk download: could not create the invoice of', sale.saleNumber, e);
            }
            done += 1;
            setBulk({ phase: 'working', done, total: chosen.length, part: part + 1, parts });
          }
        };
        await Promise.all(Array.from({ length: POOL }, worker));
        if (cancelRef.current) break;
        if (Object.keys(zip.files).length) {
          const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }); // PDFs are already compressed
          await downloadBlobFile(blob, `SalesInvoices_${stamp}${parts > 1 ? `_part${part + 1}of${parts}` : ''}.zip`, 'application/zip');
        }
      }
    } catch (e) {
      console.error('Bulk download failed:', e);
      setError(`${T.invoiceFailed} (${String(e.message || e).slice(0, 120)})`);
    }
    setBulk(null);
    if (!cancelRef.current) {
      setBulkMsg([saved ? fillText(T.bulkDone, { count: saved }) : '', failed ? fillText(T.bulkFailedSome, { failed }) : ''].filter(Boolean).join(' '));
      if (saved) leaveSelectMode();
    }
  };

  const ownerChip = (s) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: s.ownerType === 'SUPER_ADMIN' ? 'var(--gold-dim-2)' : 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)', maxWidth: '100%' }}>
      {s.ownerType === 'SUPER_ADMIN' ? <ShieldCheck size={12} /> : <Store size={12} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ownerType === 'SUPER_ADMIN' ? T.superAdminOwner : (s.ownerName || '—')}</span>
    </span>
  );

  const Check = ({ on }) => (on ? <CheckSquare size={22} style={{ color: 'var(--maroon)', flexShrink: 0 }} /> : <Square size={22} style={{ color: 'var(--text-3)', flexShrink: 0 }} />);

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
        {!selectMode && items.length > 0 && (
          <button type="button" className="btn btn-outline" onClick={() => { setSelectMode(true); setBulkMsg(''); }} style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Download className="h-4 w-4" /> {T.downloadAll}
          </button>
        )}
      </div>

      {selectMode && (
        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={selectAll} disabled={!!bulk} aria-pressed={allShownSelected}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', color: 'var(--text-0)' }}>
            <Check on={allShownSelected} /> {allShownSelected ? T.deselectAll : T.selectAll}
          </button>
          <span className="cell-sub" style={{ marginRight: 'auto' }}>{fillText(T.selectedCount, { count: selected.size })}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={downloadSelected} disabled={!selected.size || !!bulk} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download className="h-4 w-4" /> {fillText(T.downloadSelected, { count: selected.size })}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={leaveSelectMode} disabled={!!bulk}>{T.cancelSelect}</button>
        </div>
      )}

      {bulkMsg && <div role="status" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{bulkMsg}</div>}
      {error && <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C2C2', color: '#8A1C1C', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}><p className="desc" style={{ margin: 0 }}>{T.noResults}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((s) => {
            const on = selected.has(keyOf(s));
            const open = () => (selectMode ? toggle(s) : setDetail(s));
            return (
              <div key={keyOf(s)} role={selectMode ? 'checkbox' : 'button'} aria-checked={selectMode ? on : undefined} tabIndex={0} onClick={open}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                aria-label={`${selectMode ? '' : `${T.detailsTitle}: `}${s.registrationNumber}`}
                className="card" style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', outline: on ? '2px solid var(--maroon)' : undefined }}>
                {selectMode && <div style={{ paddingTop: 1 }}><Check on={on} /></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
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
              </div>
            );
          })}
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
          api={api}
          languageName={LANG_NAMES[detail.lang] || detail.lang}
          showOwner={!isShop}
          busy={actions.busy}
          onClose={() => setDetail(null)}
          onDownload={(s) => actions.downloadInvoice(s)}
          onSendInvoice={(s) => actions.sendInvoice(s)}
          onOpenPhoto={(images, index) => setViewer({ images, index })}
        />
      )}
      {viewer && <ImageZoomViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />}
      {actions.dialog}

      {bulk && createPortal(
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 70000, background: 'rgba(5,4,3,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 360, padding: 24, textAlign: 'center' }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, margin: '0 auto 12px', color: 'var(--maroon)' }} />
            {bulk.phase === 'loading' ? (
              <p className="desc" style={{ margin: 0 }}>{T.selecting}</p>
            ) : (
              <>
                <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 4px' }}>
                  {fillText(T.bulkPreparing, { done: bulk.done, total: bulk.total })}{bulk.parts > 1 ? fillText(T.bulkPart, { part: bulk.part, parts: bulk.parts }) : ''}
                </p>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', margin: '10px 0 14px' }}>
                  <div style={{ height: '100%', width: `${Math.round((bulk.done / Math.max(1, bulk.total)) * 100)}%`, background: 'var(--maroon)', transition: 'width .3s' }} />
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { cancelRef.current = true; }}>{T.cancelSelect}</button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
