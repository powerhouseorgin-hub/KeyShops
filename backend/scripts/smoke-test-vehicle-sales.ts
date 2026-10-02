// End-to-end checks for the Vehicle Sales API (POST/GET /shop/vehicle-sales) against a real deployment
// (default: a local bootstrap server on :4100; set SMOKE_TEST_BASE_URL for the live function). Creates two
// throwaway shops ("Audit Fix Shop vehicle sales ...", removed by cleanup-test-data.ts).
//
//   SMOKE_TEST_BASE_URL=https://api-roe6cy7kca-uc.a.run.app npx ts-node -r tsconfig-paths/register scripts/smoke-test-vehicle-sales.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

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
let failures = 0;
const check = (label: string, ok: boolean, detail?: any) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  -> ' + String(JSON.stringify(detail) ?? 'no detail').slice(0, 300)}`);
};

async function makeShop(label: string) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
  const phone = `9${suffix.slice(-9)}`;
  const sent = await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'register' });
  if (!sent.body?.devCode) throw new Error('no devCode - is OTP_SHOW_CODE_IN_UI on? ' + JSON.stringify(sent));
  await req('POST', '/auth/verify-otp', { identifier: phone, purpose: 'register', code: sent.body.devCode });
  const reg = await req('POST', '/auth/register-shop', {
    shopName: `Audit Fix Shop vehicle sales ${label} ${suffix}`, ownerName: `Owner ${label}`, phone, password: 'SalesPass123',
    location: 'Test Address', town: 'Chennai', district: 'Chennai', categoryId: 'key-shops', startTrial: true,
  });
  const login = await req('POST', '/auth/login', { email: phone, password: 'SalesPass123', platform: 'native' });
  if (reg.status !== 201 || !login.body?.accessToken) throw new Error('could not create shop ' + label + ' ' + JSON.stringify([reg, login.status]));
  return { shopId: reg.body.shopId as string, token: login.body.accessToken as string };
}

