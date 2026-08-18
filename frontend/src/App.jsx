import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { backHandlerStack, useBackHandler } from './utils/backHandler';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { useAuth } from './context/AuthContext';
import { getAssetUrl, downloadAsset, filenameForAsset, API_BASE } from './apiConfig';
// buildCustomerReportPdf is loaded lazily (dynamic import) at each call site
// instead of a static top-level import - it pulls in jspdf + html2canvas,
// which are heavy and only ever needed when a report is actually generated,
// not on every page load. See the `await import('./utils/customerReportPdf')`
// calls below.
import { VEHICLE_CATEGORIES, isAutomobileCategory } from './utils/vehicleCategory';
import { normalizePhone } from './utils/phone';
import twoWheelerIcon from './assets/categories/two-wheeler.png';
import fourWheelerIcon from './assets/categories/four-wheeler.png';
import truckLorryIcon from './assets/categories/truck-lorry.png';
import homeCategoryIcon from './assets/categories/home.png';
import officeCategoryIcon from './assets/categories/office.png';
import addKeyIcon from './assets/addlostkeys/bluekey.png';
import lostKeyIcon from './assets/addlostkeys/redkey.png';
import { downloadPdf, sharePdf } from './utils/pdfDelivery';
import { openRazorpayCheckout } from './utils/razorpay';
import { ALL_TN_LOCATIONS } from './utils/tamilNaduLocations';
import { useLocationFilter } from './utils/locationFilter';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from './utils/phone';
import { IS_NATIVE_APP, KEE_LANDING_PAGE_URL, primeStoragePermission } from './utils/platform';
import { resolveCurrentLocation, reverseGeocode, openDeviceLocationSettings, openAppSettings } from './utils/geolocation';
import { ALL_DOC_TYPES, INDIAN_STATES_DISTRICTS } from './utils/registrationData';
import { cleanGoogleImageUrl } from './utils/imageUtils';
import { categoryImage } from './utils/categoryIcon';
import PublicSite from './components/PublicSite';
import PublicMobileApp, { PublicBottomNav } from './components/PublicMobileApp';
import CustomSelect from './components/CustomSelect';
import CountUp from './components/CountUp';
// Lazy-loaded: pulls in the Capacitor Firebase Authentication SDK, which
// anonymous pre-login visitors (Home/Search/About/Contact) never need until
// they actually tap Login - a static import here would ship that weight in
// the main bundle for every visitor regardless. Every usage site below is
// already gated behind the login-shell or the authenticated dashboard, so
// pre-login browsing never triggers this chunk's fetch at all.
const OtpVerificationModal = lazy(() => import('./components/OtpVerificationModal'));
// Lazy-loaded (Track B pilot): keeps the Shop Settings screen - referral
// program, document/logo upload, credential changes - out of the initial
// bundle. It's only ever reached from inside the authenticated dashboard, so
// splitting it costs nothing on any page load that doesn't visit it.
const ShopSettingsView = lazy(() => import('./views/ShopSettingsView'));
// Lazy-loaded (Track B): the rest of the authenticated dashboard's biggest
// views. Each is only ever reached from inside the dashboard shell (or, for
// CustomerRegistrationWizard, from inside SuperCustomersView/
// CustomerHistoryView's own edit-customer modals, which lazy-import it the
// same way), so none of this costs anonymous marketing-site or native
// pre-login visitors anything.
const ShopsManagementView = lazy(() => import('./views/ShopsManagementView'));
const SuperCustomersView = lazy(() => import('./views/SuperCustomersView'));
const CustomerRegistrationWizard = lazy(() => import('./views/CustomerRegistrationWizard'));
const CustomerHistoryView = lazy(() => import('./views/CustomerHistoryView'));
const SupportConfigView = lazy(() => import('./views/SupportConfigView'));
// Lazy-loaded (Track B batch 3): AdsManagementView and CategoryShopsView are
// straightforward; PromotionsView is the nested trio (PromotionsView wraps
// PromotionsFeed, which renders ProductDetailsView internally) bundled as one
// file/chunk since they're never used independently of each other.
const AdsManagementView = lazy(() => import('./views/AdsManagementView'));
const PromotionsView = lazy(() => import('./views/PromotionsView'));
const CategoryShopsView = lazy(() => import('./views/CategoryShopsView'));
const ReportsPortalView = lazy(() => import('./views/ReportsPortalView'));
// Lazy-loaded (Track B batch 4, final round): every remaining
// authenticated-dashboard view. SupportContactView also default-exports
// CompanyDetailsCard as a named export, used only from inside its own file.
const DashboardView = lazy(() => import('./views/DashboardView'));
const KeysCatalogView = lazy(() => import('./views/KeysCatalogView'));
const DealersView = lazy(() => import('./views/DealersView'));
const RevenueManagementView = lazy(() => import('./views/RevenueManagementView'));
const KeysSearchView = lazy(() => import('./views/KeysSearchView'));
const OffersAdsBannersView = lazy(() => import('./views/OffersAdsBannersView'));
const CustomerCareView = lazy(() => import('./views/CustomerCareView'));
const SupportContactView = lazy(() => import('./views/SupportContactView'));
const StaticInfoView = lazy(() => import('./views/StaticInfoView'));
const FeedbackView = lazy(() => import('./views/FeedbackView'));
import {
  Key, Users, Radio, BarChart3, Database, LogOut, Check, X,
  Plus, Settings, FileText, Search, Filter, UserCheck, MapPin, Camera, AlertTriangle,
  Trash, RefreshCw, Layers, Edit, ExternalLink, Sliders, DollarSign,
  Bell, Eye, EyeOff, CheckCircle2, ChevronRight,
  CreditCard, QrCode, Lock, ShieldCheck, Upload, Mail, Phone,
  ArrowRight, ArrowLeft, Building2, Calendar,
  Store, TrendingUp, UserPlus, Clock, IndianRupee,
  Sparkles,
  User, Hash, UploadCloud, Crosshair, FileCheck, Navigation, KeyRound, Car,
  Tag, Package, Boxes, Percent, Image as ImageIcon, Megaphone, BadgePercent,
  Receipt, CalendarRange, Banknote, PlayCircle, MessageCircle, LifeBuoy,
  Download, Fingerprint, Menu, Home, Languages, Globe,
  Wrench, Cpu, Gauge, ScanLine, Headset, Share2, Copy, Save, Award, Link2,
  GripVertical, Smartphone
} from 'lucide-react';

// Product photos shown on the Dashboard's product-type cards instead of the
// generic line icons below - see DASHBOARD_PRODUCT_CARDS. Swap these .png
// files (src/assets/dashboard-icons/) to change the pictures; the .png
// versions have their black studio background keyed out to transparency
// (see scripts/remove-black-bg.cjs) so they sit cleanly on the card.
import usedMachinesImg from './assets/dashboard-icons/used-machines.png';
import ecmServiceImg from './assets/dashboard-icons/ecm-service.png';
import meterServiceImg from './assets/dashboard-icons/meter-service.png';
import scanningServiceImg from './assets/dashboard-icons/scanning-service.png';
import customerSupportIcon from './assets/dashboard-icons/customer-support.png';
import dealerIcon from './assets/dashboard-icons/dealer.png';
import keyShopLogo from './assets/branding/keyshop-logo.png';



// Web-only URL <-> publicPage mapping (see the `publicPage` state below) so
// PublicSite's Home/Search/About/Contact tabs become real, distinct,
// crawlable URLs instead of one URL with client-only state - previously
// Google could only ever discover a single page for the entire public site.
// Native app never uses this (it has no address bar and PublicMobileApp
// manages its own internal tab state instead), so every reference to this
// map is scoped to the `!IS_NATIVE_APP` code paths.
const PUBLIC_PATH_BY_PAGE = { home: '/', search: '/search', about: '/about', contact: '/contact', login: '/login' };
const PUBLIC_PAGE_BY_PATH = { '/': 'home', '/search': 'search', '/about': 'about', '/contact': 'contact', '/login': 'login' };

const TERMS_AND_CONDITIONS_TITLE = 'Terms and Conditions';
const TERMS_AND_CONDITIONS_BODY = `By creating an account and using this application, you agree to the following:

1. I understand that the server or mobile application may occasionally be slow or unavailable, and I will wait until the service is restored.
2. If I encounter any server errors, application issues, or temporary service interruptions, I understand that they will be resolved as soon as possible and will wait patiently.
3. I will keep all customer information, including photos, personal details, and documents, confidential and will not share them with any unauthorized person or third party.
4. I will use this application only for its intended purpose of managing and storing customer and business information. I will not misuse the application for any illegal, fraudulent, or unauthorized activities.
5. I understand that misuse of the application or violation of these terms may result in suspension or permanent termination of my account without prior notice.
6. Subscription fees are non-refundable. Once a subscription has been purchased, I will not request a refund or transfer the subscription to another person or account.
7. I agree to comply with all applicable laws, regulations, and these Terms and Conditions while using the application.
8. By proceeding with registration, I confirm that I have read, understood, and agree to these Terms and Conditions.`;


// Shared Camera-access resolver, mirroring resolveCurrentLocation() above -
// verifies/requests camera permission before the webcam capture steps in the
// Shop/Customer Registration wizards, classifying failures the same way
// (err.kind = 'permission' | 'unavailable') so the UI can show consistent,
// non-blocking guidance instead of a native alert() dialog.
//
// There's no separate "check without prompting" step here the way
// Geolocation.checkPermissions() provides: getUserMedia() itself is both the
// check AND the request in one call (the browser/WebView shows its own
// permission prompt the first time, and instantly rejects on subsequent
// calls if the user already denied it) - so this just wraps that call with
// the same error classification used elsewhere in the app.
async function resolveCameraAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const err = new Error('Camera capture is not supported on this device/browser. Please upload a photo instead.');
    err.kind = 'unavailable';
    throw err;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    return stream;
  } catch (e) {
    const name = (e && e.name) || '';
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
      const err = new Error('Camera permission is required to take a photo. Please allow camera access, or upload a photo instead.');
      err.kind = 'permission';
      throw err;
    }
    const err = new Error('Camera is unavailable right now. Please upload a photo instead.');
    err.kind = 'unavailable';
    throw err;
  }
}

// Full-screen App Poster (AdType.APP_POSTER) - see App()'s appStateChange
// effect below. Rendered above everything (auth or not), so it's a plain
// standalone overlay rather than something tucked inside the authenticated
// dashboard or PublicMobileApp's own screen stack.
function AppPosterOverlay({ ad, onClose }) {
  return (
    <div className="app-poster-overlay">
      <button type="button" className="app-poster-close" onClick={onClose} aria-label="Close"><X /></button>
      <div className="app-poster-media">
        {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title || ''} />}
      </div>
    </div>
  );
}

// Guards the GPS-default-location resolution (see App()'s effect below) so
// it only ever runs once per app session, never re-attempted on re-render.
let gpsDefaultLocationAttempted = false;

// The six-language translation dictionary lives in its own ~5,000-line
// module (src/i18n/translations.js) and is fetched as a separate chunk
// instead of being statically bundled here - PublicSite (anonymous web
// marketing visitors) and PublicMobileApp (anonymous native pre-login
// browsing) never call t() at all, so they shouldn't have to download it.
// Kicked off here at module scope, the moment App.jsx itself loads, rather
// than inside an effect, so it starts as early as physically possible and
// is very likely already resolved by the time a real user reaches anything
// that needs it (the login overlay, or an already-authenticated session's
// dashboard).
const translationsPromise = import('./i18n/translations');

