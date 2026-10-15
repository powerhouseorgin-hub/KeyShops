import * as crypto from 'crypto';

// firebase-admin's auth module (and the search / storage helpers) pull in ES-module-only dependencies that Jest cannot load; the renewal code
// only needs the class shapes here.
jest.mock('../auth/firebase-auth.service', () => ({ FirebaseAuthService: class {} }));
jest.mock('../auth/firebase-auth.guard', () => ({ FirebaseAuthGuard: class {} }));
jest.mock('../search/algolia-search.service', () => ({ AlgoliaSearchService: class {}, facetFilter: () => '' }));
jest.mock('../storage/firebase-file.service', () => ({ FirebaseFileService: class {} }));
jest.mock('../config/reference-lists.module', () => ({ ShopCategoryService: class {} }));

import { FirestoreShopService } from './firestore-shop.service';
import { FirestorePaymentService } from '../payment/firestore-payment.service';
import { addMonthsUTC } from '../../common/subscription-extension';

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'test_secret_for_renewal_specs';
const sign = (orderId: string, paymentId: string) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

// A small in-memory Firestore: documents by path, subcollections, equality queries, add(), batch-less transactions that apply only if the
// callback finishes (an exception rolls everything back, like the real thing).
function fakeFirestore() {
  const docs = new Map<string, any>();
  let seq = 0;
  const colRef = (path: string): any => ({
    path,
    doc: (id?: string) => docRef(`${path}/${id ?? 'auto' + ++seq}`),
    add: async (data: any) => { const r = docRef(`${path}/auto${++seq}`); docs.set(r.path, data); return r; },
    where: (field: string, _op: string, value: any) => query(path, [[field, value]]),
    get: async () => snapshot(path, []),
  });
  const docRef = (path: string): any => ({
    path, id: path.split('/').pop(),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: any) => { docs.set(path, data); },
    update: async (patch: any) => { docs.set(path, { ...docs.get(path), ...patch }); },
    collection: (name: string) => colRef(`${path}/${name}`),
  });
  const snapshot = (path: string, filters: Array<[string, any]>) => {
    const depth = path.split('/').length + 1;
    const rows = [...docs.entries()].filter(([p, d]) => p.startsWith(path + '/') && p.split('/').length === depth && filters.every(([f, v]) => d[f] === v));
    return { empty: rows.length === 0, size: rows.length, docs: rows.map(([p, d]) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => d })) };
  };
  const query = (path: string, filters: Array<[string, any]>): any => ({
    __query: true,
    where: (f: string, _o: string, v: any) => query(path, [...filters, [f, v]]),
    get: async () => snapshot(path, filters),
    _run: () => snapshot(path, filters),
  });
  const db: any = {
    collection: colRef,
    runTransaction: async (fn: any) => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (target: any) => (target.__query ? target._run() : { exists: docs.has(target.path), data: () => docs.get(target.path) }),
        set: (r: any, data: any) => writes.push(() => docs.set(r.path, data)),
        update: (r: any, patch: any) => writes.push(() => docs.set(r.path, { ...docs.get(r.path), ...patch })),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
  return { firestore: { db } as any, docs };
}

function setup() {
  const fx = fakeFirestore();
  const shops: any = { subscriptions: (id: string) => fx.firestore.db.collection('shops').doc(id).collection('subscriptions') };
  const service = new FirestoreShopService(fx.firestore, shops, {} as any, {} as any, {} as any, {} as any);
  const now = Date.now();
  const addShop = (id: string, data: any = {}) => fx.docs.set(`shops/${id}`, { name: `Shop ${id}`, isActive: true, ...data });
  const addSub = (shopId: string, sub: any, key = 'sub1') => fx.docs.set(`shops/${shopId}/subscriptions/${key}`, { status: 'ACTIVE', ...sub });
  const addOrder = (orderId: string, shopId: string, extra: any = {}) =>
    fx.docs.set(`renewalOrders/${orderId}`, { shopId, status: 'CREATED', months: 12, amountPaise: 117882, baseAmount: 999, gstPercent: 18, gstAmount: 179.82, totalAmount: 1178.82, createdAt: now, ...extra });
  const paid = (orderId: string, paymentId: string) => ({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: sign(orderId, paymentId) });
  const subs = (shopId: string) => [...fx.docs.entries()].filter(([p]) => p.startsWith(`shops/${shopId}/subscriptions/`)).map(([p, d]) => ({ key: p.split('/').pop() as string, ...d }));
  const logs = (action: string) => [...fx.docs.entries()].filter(([p, d]) => p.startsWith('activityLogs/') && d.action === action).map(([, d]) => d);
  return { fx, service, now, addShop, addSub, addOrder, paid, subs, logs };
}

