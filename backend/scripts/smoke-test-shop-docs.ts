import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
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

async function uploadFile(urlPath: string, token: string, extraFields: Record<string,string> = {}) {
  const form = new FormData();
  const blob = new Blob([Buffer.from('fake-image-bytes')], { type: 'image/png' });
  form.append('file', blob, 'test.png');
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const res = await fetch(`${BASE}${urlPath}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form as any });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  const { FirebaseAuthService } = await import('../src/firestore/auth/firebase-auth.service');
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const firestore = new FirestoreService();
  const auth = new FirebaseAuthService();

  await firestore.db.collection('shopCategories').doc('key-shops').set({
    name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const suffix = Date.now();
  const email = `super-${suffix}@example.com`;
  const user = await auth.createUser({ email, password: 'SuperPass123', displayName: 'Test Super Admin' });
  await firestore.db.collection('users').doc(user.uid).set({
    email, phone: null, name: 'Test Super Admin', role: 'SUPER_ADMIN', shopId: null,
    deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await auth.setCustomClaims(user.uid, { role: 'SUPER_ADMIN', shopId: null });
  const superLogin = await jsonReq('POST', '/auth/login', { email, password: 'SuperPass123', platform: 'native' });
  const superToken = superLogin.body.accessToken;

  const create = await jsonReq('POST', '/super/shops', {
    name: `Doc Test Shop ${suffix}`,
    adminEmail: `shopadmin-${suffix}@example.com`,
    adminName: 'Doc Admin',
    adminPassword: 'ShopPass123',
    adminPhone: `7${String(suffix).slice(-9)}`,
    categoryId: 'key-shops',
  }, superToken);
  const shopId = create.body.id;
  console.log('shop created:', shopId);

  console.log('\n--- Upload shop logo ---');
  const logo = await uploadFile(`/shop/settings/logo/upload?shopId=${shopId}`, superToken);
  console.log('logo upload:', logo.status, !!logo.body?.logoUrl);

  console.log('\n--- Upload a verification document ---');
  const doc1 = await uploadFile(`/shop/settings/documents?shopId=${shopId}`, superToken, { documentType: 'VERIFICATION_DOCUMENT' });
  console.log('doc upload:', doc1.status, doc1.body);

  const listAfterFirst = await jsonReq('GET', `/super/shops/${shopId}`, undefined, superToken);
  console.log('documents count after 1st upload (expect 1):', listAfterFirst.body?.documents?.length);

  console.log('\n--- Replace the same document type ---');
  const doc2 = await uploadFile(`/shop/settings/documents?shopId=${shopId}`, superToken, { documentType: 'VERIFICATION_DOCUMENT' });
  console.log('doc replace:', doc2.status, doc2.body?.id !== doc1.body?.id ? 'new id (as expected)' : 'SAME id (unexpected)');

  const listAfterReplace = await jsonReq('GET', `/super/shops/${shopId}`, undefined, superToken);
  console.log('documents count after replace (expect still 1, old one gone):', listAfterReplace.body?.documents?.length);

  console.log('\n--- Delete the document ---');
  const del = await jsonReq('DELETE', `/shop/settings/documents/${doc2.body.id}?shopId=${shopId}`, undefined, superToken);
  console.log('delete:', del.status, del.body);

  const listAfterDelete = await jsonReq('GET', `/super/shops/${shopId}`, undefined, superToken);
  console.log('documents count after delete (expect 0):', listAfterDelete.body?.documents?.length);

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => { console.error('Smoke test failed:', e); process.exit(1); });
