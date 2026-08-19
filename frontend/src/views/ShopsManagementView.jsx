import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '../utils/backHandler';
import { getAssetUrl, downloadAsset, filenameForAsset } from '../apiConfig';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../utils/phone';
import { KEE_LANDING_PAGE_URL, primeStoragePermission } from '../utils/platform';
import { resolveCurrentLocation, reverseGeocode } from '../utils/geolocation';
import { useLocationFilter } from '../utils/locationFilter';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import CustomSelect from '../components/CustomSelect';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import {
  Key, Check, Plus, Settings, FileText, Search, MapPin, Camera, AlertTriangle,
  RefreshCw, Layers, Edit, DollarSign, ChevronRight, CreditCard, QrCode, Lock,
  ShieldCheck, Mail, Phone, Calendar, Store, User, Crosshair, Tag, Percent, Globe,
  X, Ban, PlayCircle,
} from 'lucide-react';

// Lazy-loaded (Track B): keeps the Shop Settings modal ("Manage Settings"
// from this screen's shop list) out of the initial bundle - see App.jsx's
// identical lazy import for the primary Settings-tab call site.
const ShopSettingsView = lazy(() => import('./ShopSettingsView'));

// Downscales a base64 data URL to a small (<=120px) JPEG thumbnail before it
// gets embedded inline (not uploaded) in the shop-registration document
// fields (photo/license/owner Aadhaar preview) - passes non-image uploads
// (PDFs) through unmodified.
const compressBase64Image = (base64, callback) => {
  if (!base64) {
    callback('');
    return;
  }
  if (!base64.startsWith('data:image')) {
    callback(base64);
    return;
  }
  const img = new Image();
  img.src = base64;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 120;
    const MAX_HEIGHT = 120;
    let width = img.width;
    let height = img.height;
    if (width > height) {
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', 0.5));
  };
  img.onerror = () => {
    callback(base64);
  };
};

// Page size for the Shop Management screen's cursor pagination - see
// ShopService.getShops.
const SHOP_MANAGEMENT_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope. This view unmounts/remounts on every tab switch, so without this
// every revisit blanked to a spinner and re-fetched page 1 from scratch
// even with an empty search box.
let shopsFirstPageCache = null;

