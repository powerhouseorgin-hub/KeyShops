// Live HTTP smoke test for the newly-ported "safe backend" pieces: geo
// reverse-geocode, key management, reference lists (key-type/product-type/
// shop-category), support-config, and payment order creation. Run against
// the standalone bootstrap server (must already be running on :4100) +
// Firestore/Auth emulators.
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:4100') + '/api';

async function jsonReq(method: string, urlPath: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  const login = await jsonReq('POST', '/auth/login', { email: 'super@uitest.com', password: 'TestPass123', platform: 'native' });
  const superToken = login.body.accessToken;
  console.log('super login:', login.status);

  console.log('\n--- Reference lists: public GET (no auth) ---');
  const shopCats = await jsonReq('GET', '/shop-categories');
  console.log('shop-categories:', shopCats.status, shopCats.body.map((c: any) => c.name));
  const prodTypes = await jsonReq('GET', '/product-types');
  console.log('product-types:', prodTypes.status, prodTypes.body.length);
  const keyTypes = await jsonReq('GET', '/key-types');
  console.log('key-types:', keyTypes.status, keyTypes.body.length);

  console.log('\n--- Reference lists: create/update/delete (Super Admin) ---');
  const createCat = await jsonReq('POST', '/super/shop-categories', { name: 'Test Category' }, superToken);
  console.log('create category:', createCat.status, createCat.body);
  const catId = createCat.body.id;
  const updateCat = await jsonReq('PUT', `/super/shop-categories/${catId}`, { name: 'Test Category Renamed' }, superToken);
  console.log('update category:', updateCat.status);
  const reorderCat = await jsonReq('PUT', '/super/shop-categories/reorder', { ids: [catId] }, superToken);
  console.log('reorder categories (verifies route ordering works):', reorderCat.status, reorderCat.body);
  const deleteCat = await jsonReq('DELETE', `/super/shop-categories/${catId}`, undefined, superToken);
  console.log('delete category:', deleteCat.status);

  console.log('\n--- SECURITY: unauthenticated write should be rejected ---');
  const unauthWrite = await jsonReq('POST', '/super/shop-categories', { name: 'Hacker Category' });
  console.log('unauthenticated create (expect 401):', unauthWrite.status);

  console.log('\n--- Master Key Catalog: create/update(rename)/delete ---');
  const createKey = await jsonReq('POST', '/super/keys', { keyNumber: 'GLOBALKEY001', category: 'Car' }, superToken);
  console.log('create key:', createKey.status, createKey.body);
  const keyId = createKey.body.id;

  const dupKey = await jsonReq('POST', '/super/keys', { keyNumber: 'GLOBALKEY001', category: 'Bike' }, superToken);
  console.log('duplicate key (expect 400):', dupKey.status, dupKey.body.message);

  const listKeys = await jsonReq('GET', '/super/keys', undefined, superToken);
  console.log('list keys count:', Array.isArray(listKeys.body) ? listKeys.body.length : listKeys.body?.items?.length);

  const searchKeys = await jsonReq('GET', '/super/keys?search=GLOBALKEY', undefined, superToken);
  console.log('search keys (substring):', searchKeys.body.length, searchKeys.body.map((k: any) => k.keyNumber));

  const renameKey = await jsonReq('PUT', `/super/keys/${keyId}`, { keyNumber: 'GLOBALKEY001-RENAMED' }, superToken);
  console.log('rename key (new id expected):', renameKey.status, renameKey.body.id, renameKey.body.keyNumber);
  const newKeyId = renameKey.body.id;

  const oldKeyGone = await jsonReq('GET', '/super/keys', undefined, superToken);
  const stillHasOld = oldKeyGone.body.some((k: any) => k.id === keyId);
  console.log('old key id gone after rename (expect false):', stillHasOld);

  const deleteKey = await jsonReq('DELETE', `/super/keys/${newKeyId}`, undefined, superToken);
  console.log('delete key:', deleteKey.status, deleteKey.body);

  console.log('\n--- Support config: public GET + Super Admin update ---');
  const supportBefore = await jsonReq('GET', '/support-config');
  console.log('support-config before:', supportBefore.status, supportBefore.body);
  const updateSupport = await jsonReq('POST', '/super/support-config', {
    whatsapp: '+91 99999 88888', videos: [{ name: 'Intro', url: 'https://example.com/v.mp4' }],
    subscriptionPrice: 1499, gstPercent: 18, trialDays: 7,
  }, superToken);
  console.log('update support-config:', updateSupport.status, updateSupport.body);
  const supportAfter = await jsonReq('GET', '/support-config');
  console.log('support-config after:', supportAfter.status, supportAfter.body);

  console.log('\n--- Payment: create order (reads subscriptionPrice from support-config) ---');
  const order = await jsonReq('POST', '/payment/create-order');
  console.log('create-order (expect 500 - no Razorpay creds configured in dev):', order.status, order.body);

  console.log('\n--- Geo: reverse geocode (will fail soft - no LOCATIONIQ_API_KEY in dev) ---');
  const geo = await jsonReq('GET', '/geo/reverse-geocode?lat=13.0827&lng=80.2707');
  console.log('reverse-geocode:', geo.status, geo.body);

  console.log('\nSmoke test complete.');
  process.exit(0);
}
main().catch((e) => { console.error('Smoke test failed:', e); process.exit(1); });
