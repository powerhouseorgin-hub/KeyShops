import React, { useEffect, useRef, useState } from 'react';
import {
  Key, ArrowRight, Search, MapPin, Phone, Mail, ShieldCheck, Users,
  Package, BarChart3, Building2, Sparkles, CheckCircle2, Menu, X,
  RefreshCw, Clock, Store, Star, Send, Download, Tag, MessageCircle, Globe,
  Trash2, Languages,
} from 'lucide-react';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
// Nav/footer only ever render this at .brand-logo's 44px CSS height (~81px
// wide) - a separate, much smaller source keeps that request tiny instead of
// shipping the same 680px file used by the 340px-wide hero image.
import keyShopLogoSm from '../assets/branding/keyshop-logo-sm.png';

// Static Android APK, copied into public/downloads at build time (see
// frontend/public/downloads/keyshop-app.keeapp) so Vite/Firebase Hosting
// serves it as a plain static file - no backend involvement needed. Shop
// Admins are web-login-restricted (see AuthContext/auth.service.ts), so
// this is how they're expected to get the app.
//
// The file is deployed under a .keeapp extension (not .apk) because
// Firebase Hosting's free Spark plan rejects executable file extensions,
// including .apk, at deploy time. `firebase.json` sets the right
// Content-Type/Content-Disposition, and the `download` attribute below
// forces the browser to save it as "KeyShop.apk" regardless.
const APK_DOWNLOAD_URL = '/downloads/keyshop-app.keeapp';
const APK_DOWNLOAD_FILENAME = 'KeyShop.apk';

/* -------------------------------------------------------------------------
 * Public marketing site shown to anonymous visitors (Home / Search / About /
 * Contact). Rendered from App.jsx whenever !isAuthenticated && publicPage
 * !== 'login'. The existing login-shell UI is left completely untouched -
 * this component only owns the pages *before* someone clicks "Login".
 * ---------------------------------------------------------------------- */

// Fades + slides a section in once it scrolls into view. Reusable wrapper so
// every section on every public page gets the same scroll-reveal treatment
// without repeating IntersectionObserver boilerplate.
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

// Counts up from 0 to `end` once the element scrolls into view (reuses the
// same IntersectionObserver-on-mount pattern as Reveal above, but drives a
// number instead of a CSS class). Respects prefers-reduced-motion by jumping
// straight to the final value instead of animating.
function CountUp({ end, suffix = '', duration = 1400 }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          io.disconnect();

          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setValue(end);
            return;
          }

          const startTime = performance.now();
          const tick = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setValue(Math.round(end * eased));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{value}{suffix}</span>;
}

// Real production origin - the custom domain connected to Firebase Hosting
// (keee-7d6cb.web.app/.firebaseapp.com serve the exact same content and
// still work, but this is what's registered in Google Search Console, so
// every canonical/sitemap/OG URL must match it or Google's sitemap
// validator rejects cross-domain <loc> entries). Matches robots.txt and
// sitemap.xml - keep those in sync if this ever changes.
const PUBLIC_BASE_URL = 'https://keyshops.in';

// Per-page <title>/description/canonical - previously the whole public site
// shared one static <title> from index.html regardless of which tab was
// showing, and had no meta description at all, so Search Console had no way
// to tell Home/Search/About/Contact apart or show a real snippet for any of
// them. Paths must match PUBLIC_PATH_BY_PAGE in App.jsx.
const PAGE_META = {
  home: {
    title: 'Key Shop - Duplicate Keys Near Me | Car, Bike & Home Keys',
    description: 'KeyShops.in connects you with verified key shops for duplicate keys, key replacement & lost key services. Find car keys, bike keys, home keys near you across Tamil Nadu, Karnataka & Telangana.',
    path: '/',
  },
  search: {
    title: 'Find a Key Shop Near You | Key Shops',
    description: 'Search duplicate-key shops on Key Shops by name, city/locality or category to find a trusted key specialist near you.',
    path: '/search',
  },
  about: {
    title: 'About Key Shops | Software Built for Key Specialists',
    description: 'Key Shops started with one observation: duplicate-key shops deserved better than paper registers. Learn about our mission to modernize Indian key shops.',
    path: '/about',
  },
  contact: {
    title: 'Contact Key Shops | Get in Touch',
    description: 'Questions about Key Shops, a demo request, or support for an existing shop - reach out by email, phone, WhatsApp or the form below.',
    path: '/contact',
  },
  privacy: {
    title: 'Privacy Policy | Key Shops',
    description: 'How Key Shops collects, uses, stores and protects data for shop accounts, customer records and the Key Shops mobile app.',
    path: '/privacy-policy',
  },
  deleteAccount: {
    title: 'Delete Your Account | Key Shops',
    description: 'How to request deletion of your Key Shops account and what happens to your data.',
    path: '/delete-account-request',
  },
};