// Shown in place of any t()-dependent UI (the login/OTP/registration
// overlay, or the authenticated dashboard) for the brief window - typically
// well under a second - after translationsPromise is still pending. Mirrors
// the boot screen below with no text of its own, since text at this point
// would need t() before it's available.
function TranslationsLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: '#ffffff' }}>
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="brand">
          <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" style={{ height: 120, width: 'auto' }} />
        </div>
        <div className="brand-loading-track"><div className="brand-loading-fill" /></div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, isAuthenticated, loading, login, logout, api } = useAuth();
  const [lang, setLang] = useState(localStorage.getItem('kee_lang') || 'en');
  const [langData, setLangData] = useState(null);
  useEffect(() => {
    translationsPromise.then((m) => setLangData(m.default));
  }, []);
  const t = (key) => langData?.[lang]?.[key] || langData?.['en']?.[key] || key;

  // capacitor.config.json sets SplashScreen.launchAutoHide: false, so the
  // native splash (logo on white, see styles.xml) stays on screen until this
  // fires - without it, Android's default behavior dismisses the splash as
  // soon as the WebView has ANY content attached (often a blank frame,
  // before React has mounted), producing a "logo, then blank, then logo
  // again" flash on cold start. This effect runs after the very first
  // render commits - since the branded loading screen below (logo + red
  // bar) is what App() always paints first (loading starts true), the
  // native splash hands off directly to an already-painted, visually
  // identical screen instead of a gap.
  useEffect(() => {
    if (IS_NATIVE_APP) SplashScreen.hide();
  }, []);

  // App Poster (AdType.APP_POSTER) - a full-screen promo shown exactly once
  // per app session, on the initial launch only, regardless of login state
  // (unlike the shop-admin-only "Interactive Login Popup" type). Fetched
  // once in this mount-only effect ([] deps, and App() itself never
  // remounts during the session) - deliberately NOT re-fetched on
  // `appStateChange`/foreground-resume anymore: that used to re-show the
  // poster after any OS-level focus loss (backgrounding to use the camera
  // for document capture, the phone dialer/WhatsApp from a tap-to-call
  // button, SMS-autofill for OTP, etc.), which looked like the poster
  // randomly reappearing mid-registration or mid-OTP-verification. A
  // "session" here means one continuous app process from launch to being
  // fully killed - relaunching starts a fresh session and shows it again.
  const [appPoster, setAppPoster] = useState(null);
  useEffect(() => {
    if (!IS_NATIVE_APP) return;
    api.getPublicAppPoster().then((ad) => setAppPoster(ad || null)).catch(() => {});
  }, []);

  // GPS-based default location for the Key Shops/ECM/Meter/Scanning
  // (CategoryShopsView) and Used Machines (PromotionsFeed) location
  // dropdowns - resolved once per app session (mount-only effect, guarded
  // by the module-level flag below so it's never re-attempted on
  // navigation/re-render, honoring "don't repeatedly request location
  // permission"). On any failure (permission denied, GPS/Location Services
  // off, timeout, no reverse-geocode match) this silently stays '' - every
  // consumer already treats '' as "All Locations", so there's no separate
  // error path to show the user and nothing is ever blocked.
  const [defaultLocation, setDefaultLocation] = useState('');
  // Flips true exactly once, when the GPS-default resolution attempt below
  // finishes - success, failure, or "no match" all count as "we now know the
  // location status." Every Shops/Products screen (CategoryShopsView,
  // DealersView, ShopsManagementView, PromotionsFeed, PublicMobileApp's
  // Shops/Machines tabs) gates its very first data fetch on this instead of
  // fetching immediately with an unresolved '' town: without it, a screen
  // would show all-location results the instant it mounts, then silently
  // re-fetch and swap to location-filtered results once GPS/reverse-geocode
  // finishes a few seconds later - a flicker between two different result
  // sets. Gating on this instead means each screen's skeleton loader simply
  // stays up until the location status (and, if available, the matching
  // fetch) is fully resolved, then renders the correct result set once.
  const [locationReady, setLocationReady] = useState(false);
  useEffect(() => {
    // Wait until AuthContext's own mount effect has restored (or ruled out)
    // a saved session - `isAuthenticated` is unreliably `false` before that,
    // since AuthProvider wraps App and child effects fire before parent
    // effects. Deciding the skip/proceed branch below on a still-loading
    // auth state would incorrectly skip GPS for an actually-authenticated
    // Super Admin web user on every page reload.
    if (loading) return;

    // defaultLocation/locationReady are only ever consumed by PublicMobileApp
    // (native, pre-login) and the authenticated Shops/Products dashboard
    // views (native Shop Admin or web Super Admin) - never by the anonymous
    // web marketing site (PublicSite). Requesting GPS there was pure waste
    // and, worse, popped an unsolicited browser location-permission prompt
    // for visitors just browsing Home/About/Contact who never asked for it.
    if (!IS_NATIVE_APP && !isAuthenticated) {
      setLocationReady(true);
      return;
    }

    if (gpsDefaultLocationAttempted) {
      // Only reachable in dev (React StrictMode's mount/unmount/remount) or
      // HMR - a previous instance already resolved (or is resolving) this
      // same app session, and there's no way to recover that result into
      // this fresh instance. Unblock rendering immediately instead of
      // leaving every Shops/Products screen stuck on its skeleton forever.
      setLocationReady(true);
      return;
    }
    gpsDefaultLocationAttempted = true;
    (async () => {
      try {
        const { lat, lng } = await resolveCurrentLocation();
        const geo = await reverseGeocode(lat, lng);
        if (!geo) return;
        // `city` is the finer town-level granularity, `district` the
        // coarser fallback - matched against the same canonical
        // ALL_TN_LOCATIONS list the dropdowns themselves are built from, so
        // whatever this resolves to is guaranteed to be a valid, selectable
        // option.
        const candidates = [geo.city, geo.district].filter(Boolean);
        const match = candidates
          .map((c) => ALL_TN_LOCATIONS.find((loc) => loc.toLowerCase() === c.toLowerCase()))
          .find(Boolean);
        if (match) setDefaultLocation(match);
      } catch (e) {
        // Permission denied / GPS disabled / timeout - fall through to the
        // '' default (All Locations) already set above.
      } finally {
        setLocationReady(true);
      }
    })();
  }, [loading, isAuthenticated]);

  // Navigation stack for proper Android Back button / back-swipe-gesture
  // support. This app has no router (activeTab is a flat string, switched by
  // conditional rendering below) so the WebView's own history stack stays
  // empty - Capacitor's default back handling then has nothing to "go back"
  // to and just exits the app immediately from any screen. `navStack` tracks
  // the trail of previously-visited tabs so Back can step through it instead.
  // `setActiveTab` below replaces the raw setter everywhere it's already
  // used/passed as a prop (28+ call sites, including deep in child views via
  // `setActiveTab={setActiveTab}`) without needing to touch any of them.
  const [activeTab, setActiveTabRaw] = useState('dashboard');
  const [navStack, setNavStack] = useState([]);

  const setActiveTab = (nextTab) => {
    setActiveTabRaw((current) => {
      if (current === nextTab) return current;
      setNavStack((stack) => [...stack, current]);
      return nextTab;
    });
  };

  // Explicit "go home" - used by the Dashboard entries in the side-nav and
  // mobile bottom-nav. Clears the trail instead of pushing onto it, so
  // Dashboard genuinely behaves as the app's root: Back from Dashboard means
  // "exit", never "go back into whatever screen I was on before I tapped
  // Dashboard".
  const resetToDashboard = () => {
    setNavStack([]);
    setActiveTabRaw('dashboard');
  };

  // Pops one entry off the nav stack and returns to it. If the stack is
  // already empty (e.g. the very first screen after login), falls back to
  // Dashboard rather than doing nothing.
  const goBack = () => {
    setNavStack((stack) => {
      if (stack.length === 0) {
        setActiveTabRaw('dashboard');
        return stack;
      }
      setActiveTabRaw(stack[stack.length - 1]);
      return stack.slice(0, -1);
    });
  };

  // "Press Back again to exit" state - only ever shown while already on the
  // Dashboard/home screen (see the backButton listener below).
  const [exitPromptVisible, setExitPromptVisible] = useState(false);

  useEffect(() => {
    if (!IS_NATIVE_APP) return;
    let exitArmed = false;
    let exitTimer = null;

    const listenerHandle = CapacitorApp.addListener('backButton', () => {
      // Any open modal/dialog/in-progress wizard step always wins first -
      // Back should close/step that back before ever touching screen
      // navigation underneath it.
      if (backHandlerStack.length > 0) {
        setExitPromptVisible(false);
        backHandlerStack[backHandlerStack.length - 1]();
        return;
      }

      if (activeTab !== 'dashboard') {
        setExitPromptVisible(false);
        goBack();
        return;
      }

      // Already on Dashboard/Home: standard Android double-back-to-exit.
      if (exitArmed) {
        CapacitorApp.exitApp();
        return;
      }
      exitArmed = true;
      setExitPromptVisible(true);
      exitTimer = setTimeout(() => {
        exitArmed = false;
        setExitPromptVisible(false);
      }, 2000);
    });

    return () => {
      clearTimeout(exitTimer);
      listenerHandle.then((l) => l.remove()).catch(() => { });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, navStack]);

  // Shop Admin's workspace name, shown as the header page title on every
  // screen except Dashboard (which shows the live search box instead). Fetched
  // once via the existing shop-settings endpoint - Super Admin has no shop, so
  // the header falls back to the static "Key Shop" brand name for that role instead.
  const [shopDisplayName, setShopDisplayName] = useState('');
  useEffect(() => {
    if (!isAuthenticated || user?.role === 'SUPER_ADMIN') return;
    let cancelled = false;
    api.getSettings()
      .then((res) => { if (!cancelled) setShopDisplayName(res?.name || ''); })
      .catch(() => { });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role]);

  // First-launch runtime permission priming (native app only). Proactively
  // asks for Location, Camera and Storage/Media up front, once per device,
  // right after the user logs in for the first time - rather than only ever
  // surfacing each OS prompt reactively the first time a registration wizard
  // happens to need it. This is purely best-effort priming: every individual
  // flow (GPS capture, webcam capture, file pickers) still runs its own
  // check/request via resolveCurrentLocation()/resolveCameraAccess()/
  // primeStoragePermission() at the point of use, so declining here (or the
  // OS never showing a prompt because a permission is already
  // granted/denied) never blocks the app - it just means the user sees the
  // same prompt again later, in context, when they actually tap a
  // location/camera/upload action. Guarded by a localStorage flag so it only
  // ever runs once per install, not on every login.
  useEffect(() => {
    if (!IS_NATIVE_APP || !isAuthenticated) return;
    if (localStorage.getItem('kee_permissions_primed')) return;
    localStorage.setItem('kee_permissions_primed', '1');

    (async () => {
      // Location
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const status = await Geolocation.checkPermissions().catch(() => ({ location: 'prompt' }));
        if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions().catch(() => { });
        }
      } catch (e) {
        console.warn('Location permission priming skipped:', e);
      }

      // Camera - getUserMedia() both checks and requests in one call; stop
      // the stream immediately since this is only priming the OS permission,
      // not actually capturing anything yet.
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (e) {
        console.warn('Camera permission priming skipped:', e);
      }

      // Storage/Media
      await primeStoragePermission();
    })();
  }, [isAuthenticated]);

  // `searchDispatch` ({query, type, nonce}) is a hand-off used by the
  // Dashboard's category cards to jump into another tab pre-filtered to a
  // specific query (see goToProductType/goToAddMachines in DashboardView) -
  // still needed even though the header's own global search box (which used
  // to set this from typed input) has been removed.
  const [searchDispatch, setSearchDispatch] = useState(null);

  const PAGE_TITLES = {
    dashboard: t('dashboard'),
    shops: t('shops'),
    dealers: t('dealersPageTitle') || t('dealers'),
    'key-shops': t('keyShops'),
    ecm: t('ecm'),
    meter: t('meter'),
    scanning: t('scanning'),
    'super-customers': t('customers'),
    keys: t('keys'),
    revenue: t('revenue'),
    'support-config': t('supportConfig'),
    promotions: t('inventory'),
    'search-keys': t('searchKeys'),
    register: t('register'),
    history: t('history'),
    reports: t('reports'),
    'customer-care': t('customerCare'),
    'support-contact': t('supportContactTitle'),
    settings: t('settings'),
  };

  // The header no longer shows the page title as text (replaced by the global
  // search panel below), but the browser tab title still reflects it.
  useEffect(() => {
    document.title = PAGE_TITLES[activeTab] ? `${PAGE_TITLES[activeTab]} | Key Shop` : 'Key Shop';
  }, [activeTab, lang]);

  // Public (unauthenticated) page state, shared by both the web marketing
  // site (PublicSite: home | search | about | contact | login) and the
  // native app's public mobile browsing experience (PublicMobileApp - only
  // cares about the 'login' vs "anything else" distinction, since it owns
  // its own internal Home/Shops/Machines/My Ads tab state). Anonymous
  // visitors land on 'home' either way; tapping Login switches this to
  // 'login', which renders the existing, unmodified login-shell UI below.
  const [publicPage, setPublicPage] = useState(() => {
    if (IS_NATIVE_APP || typeof window === 'undefined') return 'home';
    return PUBLIC_PAGE_BY_PATH[window.location.pathname] || 'home';
  });
  // Web-only: pushes a real URL alongside the state change (native call
  // sites keep using the plain setPublicPage setter above, since the native
  // app has no address bar to reflect). Passed as PublicSite's `onNavigate`.
  const navigatePublicPage = (next) => {
    setPublicPage(next);
    if (typeof window === 'undefined') return;
    const path = PUBLIC_PATH_BY_PAGE[next] || '/';
    if (window.location.pathname !== path) {
      window.history.pushState({ publicPage: next }, '', path);
    }
  };
  // Keeps `publicPage` in sync with browser Back/Forward navigation.
  useEffect(() => {
    if (IS_NATIVE_APP || typeof window === 'undefined') return;
    const onPopState = () => setPublicPage(PUBLIC_PAGE_BY_PATH[window.location.pathname] || 'home');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  // Which PublicMobileApp tab to land on when native returns from the login
  // screen to browsing - set right before switching publicPage back, e.g. by
  // the login screen's own bottom nav (see the login-shell render branch).
  const [publicInitialTab, setPublicInitialTab] = useState('home');

  // Native app's login is an overlay dialog on top of PublicMobileApp (not a
  // full-page navigation) - hardware Back should just close it back to
  // whichever public tab was showing underneath, same as tapping the
  // backdrop. Registers on the same shared backHandlerStack every other
  // modal in the app uses, so it's popped before any tab-level back handling
  // inside the still-mounted PublicMobileApp underneath.
  useBackHandler(IS_NATIVE_APP && publicPage === 'login', () => setPublicPage('home'));

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // Shown only if login is still pending after a few seconds - the backend
  // host spins down after ~15 min idle, and the first request after that
  // pays a real 30-70s cold-start penalty (unrelated to any app bug). A
  // bare spinner for that long reads as broken; this reassures the user
  // it's just waking up.
  const [authSlowNotice, setAuthSlowNotice] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  // Header "Refer" action - Shop Admin only (Super Admin has no shop of its
  // own, so there's nothing to attach a referral code to). Reuses the same
  // idempotent generate-or-fetch endpoint as the Shop Settings referral card.
  const [headerReferralSharing, setHeaderReferralSharing] = useState(false);
  const handleHeaderReferShare = async () => {
    if (headerReferralSharing) return;
    setHeaderReferralSharing(true);
    try {
      const { referralCode } = await api.generateReferralCode();
      const message = t('referralShareMessageTemplate').replace('{code}', referralCode).replace('{url}', KEE_LANDING_PAGE_URL);
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ text: message });
      } else if (navigator.share) {
        await navigator.share({ text: message });
      } else {
        await navigator.clipboard.writeText(message);
        alert(t('referralMessageCopiedMsg'));
      }
    } catch (err) {
      alert(err.message || t('failedGenerateReferralCodeMsg'));
    } finally {
      setHeaderReferralSharing(false);
    }
  };
  const [autoOpenShopModal, setAutoOpenShopModal] = useState(false);
  const [autoOpenListingModal, setAutoOpenListingModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLangDialog, setShowLangDialog] = useState(false);
  const [downloadToastVisible, setDownloadToastVisible] = useState(false);
  const langDialogCardRef = useRef(null);

  useEffect(() => {
    const handleDocDownloaded = () => {
      setDownloadToastVisible(true);
      setTimeout(() => setDownloadToastVisible(false), 3000);
    };
    window.addEventListener('document_downloaded', handleDocDownloaded);
    return () => window.removeEventListener('document_downloaded', handleDocDownloaded);
  }, []);

  // Auto-download customer report PDF when opening deep link e.g. ?downloadDoc=... or ?action=download_doc&...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const downloadDocId = params.get('downloadDoc');

    if (downloadDocId || action === 'download_doc') {
      const id = downloadDocId || params.get('id');
      const name = params.get('name') || 'Customer';
      const phone = params.get('phone') || 'N/A';
      const keyNumber = params.get('keyNumber') || '';
      const address = params.get('address') || '';
      const vehicleNumber = params.get('vehicleNumber') || '';
      const billAmount = params.get('billAmount') || '';
      const shopName = params.get('shopName') || 'Key Shops';
      const vehicleCategory = params.get('vehicleCategory') || '';

      (async () => {
        try {
          let customerData = null;
          let shopData = { name: shopName, address: 'N/A', phone: 'N/A' };

          if (id && api && api.getSuperCustomers) {
            try {
              const custs = await api.getSuperCustomers(id).catch(() => null);
              if (custs) {
                customerData = Array.isArray(custs) ? custs.find(c => c.id === id) || custs[0] : custs;
              }
            } catch (e) {}
          }

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>{t('phoneContactLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.phone || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(viewCust.createdAt).toLocaleString()}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>{t('addressLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{viewCust.address || viewCust.capturedAddress || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-active"><span className="dot" />{viewCust.keyNumber || viewCust.keyCode || 'N/A'}</span>
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>Vehicle / Key Type</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{viewCust.vehicleCategory || viewCust.lockCategory || viewCust.keyType || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Tag /></div><b>Key / Vehicle Name</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.vehicleName || viewCust.homeOfficeName || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CheckCircle2 /></div><b>Add Key / Lost Key</b></div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${viewCust.addKey ? 'badge-active' : 'badge-suspended'}`}>Add: {viewCust.addKey ? 'Yes' : 'No'}</span>
                    <span className={`badge ${viewCust.lostKey ? 'badge-active' : 'badge-suspended'}`}>Lost: {viewCust.lostKey ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><DollarSign /></div><b>Bill ID & Amount</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gold)' }}>
                    {viewCust.billNumber || viewCust.billId || 'N/A'} {viewCust.billAmount != null && viewCust.billAmount !== '' ? `(₹${Number(viewCust.billAmount).toFixed(2)})` : '(N/A)'}
                  </span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>{t('idVerificationLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.idProofType || viewCust.idType || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('idNumberDecryptedLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{viewCust.idProofNumber || viewCust.idNumber || 'N/A'}</span>
                </div>
              </div>
            </div>

          if (!customerData) {
            customerData = {
              name,
              phone,
              keyNumber,
              vehicleNumber,
              capturedAddress: address,
              address,
              billAmount: billAmount ? Number(billAmount) : null,
              vehicleCategory,
              createdAt: new Date().toISOString(),
            };
          }

          const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
          const pdf = await buildCustomerReportPdf({
            customer: customerData,
            shop: customerData.shop || shopData,
            registeredByName: customerData.registeredByName || shopName,
          });
          const safeName = `${name.trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
          await downloadPdf(pdf, safeName);
        } catch (err) {
          console.error('Failed auto-download of customer document:', err);
        }
      })();
    }
  }, []);

  // Side-drawer and language dialog are both full-screen overlays - Back
  // should close them, not navigate the screen underneath.
  useBackHandler(mobileNavOpen, () => setMobileNavOpen(false));
  useBackHandler(showLangDialog, () => setShowLangDialog(false));

  // Auto-close the language dialog the instant the user interacts with
  // anything outside it - another sidebar link, a header/mobile-nav button,
  // etc. A document-level listener (rather than relying solely on the
  // dialog's own backdrop) is used because the mobile bottom-nav bar sits
  // at a higher z-index (60) than the dialog backdrop (50), so clicks on it
  // land directly on the nav button instead of the backdrop - but the click
  // still bubbles up to `document`, so this reliably catches it regardless
  // of stacking order, letting the underlying button's own onClick (e.g.
  // switching tabs) fire normally in the same click.
  useEffect(() => {
    if (!showLangDialog) return;
    const handleOutsideClick = (e) => {
      if (langDialogCardRef.current && !langDialogCardRef.current.contains(e.target)) {
        setShowLangDialog(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLangDialog]);

  // Forgot password flow states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMethod, setResetMethod] = useState(null); // 'email' | 'phone' | null
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [showResetOtpModal, setShowResetOtpModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Shop Self-Registration states - two-step wizard: Step 1 collects the
  // shop/owner details shown in the public registration screenshot (name,
  // shop name, address+GPS, city, state, PIN code, optional Aadhaar number,
  // OTP-verified mobile number); Step 2 collects password, subscription
  // plan and payment before submitting.
  const [showRegisterShop, setShowRegisterShop] = useState(false);
  const [regShopName, setRegShopName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  // Optional shop email, gated behind an ON/OFF toggle that defaults OFF -
  // same pattern as regWebsiteUrlEnabled below (the field is only rendered,
  // and only sent to the backend, when enabled).
  const [regEmailEnabled, setRegEmailEnabled] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPhoneError, setRegPhoneError] = useState('');
  const [regLocation, setRegLocation] = useState('');
  // Raw GPS coordinates from captureShopLocation, kept alongside the
  // free-text `regLocation` address so they can be sent to the backend and
  // shown to the shop owner - previously captured only to build the address
  // string, then silently discarded (never stored or displayed).
  const [regLat, setRegLat] = useState(null);
  const [regLng, setRegLng] = useState(null);
  const [regLocLoading, setRegLocLoading] = useState(false);
  const [regLocError, setRegLocError] = useState('');
  const [regLocErrorKind, setRegLocErrorKind] = useState('');
  // City & State are auto-filled from reverse-geocoding the GPS position
  // captured via "Current Location" (Nominatim's district/state - see
  // captureShopLocation and geo.controller.ts) but stay editable in case
  // the auto-detected value needs correcting.
  const [regCity, setRegCity] = useState('');
  // Town/city-level locality (e.g. "Gopichettipalayam"), auto-filled from
  // Nominatim's `city` field (see geo.controller.ts) alongside regCity above
  // - despite its name, regCity actually holds the district (state_district),
  // so this is a separate, real town-level value sent to the backend as
  // RegisterShopDto.town, powering the public Shops/Machines town filter.
  const [regTown, setRegTown] = useState('');
  const [regState, setRegState] = useState('');
  const [regPinCode, setRegPinCode] = useState('');
  const [regAadhaarNumber, setRegAadhaarNumber] = useState('');
  // Optional shop website, gated behind an ON/OFF toggle that defaults OFF -
  // the field itself is only rendered (and only sent to the backend) when
  // enabled, see RegisterShopDto.website in auth.dto.ts.
  const [regWebsiteUrlEnabled, setRegWebsiteUrlEnabled] = useState(false);
  const [regWebsiteUrl, setRegWebsiteUrl] = useState('');
  // Optional code entered by the new shop owner, validated server-side against
  // another shop's Shop.referralCode (see ShopService.getOrCreateReferralCode).
  const [regReferralCode, setRegReferralCode] = useState('');
  const [regTermsAccepted, setRegTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  // Shop "type" dropdown, populated from the Super-Admin-curated list (see
  // ShopCategoriesView) via the public GET /api/shop-categories endpoint -
  // fetched once the registration dialog opens (see useEffect below).
  const [regCategoryId, setRegCategoryId] = useState('');
  const [regCategories, setRegCategories] = useState([]);
  const [regCategoriesLoading, setRegCategoriesLoading] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  // Single yearly plan platform-wide - price is Super Admin-configurable
  // (see SupportConfigView / PlatformConfig.subscriptionPrice).
  const [regSubscriptionPrice, setRegSubscriptionPrice] = useState(999);
  const [regGstPercent, setRegGstPercent] = useState(18);
  const [regError, setRegError] = useState('');
  const [regSuccessMessage, setRegSuccessMessage] = useState('');
  // Login email returned by the backend (echoes dto.email - see
  // AuthService.registerShop) - shown once on the success screen so the
  // owner knows they can log in with either this email or their mobile
  // number, both sharing the one password set in Step 1.
  const [regLoginEmail, setRegLoginEmail] = useState('');
  const [regStep, setRegStep] = useState(1); // 1: Owner/shop details, email, mobile OTP & password, 2: Plan & payment
  // Pre-login shop signup wizard: Back steps back one stage while mid-flow,
  // same as the authenticated CustomerRegistrationWizard above. At step 1
  // there's nothing to intercept, so Back correctly falls through to the
  // normal double-press-to-exit behavior (there's no screen "under" the
  // signup form before you're logged in).
  useBackHandler(regStep > 1, () => setRegStep((s) => Math.max(1, s - 1)));

  // Mobile OTP verification - Step 1's Mobile Number field triggers the
  // shared OtpVerificationModal (phone-only - there's no email to verify
  // against here since email is optional and unverified).
  const [regOtpVerified, setRegOtpVerified] = useState(false);
  const [showRegOtpModal, setShowRegOtpModal] = useState(false);

  // Self-Registration Payment state - Step 2 opens the real Razorpay
  // Checkout widget (which offers card/UPI/netbanking/wallet on its own),
  // so there's no in-app payment-method form to hold state for anymore.
  const [regPayProcessing, setRegPayProcessing] = useState(false);

  // Password visibility states
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showVerifyPass, setShowVerifyPass] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    }
  }, [isAuthenticated, user]);

  // Populate the registration wizard's Category dropdown as soon as the
  // dialog opens - this must work pre-login, since self-registration has no
  // auth token yet (see api.getShopCategories).
  useEffect(() => {
    if (!showRegisterShop) return;
    setRegCategoriesLoading(true);
    api.getShopCategories()
      .then((cats) => setRegCategories(cats || []))
      .catch((e) => console.error('Failed to load shop categories:', e))
      .finally(() => setRegCategoriesLoading(false));
  }, [showRegisterShop]);

  // Single platform-wide yearly subscription price, Super Admin-configurable
  // (see SupportConfigView) - also public/pre-login since it's needed here.
  useEffect(() => {
    if (!showRegisterShop) return;
    api.getSupportConfig()
      .then((cfg) => {
        setRegSubscriptionPrice(cfg.subscriptionPrice ?? 999);
        setRegGstPercent(cfg.gstPercent ?? 18);
      })
      .catch((e) => console.error('Failed to load subscription price:', e));
  }, [showRegisterShop]);



  const fetchNotifications = async () => {
    try {
      let res;
      if (user?.role === 'SUPER_ADMIN') {
        res = await api.getSuperNotifications();
      } else {
        res = await api.getNotifications();
      }
      const sorted = [...res].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setNotifications(sorted);
      setUnreadCount(sorted.filter(n => !n.isRead).length);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    setAuthSlowNotice(false);
    const slowTimer = setTimeout(() => setAuthSlowNotice(true), 4000);
    try {
      await login(authEmail, authPassword);
      resetToDashboard();
    } catch (err) {
      setAuthError(err.message || t('loginFailedCheckCredentialsMsg'));
    } finally {
      clearTimeout(slowTimer);
      setAuthSlowNotice(false);
      setAuthLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    if (newPassword !== confirmPassword) {
      setResetError(t('passwordsDoNotMatchMsg'));
      return;
    }
    setResetLoading(true);
    try {
      await api.resetPasswordPublic(resetIdentifier, resetMethod, newPassword);
      setResetSuccess(true);
    } catch (err) {
      setResetError(err.message || t('passwordResetFailedMsg'));
    } finally {
      setResetLoading(false);
    }
  };

  const resetForgotPasswordFlow = () => {
    setShowForgotPassword(false);
    setResetMethod(null);
    setResetIdentifier('');
    setOtpVerified(false);
    setShowResetOtpModal(false);
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetSuccess(false);
  };

  // Inline mobile OTP verification trigger for Step 1 - phone-only, no email
  // option. Actual send/verify/resend/countdown lives in the shared
  // OtpVerificationModal (see showRegOtpModal below).
  // Always opens the popup - phone-format validation happens inside the
  // modal itself (see OtpVerificationModal's sendCode), so a bad number
  // shows an inline error in the dialog instead of a blocking alert() that
  // prevents the popup from ever appearing.
  const handleOpenRegOtpModal = () => {
    const normalized = normalizePhone(regPhone);
    if (!normalized) {
      setRegPhoneError(PHONE_REGEX_MESSAGE);
      return;
    }
    setRegPhoneError('');
    if (normalized !== regPhone) setRegPhone(normalized);
    setShowRegOtpModal(true);
  };

  // "Current Location" button for the Shop Registration wizard - captures the
  // device's real GPS position and reverse-geocodes it into the free-text
  // location field, plus auto-fills the dedicated City & State fields from
  // Nominatim's district/state (see geo.controller.ts - `district`, not
  // `city`, is used because state_district is the correct Indian
  // administrative "district", matching what the City field expects here).
  // All three fields stay normal editable inputs afterwards, so the shop
  // owner can correct/refine whatever gets auto-filled.
  const captureShopLocation = async () => {
    setRegLocError('');
    setRegLocErrorKind('');
    setRegLocLoading(true);
    let lat, lng;
    try {
      ({ lat, lng } = await resolveCurrentLocation());
    } catch (e) {
      setRegLocError(e.message);
      setRegLocErrorKind(e.kind || 'unavailable');
      setRegLocLoading(false);
      return;
    }
    setRegLat(lat);
    setRegLng(lng);
    const data = await reverseGeocode(lat, lng);
    if (data) {
      // Complete Shop Address field shows the full formatted address (same
      // pattern as the Customer Registration wizard's captureCustomerLocation)
      // rather than just street+locality, since City/State/PIN Code are no
      // longer separate visible fields - this is the only address text the
      // owner sees and can edit.
      const fullAddress = data.displayName || [data.street, data.locality].filter(Boolean).join(', ');
      setRegLocation(fullAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      if (data.district) setRegCity(data.district);
      if (data.city) setRegTown(data.city);
      if (data.state) setRegState(data.state);
      if (data.postcode) setRegPinCode(data.postcode.replace(/\D/g, ''));
      setRegLocLoading(false);
      return;
    }
    setRegLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setRegLocLoading(false);
  };

  const handleRegCheckout = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegPayProcessing(true);

    // Order is created server-side for the platform's real subscription
    // price (the client never sends an amount) - see PaymentService.createSubscriptionOrder.
    let order;
    try {
      order = await api.createPaymentOrder();
    } catch (err) {
      setRegPayProcessing(false);
      setRegError(err.message || t('failedInitCheckout'));
      return;
    }

    // Hand off to Razorpay's own Checkout modal (card/UPI/netbanking/wallet
    // all built in) - drop our own "processing" overlay while it's open so
    // the two don't visually stack.
    setRegPayProcessing(false);

    openRazorpayCheckout({
      order,
      prefill: {
        name: regOwnerName,
        contact: regPhone,
        ...(regEmailEnabled && regEmail ? { email: regEmail.trim() } : {}),
      },
      description: `${regShopName} - Yearly Subscription`,
      onSuccess: async (response) => {
        setRegPayProcessing(true);
        try {
          const res = await api.registerShop({
            shopName: regShopName,
            ownerName: regOwnerName,
            categoryId: regCategoryId,
            email: regEmailEnabled && regEmail ? regEmail.trim() : undefined,
            phone: regPhone,
            location: regLocation,
            city: regCity,
            town: regTown,
            state: regState,
            pinCode: regPinCode,
            aadhaarNumber: regAadhaarNumber || undefined,
            website: regWebsiteUrlEnabled && regWebsiteUrl ? regWebsiteUrl.trim() : undefined,
            referralCode: regReferralCode || undefined,
            password: regPassword,
            latitude: regLat ?? undefined,
            longitude: regLng ?? undefined,
            // Verified server-side (HMAC against the key secret) before the
            // shop account is created - see AuthService.registerShop.
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });

          setRegPayProcessing(false);
          setRegLoginEmail(res.loginEmail || '');
          setRegSuccessMessage(res.message || t('registrationSuccessfulShopActiveMsg'));
        } catch (err) {
          setRegPayProcessing(false);
          setRegError(err.message || t('selfRegistrationFailedMsg'));
        }
      },
      // User closed the Razorpay modal without paying - just stop showing
      // "processing"; no shop account was touched, they can hit Pay again.
      onDismiss: () => setRegPayProcessing(false),
      onError: (err) => {
        setRegPayProcessing(false);
        setRegError(err.message);
      },
    });
  };

  // Shared by both close and (re)open - the dialog's own useState lives in
  // this persistently-mounted parent (it's an overlay toggled by a boolean,
  // not a separate tab that unmounts), so leaving via any path that isn't
  // the X button (e.g. Android hardware back) previously left regOtpVerified
  // stuck true - relocking the disabled phone field - on the next open.
  const clearRegisterShopFields = () => {
    setRegShopName('');
    setRegOwnerName('');
    setRegEmail('');
    setRegPhone('');
    setRegLocation('');
    setRegLat(null);
    setRegLng(null);
    setRegLocLoading(false);
    setRegLocError('');
    setRegLocErrorKind('');
    setRegCity('');
    setRegState('');
    setRegPinCode('');
    setRegAadhaarNumber('');
    setRegWebsiteUrlEnabled(false);
    setRegWebsiteUrl('');
    setRegCategoryId('');
    setRegPassword('');
    setRegError('');
    setRegSuccessMessage('');
    setRegLoginEmail('');
    setRegOtpVerified(false);
    setShowRegOtpModal(false);
    setRegPayProcessing(false);
    setRegStep(1);
  };

  const resetRegisterShopFlow = () => {
    setShowRegisterShop(false);
    clearRegisterShopFields();
  };

  const openRegisterShopFlow = () => {
    clearRegisterShopFields();
    setShowRegisterShop(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: '#ffffff' }}>
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="brand">
            <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" style={{ height: 120, width: 'auto' }} />
          </div>
          <div className="brand-loading-track"><div className="brand-loading-fill" /></div>
          {/* Shown before we've restored the saved session, i.e. before we
              even know what to fetch translations for - hardcoded rather
              than t()-driven so it can't ever render a raw i18n key while
              the (separately chunked, see translationsPromise) dictionary
              is still in flight. */}
          <p style={{ color: 'var(--text-3)' }} className="text-sm font-semibold">Bootstrapping your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {appPoster && <AppPosterOverlay ad={appPoster} onClose={() => setAppPoster(null)} />}
      {!isAuthenticated ? (
        <>
        {IS_NATIVE_APP && (
          <PublicMobileApp api={api} onLogin={() => setPublicPage('login')} initialTab={publicInitialTab} defaultTown={defaultLocation} locationReady={locationReady} />
        )}
        {publicPage !== 'login' ? (
          !IS_NATIVE_APP && <PublicSite page={publicPage} onNavigate={navigatePublicPage} api={api} />
        ) : !langData ? (
          <TranslationsLoadingFallback />
        ) : (
          <>
          <div className={`login-shell${IS_NATIVE_APP ? ' native-login login-overlay' : ''}`}>
            <div className="login-side" style={IS_NATIVE_APP ? { display: 'none' } : undefined}>
              <div className="glow"></div>
              <div className="side-copy">
                <span className="pill-badge" style={{ marginBottom: 18 }}>
                  <span className="dot"></span>
                  {t('trustedByShopsBadge')}
                </span>
                <h2>{t('runYourShopHeading')}<span className="gold-line">{t('smartGoldStandardWaySpan')}</span></h2>
                <p>{t('trackDuplicateKeysDesc')}</p>
              </div>

              <div className="phone-frame">
                <div className="phone-notch"></div>
                <div className="phone-screen">
                  <div className="p-head">
                    <span className="p-title">{t('keyShopDashboardLabel')}</span>
                    <span className="phone-badge"></span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="phone-stat">
                      <div className="num">1,284</div>
                      <div className="lbl">{t('customersStatLabel')}</div>
                    </div>
                    <div className="phone-stat">
                      <div className="num">3,910</div>
                      <div className="lbl">{t('keysCutStatLabel')}</div>
                    </div>
                  </div>
                  <div className="phone-mini-bars">
                    <div className="mb" style={{ height: '35%' }}></div>
                    <div className="mb" style={{ height: '55%' }}></div>
                    <div className="mb" style={{ height: '40%' }}></div>
                    <div className="mb" style={{ height: '72%' }}></div>
                    <div className="mb" style={{ height: '58%' }}></div>
                    <div className="mb" style={{ height: '90%' }}></div>
                    <div className="mb" style={{ height: '64%' }}></div>
                  </div>
                  <div className="phone-row">
                    <div className="dotpic"></div>
                    <div className="lines"><div className="l1"></div><div className="l2"></div></div>
                  </div>
                  <div className="phone-row">
                    <div className="dotpic"></div>
                    <div className="lines"><div className="l1"></div><div className="l2"></div></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="login-form-side">
              <div className="login-box animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button type="button" className="back-to-home-link" onClick={() => { setPublicInitialTab('home'); setPublicPage('home'); }} aria-label={t('backToHomeLink')}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--card-2)', border: '1.5px solid var(--border-2)', borderRadius: 999, padding: '4px 12px' }}>
                    <Globe className="h-3.5 w-3.5" style={{ color: 'var(--gold)' }} />
                    <select
                      value={lang}
                      onChange={(e) => { setLang(e.target.value); localStorage.setItem('kee_lang', e.target.value); }}
                      style={{ background: 'transparent', color: 'var(--text-1)', border: 'none', fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer', paddingRight: 4 }}
                    >
                      <option value="en" style={{ background: '#181512', color: '#ffffff' }}>English</option>
                      <option value="hi" style={{ background: '#181512', color: '#ffffff' }}>Hindi (हिन्दी)</option>
                      <option value="ta" style={{ background: '#181512', color: '#ffffff' }}>Tamil (தமிழ்)</option>
                      <option value="te" style={{ background: '#181512', color: '#ffffff' }}>Telugu (తెలుగు)</option>
                      <option value="kn" style={{ background: '#181512', color: '#ffffff' }}>Kannada (ಕನ್ನಡ)</option>
                      <option value="ml" style={{ background: '#181512', color: '#ffffff' }}>Malayalam (മലയാളം)</option>
                    </select>
                  </div>
                </div>
                <div className="brand">
                  <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
                </div>
                <h1>{t('welcomeBackHeading')}</h1>
                <p className="lead">{t('signInLeadDesc')}</p>

                {authError && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', color: '#b91c1c', padding: '12px 14px', borderRadius: 13, marginBottom: 20, fontSize: 12.5, fontWeight: 600 }}>
                    <AlertTriangle className="h-4 w-4 shrink-0" style={{ marginTop: 1 }} />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit}>
                  <div className="reg-section">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Mail /></div><b>{t('emailOrMobileLabel')} <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="text" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder={t('emailOrMobilePlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('passwordLabel')} <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type={showAuthPassword ? "text" : "password"} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" style={{ paddingRight: 42 }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAuthPassword(!showAuthPassword)}
                          className="pwd-toggle-btn"
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                        >
                          {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="field-row">
                    <label className="remember">
                      <input type="checkbox" defaultChecked />
                      {t('rememberMeLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="forgot-link"
                    >
                      {t('forgotPasswordLink')}
                    </button>
                  </div>
                  <button
                    type="submit" disabled={authLoading}
                    className="btn btn-primary btn-block"
                  >
                    {authLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <>{t('signInToKeyShopBtn')} <ArrowRight /></>}
                  </button>
                  {authSlowNotice && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 10 }}>
                      {t('serverWakingUpMsg')}
                    </p>
                  )}
                </form>

                {/* Shop Admin accounts can't sign in on web (see auth.service.ts) -
                  give them a direct way to get the app right where they'll hit
                  that error, instead of leaving them stuck on this screen. */}
                {!IS_NATIVE_APP && (
                  <a
                    href="/downloads/keyshop-app.keeapp"
                    download="KeyShop.apk"
                    className="btn btn-outline btn-block"
                    style={{ marginTop: 12 }}
                  >
                    <Download className="h-4 w-4" /> {t('shopAdminDownloadAppBtn')}
                  </a>
                )}

                <div className="login-foot" style={{ marginTop: 20 }}>
                  {t('wantToRegisterShopMsg')}{' '}
                  <button
                    type="button"
                    onClick={openRegisterShopFlow}
                  >
                    {t('createShopAccountBtn')}
                  </button>
                </div>
              </div>
            </div>

            {/* Forgot Password Overlay Modal */}
            {showForgotPassword && (
              <div className="fixed inset-0 z-[60] flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
                <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 32, margin: 'auto', position: 'relative' }}>
                  <button
                    onClick={resetForgotPasswordFlow}
                    className="icon-btn"
                    style={{ position: 'absolute', top: 18, right: 18 }}
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="flex flex-col items-center mb-6" style={{ textAlign: 'center' }}>
                    <div className="icon-badge solid" style={{ marginBottom: 10 }}>
                      <Lock />
                    </div>
                    <h2 style={{ fontSize: 20 }}>{t('resetYourPasswordTitle')}</h2>
                    <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('secureRecoveryWorkspaceDesc')}</p>
                  </div>

                  {resetError && (
                    <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', marginBottom: 16, fontWeight: 600 }}>
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{resetError}</span>
                    </div>
                  )}

                  {resetSuccess ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div className="icon-badge green" style={{ margin: '0 auto 14px' }}>
                        <Check />
                      </div>
                      <p style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13, fontFamily: 'var(--display)' }}>{t('passwordResetSuccessMsg')}</p>
                      <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4, marginBottom: 20 }}>{t('signInWithNewCredentialsMsg')}</p>
                      <button
                        onClick={resetForgotPasswordFlow}
                        className="btn btn-primary btn-block"
                      >
                        {t('returnToLoginBtn')}
                      </button>
                    </div>
                  ) : resetMethod === null ? (
                    <div>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.6, marginBottom: 18 }}>
                        {t('selectVerificationMethodDesc')}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setResetMethod('email')}
                          className="qa-btn"
                          style={{ flexDirection: 'column', textAlign: 'center', gap: 10, minWidth: 0 }}
                        >
                          <span className="icon-badge blue"><Mail /></span>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('emailOtpLabel')}</span>
                        </button>
                        <button
                          onClick={() => setResetMethod('phone')}
                          className="qa-btn"
                          style={{ flexDirection: 'column', textAlign: 'center', gap: 10, minWidth: 0 }}
                        >
                          <span className="icon-badge teal"><Phone /></span>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('phoneOtpLabel')}</span>
                        </button>
                      </div>
                      <button
                        onClick={resetForgotPasswordFlow}
                        className="btn btn-ghost btn-block"
                        style={{ marginTop: 14 }}
                      >
                        {t('btnCancel')}
                      </button>
                    </div>
                  ) : !otpVerified ? (
                    <form onSubmit={(e) => { e.preventDefault(); setShowResetOtpModal(true); }}>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
                        {t('enterRegisteredMethodTemplate').split('{method}')[0]}{resetMethod === 'email' ? t('emailOtpLabel') : t('phoneOtpLabel')}{t('enterRegisteredMethodTemplate').split('{method}')[1]}
                      </p>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: resetMethod === 'email' ? 'var(--blue)' : 'var(--teal)' }}>{resetMethod === 'email' ? <Mail /> : <Phone />}</div><b>{resetMethod === 'email' ? t('registeredEmailLabel') : t('registeredPhoneNumberLabel')} <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type={resetMethod === 'email' ? 'email' : 'text'}
                            required
                            value={resetIdentifier}
                            onChange={(e) => setResetIdentifier(e.target.value)}
                            placeholder={resetMethod === 'email' ? 'e.g. shop@keyshop.com' : 'e.g. +91 99999 99999'}
                          />
                        </div>
                      </div>
                      {resetError && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>{resetError}</div>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setResetMethod(null); setResetIdentifier(''); }}
                          className="btn btn-ghost"
                          style={{ flex: 1 }}
                        >
                          {t('btnBack')}
                        </button>
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="btn btn-primary"
                          style={{ flex: 2 }}
                        >
                          {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('sendOtpCodeBtn')}
                        </button>
                      </div>

                      <Suspense fallback={null}>
                      <OtpVerificationModal
                        open={showResetOtpModal}
                        onClose={() => setShowResetOtpModal(false)}
                        onVerified={() => setOtpVerified(true)}
                        api={api}
                        identifier={resetIdentifier}
                        method={resetMethod || 'email'}
                        purpose="reset"
                        title={t('verifyOtpModalTitle')}
                        description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', resetIdentifier)}
                        t={t}
                      />
                      </Suspense>
                    </form>
                  ) : (
                    <form onSubmit={handleResetPasswordSubmit}>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
                        {t('otpVerifiedSetNewPasswordMsg')}
                      </p>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('newPasswordLabel')} <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t('min6CharactersPlaceholder')}
                          />
                        </div>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('confirmPasswordLabel')} <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t('retypePasswordPlaceholder')}
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="btn btn-primary btn-block"
                      >
                        {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('updatePasswordBtn')}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {showRegisterShop && (

              <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
                <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 460, margin: 'auto', padding: 28 }}>
                  <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
                    <div>
                      <span className="eyebrow" style={{ marginBottom: 4 }}><Building2 />{t('shopOnboardingEyebrow')}</span>
                      <h2 style={{ fontSize: 19 }}>{t('registerYourKeyShopTitle')}</h2>
                    </div>
                    <button
                      onClick={() => {
                        resetRegisterShopFlow();
                        setRegStep(1);
                      }}
                      className="icon-btn"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {regSuccessMessage ? (
                    <div style={{ textAlign: 'center', padding: '18px 0' }}>
                      <div className="icon-badge green" style={{ margin: '0 auto 16px' }}>
                        <Check />
                      </div>
                      <h3 style={{ fontSize: 16 }}>{t('registrationSubmittedTitle')}</h3>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, padding: '0 8px', marginTop: 8, marginBottom: regLoginEmail ? 12 : 20 }}>
                        {regSuccessMessage}
                      </p>
                      {regLoginEmail && (
                        <div style={{ background: 'var(--card-2)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 20 }}>
                          <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                            {t('canLogInWithEitherMsg')}
                          </p>
                          <p style={{ fontSize: 14, color: 'var(--gold)', fontWeight: 800 }}>{regLoginEmail}</p>
                          {regPhone && <p style={{ fontSize: 14, color: 'var(--gold)', fontWeight: 800, marginTop: 2 }}>{regPhone}</p>}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          resetRegisterShopFlow();
                          setRegStep(1);
                        }}
                        className="btn btn-ghost"
                      >
                        {t('returnToLoginBtn')}
                      </button>
                    </div>
                  ) : (
                    <div>
                      {regError && (
                        <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{regError}</span>
                        </div>
                      )}

                      {/* STEP 1: Basic Details - a single flat form (no section labels),
                matching the app's registration screenshot, including inline
                mobile OTP verification and password - not separate steps. */}
                      {regStep === 1 && (
                        <div>
                          <div className="reg-section">
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><UserCheck /></div><b>{t('nameLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type="text" required value={regOwnerName} onChange={(e) => setRegOwnerName(e.target.value)}
                                  placeholder="e.g. Rajesh Kumar"
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><Building2 /></div><b>{t('shopNameLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type="text" required value={regShopName} onChange={(e) => setRegShopName(e.target.value)}
                                  placeholder="e.g. Metro Duplicate Keys"
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label">
                                <div className="reg-ico" style={{ background: 'var(--orange)' }}><MapPin /></div>
                                <b>{t('shopAddressLabel')} <span className="req">*</span></b>
                                <button
                                  type="button" onClick={captureShopLocation} disabled={regLocLoading}
                                  className="reg-trailing loc-btn"
                                >
                                  <Crosshair className={regLocLoading ? 'animate-spin' : ''} />
                                  <span>{regLocLoading ? t('locatingLabel') : t('currentLocationBtn')}</span>
                                </button>
                              </div>
                              <div className="input-wrap">
                                <input
                                  type="text" required value={regLocation}
                                  onChange={(e) => {
                                    setRegLocation(e.target.value);
                                    // Once the owner starts typing their own address, the
                                    // stale "Current Location" failure banner no longer
                                    // applies - they've moved on to manual entry, which is
                                    // fully valid on its own (see the Continue handler below).
                                    if (regLocError) {
                                      setRegLocError('');
                                      setRegLocErrorKind('');
                                    }
                                  }}
                                  placeholder={t('streetLandmarkPlaceholder')}
                                />
                              </div>
                              {/* GPS coordinates captured via the button above are reverse-geocoded
                        server-side and used to silently fill City/State/PIN Code (regCity/
                        regState/regPinCode) as optional metadata alongside the free-text
                        address, and shown here so the owner can confirm what will be stored -
                        but none of the three are required to proceed (see Continue below);
                        Address is the one location field the owner must always be able to
                        fill in by hand when GPS/reverse-geocoding isn't available. */}
                              {regLat != null && regLng != null && (
                                <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <MapPin style={{ width: 11, height: 11 }} /> {regLat.toFixed(5)}, {regLng.toFixed(5)}
                                </p>
                              )}
                              {regLocError && (
                                <div style={{ marginTop: 6 }}>
                                  <p style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{regLocError}</p>
                                  {regLocErrorKind === 'disabled' && (
                                    <button
                                      type="button"
                                      onClick={openDeviceLocationSettings}
                                      className="cursor-pointer select-none"
                                      style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                                    >
                                      {t('openLocationSettingsBtn')}
                                    </button>
                                  )}
                                  {regLocErrorKind === 'permission' && IS_NATIVE_APP && (
                                    <button
                                      type="button"
                                      onClick={openAppSettings}
                                      className="cursor-pointer select-none"
                                      style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                                    >
                                      {t('openAppSettingsBtn')}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><CreditCard /></div><b>{t('aadhaarNumberLabel')}</b></div>
                              <div className="input-wrap">
                                <input
                                  type="text" inputMode="numeric" maxLength={12} value={regAadhaarNumber} onChange={(e) => setRegAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                                  placeholder={t('digitAadhaarOptionalPlaceholder')}
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="toggle-field-row">
                                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--red)' }}><Mail /></div><b>{t('emailAddressLabel')}</b></div>
                                <button
                                  type="button" className={`toggle-switch ${regEmailEnabled ? 'on' : ''}`}
                                  onClick={() => setRegEmailEnabled(!regEmailEnabled)} aria-pressed={regEmailEnabled}
                                >
                                  <span className="toggle-thumb" />
                                </button>
                              </div>
                              {regEmailEnabled && (
                                <div className="input-wrap">
                                  <input
                                    type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                                    placeholder="you@example.com"
                                  />
                                </div>
                              )}
                            </div>
                            <div className="reg-field">
                              <div className="toggle-field-row">
                                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Link2 /></div><b>{t('websiteUrlLabel')}</b></div>
                                <button
                                  type="button" className={`toggle-switch ${regWebsiteUrlEnabled ? 'on' : ''}`}
                                  onClick={() => setRegWebsiteUrlEnabled(!regWebsiteUrlEnabled)} aria-pressed={regWebsiteUrlEnabled}
                                >
                                  <span className="toggle-thumb" />
                                </button>
                              </div>
                              {regWebsiteUrlEnabled && (
                                <div className="input-wrap">
                                  <input
                                    type="url" value={regWebsiteUrl} onChange={(e) => setRegWebsiteUrl(e.target.value)}
                                    placeholder={t('websiteUrlPlaceholderEg')}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><BadgePercent /></div><b>{t('referralCodeLabel')}</b></div>
                              <div className="input-wrap">
                                <input
                                  type="tel" inputMode="numeric" maxLength={10} value={regReferralCode}
                                  onChange={(e) => setRegReferralCode(e.target.value.replace(/\D/g, ''))}
                                  placeholder={t('referralCodePlaceholder')}
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange, #f59e0b)' }}><Tag /></div><b>{t('fieldCategory')} <span className="req">*</span></b></div>
                              <CustomSelect
                                value={regCategoryId} onChange={setRegCategoryId}
                                disabled={regCategoriesLoading}
                                placeholder={regCategoriesLoading ? t('loadingCategoriesEllipsis') : t('selectShopCategoryPlaceholder')}
                                emptyLabel={t('noShopCategoriesAvailableMsg')}
                                options={regCategories.map((cat) => ({ value: cat.id, label: cat.name }))}
                              />
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('mobileNumberLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type="tel" required value={regPhone} disabled={regOtpVerified}
                                  onChange={(e) => { setRegPhone(e.target.value); setRegOtpVerified(false); setRegPhoneError(''); }}
                                  placeholder={t('digitMobilePlaceholder')} style={{ opacity: regOtpVerified ? 0.6 : 1 }}
                                />
                              </div>
                              {regPhoneError && (
                                <span style={{ display: 'block', marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{regPhoneError}</span>
                              )}
                            </div>

                            {regOtpVerified ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, fontWeight: 800 }}>
                                <CheckCircle2 className="h-4 w-4" /> {t('mobileNumberVerifiedMsg')}
                              </div>
                            ) : (
                              <button
                                type="button" onClick={handleOpenRegOtpModal}
                                className="btn btn-primary" style={{ width: '100%' }}
                              >
                                <Phone className="h-4 w-4" />
                                {t('sendOtpToVerifyBtn')}
                              </button>
                            )}

                            <Suspense fallback={null}>
                            <OtpVerificationModal
                              open={showRegOtpModal}
                              onClose={() => setShowRegOtpModal(false)}
                              onVerified={() => setRegOtpVerified(true)}
                              api={api}
                              identifier={regPhone}
                              method="phone"
                              purpose="register"
                              title={t('verifyOtpModalTitle')}
                              description={t('enterOtpCodeSentToPhoneTemplate').replace('{phone}', regPhone)}
                              t={t}
                            />
                            </Suspense>

                            <div className="reg-field" style={{ marginTop: 13 }}>
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('passwordLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type={showRegPassword ? "text" : "password"} required minLength={6} value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                                  placeholder={t('min6CharactersPlaceholder')} style={{ paddingRight: 42 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowRegPassword(!showRegPassword)}
                                  className="pwd-toggle-btn"
                                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                                >
                                  {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          <label className="flex items-center gap-2" style={{ marginTop: 16, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                            <input
                              type="checkbox" checked={regTermsAccepted}
                              onChange={(e) => setRegTermsAccepted(e.target.checked)}
                              style={{ width: 16, height: 16, flexShrink: 0 }}
                            />
                            <span>
                              {t('agreeToTermsPrefix')}{' '}
                              <button
                                type="button" onClick={() => setShowTermsModal(true)}
                                style={{ color: 'var(--gold)', fontWeight: 800, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                              >
                                {t('termsAndConditionsLinkLabel')}
                              </button>
                            </span>
                          </label>

                          <div className="flex justify-end" style={{ marginTop: 20 }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!regShopName || !regOwnerName || !regCategoryId || !regPhone || !regLocation) {
                                  alert(t('pleaseFillRequiredRegFieldsMsg'));
                                  return;
                                }
                                // City/State/PIN Code are optional, GPS-derived metadata only
                                // (see the reg-field block above) - Continue must never depend
                                // on "Current Location" having succeeded. A manually-typed
                                // Address on its own is a complete, valid submission.
                                if (regEmailEnabled && regEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
                                  alert(t('pleaseEnterValidEmailMsg'));
                                  return;
                                }
                                const normalizedRegPhone = normalizePhone(regPhone);
                                if (!normalizedRegPhone) {
                                  alert(`${t('mobileNumberLabel')}: ${PHONE_REGEX_MESSAGE}`);
                                  return;
                                }
                                if (normalizedRegPhone !== regPhone) setRegPhone(normalizedRegPhone);
                                if (regPinCode && !/^\d{6}$/.test(regPinCode)) {
                                  alert(t('pinCodeMustBe6DigitsMsg'));
                                  return;
                                }
                                if (!regTermsAccepted) {
                                  alert(t('pleaseAcceptTermsMsg'));
                                  return;
                                }
                                if (regAadhaarNumber && !/^\d{12}$/.test(regAadhaarNumber)) {
                                  alert(t('aadhaarMustBe12DigitsMsg'));
                                  return;
                                }
                                if (!regOtpVerified) {
                                  alert(t('pleaseVerifyMobileOtpMsg'));
                                  return;
                                }
                                if (!regPassword || regPassword.length < 6) {
                                  alert(t('regPasswordMinLengthMsg'));
                                  return;
                                }
                                setRegStep(2);
                              }}
                              className="btn btn-primary reg-submit-btn"
                            >
                              {t('btnContinue')} <ArrowRight />
                            </button>
                          </div>
                        </div>
                      )}

                      {showTermsModal && createPortal(
                        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
                          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28, maxHeight: '85vh', overflowY: 'auto' }}>
                            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
                              <h2 style={{ fontSize: 17 }}>{TERMS_AND_CONDITIONS_TITLE}</h2>
                              <button type="button" onClick={() => setShowTermsModal(false)} className="icon-btn">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                              {TERMS_AND_CONDITIONS_BODY}
                            </p>
                            <div className="flex justify-end" style={{ marginTop: 20 }}>
                              <button
                                type="button"
                                onClick={() => setShowTermsModal(false)}
                                className="btn btn-primary"
                              >
                                {t('btnClose')}
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

                      {/* STEP 2: Plan & Payment - combined onto a single screen so the
                shop owner picks a subscription plan and settles payment
                without an extra "Continue to payment" click/screen. */}
                      {regStep === 2 && (
                        <form onSubmit={handleRegCheckout} className="animate-fade-in relative overflow-hidden">
                          {regPayProcessing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: 'rgba(10,9,8,0.92)', zIndex: 20 }}>
                              <div className="relative w-12 h-12 flex items-center justify-center">
                                <span className="absolute inset-0 rounded-full" style={{ border: '4px solid var(--gold-dim)' }}></span>
                                <span className="absolute inset-0 rounded-full animate-spin" style={{ border: '4px solid transparent', borderTopColor: 'var(--gold)' }}></span>
                              </div>
                              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('settlingPaymentEllipsis')}</h3>
                            </div>
                          )}

                          {(() => {
                            const base = Number(regSubscriptionPrice) || 0;
                            const gstAmount = Math.round(base * (regGstPercent / 100) * 100) / 100;
                            const total = Math.round((base + gstAmount) * 100) / 100;
                            return (
                              <div style={{ background: 'var(--card-2)', padding: 14, borderRadius: 14, border: '1px solid var(--border-2)', marginBottom: 18 }}>
                                <div className="flex justify-between items-center" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                                  <span>{t('baseAmountLabel')}</span>
                                  <span>Rs. {base.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed var(--border-2)' }}>
                                  <span>{t('gstAmountLabel')} ({regGstPercent}%)</span>
                                  <span>Rs. {gstAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                                  <span>{t('totalAmountLabel')}</span>
                                  <span style={{ fontWeight: 800, color: 'var(--gold)', fontSize: 16, fontFamily: 'var(--display)' }}>
                                    Rs. {total.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="animate-fade-in" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 20, borderRadius: 16, textAlign: 'center' }}>
                            <ShieldCheck className="h-8 w-8" style={{ color: 'var(--gold)', margin: '0 auto 10px' }} />
                            <p style={{ color: 'var(--text-3)', fontSize: 11.5, fontWeight: 600, lineHeight: 1.6 }}>{t('securePaymentGatewayDesc')}</p>
                          </div>

                          <div className="flex gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                            <button type="button" onClick={() => setRegStep(1)} className="btn btn-ghost" style={{ flex: 1 }}>
                              {t('btnBack')}
                            </button>
                            <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                              {t('paySettleSetupBtn')}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {IS_NATIVE_APP && (
            <PublicBottomNav
              activeTab={publicInitialTab}
              onGoTab={(tab) => { setPublicInitialTab(tab); setPublicPage('home'); }}
              // Already on the login screen here, so there's nothing useful
              // to prompt - tapping "Add Ads" just dismisses back to Home
              // instead of showing a redundant "please log in" popup.
              onAddAds={() => { setPublicInitialTab('home'); setPublicPage('home'); }}
            />
          )}
          </>
        )}
        </>
      ) : !langData ? (
        <TranslationsLoadingFallback />
      ) : (
        <div className="min-h-[calc(100vh-40px)] flex flex-col md:flex-row">
          {/* Mobile nav backdrop - must sit above every other fixed/sticky
              mobile chrome (header, bottom nav, floating buttons), so it's
              pinned to an explicit z-index well above the highest value used
              anywhere else in the app (see .mobile-nav-drawer-backdrop /
              .mobile-nav-drawer in index.css). Tapping it closes the drawer. */}
          {mobileNavOpen && (
            <div
              className="mobile-nav-drawer-backdrop fixed inset-0 md:hidden"
              style={{ background: 'rgba(5,4,3,0.7)' }}
              onClick={() => setMobileNavOpen(false)}
            />
          )}

          {/* SIDEBAR NAVIGATION - on mobile this is a full-screen overlay
              drawer (see .mobile-nav-drawer in index.css for the z-index
              that guarantees it always renders above the header, page
              content, floating buttons and bottom nav bar). Closes when a
              menu item is tapped (delegated onClick below) or when the
              backdrop above is tapped. */}
          <aside
            className={`sidebar mobile-nav-drawer w-[82%] max-w-[320px] md:w-64 flex flex-col shrink-0 fixed md:static inset-y-0 left-0 md:z-auto transition-transform duration-300 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
            style={{ overflowY: 'auto' }}
          >
            <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" />
              </span>
              <button className="icon-btn md:hidden" onClick={() => setMobileNavOpen(false)}>
                <X />
              </button>
            </div>

            {/* Language Selector Dropdown */}
            <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
              <label className="side-section-label" style={{ padding: 0, marginBottom: 8, display: 'block' }}>Language &middot; भाषा &middot; மொழி</label>
              <CustomSelect
                value={lang}
                onChange={(v) => {
                  setLang(v);
                  localStorage.setItem('kee_lang', v);
                }}
                triggerStyle={{ padding: '9px 32px 9px 12px', fontSize: 12 }}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'Hindi (हिन्दी)' },
                  { value: 'ta', label: 'Tamil (தமிழ்)' },
                  { value: 'te', label: 'Telugu (తెలుగు)' },
                  { value: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
                  { value: 'ml', label: 'Malayalam (മലയാളം)' },
                ]}
              />
            </div>

            <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }} onClick={(e) => { if (e.target.closest('button')) setMobileNavOpen(false); }}>
              <div className="side-section-label">{t('navOverview')}</div>
              <button
                onClick={() => resetToDashboard()}
                className={`side-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              >
                <span className="nav-ico" style={{ background: 'var(--maroon)' }}><Sliders /></span>
                <span>{t('dashboard')}</span>
              </button>

              {user.role === 'SUPER_ADMIN' ? (
                <>
                  <div className="side-section-label">{t('navOperations')}</div>
                  <button
                    onClick={() => setActiveTab('shops')}
                    className={`side-link ${activeTab === 'shops' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><Layers /></span>
                    <span>{t('shops')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('super-customers')}
                    className={`side-link ${activeTab === 'super-customers' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--purple)' }}><Users /></span>
                    <span>{t('customers')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('keys')}
                    className={`side-link ${activeTab === 'keys' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--teal)' }}><Database /></span>
                    <span>{t('keys')}</span>
                  </button>

                  <div className="side-section-label">{t('navBusiness')}</div>
                  <button
                    onClick={() => setActiveTab('revenue')}
                    className={`side-link ${activeTab === 'revenue' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></span>
                    <span>{t('revenue')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('promotions')}
                    className={`side-link ${activeTab === 'promotions' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><Package /></span>
                    <span>{t('inventory')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('banner-offer-management')}
                    className={`side-link ${activeTab === 'banner-offer-management' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--gold)' }}><Sparkles /></span>
                    <span>Banner &amp; Offers</span>
                  </button>

                  <div className="side-section-label">{t('navSupport')}</div>
                  <button
                    onClick={() => setActiveTab('support-config')}
                    className={`side-link ${activeTab === 'support-config' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--rose)' }}><Phone /></span>
                    <span>{t('supportConfig')}</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="side-section-label">{t('navOperations')}</div>
                  <button
                    onClick={() => setActiveTab('search-keys')}
                    className={`side-link ${activeTab === 'search-keys' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><Search /></span>
                    <span>{t('searchKeys')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('register')}
                    className={`side-link ${activeTab === 'register' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--jgreen)' }}><Plus /></span>
                    <span>{t('register')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`side-link ${activeTab === 'history' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--purple)' }}><Users /></span>
                    <span>{t('history')}</span>
                  </button>

                  <div className="side-section-label">{t('navStore')}</div>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`side-link ${activeTab === 'reports' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--orange)' }}><BarChart3 /></span>
                    <span>{t('reports')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('promotions')}
                    className={`side-link ${activeTab === 'promotions' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--pink)' }}><Megaphone /></span>
                    <span>{t('inventory')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('offers-ads-banners')}
                    className={`side-link ${activeTab === 'offers-ads-banners' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--gold)' }}><Sparkles /></span>
                    <span>{t('offersAdsBanners')}</span>
                  </button>

                  <div className="side-section-label">{t('navSettingsSection')}</div>
                  <button
                    onClick={() => setActiveTab('customer-care')}
                    className={`side-link ${activeTab === 'customer-care' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--rose)' }}><Phone /></span>
                    <span>{t('customerCare')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`side-link ${activeTab === 'settings' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--maroon)' }}><Settings /></span>
                    <span>{t('settings')}</span>
                  </button>

                  <div className="side-section-label">{t('navMoreSection')}</div>
                  <button
                    onClick={() => setActiveTab('terms')}
                    className={`side-link ${activeTab === 'terms' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><FileText /></span>
                    <span>{t('menuTermsConditions')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('feedback')}
                    className={`side-link ${activeTab === 'feedback' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--gold)' }}><MessageCircle /></span>
                    <span>{t('menuFeedback')}</span>
                  </button>
                </>
              )}
            </nav>

            <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <span className="avatar">{(user.name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13, color: 'var(--text-0)' }}>{user.name}</div>
                  <div className="truncate" style={{ fontSize: 11, color: 'var(--text-3)' }}>{user.email || t('noEmailOnFileLabel')}</div>
                </div>
              </div>
              <button
                onClick={() => { logout(); if (IS_NATIVE_APP) { setPublicInitialTab('home'); setPublicPage('home'); } }}
                className="side-link"
                style={{ color: 'var(--red)' }}
              >
                <LogOut />
                <span>{t('logout')}</span>
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT DISPLAY */}
          <main className="app-main flex-1 p-4 pb-24 md:p-6 overflow-y-auto overflow-x-hidden space-y-6" style={{ minWidth: 0 }}>

            {/* Top Workspace Header Bar */}
            {/* marginBottom trimmed specifically on the Dashboard tab (in
                place of the mb-6/24px default) as part of fitting the
                dashboard's card grid on one screen without scrolling -
                every other tab keeps the normal mb-6 spacing. */}
            <header className="app-topbar flex justify-between items-center mb-6 relative z-50" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 20px', ...(activeTab === 'dashboard' ? { marginBottom: 12 } : {}) }}>
              <div className="flex items-center gap-2 header-search-wrap" style={{ minWidth: 0, flex: 1 }}>
                <button className="icon-btn md:hidden" onClick={() => setMobileNavOpen(v => !v)} style={{ flexShrink: 0 }}>
                  <Menu />
                </button>
                {/* The header no longer carries a search/filter box on any
                    screen, including the Dashboard - every page still has
                    its own fully independent search box where relevant. */}
                <div className="header-page-title truncate">
                  {user.role === 'SUPER_ADMIN' ? 'Key Shop' : (shopDisplayName || user.name)}
                </div>
              </div>

              <div className="flex items-center gap-3 relative app-topbar-actions">
                {user.role !== 'SUPER_ADMIN' && (
                  <button
                    onClick={handleHeaderReferShare}
                    disabled={headerReferralSharing}
                    className="icon-btn"
                    title={t('referBtnTitle')}
                    style={{ width: 38, height: 38 }}
                  >
                    {headerReferralSharing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  </button>
                )}

                {/* Notification Bell */}
                <button
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  className="icon-btn"
                  style={{ position: 'relative', width: 38, height: 38 }}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 9, width: 17, height: 17, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card)' }} className="animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications dropdown popup overlay */}
                {showNotifDropdown && (
                  <div className="card animate-fade-in" style={{ position: 'absolute', right: 0, top: 46, width: 'min(320px, calc(100vw - 32px))', padding: 16, zIndex: 9999, textAlign: 'left' }}>
                    <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
                      <h3 style={{ fontSize: 13 }}>{t('notificationsTitle')}</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            try {
                              // Fired in parallel instead of one at a time -
                              // this list is capped at 50 (see
                              // NotificationService.getNotifications), so at
                              // most 50 concurrent requests, versus up to 50
                              // sequential round-trips one on top of another.
                              const markRead = user.role === 'SUPER_ADMIN' ? api.markSuperNotificationRead : api.markNotificationRead;
                              await Promise.all(notifications.filter(n => !n.isRead).map(n => markRead(n.id)));
                              fetchNotifications();
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase' }}
                        >
                          {t('markAllRead')}
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {notifications.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '24px 0' }}>{t('noNotificationsFound')}</div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onClick={async () => {
                              try {
                                if (user.role === 'SUPER_ADMIN') {
                                  await api.markSuperNotificationRead(n.id);
                                } else {
                                  await api.markNotificationRead(n.id);
                                }
                                fetchNotifications();
                                if (n.type === 'SHOP_REGISTRATION' && user.role === 'SUPER_ADMIN') {
                                  setActiveTab('shops');
                                }
                                if (n.type === 'CUSTOMER_REGISTRATION' && user.role !== 'SUPER_ADMIN') {
                                  setActiveTab('history');
                                }
                                setShowNotifDropdown(false);
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            style={{
                              padding: 10, borderRadius: 13, cursor: 'pointer', fontSize: 11.5, transition: 'background .18s ease',
                              background: !n.isRead ? 'var(--gold-dim)' : 'var(--card-2)',
                              border: `1px solid ${!n.isRead ? 'rgba(240,185,11,0.25)' : 'var(--border-2)'}`
                            }}
                          >
                            <div className="flex justify-between items-start" style={{ marginBottom: 3, fontWeight: 700, color: 'var(--text-0)' }}>
                              <span>{n.title}</span>
                              <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace', fontWeight: 400 }}>
                                {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-2)', fontSize: 10.5, lineHeight: 1.5 }}>{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <span className="avatar">{(user.name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
              </div>
            </header>

            {activeTab === 'dashboard' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <DashboardView t={t} setActiveTab={setActiveTab} setSearchDispatch={setSearchDispatch} setAutoOpenListingModal={setAutoOpenListingModal} />
              </Suspense>
            )}
            {activeTab === 'shops' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <ShopsManagementView t={t} api={api} initiallyOpenAddModal={autoOpenShopModal} onCloseInitiallyOpen={() => setAutoOpenShopModal(false)} searchDispatch={searchDispatch} defaultTown={defaultLocation} locationReady={locationReady} />
              </Suspense>
            )}
            {activeTab === 'dealers' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <DealersView t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />
              </Suspense>
            )}
            {(activeTab === 'key-shops' || activeTab === 'ecm' || activeTab === 'meter' || activeTab === 'scanning') && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                {activeTab === 'key-shops' && <CategoryShopsView categoryKey="KEY_SHOPS" icon={KeyRound} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
                {activeTab === 'ecm' && <CategoryShopsView categoryKey="ECM" icon={Cpu} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
                {activeTab === 'meter' && <CategoryShopsView categoryKey="METER" icon={Gauge} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
                {activeTab === 'scanning' && <CategoryShopsView categoryKey="SCANNER" icon={ScanLine} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
              </Suspense>
            )}
            {activeTab === 'super-customers' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <SuperCustomersView t={t} api={api} searchDispatch={activeTab === 'super-customers' ? searchDispatch : null} />
              </Suspense>
            )}
            {activeTab === 'keys' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <KeysCatalogView t={t} api={api} searchDispatch={activeTab === 'keys' ? searchDispatch : null} />
              </Suspense>
            )}
            {activeTab === 'revenue' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <RevenueManagementView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'promotions' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <PromotionsView t={t} api={api} user={user} searchDispatch={activeTab === 'promotions' ? searchDispatch : null} initiallyOpenAddModal={autoOpenListingModal} onCloseInitiallyOpen={() => setAutoOpenListingModal(false)} defaultTown={defaultLocation} locationReady={locationReady} />
              </Suspense>
            )}
            {activeTab === 'banner-offer-management' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <AdsManagementView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'offers-ads-banners' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <OffersAdsBannersView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'search-keys' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <KeysSearchView t={t} api={api} searchDispatch={activeTab === 'search-keys' ? searchDispatch : null} />
              </Suspense>
            )}
            {activeTab === 'register' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <CustomerRegistrationWizard t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'history' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <CustomerHistoryView t={t} api={api} searchDispatch={activeTab === 'history' ? searchDispatch : null} />
              </Suspense>
            )}
            {activeTab === 'reports' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <ReportsPortalView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'customer-care' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <CustomerCareView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'support-contact' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <SupportContactView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'support-config' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <SupportConfigView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'settings' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <ShopSettingsView t={t} api={api} />
              </Suspense>
            )}
            {activeTab === 'terms' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <StaticInfoView icon={FileText} eyebrow={t('menuTermsConditions')} title={TERMS_AND_CONDITIONS_TITLE} body={TERMS_AND_CONDITIONS_BODY} />
              </Suspense>
            )}
            {activeTab === 'feedback' && (
              <Suspense fallback={<div className="brand-loading-track" style={{ maxWidth: 240, margin: '40px auto' }}><div className="brand-loading-fill" /></div>}>
                <FeedbackView t={t} api={api} />
              </Suspense>
            )}
          </main>

          {/* Mobile Bottom Navigation Bar (mobile only) */}
          <nav className="mobile-bottom-nav md:hidden">
            <button
              className={`mbn-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { resetToDashboard(); setMobileNavOpen(false); }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--maroon)' }}><Home /></span>
              <span>{t('dashboard')}</span>
            </button>
            <button
              className="mbn-item"
              onClick={() => setShowLangDialog(true)}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--teal)' }}><Languages /></span>
              <span>{t('language')}</span>
            </button>
            <button
              className={`mbn-item ${(user.role === 'SUPER_ADMIN' ? activeTab === 'support-config' : activeTab === 'support-contact') ? 'active' : ''}`}
              onClick={() => {
                // Role-based destination: Super Admin manages the global
                // support config (WhatsApp number + training videos), while
                // Shop Admin views the already-configured owner contact info.
                setActiveTab(user.role === 'SUPER_ADMIN' ? 'support-config' : 'support-contact');
                setMobileNavOpen(false);
              }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--rose)' }}><Headset /></span>
              <span>{t('customerService')}</span>
            </button>
          </nav>

          {/* "Press Back again to exit" toast - shown only when the hardware
              Back button/gesture is pressed once while already on the
              Dashboard/home screen (see the backButton listener above). */}
          {exitPromptVisible && createPortal(
            <div
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 88,
                transform: 'translateX(-50%)',
                background: 'rgba(20,18,16,0.92)',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                zIndex: 9999,
                pointerEvents: 'none',
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              }}
            >
              {t('pressBackToExit')}
            </div>,
            document.body
          )}

          {downloadToastVisible && createPortal(
            <div
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 88,
                transform: 'translateX(-50%)',
                background: 'rgba(20, 18, 16, 0.95)',
                color: 'var(--gold)',
                border: '1px solid var(--gold)',
                padding: '10px 22px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                zIndex: 99999,
                pointerEvents: 'none',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backdropFilter: 'blur(8px)'
              }}
            >
              <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--green)' }} />
              <span>Document downloaded successfully.</span>
            </div>,
            document.body
          )}

          {/* Language selection dialog (center-screen modal) */}
          {showLangDialog && createPortal(
            <div
              className="fixed inset-0 z-50 overflow-y-auto flex justify-center items-center p-4"
              style={{ background: 'rgba(5,4,3,0.72)' }}
              onClick={() => setShowLangDialog(false)}
            >
              <div
                ref={langDialogCardRef}
                className="card animate-fade-in"
                style={{ width: '100%', maxWidth: 340, padding: 24, position: 'relative' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowLangDialog(false)}
                  className="icon-btn"
                  style={{ position: 'absolute', top: 16, right: 16 }}
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex flex-col items-center mb-5" style={{ textAlign: 'center' }}>
                  <div className="icon-badge solid" style={{ marginBottom: 10 }}><Languages /></div>
                  <h2 style={{ fontSize: 17 }}>{t('chooseLanguage')}</h2>
                  <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('selectLanguageDesc')}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { code: 'en', label: 'English' },
                    { code: 'hi', label: 'Hindi (हिन्दी)' },
                    { code: 'ta', label: 'Tamil (தமிழ்)' },
                    { code: 'te', label: 'Telugu (తెలుగు)' },
                    { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
                    { code: 'ml', label: 'Malayalam (മലയാളം)' },
                  ].map(l => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); localStorage.setItem('kee_lang', l.code); setShowLangDialog(false); }}
                      className={`lang-option-btn ${lang === l.code ? 'active' : ''}`}
                    >
                      <span>{l.label}</span>
                      {lang === l.code && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}
    </>
  );
}

