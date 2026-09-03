import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '../utils/backHandler';
import { getAssetUrl, downloadAsset, filenameForAsset } from '../apiConfig';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../utils/phone';
import { primeStoragePermission } from '../utils/platform';
import { resolveCurrentLocation, reverseGeocode } from '../utils/geolocation';
import { useLocationFilter } from '../utils/locationFilter';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import CustomSelect from '../components/CustomSelect';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import { useSubmitting } from '../hooks/useSubmitting';
import {
  Key, Check, Plus, Settings, FileText, Search, MapPin, Camera, AlertTriangle,
  RefreshCw, Layers, Edit, DollarSign, ChevronRight, CreditCard, Lock,
  Mail, Phone, Calendar, Store, User, Crosshair, Tag, Percent, Globe,
  X,
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
  const { submitting: creatingShop, run: runCreateShop } = useSubmitting();
  const { submitting: savingShopEdit, run: runSaveShopEdit } = useSubmitting();
  const { submitting: updatingSubscription, run: runUpdateSubscription } = useSubmitting();
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
  useBackHandler(!!fullSettingsShopId, () => { setFullSettingsShopId(null); fetchShops(); });

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
  // Category dropdown - required, mirroring the self-registration wizard's
  // own required category field (see App.jsx's regCategoryId/regCategories).
  const [provisionCategoryId, setProvisionCategoryId] = useState('');
  const [provisionCategories, setProvisionCategories] = useState([]);
  const [provisionCategoriesLoading, setProvisionCategoriesLoading] = useState(false);
  // Silently captured by "Current Location" alongside provisionLocation
  // (the one visible address field) - same pattern as the self-registration
  // wizard's captureShopLocation, which also has no separate visible
  // city/state/pinCode inputs. town/district get their own Shop columns;
  // state/pinCode fold into companyDetails (see handleCreateShopSubmit).
  const [provisionTown, setProvisionTown] = useState('');
  const [provisionDistrict, setProvisionDistrict] = useState('');
  const [provisionState, setProvisionState] = useState('');
  const [provisionPinCode, setProvisionPinCode] = useState('');
  const [provisionLat, setProvisionLat] = useState(null);
  const [provisionLng, setProvisionLng] = useState(null);
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
  // (see SupportConfigView / PlatformConfig.subscriptionPrice) - purely
  // informational display here (e.g. "Yearly Plan • Rs. 999/yr"), since a
  // Super-Admin-provisioned shop skips payment entirely (see
  // handleCreateShopSubmit).
  const [subscriptionPrice, setSubscriptionPrice] = useState(999);

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

  // Populate the Add Shop dialog's Category dropdown as soon as it opens -
  // same pattern as the self-registration wizard's regCategories (App.jsx).
  useEffect(() => {
    if (!showAddModal) return;
    setProvisionCategoriesLoading(true);
    api.getShopCategories()
      .then((cats) => setProvisionCategories(cats || []))
      .catch((e) => console.error('Failed to load shop categories:', e))
      .finally(() => setProvisionCategoriesLoading(false));
  }, [showAddModal]);

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

  // "Current Location" for the Create Shop dialog's single visible Shop
  // Address field - mirrors captureShopLocation in the public
  // self-registration wizard exactly, including its side effects: town/
  // state/pinCode/district/lat/lng are captured into hidden state (no
  // separate visible inputs, same as that wizard) so the created shop gets
  // the same location data a self-registered one would.
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
    setProvisionLat(lat);
    setProvisionLng(lng);
    const data = await reverseGeocode(lat, lng);
    const fullAddress = data?.displayName || [data?.street, data?.locality].filter(Boolean).join(', ');
    setProvisionLocation(fullAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    if (data?.district) setProvisionDistrict(data.district);
    if (data?.city) setProvisionTown(data.city);
    if (data?.state) setProvisionState(data.state);
    if (data?.postcode) setProvisionPinCode(data.postcode.replace(/\D/g, ''));
    setProvisionLocLoading(false);
  };

  // Provisions a shop directly, no payment step - a Super Admin is setting
  // this up on the platform's behalf, not paying for it themselves. Field
  // requirements otherwise mirror the public self-registration wizard (see
  // AuthService.registerShop / RegisterShopDto): phone, category, and
  // address are all required there and required here too.
  const handleCreateShopSubmit = (e) => {
    e.preventDefault();
    runCreateShop(async () => {
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
      if (!provisionCategoryId) {
        alert(t('selectShopCategoryPlaceholder'));
        return;
      }

      // Verification documents (shop photo, license, owner Aadhaar) are all
      // optional here - a Super Admin provisioning a shop on the platform's
      // behalf may not have these on hand yet; the shop can upload them
      // later from Shop Settings.
      // Verification documents are NOT embedded in companyDetails anymore -
      // they're sent as separate top-level DTO fields and persisted by the
      // backend as real files + ShopDocument rows (see
      // ShopService.createShop / persistShopDocuments). state/pinCode fold
      // in here too, same as self-registration - see ShopService.createShop
      // for why they have no dedicated Shop column of their own.
      const companyDetails = JSON.stringify({
        address: provisionLocation,
        state: provisionState || undefined,
        pinCode: provisionPinCode || undefined,
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
        adminPhone: provisionPhone,
        categoryId: provisionCategoryId,
        town: provisionTown || undefined,
        district: provisionDistrict || undefined,
        latitude: provisionLat ?? undefined,
        longitude: provisionLng ?? undefined,
        companyDetails,
        themeColor: '#C89416',
        shopPhoto: provisionShopPhoto,
        shopLicense: provisionShopLicense,
        ownerAadhaar: provisionOwnerAadhaar
      };

      await executeShopCreation(dto);
    } catch (err) {
      setErrorMsg(err.message || t('failedToCreateShop'));
    }
    });
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
    setProvisionCategoryId('');
    setProvisionTown('');
    setProvisionDistrict('');
    setProvisionState('');
    setProvisionPinCode('');
    setProvisionLat(null);
    setProvisionLng(null);
    setErrorMsg('');
  };

  // Renews the shop's subscription for a fresh one-year YEARLY window,
  // starting now (see ShopService.updateSubscription).
  const handleUpdateSubscriptionSubmit = (e) => {
    e.preventDefault();
    runUpdateSubscription(async () => {
      try {
        await api.updateSubscription(selectedShop.id, { status: 'ACTIVE' });
        setShowSubModal(false);
        fetchShops();
      } catch (e) {
        alert(e.message);
      }
    });
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

  const handleEditShopSubmit = (e) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(editPhone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    runSaveShopEdit(async () => {
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
    });
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
                        <img src={s.shopPhoto || keyShopLogo} alt={s.name} loading="lazy" />
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
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange, #f59e0b)' }}><Tag /></div><b>{t('fieldCategory')} <span className="req">*</span></b></div>
                  <CustomSelect
                    value={provisionCategoryId} onChange={setProvisionCategoryId}
                    disabled={provisionCategoriesLoading}
                    placeholder={provisionCategoriesLoading ? t('loadingCategoriesEllipsis') : t('selectShopCategoryPlaceholder')}
                    emptyLabel={t('noShopCategoriesAvailableMsg')}
                    options={provisionCategories.map((cat) => ({ value: cat.id, label: cat.name }))}
                  />
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
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--purple)' }}><Camera /></div><b>{t('shopPhotoLabel')}</b></div>
                    <input
                      type="file" accept="image/*"
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
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--pink)' }}><FileText /></div><b>{t('shopLicenseLabel')}</b></div>
                    <input
                      type="file" accept="image/*,application/pdf"
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
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--blue)' }}><CreditCard /></div><b>{t('ownerAadhaarLabel')}</b></div>
                    <input
                      type="file" accept="image/*,application/pdf"
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
                  disabled={creatingShop}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingShop}
                >
                  {creatingShop && <RefreshCw className="h-4 w-4 animate-spin" />}
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
                  disabled={savingShopEdit}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingShopEdit}
                >
                  {savingShopEdit && <RefreshCw className="h-4 w-4 animate-spin" />}
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
                  disabled={updatingSubscription}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updatingSubscription}
                >
                  {updatingSubscription && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {t('updatePlanBtn')}
                </button>
              </div>
            </form>
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
              {/* Closing re-fetches the shop list - the settings screen
                  now includes the Suspend/Reactivate action, and the list's
                  own status badge needs to reflect any change made in there. */}
              <button onClick={() => { setFullSettingsShopId(null); fetchShops(); }} className="icon-btn" style={{ background: 'var(--card)' }}>
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
