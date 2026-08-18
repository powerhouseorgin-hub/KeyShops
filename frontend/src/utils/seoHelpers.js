/**
 * SEO Helper Utilities for KeyShops.in
 * Provides functions to manage meta tags, schema markup, and SEO best practices
 */

/**
 * Update page meta tags dynamically
 */
export const updateMetaTags = (title, description, url = '', imageUrl = '') => {
  // Update title
  document.title = title;

  // Update or create meta description
  let metaDescription = document.querySelector('meta[name="description"]');
  if (!metaDescription) {
    metaDescription = document.createElement('meta');
    metaDescription.setAttribute('name', 'description');
    document.head.appendChild(metaDescription);
  }
  metaDescription.setAttribute('content', description);

  // Update canonical URL
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  if (url) {
    canonical.setAttribute('href', url);
  }

  // Update Open Graph tags
  updateOGTag('og:title', title);
  updateOGTag('og:description', description);
  if (imageUrl) {
    updateOGTag('og:image', imageUrl);
  }
  if (url) {
    updateOGTag('og:url', url);
  }

  // Update Twitter tags
  updateTwitterTag('twitter:title', title);
  updateTwitterTag('twitter:description', description);
  if (imageUrl) {
    updateTwitterTag('twitter:image', imageUrl);
  }
};

/**
 * Helper to update OG meta tags
 */
const updateOGTag = (property, content) => {
  let tag = document.querySelector(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

/**
 * Helper to update Twitter meta tags
 */
const updateTwitterTag = (name, content) => {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

/**
 * Add JSON-LD schema markup to page
 */
export const addSchemaMarkup = (schemaObject) => {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schemaObject);
  document.head.appendChild(script);
};

/**
 * BreadcrumbList Schema Generator
 */
export const generateBreadcrumbSchema = (breadcrumbs) => {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": crumb.url
    }))
  };
};

/**
 * FAQ Page Schema Generator
 */
export const generateFAQSchema = (faqItems) => {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.a
      }
    }))
  };
};

/**
 * LocalBusiness Schema Generator for City Pages
 */
export const generateLocalBusinessSchema = (city, state) => {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `KeyShops.in - ${city}, ${state}`,
    "description": `Professional key duplication and key replacement services in ${city}, ${state}`,
    "url": `https://keyshops.in/key-shops/${city.toLowerCase()}`,
    "areaServed": {
      "@type": "City",
      "name": city,
      "addressRegion": state,
      "addressCountry": "IN"
    },
    "serviceType": [
      "Duplicate Keys",
      "Car Keys",
      "Bike Keys",
      "Home Keys",
      "Office Keys",
      "Key Replacement"
    ],
    "priceRange": "₹50-₹2000"
  };
};

/**
 * Generate meta tags for service pages
 */
export const generateServicePageMeta = (serviceName, serviceKeyword) => {
  const services = {
    'car-keys': {
      title: 'Professional Car Key Duplication | KeyShops.in',
      description: 'Get duplicate car keys at affordable prices. Expert technicians, quality blanks, guaranteed work. Same-day service available.',
      keywords: 'car key duplicate, duplicate car keys, car key replacement'
    },
    'bike-keys': {
      title: 'Bike & Motorcycle Key Duplication | KeyShops.in',
      description: 'Fast and affordable bike key duplication services. All makes and models supported. Quick turnaround guaranteed.',
      keywords: 'bike key duplicate, motorcycle key duplication, scooter keys'
    },
    'home-keys': {
      title: 'Home & Office Key Duplication Services | KeyShops.in',
      description: 'Professional residential and commercial key duplication. Reliable, quick, and affordable. Serving all areas.',
      keywords: 'home key duplication, office key duplicate, residential keys'
    },
    'lost-keys': {
      title: 'Emergency Lost Key Replacement | KeyShops.in',
      description: 'Lost your keys? Get emergency replacement service. 24/7 availability, fast turnaround, affordable pricing.',
      keywords: 'lost key replacement, emergency key service, car key lost'
    }
  };

  return services[serviceName] || services['car-keys'];
};

/**
 * Get canonical URL for current page
 */
