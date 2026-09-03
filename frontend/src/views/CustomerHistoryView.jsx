import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { getAssetUrl, downloadAsset } from '../apiConfig';
import { downloadPdf } from '../utils/pdfDelivery';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../utils/phone';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import { primeStoragePermission } from '../utils/platform';
import CustomSelect from '../components/CustomSelect';
import { useSubmitting } from '../hooks/useSubmitting';
import {
  Key, FileText, Search, MapPin, Camera, RefreshCw, Edit, ExternalLink,
  DollarSign, Eye, CheckCircle2, Lock, ShieldCheck, Phone, Calendar, User,
  UploadCloud, FileCheck, Navigation, KeyRound, Car, Tag, MessageCircle,
  Download, Fingerprint, Home, Copy,
  X,
} from 'lucide-react';

// Lazy-loaded (Track B): the edit-customer flow reuses the full registration
// wizard as a modal - see App.jsx's identical lazy import for its own
// 'register' tab call site.
const CustomerRegistrationWizard = lazy(() => import('./CustomerRegistrationWizard'));

// Page size for the Customer History screen's cursor pagination - see
// CustomerService.getCustomers.
const CUSTOMER_HISTORY_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope, same rationale as shopsFirstPageCache above. Keyed by shopId since
// Super Admin can view multiple shops' histories via this same component
// (see CustomerHistoryView's shopId usage below).
let customerHistoryFirstPageCache = null;

