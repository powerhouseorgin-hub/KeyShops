// Live HTTP smoke test for FirestoreShopController/PublicShopController
// against the standalone bootstrap server (must already be running on
// :4100) + Firestore/Auth emulators. Run:
//   npx ts-node -r tsconfig-paths/register scripts/smoke-test-shop.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';

const BASE = 'http://127.0.0.1:4100/api';

async function json(method: string, urlPath: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function loginAsSuperAdmin(firestore: FirestoreService) {
  // No self-registration path for Super Admin exists (by design - see
  // AuthService's original comment: Super Admins are provisioned directly,
  // never self-register) - so this test creates one straight through the
  // Auth emulator + a Firestore users doc, mirroring what a one-off seed
  // script would do in production.
  const { FirebaseAuthService } = await import('../src/firestore/auth/firebase-auth.service');
  const auth = new FirebaseAuthService();
  const suffix = Date.now();
  const email = `super-${suffix}@example.com`;
  const user = await auth.createUser({ email, password: 'SuperPass123', displayName: 'Test Super Admin' });
  await firestore.db.collection('users').doc(user.uid).set({
    email, phone: null, name: 'Test Super Admin', role: 'SUPER_ADMIN', shopId: null,
    deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await auth.setCustomClaims(user.uid, { role: 'SUPER_ADMIN', shopId: null });
  const login = await json('POST', '/auth/login', { email, password: 'SuperPass123', platform: 'native' });
  return login.body.accessToken as string;
}

async function main() {
  const firestore = new FirestoreService();
  await firestore.db.collection('shopCategories').doc('key-shops').set({
    name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const superToken = await loginAsSuperAdmin(firestore);
  console.log('--- Logged in as Super Admin ---');

  const suffix = Date.now();
  console.log('\n--- Super Admin provisions a shop ---');
  const create = await json('POST', '/super/shops', {
    name: `Provisioned Shop ${suffix}`,
    adminEmail: `shopadmin-${suffix}@example.com`,
    adminName: 'Provisioned Admin',
    adminPassword: 'ShopPass123',
    adminPhone: `8${String(suffix).slice(-9)}`,
    categoryId: 'key-shops',
    town: 'Chennai',
    district: 'Chennai',
    companyDetails: JSON.stringify({ address: 'Provisioned Address', phone: `8${String(suffix).slice(-9)}` }),
  }, superToken);
  console.log('create:', create.status, { id: create.body?.id, name: create.body?.name, subs: create.body?.subscriptions?.length, admins: create.body?.users?.length });
  const shopId = create.body.id;

  // Logged in once here, BEFORE suspension, and reused across the whole
  // suspend/reactivate cycle below - this is what actually tests "does an
  // existing session get rejected/restored", as opposed to a fresh login
  // attempt against an already-suspended shop (which is correctly rejected
  // at the login gate itself, by design, and proves nothing about session
  // invalidation specifically).
  const adminLogin = await json('POST', '/auth/login', {
    email: `shopadmin-${suffix}@example.com`, password: 'ShopPass123', platform: 'native',
  });
  const adminToken = adminLogin.body.accessToken;
  console.log('admin login (before suspend):', adminLogin.status);

  console.log('\n--- Super Admin gets shop by id ---');
  const getOne = await json('GET', `/super/shops/${shopId}`, undefined, superToken);
  console.log('getShopById:', getOne.status, getOne.body?.name, 'subscription plan:', getOne.body?.subscriptions?.[0]?.plan);

  console.log('\n--- Super Admin lists shops (paginated) ---');
  const list = await json('GET', '/super/shops?limit=5', undefined, superToken);
  console.log('list:', list.status, 'count:', list.body?.items?.length, 'nextCursor:', list.body?.nextCursor);

  console.log('\n--- Super Admin updates shop details ---');
  const update = await json('PUT', `/super/shops/${shopId}`, { name: `Renamed Shop ${suffix}` }, superToken);
  console.log('update:', update.status, update.body?.name);

  console.log('\n--- Super Admin suspends the shop ---');
  const suspend = await json('POST', `/super/shops/${shopId}/suspend`, { isActive: false }, superToken);
  console.log('suspend:', suspend.status, suspend.body?.isActive);

  console.log('\n--- Existing session rejected while suspended ---');
  const whoamiSuspended = await json('POST', '/auth-test/whoami', undefined, adminToken);
  console.log('whoami while suspended (expect 401):', whoamiSuspended.status);

  console.log('\n--- Reactivate shop ---');
  const reactivate = await json('POST', `/super/shops/${shopId}/suspend`, { isActive: true }, superToken);
  console.log('reactivate:', reactivate.status, reactivate.body?.isActive);
  const whoamiActive = await json('POST', '/auth-test/whoami', undefined, adminToken);
  console.log('whoami after reactivate (expect 200):', whoamiActive.status);

  console.log('\n--- Super Admin renews subscription ---');
  const sub = await json('POST', `/super/subscriptions/${shopId}`, { status: 'ACTIVE' }, superToken);
  console.log('renew subscription:', sub.status, sub.body?.plan, sub.body?.status);

  console.log('\n--- Shop Admin reads/updates own settings ---');
  const settings = await json('GET', '/shop/settings', undefined, adminToken);
  console.log('getSettings:', settings.status, settings.body?.name);
  const updateSettings = await json('PUT', '/shop/settings', { companyDetails: JSON.stringify({ address: 'New Address', phone: `8${String(suffix).slice(-9)}` }) }, adminToken);
  console.log('updateSettings:', updateSettings.status, updateSettings.body?.companyDetails);

  console.log('\n--- Shop Admin referral overview ---');
  const referral = await json('GET', '/shop/referral', undefined, adminToken);
  console.log('referral overview:', referral.status, referral.body);

  console.log('\n--- SECURITY: Shop Admin cannot list super/shops ---');
  const forbidden = await json('GET', '/super/shops', undefined, adminToken);
  console.log('shop admin hitting super/shops (expect 403):', forbidden.status);

  console.log('\n--- Public directory sees the active shop (Chennai) ---');
  const publicSearch = await json('GET', '/public/shops?town=Chennai');
  const foundPublic = Array.isArray(publicSearch.body) ? publicSearch.body.some((s: any) => s.id === shopId) : false;
  console.log('public search found shop:', foundPublic, 'count:', Array.isArray(publicSearch.body) ? publicSearch.body.length : 'n/a');

  console.log('\n--- Public getById includes products array ---');
  const publicById = await json('GET', `/public/shops/${shopId}`);
  console.log('public getById:', publicById.status, publicById.body?.name, 'products:', publicById.body?.products?.length);

  console.log('\n--- Public category filter (KEY_SHOPS) ---');
  const catFilter = await json('GET', '/public/shops?category=KEY_SHOPS&town=Chennai');
  const foundInCat = Array.isArray(catFilter.body) ? catFilter.body.some((s: any) => s.id === shopId) : false;
  console.log('found via category filter:', foundInCat);

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