describe('FirestoreShopService.renewSubscription (a shop pays for its own renewal)', () => {
  const oldEnv = { ...process.env };
  beforeEach(() => { process.env.RAZORPAY_KEY_SECRET = SECRET; jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => { process.env = { ...oldEnv }; jest.restoreAllMocks(); });

  it('stacks one year AFTER the current end date, so no paid day is lost', async () => {
    const t = setup();
    t.addShop('s1');
    const end = t.now + 30 * DAY;
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: end });
    t.addOrder('order_1', 's1');
    const res = await t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'user1');
    expect(res.endDate).toBe(addMonthsUTC(end, 12));
    expect(res).toMatchObject({ plan: 'YEARLY', status: 'ACTIVE', accessState: 'ACTIVE' });
    expect(t.subs('s1')).toHaveLength(1); // the same subscription, extended - not a second one
    expect(t.subs('s1')[0].endDate).toBe(addMonthsUTC(end, 12));
  });

  it('a trial that is still running keeps its remaining days: the paid year starts after the trial ends', async () => {
    const t = setup();
    t.addShop('s1');
    const end = t.now + 5 * DAY;
    t.addSub('s1', { plan: 'TRIAL', startDate: t.now - 2 * DAY, endDate: end });
    t.addOrder('order_1', 's1');
    const res = await t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'user1');
    expect(res.endDate).toBe(addMonthsUTC(end, 12));
    expect(res.plan).toBe('YEARLY');
  });

  it('a subscription that has already ended starts a new year today (the old one is closed, kept)', async () => {
    const t = setup();
    t.addShop('s1');
    t.addSub('s1', { plan: 'TRIAL', startDate: t.now - 30 * DAY, endDate: t.now - 23 * DAY });
    t.addOrder('order_1', 's1');
    const res = await t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'user1');
    expect(Math.abs(res.endDate - addMonthsUTC(t.now, 12))).toBeLessThan(5000);
    const all = t.subs('s1');
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.status === 'EXPIRED')).toHaveLength(1);
    expect(all.filter((s) => s.status === 'ACTIVE')[0].plan).toBe('YEARLY');
  });

  it('records the payment, marks the order paid, writes a revenue record (price without GST) and an audit entry', async () => {
    const t = setup();
    t.addShop('s1');
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 300 * DAY, endDate: t.now + 65 * DAY });
    t.addOrder('order_1', 's1');
    await t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'user1');
    expect(t.fx.docs.get('renewalOrders/order_1')).toMatchObject({ status: 'PAID', paymentId: 'pay_1' });
    expect(t.fx.docs.get('razorpayPayments/pay_1')).toMatchObject({ shopId: 's1', orderId: 'order_1', purpose: 'renewal' });
    const revenue = [...t.fx.docs.entries()].filter(([p]) => p.startsWith('revenueRecords/')).map(([, d]) => d);
    expect(revenue).toHaveLength(1);
    expect(revenue[0].amount).toBe(999);
    const log = t.logs('SUBSCRIPTION_RENEWED_BY_SHOP');
    expect(log).toHaveLength(1);
    expect(JSON.parse(log[0].details)).toMatchObject({ orderId: 'order_1', paymentId: 'pay_1', amount: 1178.82 });
  });

  it('the same payment cannot be used twice: no second year, no second revenue record', async () => {
    const t = setup();
    t.addShop('s1');
    const end = t.now + 30 * DAY;
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: end });
    t.addOrder('order_1', 's1');
    await t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'user1');
    await expect(t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'user1')).rejects.toThrow(/already been used/);
    expect(t.subs('s1')[0].endDate).toBe(addMonthsUTC(end, 12));
    expect([...t.fx.docs.keys()].filter((p) => p.startsWith('revenueRecords/'))).toHaveLength(1);
  });

  it('a payment id already spent elsewhere (e.g. on a registration) cannot be reused for a renewal', async () => {
    const t = setup();
    t.addShop('s1');
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: t.now + 30 * DAY });
    t.addOrder('order_9', 's1');
    t.fx.docs.set('razorpayPayments/pay_9', { shopId: 'other', orderId: 'order_old', createdAt: t.now });
    await expect(t.service.renewSubscription('s1', t.paid('order_9', 'pay_9'), 'user1')).rejects.toThrow(/already been used/);
  });

  it('refuses a wrong or missing signature, and changes nothing', async () => {
    const t = setup();
    t.addShop('s1');
    const end = t.now + 30 * DAY;
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: end });
    t.addOrder('order_1', 's1');
    await expect(t.service.renewSubscription('s1', { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'f'.repeat(64) }, 'u')).rejects.toThrow(/verification failed/);
    await expect(t.service.renewSubscription('s1', { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1' }, 'u')).rejects.toThrow(/verification failed/);
    expect(t.subs('s1')[0].endDate).toBe(end);
    expect(t.fx.docs.get('renewalOrders/order_1').status).toBe('CREATED');
  });

  it('a payment signed for another order id does not verify', async () => {
    const t = setup();
    t.addShop('s1'); t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: t.now + 30 * DAY });
    t.addOrder('order_1', 's1');
    await expect(t.service.renewSubscription('s1', { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: sign('order_2', 'pay_1') }, 'u')).rejects.toThrow(/verification failed/);
  });

  it('refuses an order that was created for a different shop, and an order that does not exist', async () => {
    const t = setup();
    t.addShop('s1'); t.addShop('s2');
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: t.now + 30 * DAY });
    t.addOrder('order_s2', 's2');
    await expect(t.service.renewSubscription('s1', t.paid('order_s2', 'pay_1'), 'u')).rejects.toThrow(/does not belong to your shop/);
    await expect(t.service.renewSubscription('s1', t.paid('order_ghost', 'pay_2'), 'u')).rejects.toThrow(/does not belong to your shop/);
  });

  it('refuses malformed ids', async () => {
    const t = setup();
    t.addShop('s1');
    for (const bad of [{}, { razorpayOrderId: 'order 1', razorpayPaymentId: 'pay_1', razorpaySignature: 'x' }, { razorpayOrderId: 'o'.repeat(65), razorpayPaymentId: 'pay_1', razorpaySignature: 'x' }, { razorpayOrderId: 'order_1', razorpayPaymentId: '../x', razorpaySignature: 'x' }]) {
      await expect(t.service.renewSubscription('s1', bad as any, 'u')).rejects.toThrow(/missing or invalid/);
    }
  });

  it('once money has been taken the year is applied even if the shop is now past the 3-year limit', async () => {
    const t = setup();
    t.addShop('s1');
    const end = addMonthsUTC(t.now, 30); // already 30 months ahead (e.g. a Super Admin extended it after the order was created)
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now, endDate: end });
    t.addOrder('order_1', 's1');
    const res = await t.service.renewSubscription('s1', t.paid('order_1', 'pay_1'), 'u');
    expect(res.endDate).toBe(addMonthsUTC(end, 12));
  });

  it('an unknown shop is a 404', async () => {
    const t = setup();
    await expect(t.service.renewSubscription('nope', t.paid('order_1', 'pay_1'), 'u')).rejects.toThrow(/Shop not found/);
  });
});

