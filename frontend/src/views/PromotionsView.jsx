import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '../utils/backHandler';
import { cleanGoogleImageUrl, resizeImageFileToBlob } from '../utils/imageUtils';
import { primeStoragePermission } from '../utils/platform';
import { useLocationFilter } from '../utils/locationFilter';
import { useSubmitting } from '../hooks/useSubmitting';
import { ALL_TN_LOCATIONS } from '../utils/tamilNaduLocations';
import CustomSelect from '../components/CustomSelect';
import PriceTag from '../components/PriceTag';
import ImageCarousel from '../components/ImageCarousel';
import {
  Plus, FileText, Search, MapPin, AlertTriangle, Trash, RefreshCw, Layers,
  Edit, Upload, Phone, ArrowLeft, Calendar, Store, Clock, IndianRupee, Tag,
  Package, Boxes, Percent, Image as ImageIcon, Megaphone, BadgePercent, CalendarRange,
  X,
} from 'lucide-react';

// ============================================================================
// COMPONENT 6B: CROSS-SHOP PROMOTIONS (ads, promotional products & offers, shared feed)
// Every shop (and the Super Admin) sees every shop's listings. A Shop Admin can
// create/edit/delete PRODUCT, AD and OFFER listings for their own shop only;
// an OFFER may optionally be linked to one of that shop's existing listings.
// The Super Admin cannot publish listings, but can moderate (edit/delete) any
// listing platform-wide, plus gets dedicated Banner Management and Offer
// Management sub-tabs alongside the plain marketplace feed.
// ============================================================================
// OLX-style inventory categories. Freeform on the backend (productType is a
// plain string, not an enum) so this list can grow without a migration - the
// options themselves are Super-Admin-managed (see ProductType model /
// api.getProductTypes) rather than hardcoded here. This is now the ONLY type
// classification a listing has - the old separate "Listing Type" (Inventory
// Product / Advertisement / Offer/Discount) picker has been removed from the
// create/edit form; every new listing is created as a plain PRODUCT and
// categorized purely via this list.

function PromotionsView({ t, api, user, searchDispatch, initiallyOpenAddModal, onCloseInitiallyOpen, defaultTown, locationReady }) {
  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Package /> {t('crossShopMarketplaceLabel')}</div>
          <h1>{t('inventoryTitle')}</h1>
          <p>
            {isSuperAdmin
              ? t('manageSharedInventoryDesc')
              : t('browseListProductsDesc')}
          </p>
        </div>
      </div>

      <PromotionsFeed
        key="feed" t={t} api={api} user={user} isSuperAdmin={isSuperAdmin} onlyOffers={false}
        searchDispatch={searchDispatch}
        initiallyOpenAddModal={initiallyOpenAddModal}
        onCloseInitiallyOpen={onCloseInitiallyOpen}
        defaultTown={defaultTown}
        locationReady={locationReady}
      />
    </div>
  );
}

// Page size for the Machines/Inventory feed's cursor pagination - see
// PromotionService.getAllPromotions.
const PROMOTIONS_PAGE_SIZE = 20;

// Machine/Product listings must expire and get auto-deleted within a month
// of creation (or a shorter admin-chosen date) - see PromotionService's
// backend enforcement of this same cap on create/update.
const PRODUCT_MAX_VALIDITY_DAYS = 30;

// Listing photo upload cap - see PromotionService's clampImageUrls for the
// matching backend-side enforcement.
const PRODUCT_MAX_PHOTOS = 4;

