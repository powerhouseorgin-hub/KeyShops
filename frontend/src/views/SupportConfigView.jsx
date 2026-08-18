import React, { useState, useEffect } from 'react';
import {
  Check, Plus, Trash, RefreshCw, Layers, Edit, ExternalLink, Mail, Phone,
  IndianRupee, User, Tag, Percent, PlayCircle, MessageCircle, LifeBuoy, GripVertical,
} from 'lucide-react';

export function SupportConfigView({ t, api }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [customerCareNumber, setCustomerCareNumber] = useState('');
  const [videos, setVideos] = useState([]);
  const [subscriptionPrice, setSubscriptionPrice] = useState(999);
  const [gstPercent, setGstPercent] = useState(18);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Shop Categories management - the Super-Admin-curated list of shop
  // "types" (e.g. Dealers) that populates the Category dropdown on the
  // public self-registration wizard. Kept independent from the
  // whatsapp/videos form above: its own fetch, its own save-per-action.
  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');
  // Drag-and-drop reordering (native HTML5 DnD - this screen is Super
  // Admin-only and used from the web console, so no touch-drag polyfill is
  // needed). `draggedId` tracks which row is mid-drag; `savingOrder` blocks
  // further drags while the reorder request is in flight.
  const [draggedCatId, setDraggedCatId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingCatId, setSavingCatId] = useState(null);

  // Product Types management - the Super-Admin-curated list of Inventory
  // "product types" (e.g. Key Cutting Machines) that populates the Product
  // Type dropdown on the Inventory Product Creation form. Mirrors the Shop
  // Categories block above: its own fetch, its own save-per-action.
  const [productTypes, setProductTypes] = useState([]);
  const [ptLoading, setPtLoading] = useState(true);
  const [newProductTypeName, setNewProductTypeName] = useState('');
  const [addingProductType, setAddingProductType] = useState(false);
  const [editingPtId, setEditingPtId] = useState(null);
  const [editingPtName, setEditingPtName] = useState('');
  const [savingPtId, setSavingPtId] = useState(null);

  useEffect(() => {
    fetchConfig();
    fetchCategories();
    fetchProductTypes();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await api.getSupportConfig();
      setWhatsapp(res.whatsapp || '');
      setEmail(res.email || '');
      setCustomerCareNumber(res.customerCareNumber || '');
      setVideos(res.videos || []);
      setSubscriptionPrice(res.subscriptionPrice ?? 999);
      setGstPercent(res.gstPercent ?? 18);
    } catch (e) {
      console.error('Failed to load support config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSupportConfig({ whatsapp, videos, email, customerCareNumber, subscriptionPrice: Number(subscriptionPrice), gstPercent: Number(gstPercent) });
      alert(t('supportConfigUpdatedMsg'));
    } catch (e) {
      alert(t('saveFailedTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.getShopCategories();
      setCategories(res || []);
    } catch (e) {
      console.error('Failed to load shop categories:', e);
    } finally {
      setCatLoading(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert(t('pleaseEnterCategoryNameMsg'));
      return;
    }
    setAddingCategory(true);
    try {
      await api.createShopCategory(name);
      setNewCategoryName('');
      await fetchCategories();
    } catch (e) {
      alert(t('failedAddCategoryTemplate').split('{msg}')[0] + e.message);
    } finally {
      setAddingCategory(false);
    }
  };

  const handleStartEditCategory = (cat) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
  };

  const handleSaveEditCategory = async (id) => {
    const name = editingCatName.trim();
    if (!name) {
      alert(t('pleaseEnterCategoryNameMsg'));
      return;
    }
    setSavingCatId(id);
    try {
      await api.updateShopCategory(id, name);
      setEditingCatId(null);
      await fetchCategories();
    } catch (e) {
      alert(t('failedUpdateCategoryTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingCatId(null);
    }
  };

  const handleDeleteCategory = async (cat) => {
    const [confirmPre, confirmPost] = t('deleteCategoryConfirmTemplate').split('{name}');
    if (!confirm(confirmPre + cat.name + confirmPost)) return;
    setSavingCatId(cat.id);
    try {
      await api.deleteShopCategory(cat.id);
      await fetchCategories();
    } catch (e) {
      alert(t('failedDeleteCategoryTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingCatId(null);
    }
  };

  // Drag-and-drop reordering for the Shop Categories list - this is the
  // order shown in the public self-registration wizard's Category dropdown
  // (see ShopCategoryService.getAllCategories), so dragging here directly
  // controls what shop owners see. Reorders the local list immediately for
  // a responsive drag, then persists it; on failure, re-fetches the real
  // order from the server instead of leaving the UI showing a state that
  // was never actually saved.
  const handleCategoryDragStart = (catId) => {
    if (editingCatId || savingOrder) return;
    setDraggedCatId(catId);
  };

  const handleCategoryDragOver = (e, overCatId) => {
    e.preventDefault();
    if (!draggedCatId || draggedCatId === overCatId) return;
    setCategories((prev) => {
      const fromIndex = prev.findIndex((c) => c.id === draggedCatId);
      const toIndex = prev.findIndex((c) => c.id === overCatId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleCategoryDrop = async () => {
    const orderedIds = categories.map((c) => c.id);
    setDraggedCatId(null);
    setSavingOrder(true);
    try {
      await api.reorderShopCategories(orderedIds);
    } catch (e) {
      alert(t('failedReorderCategoriesTemplate').split('{msg}')[0] + e.message);
      await fetchCategories();
    } finally {
      setSavingOrder(false);
    }
  };

  const fetchProductTypes = async () => {
    try {
      const res = await api.getProductTypes();
      setProductTypes(res || []);
    } catch (e) {
      console.error('Failed to load product types:', e);
    } finally {
      setPtLoading(false);
    }
  };

  const handleAddProductType = async () => {
    const name = newProductTypeName.trim();
    if (!name) {
      alert(t('pleaseEnterProductTypeNameMsg'));
      return;
    }
    setAddingProductType(true);
    try {
      await api.createProductType(name);
      setNewProductTypeName('');
      await fetchProductTypes();
    } catch (e) {
      alert(t('failedAddProductTypeTemplate').split('{msg}')[0] + e.message);
    } finally {
      setAddingProductType(false);
    }
  };

  const handleStartEditProductType = (pt) => {
    setEditingPtId(pt.id);
    setEditingPtName(pt.name);
  };

  const handleSaveEditProductType = async (id) => {
    const name = editingPtName.trim();
    if (!name) {
      alert(t('pleaseEnterProductTypeNameMsg'));
      return;
    }
    setSavingPtId(id);
    try {
      await api.updateProductType(id, name);
      setEditingPtId(null);
      await fetchProductTypes();
    } catch (e) {
      alert(t('failedUpdateProductTypeTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingPtId(null);
    }
  };

  const handleDeleteProductType = async (pt) => {
    const [confirmPre, confirmPost] = t('deleteProductTypeConfirmTemplate').split('{name}');
    if (!confirm(confirmPre + pt.name + confirmPost)) return;
    setSavingPtId(pt.id);
    try {
      await api.deleteProductType(pt.id);
      await fetchProductTypes();
    } catch (e) {
      alert(t('failedDeleteProductTypeTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingPtId(null);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingSupportConfigMsg')}</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><LifeBuoy /> {t('platformSupportEyebrow')}</div>
          <h1>{t('customerSupportConfigTitle')}</h1>
          <p>{t('configureGlobalSupportDesc')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSave}>
          <div className="reg-section">
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><MessageCircle /></div><b>{t('customerSupportWhatsappLabel')} <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="text" required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder={t('whatsappNumberPlaceholderEg')}
                />
              </div>
            </div>
          </div>

          <div className="reg-section">
            <div className="reg-field">
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><IndianRupee /></div><b>{t('subscriptionPriceLabel')} <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="number" required min="0" step="0.01" value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(e.target.value)}
                  placeholder={t('subscriptionPricePlaceholderEg')}
                />
              </div>
              <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('subscriptionPriceHint')}</span>
            </div>
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Percent /></div><b>{t('gstPercentLabel')} <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="number" required min="0" max="100" step="0.01" value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
                  placeholder="18"
                />
              </div>
              <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('gstPercentHint')}</span>
            </div>
          </div>

          <div className="reg-section">
            <div className="reg-section-head">
              <div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div>
              <h3>{t('ownerContactSectionTitle')}</h3>
              <span className="sub" style={{ marginLeft: 'auto' }}>{t('ownerContactSectionDesc')}</span>
            </div>
            <div className="reg-field">
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Mail /></div><b>{t('emailAddressLabel')}</b></div>
              <div className="input-wrap">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('supportConfigEmailPlaceholderEg')}
                />
              </div>
            </div>
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Phone /></div><b>{t('customerCareNumberLabel')}</b></div>
              <div className="input-wrap">
                <input
                  type="text" value={customerCareNumber} onChange={(e) => setCustomerCareNumber(e.target.value)}
                  placeholder={t('customerCareNumberPlaceholderEg')}
                />
              </div>
            </div>
          </div>

          <div className="reg-section" style={{ marginBottom: 0 }}>
            <div className="reg-section-head" style={{ justifyContent: 'flex-end' }}>
              <span className="sub" style={{ marginRight: 10 }}>{videos.length} {videos.length === 1 ? t('videoSingularLabel') : t('videoPluralLabel')}</span>
              <button
                type="button"
                onClick={() => setVideos([...videos, { name: '', url: '' }])}
                className="btn btn-outline btn-sm"
              >
                <Plus /> {t('addVideoBtn')}
              </button>
            </div>

            {videos.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
                {t('noVideosConfiguredMsg')}
              </p>
            ) : (
              <div className="space-y-3" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4, paddingTop: 2 }}>
                {videos.map((vid, idx) => {
                  const rowColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                  const rowColor = rowColors[idx % rowColors.length];
                  return (
                    <div key={idx} style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 16, position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setVideos(videos.filter((_, i) => i !== idx))}
                        className="icon-btn"
                        style={{ position: 'absolute', top: 12, right: 12, color: 'var(--red)' }}
                        title={t('removeVideoTitle')}
                      >
                        <X />
                      </button>
                      <div className="form-grid" style={{ paddingRight: 36 }}>
                        <div className="reg-field" style={{ marginBottom: 0 }}>
                          <div className="reg-field-label"><div className="reg-ico" style={{ background: `var(--${rowColor})` }}><PlayCircle /></div><b>{t('videoTitleNameLabel')}</b></div>
                          <div className="input-wrap">
                            <input
                              type="text" required value={vid.name}
                              onChange={(e) => {
                                const newVids = [...videos];
                                newVids[idx].name = e.target.value;
                                setVideos(newVids);
                              }}
                              placeholder={t('videoTitlePlaceholderEg')}
                            />
                          </div>
                        </div>
                        <div className="reg-field" style={{ marginBottom: 0 }}>
                          <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><ExternalLink /></div><b>{t('youtubeUrlLabel')}</b></div>
                          <div className="input-wrap">
                            <input
                              type="url" required value={vid.url}
                              onChange={(e) => {
                                const newVids = [...videos];
                                newVids[idx].url = e.target.value;
                                setVideos(newVids);
                              }}
                              placeholder="https://www.youtube.com/watch?v=..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="form-action-bar flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20, marginBottom: 8 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? <RefreshCw className="animate-spin" /> : <Check />}
              <span>{t('saveConfigurationBtn')}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="reg-section" style={{ marginBottom: 0 }}>
          <div className="reg-section-head">
            <div className="reg-ico" style={{ background: 'var(--purple)' }}><Tag /></div>
            <h3>{t('shopCategoriesTitle')}</h3>
            <span className="sub" style={{ marginLeft: 'auto' }}>{categories.length} {categories.length === 1 ? t('categorySingularLabel') : t('categoryPluralLabel')}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            {t('manageShopCategoriesDesc')}
          </p>

          <div className="reg-field" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-wrap" style={{ flex: 1 }}>
                <input
                  type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t('enterCategoryNamePlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                />
              </div>
              <button type="button" onClick={handleAddCategory} disabled={addingCategory} className="btn btn-outline btn-sm">
                {addingCategory ? <RefreshCw className="animate-spin" /> : <Plus />} {t('addBtnLabel')}
              </button>
            </div>
          </div>

          {catLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : categories.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              {t('noCategoriesYetMsg')}
            </p>
          ) : (
            <div className="space-y-3" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  draggable={!editingCatId && !savingOrder}
                  onDragStart={() => handleCategoryDragStart(cat.id)}
                  onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
                  onDrop={handleCategoryDrop}
                  onDragEnd={() => setDraggedCatId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-2)',
                    border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', marginBottom: 8,
                    opacity: draggedCatId === cat.id ? 0.4 : 1,
                    cursor: !editingCatId && !savingOrder ? 'grab' : 'default',
                  }}
                >
                  {editingCatId === cat.id ? (
                    <>
                      <input
                        type="text" value={editingCatName} onChange={(e) => setEditingCatName(e.target.value)}
                        style={{ flex: 1 }} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditCategory(cat.id); } }}
                      />
                      <button type="button" onClick={() => handleSaveEditCategory(cat.id)} disabled={savingCatId === cat.id} className="icon-btn" title={t('btnSave')} style={{ color: 'var(--jgreen)' }}>
                        {savingCatId === cat.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingCatId(null)} className="icon-btn" title={t('btnCancel')}>
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <GripVertical style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <Tag style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{cat.name}</span>
                      <button type="button" onClick={() => handleStartEditCategory(cat)} className="icon-btn" title={t('btnEdit')}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteCategory(cat)} disabled={savingCatId === cat.id}
                        className="icon-btn" style={{ color: 'var(--red)' }} title={t('btnDelete')}
                      >
                        {savingCatId === cat.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="reg-section" style={{ marginBottom: 0 }}>
          <div className="reg-section-head">
            <div className="reg-ico" style={{ background: 'var(--blue)' }}><Layers /></div>
            <h3>{t('productTypesTitle')}</h3>
            <span className="sub" style={{ marginLeft: 'auto' }}>{productTypes.length} {productTypes.length === 1 ? t('typeSingularLabel') : t('typePluralLabel')}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            {t('manageProductTypesDesc')}
          </p>

          <div className="reg-field" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-wrap" style={{ flex: 1 }}>
                <input
                  type="text" value={newProductTypeName} onChange={(e) => setNewProductTypeName(e.target.value)}
                  placeholder={t('enterProductTypePlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddProductType(); } }}
                />
              </div>
              <button type="button" onClick={handleAddProductType} disabled={addingProductType} className="btn btn-outline btn-sm">
                {addingProductType ? <RefreshCw className="animate-spin" /> : <Plus />} {t('addBtnLabel')}
              </button>
            </div>
          </div>

          {ptLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : productTypes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              {t('noProductTypesYetMsg')}
            </p>
          ) : (
            <div className="space-y-3" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
              {productTypes.map((pt) => (
                <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
                  {editingPtId === pt.id ? (
                    <>
                      <input
                        type="text" value={editingPtName} onChange={(e) => setEditingPtName(e.target.value)}
                        style={{ flex: 1 }} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditProductType(pt.id); } }}
                      />
                      <button type="button" onClick={() => handleSaveEditProductType(pt.id)} disabled={savingPtId === pt.id} className="icon-btn" title={t('btnSave')} style={{ color: 'var(--jgreen)' }}>
                        {savingPtId === pt.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingPtId(null)} className="icon-btn" title={t('btnCancel')}>
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Layers style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{pt.name}</span>
                      <button type="button" onClick={() => handleStartEditProductType(pt)} className="icon-btn" title={t('btnEdit')}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteProductType(pt)} disabled={savingPtId === pt.id}
                        className="icon-btn" style={{ color: 'var(--red)' }} title={t('btnDelete')}
                      >
                        {savingPtId === pt.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

export default SupportConfigView;
