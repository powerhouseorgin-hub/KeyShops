import React, { useState, useEffect } from 'react';
import { supportConfigCache } from '../utils/supportConfigCache';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import {
  RefreshCw, Phone, MessageCircle, Mail, Headset, ChevronRight, Building2,
} from 'lucide-react';

// ============================================================================
// COMPONENT 11.55: SUPPORT CONTACT VIEW (SHOP ADMIN - OWNER CONTACT DETAILS)
// ============================================================================
// Reached via the mobile bottom-nav "Customer Service" icon for Shop Admins.
// Shows the Super-Admin-managed support contact details (customer care
// number, WhatsApp, email) - distinct from CustomerCareView above, which
// only shows training videos.
function SupportContactView({ t, api }) {
  const [config, setConfig] = useState(supportConfigCache.current);
  const [loading, setLoading] = useState(!supportConfigCache.current);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSupportConfig();
        setConfig(res);
        supportConfigCache.current = res;
      } catch (e) {
        console.error('Failed to load support config:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingSupportResourcesMsg')}</span>
      </div>
    );
  }

  const hasContactInfo = !!(config?.customerCareNumber || config?.whatsapp || config?.email);
  // Plain tel:/https:wa.me/mailto: links - Capacitor's default WebViewClient
  // hands non-http(s) schemes off to a system ACTION_VIEW intent (dialer,
  // WhatsApp) inside the native app, and the browser does the equivalent on
  // web, so no extra native plugin/JS is needed (same pattern already used
  // for dealer phone/WhatsApp buttons elsewhere in this file).
  const rows = [
    { icon: Phone, color: 'maroon', label: t('customerCareNumberLabel'), value: config?.customerCareNumber, href: config?.customerCareNumber ? `tel:${config.customerCareNumber}` : null },
    { icon: MessageCircle, color: 'jgreen', label: t('whatsappNumberLabel'), value: config?.whatsapp, href: config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}` : null, external: true },
    { icon: Mail, color: 'purple', label: t('emailAddressLabel'), value: config?.email, href: config?.email ? `mailto:${config.email}` : null },
  ].filter(r => r.value);

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Headset /> {t('supportContactEyebrow')}</div>
          <h1>{t('supportContactTitle')}</h1>
          <p>{t('supportContactDesc')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        {hasContactInfo ? (
          <div className="space-y-3">
            {rows.map((r, idx) => (
              <a
                key={idx}
                href={r.href}
                {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="loc-box"
                style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <div className="loc-info">
                  <div className={`icon-badge ${r.color}`}><r.icon /></div>
                  <div className="loc-text">
                    <span className="t1" style={{ display: 'block' }}>{r.value}</span>
                    <span className="t2">{r.label}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </a>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic', padding: '32px 0', textAlign: 'center' }}>
            {t('noContactInfoConfiguredMsg')}
          </p>
        )}
      </div>

      <CompanyDetailsCard t={t} />
    </div>
  );
}

// Static company information shown on the Customer Service / Contact
// screens (both authenticated Shop Admin and pre-login public app) - no
// backend config for this, it's fixed business identity text. Split into
// two labeled lines (Company / Address) with the brand logo alongside,
// matching the reference layout the user provided.
export function CompanyDetailsCard({ t }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 16 }}>
      <div className="section-title" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-3">
          <div className="icon-badge blue" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Building2 style={{ width: 16, height: 16 }} />
          </div>
          <div>
            <h2 style={{ fontSize: 15 }}>{t('companyDetailsTitle')}</h2>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t('companyLabel')}</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{t('companySentence')}</p>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t('addressLabel')}</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{t('addressSentence')}</p>
          </div>
        </div>
        <img src={keyShopLogo} alt="Key Shops" style={{ width: 120, height: 120, objectFit: 'contain', flexShrink: 0 }} />
      </div>
    </div>
  );
}

export default SupportContactView;
