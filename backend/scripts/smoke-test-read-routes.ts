// Calls every read route a Shop Admin or an anonymous visitor can reach - including the filter / sort /
// pagination combinations that need Firestore composite indexes - and fails on any server error.
//
// Why this exists: the Firestore EMULATOR does not enforce composite indexes, but real Firestore does, so a
// query with no matching index works in every local test and then returns 500 in production (the ads
// endpoints did exactly that). Run this against a real deployment after changing any query or index:
//   SMOKE_TEST_BASE_URL=https://api-roe6cy7kca-uc.a.run.app npx ts-node -r tsconfig-paths/register scripts/smoke-test-read-routes.ts
//
// Creates a throwaway shop ("Audit Fix Shop routes ...", removed by cleanup-test-data.ts). Super Admin-only
// routes are not covered (they need a Super Admin session).
const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:4100') + '/api';
const octet = () => Math.floor(Math.random() * 250);
const randomIp = () => `10.${octet()}.${octet()}.${octet()}`;

async function req(method: string, p: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': randomIp(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const PUBLIC_ROUTES = [
  '/public/ads',
  '/public/ads/poster',
  '/public/shops',
  '/public/shops?limit=5',
  '/public/shops?query=key',
  '/public/shops?town=Chennai',
  '/public/shops?query=key&town=Chennai&limit=5',
  '/public/machines',
  '/public/machines?limit=5',
  '/public/machines?category=MACHINE&limit=5',
  '/public/machines?town=Chennai&limit=5',
  '/public/machines?search=key',
  '/public/machines?shopId=does-not-exist&limit=5',
  '/public/search?q=key',
  '/shop-categories',
  '/key-types',
  '/product-types',
  '/support-config',
];

const SHOP_ROUTES = [
  '/auth/me',
  '/activity-log',
  '/geo/reverse-geocode?lat=13.0827&lng=80.2707',
  '/promotions',
  '/promotions?limit=5',
  '/promotions?type=PRODUCT&limit=5',
  '/promotions?category=MACHINE&type=PRODUCT&limit=5',
  '/promotions?mine=true',
  '/promotions?mine=true&type=PRODUCT&limit=5',
  '/promotions?search=key',
  '/promotions?town=Chennai&limit=5',
  '/shop/advertisements',
  '/shop/customers',
  '/shop/customers?limit=5',
  '/shop/customers?keysOnly=true',
  '/shop/customers?keysOnly=true&limit=5',
  '/shop/customers?search=a',
  '/shop/customers?town=Chennai',
  '/shop/customers/global-search?search=9999999999',
  '/shop/dashboard',
  '/shop/keys/search?search=a',
  '/shop/notifications',
  '/shop/notifications?limit=5',
  '/shop/referral',
  '/shop/settings',
];

async function main() {
  const suffix = Date.now();
  const phone = `9${String(suffix).slice(-9)}`;

  const sent = await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'register' });
  if (!sent.body?.devCode) { console.log('FAIL  no devCode (is OTP_SHOW_CODE_IN_UI on?)', sent); process.exit(1); }
  await req('POST', '/auth/verify-otp', { identifier: phone, purpose: 'register', code: sent.body.devCode });
  const reg = await req('POST', '/auth/register-shop', {
    shopName: `Audit Fix Shop routes ${suffix}`, ownerName: 'Route Sweeper', phone, password: 'SweepPass123',
    location: 'Test Address', town: 'Chennai', district: 'Chennai', categoryId: 'key-shops', startTrial: true,
  });
  const login = await req('POST', '/auth/login', { email: phone, password: 'SweepPass123', platform: 'native' });
  const token = login.body?.accessToken;
  if (reg.status !== 201 || !token) { console.log('FAIL  could not create the throwaway shop', reg, login.status); process.exit(1); }

  let failures = 0;
  let total = 0;
  const run = async (label: string, routes: string[], tok?: string) => {
    console.log(`\n--- ${label} (${routes.length} routes) ---`);
    for (const r of routes) {
      total++;
      const res = await req('GET', r, undefined, tok);
      // 2xx is expected; a 4xx (e.g. validation) is fine here; only a 5xx is a bug (missing index, crash, ...)
      const ok = res.status < 500;
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(res.status).padEnd(3)} GET ${r}${ok ? '' : '  -> ' + JSON.stringify(res.body).slice(0, 160)}`);
    }
  };
  await run('Public (no login)', PUBLIC_ROUTES);
  await run('Shop Admin', SHOP_ROUTES, token);

  console.log(`\n${failures === 0 ? `ALL ${total} ROUTES OK (no 5xx)` : `${failures} OF ${total} ROUTES RETURNED A SERVER ERROR`}. Run cleanup-test-data.ts to remove "Audit Fix Shop" data.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('Sweep crashed:', e); process.exit(1); });
