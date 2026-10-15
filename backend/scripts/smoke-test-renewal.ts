// End-to-end check of the Shop Admin's paid renewal against a local backend (port 4100) on the Firebase emulators. Razorpay itself is not
// involved: the test plays Razorpay's part by recording an order and signing "orderId|paymentId" with a THROWAWAY secret, which the backend
// must have been started with (LOCAL_TEST_RAZORPAY_SECRET, see scripts/bootstrap-firestore-app.ts). Seeded accounts: scripts/seed-ui-test-accounts.ts.
//
//   LOCAL_TEST_RAZORPAY_SECRET=local_test_secret npx ts-node -r tsconfig-paths/register scripts/bootstrap-firestore-app.ts      (the backend)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 LOCAL_TEST_RAZORPAY_SECRET=local_test_secret npx ts-node -r tsconfig-paths/register scripts/smoke-test-renewal.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.LOCAL_TEST_RAZORPAY_SECRET) { console.error('Needs FIRESTORE_EMULATOR_HOST and LOCAL_TEST_RAZORPAY_SECRET (emulator only).'); process.exit(2); }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8'))) });
const db = getFirestore();
const BASE = process.env.API_BASE || 'http://localhost:4100/api';
const SECRET = process.env.LOCAL_TEST_RAZORPAY_SECRET as string;
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'TestPass123';

let failures = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  - ' + extra : ''}`); if (!ok) failures++; };
const near = (a: number, b: number, tol = 60000) => Math.abs(a - b) <= tol;
const sign = (o: string, p: string) => crypto.createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');
const addMonths = (ms: number, m: number) => { const d = new Date(ms); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime(); };

async function call(p: string, method = 'GET', body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}
const login = (email: string) => call('/auth/login', 'POST', { email, password: PASSWORD, platform: 'native' });

