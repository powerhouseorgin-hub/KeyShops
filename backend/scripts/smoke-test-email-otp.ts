// End-to-end check of the email code flow against a local backend (port 4100, Firebase emulators) whose SMTP settings point at a local
// test SMTP server (node scripts/test-smtp-sink.js) that records every email as one JSON line in $MAIL_LOG.
//
//   MAIL_LOG=/path/to/mails.log npx ts-node scripts/smoke-test-email-otp.ts
// Needs the seeded accounts (scripts/seed-ui-test-accounts.ts): shopadmin@uitest.com / TestPass123.
import * as fs from 'fs';

const BASE = process.env.API_BASE || 'http://localhost:4100/api';
const MAIL_LOG = process.env.MAIL_LOG || '';
const EMAIL = 'shopadmin@uitest.com';
const PASSWORD = 'TestPass123';
if (!MAIL_LOG) { console.error('Set MAIL_LOG to the SMTP test server log file'); process.exit(2); }

let failures = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  - ' + extra : ''}`); if (!ok) failures++; };
const mails = (): any[] => (fs.existsSync(MAIL_LOG) ? fs.readFileSync(MAIL_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

async function call(path: string, method = 'GET', body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function newMailFor(to: string, before: number): Promise<any | null> {
  for (let i = 0; i < 20; i++) {
    const found = mails().slice(before).filter((m) => m.to === to).pop();
    if (found) return found;
    await sleep(250);
  }
  return null;
}

async function main() {
  const login = await call('/auth/login', 'POST', { email: EMAIL, password: PASSWORD, platform: 'native' });
  check('shop admin logs in', login.status === 201 && !!login.json.accessToken);
  const token = login.json.accessToken as string;
  check('login does not claim a verified email yet', login.json.user?.emailVerified === false);

  // 1. before verifying: a reset by email sends nothing, and looks exactly like a send
  let before = mails().length;
  const early = await call('/auth/send-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'reset' });
  await sleep(1500);
  check('reset by email before the email is verified: looks sent', early.status === 201 && early.json.delivered === true);
  check('...but no email was sent', mails().length === before);

  // 2. verify the email
  before = mails().length;
  const send = await call('/auth/send-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'verify-email' });
  check('verify-email: the server accepts the request', send.status === 201 && send.json.mode === 'email' && send.json.delivered === true && send.json.devCode === undefined, JSON.stringify(send.json));
  const mail1 = await newMailFor(EMAIL, before);
  check('the code arrives by email', !!mail1 && /^[0-9]{4}$/.test(mail1.code), mail1 ? `subject "${mail1.subject}"` : 'no mail');
  const bad = await call('/auth/verify-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'verify-email', code: mail1.code === '1234' ? '4321' : '1234' });
  check('a wrong code is refused', bad.status === 400);
  const good = await call('/auth/verify-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'verify-email', code: mail1.code });
  check('the emailed code verifies', good.status === 201 && good.json.success === true);
  const confirm = await call('/auth/confirm-email', 'POST', {}, token);
  check('confirm-email marks the account verified', confirm.status === 201 && confirm.json.emailVerified === true, JSON.stringify(confirm.json));
  const again = await call('/auth/confirm-email', 'POST', {}, token);
  check('the same verification cannot be used twice', again.status === 400);
  const me = await call('/auth/me', 'GET', undefined, token);
  check('/auth/me reports the email as verified', me.json.user?.emailVerified === true);

  // 3. now reset the password by email
  before = mails().length;
  const rs = await call('/auth/send-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'reset' });
  check('reset by email: accepted', rs.status === 201 && rs.json.delivered === true);
  const mail2 = await newMailFor(EMAIL, before);
  check('the reset code arrives by email', !!mail2 && /^[0-9]{4}$/.test(mail2.code));
  const noVerify = await call('/auth/reset-password-public', 'POST', { identifier: EMAIL, method: 'email', newPassword: PASSWORD });
  check('reset without verifying the code is refused', noVerify.status === 400);
  const v2 = await call('/auth/verify-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'reset', code: mail2.code });
  check('the reset code verifies', v2.status === 201);
  const reset = await call('/auth/reset-password-public', 'POST', { identifier: EMAIL, method: 'email', newPassword: PASSWORD });
  check('the password is reset by email', reset.status === 201 && reset.json.success === true, JSON.stringify(reset.json));
  const reuse = await call('/auth/reset-password-public', 'POST', { identifier: EMAIL, method: 'email', newPassword: PASSWORD });
  check('one verification resets one password only', reuse.status === 400);
  const login2 = await call('/auth/login', 'POST', { email: EMAIL, password: PASSWORD, platform: 'native' });
  check('the account still logs in afterwards', login2.status === 201);

  // 4. unknown address: no email, same answer
  before = mails().length;
  const ghost = await call('/auth/send-otp', 'POST', { identifier: 'nobody-here@example.com', method: 'email', purpose: 'reset' });
  await sleep(1500);
  check('reset for an unknown email answers like a send', ghost.status === 201 && ghost.json.delivered === true);
  check('...and sends nothing', mails().length === before);

  // 5. purposes that must stay phone-only
  const nope = await call('/auth/send-otp', 'POST', { identifier: EMAIL, method: 'email', purpose: 'delete-account' });
  check('delete-account cannot be done by email', nope.status === 400);
  const badEmail = await call('/auth/send-otp', 'POST', { identifier: 'not-an-email', method: 'email', purpose: 'verify-email' });
  check('an invalid email is refused', badEmail.status === 400);

  console.log(failures === 0 ? '\nAll email OTP checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
