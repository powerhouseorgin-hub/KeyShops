/**
 * SEO Configuration for KeyShops.in
 * Centralized SEO settings and metadata
 */

export const seoConfig = {
  // Site Information
  site: {
    name: 'KeyShops.in',
    description: 'India\'s leading duplicate key management platform connecting customers with verified key shops',
    url: 'https://keyshops.in',
    language: 'en-IN',
    country: 'IN'
  },

  // Social Profiles
  social: {
    facebook: 'https://www.facebook.com/keyshops.in',
    instagram: 'https://www.instagram.com/keyshops.in',
    twitter: 'https://twitter.com/keyshops.in',
    youtube: 'https://www.youtube.com/@keyshops.in'
  },

  // Default Meta Tags
  defaultMeta: {
    title: 'Key Shop - Duplicate Keys Near Me | Car, Bike & Home Keys',
    description: 'KeyShops.in connects you with verified key shops for duplicate keys, key replacement & lost key services. Find car keys, bike keys, home keys near you in 10+ Indian cities.',
    keywords: 'duplicate keys near me, key shop, car key duplicate, bike key duplicate, lost keys, key replacement, key duplication',
    author: 'KeyShops.in',
    robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
  },

  // Service Pages Configuration
  services: {
    carKeys: {
      path: '/services/duplicate-car-keys',
      title: 'Professional Car Key Duplication | KeyShops.in',
      description: 'Get duplicate car keys at affordable prices. Expert technicians, quality blanks, guaranteed work. Same-day service available.',
      keywords: 'car key duplicate, duplicate car keys, car key replacement, car key cost',
      primaryKeyword: 'car key duplicate',
      priority: 1.0
    },
    bikeKeys: {
      path: '/services/duplicate-bike-keys',
      title: 'Bike & Motorcycle Key Duplication | KeyShops.in',
      description: 'Fast and affordable bike key duplication services. All makes and models supported. Quick turnaround guaranteed.',
      keywords: 'bike key duplicate, motorcycle key duplication, scooter keys, bike key replacement',
      primaryKeyword: 'bike key duplicate',
      priority: 0.8
    },
    homeKeys: {
      path: '/services/home-key-duplication',
      title: 'Home & Office Key Duplication Services | KeyShops.in',
      description: 'Professional residential and commercial key duplication. Reliable, quick, and affordable. Serving all areas.',
      keywords: 'home key duplication, office key duplicate, residential keys, commercial keys',
      primaryKeyword: 'home key duplication',
      priority: 0.8
    },
    lostKeys: {
      path: '/services/lost-key-replacement',
      title: 'Emergency Lost Key Replacement | KeyShops.in',
      description: 'Lost your keys? Get emergency replacement service. 24/7 availability, fast turnaround, affordable pricing.',
      keywords: 'lost key replacement, emergency key service, car key lost, lost car key',
      primaryKeyword: 'lost key replacement',
      priority: 0.8
    }
  },

  // Blog Posts Configuration
  blog: {
    costGuide: {
      path: '/blog/key-duplication-cost-guide',
      title: 'Key Duplication Cost Guide 2025: How Much Should You Pay?',
      description: 'Complete breakdown of key duplication costs by type, city, and service',
      keywords: 'key duplication cost, how much does key duplication cost, key replacement cost',
      primaryKeyword: 'key duplication cost',
      wordCount: 1500,
      priority: 0.7
    },
    carKeyGuide: {
      path: '/blog/car-key-duplication-guide',
      title: 'Complete Guide to Car Key Duplication: Costs, Methods & Tips',
      description: 'Everything you need to know about duplicating car keys - types, costs, methods, and where to get them',
      keywords: 'car key duplication, duplicate car keys, car key replacement, car key types',
      primaryKeyword: 'car key duplication',
      wordCount: 2500,
      priority: 0.7
    },
    findKeyShop: {
      path: '/blog/how-to-find-reliable-key-shop',
      title: 'How to Find a Reliable Key Shop Near You',
      description: 'Tips for choosing the best key shop near you with verified credentials and reviews',
      keywords: 'best key shop near me, reliable key shop, how to find key shop',
      primaryKeyword: 'best key shop near me',
      wordCount: 1200,
      priority: 0.6
    },
    lostCarKey: {
      path: '/blog/lost-car-key-recovery-guide',
      title: 'Lost Your Car Key? Complete Recovery Guide',
      description: 'Step-by-step guide when you\'ve lost your car key - costs, timeline, and prevention tips',
      keywords: 'lost car key, lost key replacement, emergency key service, car key lost',
      primaryKeyword: 'lost car key',
      wordCount: 1800,
      priority: 0.6
    }
  },

  // Location Pages Configuration
  locations: {
    tamilNadu: {
      path: '/key-shops/tamil-nadu',
      title: 'Key Shops in Tamil Nadu | Professional Key Duplication Services',
      description: 'Find verified key shops throughout Tamil Nadu for car keys, bike keys, home keys, and emergency services.',
      keywords: 'key shops in Tamil Nadu, key duplication Tamil Nadu, key shop Chennai',
      primaryKeyword: 'key shops Tamil Nadu',
      priority: 0.8
    },
    chennai: {
      path: '/key-shops/chennai',
      title: 'Professional Key Shops & Duplication Services in Chennai',
      description: 'Find verified key shops in Chennai for duplicate car keys, bike keys, home keys, and emergency key replacement services.',
      keywords: 'key shop in Chennai, duplicate keys Chennai, car key duplicate Chennai',
      primaryKeyword: 'key shop Chennai',
      priority: 0.8
    },
    bangalore: {
      path: '/key-shops/bangalore',
      title: 'Duplicate Key Services in Bangalore | Find Best Key Shops',
      description: 'Professional key duplication and key replacement services in Bangalore. Car keys, bike keys, home keys, and 24/7 emergency services.',
      keywords: 'key shop Bangalore, duplicate keys Bangalore, car key duplicate Bangalore',
      primaryKeyword: 'key shop Bangalore',
      priority: 0.8
    },
    hyderabad: {
      path: '/key-shops/hyderabad',
      title: 'Key Duplication Services in Hyderabad | Certified Key Shops',
      description: 'Find trusted key shops in Hyderabad for professional key duplication, replacement, and emergency services.',
      keywords: 'key shop Hyderabad, duplicate keys Hyderabad, key duplication Hyderabad',
      primaryKeyword: 'key shop Hyderabad',
      priority: 0.7
    },
    pune: {
      path: '/key-shops/pune',
      title: 'Professional Key Duplication Services in Pune',
      description: 'Find certified key shops in Pune for car keys, bike keys, home keys, and emergency key replacement.',
      keywords: 'key shop Pune, duplicate keys Pune, car key duplicate Pune',
      primaryKeyword: 'key shop Pune',
      priority: 0.7
    },
    mumbai: {
      path: '/key-shops/mumbai',
      title: 'Key Shops & Duplication Services in Mumbai',
      description: 'Professional key duplication services in Mumbai. Same-day service, transparent pricing, verified shops.',
      keywords: 'key shop Mumbai, duplicate keys Mumbai, key duplication Mumbai',
      primaryKeyword: 'key shop Mumbai',
      priority: 0.7
    }
  },

  // Structured Data
  structuredData: {
    organization: {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "KeyShops.in",
      "url": "https://keyshops.in",
      "logo": "https://keyshops.in/assets/keyshop-logo.png",
      "description": "Platform for duplicate keys, key replacement, and key shop services in India",
      "sameAs": [
        "https://www.facebook.com/keyshops.in",
        "https://www.instagram.com/keyshops.in",
        "https://twitter.com/keyshops.in"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "Customer Support",
        "telephone": "+91-XXXXXXXXXX",
        "email": "support@keyshops.in",
        "availableLanguage": ["en", "ta"]
      },
      "foundingDate": "2024"
    },

    localBusiness: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "KeyShops.in",
      "alternateName": "Key Shop",
      "description": "India's leading duplicate key management platform connecting customers with verified key shops",
      "url": "https://keyshops.in",
      "logo": "https://keyshops.in/assets/keyshop-logo.png",
      "image": "https://keyshops.in/og-image.png",
      "telephone": "+91-XXXXXXXXXX",
      "email": "support@keyshops.in",
      "priceRange": "₹50-₹500",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "IN",
        "addressRegion": "Tamil Nadu"
      },
      "areaServed": ["Tamil Nadu", "Karnataka", "Telangana", "Maharashtra"],
      "serviceType": ["Duplicate Keys", "Key Replacement", "Car Keys", "Bike Keys", "Home Keys", "Office Keys"]
    },

    website: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "url": "https://keyshops.in",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://keyshops.in/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  },

  // Analytics
  analytics: {
    googleAnalyticsId: 'G-XXXXXXXXXX', // Update with actual GA4 ID
    trackingEnabled: true,
    eventTracking: {
      pageView: 'page_view',
      search: 'search',
      shopView: 'shop_view',
      contact: 'contact',
      callShop: 'call_shop'
    }
  },

  // Performance Settings
  performance: {
    imageOptimization: true,
    lazyLoadImages: true,
    enableCaching: true,
    cacheMaxAge: 2592000 // 30 days in seconds
  },

  // Sitemap Configuration
  sitemap: {
    updateFrequency: 'weekly',
    priority: {
      homepage: 1.0,
      servicePages: 0.8,
      blogPosts: 0.7,
      locationPages: 0.8,
      about: 0.6,
      contact: 0.6
    }
  },

  // Rich Results / Featured Snippets
  richResults: {
    enableFAQSchema: true,
    enableArticleSchema: true,
    enableBreadcrumbSchema: true,
    enableVideoSchema: false
  }
};

export default seoConfig;
