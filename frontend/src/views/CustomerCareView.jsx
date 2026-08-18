import React, { useState, useEffect } from 'react';
import { supportConfigCache } from '../utils/supportConfigCache';
import { RefreshCw, Phone, Radio, PlayCircle } from 'lucide-react';

// ============================================================================
// COMPONENT 11.5: CUSTOMER CARE VIEW (SUPPORT & SKILLS TRAINING)
// ============================================================================
function CustomerCareView({ t, api }) {
  const [config, setConfig] = useState(supportConfigCache.current);
  const [loading, setLoading] = useState(!supportConfigCache.current);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await api.getSupportConfig();
      setConfig(res);
      supportConfigCache.current = res;
    } catch (e) {
      console.error('Failed to load support config:', e);
    } finally {
      setLoading(false);
    }
  };

  const getYoutubeThumbnailAndId = (url) => {
    if (!url) return { id: null, thumbnail: 'https://images.unsplash.com/photo-1619542402915-dcaf30e4e2a1?w=300&q=80' };
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    return {
      id: videoId,
      thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : 'https://images.unsplash.com/photo-1619542402915-dcaf30e4e2a1?w=300&q=80'
    };
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingSupportResourcesMsg')}</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Phone /> {t('customerCare')}</div>
          <h1>{t('supportTrainingCenterTitle')}</h1>
          <p>{t('reachSupportTrainingDesc')}</p>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>
          <div className="flex items-center gap-3">
            <div className="icon-badge teal" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <Radio style={{ width: 16, height: 16 }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16 }}>{t('locksmithSkillUpgradesTitle')}</h2>
              <span className="sub">{t('videoTutorialsFromExpertsDesc')}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
          {config?.videos && config.videos.length > 0 ? (
            config.videos.map((vid, idx) => {
              const { thumbnail } = getYoutubeThumbnailAndId(vid.url);
              const badgeColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
              const badgeColor = badgeColors[idx % badgeColors.length];
              return (
                <div key={idx} className="product-card" style={{ borderRadius: 14 }}>
                  <div className="product-img" style={{ height: 92 }}>
                    <img src={thumbnail} alt={vid.name} className="w-full h-full object-cover" style={{ position: 'absolute', inset: 0, opacity: .6 }} />
                    <a
                      href={vid.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center"
                      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
                    >
                      <span className={`icon-badge ${badgeColor} animate-pulse`} style={{ width: 32, height: 32, borderRadius: 999 }}>
                        <PlayCircle style={{ width: 18, height: 18 }} />
                      </span>
                    </a>
                  </div>
                  <div className="product-body" style={{ padding: 12, gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.05em' }}>{t('trainingMaterialLabel')}</span>
                    <h4 className="pname" style={{ fontSize: 12.5 }}>{vid.name}</h4>
                    <a href={vid.url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }} className="hover:underline truncate block">{t('watchLinkLabel')}</a>
                  </div>
                </div>
              );
            })
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic', gridColumn: '1 / -1', padding: '32px 0', textAlign: 'center' }}>
              {t('noSkillUpgradeVideosMsg')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerCareView;
