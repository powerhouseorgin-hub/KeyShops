// End-to-end checks for the security / performance fixes from the audit review, run against a real
// deployment (default: a local bootstrap server on :4100; set SMOKE_TEST_BASE_URL to test the live
// function). Creates its own throwaway shop ("Audit Fix Shop ...", removed by cleanup-test-data.ts).
//
//   SMOKE_TEST_BASE_URL=https://api-roe6cy7kca-uc.a.run.app npx ts-node -r tsconfig-paths/register scripts/smoke-test-audit-fixes.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:4100') + '/api';
// each request gets its own client IP so the per-IP rate limits (send-otp: 6 / 10 min) don't interfere
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
let failures = 0;
const check = (label: string, ok: boolean, detail?: any) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  -> ' + String(JSON.stringify(detail) ?? 'no detail').slice(0, 300)}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const db = new FirestoreService().db;

  const suffix = Date.now();
  const phone = `9${String(suffix).slice(-9)}`;
  const AADHAAR = '123456789012';

  console.log('--- Register a shop WITH an Aadhaar number ---');
  const sent = await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'register' });
  if (!sent.body?.devCode) { console.log('FAIL  no devCode - is OTP_SHOW_CODE_IN_UI on? ', sent); process.exit(1); }
  await req('POST', '/auth/verify-otp', { identifier: phone, purpose: 'register', code: sent.body.devCode });

  const badAadhaar = await req('POST', '/auth/register-shop', {
    shopName: `Audit Fix Shop bad ${suffix}`, ownerName: 'Auditor', phone: `8${String(suffix).slice(-9)}`, password: 'AuditPass123',
    location: 'Test Address', categoryId: 'key-shops', startTrial: true, aadhaarNumber: '12345',
  });
  check('register with an 11/5-digit Aadhaar is rejected (400)', badAadhaar.status === 400 && /aadhaar/i.test(JSON.stringify(badAadhaar.body)), badAadhaar);

  const reg = await req('POST', '/auth/register-shop', {
    shopName: `Audit Fix Shop ${suffix}`, ownerName: 'Auditor', phone, password: 'AuditPass123',
    location: 'Test Address', town: 'Chennai', district: 'Chennai', categoryId: 'key-shops', startTrial: true, aadhaarNumber: AADHAAR,
  });
  check('register-shop with Aadhaar succeeds', reg.status === 201, reg);
  const shopId = reg.body?.shopId;
  const login = await req('POST', '/auth/login', { email: phone, password: 'AuditPass123', platform: 'native' });
  const token = login.body?.accessToken;
  check('login works', login.status === 201 && !!token, login);

  const shopDoc = async () => (await db.collection('shops').doc(shopId).get()).data() as any;
  const stored = (await shopDoc()).aadhaarNumber as string;
  check('Aadhaar is stored encrypted, not as the 12-digit number', typeof stored === 'string' && stored !== AADHAAR && /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(stored), { looksLike: String(stored).replace(/[0-9a-f]/g, 'x').slice(0, 30) });

  console.log('\n--- Mass assignment: shop settings ---');
  const before = await shopDoc();
  const put = await req('PUT', '/shop/settings', {
    name: `Audit Fix Shop renamed ${suffix}`, themeColor: '#112233',
    referralPoints: 9999, isActive: false, categoryId: 'hacked', storageUsed: 123456, aadhaarNumber: '000000000000', deletedAt: 1,
  }, token);
  check('settings update accepted', put.status === 200, put);
  const after = await shopDoc();
  check('allowed fields (name, themeColor) were updated', after.name === `Audit Fix Shop renamed ${suffix}` && after.themeColor === '#112233', { name: after.name, themeColor: after.themeColor });
  check('referralPoints was NOT changed', after.referralPoints === before.referralPoints, { before: before.referralPoints, after: after.referralPoints });
  check('isActive was NOT changed', after.isActive === before.isActive && after.isActive === true, after.isActive);
  check('categoryId was NOT changed', after.categoryId === before.categoryId, after.categoryId);
  check('storageUsed was NOT changed', after.storageUsed === before.storageUsed, after.storageUsed);
  check('aadhaarNumber was NOT overwritten', after.aadhaarNumber === before.aadhaarNumber, 'changed');
  check('deletedAt was NOT set', after.deletedAt === before.deletedAt, after.deletedAt);
  const bigName = await req('PUT', '/shop/settings', { name: 'x'.repeat(500) }, token);
  check('oversized shop name is rejected (400)', bigName.status === 400, bigName);
  const objName = await req('PUT', '/shop/settings', { name: { $set: 1 } }, token);
  check('non-text shop name is rejected (400)', objName.status === 400, objName);

  console.log('\n--- Mass assignment: promotion update ---');
  const promo = await req('POST', '/shop/promotions', { type: 'PRODUCT', title: 'Audit Machine', description: 'd', price: 100, productType: 'MACHINE', phone: '9999999999' }, token);
  check('promotion created', promo.status === 201, promo);
  const promoId = promo.body?.id;
  const pbefore = (await db.collection('promotions').doc(promoId).get()).data() as any;
  const pput = await req('PUT', `/shop/promotions/${promoId}`, {
    title: 'Audit Machine v2', price: 250, shopId: 'someone-elses-shop', createdById: 'someone-else', type: 'AD', deletedAt: 5, createdAt: 1,
  }, token);
  check('promotion update accepted', pput.status === 200, pput);
  const pafter = (await db.collection('promotions').doc(promoId).get()).data() as any;
  check('allowed promotion fields updated', pafter.title === 'Audit Machine v2' && pafter.price === 250, { title: pafter.title, price: pafter.price });
  check('promotion shopId NOT changed', pafter.shopId === pbefore.shopId && pafter.shopId === shopId, pafter.shopId);
  check('promotion createdById NOT changed', pafter.createdById === pbefore.createdById, pafter.createdById);
  check('promotion type NOT changed', pafter.type === 'PRODUCT', pafter.type);
  check('promotion deletedAt / createdAt NOT changed', pafter.deletedAt === pbefore.deletedAt && pafter.createdAt === pbefore.createdAt, { deletedAt: pafter.deletedAt, createdAt: pafter.createdAt });
  await req('DELETE', `/shop/promotions/${promoId}`, undefined, token);

  console.log('\n--- Customers: batched list enrichment, dashboard counts, Algolia search ---');
  const c1 = await req('POST', '/shop/customers', { name: `Zephyrine${suffix}`, phone: `7${String(suffix).slice(-9)}`, keyNumber: `AUD${suffix}`, manualKey: { category: 'Car' }, vehicleCategory: 'Car' }, token);
  const c2 = await req('POST', '/shop/customers', { name: 'Second Customer', phone: `6${String(suffix).slice(-9)}` }, token);
  check('two customers created', c1.status === 201 && c2.status === 201, { c1: c1.status, c2: c2.status });

  const list = await req('GET', '/shop/customers', undefined, token);
  const row1 = Array.isArray(list.body) ? list.body.find((c: any) => c.id === c1.body?.id) : null;
  check('customer list returns both rows', Array.isArray(list.body) && list.body.length === 2, list.body?.length);
  check('each row still has its shop joined', Array.isArray(list.body) && list.body.every((c: any) => c.shop && c.shop.id === shopId), list.body?.map((c: any) => !!c.shop));
  check('master key category still joined on the keyed row', row1?.masterKey?.category === 'Car', row1?.masterKey);
  const paged = await req('GET', '/shop/customers?limit=1', undefined, token);
  check('paginated list works (1 item + cursor)', paged.body?.items?.length === 1 && !!paged.body?.nextCursor, paged.body);

  const dash = await req('GET', '/shop/dashboard', undefined, token);
  const stats = dash.body?.monthlyStats;
  check('dashboard returns 6 monthly buckets', Array.isArray(stats) && stats.length === 6, stats);
  check('current month counts the 2 new customers', Array.isArray(stats) && stats[5]?.count === 2, stats);
  check('earlier months are 0 for a brand-new shop', Array.isArray(stats) && stats.slice(0, 5).every((m: any) => m.count === 0), stats);
  check('dashboard totals still correct', dash.body?.totalCustomers === 2 && dash.body?.todayCustomers === 2, { total: dash.body?.totalCustomers, today: dash.body?.todayCustomers });

  let found = false;
  // Algolia indexing is eventually consistent and has taken minutes on this app, so wait up to ~4 min.
  for (let i = 0; i < 30 && !found; i++) {
    const s = await req('GET', `/shop/customers?search=${encodeURIComponent(`Zephyrine${suffix}`)}`, undefined, token);
    found = Array.isArray(s.body) && s.body.some((c: any) => c.id === c1.body?.id);
    if (!found) await sleep(8000);
  }
  check('Algolia free-text search by NAME finds the customer (needs the slim index + filterOnly shopId)', found);
  const notOtherShop = await req('GET', `/shop/customers?search=${encodeURIComponent('Zephyrine')}`, undefined, token);
  check('search is scoped to this shop only', Array.isArray(notOtherShop.body) && notOtherShop.body.every((c: any) => c.shopId === shopId), notOtherShop.body?.length);

  console.log('\n--- Removed test endpoint ---');
  const whoami = await req('POST', '/auth-test/whoami', undefined, token);
  check('POST /auth-test/whoami is gone (404)', whoami.status === 404, whoami.status);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}. Run cleanup-test-data.ts to remove "Audit Fix Shop" data.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('Test crashed:', e); process.exit(1); });
