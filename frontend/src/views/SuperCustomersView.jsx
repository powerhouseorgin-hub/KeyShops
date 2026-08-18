import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBackHandler } from '../utils/backHandler';
import { getAssetUrl, downloadAsset } from '../apiConfig';
import { downloadPdf } from '../utils/pdfDelivery';
import {
  Key, Plus, FileText, Search, MapPin, Camera, RefreshCw, Edit, ExternalLink,
  Eye, Lock, ShieldCheck, Phone, Calendar, Store, User, FileCheck, KeyRound,
  MessageCircle, Download, Fingerprint, Home,
} from 'lucide-react';

// Lazy-loaded (Track B): Add/Edit Customer both reuse the full registration
// wizard as a modal - see App.jsx's identical lazy import for its own
// 'register' tab call site.
const CustomerRegistrationWizard = lazy(() => import('./CustomerRegistrationWizard'));

// Page size for the Customer Registry's cursor pagination - see
// CustomerService.getSuperCustomers.
const CUSTOMER_REGISTRY_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope, same rationale as shopsFirstPageCache above.
let customersFirstPageCache = null;

function SuperCustomersView({ t, api, searchDispatch }) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState(customersFirstPageCache ? customersFirstPageCache.items : []);
  const [loading, setLoading] = useState(false);
  // Infinite-scroll pagination state - `customers` only ever holds the pages
  // loaded so far, never the whole platform-wide registry.
  const [nextCursor, setNextCursor] = useState(customersFirstPageCache ? customersFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(customersFirstPageCache ? customersFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [search, setSearch] = useState('');
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request instead of
  // filtering an already-fully-loaded list).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Picks up a query dispatched from the global header search panel
  // (filter = "Customer"). The nonce lets the same text be re-submitted.
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'customer') {
      setSearch(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);
  const [viewCust, setViewCust] = useState(null);

  // Create Customer (Super Admin) - uses the same multi-step
  // CustomerRegistrationWizard as Shop Admin, rendered full-screen with a
  // required Shop dropdown on Step 1 (see superAdminMode prop).
  const [shops, setShops] = useState([]);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [fullEditCust, setFullEditCust] = useState(null);
  useBackHandler(showCreateWizard, () => setShowCreateWizard(false));
  useBackHandler(!!fullEditCust, () => setFullEditCust(null));

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchCustomers = async () => {
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedSearch || customers.length === 0) setLoading(true);
    try {
      const res = await api.getSuperCustomersPage({ search: debouncedSearch, limit: CUSTOMER_REGISTRY_PAGE_SIZE });
      setCustomers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (!debouncedSearch) {
        customersFirstPageCache = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreCustomers = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getSuperCustomersPage({ search: debouncedSearch, cursor: nextCursor, limit: CUSTOMER_REGISTRY_PAGE_SIZE });
      setCustomers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [debouncedSearch]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreCustomers();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedSearch]);

  const openCreateWizard = async () => {
    setShowCreateWizard(true);
    // Shows the cached platform shop list instantly if we have one (shared
    // with AdsManagementView's cache - shops rarely change) while
    // refreshing in the background, instead of the wizard's shop-selector
    // always waiting on a fresh full-table fetch before it's usable.
    if (platformShopsCache) setShops(platformShopsCache);
    try {
      const res = await api.getShops();
      setShops(res || []);
      platformShopsCache = res || [];
    } catch (e) {
      console.error(e);
    }
  };

  const [reportBusyId, setReportBusyId] = useState(null);

  const getFullShopDetails = async (c) => {
    let name = c.shop?.name || 'Key Shops';
    let address = 'N/A';
    let phone = 'N/A';
    try {
      const shopsRes = await api.getShops();
      const found = (shopsRes || []).find(s => s.id === c.shopId || s.name === c.shop?.name);
      if (found) {
        name = found.name || name;
        if (found.companyDetails) {
          try {
            const details = typeof found.companyDetails === 'string' ? JSON.parse(found.companyDetails) : found.companyDetails;
            address = details.address || found.address || 'N/A';
            phone = details.phone || found.phone || 'N/A';
          } catch (e) {
            address = found.address || 'N/A';
            phone = found.phone || 'N/A';
          }
        } else {
          address = found.address || 'N/A';
          phone = found.phone || 'N/A';
        }
      }
    } catch (e) {
      console.warn('Could not fetch shop details for report:', e);
    }
    return { name, address, phone };
  };

  const handleDownloadCustomerReport = async (c) => {
    setReportBusyId(`${c.id}:download`);
    try {
      const shopRes = await getFullShopDetails(c);
      const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop: shopRes, registeredByName: c.registeredByName || user?.name || 'Key Shops' });
      const safeName = `${(c.name || 'Customer').trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
      await downloadPdf(pdf, safeName);
    } catch (err) {
      console.error('Failed to generate customer report PDF:', err);
      window.alert('Could not generate the report PDF. Please try again.');
    } finally {
      setReportBusyId(null);
    }
  };

  const handleShareCustomerReportViaWhatsApp = async (c) => {
    setReportBusyId(`${c.id}:whatsapp`);
    try {
      const shopRes = await getFullShopDetails(c);
      const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop: shopRes, registeredByName: c.registeredByName || user?.name || 'Key Shops' });
      const { shareCustomerReportViaWhatsApp } = await import('../utils/reportShare');
      await shareCustomerReportViaWhatsApp({ api, pdf, customer: c });
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('Failed to share customer report PDF:', err);
        window.alert('Could not share the report PDF. Please try again.');
      }
    } finally {
      setReportBusyId(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><ShieldCheck /> {t('crossTenantCompliance')}</div>
          <h1>{t('customerRegistryTitle')}</h1>
          <p>{t('superviseComplianceRecordsDesc')}</p>
        </div>
      </div>

      {/* Portaled to escape .animate-fade-in's permanent transform (fill-mode
          forwards) - see ShopsManagementView's identical FAB for why. */}
      {createPortal(
        <button
          type="button"
          onClick={openCreateWizard}
          className="fab"
          aria-label={t('createCustomerBtn')}
          title={t('createCustomerBtn')}
        >
          <Plus />
        </button>,
        document.body
      )}

      {/* The search box lives outside the loading/results swap below so it
          never unmounts while typing - every keystroke sets `search`, which
          re-triggers the fetch and flips `loading` briefly, but the input
          itself stays mounted throughout and keeps focus the whole time. */}
      <div className="card table-card">
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
            {t('allCustomers')} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({customers.length})</span>
          </h2>
          <div className="search-box">
            <Search />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchByNamePhoneKeyCode')}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingCustomerRegistry')}</span>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {t('noCustomerRecordsMatch')}
          </p>
        ) : (
          <div className="stagger-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
            {customers.map(c => {
              const keyCode = c.keyNumber || (c.keys?.[0]?.keyNumber) || '—';
              const shopName = c.shop ? c.shop.name : (t('shopWorkspaceFallback') || 'Unassigned Workspace');
              const fullLoc = c.capturedAddress || c.address || 'N/A';

              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    background: 'var(--card-1, #ffffff)',
                    border: '1.5px solid var(--border-2)',
                    borderRadius: 18,
                    padding: '20px 22px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Card Header: Icon Badge + Customer Name + Shop */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div className="icon-badge purple" style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0 }}>
                      <User style={{ width: 19, height: 19 }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)' }}>{c.name}</div>
                      {shopName && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Store style={{ width: 12, height: 12, color: 'var(--gold)' }} />
                          <span>{shopName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Details Grid (Key-Value pairs matching Customer History) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, fontWeight: 700 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('phoneCol') || 'PHONE'}
                      </span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 700 }}>{c.phone || 'N/A'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('vehicleCol') || 'VEHICLE'}
                      </span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 700 }}>{c.vehicleNumber || c.vehicleName || 'N/A'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('keyCodeCol') || 'KEY CODE'}
                      </span>
                      <span className="badge badge-active" style={{ fontSize: 12, padding: '3px 10px' }}>
                        <span className="dot" />{keyCode}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0, marginTop: 2 }}>
                        {t('locationCol') || 'LOCATION'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, textAlign: 'right', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4, color: 'var(--text-0)', fontWeight: 600, fontSize: 12.5, maxWidth: '75%' }}>
                        <MapPin style={{ width: 14, height: 14, color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                        <span>{fullLoc}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('loggedCol') || 'LOGGED'}
                      </span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 700 }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ borderTop: '1px solid var(--border-2)', paddingTop: 14, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {t('actionsCol') || 'ACTIONS'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setViewCust(c)}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: 'var(--text-1)' }}
                        title={t('viewComplianceFile') || 'View File'}
                      >
                        <Eye style={{ width: 16, height: 16 }} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadCustomerReport(c)}
                        disabled={reportBusyId === `${c.id}:download`}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: 'var(--text-1)' }}
                        title={t('downloadReportBtn') || 'Download Report'}
                      >
                        {reportBusyId === `${c.id}:download` ? <RefreshCw className="animate-spin" style={{ width: 15, height: 15 }} /> : <Download style={{ width: 16, height: 16 }} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareCustomerReportViaWhatsApp(c)}
                        disabled={reportBusyId === `${c.id}:whatsapp`}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: '#25D366' }}
                        title={t('shareViaWhatsAppBtn') || 'Share via WhatsApp'}
                      >
                        {reportBusyId === `${c.id}:whatsapp` ? <RefreshCw className="animate-spin" style={{ width: 15, height: 15 }} /> : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z" /></svg>
                        )}
                      </button>
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
              <button type="button" onClick={fetchMoreCustomers} className="btn btn-outline btn-sm">
                {t('loadMoreBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Customer - full-screen overlay hosting the SAME multi-step
          CustomerRegistrationWizard used by Shop Admin, in superAdminMode
          (adds the required Shop dropdown on Step 1). */}
      {showCreateWizard && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-0, #0b0a09)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
            <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
              <CustomerRegistrationWizard
                t={t}
                api={api}
                superAdminMode
                shops={shops}
                onCancel={() => setShowCreateWizard(false)}
                onDone={() => {
                  setShowCreateWizard(false);
                  fetchCustomers();
                }}
              />
            </Suspense>
          </div>
        </div>,
        document.body
      )}

      {viewCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28, overflowX: 'hidden' }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><FileText /> {t('complianceFileEyebrow')}</span>
                <h2 style={{ fontSize: 19 }}>{viewCust.name}</h2>
              </div>
              <button onClick={() => setViewCust(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>{t('phoneContactLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.phone}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(viewCust.createdAt).toLocaleString()}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>{t('addressLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{viewCust.address}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-active"><span className="dot" />{viewCust.keyNumber}</span>
                    {viewCust.keyType && <span className="badge" style={{ background: 'var(--purple-dim, rgba(124,77,255,0.12))', color: 'var(--purple)' }}>{viewCust.keyType}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>{t('idVerificationLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.idProofType}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('idNumberDecryptedLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{viewCust.idProofNumber}</span>
                </div>
              </div>

              <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 14, marginTop: 4 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`icon-badge ${viewCust.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                      <MapPin style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{t('gpsCoordinatesLabel')}</p>
                      {viewCust.latitude && viewCust.longitude ? (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>{t('latLongTemplate').split('{lat}')[0]}{viewCust.latitude}{t('latLongTemplate').split('{lat}')[1].split('{long}')[0]}{viewCust.longitude}</p>
                      ) : (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>{t('notCapturedLabel')}</p>
                      )}
                    </div>
                  </div>
                  {viewCust.mapsLink && (
                    <a href={viewCust.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                      <span>{t('googleMapsLabel')}</span><ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {viewCust.capturedAddress && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t('capturedAddressLabel')}</span>
                    <span>{viewCust.capturedAddress}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="reg-section" style={{ marginBottom: 0 }}>
              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Camera /></div><b>{t('webcamPhotoLabel')}</b></div>
                {viewCust.photoUrl ? (
                  <div style={{ width: '100%', height: 128, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                    <img src={getAssetUrl(viewCust.photoUrl)} alt="Customer snapshot" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 128, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                    <Camera style={{ width: 18, height: 18, color: 'var(--text-3)' }} />
                  </div>
                )}
              </div>

              {viewCust.documents && viewCust.documents.length > 0 && (
                <div className="reg-field space-y-2" style={{ minWidth: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><FileCheck /></div><b>{t('attachedIdCopiesLabel')}</b></div>
                  {viewCust.documents.map((d, di) => {
                    const docColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                    const docColor = docColors[di % docColors.length];
                    const uploaded = !!(d.fileUrl || d.fileKey);
                    return (
                      <div key={d.id} style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 12, minWidth: 0 }} className="flex items-center gap-2 text-xs">
                        <div className={`icon-badge ${docColor}`} style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0 }}>
                          <FileText style={{ width: 13, height: 13 }} />
                        </div>
                        <span style={{ color: 'var(--text-1)', fontWeight: 600, flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.documentType}>{d.documentType}</span>
                        <span
                          className={`badge ${uploaded ? 'badge-active' : 'badge-suspended'}`}
                          style={{ flexShrink: 0, fontSize: 9.5 }}
                        >
                          {uploaded ? t('uploadedBadge') : t('missingBadge')}
                        </span>
                        <button
                          type="button"
                          title={t('btnDownload')}
                          aria-label={t('btnDownload')}
                          disabled={!uploaded}
                          onClick={() => downloadAsset(d.fileUrl, d.originalName || d.fileKey || 'document')}
                          className="icon-btn"
                          style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, opacity: uploaded ? 1 : 0.4, cursor: uploaded ? 'pointer' : 'not-allowed' }}
                        >
                          <Download style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const shopRes = await getFullShopDetails(viewCust);
                      const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
                      const pdf = await buildCustomerReportPdf({ customer: viewCust, shop: shopRes, registeredByName: viewCust.registeredByName || user?.name || 'Key Shops' });
                      const safeName = `${(viewCust.name || 'Customer').trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
                      await downloadPdf(pdf, safeName);
                    } catch (e) {
                      console.error(e);
                      alert('Could not download document PDF.');
                    }
                  }}
                  className="btn btn-outline btn-sm"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Document</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const shopRes = await getFullShopDetails(viewCust);
                      const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
                      const pdf = await buildCustomerReportPdf({ customer: viewCust, shop: shopRes, registeredByName: viewCust.registeredByName || user?.name || 'Key Shops' });
                      const { shareCustomerReportViaWhatsApp } = await import('../utils/reportShare');
                      await shareCustomerReportViaWhatsApp({ api, pdf, customer: viewCust });
                    } catch (e) {
                      if (e && e.name !== 'AbortError') {
                        console.error(e);
                        alert('Could not share document via WhatsApp.');
                      }
                    }
                  }}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#25D366', borderColor: '#25D366' }}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Share WhatsApp</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFullEditCust(viewCust)}
                  className="btn btn-primary btn-sm"
                >
                  <Edit className="h-4 w-4" />
                  <span>{t('editDetailsBtn')}</span>
                </button>
                <button onClick={() => setViewCust(null)} className="btn btn-ghost">{t('closeFileBtn')}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {fullEditCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-0, #0b0a09)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
            <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
              <CustomerRegistrationWizard
                t={t}
                api={api}
                superAdminMode
                shops={shops}
                editCustomer={fullEditCust}
                onCancel={() => setFullEditCust(null)}
                onDone={(updated) => {
                  setFullEditCust(null);
                  if (viewCust && updated) setViewCust(updated);
                  fetchCustomers();
                }}
              />
            </Suspense>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SuperCustomersView;