const SALE = {
  saleDate: '2026-10-03', saleTime: '14:30',
  sellerName: 'முருகன்', sellerAddress: '12, காந்தி சாலை, சேலம்', sellerPhone: '9876543210',
  buyerName: 'Rajesh Kumar', buyerAddress: '5 Park Street, Chennai', buyerPhone: '+91 98765 43211',
  registrationNumber: 'TN30AB1234', vehicleModel: 'Splendor Plus', vehicleColor: 'கருப்பு', vehicleName: 'Hero Splendor',
  chassisNumber: 'MBLHA10AMJ9A12345', engineNumber: 'HA10EJ9A12345',
  vehiclePrice: 45000, advanceAmount: 10000, officeCommission: 500, balanceLastDate: '2026-11-03',
  witnessName: 'Suresh', witnessAddress: 'Salem', notes: 'RC book with seller', lang: 'ta',
};

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const db = new FirestoreService().db;

  console.log('--- Auth ---');
  const anon = await req('GET', '/shop/vehicle-sales');
  check('listing without a token is rejected (401)', anon.status === 401, anon.status);
  const anonPost = await req('POST', '/shop/vehicle-sales', SALE);
  check('creating without a token is rejected (401)', anonPost.status === 401, anonPost.status);

  const A = await makeShop('A');
  const B = await makeShop('B');
  console.log(`shops: A=${A.shopId} B=${B.shopId}`);

  console.log('\n--- Create (valid, Tamil text, client tries to forge fields) ---');
  const forged = { ...SALE, balanceAmount: 1, shopId: B.shopId, createdById: 'someone-else', deletedAt: 5, createdAt: 1, id: 'forged-id', saleNumber: undefined };
  const c1 = await req('POST', '/shop/vehicle-sales', forged, A.token);
  check('sale created (201)', c1.status === 201, c1);
  const sale1 = c1.body;
  check('Tamil / Unicode text is preserved exactly', sale1.sellerName === 'முருகன்' && sale1.vehicleColor === 'கருப்பு' && sale1.sellerAddress === '12, காந்தி சாலை, சேலம்', { sellerName: sale1.sellerName });
  check('balance is computed on the server (45000 - 10000 = 35000), not taken from the client', sale1.balanceAmount === 35000, sale1.balanceAmount);
  check('receipt number is generated (VS-0001)', sale1.saleNumber === 'VS-0001', sale1.saleNumber);
  check('buyer phone is normalised to 10 digits', sale1.buyerPhone === '9876543211', sale1.buyerPhone);
  check('invoice language is stored', sale1.lang === 'ta', sale1.lang);

  const doc = (await db.collection('shops').doc(A.shopId).collection('vehicleSales').doc(sale1.id).get()).data() as any;
  check('stored under the caller\'s own shop (shops/A/vehicleSales)', !!doc, 'missing');
  check('forged id / shopId / createdById / createdAt / deletedAt are NOT honoured', sale1.id !== 'forged-id' && doc.shopId === undefined && doc.createdById !== 'someone-else' && doc.createdAt > 1000 && doc.deletedAt === null, { createdById: doc?.createdById, createdAt: doc?.createdAt, deletedAt: doc?.deletedAt, shopId: doc?.shopId });
  const bDoc = await db.collection('shops').doc(B.shopId).collection('vehicleSales').doc(sale1.id).get();
  check('nothing was written under shop B despite the forged shopId', !bDoc.exists);

  const c2 = await req('POST', '/shop/vehicle-sales', { ...SALE, registrationNumber: 'TN30CD5678', advanceAmount: undefined, officeCommission: undefined }, A.token);
  check('second sale gets the next number (VS-0002) and a zero advance', c2.status === 201 && c2.body.saleNumber === 'VS-0002' && c2.body.advanceAmount === 0 && c2.body.balanceAmount === 45000, c2.body);
  const c3 = await req('POST', '/shop/vehicle-sales', { ...SALE, registrationNumber: 'TN30EF9999', saleNumber: 'MY-100' }, A.token);
  check('a custom receipt number is respected', c3.status === 201 && c3.body.saleNumber === 'MY-100', c3.body?.saleNumber);

  console.log('\n--- Validation ---');
  const bad = async (label: string, override: any) => {
    const r = await req('POST', '/shop/vehicle-sales', { ...SALE, ...override }, A.token);
    check(`${label} -> 400`, r.status === 400, r.status);
  };
  await bad('missing buyer name', { buyerName: '' });
  await bad('missing seller name', { sellerName: undefined });
  await bad('missing registration number', { registrationNumber: ' ' });
  await bad('zero price', { vehiclePrice: 0 });
  await bad('advance bigger than the price', { advanceAmount: 99999 });
  await bad('negative commission', { officeCommission: -5 });
  await bad('malformed date', { saleDate: '03-10-2026' });
  await bad('unsupported language', { lang: 'fr' });
  await bad('object instead of text', { buyerName: { a: 1 } });
  await bad('absurdly long address', { buyerAddress: 'x'.repeat(1000) });
  const before = (await db.collection('shops').doc(A.shopId).collection('vehicleSales').get()).size;
  check('rejected requests stored nothing (still 3 sales)', before === 3, before);

  console.log('\n--- List / get / isolation ---');
  const list = await req('GET', '/shop/vehicle-sales', undefined, A.token);
  check('list returns the 3 sales, newest first', Array.isArray(list.body) && list.body.length === 3 && list.body[0].saleNumber === 'MY-100', list.body?.map?.((s: any) => s.saleNumber));
  const limited = await req('GET', '/shop/vehicle-sales?limit=1', undefined, A.token);
  check('limit works', Array.isArray(limited.body) && limited.body.length === 1, limited.body?.length);
  const get = await req('GET', `/shop/vehicle-sales/${sale1.id}`, undefined, A.token);
  check('a sale can be fetched by id', get.status === 200 && get.body.registrationNumber === 'TN30AB1234', get.status);
  const crossGet = await req('GET', `/shop/vehicle-sales/${sale1.id}`, undefined, B.token);
  check("another shop cannot read it by id (404)", crossGet.status === 404, crossGet.status);
  const bList = await req('GET', '/shop/vehicle-sales', undefined, B.token);
  check("another shop's list is empty", Array.isArray(bList.body) && bList.body.length === 0, bList.body);
  const missing = await req('GET', '/shop/vehicle-sales/does-not-exist', undefined, A.token);
  check('unknown id -> 404', missing.status === 404, missing.status);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}. Run cleanup-test-data.ts to remove "Audit Fix Shop" data.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('Test crashed:', e); process.exit(1); });
