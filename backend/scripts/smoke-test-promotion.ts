// Live HTTP smoke test for FirestorePromotionController/PublicPromotionController
// against the standalone bootstrap server (scripts/bootstrap-firestore-app.ts,
// must already be running on :4100) + Firestore/Auth emulators. Run:
//   npx ts-node -r tsconfig-paths/register scripts/smoke-test-promotion.ts
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function main() {
  const firestore = new FirestoreService();
  await firestore.db.collection('shopCategories').doc('key-shops').set({
    name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const suffix = Date.now();
  console.log('--- Register a shop to get a Shop Admin session ---');
  const reg = await json('POST', '/auth/register-shop', {
    shopName: `Promo Test Shop ${suffix}`,
    ownerName: 'Promo Owner',
    phone: `9${String(suffix).slice(-9)}`,
    password: 'TestPass123',
    location: 'Test Address',
    town: 'Coimbatore',
    district: 'Coimbatore',
    categoryId: 'key-shops',
    startTrial: true,
  });
  console.log('register-shop:', reg.status, reg.body);
  if (reg.status !== 201 && reg.status !== 200) throw new Error('registration failed');
  const shopId = reg.body.shopId;
  const loginPhone = reg.body.loginPhone;

  const login = await json('POST', '/auth/login', { email: loginPhone, password: 'TestPass123', platform: 'native' });
  console.log('login:', login.status, { uid: login.body.uid });
  const shopToken = login.body.accessToken;

  console.log('\n--- Shop Admin creates a PRODUCT listing (machine) ---');
  const create = await json('POST', '/shop/promotions', {
    type: 'PRODUCT',
    title: 'Used Key Cutting Machine',
    description: 'Well maintained, 2 years old',
    price: 15000,
    productType: 'MACHINE',
    phone: '9999999999',
  }, shopToken);
  console.log('create:', create.status, create.body);
  const promoId = create.body.id;

  console.log('\n--- Shop Admin lists their own promotions (mine=true) ---');
  const mine = await json('GET', '/promotions?mine=true', undefined, shopToken);
  console.log('mine list count:', Array.isArray(mine.body) ? mine.body.length : mine.body?.items?.length, mine.status);

  console.log('\n--- Public directory sees the PRODUCT listing (no auth) ---');
  const publicList = await json('GET', `/public/machines?town=Coimbatore`);
  console.log('public list:', publicList.status, JSON.stringify(publicList.body).slice(0, 300));
  const foundInPublic = Array.isArray(publicList.body) ? publicList.body.some((p: any) => p.id === promoId) : false;
  console.log('found in public feed:', foundInPublic);

  console.log('\n--- Public directory in a DIFFERENT town does NOT see it ---');
  const wrongTown = await json('GET', `/public/machines?town=Chennai`);
  const foundWrongTown = Array.isArray(wrongTown.body) ? wrongTown.body.some((p: any) => p.id === promoId) : false;
  console.log('found in wrong-town feed (should be false):', foundWrongTown);

  console.log('\n--- Public getById works ---');
  const byId = await json('GET', `/public/machines/${promoId}`);
  console.log('getById:', byId.status, byId.body?.title);

  console.log('\n--- Shop Admin updates their own listing ---');
  const update = await json('PUT', `/shop/promotions/${promoId}`, { price: 12000 }, shopToken);
  console.log('update:', update.status, update.body?.price);

  console.log('\n--- SECURITY: Shop Admin cannot hit Super-Admin-only route ---');
  const superAttempt = await json('POST', '/super/promotions', { type: 'AD', title: 'Should be blocked' }, shopToken);
  console.log('super route as shop admin (expect 403):', superAttempt.status);

  console.log('\n--- SECURITY: Shop Admin cannot delete a listing they do not own ---');
  await firestore.db.collection('promotions').add({
    type: 'PRODUCT', title: 'Someone elses machine', shopId: 'other-shop-id', createdById: 'other-uid',
    deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(), imageUrls: [],
  });
  const otherShopPromo = await firestore.db.collection('promotions').where('shopId', '==', 'other-shop-id').limit(1).get();
  const otherPromoId = otherShopPromo.docs[0].id;
  const deleteOther = await json('DELETE', `/shop/promotions/${otherPromoId}`, undefined, shopToken);
  console.log('delete someone elses listing (expect 404):', deleteOther.status);

  console.log('\n--- Shop Admin deletes their own listing ---');
  const del = await json('DELETE', `/shop/promotions/${promoId}`, undefined, shopToken);
  console.log('delete own:', del.status, del.body);

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
