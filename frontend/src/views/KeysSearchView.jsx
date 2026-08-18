import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAssetUrl } from '../apiConfig';
import { keyTypeDisplayLabel } from '../utils/keyType';
import {
  Search, RefreshCw, KeyRound, ExternalLink, User, Phone, Car, Calendar, MapPin, Camera,
  X,
} from 'lucide-react';

// ============================================================================
// COMPONENT 8: BLANK KEY SEARCH (SHOP ADMIN ONLY)
// ============================================================================
function KeysSearchView({ t, api, searchDispatch }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  // Bumped on every search fired; a response is only applied if it's still
  // the most recent one requested. Without this, a slower response for an
  // earlier keystroke (e.g. "hon") can resolve after a faster response for a
  // later one (e.g. "honda") and overwrite the list with stale results while
  // the search box already shows the newer query.
  const searchTokenRef = useRef(0);

  // Debounced (350ms, matching the dashboard's global search) so typing a
  // query doesn't fire a fresh fetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Picks up a query dispatched from the global header search panel (filter = "Key").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'key') {
      setQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  const performSearch = async () => {
    const token = ++searchTokenRef.current;
    setLoading(true);
    try {
      // Every result is a customer registration with a key code, scoped to
      // this shop admin's own shop server-side (see
      // AuthContext.getShopKeysCatalogue / CustomerController's keysOnly
      // param) - there's no separate "key blank with no customer" concept
      // to cross-reference anymore, so this is a single direct fetch.
      const res = await api.getShopKeysCatalogue({ search: query });
      if (token !== searchTokenRef.current) return;
      setResults(res);
    } catch (e) {
      if (token !== searchTokenRef.current) return;
      console.error(e);
      setResults([]);
    } finally {
      if (token === searchTokenRef.current) setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Search /> {t('duplicateKeyLookupLabel')}</div>
          <h1>{t('masterKeyCatalogSearchTitle')}</h1>
          <p>{t('lookupBlankSpecDesc')}</p>
        </div>
      </div>

      <div className="reg-section" style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div className="reg-field" style={{ marginBottom: 0 }}>
          <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Search /></div><b>{t('keyCodeVehicleCategoryLabel')}</b></div>
          <div className="search-box" style={{ width: '100%', minWidth: 0, background: 'var(--card-2)' }}>
            <Search />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchByKeyCodePlaceholder')}
              style={{ fontSize: 14, minWidth: 0 }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('searchingRegistryMsg')}</span>
        </div>
      ) : results.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge rose"><KeyRound /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noMatchingKeysMsg')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {results.map((c) => {
            const typeLabel = keyTypeDisplayLabel(t, c.vehicleCategory);
            return (
              <div
                key={c.id} onClick={() => setSelectedResult(c)}
                className="product-card"
                style={{ cursor: 'pointer' }}
              >
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
                  <div className="product-foot" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)' }}>{t('viewFullDetailsLabel')}</span>
                    <ExternalLink style={{ width: 13, height: 13, color: 'var(--gold)' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details View Modal - read-only, no edit action */}
      {selectedResult && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><KeyRound /> {t('keyDetailsLabel')}</span>
                <h2 style={{ fontSize: 19 }}>{selectedResult.keyNumber}</h2>
              </div>
              <button onClick={() => setSelectedResult(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section" style={{ marginBottom: 0 }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('customerNameLabel')}</b></div>
                  <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.name}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Phone /></div><b>{t('phoneNumberLabel')}</b></div>
                  <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.phone}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>{t('vehicleNumberLabel')}</b></div>
                  <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.vehicleNumber || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: 12.5 }}>{new Date(selectedResult.createdAt).toLocaleDateString()}</span>
                </div>
                {keyTypeDisplayLabel(t, selectedResult.vehicleCategory) && (
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><KeyRound /></div><b>{t('keyTypeLabel')}</b></div>
                    <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{keyTypeDisplayLabel(t, selectedResult.vehicleCategory)}</span>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 14, borderRadius: 14, marginTop: 4 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`icon-badge ${selectedResult.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                      <MapPin style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{t('gpsCoordinatesLabel')}</p>
                      {selectedResult.latitude && selectedResult.longitude ? (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>{t('latLongTemplate').split('{lat}')[0]}{selectedResult.latitude}{t('latLongTemplate').split('{lat}')[1].split('{long}')[0]}{selectedResult.longitude}</p>
                      ) : (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>{t('notCapturedLabel')}</p>
                      )}
                    </div>
                  </div>
                  {selectedResult.mapsLink && (
                    <a href={selectedResult.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                      <span>{t('googleMapsLabel')}</span><ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {selectedResult.capturedAddress && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t('capturedAddressLabel')}</span>
                    <span>{selectedResult.capturedAddress}</span>
                  </div>
                )}
              </div>

              <div className="reg-field" style={{ marginTop: 13, marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Camera /></div><b>{t('webcamSnapshotLabel')}</b></div>
                {selectedResult.photoUrl ? (
                  <div style={{ width: '100%', height: 96, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                    <img src={getAssetUrl(selectedResult.photoUrl)} alt="Customer" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 96, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                    <Camera style={{ width: 16, height: 16, color: 'var(--text-3)' }} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <button onClick={() => setSelectedResult(null)} className="btn btn-ghost">
                {t('closeDetailsBtn')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default KeysSearchView;