export const getCanonicalUrl = (path) => {
  return `https://keyshops.in${path}`;
};

/**
 * Get OG image URL (default to brand image)
 */
export const getOGImageUrl = () => {
  return 'https://keyshops.in/favicon-192.png';
};

/**
 * Generate article schema for blog posts
 */
export const generateArticleSchema = (title, description, publishDate, authorName = 'KeyShops.in') => {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "image": getOGImageUrl(),
    "datePublished": publishDate,
    "dateModified": publishDate,
    "author": {
      "@type": "Organization",
      "name": authorName,
      "url": "https://keyshops.in"
    },
    "publisher": {
      "@type": "Organization",
      "name": "KeyShops.in",
      "logo": {
        "@type": "ImageObject",
        "url": "https://keyshops.in/assets/keyshop-logo.png"
      }
    }
  };
};

/**
 * Sitemap helper - generate sitemap URLs
 */
export const generateSitemapUrls = () => {
  return [
    { loc: 'https://keyshops.in/', priority: 1.0, changefreq: 'weekly' },
    { loc: 'https://keyshops.in/search', priority: 0.9, changefreq: 'weekly' },
    { loc: 'https://keyshops.in/services/car-keys', priority: 0.8, changefreq: 'monthly' },
    { loc: 'https://keyshops.in/services/bike-keys', priority: 0.8, changefreq: 'monthly' },
    { loc: 'https://keyshops.in/services/home-keys', priority: 0.8, changefreq: 'monthly' },
    { loc: 'https://keyshops.in/key-shops/tamil-nadu', priority: 0.8, changefreq: 'weekly' },
    { loc: 'https://keyshops.in/key-shops/chennai', priority: 0.8, changefreq: 'weekly' },
    { loc: 'https://keyshops.in/key-shops/bangalore', priority: 0.8, changefreq: 'weekly' },
    { loc: 'https://keyshops.in/blog/key-duplication-cost-guide', priority: 0.7, changefreq: 'never' },
    { loc: 'https://keyshops.in/blog/car-key-duplication-guide', priority: 0.7, changefreq: 'never' },
  ];
};

/**
 * Analytics helper - track page view with custom dimensions
 */
export const trackPageView = (pageTitle, pageCategory) => {
  if (typeof window !== 'undefined' && window.gtag) {
    // A GA4 'page_view' event, not 'config' - this is a client-routed SPA, so
    // re-issuing 'config' on every navigation would re-initialize the
    // property instead of recording a virtual pageview (see analytics.js,
    // which calls 'config' exactly once with send_page_view:false).
    window.gtag('event', 'page_view', {
      'page_title': pageTitle,
      'page_category': pageCategory,
      'page_location': window.location.href
    });
  }
};

/**
 * Track conversion event (e.g., search, shop visit)
 */
export const trackConversion = (eventName, eventData = {}) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, {
      ...eventData
    });
  }
};

/**
 * Keyword targeting helper
 */
export const keywordTargets = {
  primary: [
    'duplicate keys near me',
    'key shop',
    'car key duplicate',
    'bike key duplicate',
    'key replacement',
    'lost keys',
    'key duplication'
  ],
  secondary: [
    'duplicate car keys',
    'key shops in [city]',
    'best key shop near me',
    'emergency key replacement',
    'home key duplication',
    'office key duplication'
  ],
  longTail: [
    'how much does key duplication cost',
    'can i duplicate car keys without original',
    'lost car key what to do',
    'key duplication process',
    'car key replacement cost',
    'how to find reliable key shop'
  ]
};

/**
 * Log SEO-related events for monitoring
 */
export const logSEOEvent = (eventType, eventData) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    eventType,
    ...eventData
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[SEO Event]', logEntry);
  }

  // Could send to analytics backend
  return logEntry;
};

export default {
  updateMetaTags,
  addSchemaMarkup,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateLocalBusinessSchema,
  generateServicePageMeta,
  getCanonicalUrl,
  getOGImageUrl,
  generateArticleSchema,
  generateSitemapUrls,
  trackPageView,
  trackConversion,
  keywordTargets,
  logSEOEvent
};
