import React, { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../apiConfig';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const PHONE_REGEX = /^[1-9]\d{9}$/;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth state from LocalStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('kee_auth_user');
    const savedToken = localStorage.getItem('kee_auth_token');

    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setToken(savedToken);
    }
    setLoading(false);

    // Fire-and-forget - the free-tier backend host spins down after ~15 min
    // of inactivity, and the first real request after that (often the
    // login submit itself) pays a 30-70s cold-start penalty. Pinging health
    // here, the instant the app boots, overlaps that wake-up time with
    // however long the user takes to read the screen / type their
    // credentials, instead of it stacking entirely after they hit "Sign in".
    fetch(`${API_BASE}/api/health`).catch(() => {});
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      try {
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('dismissed_ad_')) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (err) {}

      // Tell the backend whether this is the native app or a browser, so it
      // can enforce that Shop Admin accounts only sign in from the app.
      const platform = Capacitor.isNativePlatform() ? 'native' : 'web';

      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, platform }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Login failed');
      }

      const res = await response.json();
      setUser(res.user);
      setToken(res.accessToken);
      localStorage.setItem('kee_auth_user', JSON.stringify(res.user));
      localStorage.setItem('kee_auth_token', res.accessToken);
      return res.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('kee_auth_user');
    localStorage.removeItem('kee_auth_token');
  };

  // HTTP request helper
  const request = async (url, method = 'GET', body = null, isMultipart = false) => {
    const headers = {};
    if (!isMultipart) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      method,
      headers,
    };

    if (body) {
      config.body = isMultipart ? body : JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${url}`, config);

    if (response.status === 401) {
      logout();
      throw new Error('Your session has expired. Please login again.');
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Operation failed');
    }

    return response.json();
  };

  // Unified API Methods, backed entirely by the live NestJS backend
  const api = {
    changePassword: async (oldPassword, newPassword) => {
      return request('/api/auth/change-password', 'POST', { oldPassword, newPassword });
    },

    resetPasswordPublic: async (identifier, method, newPassword) => {
      const response = await fetch(`${API_BASE}/api/auth/reset-password-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, method, newPassword })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Password reset failed');
      }
      return response.json();
    },

    sendOtp: async (identifier, method, purpose) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (method === 'email' && !emailRegex.test(identifier)) {
        throw new Error('Invalid email address format');
      }
      if (method === 'phone' && !PHONE_REGEX.test(identifier)) {
        throw new Error('Phone number must be exactly 10 digits and cannot start with 0');
      }

      const response = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, method, purpose })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to send OTP code');
      }
      const result = await response.json();
      // Testing convenience: backend only includes devCode when no real email/SMS
      // provider is configured for this environment (delivery failed/not attempted),
      // so this stops appearing automatically once SMTP/Twilio are set up.
      if (result.devCode) {
        console.log(`%c[KEE DEV] OTP code for ${identifier}: ${result.devCode}`, 'color:#4f46e5; font-weight:bold; font-size:13px;');
      }
      return result;
    },

    verifyOtp: async (identifier, method, purpose, code) => {
      const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, method, purpose, code })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'OTP verification failed');
      }
      return response.json();
    },

    registerShop: async (dto) => {
      const response = await fetch(`${API_BASE}/api/auth/register-shop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto)
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Self-registration failed');
      }
      return response.json();
    },

    // Creates a Razorpay order for the current platform-wide subscription
    // price (server reads PlatformConfig itself - the client never sends an
    // amount). Public/unauthenticated - called before the shop account
    // exists, right before opening Razorpay Checkout on the registration
    // wizard's payment step.
    createPaymentOrder: async () => {
      const response = await fetch(`${API_BASE}/api/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to initialize payment');
      }
      return response.json();
    },

    // Public landing-page shop search (no auth) - used by the "Find a Shop"
    // search page, the Dealers directory, and the ECM/Meter/Scanning/Key
    // Shops category screens. Pagination is opt-in via `limit` - omit it
    // (the default) for the original flat, top-50 array; pass `limit` to get
    // `{ items, nextCursor }` pages instead (used by the Dealers directory's
    // infinite scroll).
    searchPublicShops: async (opts = {}) => {
      const { query = '', category = '', cursor, limit } = opts;
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (category) params.append('category', category);
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      const qs = params.toString();
      const url = `${API_BASE}/api/public/shops${qs ? `?${qs}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Shop search failed');
      }
      return response.json();
    },

    // Single shop's public details (business/public fields + its product
    // listings) - powers the pre-login mobile app's shop-details screen.
    getPublicShopById: async (id) => {
      const response = await fetch(`${API_BASE}/api/public/shops/${id}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Shop not found');
      }
      return response.json();
    },

    // Pre-login mobile app's ad carousel - active, platform-wide ads only.
    getPublicAds: async () => {
      const response = await fetch(`${API_BASE}/api/public/ads`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to load ads');
      }
      return response.json();
    },

    // Pre-login mobile app's Machines/Products directory (backed by
    // Promotion rows of type PRODUCT). Same opt-in-`limit` pagination
    // convention as searchPublicShops.
    getPublicMachines: async (opts = {}) => {
      const { category = '', search = '', cursor, limit, shopId } = opts;
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (search) params.append('search', search);
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      if (shopId) params.append('shopId', shopId);
      const qs = params.toString();
      const response = await fetch(`${API_BASE}/api/public/machines${qs ? `?${qs}` : ''}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to load machines');
      }
      return response.json();
    },

    getPublicMachineById: async (id) => {
      const response = await fetch(`${API_BASE}/api/public/machines/${id}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Listing not found');
      }
      return response.json();
    },

    // Combined Shops+Machines search for the pre-login mobile app's search
    // overlay. Never touches Customer data - see PublicSearchController.
    getPublicSearch: async (q) => {
      const response = await fetch(`${API_BASE}/api/public/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Search failed');
      }
      return response.json();
    },

    // Product type filter chips for the Machines tab - now a public route
    // (see ProductTypeController).
    getPublicProductTypes: async () => {
      const response = await fetch(`${API_BASE}/api/product-types`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to load product types');
      }
      return response.json();
    },

    // --- SUPER ADMIN: SHOPS ---
    // `search` is optional and filters server-side (name/admin name/admin
    // email) while still returning the full flat-array shape (no `limit`
    // passed) - used by the dashboard's global search so it doesn't have to
    // pull every shop on the platform just to filter client-side.
    getShops: async (search = '') => request(`/api/super/shops${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    // Cursor-paginated variant of the same endpoint, used only by the Shop
    // Management screen's infinite scroll - see ShopService.getShops for why
    // this is a separate method rather than extending getShops itself
    // (several other call sites depend on its plain-flat-array,
    // unpaginated shape).
    getShopsPage: async ({ search = '', cursor, limit } = {}) => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      return request(`/api/super/shops?${params.toString()}`);
    },
    createShop: async (dto) => request('/api/super/shops', 'POST', dto),
    updateShop: async (id, dto) => request(`/api/super/shops/${id}`, 'PUT', dto),
    suspendShop: async (id, isActive) => request(`/api/super/shops/${id}/suspend`, 'POST', { isActive }),
    updateSubscription: async (shopId, dto) => request(`/api/super/subscriptions/${shopId}`, 'POST', dto),

    // --- MASTER KEYS (shop-scoped for Shop Admin, all-shops for Super Admin) ---
    // When Super Admin passes a shopId (e.g. registering a customer on behalf of
    // a shop they picked in the wizard), scope the catalog to that shop instead
    // of returning the global all-shops list.
    getMasterKeys: async (search = '', shopId = '') => {
      const url = user.role === 'SUPER_ADMIN'
        ? (shopId ? `/api/super/shops/${shopId}/keys?search=${search}` : `/api/super/keys?search=${search}`)
        : `/api/shop/keys/search?query=${search}`;
      return request(url);
    },
    // Cursor-paginated variant of the Super Admin cross-shop key listing,
    // used only by the Master Catalogue screen's infinite scroll - see
    // KeyService.getKeys for why this is a separate method rather than
    // extending getMasterKeys itself (several other call sites depend on
    // its plain-flat-array, unpaginated shape).
    getMasterKeysPage: async ({ search = '', cursor, limit } = {}) => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      return request(`/api/super/keys?${params.toString()}`);
    },

    // Super Admin: create a global catalog key (not tied to a shop)
    createMasterKey: async (dto) => request('/api/super/keys', 'POST', dto),

    updateMasterKey: async (id, dto) => request(`/api/super/keys/${id}`, 'PUT', dto),
    deleteMasterKey: async (id) => request(`/api/super/keys/${id}`, 'DELETE'),

    // --- SHOP ADMIN: CUSTOMERS ---
    getCustomers: async (search = '') => request(`/api/shop/customers?search=${search}`),
    // Cursor-paginated variant of the same endpoint, used only by the
    // Customer History list's infinite scroll - see
    // CustomerService.getCustomers for why this is a separate method rather
    // than extending getCustomers itself (several other call sites depend
    // on its plain-flat-array, unpaginated shape).
    getCustomersPage: async ({ search = '', cursor, limit } = {}) => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      return request(`/api/shop/customers?${params.toString()}`);
    },
    getGlobalCustomersForSearch: async (search = '') => request(`/api/shop/customers/global-search?search=${search}`),
    createCustomer: async (dto) => request('/api/shop/customers', 'POST', dto),
    updateCustomer: async (id, dto) => request(`/api/shop/customers/${id}`, 'PUT', dto),

    // Super Admin creating a customer on behalf of a shop (see the unified
    // Customer Registration wizard) posts docs against the /api/super/customers
    // route instead, since /api/shop/customers/* is gated to SHOP_ADMIN only.
    uploadDocument: async (customerId, documentType, file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      const url = user.role === 'SUPER_ADMIN'
        ? `/api/super/customers/${customerId}/docs`
        : `/api/shop/customers/${customerId}/docs`;
      return request(url, 'POST', formData, true);
    },

    deleteCustomerDocument: async (customerId, documentId) => {
      return request(`/api/shop/customers/${customerId}/docs/${documentId}`, 'DELETE');
    },

    // --- SHOP SETTINGS: VERIFICATION DOCUMENTS ---
    // Backed by the ShopDocument table (see ShopService.addOrReplaceShopDocument /
    // deleteShopDocument). documentType is one of SHOP_PHOTO / SHOP_LICENSE / OWNER_AADHAAR.
    // shopId is only needed (and only honored by the backend) when a Super
    // Admin is managing a specific shop's settings from Shops Management -
    // Shop Admins are always scoped to their own shop via the JWT.
    uploadSettingsDocument: async (documentType, file, shopId) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
      return request(`/api/shop/settings/documents${qs}`, 'POST', formData, true);
    },

    // id is the ShopDocument row id (not a fileKey).
    deleteSettingsDocument: async (id, shopId) => {
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
      return request(`/api/shop/settings/documents/${id}${qs}`, 'DELETE');
    },

    // Idempotent - returns the shop's existing referralCode if one was
    // already generated, otherwise mints a new one (see ShopService.getOrCreateReferralCode).
    generateReferralCode: async (shopId) => {
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
      return request(`/api/shop/settings/referral${qs}`, 'POST');
    },

    // Full Referral & Rewards overview for Shop Settings: code, points
    // balance and referral history (see ShopService.getReferralOverview).
    getReferralOverview: async (shopId) => {
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
      return request(`/api/shop/referral${qs}`);
    },

    // --- VISUAL ADS ---
    getAdvertisements: async () => {
      const url = user.role === 'SUPER_ADMIN' ? '/api/super/advertisements' : '/api/shop/advertisements';
      return request(url);
    },

    createAdvertisement: async (dto) => request('/api/super/advertisements', 'POST', dto),
    updateAdvertisement: async (id, dto) => request(`/api/super/advertisements/${id}`, 'PUT', dto),
    deleteAdvertisement: async (id) => request(`/api/super/advertisements/${id}`, 'DELETE'),
    // Uploads a banner image to real file storage and returns { url } to use
    // as imageUrl - see AdService.uploadImage. `file` is a Blob/File, already
    // resized client-side (see resizeImageFileToBlob).
    uploadAdImage: async (file) => {
      const formData = new FormData();
      formData.append('file', file, 'image.jpg');
      return request('/api/super/advertisements/upload-image', 'POST', formData, true);
    },

    // --- NOTIFICATIONS ---
    getNotifications: async () => request('/api/shop/notifications'),
    markNotificationRead: async (id) => request(`/api/shop/notifications/${id}`, 'PUT'),
    getSuperNotifications: async () => request('/api/super/notifications'),
    markSuperNotificationRead: async (id) => request(`/api/super/notifications/${id}`, 'PUT'),

    // --- REVENUE ---
    getRevenue: async () => request('/api/super/revenue'),
    logRevenue: async (month, year, amount, notes) => request('/api/super/revenue', 'POST', { month, year, amount, notes }),

    // --- SETTINGS ---
    // shopId is only used by Super Admin (see uploadSettingsDocument above).
    getSettings: async (shopId) => {
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
      return request(`/api/shop/settings${qs}`);
    },
    updateSettings: async (dto, shopId) => {
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
      return request(`/api/shop/settings${qs}`, 'PUT', dto);
    },

    // --- CROSS-SHOP PROMOTIONS (advertisements & promotional products, visible to every shop) ---
    // GET is a shared feed: every shop admin and the super admin see every shop's listings.
    // Pagination is opt-in via `limit` - omit it (the default) to get the full
    // flat array exactly as before (used by the global header search and the
    // offer-linking dropdown); pass `limit` to get `{ items, nextCursor }`
    // pages instead (used by the Machines/Inventory feed's infinite scroll).
    getPromotions: async (opts = {}) => {
      const { includeExpiredOffers = false, cursor, limit, category, search, type, excludeOffers, mine } = opts;
      const params = new URLSearchParams();
      if (includeExpiredOffers) params.append('includeExpiredOffers', 'true');
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      if (category) params.append('category', category);
      if (search) params.append('search', search);
      if (type) params.append('type', type);
      if (excludeOffers) params.append('excludeOffers', 'true');
      if (mine) params.append('mine', 'true');
      const qs = params.toString();
      return request(`/api/promotions${qs ? `?${qs}` : ''}`);
    },
    createPromotion: async (dto) => {
      const url = user.role === 'SUPER_ADMIN' ? '/api/super/promotions' : '/api/shop/promotions';
      return request(url, 'POST', dto);
    },
    // Uploads a listing photo to real file storage and returns { url } to
    // use as imageUrl - see PromotionService.uploadImage. `file` is a
    // Blob/File, already resized client-side (see resizeImageFileToBlob) -
    // this is what replaced base64-embedding the raw photo directly in the
    // create/update request body.
    uploadPromotionImage: async (file) => {
      const url = user.role === 'SUPER_ADMIN' ? '/api/super/promotions/upload-image' : '/api/shop/promotions/upload-image';
      const formData = new FormData();
      formData.append('file', file, 'image.jpg');
      return request(url, 'POST', formData, true);
    },
    updatePromotion: async (id, dto) => {
      const url = user.role === 'SUPER_ADMIN' ? `/api/super/promotions/${id}` : `/api/shop/promotions/${id}`;
      return request(url, 'PUT', dto);
    },
    deletePromotion: async (id) => {
      const url = user.role === 'SUPER_ADMIN' ? `/api/super/promotions/${id}` : `/api/shop/promotions/${id}`;
      return request(url, 'DELETE');
    },

    // --- SUPER CUSTOMERS ---
    getSuperCustomers: async (search = '') => request(`/api/super/customers?search=${search}`),
    // Cursor-paginated variant of the same endpoint, used only by the
    // Customer Registry list's infinite scroll - see
    // CustomerService.getSuperCustomers for why this is a separate method
    // rather than extending getSuperCustomers itself (several other call
    // sites depend on its plain-flat-array, unpaginated shape).
    getSuperCustomersPage: async ({ search = '', cursor, limit } = {}) => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (cursor) params.append('cursor', cursor);
      if (limit) params.append('limit', String(limit));
      return request(`/api/super/customers?${params.toString()}`);
    },
    createSuperCustomer: async (dto) => request('/api/super/customers', 'POST', dto),
    updateSuperCustomer: async (id, dto) => request(`/api/super/customers/${id}`, 'PUT', dto),

    // --- DASHBOARDS & REPORTS ---
    getDashboard: async () => {
      const url = user.role === 'SUPER_ADMIN' ? '/api/super/dashboard' : '/api/shop/dashboard';
      return request(url);
    },

    getSupportConfig: async () => request('/api/support-config'),
    updateSupportConfig: async (dto) => request('/api/super/support-config', 'POST', dto),

    // --- SHOP CATEGORIES ---
    // getShopCategories is intentionally callable pre-login (no auth header
    // required by the backend) since it also powers the Category dropdown on
    // the public self-registration wizard, before a token exists.
    getShopCategories: async () => request('/api/shop-categories'),
    createShopCategory: async (name) => request('/api/super/shop-categories', 'POST', { name }),
    updateShopCategory: async (id, name) => request(`/api/super/shop-categories/${id}`, 'PUT', { name }),
    deleteShopCategory: async (id) => request(`/api/super/shop-categories/${id}`, 'DELETE'),
    // `ids` is every active category's id, in the new display order.
    reorderShopCategories: async (ids) => request('/api/super/shop-categories/reorder', 'PUT', { ids }),

    // --- PRODUCT TYPES ---
    // Requires login (unlike shop categories, this only powers screens that
    // already sit behind auth: the Inventory Product Creation dropdown and
    // the Super Admin's Product Types management screen).
    getProductTypes: async () => request('/api/product-types'),
    createProductType: async (name) => request('/api/super/product-types', 'POST', { name }),
    updateProductType: async (id, name) => request(`/api/super/product-types/${id}`, 'PUT', { name }),
    deleteProductType: async (id) => request(`/api/super/product-types/${id}`, 'DELETE'),

    // --- KEY TYPES ---
    // Requires login - powers the Key Type dropdown on Customer Registration
    // and the Super Admin's Key Types management screen.
    getKeyTypes: async () => request('/api/key-types'),
    createKeyType: async (name) => request('/api/super/key-types', 'POST', { name }),
    updateKeyType: async (id, name) => request(`/api/super/key-types/${id}`, 'PUT', { name }),
    deleteKeyType: async (id) => request(`/api/super/key-types/${id}`, 'DELETE'),

  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, loading, login, logout, api }}>
      {children}
    </AuthContext.Provider>
  );
};
