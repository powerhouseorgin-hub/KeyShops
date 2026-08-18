// Google Analytics 4 loader. No-ops entirely when VITE_GA_MEASUREMENT_ID isn't
// set, so local dev and any deployment without a real GA4 property behave
// exactly as before - this only starts fetching gtag.js once a real
// measurement ID is configured in the environment.
let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return;
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!measurementId) return;

  initialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  // send_page_view: false - seoHelpers.js's trackPageView() fires an explicit
  // page_view on each SEO landing page's own meta-tag update instead, since
  // this is a client-side-routed SPA and the initial config call happens
  // before React Router-style navigation has settled on a real path.
  gtag('config', measurementId, { send_page_view: false });
}
