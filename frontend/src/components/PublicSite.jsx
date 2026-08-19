import React, { useEffect, useRef, useState } from 'react';
import {
  Key, ArrowRight, Search, MapPin, Phone, Mail, ShieldCheck, Users,
  Package, BarChart3, Building2, Sparkles, CheckCircle2, Menu, X,
  RefreshCw, Clock, Store, Star, Send, Download, Tag, MessageCircle, Globe,
  Trash2,
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
    title: 'Kee — Duplicate Key Shop Management Software for India',
    description: 'Kee is the gold-standard workspace for Indian duplicate-key shops - manage customers, keys, store inventory and reports in one bold dashboard. Trusted by 500+ key shops across India.',
    path: '/',
  },
  search: {
    title: 'Find a Key Shop Near You | Kee',
    description: 'Search Kee-powered duplicate-key shops by name, city/locality or category to find a trusted key specialist near you.',
    path: '/search',
  },
  about: {
    title: 'About Kee | Software Built for Key Specialists',
    description: 'Kee started with one observation: duplicate-key shops deserved better than paper registers. Learn about our mission to modernize Indian key shops.',
    path: '/about',
  },
  contact: {
    title: 'Contact Kee | Get in Touch',
    description: 'Questions about Kee, a demo request, or support for an existing shop - reach out by email, phone, WhatsApp or the form below.',
    path: '/contact',
  },
  privacy: {
    title: 'Privacy Policy | Kee',
    description: 'How Kee collects, uses, stores and protects data for shop accounts, customer records and the Kee mobile app.',
    path: '/privacy-policy',
  },
  deleteAccount: {
    title: 'Delete Your Account | Kee',
    description: 'How to request deletion of your Kee shop account and what happens to your data.',
    path: '/delete-account-request',
  },
};

const NAV_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'search', label: 'Find a Shop' },
  { key: 'about', label: 'About' },
  { key: 'contact', label: 'Contact' },
];

function PublicNav({ page, onNavigate }) {
  const [mobileOpen, setMobileOpen] = useState(false);

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
          {NAV_ITEMS.map((item) => (
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
            <Download className="h-4 w-4" /> Download App
          </a>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go('login')}>
            Login <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="public-nav-burger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="public-nav-mobile animate-fade-in">
          {NAV_ITEMS.map((item) => (
            <button key={item.key} type="button" className={page === item.key ? 'active' : ''} onClick={() => go(item.key)}>
              {item.label}
            </button>
          ))}
          <a href={APK_DOWNLOAD_URL} download={APK_DOWNLOAD_FILENAME} className="btn btn-outline btn-block">
            <Download className="h-4 w-4" /> Download App
          </a>
          <button type="button" className="btn btn-primary btn-block" onClick={() => go('login')}>
            Login <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PublicFooter({ onNavigate }) {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <div className="brand" style={{ marginBottom: 14 }}>
            <img src={keyShopLogoSm} alt="Key Shop" className="brand-logo" width={170} height={92} />
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 13.5, fontWeight: 600, maxWidth: 320, lineHeight: 1.6 }}>
            The bold, gold-standard workspace for Indian duplicate-key shops &mdash;
            customers, keys, orders and reports in one place.
          </p>
        </div>
        <div className="public-footer-link-cols">
          <div className="public-footer-links">
            <span className="public-footer-heading">Explore</span>
            <button type="button" onClick={() => onNavigate('home')}>Home</button>
            <button type="button" onClick={() => onNavigate('search')}>Find a Shop</button>
            <button type="button" onClick={() => onNavigate('about')}>About</button>
            <button type="button" onClick={() => onNavigate('contact')}>Contact</button>
          </div>
          <div className="public-footer-links">
            <span className="public-footer-heading">Get in touch</span>
            <span className="public-footer-static"><Mail className="h-3.5 w-3.5" /> keyshops666@gmail.com</span>
            <span className="public-footer-static"><Phone className="h-3.5 w-3.5" /> +91 90250 88853</span>
            <span className="public-footer-static"><MapPin className="h-3.5 w-3.5" /> Coimbatore, Tamil Nadu, India</span>
          </div>
        </div>
      </div>
      <div className="public-footer-bottom">
        &copy; {new Date().getFullYear()} Kee. All rights reserved.
        {' '}&middot;{' '}
        <button type="button" className="public-footer-legal-link" onClick={() => onNavigate('privacy')}>Privacy Policy</button>
        {' '}&middot;{' '}
        <button type="button" className="public-footer-legal-link" onClick={() => onNavigate('deleteAccount')}>Delete Account</button>
      </div>
    </footer>
  );
}

