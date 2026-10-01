// Live HTTP smoke test for FirestoreCustomerController/FirestoreSuperCustomerController
// against the standalone bootstrap server (must already be running on :4100)
// + Firestore/Auth/Storage emulators. Run:
//   npx ts-node -r tsconfig-paths/register scripts/smoke-test-customer-crud.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

const BASE = 'http://127.0.0.1:4100/api';

async function json(method: string, urlPath: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const { FirebaseAuthService } = await import('../src/firestore/auth/firebase-auth.service');
  const firestore = new FirestoreService();
  const auth = new FirebaseAuthService();

  await firestore.db.collection('shopCategories').doc('key-shops').set({
    name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const suffix = Date.now();
  console.log('--- Register a shop to get a Shop Admin session ---');
  const reg = await json('POST', '/auth/register-shop', {
    shopName: `Customer Test Shop ${suffix}`, ownerName: 'Cust Owner',
    phone: `9${String(suffix).slice(-9)}`, password: 'TestPass123',
    location: 'Test Address', categoryId: 'key-shops', startTrial: true,
  });
  const shopId = reg.body.shopId;
  const login = await json('POST', '/auth/login', { email: reg.body.loginPhone, password: 'TestPass123', platform: 'native' });
  const shopToken = login.body.accessToken;
  console.log('shop:', shopId, 'admin login ok:', login.status === 201);

  console.log('\n--- Shop Admin creates two customers, one with a key ---');
  const c1 = await json('POST', '/shop/customers', {
    name: 'Alice Customer', phone: `7${String(suffix).slice(-9)}`, keyNumber: `KEY${suffix}`,
    manualKey: { category: 'Car' }, vehicleCategory: 'Car',
  }, shopToken);
  console.log('create c1:', c1.status, { id: c1.body?.id, keyNumber: c1.body?.keyNumber, masterKeyId: c1.body?.masterKeyId });

  const c2 = await json('POST', '/shop/customers', {
    name: 'Bob Customer', phone: `6${String(suffix).slice(-9)}`,
  }, shopToken);
  console.log('create c2:', c2.status, { id: c2.body?.id });

  console.log('\n--- Shop Admin lists customers (unpaginated) ---');
  const list = await json('GET', '/shop/customers', undefined, shopToken);
  console.log('list count (expect 2):', Array.isArray(list.body) ? list.body.length : 'n/a', list.status);
  console.log('enriched shop/masterKey on c1:', list.body?.find((c: any) => c.id === c1.body.id)?.shop?.name, list.body?.find((c: any) => c.id === c1.body.id)?.masterKey);

  console.log('\n--- Shop Admin lists keysOnly ---');
  const keysOnly = await json('GET', '/shop/customers?keysOnly=true', undefined, shopToken);
  console.log('keysOnly count (expect 1):', keysOnly.body?.length);

  console.log('\n--- Shop Admin paginated list (limit=1) ---');
  const page1 = await json('GET', '/shop/customers?limit=1', undefined, shopToken);
  console.log('page1:', page1.status, 'count:', page1.body?.items?.length, 'nextCursor:', !!page1.body?.nextCursor);

  console.log('\n--- Exact phone search (global-search) ---');
  const searchByPhone = await json('GET', `/shop/customers/global-search?search=${c2.body.phone}`, undefined, shopToken);
  console.log('search by phone found:', searchByPhone.body?.some((c: any) => c.id === c2.body.id));

  console.log('\n--- Exact key search (duplicate-key check use case) ---');
  const searchByKey = await json('GET', `/shop/customers?search=KEY${suffix}`, undefined, shopToken);
  console.log('search by key found:', searchByKey.body?.some((c: any) => c.id === c1.body.id));

  console.log('\n--- Shop Admin updates a customer (with encrypted idProofNumber) ---');
  const update = await json('PUT', `/shop/customers/${c1.body.id}`, { name: 'Alice Updated', idProofNumber: 'AADHAAR1234' }, shopToken);
  console.log('update:', update.status, update.body?.name, 'idProofNumber decrypted back:', update.body?.idProofNumber);

  console.log('\n--- SECURITY: Shop Admin cannot access another shop customer via super route ---');
  const forbiddenSuper = await json('GET', '/super/customers', undefined, shopToken);
  console.log('shop admin hitting super/customers (expect 403):', forbiddenSuper.status);

  console.log('\n--- Super Admin cross-shop list (collectionGroup) ---');
  const suffix2 = Date.now();
  const superEmail = `super-${suffix2}@example.com`;
  const superUser = await auth.createUser({ email: superEmail, password: 'SuperPass123', displayName: 'Test Super' });
  await firestore.db.collection('users').doc(superUser.uid).set({
    email: superEmail, phone: null, name: 'Test Super', role: 'SUPER_ADMIN', shopId: null,
    deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await auth.setCustomClaims(superUser.uid, { role: 'SUPER_ADMIN', shopId: null });
  const superLogin = await json('POST', '/auth/login', { email: superEmail, password: 'SuperPass123', platform: 'native' });
  const superToken = superLogin.body.accessToken;

  const superList = await json('GET', '/super/customers', undefined, superToken);
  console.log('super list count (expect >= 2):', superList.body?.length, superList.status);
  const foundC1 = superList.body?.some((c: any) => c.id === c1.body.id);
  const foundC2 = superList.body?.some((c: any) => c.id === c2.body.id);
  console.log('found both customers cross-shop:', foundC1 && foundC2);

  console.log('\n--- Super Admin updates a customer directly (no shopId needed) ---');
  const superUpdate = await json('PUT', `/super/customers/${c2.body.id}`, { name: 'Bob Renamed By Super' }, superToken);
  console.log('super update:', superUpdate.status, superUpdate.body?.name);

  console.log('\n--- Super Admin creates a customer for a specific shop ---');
  const superCreate = await json('POST', '/super/customers', {
    shopId, name: 'Carol By Super', phone: `5${String(suffix).slice(-9)}`,
  }, superToken);
  console.log('super create:', superCreate.status, superCreate.body?.name);

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => { console.error('Smoke test failed:', e); process.exit(1); });
