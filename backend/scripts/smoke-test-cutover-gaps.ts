// Covers the routes the frontend calls that the Firestore backend was missing
// before cutover: reset-password-public, change-password, update-credentials,
// DELETE /auth/account, GET /public/search, public machines `search`, plus
// the temporary OTP UI fallback and its safety limits. Creates its own
// throwaway shop (cleaned up by cleanup-test-data.ts) - never touches real data.
//   SMOKE_TEST_BASE_URL=https://api-roe6cy7kca-uc.a.run.app npx ts-node scripts/smoke-test-cutover-gaps.ts
const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:4100') + '/api';

// The throttler keys on the first X-Forwarded-For entry (see ClientIpThrottlerGuard).
// Functional checks use a fresh synthetic client IP per request so they don't eat
// into send-otp's 6-per-10-min budget; the throttle itself is tested explicitly
// below with one fixed IP.
const octet = () => Math.floor(Math.random() * 250);
const randomIp = () => `10.${octet()}.${octet()}.${octet()}`;

async function req(method: string, p: string, body?: any, token?: string, ip: string = randomIp()) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
const check = (label: string, ok: boolean, detail?: any) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  -> ' + JSON.stringify(detail)}`);

async function otpFlow(phone: string, purpose: string) {
  const sent = await req('POST', '/auth/send-otp', { identifier: phone, purpose });
  const code = sent.body?.devCode;
  if (!code) return { sent, verified: null as any };
  const verified = await req('POST', '/auth/verify-otp', { identifier: phone, purpose, code });
  return { sent, verified };
}

