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

async function uploadFile(urlPath: string, token: string, fields: Record<string,string>, mime = 'image/png', filename = 'test.png') {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('fake-bytes')], { type: mime }), filename);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE}${urlPath}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form as any });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  const suffix = Date.now();
  await jsonReq('POST', '/auth/register-shop', {}, undefined).catch(() => {});
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const firestore = new FirestoreService();
  await firestore.db.collection('shopCategories').doc('key-shops').set({
    name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const reg = await jsonReq('POST', '/auth/register-shop', {
    shopName: `Files Test Shop ${suffix}`, ownerName: 'Files Owner',
    phone: `9${String(suffix).slice(-9)}`, password: 'TestPass123',
    location: 'Test Address', categoryId: 'key-shops', startTrial: true,
  });
  const login = await jsonReq('POST', '/auth/login', { email: reg.body.loginPhone, password: 'TestPass123', platform: 'native' });
  const token = login.body.accessToken;

  const cust = await jsonReq('POST', '/shop/customers', { name: 'Doc Customer', phone: `4${String(suffix).slice(-9)}` }, token);
  const custId = cust.body.id;
  console.log('customer created:', custId);

  console.log('\n--- Upload a customer document ---');
  const doc = await uploadFile(`/shop/customers/${custId}/docs`, token, { documentType: 'ID_PROOF' }, 'application/pdf', 'id.pdf');
  console.log('doc upload:', doc.status, doc.body?.id);

  console.log('\n--- Delete the document ---');
  const del = await jsonReq('DELETE', `/shop/customers/${custId}/docs/${doc.body.id}`, undefined, token);
  console.log('delete:', del.status, del.body);

  console.log('\n--- Upload a report PDF and download it publicly ---');
  const report = await uploadFile(`/shop/customers/${custId}/report`, token, { fileName: 'Registration Report.pdf' }, 'application/pdf', 'report.pdf');
  console.log('report upload:', report.status, report.body);

  const download = await fetch(`${BASE}/public/reports/${report.body.id}/download`);
  console.log('public download status:', download.status, 'content-type:', download.headers.get('content-type'));
  const buf = Buffer.from(await download.arrayBuffer());
  console.log('downloaded bytes match original:', buf.toString() === 'fake-bytes');

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => { console.error('Smoke test failed:', e); process.exit(1); });