function PromotionsFeed({ t, api, user, isSuperAdmin, onlyOffers, searchDispatch, initiallyOpenAddModal, onCloseInitiallyOpen, defaultTown, locationReady }) {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Infinite-scroll pagination state - `promotions` above only ever holds
  // the pages loaded so far, never the whole table (see fetchPromotions/
  // fetchMorePromotions below).
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editingId, setEditingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { submitting, run } = useSubmitting();

  // Product Details navigation stack - tapping a product card pushes it;
  // tapping a Related Product on the details page pushes another level
  // (so hardware Back steps back through every product visited before
  // finally returning to this list), rather than replacing the current one.
  // One useBackHandler registration pops an arbitrary-depth stack one level
  // at a time (functional update avoids stale-closure issues) - same
  // pattern used by PublicMobileApp's screenStack.
  const [detailStack, setDetailStack] = useState([]);
  useBackHandler(detailStack.length > 0, () => setDetailStack((prev) => prev.slice(0, -1)));
  const pushDetail = (promo) => setDetailStack((prev) => [...prev, promo]);
  const popDetail = () => setDetailStack((prev) => prev.slice(0, -1));

  // Dashboard "Add Machines" quick action - open the create-listing dialog
  // as soon as this feed mounts, then let the parent clear the one-shot flag.
  useEffect(() => {
    if (initiallyOpenAddModal) {
      resetForm();
      setShowAddModal(true);
      onCloseInitiallyOpen?.();
    }
  }, [initiallyOpenAddModal]);

  // Form state
  const [type, setType] = useState('PRODUCT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Up to PRODUCT_MAX_PHOTOS URLs, in display order. index 0 doubles as the
  // card-grid/PDF/legacy "cover photo" everywhere else in the app still
  // reads a single promo.imageUrl (see PromotionService syncing imageUrl to
  // imageUrls[0] on save) - no other display site needed to change.
  const [imageUrls, setImageUrls] = useState([]);
  // True only while a picked file is being resized+uploaded (see
  // handleImageFileSelect) - the Upload button is disabled meanwhile so a
  // second pick can't race the first.
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [price, setPrice] = useState('');
  const [productType, setProductType] = useState('');
  const [phone, setPhone] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [linkedPromotionId, setLinkedPromotionId] = useState('');

  // Resizes the picked file client-side, uploads it to real file storage,
  // and appends the returned URL to imageUrls (or overwrites `replaceIndex`
  // if given) - replaces the old FileReader base64-inline approach that was
  // embedding multi-MB photos directly in the database (see the "why is Used
  // Machines slow" investigation).
  const handleImageFileSelect = async (file, replaceIndex = null) => {
    if (!file) return;
    setImageUploadError('');
    setImageUploading(true);
    try {
      const blob = await resizeImageFileToBlob(file);
      const { url } = await api.uploadPromotionImage(blob);
      setImageUrls((prev) => {
        if (replaceIndex !== null) {
          const next = [...prev];
          next[replaceIndex] = url;
          return next;
        }
        // The Add-Photo tile is only rendered while prev.length < MAX, but
        // guard anyway in case of a fast double-fire.
        return prev.length >= PRODUCT_MAX_PHOTOS ? prev : [...prev, url];
      });
    } catch (e) {
      console.error('Failed to upload listing photo:', e);
      setImageUploadError(e.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveImage = (index) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // Super-Admin-managed list of product types (see ProductType model /
  // api.getProductTypes) that powers the Product Type dropdown below -
  // replaces what used to be a hardcoded PRODUCT_TYPES array.
  const [productTypes, setProductTypes] = useState([]);

  // OLX-style category filter chip - now applied server-side (see
  // fetchPromotions) so it stays correct across paginated pages instead of
  // only filtering whatever happened to be loaded already.
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Free-text query, either typed locally or dispatched from the global
  // header search panel (filter = "Product Type" / "Location" / "Anything").
  // Debounced into `debouncedQuery` below before it reaches the server, since
  // (unlike the old client-side filter) every change now triggers a network
  // request - without debouncing, fast typing would fire one request per
  // keystroke.
  const [textQuery, setTextQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(textQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [textQuery]);

  useEffect(() => {
    api.getProductTypes()
      .then((res) => {
        setProductTypes(res || []);
        setProductType((prev) => prev || res?.[0]?.name || '');
      })
      .catch((e) => console.error('Failed to load product types:', e));
  }, []);

  useEffect(() => {
    if (searchDispatch && ['productType', 'location', 'all'].includes(searchDispatch.type)) {
      const q = (searchDispatch.query || '').trim().toLowerCase();
      if (q === 'used machines' || q === 'used_machines') {
        setTextQuery('');
        setCategoryFilter('ALL');
      } else {
        setTextQuery(searchDispatch.query);
        if (searchDispatch.type === 'productType') {
          // If the query exactly matches a known category, jump straight to that chip.
          const match = productTypes.find(pt => pt.name.toLowerCase() === q);
          if (match) setCategoryFilter(match.name);
        }
      }
    }
  }, [searchDispatch?.nonce]);

  // Loads the first page for the current filters (category chip / search /
  // onlyOffers) - called on mount and whenever any of those filters change,
  // replacing whatever was loaded before rather than appending to it.
  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await api.getPromotions({
        // Offer Management (Super Admin) needs every offer regardless of
        // expiry for moderation; the plain marketplace feed only shows
        // active offers.
        includeExpiredOffers: onlyOffers,
        type: onlyOffers ? 'OFFER' : undefined,
        limit: PROMOTIONS_PAGE_SIZE,
        category: !onlyOffers && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: debouncedQuery || undefined,
        town: town || undefined,
      });
      setPromotions(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page, triggered by the sentinel div's IntersectionObserver
  // scrolling into view (see the effect below) - never replaces what's
  // already loaded.
  const fetchMorePromotions = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getPromotions({
        includeExpiredOffers: onlyOffers,
        type: onlyOffers ? 'OFFER' : undefined,
        limit: PROMOTIONS_PAGE_SIZE,
        cursor: nextCursor,
        category: !onlyOffers && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: debouncedQuery || undefined,
        town: town || undefined,
      });
      setPromotions((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Re-fetch page 1 whenever a filter changes (also covers the initial
  // mount-time load). Waits for `filterReady` (useLocationFilter's 3rd
  // return value), not the raw `locationReady` prop, first - see that
  // hook's comment for why the very first fetch must not fire with an
  // unresolved '' town.
  useEffect(() => {
    if (!filterReady) return;
    fetchPromotions();
  }, [categoryFilter, debouncedQuery, onlyOffers, town, filterReady]);

  // Infinite scroll: fetch the next page as soon as the sentinel div at the
  // bottom of the grid scrolls into view. Re-observing on every relevant
  // state change (rather than memoizing fetchMorePromotions) keeps this
  // simple and correct - the observer callback always closes over the
  // latest hasMore/nextCursor/filters.
  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMorePromotions();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, categoryFilter, debouncedQuery, onlyOffers, town]);

  // The Offer create/edit form's "link to one of your own listings" dropdown
  // needs the caller's own full PRODUCT/AD listing set (not paginated - it's
  // inherently small, one shop's own inventory), fetched separately and only
  // while actually needed rather than as part of the main paginated feed.
  const [linkableListings, setLinkableListings] = useState([]);
  useEffect(() => {
    if (!showAddModal || type !== 'OFFER') {
      setLinkableListings([]);
      return;
    }
    api.getPromotions({ mine: true, excludeOffers: true })
      .then((res) => setLinkableListings(Array.isArray(res) ? res : []))
      .catch((e) => console.error('Failed to load linkable listings:', e));
  }, [showAddModal, type]);

  const resetForm = () => {
    setEditingId(null);
    setType('PRODUCT');
    setTitle('');
    setDescription('');
    setImageUrls([]);
    setImageUploadError('');
    setPrice('');
    setProductType(productTypes[0]?.name || '');
    setPhone('');
    setDiscountPercentage('');
    // New listings default to type PRODUCT (see the comment on the `type`
    // field below), so this must default to the max allowed expiry rather
    // than blank - blank would fail the now-`required` date input.
    setValidUntil((() => { const d = new Date(); d.setDate(d.getDate() + PRODUCT_MAX_VALIDITY_DAYS); return d.toISOString().slice(0, 10); })());
    setLinkedPromotionId('');
    setErrorMsg('');
  };

  const canManage = (promo) => isSuperAdmin ? promo.createdById === user.id : promo.shopId === user.shopId;

  const handleEditClick = (promo) => {
    setEditingId(promo.id);
    setType(promo.type);
    setTitle(promo.title);
    setDescription(promo.description || '');
    setImageUrls(promo.imageUrls && promo.imageUrls.length ? promo.imageUrls : (promo.imageUrl ? [promo.imageUrl] : []));
    setPrice(promo.price ?? '');
    setProductType(promo.productType || productTypes[0]?.name || '');
    setPhone(promo.phone || '');
    setDiscountPercentage(promo.discountPercentage ?? '');
    setValidUntil(promo.validUntil ? promo.validUntil.slice(0, 10) : '');
    setLinkedPromotionId(promo.linkedPromotionId || '');
    setErrorMsg('');
    setShowAddModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    run(async () => {
      setErrorMsg('');
      try {
        const dto = {
          // The Listing Type picker (Inventory Product / Advertisement /
          // Offer-Discount) has been removed from the UI - every new listing
          // is always a plain PRODUCT. `type` is only ever something other
          // than 'PRODUCT' here when editing a pre-existing legacy AD/OFFER
          // listing (handleEditClick loads its original type), so this line
          // preserves that legacy record's type instead of silently
          // converting it.
          type,
          title,
          description: description || undefined,
          // Always sent as a real array (even []) rather than undefined-when-
          // empty, so removing every photo on an edit actually clears them
          // server-side instead of being read as "leave unchanged".
          imageUrls,
          price: price === '' ? undefined : Number(price),
          productType: productType || undefined,
          phone: phone || undefined,
          discountPercentage: discountPercentage !== '' ? Number(discountPercentage) : undefined,
          validUntil: (type === 'OFFER' || type === 'PRODUCT') && validUntil ? new Date(validUntil).toISOString() : undefined,
          linkedPromotionId: type === 'OFFER' && linkedPromotionId ? linkedPromotionId : undefined,
        };
        if (editingId) {
          await api.updatePromotion(editingId, dto);
        } else {
          await api.createPromotion(dto);
        }
        setShowAddModal(false);
        resetForm();
        fetchPromotions();
      } catch (err) {
        setErrorMsg(err.message || (editingId ? t('failedUpdateListing') : t('failedPublishListing')));
      }
    });
  };

  const handleDelete = async (id) => {
    if (!confirm(t('confirmRemoveListing'))) return;
    try {
      await api.deletePromotion(id);
      fetchPromotions();
    } catch (e) {
      alert(e.message);
    }
  };

  const typeMeta = (listingType) => listingType === 'AD'
    ? { label: t('advertisementLabel'), icon: Megaphone, color: 'purple' }
    : listingType === 'OFFER'
      ? { label: t('offerLabel'), icon: BadgePercent, color: 'rose' }
      : { label: t('promotionalProductLabel'), icon: Package, color: 'teal' };

  const isExpiredOffer = (promo) => promo.type === 'OFFER' && promo.validUntil && new Date(promo.validUntil) < new Date();

  // linkableListings (the Offer form's "link to one of your own listings"
  // dropdown, filtered to the caller's own shop server-side) is fetched
  // separately above - see the effect keyed on [showAddModal, type].
  const linkableListingsFiltered = linkableListings.filter(p => p.id !== editingId);

  // OLX-style category chips: sourced from the Super-Admin-curated product
  // type list (already fetched above), not from whatever page of the feed
  // happens to be loaded - otherwise a category with no listings on page 1
  // would be missing until the user scrolled far enough to see one.
  const availableCategories = !onlyOffers ? productTypes.map(pt => pt.name) : [];

  // `promotions` is already exactly the current filtered/paginated set from
  // the server (category + search + onlyOffers all applied there now - see
  // fetchPromotions) - no further client-side filtering needed.
  const visiblePromotions = promotions;

  if (detailStack.length > 0) {
    return (
      <ProductDetailsView
        promo={detailStack[detailStack.length - 1]}
        t={t}
        api={api}
        onBack={popDetail}
        onOpenRelated={pushDetail}
      />
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginTop: 4, marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        {/* Search + location split an equal 50/50 (same pattern as
            CategoryShopsView) - `minWidth: 0` on both overrides their
            default sizing so the flex split actually governs, instead of
            the search box's own min-width or the select's intrinsic width
            dominating the row. */}
        <div className="input-wrap" style={{ flex: '1 1 0', minWidth: 0, margin: 0 }}>
          <Search />
          <input
            type="text" value={textQuery} onChange={(e) => setTextQuery(e.target.value)}
            placeholder={t('searchInventoryPlaceholder')}
          />
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

      {availableCategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`badge ${categoryFilter === 'ALL' ? 'badge-gold' : ''}`}
            style={categoryFilter === 'ALL' ? undefined : { background: 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            {t('allCategoriesLabel')}
          </button>
          {availableCategories.map(cat => (
            <button
              type="button"
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`badge ${categoryFilter === cat ? 'badge-gold' : ''}`}
              style={categoryFilter === cat ? undefined : { background: 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', cursor: 'pointer' }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingListingsMsg')}</span>
        </div>
      ) : visiblePromotions.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge teal"><Package /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{onlyOffers ? t('noOffersPublishedYet') : t('noInventoryListedYet')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {visiblePromotions.map(promo => {
            const meta = typeMeta(promo.type);
            const Icon = meta.icon;
            const expired = isExpiredOffer(promo);
            return (
              promo.type === 'PRODUCT' ? (
              // Machines/Products - same visual language as the pre-login
              // Machines tab's card (.pub-card / .pub-card-media / .pub-card-title
              // / .pub-card-meta, shared global classes, not duplicated CSS) so
              // the two surfaces read as one consistent design. Unlike the
              // pre-login card this one isn't a fixed-height grid tile (it needs
              // room for the Call button, date and Edit/Remove), so the body's
              // normally-fixed height/overflow/truncation are overridden inline
              // to grow with content instead of clipping it.
              <div key={promo.id} className="pub-card" style={{ cursor: 'pointer' }} onClick={() => pushDetail(promo)}>
                <div className="pub-card-media">
                  {promo.imageUrl ? (
                    <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} loading="lazy" />
                  ) : (
                    <div className={`icon-badge ${meta.color}`}><Icon /></div>
                  )}
                  {expired && (
                    <span className="badge badge-suspended" style={{ position: 'absolute', top: 10, right: 10 }}>{t('expiredLabel')}</span>
                  )}
                </div>
                <div className="pub-card-body" style={{ height: 'auto', overflow: 'visible' }}>
                  <div className="pub-card-title" style={{ whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>{promo.title}</div>
                  {promo.productType && (
                    <div className="pub-card-meta"><Tag className="h-3 w-3" /><span>{promo.productType}</span></div>
                  )}
                  <div className="pub-card-meta"><Store className="h-3 w-3" /><span>{promo.shop?.name || t('superAdminIndependentLabel')}</span></div>
                  <PriceTag price={promo.price} discountPercentage={promo.discountPercentage} offSuffix={t('percentOffSuffix')} />
                </div>
                <div style={{ padding: '0 11px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {promo.phone && (
                    // Plain tel: link - opens the system dialer automatically inside
                    // the native Android app (Capacitor's default WebViewClient
                    // launches an external ACTION_VIEW intent for non-http schemes),
                    // and falls back to the browser's normal tel: handling on web.
                    // stopPropagation so tapping Call doesn't also open details.
                    <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block" onClick={(e) => e.stopPropagation()}>
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix')} {promo.phone}</span>
                    </a>
                  )}

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Calendar className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {new Date(promo.createdAt).toLocaleDateString()}
                  </div>

                  {canManage(promo) && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditClick(promo); }}
                        className="btn btn-ghost btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Edit className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('editBtn')}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(promo.id); }}
                        className="btn btn-danger-outline btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Trash className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('removeBtn')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              ) : (
              <div key={promo.id} className="product-card">
                <div className="product-img" style={{ height: 150, aspectRatio: '1 / 1', maxHeight: 190 }}>
                  {promo.imageUrl ? (
                    <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} loading="lazy" className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                  ) : (
                    <div className={`icon-badge ${meta.color}`}><Icon /></div>
                  )}
                  <span className="product-tag">
                    <Icon className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{meta.label}
                  </span>
                  {expired && (
                    <span className="badge badge-suspended" style={{ position: 'absolute', top: 10, right: 10 }}>{t('expiredLabel')}</span>
                  )}
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <span className="pname" style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>{promo.title}</span>
                    {promo.price != null && (
                      <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                        <IndianRupee className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                        {Number(promo.price).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>

                  {promo.description && (
                    <p className="cell-sub" style={{ fontSize: 11.5, minHeight: 32, wordBreak: 'break-word' }}>{promo.description}</p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {promo.discountPercentage != null && (
                      <span className="badge badge-active">
                        <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                        {promo.discountPercentage}{t('percentOffSuffix')}
                      </span>
                    )}
                    {promo.validUntil && (
                      <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        <Clock className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                        {t('validTillPrefix')} {new Date(promo.validUntil).toLocaleDateString()}
                      </span>
                    )}
                    {promo.linkedPromotion && (
                      <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        {t('linkedPrefix')} {promo.linkedPromotion.title}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--text-2)', background: 'var(--card-2)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, fontWeight: 600 }}>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={promo.shop?.name || t('superAdminIndependentLabel')}>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('shopLabel')}</span>
                      {promo.shop?.name || t('superAdminIndependentLabel')}
                    </div>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={promo.createdBy?.name || ''}>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('ownerLabel')}</span>
                      {promo.createdBy?.name || '—'}
                    </div>
                  </div>

                  {promo.phone && (
                    <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix')} {promo.phone}</span>
                    </a>
                  )}

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Calendar className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {new Date(promo.createdAt).toLocaleDateString()}
                  </div>

                  {canManage(promo) && (
                    <div className="flex gap-2" style={{ marginTop: 4 }}>
                      <button
                        onClick={() => handleEditClick(promo)}
                        className="btn btn-ghost btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Edit className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('editBtn')}</span>
                      </button>
                      <button
                        onClick={() => handleDelete(promo.id)}
                        className="btn btn-danger-outline btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Trash className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('removeBtn')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )
            );
          })}
        </div>
      )}

      {/* Infinite scroll: the sentinel div triggers fetchMorePromotions as
          soon as it scrolls into view (see the IntersectionObserver effect
          above). The "Load More" button underneath is a manual fallback for
          the rare case scrolling proximity doesn't fire it (very short
          viewports, WebView IntersectionObserver quirks) - both call the
          same fetchMorePromotions, so there's no risk of double-fetching
          beyond what the loadingMore guard already prevents. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
          ) : (
            <button type="button" onClick={fetchMorePromotions} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Listing Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Package /> {t('inventoryListingLabel')}</span>
                <h2 style={{ fontSize: 19 }}>{editingId ? t('editListingTitle') : t('newInventoryListingTitle')}</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="reg-section">

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Tag /></div><b>{t('nameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('listingNamePlaceholderEg')}
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><Layers /></div><b>{t('productTypeLabel')}</b></div>
                  <CustomSelect
                    value={productType} onChange={setProductType}
                    placeholder={t('selectProductTypePlaceholder')}
                    emptyLabel={t('noProductTypesAvailable')}
                    options={productTypes.map(pt => ({ value: pt.name, label: pt.name }))}
                  />
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><FileText /></div><b>{t('descriptionOptionalLabel')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('shortDescriptionPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><ImageIcon /></div><b>{type === 'PRODUCT' ? t('productPhotoOptionalLabel') : t('imageMediaOptionalLabel')}</b></div>
                  <span className="cell-sub" style={{ display: 'block', marginBottom: 8 }}>
                    {t('photosUploadedCountLabel').replace('{count}', imageUrls.length).replace('{max}', PRODUCT_MAX_PHOTOS)}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {imageUrls.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 84, height: 84, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card-2)', flexShrink: 0 }}>
                        <img src={cleanGoogleImageUrl(url)} alt={`Photo ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button" onClick={() => handleRemoveImage(idx)} title={t('removePhotoLabel')}
                          style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <label
                          title={t('replacePhotoLabel')}
                          style={{ position: 'absolute', bottom: 3, right: 3, width: 20, height: 20, borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: imageUploading ? 'default' : 'pointer' }}
                        >
                          <Edit className="h-3 w-3" />
                          <input
                            type="file" accept="image/*" className="hidden" disabled={imageUploading}
                            onClick={primeStoragePermission}
                            onChange={(e) => {
                              const file = e.target.files[0];
                              e.target.value = '';
                              handleImageFileSelect(file, idx);
                            }}
                          />
                        </label>
                      </div>
                    ))}
                    {imageUrls.length < PRODUCT_MAX_PHOTOS && (
                      <label
                        style={{ width: 84, height: 84, borderRadius: 12, border: '1.5px dashed var(--border-2)', background: 'var(--card-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: imageUploading ? 'default' : 'pointer', flexShrink: 0, opacity: imageUploading ? 0.6 : 1 }}
                      >
                        {imageUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" style={{ color: 'var(--text-3)' }} />}
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{imageUploading ? t('uploadingLabel') : t('uploadBtn')}</span>
                        <input
                          type="file" accept="image/*" className="hidden" disabled={imageUploading}
                          onClick={primeStoragePermission}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            e.target.value = '';
                            handleImageFileSelect(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {imageUploadError && (
                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--rose)', fontWeight: 700 }}>{imageUploadError}</p>
                  )}
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><IndianRupee /></div><b>{t('priceOptionalLabel')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                      placeholder={t('priceLeaveBlankPlaceholder')}
                    />
                  </div>
                </div>

                {type === 'PRODUCT' && (
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Percent /></div><b>{t('offerPercentOptionalLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="number" min="0" max="100" step="1" value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(e.target.value)}
                        placeholder={t('offerPercentPlaceholderEg')}
                      />
                    </div>
                    {price !== '' && discountPercentage !== '' && Number(discountPercentage) > 0 && (
                      <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>
                        {t('offerPriceLabel')}: ₹{Math.round(Number(price) - (Number(price) * Number(discountPercentage)) / 100).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                )}

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('phoneNumberLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('phoneNumberPlaceholderEg')}
                    />
                  </div>
                  <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('tapToCallHint')}</span>
                </div>

                {type === 'PRODUCT' && (
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CalendarRange /></div><b>{t('machineExpiryLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="date" required value={validUntil}
                        min={new Date().toISOString().slice(0, 10)}
                        max={(() => { const d = new Date(); d.setDate(d.getDate() + PRODUCT_MAX_VALIDITY_DAYS); return d.toISOString().slice(0, 10); })()}
                        onChange={(e) => setValidUntil(e.target.value)}
                      />
                    </div>
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('machineExpiryHint')}</span>
                  </div>
                )}
              </div>

              {type === 'OFFER' && (
                <div className="reg-section">

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Percent /></div><b>{t('discountPercentageOptionalLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="number" min="0" max="100" step="1" value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(e.target.value)}
                        placeholder={t('discountPercentagePlaceholderEg')}
                      />
                    </div>
                  </div>

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CalendarRange /></div><b>{t('validUntilOptionalLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                      />
                    </div>
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('validUntilHint')}</span>
                  </div>

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Boxes /></div><b>{t('linkExistingListingLabel')}</b></div>
                    <CustomSelect
                      value={linkedPromotionId} onChange={setLinkedPromotionId}
                      options={[
                        { value: '', label: t('noLinkedListingOption') },
                        ...linkableListingsFiltered.map(p => ({ value: p.id, label: `${p.title} (${p.type === 'AD' ? t('advertisementLabel') : t('productLabel')})` })),
                      ]}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={imageUploading || submitting}
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {editingId ? t('saveChangesBtn') : t('publishListingBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Portaled to escape .animate-fade-in's permanent transform (fill-mode
          forwards) - see ShopsManagementView's identical FAB for why. Without
          this, the button ends up "fixed" relative to that ancestor's box
          instead of the viewport, so it drifts down and overlaps the bottom
          nav as the product grid grows taller. */}
      {createPortal(
        <button
          type="button"
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="fab"
          aria-label={t('newListingBtn')}
          title={t('newListingBtn')}
        >
          <Plus />
        </button>,
        document.body
      )}
    </div>
  );
}

// Dedicated Product Details page for Shop Admin + Super Admin (both share
// PromotionsFeed above via its `isSuperAdmin` prop, so this one component
// covers both surfaces). Read-only - edit/delete stay on the card in the
// list, not duplicated here. Pushed onto PromotionsFeed's `detailStack`;
// tapping a Related Product pushes another level rather than replacing this
// one, so Back steps back through everything visited (see pushDetail/popDetail).
function ProductDetailsView({ promo, t, api, onBack, onOpenRelated }) {
  const [related, setRelated] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!promo.productType) { setRelated([]); return; }
    setLoadingRelated(true);
    api.getPromotions({ category: promo.productType, type: 'PRODUCT', limit: 7 })
      .then((res) => {
        if (cancelled) return;
        const items = (res.items || res || []).filter((p) => p.id !== promo.id).slice(0, 6);
        setRelated(items);
      })
      .catch(() => { if (!cancelled) setRelated([]); })
      .finally(() => { if (!cancelled) setLoadingRelated(false); });
    return () => { cancelled = true; };
  }, [promo.id, promo.productType]);

  // Address/phone aren't real Shop columns - parsed from the same
  // companyDetails JSON blob every other screen already reads (see
  // ShopSettingsView) - CREATOR_INCLUDE now selects it for exactly this.
  let shopAddress = null;
  let shopPhone = null;
  if (promo.shop?.companyDetails) {
    try {
      const details = JSON.parse(promo.shop.companyDetails);
      shopAddress = details.address || null;
      shopPhone = details.phone || null;
    } catch { /* not valid JSON - just omit */ }
  }
  const shopLocation = [promo.shop?.town, promo.shop?.district].filter(Boolean).join(', ');
  const images = [...(promo.imageUrls || []), ...(promo.imageUrls?.length ? [] : [promo.imageUrl])]
    .filter(Boolean)
    .map(cleanGoogleImageUrl);

  return (
    <div className="animate-fade-in">
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}>
        <ArrowLeft className="h-4 w-4" />
        <span>{t('btnBack')}</span>
      </button>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <ImageCarousel images={images} t={t} />

        <div style={{ padding: 18 }}>
          <h1 style={{ fontSize: 19, marginBottom: 6 }}>{promo.title}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {promo.productType && (
              <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <Tag className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} /> {promo.productType}
              </span>
            )}
            {promo.discountPercentage != null && (
              <span className="badge badge-active">
                <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                {promo.discountPercentage}{t('percentOffSuffix')}
              </span>
            )}
          </div>

          <PriceTag price={promo.price} discountPercentage={promo.discountPercentage} offSuffix={t('percentOffSuffix')} />

          {promo.description && (
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>{promo.description}</p>
          )}

          <div className="cell-sub" style={{ fontSize: 11.5, marginTop: 12 }}>
            <Calendar className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
            {new Date(promo.createdAt).toLocaleDateString()}
          </div>

          {/* Shop details block */}
          <div style={{ marginTop: 18, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {t('shopLabel')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, marginBottom: shopLocation || shopAddress || shopPhone ? 6 : 0 }}>
              <Store className="h-3.5 w-3.5" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
              <span>{promo.shop?.name || t('superAdminIndependentLabel')}</span>
            </div>
            {shopLocation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 4 }}>
                <MapPin className="h-3.5 w-3.5" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
                <span>{shopAddress ? `${shopAddress} · ${shopLocation}` : shopLocation}</span>
              </div>
            )}
            {shopPhone && (
              <a href={`tel:${shopPhone}`} className="btn btn-primary btn-sm btn-block" style={{ marginTop: 10 }}>
                <Phone className="h-3.5 w-3.5" />
                <span>{t('callPrefix')} {shopPhone}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Related Products */}
      {(loadingRelated || related.length > 0) && (
        <div style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>{t('relatedProductsTitle', 'Related Products')}</h2>
          {loadingRelated ? (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : (
            <div className="product-grid stagger-in">
              {related.map((rp) => (
                <div key={rp.id} className="pub-card" style={{ cursor: 'pointer' }} onClick={() => onOpenRelated(rp)}>
                  <div className="pub-card-media">
                    {rp.imageUrl ? (
                      <img src={cleanGoogleImageUrl(rp.imageUrl)} alt={rp.title} loading="lazy" />
                    ) : (
                      <div className="icon-badge teal"><Package /></div>
                    )}
                  </div>
                  <div className="pub-card-body">
                    <div className="pub-card-title">{rp.title}</div>
                    <div className="pub-card-meta"><Store className="h-3 w-3" /><span>{rp.shop?.name || t('superAdminIndependentLabel')}</span></div>
                    <PriceTag price={rp.price} discountPercentage={rp.discountPercentage} offSuffix={t('percentOffSuffix')} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PromotionsView;