// ---- creating the renewal order -------------------------------------------------------------------------------------------------------------
class FakeRazorpayPayment extends FirestorePaymentService {
  created: any[] = [];
  protected getRazorpay(): any {
    return { orders: { create: async (o: any) => { this.created.push(o); return { id: `order_${this.created.length}`, currency: 'INR' }; } } };
  }
}

describe('FirestorePaymentService.createRenewalOrder', () => {
  const oldEnv = { ...process.env };
  beforeEach(() => { process.env.RAZORPAY_KEY_ID = 'rzp_test_key'; });
  afterEach(() => { process.env = { ...oldEnv }; });

  function build(price = 999, gst = 18) {
    const t = setup();
    const svc = new FakeRazorpayPayment({ get: async () => ({ subscriptionPrice: price, gstPercent: gst }) } as any, t.fx.firestore);
    return { ...t, svc };
  }

  it('charges the platform price plus GST (never an amount from the app), records the order for this shop, and previews the stacked end date', async () => {
    const t = build();
    t.addShop('s1');
    const end = t.now + 30 * DAY;
    t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 335 * DAY, endDate: end });
    const order = await t.svc.createRenewalOrder('s1');
    expect(t.svc.created[0]).toMatchObject({ amount: 117882, currency: 'INR' });
    expect(t.svc.created[0].receipt.length).toBeLessThanOrEqual(40);
    expect(t.svc.created[0].notes).toMatchObject({ type: 'renewal', shopId: 's1' });
    expect(order).toMatchObject({ orderId: 'order_1', amount: 117882, baseAmount: 999, gstPercent: 18, gstAmount: 179.82, totalAmount: 1178.82, keyId: 'rzp_test_key', currentEndDate: end });
    expect(order.newEndDate).toBe(addMonthsUTC(end, 12));
    expect(t.fx.docs.get('renewalOrders/order_1')).toMatchObject({ shopId: 's1', status: 'CREATED', baseAmount: 999, totalAmount: 1178.82, amountPaise: 117882 });
  });

  it('follows the price saved in the Super Admin Support panel', async () => {
    const t = build(1500, 0);
    t.addShop('s1'); t.addSub('s1', { plan: 'YEARLY', startDate: t.now - 300 * DAY, endDate: t.now + 65 * DAY });
    const order = await t.svc.createRenewalOrder('s1');
    expect(order).toMatchObject({ amount: 150000, totalAmount: 1500, gstAmount: 0 });
  });

  it('a shop whose subscription has ended is offered a new year from today', async () => {
    const t = build();
    t.addShop('s1'); t.addSub('s1', { plan: 'TRIAL', startDate: t.now - 30 * DAY, endDate: t.now - 23 * DAY });
    const order = await t.svc.createRenewalOrder('s1');
    expect(Math.abs(order.newEndDate - addMonthsUTC(t.now, 12))).toBeLessThan(5000);
  });

  it('refuses a suspended shop, an unknown shop, and a shop already paid up to the limit - and creates no order', async () => {
    const t = build();
    t.addShop('off', { isActive: false }); t.addSub('off', { plan: 'YEARLY', startDate: t.now - 100 * DAY, endDate: t.now + 265 * DAY });
    t.addShop('max'); t.addSub('max', { plan: 'YEARLY', startDate: t.now, endDate: addMonthsUTC(t.now, 26) });
    await expect(t.svc.createRenewalOrder('off')).rejects.toThrow(/suspended/);
    await expect(t.svc.createRenewalOrder('nope')).rejects.toThrow(/Shop not found/);
    await expect(t.svc.createRenewalOrder('max')).rejects.toThrow(/longest period allowed/);
    expect(t.svc.created).toHaveLength(0);
    expect([...t.fx.docs.keys()].filter((p) => p.startsWith('renewalOrders/'))).toHaveLength(0);
  });
});