function CustomerHistoryView({ t, api, searchDispatch }) {
  const { user } = useAuth();
  const cachedHistoryPage = customerHistoryFirstPageCache && customerHistoryFirstPageCache.shopId === user.shopId
    ? customerHistoryFirstPageCache
    : null;
  const [customers, setCustomers] = useState(cachedHistoryPage ? cachedHistoryPage.items : []);
  const [loading, setLoading] = useState(false);
  // Infinite-scroll pagination state - `customers` only ever holds the pages
  // loaded so far, never this shop's whole compliance history.
  const [nextCursor, setNextCursor] = useState(cachedHistoryPage ? cachedHistoryPage.nextCursor : null);
  const [hasMore, setHasMore] = useState(cachedHistoryPage ? cachedHistoryPage.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  // See ShopsManagementView.jsx's identical fetchShopsSeq for why this
  // exists: fetchHistory() is called from the search/filter effect plus
  // the save-customer-edit success handler, so a fast search-then-search
  // (or a search racing a save) can otherwise apply whichever response
  // resolves last instead of whichever was requested last.
  const fetchHistorySeq = useRef(0);
  const [search, setSearch] = useState('');
  const [town, setTown] = useState('');
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request instead of
  // filtering an already-fully-loaded list).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);
  const [selectedCust, setSelectedCust] = useState(null);

  // Customer report (Download/WhatsApp buttons on each row) - shop details
  // are fetched once and cached since every report for this Shop Admin's
  // customers uses the same shop info. reportBusyId tracks "<customerId>:
  // <download|share>" so only the button that's mid-generation shows a
  // spinner instead of disabling the whole table.
  const [shopInfo, setShopInfo] = useState(null);
  const [reportBusyId, setReportBusyId] = useState(null);

  const ensureShopInfo = async () => {
    if (shopInfo) return shopInfo;
    const res = await api.getSettings();
    let address = 'N/A';
    let phone = 'N/A';
    if (res.companyDetails) {
      try {
        const details = JSON.parse(res.companyDetails);
        address = details.address || 'N/A';
        phone = details.phone || 'N/A';
      } catch (e) { /* leave defaults */ }
    }
    const info = { name: res.name, address, phone };
    setShopInfo(info);
    return info;
  };

  const handleDownloadCustomerReport = async (c) => {
    setReportBusyId(`${c.id}:download`);
    try {
      const shop = await ensureShopInfo();
      const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop, registeredByName: user?.name });
      const safeName = `${(c.name || 'Customer').replace(/[^a-zA-Z0-9]+/g, '_')}_Key_Registration_Report.pdf`;
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
      const shop = await ensureShopInfo();
      const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop, registeredByName: user?.name });
      const { shareCustomerReportViaWhatsApp } = await import('../utils/reportShare');
      await shareCustomerReportViaWhatsApp({ api, pdf, customer: c });
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('Failed to share customer report PDF:', err);
        alert('Could not share the report PDF. Please try again.');
      }
    } finally {
      setReportBusyId(null);
    }
  };

  // Picks up a query dispatched from the global header search panel
  // (filter = "Customer").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'customer') {
      setSearch(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  // Edit States
  const [fullEditCust, setFullEditCust] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoneVal, setEditPhoneVal] = useState('');
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editKeyNumber, setEditKeyNumber] = useState('');
  const [editAddressLine, setEditAddressLine] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editStateVal, setEditStateVal] = useState('');
  const [editIdProofType, setEditIdProofType] = useState('Aadhaar Card');
  const [editIdProofNumber, setEditIdProofNumber] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editUploadFile, setEditUploadFile] = useState(null);

  useEffect(() => {
    if (selectedCust) {
      setEditName(selectedCust.name || '');
      setEditPhoneVal(selectedCust.phone || '');
      setEditVehicleNumber(selectedCust.vehicleNumber || '');
      setEditKeyNumber(selectedCust.keyNumber || '');
      const remainingEditTypes = ['Aadhaar Card', 'Driving License', 'PAN Card', 'Voter ID'].filter(
        t => !selectedCust.documents?.some(d => d.documentType === t || d.documentType === `${t} Copy`)
      );
      if (remainingEditTypes.length > 0) {
        setEditIdProofType(remainingEditTypes[0]);
      } else {
        setEditIdProofType(selectedCust.idProofType || 'Aadhaar Card');
      }
      setEditIdProofNumber(selectedCust.idProofNumber || '');
      setEditReason(selectedCust.reason || '');

      const addr = selectedCust.capturedAddress || selectedCust.address || '';
      const parts = addr.split(',').map(p => p.trim());
      setEditAddressLine(parts[0] || '');
      setEditDistrict(parts[1] || '');
      setEditStateVal(parts[2] || '');
    } else {
      setIsEditing(false);
      setEditUploadFile(null);
    }
  }, [selectedCust]);

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchHistory = async () => {
    const seq = ++fetchHistorySeq.current;
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedSearch || town || customers.length === 0) setLoading(true);
    try {
      const res = await api.getCustomersPage({ search: debouncedSearch, town, limit: CUSTOMER_HISTORY_PAGE_SIZE });
      if (seq !== fetchHistorySeq.current) return; // a newer fetchHistory() has since started - discard this stale response
      setCustomers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (!debouncedSearch && !town) {
        customerHistoryFirstPageCache = { shopId: user.shopId, items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      if (seq !== fetchHistorySeq.current) return;
      console.error(e);
    } finally {
      if (seq === fetchHistorySeq.current) setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreHistory = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getCustomersPage({ search: debouncedSearch, town, cursor: nextCursor, limit: CUSTOMER_HISTORY_PAGE_SIZE });
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
    fetchHistory();
  }, [debouncedSearch, town]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreHistory();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedSearch, town]);

  const { submitting: savingCustomerEdit, run: runSaveCustomerEdit } = useSubmitting();

  const handleSaveChanges = (e) => {
    e.preventDefault();
    if (!editPhoneVal || !PHONE_REGEX.test(editPhoneVal)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    runSaveCustomerEdit(async () => {
      try {
        const finalAddress = `${editAddressLine}, ${editDistrict}, ${editStateVal}, India`;
        await api.updateCustomer(selectedCust.id, {
          name: editName,
          phone: editPhoneVal,
          address: finalAddress,
          idProofType: editIdProofType,
          idProofNumber: editIdProofNumber,
          reason: editReason,
          keyNumber: editKeyNumber,
          vehicleNumber: editVehicleNumber,
          capturedAddress: finalAddress
        });

        if (editUploadFile) {
          await api.uploadDocument(selectedCust.id, `${editIdProofType} Copy`, editUploadFile);
        }

        alert(t('customerComplianceRecordUpdatedMsg'));
        setIsEditing(false);
        setEditUploadFile(null);
        setSelectedCust(null);
        fetchHistory();
      } catch (err) {
        alert(err.message || t('failedSaveCustomerEditsMsg'));
      }
    });
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><FileCheck /> {t('complianceRegistry')}</div>
          <h1>{t('history')}</h1>
          <p>{t('historyPageDesc')}</p>
        </div>
      </div>

      {/* The search box lives outside the loading/results swap below so it
          never unmounts while typing - every keystroke re-triggers the
          fetch (briefly flipping `loading`), but the input itself stays
          mounted the whole time and keeps focus. */}
      <div className="card table-card">
        <div className="table-head">
          <div className="search-box">
            <Search />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchByNamePhoneKeyCode')}
            />
          </div>
          <CustomSelect
            className="location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder={t('allLocationsLabel')}
            searchable
            searchPlaceholder={t('searchDistrictTownPlaceholder')}
            options={[{ value: '', label: t('allLocationsLabel') }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
            triggerStyle={{ minWidth: 180 }}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingComplianceRecordsMsg')}</span>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {t('noComplianceRecordsMatchMsg')}
          </p>
        ) : (
          <table className="kee-table history-table">
            <thead>
              <tr>
                <th>{t('customerCol')}</th>
                <th>{t('phoneCol')}</th>
                <th>{t('vehicleCol')}</th>
                <th>{t('keyCodeCol')}</th>
                <th>{t('locationCol')}</th>
                <th>{t('loggedCol')}</th>
                <th style={{ textAlign: 'right' }}>{t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
                return customers.map((c, idx) => {
                  const rowColor = rowColors[idx % rowColors.length];
                  return (
                    <tr key={c.id} onClick={() => setSelectedCust(c)} style={{ cursor: 'pointer' }}>
                      <td data-label={t('customerCol')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className={`icon-badge ${rowColor}`} style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}>
                            <User style={{ width: 15, height: 15 }} />
                          </div>
                          <div className="cell-primary">{c.name}</div>
                        </div>
                      </td>
                      <td className="cell-sub" data-label={t('phoneCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.phone}</td>
                      <td className="cell-sub" data-label={t('vehicleCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.vehicleNumber || 'N/A'}</td>
                      <td data-label={t('keyCodeCol')}>
                        <span className="badge badge-active"><span className="dot" />{c.keyNumber}</span>
                        {c.keyType && <div className="cell-sub" style={{ marginTop: 4 }}>{c.keyType}</div>}
                      </td>
                      <td className="cell-sub" data-label={t('locationCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                        <span className="flex items-start gap-1" style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.3, maxWidth: 220 }}>
                          <MapPin style={{ width: 13, height: 13, color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                          <span>{c.capturedAddress || c.address || 'N/A'}</span>
                        </span>
                      </td>
                      <td className="cell-sub" data-label={t('loggedCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td data-label={t('actionsCol')}>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedCust(c); }} className="icon-btn" title={t('viewComplianceFile')}>
                            <Eye />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadCustomerReport(c); }}
                            disabled={reportBusyId === `${c.id}:download`}
                            className="icon-btn" title={t('downloadReportBtn')}
                          >
                            {reportBusyId === `${c.id}:download` ? <RefreshCw className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleShareCustomerReportViaWhatsApp(c); }}
                            disabled={reportBusyId === `${c.id}:whatsapp`}
                            className="icon-btn" title={t('shareViaWhatsAppBtn')}
                          >
                            {reportBusyId === `${c.id}:whatsapp` ? <RefreshCw className="animate-spin h-4 w-4" /> : (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z" /></svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        )}

        {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
            PromotionsFeed's identical pattern for why both exist. */}
        {!loading && hasMore && (
          <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
            {loadingMore ? (
              <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
            ) : (
              <button type="button" onClick={fetchMoreHistory} className="btn btn-outline btn-sm">
                {t('loadMoreBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {selectedCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><FileCheck /> {t('complianceFileEyebrow')}</span>
                <h2 style={{ fontSize: 19 }}>{selectedCust.name}</h2>
              </div>
              <button onClick={() => setSelectedCust(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!isEditing ? (
              <>
                <div className="reg-section">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>{t('phoneContactLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.phone || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(selectedCust.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>{t('addressLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{selectedCust.address || selectedCust.capturedAddress || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge badge-active"><span className="dot" />{selectedCust.keyNumber || selectedCust.keyCode || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>Vehicle / Key Type</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{selectedCust.vehicleCategory || selectedCust.lockCategory || selectedCust.keyType || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Tag /></div><b>Key / Vehicle Name</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.vehicleName || selectedCust.homeOfficeName || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CheckCircle2 /></div><b>Add Key / Lost Key</b></div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${selectedCust.addKey ? 'badge-active' : 'badge-suspended'}`}>Add: {selectedCust.addKey ? 'Yes' : 'No'}</span>
                        <span className={`badge ${selectedCust.lostKey ? 'badge-active' : 'badge-suspended'}`}>Lost: {selectedCust.lostKey ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><DollarSign /></div><b>Bill ID & Amount</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gold)' }}>
                        {selectedCust.billNumber || selectedCust.billId || 'N/A'} {selectedCust.billAmount != null && selectedCust.billAmount !== '' ? `(₹${Number(selectedCust.billAmount).toFixed(2)})` : '(N/A)'}
                      </span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>{t('idVerificationLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.idProofType || selectedCust.idType || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('idNumberDecryptedLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{selectedCust.idProofNumber || selectedCust.idNumber || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="reg-section">
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 14 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`icon-badge ${selectedCust.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                          <MapPin style={{ width: 16, height: 16 }} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{t('gpsCoordinatesLabel')}</p>
                          {selectedCust.latitude && selectedCust.longitude ? (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>{t('latLongTemplate').split('{lat}')[0]}{selectedCust.latitude}{t('latLongTemplate').split('{lat}')[1].split('{long}')[0]}{selectedCust.longitude}</p>
                          ) : (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>{t('notCapturedLabel')}</p>
                          )}
                        </div>
                      </div>
                      {selectedCust.mapsLink && (
                        <a href={selectedCust.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                          <span>{t('googleMapsLabel')}</span><ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {selectedCust.capturedAddress && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t('capturedAddressLabel')}</span>
                        <span>{selectedCust.capturedAddress}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Camera /></div><b>{t('webcamPhotoLabel')}</b></div>
                    {selectedCust.photoUrl ? (
                      <div style={{ width: '100%', height: 128, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                        <img src={getAssetUrl(selectedCust.photoUrl)} alt="Customer snapshot" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: 128, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                        <Camera style={{ width: 18, height: 18, color: 'var(--text-3)' }} />
                      </div>
                    )}
                  </div>

                  {selectedCust.documents && selectedCust.documents.length > 0 && (
                    <div className="reg-field space-y-2" style={{ marginBottom: 0, minWidth: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><FileCheck /></div><b>{t('attachedIdCopiesLabel')}</b></div>
                      {selectedCust.documents.map((d, di) => {
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
                              title={t('downloadTitleLabel')}
                              aria-label={t('downloadTitleLabel')}
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
                      onClick={() => handleDownloadCustomerReport(selectedCust)}
                      disabled={reportBusyId === `${selectedCust.id}:download`}
                      className="btn btn-outline btn-sm"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Document</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareCustomerReportViaWhatsApp(selectedCust)}
                      disabled={reportBusyId === `${selectedCust.id}:whatsapp`}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#25D366', borderColor: '#25D366' }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setFullEditCust(selectedCust)} className="btn btn-primary btn-sm">
                      <Edit /> <span>{t('editDetailsBtn')}</span>
                    </button>
                    <button onClick={() => setSelectedCust(null)} className="btn btn-ghost btn-sm">{t('closeFileBtn')}</button>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveChanges}>
                <div className="reg-section">
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('fullCustomerNameLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('phoneNumberLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="tel" required value={editPhoneVal} onChange={(e) => setEditPhoneVal(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section">
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Car /></div><b>{t('vehicleNumberLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editVehicleNumber} onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editKeyNumber} onChange={(e) => setEditKeyNumber(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section">

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><MapPin /></div><b>{t('addressLineLabel')}</b></div>
                    <div className="input-wrap">
                      <input type="text" required value={editAddressLine} onChange={(e) => setEditAddressLine(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Navigation /></div><b>{t('districtLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Navigation /></div><b>{t('stateLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editStateVal} onChange={(e) => setEditStateVal(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field full" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Navigation /></div><b>{t('countryLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" readOnly value="India" style={{ opacity: .55, cursor: 'not-allowed' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><ShieldCheck /></div><b>{t('documentIdTypeLabel')}</b></div>
                      <CustomSelect
                        value={editIdProofType} onChange={setEditIdProofType}
                        options={[
                          { value: 'Aadhaar Card', label: t('aadhaarCardLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'Aadhaar Card' || d.documentType === 'Aadhaar Card Copy') },
                          { value: 'Driving License', label: t('drivingLicenseLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'Driving License' || d.documentType === 'Driving License Copy') },
                          { value: 'PAN Card', label: t('panCardLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'PAN Card' || d.documentType === 'PAN Card Copy') },
                          { value: 'Voter ID', label: t('voterIdLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'Voter ID' || d.documentType === 'Voter ID Copy') },
                        ]}
                      />
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><UploadCloud /></div><b>{t('uploadNewFileCopyLabel')}</b></div>
                      <div className="dropzone" style={{ padding: '16px 12px', position: 'relative' }}>
                        <UploadCloud style={{ width: 20, height: 20, color: 'var(--gold)' }} />
                        <span className="dz-sub">{editUploadFile ? editUploadFile.name : t('jpegPngPdfLabel')}</span>
                        <input
                          type="file"
                          onClick={primeStoragePermission}
                          onChange={(e) => setEditUploadFile(e.target.files[0])}
                          accept="image/jpeg, image/png, application/pdf"
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditUploadFile(null);
                    }}
                    disabled={savingCustomerEdit}
                    className="btn btn-ghost"
                  >
                    {t('btnCancel')}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingCustomerEdit}>
                    {savingCustomerEdit && <RefreshCw className="h-4 w-4 animate-spin" />}
                    {t('saveChangesBtn')}
                  </button>
                </div>
              </form>
            )}
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
                editCustomer={fullEditCust}
                onCancel={() => setFullEditCust(null)}
                onDone={(updated) => {
                  setFullEditCust(null);
                  if (selectedCust && updated) setSelectedCust(updated);
                  fetchHistory();
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

export default CustomerHistoryView;
