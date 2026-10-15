// Checks the Super Admin's view of whether a shop can get in (src/utils/shopAccess.js) - no test framework needed:
//   cd frontend && node scripts/test-shop-access.mjs
import assert from 'node:assert/strict';
import { accessFromSubscription, shopAccess } from '../src/utils/shopAccess.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const sub = (endInDays, status = 'ACTIVE', plan = 'TRIAL') => ({ plan, status, startDate: NOW - 30 * DAY, endDate: NOW + endInDays * DAY });
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('PASS ', name); };

test('a running subscription is active', () => {
  assert.deepEqual(shopAccess({ isActive: true, subscriptions: [sub(5)] }, undefined, NOW), { tone: 'active', reason: null });
});

test('THE SCREENSHOT CASE: a trial that ended 6 days ago (past the 3-day grace) reads Suspended, with no server accessState', () => {
  const a = shopAccess({ isActive: true, subscriptions: [sub(-6)] }, undefined, NOW);
  assert.equal(a.tone, 'suspended');
  assert.equal(a.reason, 'expired');
});

test('ended 2 days ago = grace period: still active, with the days left', () => {
  const a = shopAccess({ isActive: true, subscriptions: [sub(-2)] }, undefined, NOW);
  assert.equal(a.tone, 'active');
  assert.equal(a.reason, 'grace');
  assert.equal(a.graceDays, 1);
});

test('the grace boundary: ended exactly 3 days ago is the last grace moment, 3 days + 1 second is locked out', () => {
  assert.equal(accessFromSubscription({ status: 'ACTIVE', endDate: NOW - 3 * DAY }, NOW).state, 'GRACE_PERIOD');
  assert.equal(accessFromSubscription({ status: 'ACTIVE', endDate: NOW - 3 * DAY - 1000 }, NOW).state, 'GRACE_PERIOD_EXPIRED');
});

test('no subscription, or one that is not ACTIVE, means locked out (the same as the server)', () => {
  assert.equal(shopAccess({ isActive: true, subscriptions: [] }, undefined, NOW).tone, 'suspended');
  assert.equal(shopAccess({ isActive: true }, undefined, NOW).tone, 'suspended');
  assert.equal(shopAccess({ isActive: true, subscriptions: [sub(300, 'EXPIRED', 'YEARLY')] }, undefined, NOW).tone, 'suspended');
});

test('a paid yearly subscription that is running is active', () => {
  assert.equal(shopAccess({ isActive: true, subscriptions: [sub(329, 'ACTIVE', 'YEARLY')] }, undefined, NOW).tone, 'active');
});

test('the subscription can be passed separately (the shop settings screen holds it in its own state)', () => {
  assert.equal(shopAccess({ isActive: true }, sub(-6), NOW).reason, 'expired');
  assert.equal(shopAccess({ isActive: true }, sub(5), NOW).tone, 'active');
});

test('the server\'s accessState wins when it is sent', () => {
  assert.equal(shopAccess({ isActive: true, accessState: 'GRACE_PERIOD_EXPIRED', subscriptions: [sub(300)] }, undefined, NOW).reason, 'expired');
  assert.equal(shopAccess({ isActive: true, accessState: 'ACTIVE', subscriptions: [sub(-30)] }, undefined, NOW).tone, 'active');
  const g = shopAccess({ isActive: true, accessState: 'GRACE_PERIOD', graceDaysRemaining: 2 }, undefined, NOW);
  assert.equal(g.reason, 'grace');
  assert.equal(g.graceDays, 2);
});

test('switched off by a Super Admin is Suspended (manual), and says so when the subscription has also ended', () => {
  assert.deepEqual(shopAccess({ isActive: false, subscriptions: [sub(5)] }, undefined, NOW), { tone: 'suspended', reason: 'manual', expired: false });
  assert.deepEqual(shopAccess({ isActive: false, subscriptions: [sub(-9)] }, undefined, NOW), { tone: 'suspended', reason: 'manual', expired: true });
});

test('no shop at all is treated as active (nothing to show)', () => {
  assert.deepEqual(shopAccess(null), { tone: 'active', reason: null });
});

console.log(`\nAll ${n} shop-access checks passed.`);