async function main() {
  const startedAt = Date.now();
  const shop = await login('shopadmin@uitest.com');
  const sa = await login('super@uitest.com');
  const shopToken = shop.json.accessToken as string; const superToken = sa.json.accessToken as string; const shopId = shop.json.user.shopId as string;
  check('shop admin and Super Admin log in', !!shopToken && !!superToken && !!shopId);

  const subs = db.collection('shops').doc(shopId).collection('subscriptions');
  const live = async () => (await subs.where('status', '==', 'ACTIVE').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => b.endDate - a.endDate)[0];
  const reset = async (plan: string, startAgo: number, endIn: number) => {
    await Promise.all((await subs.get()).docs.map((d) => d.ref.delete()));
    const now = Date.now();
    await subs.add({ plan, status: 'ACTIVE', startDate: now - startAgo * DAY, endDate: now + endIn * DAY, createdAt: now, updatedAt: now });
  };
  let n = 0;
  const newOrder = async (forShop = shopId) => { const id = `order_smoke_${Date.now()}_${n++}`; await db.collection('renewalOrders').doc(id).set({ shopId: forShop, status: 'CREATED', months: 12, amountPaise: 117882, baseAmount: 999, gstPercent: 18, gstAmount: 179.82, totalAmount: 1178.82, createdAt: Date.now() }); return id; };
  const pay = (orderId: string, paymentId: string) => ({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: sign(orderId, paymentId) });
  const verifyUrl = '/shop/subscription/renew/verify';

  // ---- who can call it
  await reset('YEARLY', 335, 30);
  const o0 = await newOrder();
  check('a Super Admin cannot use the shop-admin renewal', (await call(verifyUrl, 'POST', pay(o0, 'pay_x1'), superToken)).status === 403);
  check('no login is refused', [401, 403].includes((await call(verifyUrl, 'POST', pay(o0, 'pay_x2'))).status));
  const noGateway = await call('/shop/subscription/renew/order', 'POST', {}, shopToken);
  check('creating an order without the live payment keys fails safely (nothing is charged)', noGateway.status === 500 && /not configured/i.test(String(noGateway.json.message)), String(noGateway.json.message));

  // ---- stacking: pay before the end date
  const before = await live();
  const o1 = await newOrder();
  let r = await call(verifyUrl, 'POST', pay(o1, 'pay_smoke_1'), shopToken);
  let s = await live();
  check('paying before the end date stacks one year AFTER it', r.status === 201 && s.endDate === addMonths(before.endDate, 12) && r.json.accessState === 'ACTIVE', `+${Math.round((s.endDate - before.endDate) / DAY)} days`);
  check('...on the same subscription (no second one)', (await subs.where('status', '==', 'ACTIVE').get()).size === 1);

  // ---- the payment is single-use
  const replay = await call(verifyUrl, 'POST', pay(o1, 'pay_smoke_1'), shopToken);
  const after = await live();
  check('replaying the same payment is refused', replay.status === 400 && /already been used/.test(String(replay.json.message)) && after.endDate === s.endDate);
  const o1b = await newOrder();
  check('a payment id that was already used cannot be attached to another order', (await call(verifyUrl, 'POST', pay(o1b, 'pay_smoke_1'), shopToken)).status === 400);

  // ---- forgery
  const o2 = await newOrder();
  check('a wrong signature is refused', (await call(verifyUrl, 'POST', { razorpayOrderId: o2, razorpayPaymentId: 'pay_forged', razorpaySignature: 'a'.repeat(64) }, shopToken)).status === 400);
  check('a signature made for another order id is refused', (await call(verifyUrl, 'POST', { razorpayOrderId: o2, razorpayPaymentId: 'pay_forged2', razorpaySignature: sign('order_other', 'pay_forged2') }, shopToken)).status === 400);
  const otherShop = await newOrder('some-other-shop-id');
  check('another shop order cannot be applied to this shop', (await call(verifyUrl, 'POST', pay(otherShop, 'pay_smoke_other'), shopToken)).status === 400);
  check('an order that was never created is refused', (await call(verifyUrl, 'POST', pay('order_never_created', 'pay_smoke_ghost'), shopToken)).status === 400);
  check('none of those refusals changed the subscription', (await live()).endDate === s.endDate);

  // ---- an ended subscription: locked out, then a new year from today
  await reset('TRIAL', 30, -23);
  const locked = await login('shopadmin@uitest.com');
  check('a shop whose trial ended 23 days ago is locked out at login', locked.status === 401);
  // (a locked-out shop cannot sign in to pay, but a shop still inside its grace days can)
  await reset('TRIAL', 8, -2);
  const grace = await login('shopadmin@uitest.com');
  const o3 = await newOrder();
  r = await call(verifyUrl, 'POST', pay(o3, 'pay_smoke_3'), grace.json.accessToken);
  s = await live();
  check('a shop in its grace days can still sign in and renew: a new year starts today', grace.status === 201 && r.status === 201 && s.plan === 'YEARLY' && near(s.endDate, addMonths(Date.now(), 12)));
  check('...the ended trial is closed (kept), not deleted', (await subs.get()).size === 2 && (await subs.where('status', '==', 'EXPIRED').get()).size === 1);

  // ---- the books
  const order = (await db.collection('renewalOrders').doc(o1).get()).data() as any;
  check('the order is marked PAID with the payment id', order.status === 'PAID' && order.paymentId === 'pay_smoke_1');
  check('the payment is recorded once', (await db.collection('razorpayPayments').doc('pay_smoke_1').get()).exists);
  const revenue = (await db.collection('revenueRecords').where('createdAt', '>=', startedAt).get()).docs.map((d) => d.data() as any);
  check('one revenue record per paid renewal, for the price without GST', revenue.length === 2 && revenue.every((x) => x.amount === 999), `${revenue.length} records`);
  const logs = (await db.collection('activityLogs').where('shopId', '==', shopId).where('action', '==', 'SUBSCRIPTION_RENEWED_BY_SHOP').get()).docs.map((d) => d.data() as any).filter((l) => l.createdAt >= startedAt);
  check('each renewal is in the activity log', logs.length === 2);

  console.log(failures === 0 ? '\nAll renewal checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