async function main() {
  const suffix = Date.now();
  const phone = `9${String(suffix).slice(-9)}`;
  const newPhone = `8${String(suffix).slice(-9)}`;

  console.log('--- OTP UI fallback: allowed purposes show a code, protected purposes do not ---');
  for (const purpose of ['register', 'customer_verify']) {
    const r = await req('POST', '/auth/send-otp', { identifier: phone, purpose });
    check(`send-otp ${purpose} returns devCode (WhatsApp not configured)`, r.status === 201 && /^\d{4}$/.test(r.body?.devCode ?? ''), r);
  }
  for (const purpose of ['reset', 'delete-account']) {
    const r = await req('POST', '/auth/send-otp', { identifier: phone, purpose });
    check(`send-otp ${purpose} does NOT expose the code`, r.status === 201 && r.body?.devCode === undefined, r);
  }

  console.log('\n--- Register a throwaway shop via the OTP-gated wizard flow ---');
  const regOtp = await otpFlow(phone, 'register');
  check('register OTP verifies', regOtp.verified?.status === 201, regOtp.verified);
  const reg = await req('POST', '/auth/register-shop', {
    shopName: `Cutover Test Shop ${suffix}`, ownerName: 'Cutover Owner', phone, password: 'OldPass123',
    location: 'Test Address', town: 'Chennai', district: 'Chennai', categoryId: 'key-shops', startTrial: true,
  });
  check('register-shop', reg.status === 201, reg);
  const login = await req('POST', '/auth/login', { email: phone, password: 'OldPass123', platform: 'native' });
  check('login with phone', login.status === 201, login);
  const token = login.body.accessToken;

  console.log('\n--- change-password ---');
  const wrongOld = await req('POST', '/auth/change-password', { oldPassword: 'nope', newPassword: 'NewPass123' }, token);
  check('wrong current password rejected (400)', wrongOld.status === 400, wrongOld);
  const okChange = await req('POST', '/auth/change-password', { oldPassword: 'OldPass123', newPassword: 'NewPass123' }, token);
  check('correct current password accepted', okChange.status === 201, okChange);
  const oldLogin = await req('POST', '/auth/login', { email: phone, password: 'OldPass123', platform: 'native' });
  check('old password no longer works', oldLogin.status === 401, oldLogin);
  const newLogin = await req('POST', '/auth/login', { email: phone, password: 'NewPass123', platform: 'native' });
  check('new password works', newLogin.status === 201, newLogin);
  const token2 = newLogin.body.accessToken;

  console.log('\n--- reset-password-public requires a verified OTP, which can never be shown on screen ---');
  const noOtp = await req('POST', '/auth/reset-password-public', { identifier: phone, method: 'phone', newPassword: 'Hijack123' });
  check('reset without OTP rejected (400)', noOtp.status === 400, noOtp);
  await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'reset' });
  await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'reset' }); // second send supersedes (consumed:true) the first - must NOT count as verified
  const supersededBypass = await req('POST', '/auth/reset-password-public', { identifier: phone, method: 'phone', newPassword: 'Hijack123' });
  check('requesting 2 codes cannot fake a verification (400)', supersededBypass.status === 400, supersededBypass);
  const stillOld = await req('POST', '/auth/login', { email: phone, password: 'NewPass123', platform: 'native' });
  check('password unchanged after attempted bypass', stillOld.status === 201, stillOld);

  console.log('\n--- update-credentials (change phone) ---');
  const noVerify = await req('POST', '/auth/update-credentials', { newPhone }, token2);
  check('change phone without OTP rejected (400)', noVerify.status === 400, noVerify);
  const chOtp = await otpFlow(newPhone, 'change-credentials');
  check('change-credentials OTP verifies', chOtp.verified?.status === 201, chOtp.verified);
  const changed = await req('POST', '/auth/update-credentials', { newPhone }, token2);
  check('change phone accepted', changed.status === 201 && changed.body?.phone === newPhone, changed);
  const replay = await req('POST', '/auth/update-credentials', { newPhone }, token2);
  check('verification is single-use (replay 400)', replay.status === 400, replay);
  const loginNew = await req('POST', '/auth/login', { email: newPhone, password: 'NewPass123', platform: 'native' });
  check('login with NEW phone works', loginNew.status === 201, loginNew);
  const token3 = loginNew.body.accessToken;

  console.log('\n--- public search + machines search (no auth) ---');
  const ps = await req('GET', `/public/search?q=${encodeURIComponent('Cutover Test Shop')}`);
  check('public/search finds the shop', ps.status === 200 && ps.body?.shops?.some((s: any) => s.name.includes('Cutover Test Shop')), ps);
  const psEmpty = await req('GET', '/public/search?q=zzzz-no-match-zzzz');
  check('public/search no-match returns empty lists', psEmpty.status === 200 && psEmpty.body.shops.length === 0 && psEmpty.body.machines.length === 0, psEmpty);
  const shopSearch = await req('GET', `/public/shops?query=${encodeURIComponent('Cutover Test Shop')}`);
  check('public/shops?query filters by name', shopSearch.status === 200 && Array.isArray(shopSearch.body) && shopSearch.body.length >= 1 && shopSearch.body.every((s: any) => s.name.includes('Cutover Test Shop')), shopSearch);
  const machines = await req('GET', '/public/machines?search=zzzz-no-match-zzzz');
  check('public/machines?search no-match returns empty', machines.status === 200 && (Array.isArray(machines.body) ? machines.body.length === 0 : machines.body.items.length === 0), machines);

  console.log('\n--- DELETE /auth/account ---');
  const delNoOtp = await req('DELETE', '/auth/account', undefined, token3);
  check('delete without OTP rejected (400)', delNoOtp.status === 400, delNoOtp);
  // delete-account codes are log-only by design, so the destructive success path
  // can't be exercised here without reading server logs - covered by the rejection above.

  console.log('\n--- throttling: one IP is cut off, other IPs are unaffected ---');
  const fixedIp = randomIp();
  const statuses: number[] = [];
  for (let i = 0; i < 8; i++) statuses.push((await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'reset' }, undefined, fixedIp)).status);
  check('7th+ send-otp from the same IP gets 429', statuses.slice(0, 6).every((s) => s === 201) && statuses.slice(6).every((s) => s === 429), statuses);
  const otherIp = await req('POST', '/auth/send-otp', { identifier: phone, purpose: 'reset' });
  check('a different IP is not locked out', otherIp.status === 201, otherIp);

  console.log('\nDone. Run cleanup-test-data.ts to remove the throwaway shop.');
  process.exit(0);
}
main().catch((e) => { console.error('Test failed:', e); process.exit(1); });
