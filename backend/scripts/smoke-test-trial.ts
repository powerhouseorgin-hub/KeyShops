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

  // --- audit trail
  const logs = (await db.collection('activityLogs').where('shopId', '==', shopId).where('action', '==', 'TRIAL_UPDATED').get()).docs.map((d) => d.data()).filter((l: any) => l.createdAt >= startedAt);
  check('every successful change is in the activity log', logs.length === 4, `${logs.length} TRIAL_UPDATED entries (extend, set, extend on an ended trial, new trial)`);

  console.log(failures === 0 ? '\nAll trial checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