function ShopsManagementView({ t, api, initiallyOpenAddModal, onCloseInitiallyOpen, searchDispatch, defaultTown, locationReady }) {
  const [shops, setShops] = useState(shopsFirstPageCache ? shopsFirstPageCache.items : []);
  const [loading, setLoading] = useState(!shopsFirstPageCache);
  // Infinite-scroll pagination state - `shops` only ever holds the pages
  // loaded so far, never the whole platform-wide registry.
  const [nextCursor, setNextCursor] = useState(shopsFirstPageCache ? shopsFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(shopsFirstPageCache ? shopsFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Search is now server-side (see fetchShops) so pagination stays correct
  // across pages - debounced before it reaches the server, since every
  // change now triggers a network request instead of filtering an
  // already-fully-loaded list.
  const [shopSearchQuery, setShopSearchQuery] = useState('');
  const [debouncedShopSearchQuery, setDebouncedShopSearchQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedShopSearchQuery(shopSearchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [shopSearchQuery]);

  // Picks up a query dispatched from the global header search panel (filter = "Shop").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'shop') {
      setShopSearchQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  useEffect(() => {
    if (initiallyOpenAddModal) {
      setShowAddModal(true);
      if (onCloseInitiallyOpen) onCloseInitiallyOpen();
    }
  }, [initiallyOpenAddModal]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false); // Edit shop profile
  // Full Shop Settings (GST, verification document, referral code) for a
  // given shop, reusing the same ShopSettingsView the Shop Admin sees on
  // their own dashboard - scoped to this shop via the shopId prop.
  const [fullSettingsShopId, setFullSettingsShopId] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);

  useBackHandler(showAddModal, () => { resetAddForm(); setShowAddModal(false); });
  useBackHandler(showSubModal, () => setShowSubModal(false));
  useBackHandler(showEditModal, () => setShowEditModal(false));
  useBackHandler(!!fullSettingsShopId, () => setFullSettingsShopId(null));

  // Form States for Add Shop
  const [shopName, setShopName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  // Informational only - the actual end date is computed server-side (always
  // exactly one year from creation, see ShopService.createShop).
  const [subEndDate, setSubEndDate] = useState('');
  const [provisionPhone, setProvisionPhone] = useState('');
  const [provisionWhatsapp, setProvisionWhatsapp] = useState('');
  const [provisionLocation, setProvisionLocation] = useState('');
  const [provisionLocLoading, setProvisionLocLoading] = useState(false);
  const [provisionLocError, setProvisionLocError] = useState('');
  const [provisionSameAsPhone, setProvisionSameAsPhone] = useState(false);
  const [provisionShopPhoto, setProvisionShopPhoto] = useState('');
  const [provisionShopLicense, setProvisionShopLicense] = useState('');
  const [provisionOwnerAadhaar, setProvisionOwnerAadhaar] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form States for Edit Shop Details (Super Admin capability)
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editGst, setEditGst] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editShopPhoto, setEditShopPhoto] = useState('');
  const [editShopLicense, setEditShopLicense] = useState('');
  const [editOwnerAadhaar, setEditOwnerAadhaar] = useState('');
  const [editShopPhotoName, setEditShopPhotoName] = useState('');
  const [editShopLicenseName, setEditShopLicenseName] = useState('');
  const [editOwnerAadhaarName, setEditOwnerAadhaarName] = useState('');

  // Single yearly subscription price platform-wide, Super Admin-configurable
  // (see SupportConfigView / PlatformConfig.subscriptionPrice).
  const [subscriptionPrice, setSubscriptionPrice] = useState(999);

  // Payment integration states for new shop provision
  const [showPaymentProvisionModal, setShowPaymentProvisionModal] = useState(false);
  useBackHandler(showPaymentProvisionModal, () => setShowPaymentProvisionModal(false));
  const [provisionDto, setProvisionDto] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [processingLog, setProcessingLog] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  const fetchSubscriptionPrice = async () => {
    try {
      const res = await api.getSupportConfig();
      setSubscriptionPrice(res.subscriptionPrice ?? 999);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSubscriptionPrice();
  }, []);

  // Single yearly plan - end date is always exactly one year from today.
  useEffect(() => {
    const now = new Date();
    now.setFullYear(now.getFullYear() + 1);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setSubEndDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchShops = async () => {
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedShopSearchQuery || town || shops.length === 0) setLoading(true);
    try {
      const res = await api.getShopsPage({ search: debouncedShopSearchQuery, town, limit: SHOP_MANAGEMENT_PAGE_SIZE });
      setShops(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      // "Default view" now means "town is either empty or whatever GPS
      // resolved as the default" - not just empty - since locationReady
      // gating (see App()'s locationReady) means the very first fetch may
      // already carry a GPS-resolved town instead of ''. Comparing against
      // '' only would mean this cache (and the instant-render-on-revisit it
      // powers) never populates at all for any user with a resolved
      // location.
      if (!debouncedShopSearchQuery && (!town || town === defaultTown)) {
        shopsFirstPageCache = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreShops = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getShopsPage({ search: debouncedShopSearchQuery, town, cursor: nextCursor, limit: SHOP_MANAGEMENT_PAGE_SIZE });
      setShops((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Waits for locationReady (GPS permission/coordinate resolution to finish)
  // before firing the very first fetch - otherwise this would fetch with an
  // unresolved '' town immediately on mount, then re-fetch and swap results
  // once the GPS default arrives, flickering between all-location and
  // location-filtered results. Deliberately `filterReady` (useLocationFilter's
  // 3rd return value), not the raw `locationReady` prop - see that hook's
  // comment for why gating on `locationReady` alone still let one fetch
  // through with a stale '' town. A bare revisit still renders the cached
  // first page (see `shopsFirstPageCache` above) regardless, since
  // filterReady is already true by then.
  useEffect(() => {
    if (!filterReady) return;
    fetchShops();
  }, [debouncedShopSearchQuery, town, filterReady]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreShops();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedShopSearchQuery, town]);

  const executeShopCreation = async (dto) => {
    try {
      await api.createShop(dto);
      setShowAddModal(false);
      resetAddForm();
      fetchShops();
    } catch (err) {
      setErrorMsg(err.message || t('failedToCreateShop'));
      throw err;
    }
  };

  // "Current Location" for the Create Shop dialog's single Shop Address field -
  // mirrors captureShopLocation in the public self-registration wizard, minus
  // the city/state/pinCode side effects since this dialog has no such fields.
  const captureProvisionLocation = async () => {
    setProvisionLocError('');
    setProvisionLocLoading(true);
    let lat, lng;
    try {
      ({ lat, lng } = await resolveCurrentLocation());
    } catch (e) {
      setProvisionLocError(e.message);
      setProvisionLocLoading(false);
      return;
    }
    const data = await reverseGeocode(lat, lng);
    const fullAddress = data?.displayName || [data?.street, data?.locality].filter(Boolean).join(', ');
    setProvisionLocation(fullAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setProvisionLocLoading(false);
  };

  const handleCreateShopSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (!PHONE_REGEX.test(provisionPhone)) {
        alert(`Phone number: ${PHONE_REGEX_MESSAGE}`);
        return;
      }
      if (provisionWhatsapp && !PHONE_REGEX.test(provisionWhatsapp)) {
        alert(`WhatsApp number: ${PHONE_REGEX_MESSAGE}`);
        return;
      }

      if (!provisionOwnerAadhaar) {
        alert(t('ownerAadhaarMandatory'));
        return;
      }

      // Verification documents are NOT embedded in companyDetails anymore -
      // they're sent as separate top-level DTO fields and persisted by the
      // backend as real files + ShopDocument rows (see
      // ShopService.createShop / persistShopDocuments).
      const companyDetails = JSON.stringify({
        address: provisionLocation,
        gst: 'Pending',
        phone: provisionPhone,
        whatsappNumber: provisionWhatsapp,
      });
      // plan/endDate are NOT sent - a single YEARLY plan is enforced and
      // computed server-side (see ShopService.createShop).
      const dto = {
        name: shopName,
        adminEmail,
        adminName,
        adminPassword,
        companyDetails,
        themeColor: '#C89416',
        shopPhoto: provisionShopPhoto,
        shopLicense: provisionShopLicense,
        ownerAadhaar: provisionOwnerAadhaar
      };

      const price = subscriptionPrice ?? 0;
      if (price > 0) {
        setProvisionDto(dto);
        setShowPaymentProvisionModal(true);
        setPaymentSuccess(false);
        setPaymentProcessing(false);
        setProcessingLog('');
      } else {
        await executeShopCreation(dto);
      }
    } catch (err) {
      setErrorMsg(err.message || t('failedInitCheckout'));
    }
  };

  const executePaymentProvision = async (e) => {
    e.preventDefault();
    setPaymentProcessing(true);

    const logs = [
      t('logEstablishingTunnel'),
      t('logVerifyingBalance'),
      t('logAuthorizingEscrow'),
      t('logEncryptingCard'),
      t('logFulfillingProvisioning'),
    ];

    for (let i = 0; i < logs.length; i++) {
      setProcessingLog(logs[i]);
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      await executeShopCreation(provisionDto);
      setPaymentProcessing(false);
      setPaymentSuccess(true);
    } catch (err) {
      setPaymentProcessing(false);
      alert(t('paymentFailedPrefix').replace('{message}', err.message));
    }
  };

  const resetAddForm = () => {
    setShopName('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setProvisionPhone('');
    setProvisionWhatsapp('');
    setProvisionLocation('');
    setProvisionLocError('');
    setProvisionSameAsPhone(false);
    setProvisionShopPhoto('');
    setProvisionShopLicense('');
    setProvisionOwnerAadhaar('');
    setErrorMsg('');
  };

  const toggleShopStatus = async (shop) => {
    // Only suspending needs a confirm - it blocks the shop's login
    // immediately (see AuthService.login's suspended-account check), while
    // reactivating is safe/reversible-in-place.
    if (shop.isActive && !confirm(t('confirmSuspendShopMsg').replace('{name}', shop.name))) return;
    try {
      await api.suspendShop(shop.id, !shop.isActive);
      fetchShops();
    } catch (e) {
      alert(e.message);
    }
  };

  // Renews the shop's subscription for a fresh one-year YEARLY window,
  // starting now (see ShopService.updateSubscription).
  const handleUpdateSubscriptionSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.updateSubscription(selectedShop.id, { status: 'ACTIVE' });
      setShowSubModal(false);
      fetchShops();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleEditShopClick = (shop) => {
    setSelectedShop(shop);
    setEditName(shop.name);

    if (shop.companyDetails) {
      try {
        const details = JSON.parse(shop.companyDetails);
        setEditAddress(details.address || '');
        setEditGst(details.gst || '');
        setEditPhone(details.phone || '');
      } catch (err) {
        setEditAddress('');
        setEditGst('');
        setEditPhone('');
      }
    } else {
      setEditAddress('');
      setEditGst('');
      setEditPhone('');
    }

    // Verification documents are read-only in this modal (review/download
    // only - no re-upload here) and now come from the relational
    // ShopDocument table (shop.documents), not companyDetails JSON.
    const findDoc = (documentType) => (shop.documents || []).find((d) => d.documentType === documentType);
    const shopPhotoDoc = findDoc('SHOP_PHOTO');
    const shopLicenseDoc = findDoc('SHOP_LICENSE');
    const ownerAadhaarDoc = findDoc('OWNER_AADHAAR');
    setEditShopPhoto(shopPhotoDoc ? shopPhotoDoc.fileUrl : '');
    setEditShopLicense(shopLicenseDoc ? shopLicenseDoc.fileUrl : '');
    setEditOwnerAadhaar(ownerAadhaarDoc ? ownerAadhaarDoc.fileUrl : '');
    setEditShopPhotoName(shopPhotoDoc ? shopPhotoDoc.originalName : '');
    setEditShopLicenseName(shopLicenseDoc ? shopLicenseDoc.originalName : '');
    setEditOwnerAadhaarName(ownerAadhaarDoc ? ownerAadhaarDoc.originalName : '');

    setShowEditModal(true);
  };

  const handleEditShopSubmit = async (e) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(editPhone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    try {
      // Verification documents are managed separately (relational
      // ShopDocument table) and aren't editable from this form - only
      // address/phone metadata is persisted here.
      const companyDetails = JSON.stringify({
        address: editAddress,
        gst: editGst,
        phone: editPhone,
      });

      await api.updateShop(selectedShop.id, {
        name: editName,
        companyDetails
      });
      setShowEditModal(false);
      fetchShops();
    } catch (err) {
      alert(err.message || t('updateFailedMsg'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Layers /> {t('platformOperations')}</div>
          <h1>{t('shops')}</h1>
          <p>{t('provisionShopsDesc')}</p>
        </div>
      </div>

      {/* Portaled to document.body, not a plain sibling here - this .animate-
          fade-in ancestor's fadeIn animation has fill-mode: forwards, which
          leaves a non-none `transform` applied permanently after it
          finishes. A `transform` on an ancestor creates a new containing
          block for `position: fixed` descendants (they'd end up fixed
          relative to this div's box, not the viewport) - the portal is what
          keeps the FAB truly pinned to the screen corner regardless. */}
      {createPortal(
        <button
          type="button"
          onClick={() => { resetAddForm(); setShowAddModal(true); }}
          className="fab"
          aria-label={t('provisionNewShop')}
          title={t('provisionNewShop')}
        >
          <Plus />
        </button>,
        document.body
      )}

      {/* Search box stays mounted regardless of loading/results state so it
          never loses focus while typing. Filtering is instant/client-side
          (partial, case-insensitive match) since the whole shop list is
          already in memory. */}
      <div className="card table-card">
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
            {t('allShops')} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({shops.length})</span>
          </h2>
          <div className="search-box">
            <Search />
            <input
              type="text" value={shopSearchQuery} onChange={(e) => setShopSearchQuery(e.target.value)}
              placeholder={t('searchShopsPlaceholder')}
            />
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

        {(() => {
          if (loading) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
                <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingShopRegistry')}</span>
              </div>
            );
          }

          if (shops.length === 0) {
            return (
              <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {debouncedShopSearchQuery
                  ? t('noShopsMatchSearch')
                  : t('noShopsProvisionedYet')}
              </p>
            );
          }

          return (
            <div className="dealer-list stagger-in">
              {shops.map(s => {
                let details = {};
                if (s.companyDetails) {
                  try { details = typeof s.companyDetails === 'string' ? JSON.parse(s.companyDetails) : s.companyDetails; } catch (e) {}
                }
                const shopPhone = details.phone || s.phone || s.users?.[0]?.phone;
                const shopAddress = details.address || s.address || (s.users?.[0]?.email ? `Admin: ${s.users[0].email}` : null);
                const shopWebsite = details.website || s.website;
                const shopCategory = s.category || 'Key Shop';

                return (
                  <div key={s.id} className="dealer-row" onClick={() => setFullSettingsShopId(s.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                      <div className="dealer-logo">
                        <img src={s.shopPhoto || keyShopLogo} alt={s.name} />
                      </div>
                      <div className="dealer-info">
                        <div className="dealer-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{s.name}</span>
                          <span className={`badge ${s.isActive ? 'badge-active' : 'badge-suspended'}`} style={{ padding: '2px 8px', fontSize: 10 }}>
                            <span className="dot" />{s.isActive ? t('active') : t('suspended')}
                          </span>
                        </div>
                        {shopCategory && (
                          <div className="dealer-line">
                            <Tag style={{ width: 13, height: 13, color: 'var(--text-3)' }} /> <span>{shopCategory}</span>
                          </div>
                        )}
                        {shopAddress && (
                          <div className="dealer-line">
                            <MapPin style={{ width: 13, height: 13, color: 'var(--text-3)' }} /> <span>{shopAddress}</span>
                          </div>
                        )}
                        {shopPhone && (
                          <div className="dealer-line">
                            <Phone style={{ width: 13, height: 13, color: 'var(--text-3)' }} /> <span>{shopPhone}</span>
                          </div>
                        )}
                        {shopWebsite && (
                          <div className="dealer-line">
                            <Globe style={{ width: 13, height: 13, color: 'var(--gold)' }} />
                            <a href={shopWebsite.startsWith('http') ? shopWebsite : `https://${shopWebsite}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                              {shopWebsite}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="dealer-quick-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {shopPhone && (
                        <a href={`tel:${shopPhone}`} className="dealer-quick-btn call" onClick={(e) => e.stopPropagation()}>
                          <Phone className="h-3.5 w-3.5" />
                          <span>{t('callPrefix') || 'Call'}</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleShopStatus(s); }}
                        className="icon-btn"
                        style={{
                          width: 34, height: 34, borderRadius: 10,
                          background: s.isActive ? 'var(--red-dim)' : 'var(--jgreen-dim)',
                          color: s.isActive ? 'var(--red)' : 'var(--jgreen)',
                        }}
                        title={s.isActive ? t('suspendShopBtn') : t('reactivateShopBtn')}
                      >
                        {s.isActive ? <Ban style={{ width: 17, height: 17 }} /> : <PlayCircle style={{ width: 17, height: 17 }} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFullSettingsShopId(s.id); }}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: 'var(--gold)' }}
                        title={t('viewDetails')}
                      >
                        <ChevronRight style={{ width: 18, height: 18 }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
            PromotionsFeed's identical pattern for why both exist. */}
        {!loading && hasMore && (
          <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
            {loadingMore ? (
              <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
            ) : (
              <button type="button" onClick={fetchMoreShops} className="btn btn-outline btn-sm">
                {t('loadMoreBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Layers /> {t('shopOnboarding')}</span>
                <h2 style={{ fontSize: 19 }}>{t('provisionNewShopWorkspace')}</h2>
              </div>
              <button onClick={() => { resetAddForm(); setShowAddModal(false); }} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateShopSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>{t('shopNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)}
                      placeholder={t('shopNamePlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--pink)' }}><MapPin /></div>
                    <b>{t('shopAddressLabel')} <span className="req">*</span></b>
                    <button
                      type="button" onClick={captureProvisionLocation} disabled={provisionLocLoading}
                      className="reg-trailing loc-btn"
                    >
                      <Crosshair className={provisionLocLoading ? 'animate-spin' : ''} />
                      <span>{provisionLocLoading ? t('locatingLabel') : t('currentLocationBtn')}</span>
                    </button>
                  </div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={provisionLocation} onChange={(e) => setProvisionLocation(e.target.value)}
                      placeholder={t('shopAddressPlaceholder')}
                    />
                  </div>
                  {provisionLocError && (
                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{provisionLocError}</p>
                  )}
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><User /></div><b>{t('adminFullNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={adminName} onChange={(e) => setAdminName(e.target.value)}
                      placeholder={t('adminFullNamePlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Mail /></div><b>{t('adminEmailLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder={t('adminEmailPlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Lock /></div><b>{t('initialPasswordLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="password" required value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={t('initialPasswordPlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('fieldPhone')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={provisionPhone} onChange={(e) => setProvisionPhone(e.target.value)}
                      placeholder={t('phonePlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--rose)' }}><Phone /></div>
                    <b>{t('whatsappNumberLabel')} <span className="req">*</span></b>
                    <label className="reg-trailing">
                      <input
                        type="checkbox" checked={provisionSameAsPhone}
                        onChange={(e) => {
                          setProvisionSameAsPhone(e.target.checked);
                          if (e.target.checked) setProvisionWhatsapp(provisionPhone);
                        }}
                        style={{ accentColor: 'var(--gold)', width: 13, height: 13 }}
                      />
                      <span>{t('sameAsPhone')}</span>
                    </label>
                  </div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={provisionWhatsapp} onChange={(e) => setProvisionWhatsapp(e.target.value)}
                      disabled={provisionSameAsPhone} placeholder={t('whatsappNumberLabel')}
                      style={{ opacity: provisionSameAsPhone ? 0.5 : 1 }}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="form-grid">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></div><b>{t('subscriptionPlanLabel')}</b></div>
                    <div style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-1)', borderRadius: 13, padding: '13px 15px', fontSize: 14, fontWeight: 700 }}>
                      {t('yearlyPlan')} • Rs. {subscriptionPrice}/yr
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>{t('endDateValidityLabel')} <span className="req">*</span></b></div>
                    <input
                      type="date" required value={subEndDate} disabled
                      style={{ width: '100%', background: 'var(--card-2)', opacity: 0.6, border: '1.5px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                    />
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('autoCalculatedTier')}</span>
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--purple)' }}><Camera /></div><b>{t('shopPhotoLabel')} <span className="req">*</span></b></div>
                    <input
                      type="file" accept="image/*" required
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const r = new FileReader();
                          r.onloadend = () => compressBase64Image(r.result, setProvisionShopPhoto);
                          r.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs cursor-pointer file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </div>
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--pink)' }}><FileText /></div><b>{t('shopLicenseLabel')} <span className="req">*</span></b></div>
                    <input
                      type="file" accept="image/*,application/pdf" required
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const r = new FileReader();
                          r.onloadend = () => compressBase64Image(r.result, setProvisionShopLicense);
                          r.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs cursor-pointer file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </div>
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--blue)' }}><CreditCard /></div><b>{t('ownerAadhaarLabel')} <span className="req">*</span></b></div>
                    <input
                      type="file" accept="image/*,application/pdf" required
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const r = new FileReader();
                          r.onloadend = () => compressBase64Image(r.result, setProvisionOwnerAadhaar);
                          r.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs cursor-pointer file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Fixed Footer with CTA buttons */}
              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => { resetAddForm(); setShowAddModal(false); }}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('provisionAccountBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showEditModal && selectedShop && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Settings /> {t('workspaceSettings')}</span>
                <h2 style={{ fontSize: 19 }}>{t('editShopWorkspaceDetails')}</h2>
              </div>
              <button onClick={() => setShowEditModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditShopSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>{t('workspaceNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={editName} onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('fieldPhone')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><MapPin /></div><b>{t('registeredAddressFixed')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" readOnly value={editAddress}
                      style={{ opacity: 0.6, cursor: 'not-allowed' }}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Percent /></div><b>{t('fieldGstNumber')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" value={editGst} onChange={(e) => setEditGst(e.target.value)}
                      placeholder="Pending"
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Shop Photo */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><Camera style={{ width: 11, height: 11 }} /> {t('shopPhotoLabel')}</span>
                      {editShopPhoto ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000' }}>
                          <img src={getAssetUrl(editShopPhoto)} className="w-full h-full object-cover" alt="Shop Photo Preview" />
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>{t('notUploaded')}</span>
                      )}
                    </div>
                    {editShopPhoto && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editShopPhoto, editShopPhotoName || filenameForAsset(editShopPhoto, 'shop_photo'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        {t('btnDownload')}
                      </button>
                    )}
                  </div>

                  {/* Shop License */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--pink)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><FileText style={{ width: 11, height: 11 }} /> {t('shopLicenseLabel')}</span>
                      {editShopLicense ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(editShopLicense.startsWith('data:application/pdf') || editShopLicense.toLowerCase().endsWith('.pdf')) ? (
                            <FileText style={{ width: 20, height: 20, color: 'var(--red)' }} />
                          ) : (
                            <img src={getAssetUrl(editShopLicense)} className="w-full h-full object-cover" alt="License Preview" />
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>{t('notUploaded')}</span>
                      )}
                    </div>
                    {editShopLicense && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editShopLicense, editShopLicenseName || filenameForAsset(editShopLicense, 'shop_license'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        {t('btnDownload')}
                      </button>
                    )}
                  </div>

                  {/* Owner Aadhaar */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><CreditCard style={{ width: 11, height: 11 }} /> {t('ownerAadhaarLabel')}</span>
                      {editOwnerAadhaar ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(editOwnerAadhaar.startsWith('data:application/pdf') || editOwnerAadhaar.toLowerCase().endsWith('.pdf')) ? (
                            <FileText style={{ width: 20, height: 20, color: 'var(--red)' }} />
                          ) : (
                            <img src={getAssetUrl(editOwnerAadhaar)} className="w-full h-full object-cover" alt="Aadhaar Preview" />
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>{t('notUploaded')}</span>
                      )}
                    </div>
                    {editOwnerAadhaar && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editOwnerAadhaar, editOwnerAadhaarName || filenameForAsset(editOwnerAadhaar, 'owner_aadhaar'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        {t('btnDownload')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowEditModal(false)}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('saveSettings')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Subscription Update Modal */}
      {showSubModal && selectedShop && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.75)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 440, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><DollarSign /> {t('billingEyebrow')}</span>
                <h2 style={{ fontSize: 19 }}>{t('updateShopSubscriptionTitle')}</h2>
              </div>
              <button onClick={() => setShowSubModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, background: 'var(--card-2)', padding: 12, borderRadius: 13, border: '1px solid var(--border-2)', marginBottom: 18 }}>
              {t('targetShopLabel')} <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{selectedShop.name}</span>
            </div>

            <form onSubmit={handleUpdateSubscriptionSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></div><b>{t('planTierLabel')}</b></div>
                  <div style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-1)', borderRadius: 13, padding: '13px 15px', fontSize: 14, fontWeight: 700 }}>
                    {t('yearlyPlanFull')} • Rs. {subscriptionPrice}/yr
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>{t('newEndDateLabel')}</b></div>
                  <input
                    type="date" readOnly
                    value={(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })()}
                    style={{ width: '100%', background: 'var(--card-2)', opacity: 0.6, border: '1.5px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                  />
                  <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('autoCalculatedTier')}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowSubModal(false)}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('updatePlanBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showPaymentProvisionModal && provisionDto && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10 animate-fade-in" style={{ background: 'rgba(5,4,3,0.9)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 560, margin: 'auto', padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', padding: 20, background: 'var(--card-2)' }}>
              <div className="flex items-center gap-2">
                <div className="icon-badge green"><ShieldCheck /></div>
                <div>
                  <h2 style={{ fontSize: 14 }}>{t('planSubscriptionEscrowPay')}</h2>
                  <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>{t('workspaceTerminalProvisioningPayment')}</p>
                </div>
              </div>
              {!paymentProcessing && !paymentSuccess && (
                <button onClick={() => setShowPaymentProvisionModal(false)} className="icon-btn">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Success State */}
            {paymentSuccess ? (
              <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div className="icon-badge green animate-bounce" style={{ width: 64, height: 64, borderRadius: 999 }}>
                  <Check style={{ width: 30, height: 30 }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 18 }}>{t('paymentAuthorizedTitle')}</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, maxWidth: 320, margin: '8px auto 0' }}>
                    {t('paymentSettledDesc').split('{name}')[0]}<strong style={{ color: 'var(--text-1)' }}>{provisionDto.name}</strong>{t('paymentSettledDesc').split('{name}')[1]}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentProvisionModal(false);
                  }}
                  className="btn btn-primary btn-block"
                >
                  {t('closeAndProceedBtn')}
                </button>
              </div>
            ) : paymentProcessing ? (
              /* Processing State */
              <div style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full" style={{ border: '4px solid var(--gold-dim)' }}></span>
                  <span className="absolute inset-0 rounded-full animate-spin" style={{ border: '4px solid transparent', borderTopColor: 'var(--gold)' }}></span>
                </div>
                <div>
                  <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('processingTransactionTitle')}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginTop: 4 }}>{t('finalizingWorkspaceCreation')}</p>
                </div>
                <div style={{ width: '100%', background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 12, borderRadius: 13, fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'monospace', textAlign: 'center', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--gold)' }}>{processingLog}</span>
                </div>
              </div>
            ) : (
              /* Main Checkout Form */
              <form onSubmit={executePaymentProvision} style={{ padding: 24 }}>
                {/* Invoice Summary */}
                <div className="flex justify-between items-center" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 16, borderRadius: 16, marginBottom: 18 }}>
                  <div>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>{t('workspaceProvisionInvoice')}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}>{t('planColonLabel')} <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{t('yearlyPlan')}</span></span>
                  </div>
                  <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--display)' }}>Rs. {subscriptionPrice}</span>
                </div>

                {/* Tab Selector */}
                <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`store-tab ${paymentMethod === 'card' ? 'active' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                  >
                    <CreditCard className="h-4 w-4" />
                    <span style={{ fontSize: 10 }}>{t('creditCardLabel')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`store-tab ${paymentMethod === 'upi' ? 'active' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                  >
                    <QrCode className="h-4 w-4" />
                    <span style={{ fontSize: 10 }}>{t('upiQrCodeLabel')}</span>
                  </button>
                </div>

                {paymentMethod === 'card' ? (
                  <div className="animate-fade-in">
                    <div className="field">
                      <label>{t('cardholderFullNameLabel')}</label>
                      <div className="input-wrap">
                        <User />
                        <input
                          type="text" required value={cardHolder} onChange={(e) => setCardHolder(e.target.value)}
                          placeholder={t('cardholderNamePlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>{t('debitCreditCardNumberLabel')}</label>
                      <div className="input-wrap">
                        <CreditCard />
                        <input
                          type="text" required value={cardNumber}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '').substring(0, 16);
                            const parts = val.match(/.{1,4}/g) || [];
                            setCardNumber(parts.join(' '));
                          }}
                          placeholder="4111 2222 3333 4444"
                          style={{ fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>{t('expiryDateLabel')}</label>
                        <div className="input-wrap">
                          <Calendar />
                          <input
                            type="text" required value={cardExpiry}
                            onChange={(e) => {
                              let val = e.target.value.replace(/\D/g, '');
                              if (val.length > 2) {
                                setCardExpiry(val.substring(0, 2) + '/' + val.substring(2, 4));
                              } else {
                                setCardExpiry(val);
                              }
                            }}
                            placeholder="MM/YY"
                            style={{ textAlign: 'center' }}
                          />
                        </div>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>{t('cvvCodeLabel')}</label>
                        <div className="input-wrap">
                          <Lock />
                          <input
                            type="password" required value={cardCvv} onChange={(e) => setCardCvv(e.target.value.substring(0, 3))}
                            placeholder="•••"
                            style={{ textAlign: 'center', fontFamily: 'monospace' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '10px 0' }}>
                    <div style={{ background: '#fff', padding: 12, borderRadius: 18, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 160, height: 160 }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${KEE_LANDING_PAGE_URL}/subscribe?amount=${subscriptionPrice}`}
                        alt="Pay QR code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>{t('scanToAuthorizeInvoice')}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, maxWidth: 260, marginTop: 4 }}>
                        {t('scanQrDesc')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <div className="flex items-center gap-1.5 justify-center" style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
                    <Lock className="h-3 w-3" style={{ color: 'var(--green)' }} />
                    <span>{t('secureGatewayPaymentPortal')}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPaymentProvisionModal(false)}
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                    >
                      {t('cancelSetupBtn')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                    >
                      {t('payAndProvisionPrefix')} {subscriptionPrice} {t('payAndProvisionSuffix')}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Full Shop Settings modal - lets Super Admin manage a specific
          shop's GST/verification document/referral code, reusing the exact
          same view (scoped via shopId) the Shop Admin sees on their own
          dashboard. */}
      {fullSettingsShopId && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div style={{ width: '100%', maxWidth: 900, margin: 'auto' }}>
            <div className="flex justify-end" style={{ marginBottom: 10 }}>
              <button onClick={() => setFullSettingsShopId(null)} className="icon-btn" style={{ background: 'var(--card)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
              <ShopSettingsView t={t} api={api} shopId={fullSettingsShopId} />
            </Suspense>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ShopsManagementView;