function PublicNav({ page, onNavigate, t }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { key: 'home', label: t('navHome') },
    { key: 'search', label: t('navFindShop') },
    { key: 'about', label: t('navAbout') },
    { key: 'contact', label: t('navContact') },
  ];

  const go = (key) => {
    setMobileOpen(false);
    onNavigate(key);
  };

  return (
    <div className="public-nav">
      <div className="public-nav-inner">
        <button type="button" className="brand" onClick={() => go('home')} style={{ background: 'none', border: 'none' }}>
          <img src={keyShopLogoSm} alt="Key Shop" className="brand-logo" width={170} height={92} />
        </button>

        <div className="public-navtabs">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={page === item.key ? 'active' : ''}
              onClick={() => go(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="public-nav-actions">
          <a href={APK_DOWNLOAD_URL} download={APK_DOWNLOAD_FILENAME} className="btn btn-outline btn-sm">
            <Download className="h-4 w-4" /> {t('navDownloadApp')}
          </a>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go('login')}>
            {t('navLogin')} <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="public-nav-burger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? t('navCloseMenu') : t('navOpenMenu')}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="public-nav-mobile animate-fade-in">
          {navItems.map((item) => (
            <button key={item.key} type="button" className={page === item.key ? 'active' : ''} onClick={() => go(item.key)}>
              {item.label}
            </button>
          ))}
          <a href={APK_DOWNLOAD_URL} download={APK_DOWNLOAD_FILENAME} className="btn btn-outline btn-block">
            <Download className="h-4 w-4" /> {t('navDownloadApp')}
          </a>
          <button type="button" className="btn btn-primary btn-block" onClick={() => go('login')}>
            {t('navLogin')} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PublicFooter({ onNavigate, t }) {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <div className="brand" style={{ marginBottom: 14 }}>
            <img src={keyShopLogoSm} alt="Key Shop" className="brand-logo" width={170} height={92} />
          </div>
          <p style={{ color: '#E9D9D9', fontSize: 13.5, fontWeight: 600, maxWidth: 320, lineHeight: 1.6 }}>
            {t('footerTagline')}
          </p>
        </div>
        <div className="public-footer-link-cols">
          <div className="public-footer-links">
            <span className="public-footer-heading">{t('footerExploreHeading')}</span>
            <button type="button" onClick={() => onNavigate('home')}>{t('navHome')}</button>
            <button type="button" onClick={() => onNavigate('search')}>{t('navFindShop')}</button>
            <button type="button" onClick={() => onNavigate('about')}>{t('navAbout')}</button>
            <button type="button" onClick={() => onNavigate('contact')}>{t('navContact')}</button>
          </div>
          <div className="public-footer-links">
            <span className="public-footer-heading">{t('footerGetInTouchHeading')}</span>
            <span className="public-footer-static"><Mail className="h-3.5 w-3.5" /> keyshops666@gmail.com</span>
            <span className="public-footer-static"><Phone className="h-3.5 w-3.5" /> +91 90250 88853</span>
            <span className="public-footer-static"><MapPin className="h-3.5 w-3.5" /> {t('footerAddress')}</span>
          </div>
        </div>
      </div>
      <div className="public-footer-bottom">
        &copy; {new Date().getFullYear()} {t('footerRightsReserved')}
        {' '}&middot;{' '}
        <button type="button" className="public-footer-legal-link" onClick={() => onNavigate('privacy')}>{t('privacyPolicyLinkLabel')}</button>
        {' '}&middot;{' '}
        <button type="button" className="public-footer-legal-link" onClick={() => onNavigate('deleteAccount')}>{t('deleteAccountLinkLabel')}</button>
      </div>
    </footer>
  );
}

function HomePage({ onNavigate, t }) {
  const features = [
    { icon: Users, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: Key, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: Package, title: t('feature3Title'), desc: t('feature3Desc') },
    { icon: BarChart3, title: t('feature4Title'), desc: t('feature4Desc') },
    { icon: Building2, title: t('feature5Title'), desc: t('feature5Desc') },
    { icon: ShieldCheck, title: t('feature6Title'), desc: t('feature6Desc') },
  ];

  const steps = [
    { n: '01', title: t('step1Title'), desc: t('step1Desc') },
    { n: '02', title: t('step2Title'), desc: t('step2Desc') },
    { n: '03', title: t('step3Title'), desc: t('step3Desc') },
  ];

  return (
    <>
      <section className="public-hero">
        <div className="public-hero-panel">
          <div className="public-hero-panel-text">
            {/* No trust-badge here by design - removed per request; the
                stats row below (onboarded shops/keys/cities) already carries
                the same "trusted at scale" signal. */}
            <Reveal>
              <h1 className="public-hero-title">
                {t('heroTitleLine1')}
                <span className="gold-line"> {t('heroTitleLine2')}</span>
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="public-hero-lead">
                {t('heroLead')}
              </p>
            </Reveal>
            <Reveal delay={160}>
              <div className="public-hero-ctas">
                <button type="button" className="btn btn-primary" onClick={() => onNavigate('login')}>
                  {t('heroLoginBtn')} <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" className="btn public-hero-ghost-btn" onClick={() => onNavigate('search')}>
                  <Search className="h-4 w-4" /> {t('heroFindShopBtn')}
                </button>
              </div>
            </Reveal>
          </div>
          <Reveal delay={220} className="public-hero-panel-visual">
            <div className="public-hero-visual-wrap">
              <img src={keyShopLogo} alt="Key Shop" width={680} height={367} />
            </div>
          </Reveal>
        </div>
      </section>

      <Reveal delay={240} className="public-stats-row">
        <div className="public-stat-card">
          <div className="public-stat-icon"><Store /></div>
          <div>
            <div className="public-stat-num"><CountUp end={500} suffix="+" /></div>
            <div className="public-stat-label">{t('statShopsLabel')}</div>
          </div>
        </div>
        <div className="public-stat-card">
          <div className="public-stat-icon"><Key /></div>
          <div>
            <div className="public-stat-num"><CountUp end={50} suffix="k+" /></div>
            <div className="public-stat-label">{t('statKeysLabel')}</div>
          </div>
        </div>
        <div className="public-stat-card">
          <div className="public-stat-icon"><MapPin /></div>
          <div>
            <div className="public-stat-num"><CountUp end={100} suffix="+" /></div>
            <div className="public-stat-label">{t('statCitiesLabel')}</div>
          </div>
        </div>
      </Reveal>

      <section className="public-section">
        <Reveal className="public-section-head">
          <span className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> {t('whyEyebrow')}</span>
          <h2>{t('whyHeading')}</h2>
          <p>{t('whySubheading')}</p>
        </Reveal>

        <div className="public-feature-grid">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="card public-feature-card">
              <div className="icon-badge"><f.icon /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="public-section public-steps-section">
        <Reveal className="public-section-head">
          <span className="eyebrow"><CheckCircle2 className="h-3.5 w-3.5" /> {t('gettingStartedEyebrow')}</span>
          <h2>{t('gettingStartedHeading')}</h2>
        </Reveal>

        <div className="public-steps">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 90} className="public-step">
              <div className="public-step-num">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="public-section">
        <Reveal className="public-cta-banner card">
          <div>
            <h2>{t('homeCtaHeading')}</h2>
            <p>{t('homeCtaSubtext')}</p>
          </div>
          <div className="public-hero-ctas">
            <button type="button" className="btn btn-primary" onClick={() => onNavigate('login')}>
              {t('navLogin')} <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onNavigate('contact')}>
              {t('ctaContactBtn')}
            </button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function ShopResultCard({ shop, index, t }) {
  return (
    <Reveal delay={index * 50} className="card public-shop-card">
      <div className="public-shop-card-top">
        <div className="icon-badge solid"><Store /></div>
        <div>
          <h3>{shop.name}</h3>
          <span className="pill-badge" style={{ animation: 'none', padding: '4px 10px 4px 8px', fontSize: 11 }}>
            <Star className="h-3 w-3" /> {t('shopVerifiedBadge')}
          </span>
        </div>
      </div>
      {shop.category && (
        <div className="public-shop-meta"><Tag className="h-3.5 w-3.5" /> {shop.category}</div>
      )}
      {shop.address && (
        <div className="public-shop-meta"><MapPin className="h-3.5 w-3.5" /> {shop.address}</div>
      )}
      {shop.phone && (
        <div className="public-shop-meta"><Phone className="h-3.5 w-3.5" /> {shop.phone}</div>
      )}
      {shop.website && (
        <div className="public-shop-meta">
          <Globe className="h-3.5 w-3.5" />
          <a href={shop.website.startsWith('http') ? shop.website : `https://${shop.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            {shop.website}
          </a>
        </div>
      )}
    </Reveal>
  );
}

function SearchPage({ api, t }) {
  const [query, setQuery] = useState('');
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const runSearch = async (q) => {
    setLoading(true);
    setError('');
    try {
      const results = await api.searchPublicShops({ query: q });
      setShops(Array.isArray(results) ? results : []);
    } catch (err) {
      setError(err.message || t('searchErrorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  // Live, dynamic search: every keystroke re-queries (debounced) so any
  // partial match on shop name, location or category shows up immediately,
  // with no need to submit the form.
  useEffect(() => {
    const trimmed = query.trim();
    setSearched(trimmed.length > 0);
    const timer = setTimeout(() => runSearch(trimmed), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSearched(true);
    runSearch(query.trim());
  };

  return (
    <section className="public-section public-search-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Search className="h-3.5 w-3.5" /> {t('findShopEyebrow')}</span>
        <h2>{t('searchHeading')}</h2>
        <p>{t('searchSubheading')}</p>
      </Reveal>

      <Reveal className="public-search-box-wrap">
        <form onSubmit={handleSubmit} className="search-box public-search-box">
          <Search />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('searchBtn')}
          </button>
        </form>
      </Reveal>

      {error && (
        <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13.5, marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="public-search-loading">
          <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--gold)' }} />
          <span>{t('searchLoadingText')}</span>
        </div>
      ) : shops.length === 0 ? (
        <div className="public-search-empty card">
          <Clock className="h-6 w-6" style={{ color: 'var(--text-3)' }} />
          <p>
            {searched ? t('searchNoResultsSearched') : t('searchNoResultsEmpty')}
          </p>
        </div>
      ) : (
        <div className="public-shop-grid">
          {shops.map((shop, i) => (
            <ShopResultCard key={shop.id} shop={shop} index={i} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function AboutPage({ t }) {
  const values = [
    { icon: ShieldCheck, title: t('value1Title'), desc: t('value1Desc') },
    { icon: Sparkles, title: t('value2Title'), desc: t('value2Desc') },
    { icon: Users, title: t('value3Title'), desc: t('value3Desc') },
  ];

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Building2 className="h-3.5 w-3.5" /> {t('aboutEyebrow')}</span>
        <h2>{t('aboutHeading')}</h2>
        <p style={{ maxWidth: 640 }}>
          {t('aboutBody')}
        </p>
      </Reveal>

      <div className="public-feature-grid">
        {values.map((v, i) => (
          <Reveal key={v.title} delay={i * 80} className="card public-feature-card">
            <div className="icon-badge"><v.icon /></div>
            <h3>{v.title}</h3>
            <p>{v.desc}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="public-cta-banner card" style={{ marginTop: 40 }}>
        <div>
          <h2>{t('aboutCtaHeading')}</h2>
          <p>{t('aboutCtaSubtext')}</p>
        </div>
        <div className="public-hero-ctas">
          <a href="mailto:keyshops666@gmail.com" className="btn btn-primary">
            <Mail className="h-4 w-4" /> keyshops666@gmail.com
          </a>
        </div>
      </Reveal>
    </section>
  );
}

function ContactPage({ api, t }) {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // Stored server-side and surfaced immediately in the Super Admin's
      // notification bell (see backend ContactService) - there's no email
      // delivery involved, but the message does actually reach the business.
      await api.submitContactMessage(form);
      setSubmitted(true);
    } catch {
      // The shared API client's own error messages are never translated
      // (they come from the backend or a hardcoded English fallback), so
      // always show our own translated string here instead of leaking
      // English text into a non-English UI.
      setError(t('contactErrorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Mail className="h-3.5 w-3.5" /> {t('contactEyebrow')}</span>
        <h2>{t('contactHeading')}</h2>
        <p>{t('contactSubheading')}</p>
      </Reveal>

      <div className="public-contact-grid">
        <Reveal className="card public-contact-card">
          <div className="icon-badge"><Mail /></div>
          <h3>{t('contactEmailLabel')}</h3>
          <p>keyshops666@gmail.com</p>
        </Reveal>
        <Reveal delay={70} className="card public-contact-card">
          <div className="icon-badge"><Phone /></div>
          <h3>{t('contactCustomerCareLabel')}</h3>
          <p>+91 90250 88853</p>
        </Reveal>
        <Reveal delay={110} className="card public-contact-card">
          <div className="icon-badge"><MessageCircle /></div>
          <h3>{t('contactWhatsappLabel')}</h3>
          <p>+91 90250 88853</p>
        </Reveal>
        <Reveal delay={140} className="card public-contact-card">
          <div className="icon-badge"><MapPin /></div>
          <h3>{t('contactOfficeLabel')}</h3>
          <p>{t('footerAddress')}</p>
        </Reveal>
      </div>

      <Reveal delay={100} className="card public-contact-form-card">
        {submitted ? (
          <div className="public-contact-success">
            <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--green)' }} />
            <h3>{t('contactThanksTemplate').replace('{name}', form.name || t('contactThereFallback'))}</h3>
            <p>{t('contactSuccessBodyTemplate').replace('{email}', form.email || t('contactEmailFallback'))}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13.5, marginBottom: 16 }}>{error}</div>
            )}
            <div className="field">
              <label>{t('contactYourNameLabel')}</label>
              <div className="input-wrap">
                <Users />
                <input required type="text" value={form.name} onChange={handleChange('name')} placeholder={t('contactFullNamePlaceholder')} disabled={submitting} />
              </div>
            </div>
            <div className="field">
              <label>{t('contactEmailAddressLabel')}</label>
              <div className="input-wrap">
                <Mail />
                <input required type="email" value={form.email} onChange={handleChange('email')} placeholder={t('contactEmailPlaceholder')} disabled={submitting} />
              </div>
            </div>
            <div className="field">
              <label>{t('contactMessageLabel')}</label>
              <textarea
                required
                minLength={10}
                rows={4}
                value={form.message}
                onChange={handleChange('message')}
                placeholder={t('contactMessagePlaceholder')}
                className="public-contact-textarea"
                disabled={submitting}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? t('contactSendingBtn') : t('contactSendBtn')} <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </Reveal>
    </section>
  );
}

function PrivacyPolicyPage({ t }) {
  const sections = [
    { title: t('privacySection1Title'), body: t('privacySection1Body') },
    { title: t('privacySection2Title'), list: [t('privacySection2Item1'), t('privacySection2Item2'), t('privacySection2Item3')] },
    { title: t('privacySection3Title'), body: t('privacySection3Body') },
    { title: t('privacySection4Title'), body: t('privacySection4Body') },
    { title: t('privacySection5Title'), body: t('privacySection5Body') },
    { title: t('privacySection6Title'), list: [t('privacySection6Item1'), t('privacySection6Item2'), t('privacySection6Item3'), t('privacySection6Item4'), t('privacySection6Item5')] },
    { title: t('privacySection7Title'), body: t('privacySection7Body') },
    { title: t('privacySection8Title'), list: [t('privacySection8Item1'), t('privacySection8Item2'), t('privacySection8Item3'), t('privacySection8Item4'), t('privacySection8Item5')] },
    { title: t('privacySection9Title'), body: t('privacySection9Body') },
    { title: t('privacySection10Title'), body: t('privacySection10Body') },
    { title: t('privacySection11Title'), body: t('privacySection11Body') },
  ];

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> {t('privacyEyebrow')}</span>
        <h2>{t('privacyHeading')}</h2>
        <p style={{ maxWidth: 640 }}>{t('privacyLastUpdatedPrefix')} {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </Reveal>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 760 }}>
        {sections.map((s) => (
          <Reveal key={s.title} className="card" style={{ padding: '20px 24px' }}>
            <h3 style={{ marginBottom: 10 }}>{s.title}</h3>
            {s.body && <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>{s.body}</p>}
            {s.list && (
              <ul style={{ color: 'var(--text-2)', lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
                {s.list.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function DeleteAccountRequestPage({ onNavigate, t }) {
  // Both templates carry a real interactive element (a mailto link / an
  // in-app navigation button) mid-sentence - split on the {link} token
  // (same convention as the referral share message template elsewhere in
  // this codebase) so translation doesn't have to sacrifice the link.
  const [emailBefore, emailAfter] = t('daSection2BodyTemplate').split('{link}');
  const [retainBefore, retainAfter] = t('daSection4BodyTemplate').split('{link}');

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Trash2 className="h-3.5 w-3.5" /> {t('deleteAccountEyebrow')}</span>
        <h2>{t('deleteAccountHeading')}</h2>
        <p style={{ maxWidth: 640 }}>
          {t('deleteAccountIntro')}
        </p>
      </Reveal>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 760 }}>
        <Reveal className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>{t('daSection1Title')}</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            {t('daSection1Body')}
          </p>
        </Reveal>

        <Reveal delay={70} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>{t('daSection2Title')}</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            {emailBefore}<a href="mailto:keyshops666@gmail.com">keyshops666@gmail.com</a>{emailAfter}
          </p>
        </Reveal>

        <Reveal delay={140} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>{t('daSection3Title')}</h3>
          <ul style={{ color: 'var(--text-2)', lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
            <li>{t('daSection3Item1')}</li>
            <li>{t('daSection3Item2')}</li>
          </ul>
        </Reveal>

        <Reveal delay={210} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>{t('daSection4Title')}</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            {retainBefore}<button type="button" onClick={() => onNavigate('privacy')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>{t('privacyPolicyLinkLabel')}</button>{retainAfter}
          </p>
        </Reveal>

        <Reveal delay={280} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>{t('daSection5Title')}</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            {t('daSection5Body')}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

const PUBLIC_LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'മലയാളം' },
];

// Floating bottom-right switcher, always available regardless of which
// public page is showing (unlike the authenticated dashboard's language
// picker, which lives inside the sidebar). Click-outside-to-close mirrors
// the exact pattern used for the dashboard's notification dropdown
// (App.jsx's notifDropdownRef) - a shared ref around the button + panel, a
// document-level mousedown listener that closes on anything outside it.
function LanguageSwitcher({ lang, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const current = PUBLIC_LANG_OPTIONS.find((l) => l.code === lang) || PUBLIC_LANG_OPTIONS[0];

  return (
    <div ref={ref} className="public-lang-switcher">
      {open && (
        <div className="public-lang-switcher-panel">
          {PUBLIC_LANG_OPTIONS.map((l) => (
            <button
              key={l.code}
              type="button"
              className={l.code === lang ? 'active' : ''}
              onClick={() => { onChange(l.code); setOpen(false); }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="public-lang-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        title={current.label}
      >
        <Languages className="h-5 w-5" />
      </button>
    </div>
  );
}

// Creates the tag if missing (index.html ships without most of these so
// there's nothing stale to fight on first mount), otherwise updates it in
// place - keeps a single tag per attribute instead of piling up duplicates
// across page switches.
function setMetaTag(selector, create, attr, value) {
  let el = document.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export default function PublicSite({ page, onNavigate, api }) {
  // Separate, small dictionary from the dashboard's translations.js - see
  // publicTranslations.js's own header comment for why. Lazily imported so
  // the fetch fires in parallel with everything else rather than blocking
  // first paint; every t() call below falls back to the raw key (matching
  // the dashboard's own resolver) until it resolves, so nothing breaks
  // during that brief window.
  const [lang, setLang] = useState(localStorage.getItem('kee_lang') || 'en');
  const [langData, setLangData] = useState(null);
  useEffect(() => {
    import('../i18n/publicTranslations').then((m) => setLangData(m.default));
  }, []);
  const t = (key) => langData?.[lang]?.[key] || langData?.en?.[key] || key;
  const handleLangChange = (code) => {
    setLang(code);
    localStorage.setItem('kee_lang', code);
  };

  // Keeps <html lang> in sync with the visitor's chosen language so the
  // :lang(ta)/:lang(te)/:lang(kn)/:lang(ml) font-family overrides in
  // index.css actually activate - without this every non-Latin script
  // silently falls back to the browser's default system font instead of
  // the matching Baloo/Noto Sans face.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // CSS-only-adjacent 3D tilt for feature/stat/step cards: one delegated
  // mousemove/mouseout listener (not one per card) computes rotateX/rotateY
  // from cursor position and writes it as an inline transform. No animation
  // library involved - just a couple of transform writes, and it never
  // attaches at all on touch devices or with reduced-motion requested, so
  // it costs nothing there.
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return undefined;

    const TILT_SELECTOR = '.public-feature-card, .public-stat-card, .public-step';
    const onMove = (e) => {
      const card = e.target.closest(TILT_SELECTOR);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-4px)`;
    };
    const onOut = (e) => {
      const card = e.target.closest(TILT_SELECTOR);
      if (!card || card.contains(e.relatedTarget)) return;
      card.style.transform = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  // Hero-specific parallax: tracked across the whole hero panel (not just
  // on hover of the logo itself), so the visual drifts gently as the
  // cursor moves anywhere over the hero - a broader, slower effect than
  // the card tilt above, sized to read as ambient depth rather than a
  // toy. CSS transition on .public-hero-visual-wrap smooths every step.
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return undefined;

    const panel = document.querySelector('.public-hero-panel');
    const wrap = document.querySelector('.public-hero-visual-wrap');
    if (!panel || !wrap) return undefined;

    const onMove = (e) => {
      const rect = panel.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      wrap.style.transform = `translate(${(px * 18).toFixed(1)}px, ${(py * 14).toFixed(1)}px) rotateX(${(-py * 4).toFixed(1)}deg) rotateY(${(px * 5).toFixed(1)}deg)`;
    };
    const onLeave = () => { wrap.style.transform = ''; };

    panel.addEventListener('mousemove', onMove);
    panel.addEventListener('mouseleave', onLeave);
    return () => {
      panel.removeEventListener('mousemove', onMove);
      panel.removeEventListener('mouseleave', onLeave);
    };
  }, [page]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const meta = PAGE_META[page] || PAGE_META.home;
    const canonicalUrl = `${PUBLIC_BASE_URL}${meta.path}`;
    document.title = meta.title;

    setMetaTag('meta[name="description"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('name', 'description');
      return el;
    }, 'content', meta.description);

    setMetaTag('link[rel="canonical"]', () => {
      const el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      return el;
    }, 'href', canonicalUrl);

    setMetaTag('meta[property="og:title"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('property', 'og:title');
      return el;
    }, 'content', meta.title);
    setMetaTag('meta[property="og:description"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('property', 'og:description');
      return el;
    }, 'content', meta.description);
    setMetaTag('meta[property="og:url"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('property', 'og:url');
      return el;
    }, 'content', canonicalUrl);
  }, [page]);

  return (
    <div className="public-site">
      <PublicNav page={page} onNavigate={onNavigate} t={t} />
      {/* Keyed on `page` so switching nav tabs remounts this wrapper and
          replays the fade-in, instead of the instant content swap this used
          to be. */}
      <main key={page} className="animate-fade-in">
        {page === 'search' ? (
          <SearchPage api={api} t={t} />
        ) : page === 'about' ? (
          <AboutPage t={t} />
        ) : page === 'contact' ? (
          <ContactPage api={api} t={t} />
        ) : page === 'privacy' ? (
          <PrivacyPolicyPage t={t} />
        ) : page === 'deleteAccount' ? (
          <DeleteAccountRequestPage onNavigate={onNavigate} t={t} />
        ) : (
          <HomePage onNavigate={onNavigate} t={t} />
        )}
      </main>
      <PublicFooter onNavigate={onNavigate} t={t} />
      <LanguageSwitcher lang={lang} onChange={handleLangChange} />
    </div>
  );
}
