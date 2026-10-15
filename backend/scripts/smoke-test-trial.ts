// End-to-end check of the per-shop trial control against a local backend (port 4100) on the Firebase emulators, with the seeded accounts
// from scripts/seed-ui-test-accounts.ts (super@uitest.com and the shop admin shopadmin@uitest.com, password TestPass123).
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node -r tsconfig-paths/register scripts/smoke-test-trial.ts
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Refusing to run without FIRESTORE_EMULATOR_HOST (emulator only).'); process.exit(2); }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8'))) });
const db = getFirestore();
const BASE = process.env.API_BASE || 'http://localhost:4100/api';
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'TestPass123';

let failures = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  - ' + extra : ''}`); if (!ok) failures++; };
const near = (a: number, b: number, tolMs = 5000) => Math.abs(a - b) <= tolMs;

async function call(p: string, method = 'GET', body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}
const login = (email: string) => call('/auth/login', 'POST', { email, password: PASSWORD, platform: 'native' });

async function main() {
  const startedAt = Date.now();
  const sa = await login('super@uitest.com');
  const shopLogin = await login('shopadmin@uitest.com');
  const superToken = sa.json.accessToken as string;
  const shopToken = shopLogin.json.accessToken as string;
  const shopId = shopLogin.json.user.shopId as string;
  check('Super Admin and the test shop admin log in', !!superToken && !!shopToken && !!shopId);

  const subs = db.collection('shops').doc(shopId).collection('subscriptions');
  const live = async () => (await subs.where('status', '==', 'ACTIVE').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => b.endDate - a.endDate)[0];
  const trialUrl = `/super/subscriptions/${shopId}/trial`;
  // start from a known trial: started 2 days ago, ends in 5 days
  const reset = async (startAgo: number, endIn: number) => {
    const all = await subs.get();
    await Promise.all(all.docs.map((d) => d.ref.delete()));
    const now = Date.now();
    await subs.add({ plan: 'TRIAL', status: 'ACTIVE', startDate: now - startAgo * DAY, endDate: now + endIn * DAY, createdAt: now, updatedAt: now });
  };

  // --- who may call it
  await reset(2, 5);
  check('a Shop Admin cannot use it', (await call(trialUrl, 'POST', { mode: 'extend', days: 7 }, shopToken)).status === 403);
  check('no login at all is refused', [401, 403].includes((await call(trialUrl, 'POST', { mode: 'extend', days: 7 })).status));
  check('an unknown shop is a 404', (await call('/super/subscriptions/nope-nope/trial', 'POST', { mode: 'extend', days: 7 }, superToken)).status === 404);

  // --- validation
  for (const [label, body] of [['0 days', { mode: 'extend', days: 0 }], ['366 days', { mode: 'set', days: 366 }], ['1.5 days', { mode: 'extend', days: 1.5 }], ['text days', { mode: 'extend', days: 'abc' }], ['unknown mode', { mode: 'renew', days: 7 }], ['no mode', { days: 7 }]] as const) {
    check(`refused: ${label}`, (await call(trialUrl, 'POST', body, superToken)).status === 400);
  }
  const untouched = await live();
  check('refused requests changed nothing', near(untouched.endDate, Date.now() + 5 * DAY, 60000));

  // --- extend a running trial
  await reset(2, 5);
  let r = await call(trialUrl, 'POST', { mode: 'extend', days: 7 }, superToken);
  let s = await live();
  check('extend: adds the days to the current end date', r.status === 201 && near(s.endDate, Date.now() + 12 * DAY, 60000), `daysLeft=${r.json.daysLeft}`);
  check('extend: still ONE live subscription, still a trial', (await subs.where('status', '==', 'ACTIVE').get()).size === 1 && s.plan === 'TRIAL');

  // --- set the total length
  r = await call(trialUrl, 'POST', { mode: 'set', days: 14 }, superToken);
  s = await live();
  check('set: the trial lasts 14 days in total from its start day', r.status === 201 && near(s.endDate, s.startDate + 14 * DAY) && r.json.trialDays === 14, `end - start = ${Math.round((s.endDate - s.startDate) / DAY)}d`);

  // --- an ended trial: extend counts from TODAY; the shop can sign in again
  await reset(30, -10); // ended 10 days ago (beyond the 3-day grace)
  const locked = await login('shopadmin@uitest.com');
  check('a trial ended 10 days ago locks the shop out', locked.status === 401, locked.json.message ? String(locked.json.message).slice(0, 60) : '');
  r = await call(trialUrl, 'POST', { mode: 'extend', days: 7 }, superToken);
  s = await live();
  check('extend on an ended trial counts from today (not from the old end date)', r.status === 201 && near(s.endDate, Date.now() + 7 * DAY, 60000));
  const back = await login('shopadmin@uitest.com');
  check('...and the shop signs in again straight away (cache cleared)', back.status === 201);

  // --- no live trial at all: a new one starts today
  await reset(30, -40);
  const old = await subs.get();
  await Promise.all(old.docs.map((d) => d.ref.update({ status: 'EXPIRED' })));
  r = await call(trialUrl, 'POST', { mode: 'set', days: 5 }, superToken);
  s = await live();
  check('no live subscription: a NEW 5-day trial starts today', r.status === 201 && s.plan === 'TRIAL' && near(s.startDate, Date.now()) && near(s.endDate, Date.now() + 5 * DAY, 60000));
  check('...and the old (expired) record is kept', (await subs.get()).size === 2);

  // --- a running paid yearly subscription is left alone
  const renew = await call(`/super/subscriptions/${shopId}`, 'POST', { status: 'ACTIVE' }, superToken);
  r = await call(trialUrl, 'POST', { mode: 'extend', days: 7 }, superToken);
  s = await live();
  check('a running yearly subscription refuses a trial change', renew.status === 201 && r.status === 400 && s.plan === 'YEARLY', String(r.json.message || '').slice(0, 70));

  // --- a date picked on the calendar (the trial ends at the END of that day, India time)
  await reset(2, 5);
  const IST = 5.5 * 60 * 60 * 1000;
  const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
  const pick = istDay(Date.now() + 10 * DAY);
  r = await call(trialUrl, 'POST', { mode: 'until', date: pick }, superToken);
  s = await live();
  check('until: the trial ends at the end of the picked day (India time)', r.status === 201 && s.endDate === Date.parse(pick + 'T23:59:59.999+05:30'), `picked ${pick}`);
  check('until: a malformed date is refused', (await call(trialUrl, 'POST', { mode: 'until', date: '15/10/2026' }, superToken)).status === 400);
  check('until: an impossible date is refused', (await call(trialUrl, 'POST', { mode: 'until', date: '2026-02-30' }, superToken)).status === 400);
  check('until: more than 365 days ahead is refused', (await call(trialUrl, 'POST', { mode: 'until', date: istDay(Date.now() + 400 * DAY) }, superToken)).status === 400);

  // --- the shop's access state, as the Super Admin screens read it (same rule login applies)
  const stateOf = async () => (await call(`/super/shops/${shopId}`, 'GET', undefined, superToken)).json;
  await reset(2, 5);
  let shop = await stateOf();
  check('access state: a running trial is ACTIVE', shop.accessState === 'ACTIVE' && shop.isActive === true);
  await reset(10, -1); // ended yesterday: inside the 3-day grace period
  shop = await stateOf();
  check('access state: just ended = GRACE_PERIOD with days left', shop.accessState === 'GRACE_PERIOD' && shop.graceDaysRemaining >= 1 && shop.graceDaysRemaining <= 3, `graceDaysRemaining=${shop.graceDaysRemaining}`);
  await reset(30, -10); // ended 10 days ago: locked out
  shop = await stateOf();
  check('access state: long ended = GRACE_PERIOD_EXPIRED (the shop must read Suspended)', shop.accessState === 'GRACE_PERIOD_EXPIRED' && shop.isActive === true);
  r = await call(trialUrl, 'POST', { mode: 'until', date: istDay(Date.now() + 3 * DAY) }, superToken);
  check('the response carries the new access state', r.status === 201 && r.json.accessState === 'ACTIVE');
  shop = await stateOf();
  check('access state flips back to ACTIVE once the date is moved forward', shop.accessState === 'ACTIVE');

  // a shop with no live trial: a past date cannot start one
  await reset(30, -40);
  await Promise.all((await subs.get()).docs.map((d) => d.ref.update({ status: 'EXPIRED' })));
  check('until: with no running trial a past date is refused', (await call(trialUrl, 'POST', { mode: 'until', date: istDay(Date.now() - 3 * DAY) }, superToken)).status === 400);

  // --- extending the SUBSCRIPTION (1 / 3 / 6 / 12 / 24 months, with a reason and internal notes)
  const extUrl = `/super/subscriptions/${shopId}/extend`;
  const extStartedAt = Date.now();
  const addMonths = (ms: number, m: number) => { const d = new Date(ms); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime(); };
  await reset(2, 5);
  check('extend subscription: a Shop Admin cannot use it', (await call(extUrl, 'POST', { months: 3 }, shopToken)).status === 403);
  check('extend subscription: an unknown shop is a 404', (await call('/super/subscriptions/nope-nope/extend', 'POST', { months: 3 }, superToken)).status === 404);
  for (const [label, body] of [['2 months', { months: 2 }], ['36 months', { months: 36 }], ['no months', {}], ['reason over 200 characters', { months: 3, reason: 'x'.repeat(201) }], ['notes over 1000 characters', { months: 3, notes: 'x'.repeat(1001) }]] as const) {
    check(`extend subscription refused: ${label}`, (await call(extUrl, 'POST', body, superToken)).status === 400);
  }
  const beforeExt = await live();
  r = await call(extUrl, 'POST', { months: 1, reason: 'Payment received offline', notes: 'Cash, receipt 4411' }, superToken);
  s = await live();
  check('extend a running trial by 1 month: from the trial end, and it becomes a YEARLY subscription', r.status === 201 && s.plan === 'YEARLY' && s.endDate === addMonths(beforeExt.endDate, 1) && r.json.plan === 'YEARLY', `plan=${s.plan}`);
  const beforeYear = await live();
  r = await call(extUrl, 'POST', { months: 12 }, superToken);
  s = await live();
  check('extend a running YEARLY subscription by 1 year: the days already paid for are kept', r.status === 201 && s.endDate === addMonths(beforeYear.endDate, 12) && (await subs.where('status', '==', 'ACTIVE').get()).size === 1);

  await reset(400, -40); // a subscription that ended 40 days ago (locked out)
  const lockedOut = await login('shopadmin@uitest.com');
  r = await call(extUrl, 'POST', { months: 3 }, superToken);
  s = await live();
  check('extend an ended subscription: a NEW one starts today', lockedOut.status === 401 && r.status === 201 && Math.abs(s.startDate - Date.now()) < 60000 && s.endDate === addMonths(s.startDate, 3) && s.plan === 'YEARLY');
  check('...the old one is closed, not deleted', (await subs.get()).size === 2 && (await subs.where('status', '==', 'EXPIRED').get()).size === 1);
  check('...and the shop signs in again straight away', (await login('shopadmin@uitest.com')).status === 201);

  const extLogs = (await db.collection('activityLogs').where('shopId', '==', shopId).where('action', '==', 'SUBSCRIPTION_EXTENDED').get()).docs.map((d) => d.data() as any).filter((l) => l.createdAt >= extStartedAt);
  const withNotes = extLogs.find((l) => JSON.parse(l.details).reason === 'Payment received offline');
  check('each extension is in the activity log, with the reason and internal notes', extLogs.length === 3 && !!withNotes && JSON.parse(withNotes.details).notes === 'Cash, receipt 4411', `${extLogs.length} entries`);

  // --- audit trail
  const logs = (await db.collection('activityLogs').where('shopId', '==', shopId).where('action', '==', 'TRIAL_UPDATED').get()).docs.map((d) => d.data()).filter((l: any) => l.createdAt >= startedAt);
  check('every successful change is in the activity log', logs.length === 6, `${logs.length} TRIAL_UPDATED entries`);

  console.log(failures === 0 ? '\nAll trial checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
