import React, { useEffect, useRef, useState } from 'react';
import {
  Key, ArrowRight, Search, MapPin, Phone, Mail, ShieldCheck, Users,
  Package, BarChart3, Building2, Sparkles, CheckCircle2, Menu, X,
  RefreshCw, Clock, Store, Star, Send, Download, Tag,
} from 'lucide-react';
import keyShopLogo from '../assets/branding/keyshop-logo.png';

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
          <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
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
          <button type="button" className="public-nav-burger" onClick={() => setMobileOpen((v) => !v)}>
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
            <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
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
            <span className="public-footer-static"><Mail className="h-3.5 w-3.5" /> support@kee.app</span>
            <span className="public-footer-static"><Phone className="h-3.5 w-3.5" /> +91 98765 43210</span>
            <span className="public-footer-static"><MapPin className="h-3.5 w-3.5" /> New Delhi, India</span>
          </div>
        </div>
      </div>
      <div className="public-footer-bottom">
        &copy; {new Date().getFullYear()} Kee. All rights reserved.
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
                one bold dashboard built for Indian locksmiths.
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
            <img src={keyShopLogo} alt="Key Shop" />
          </div>
        </div>
      </section>

      <Reveal delay={320} className="public-stats-row">
        <div className="public-stat-card">
          <div className="public-stat-icon"><Store /></div>
          <div>
            <div className="public-stat-num">500+</div>
            <div className="public-stat-label">Shops onboarded</div>
          </div>
        </div>
        <div className="public-stat-card">
          <div className="public-stat-icon"><Key /></div>
          <div>
            <div className="public-stat-num">50k+</div>
            <div className="public-stat-label">Keys duplicated</div>
          </div>
        </div>
        <div className="public-stat-card">
          <div className="public-stat-icon"><MapPin /></div>
          <div>
            <div className="public-stat-num">100+</div>
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
      const results = await api.searchPublicShops(q);
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
    { icon: Sparkles, title: 'Built for locksmiths', desc: 'Every workflow mirrors how Indian key shops actually work at the counter.' },
    { icon: Users, title: 'Customer first', desc: 'Faster registration, faster lookups, faster service for the people who walk in.' },
  ];

  return (
    <section className="public-section">
      <Reveal className="public-section-head">
        <span className="eyebrow"><Building2 className="h-3.5 w-3.5" /> About Kee</span>
        <h2>Software built with locksmiths, for locksmiths</h2>
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
          <a href="mailto:support@kee.app" className="btn btn-primary">
            <Mail className="h-4 w-4" /> support@kee.app
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
          <p>support@kee.app</p>
        </Reveal>
        <Reveal delay={70} className="card public-contact-card">
          <div className="icon-badge"><Phone /></div>
          <h3>Phone</h3>
          <p>+91 98765 43210</p>
        </Reveal>
        <Reveal delay={140} className="card public-contact-card">
          <div className="icon-badge"><MapPin /></div>
          <h3>Office</h3>
          <p>New Delhi, India</p>
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

export default function PublicSite({ page, onNavigate, api }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  return (
    <div className="public-site">
      <div className="public-topbar">The <b>Super Admin</b> web console &mdash; Shop Admins, get the app below.</div>
      <PublicNav page={page} onNavigate={onNavigate} />
      {page === 'search' ? (
        <SearchPage api={api} />
      ) : page === 'about' ? (
        <AboutPage />
      ) : page === 'contact' ? (
        <ContactPage />
      ) : (
        <HomePage onNavigate={onNavigate} />
      )}
      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}