function HomePage({ onNavigate }) {
  const features = [
    { icon: Users, title: 'Customer Management', desc: 'Capture ID proof, photo and key history for every walk-in, searchable in seconds.' },
    { icon: Key, title: 'Key & Master Catalog', desc: 'Track every blank, master key and duplicate against a shop-wide catalog that never loses a key.' },
    { icon: Package, title: 'Store & Inventory', desc: 'Sell hardware alongside key services and keep stock levels accurate automatically.' },
    { icon: BarChart3, title: 'Reports & Analytics', desc: 'Daily, weekly and monthly rollups of revenue, footfall and top-selling items.' },
    { icon: Building2, title: 'Multi-Branch Ready', desc: 'Run several outlets under one account with data kept cleanly separated per shop.' },
    { icon: ShieldCheck, title: 'Secure & Encrypted', desc: 'Sensitive ID numbers are encrypted at rest; every record is tenant-isolated by design.' },
  ];

  const steps = [
    { n: '01', title: 'Register your shop', desc: 'Create your shop account in minutes with your basic business details.' },
    { n: '02', title: 'Add your team & keys', desc: 'Bring your key catalog and staff on board, no spreadsheets required.' },
    { n: '03', title: 'Serve customers faster', desc: 'Register customers, cut keys and track orders from one bold dashboard.' },
  ];

  return (
    <>
      <section className="public-hero">
        <div className="public-hero-panel">
          <div className="public-hero-panel-text">
            <Reveal>
              <span className="pill-badge">
                <span className="dot"></span>
                Trusted by 500+ key shops across India
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="public-hero-title">
                Run your duplicate-key shop
                <span className="gold-line"> the smart, gold-standard way.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="public-hero-lead">
                Track duplicate keys, customers and store orders across every branch &mdash;
                one bold dashboard built for Indian key specialists.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="public-hero-ctas">
                <button type="button" className="btn btn-primary" onClick={() => onNavigate('login')}>
                  Login to your workspace <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" className="btn public-hero-ghost-btn" onClick={() => onNavigate('search')}>
                  <Search className="h-4 w-4" /> Find a shop near you
                </button>
              </div>
            </Reveal>
          </div>
          <div className="public-hero-panel-visual">
            <img src={keyShopLogo} alt="Key Shop" width={680} height={367} />
          </div>
        </div>
      </section>

      <Reveal delay={320} className="public-stats-row">
        <div className="public-stat-card">
          <div className="public-stat-icon"><Store /></div>
          <div>
            <div className="public-stat-num"><CountUp end={500} suffix="+" /></div>
            <div className="public-stat-label">Shops onboarded</div>
          </div>
        </div>
        <div className="public-stat-card">
          <div className="public-stat-icon"><Key /></div>
          <div>
            <div className="public-stat-num"><CountUp end={50} suffix="k+" /></div>
            <div className="public-stat-label">Keys duplicated</div>
          </div>
        </div>
        <div className="public-stat-card">
          <div className="public-stat-icon"><MapPin /></div>
          <div>
            <div className="public-stat-num"><CountUp end={100} suffix="+" /></div>
            <div className="public-stat-label">Cities served</div>
          </div>
        </div>
      </Reveal>

      <section className="public-section">
        <Reveal className="public-section-head">
          <span className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Why Kee</span>
          <h2>Everything a modern key shop needs</h2>
          <p>One workspace for the front counter, the back office and everything in between.</p>
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
          <span className="eyebrow"><CheckCircle2 className="h-3.5 w-3.5" /> Getting started</span>
          <h2>Up and running in three steps</h2>
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
            <h2>Ready to modernize your shop?</h2>
            <p>Login if you already have an account, or find a Kee-powered shop near you.</p>
          </div>
          <div className="public-hero-ctas">
            <button type="button" className="btn btn-primary" onClick={() => onNavigate('login')}>
              Login <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onNavigate('contact')}>
              Contact us
            </button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function ShopResultCard({ shop, index }) {
  return (
    <Reveal delay={index * 50} className="card public-shop-card">
      <div className="public-shop-card-top">
        <div className="icon-badge solid"><Store /></div>
        <div>
          <h3>{shop.name}</h3>
          <span className="pill-badge" style={{ animation: 'none', padding: '4px 10px 4px 8px', fontSize: 11 }}>
            <Star className="h-3 w-3" /> Verified Kee shop
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

function SearchPage({ api }) {
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
      setError(err.message || 'Could not load shops right now.');
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
        <span className="eyebrow"><Search className="h-3.5 w-3.5" /> Find a shop</span>
        <h2>Search Kee shops by name, location or category</h2>
        <p>Looking for a duplicate-key shop that runs on Kee? Search by shop name, city/locality, or shop category/type - results update as you type.</p>
      </Reveal>

      <Reveal className="public-search-box-wrap">
        <form onSubmit={handleSubmit} className="search-box public-search-box">
          <Search />
          <input
            type="text"
            placeholder="Try a shop name, city, or category e.g. 'Dealers'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Search'}
          </button>
        </form>
      </Reveal>

      {error && (
        <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13.5, marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="public-search-loading">
          <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--gold)' }} />
          <span>Loading shops&hellip;</span>
        </div>
      ) : shops.length === 0 ? (
        <div className="public-search-empty card">
          <Clock className="h-6 w-6" style={{ color: 'var(--text-3)' }} />
          <p>
            {searched
              ? 'No shops matched your search. Try a different name or location.'
              : 'No shops are listed publicly yet. Check back soon.'}
          </p>
        </div>
      ) : (
        <div className="public-shop-grid">
          {shops.map((shop, i) => (
            <ShopResultCard key={shop.id} shop={shop} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function AboutPage() {
  const values = [
    { icon: ShieldCheck, title: 'Trust & Security', desc: 'Sensitive customer data is encrypted and every shop\'s records stay strictly isolated.' },
    { icon: Sparkles, title: 'Built for key specialists', desc: 'Every workflow mirrors how Indian key shops actually work at the counter.' },
    { icon: Users, title: 'Customer first', desc: 'Faster registration, faster lookups, faster service for the people who walk in.' },
  ];

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Building2 className="h-3.5 w-3.5" /> About Kee</span>
        <h2>Software built with key specialists, for key specialists</h2>
        <p style={{ maxWidth: 640 }}>
          Kee started with one simple observation: duplicate-key shops were running on paper
          registers and loose memory, even while handling sensitive customer ID proofs and
          high-value keys every single day. We set out to build a workspace that&rsquo;s as fast
          as the counter it replaces &mdash; without compromising on security or record-keeping.
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
          <h2>Want Kee for your shop?</h2>
          <p>Reach out and we&rsquo;ll help you get set up in one call.</p>
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

function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // No backend contact endpoint exists yet - this is a local acknowledgement
    // only. Real follow-up happens via the email/phone listed alongside it.
    setSubmitted(true);
  };

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Mail className="h-3.5 w-3.5" /> Contact</span>
        <h2>We&rsquo;d love to hear from you</h2>
        <p>Questions about Kee, a demo request, or support for an existing shop &mdash; reach out any way that works for you.</p>
      </Reveal>

      <div className="public-contact-grid">
        <Reveal className="card public-contact-card">
          <div className="icon-badge"><Mail /></div>
          <h3>Email</h3>
          <p>keyshops666@gmail.com</p>
        </Reveal>
        <Reveal delay={70} className="card public-contact-card">
          <div className="icon-badge"><Phone /></div>
          <h3>Customer Care</h3>
          <p>+91 90250 88853</p>
        </Reveal>
        <Reveal delay={110} className="card public-contact-card">
          <div className="icon-badge"><MessageCircle /></div>
          <h3>WhatsApp</h3>
          <p>+91 90250 88853</p>
        </Reveal>
        <Reveal delay={140} className="card public-contact-card">
          <div className="icon-badge"><MapPin /></div>
          <h3>Office</h3>
          <p>Coimbatore, Tamil Nadu, India</p>
        </Reveal>
      </div>

      <Reveal delay={100} className="card public-contact-form-card">
        {submitted ? (
          <div className="public-contact-success">
            <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--green)' }} />
            <h3>Thanks, {form.name || 'there'}!</h3>
            <p>Your message has been noted. We&rsquo;ll get back to you at {form.email || 'the email you provided'} shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Your name</label>
              <div className="input-wrap">
                <Users />
                <input required type="text" value={form.name} onChange={handleChange('name')} placeholder="Full name" />
              </div>
            </div>
            <div className="field">
              <label>Email address</label>
              <div className="input-wrap">
                <Mail />
                <input required type="email" value={form.email} onChange={handleChange('email')} placeholder="you@example.com" />
              </div>
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                required
                rows={4}
                value={form.message}
                onChange={handleChange('message')}
                placeholder="Tell us a bit about your shop or question&hellip;"
                className="public-contact-textarea"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block">
              Send message <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </Reveal>
    </section>
  );
}

function PrivacyPolicyPage() {
  const sections = [
    {
      title: '1. Who this policy covers',
      body: `Kee ("we", "us") operates the keyshops.in website and the Kee mobile app, used by duplicate-key
      shop owners ("Shop Admins") to run their business, and by their walk-in customers whose records a
      Shop Admin enters into the app. This policy explains what data we collect, why, and how it's protected
      for both groups.`,
    },
    {
      title: '2. Data we collect from Shop Admins',
      list: [
        'Account details: owner name, shop name, mobile number (required, used as your login and OTP identifier), email address (optional), password (stored as a bcrypt hash, never in plain text).',
        'Business details: shop address, GPS coordinates captured via your device location, city/district/state/PIN code, shop category, optional Aadhaar number and shop documents (photo, license) - Aadhaar and other sensitive ID numbers are encrypted at rest.',
        'Payment details: subscription payments are processed entirely by Razorpay. Kee never receives or stores your card, UPI or bank details - only Razorpay\'s order ID, payment ID and signature, used solely to verify a payment succeeded.',
      ],
    },
    {
      title: '3. Data Shop Admins enter about their customers',
      body: `When a Shop Admin registers a walk-in customer, the app stores the details the Shop Admin enters
      for that visit: customer name, phone number, address, optional ID proof type/number (encrypted at rest),
      photo, vehicle number and key/service details. This data is entered and controlled by the Shop Admin as
      the shop's own business record, not collected by Kee directly from the customer. Each shop's customer
      records are strictly isolated and never visible to other shops.`,
    },
    {
      title: '4. Location and camera',
      body: `We request device location to auto-fill your shop's address during registration and to power
      "find a shop near you" search - you can decline location access and enter your address manually. We
      request camera access so a Shop Admin can capture ID/document photos directly in the app instead of
      uploading files. Neither permission is used for background tracking.`,
    },
    {
      title: '5. OTP verification',
      body: `Login, password reset and registration are verified using a one-time code sent to your mobile
      number via SMS (delivered through MSG91) or, in the native app, verified directly on-device via Firebase
      Phone Authentication. We never ask for or store your OTP anywhere the API response could expose it.`,
    },
    {
      title: '6. How we use data',
      list: [
        'To create and secure your shop account and let you log in.',
        'To let you manage customers, keys, inventory and reports within your own shop.',
        'To process subscription payments via Razorpay.',
        'To send OTP codes for login, registration and password reset.',
        'To generate and share the customer key-registration report PDF you request, via a private, expiring download link.',
      ],
    },
    {
      title: '7. Data storage and security',
      body: `Data is stored in a managed PostgreSQL database and uploaded files (photos, documents, reports)
      in Supabase Storage, accessed only via short-lived signed URLs - files are never made public by default.
      Sensitive fields such as Aadhaar and ID proof numbers are encrypted at rest. Every shop's data is
      tenant-isolated: one shop's records are never visible to another.`,
    },
    {
      title: '8. Third-party services we use',
      list: [
        'Razorpay - subscription payment processing.',
        'MSG91 - SMS delivery for OTP codes.',
        'Firebase - phone number verification and app push notifications (native app).',
        'Supabase Storage - encrypted file storage for photos, documents and reports.',
        'Google Analytics - anonymized usage analytics on the public website, where enabled.',
      ],
    },
    {
      title: '9. Data retention and deletion',
      body: `Shop and customer records are retained for as long as the shop account is active, as they form
      part of the shop's own business records. A Shop Admin can delete their own account at any time from
      Settings, OTP-verified before it takes effect - see our Delete Account page for the full process,
      including how to request deletion without the app installed.`,
    },
    {
      title: '10. Your rights',
      body: `You can review or correct your shop account details at any time from Shop Settings. To request a
      copy of your data, a correction, or deletion, email us at the address below and we'll respond within a
      reasonable time.`,
    },
    {
      title: '11. Contact us',
      body: `Questions about this policy or your data: keyshops666@gmail.com or +91 90250 88853.`,
    },
  ];

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> Privacy Policy</span>
        <h2>Your data, handled carefully</h2>
        <p style={{ maxWidth: 640 }}>Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
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

function DeleteAccountRequestPage({ onNavigate }) {
  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Trash2 className="h-3.5 w-3.5" /> Delete Account</span>
        <h2>Request deletion of your Kee account</h2>
        <p style={{ maxWidth: 640 }}>
          You can close your Kee shop account and delete your data at any time. This page covers how,
          whether you still have the app installed or not.
        </p>
      </Reveal>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 760 }}>
        <Reveal className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>If you still have the Kee app</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            Open the app and go to <b>Settings &rarr; Delete Account</b>. You&rsquo;ll be asked to confirm and verify
            with an OTP sent to your registered mobile number before the deletion takes effect - this
            confirms the request is really coming from the account owner.
          </p>
        </Reveal>

        <Reveal delay={70} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>If you no longer have the app</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            Email <a href="mailto:keyshops666@gmail.com">keyshops666@gmail.com</a> from the address on file (or
            mention your registered shop name and mobile number) and ask us to delete your account. We&rsquo;ll
            verify your identity and confirm once it&rsquo;s done.
          </p>
        </Reveal>

        <Reveal delay={140} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>What gets deleted</h3>
          <ul style={{ color: 'var(--text-2)', lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
            <li>Your shop account and login details (name, email, phone, password).</li>
            <li>Your shop&rsquo;s business details, documents and uploaded photos.</li>
          </ul>
        </Reveal>

        <Reveal delay={210} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>What we retain, and why</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            Records tied to completed subscription payments (via Razorpay) are kept as required for financial
            and tax record-keeping, even after account deletion - this is limited to payment/order records, not
            your login credentials or customer data. See our <button type="button" onClick={() => onNavigate('privacy')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Privacy Policy</button> for the full picture.
          </p>
        </Reveal>

        <Reveal delay={280} className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: 10 }}>How long it takes</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            In-app deletion (Settings &rarr; Delete Account) takes effect immediately once OTP-verified. An
            email request is processed within a few business days.
          </p>
        </Reveal>
      </div>
    </section>
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
      <div className="public-topbar">The <b>Super Admin</b> web console &mdash; Shop Admins, get the app below.</div>
      <PublicNav page={page} onNavigate={onNavigate} />
      {/* Keyed on `page` so switching nav tabs remounts this wrapper and
          replays the fade-in, instead of the instant content swap this used
          to be. */}
      <main key={page} className="animate-fade-in">
        {page === 'search' ? (
          <SearchPage api={api} />
        ) : page === 'about' ? (
          <AboutPage />
        ) : page === 'contact' ? (
          <ContactPage />
        ) : page === 'privacy' ? (
          <PrivacyPolicyPage />
        ) : page === 'deleteAccount' ? (
          <DeleteAccountRequestPage onNavigate={onNavigate} />
        ) : (
          <HomePage onNavigate={onNavigate} />
        )}
      </main>
      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}
