// Integration test of the WhatsApp inbound OTP flow through the REAL server stack: POST /auth/send-otp -> a signed Meta-style webhook
// call (the user's message) -> GET /auth/otp-status -> POST /auth/verify-otp, against the emulators. No real WhatsApp message is sent:
// the server's replies go to Meta's API with a dummy token and fail, which this test accepts (the state then reads SEND_FAILED).
// The webhook signature needs the raw request body, so run the PRODUCTION entry point (not the ts-node bootstrap script):
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 PORT=4101 \
//   WHATSAPP_ACCESS_TOKEN=dummy WHATSAPP_PHONE_NUMBER_ID=PNID WHATSAPP_OTP_INBOUND=true WHATSAPP_BUSINESS_NUMBER=919025088853 \
//   WHATSAPP_APP_SECRET=test-secret WHATSAPP_WEBHOOK_VERIFY_TOKEN=t node dist/src/main-firestore.js
//   SMOKE_TEST_BASE_URL=http://127.0.0.1:4101 WHATSAPP_APP_SECRET=test-secret npx ts-node -r tsconfig-paths/register scripts/smoke-test-whatsapp-inbound.ts
import { createHmac } from 'crypto';

const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:4101') + '/api';
const SECRET = process.env.WHATSAPP_APP_SECRET || 'test-secret';
const PNID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'PNID';
let failures = 0;
const check = (label: string, ok: boolean, detail?: any) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  -> ' + String(JSON.stringify(detail) ?? 'no detail').slice(0, 300)}`);
};
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function api(method: string, p: string, body?: any) {
  const res = await fetch(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
async function webhook(payload: any, secret = SECRET, sign = true) {
  const raw = JSON.stringify(payload);
  const headers: any = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip() };
  if (sign) headers['X-Hub-Signature-256'] = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  const res = await fetch(`${BASE}/webhooks/whatsapp`, { method: 'POST', headers, body: raw });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const msg = (from: string, text: string, phoneId = PNID) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneId }, messages: [{ from, id: 'wamid.' + Math.random().toString(36).slice(2), type: 'text', text: { body: text } }] } }] }] });
const status = async (ref: string) => (await api('GET', `/auth/otp-status?ref=${ref}`)).body.state;
const phone = () => `9${String(Date.now()).slice(-9)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('--- send-otp in inbound mode ---');
  const p1 = phone();
  const s1 = await api('POST', '/auth/send-otp', { identifier: p1, purpose: 'reset' });
  check('send-otp answers with mode inbound, a reference and a wa.me link, and no code', s1.status === 201 && s1.body.mode === 'inbound' && /^[A-Z0-9]{8}$/.test(s1.body.ref) && String(s1.body.waLink).includes('wa.me/919025088853') && s1.body.devCode === undefined, s1);
  check('the request is waiting', (await status(s1.body.ref)) === 'WAITING');
  const early = await api('POST', '/auth/verify-otp', { identifier: p1, purpose: 'reset', code: '1234' });
  check('verifying before the WhatsApp message is refused', early.status === 400 && /send the message first/.test(early.body.message), early);
  const custPhone = phone();
  const cust = await api('POST', '/auth/send-otp', { identifier: custPhone, purpose: 'customer_verify' });
  check('a customer verification uses inbound too, and tells the app what the customer must send', cust.body.mode === 'inbound' && cust.body.message === 'KEYSHOPS ' + cust.body.ref && cust.body.businessNumber === '919025088853', cust.body);
  await webhook(msg('919876500001', cust.body.message)); // the shop owner's own phone
  check("the shop owner's number sending it for the customer is a MISMATCH", (await status(cust.body.ref)) === 'MISMATCH');
  const cust2 = await api('POST', '/auth/send-otp', { identifier: custPhone, purpose: 'customer_verify' });
  await webhook(msg('91' + custPhone, cust2.body.message));
  await sleep(300);
  const cst = await status(cust2.body.ref);
  check("the customer's own number gets the code (CODE_SENT, or SEND_FAILED with the dummy token)", cst === 'CODE_SENT' || cst === 'SEND_FAILED', cst);

  console.log('\n--- the webhook is protected ---');
  const unsigned = await webhook(msg('91' + p1, `KEYSHOPS ${s1.body.ref}`), SECRET, false);
  check('an unsigned call is rejected and does nothing', unsigned.body.received === false && (await status(s1.body.ref)) === 'WAITING', unsigned);
  const wrongSig = await webhook(msg('91' + p1, `KEYSHOPS ${s1.body.ref}`), 'not-the-secret');
  check('a wrongly signed call is rejected and does nothing', wrongSig.body.received === false && (await status(s1.body.ref)) === 'WAITING', wrongSig);
  await webhook(msg('91' + p1, `KEYSHOPS ${s1.body.ref}`, 'SOMEONE-ELSES-NUMBER'));
  check("a message for another business number is ignored", (await status(s1.body.ref)) === 'WAITING');
  await webhook(msg('91' + p1, 'Hi, I need help'));
  await webhook(msg('91' + p1, 'KEYSHOPS ZZZZZZZZ'));
  check('ordinary chat and unknown references are ignored', (await status(s1.body.ref)) === 'WAITING');

  console.log('\n--- a message from a DIFFERENT number ---');
  const wrongNumber = await webhook(msg('919876500000', `KEYSHOPS ${s1.body.ref}`));
  check('the webhook answers 200', wrongNumber.status === 200, wrongNumber);
  check('the request becomes MISMATCH (no code was issued)', (await status(s1.body.ref)) === 'MISMATCH');
  const afterMismatch = await api('POST', '/auth/verify-otp', { identifier: p1, purpose: 'reset', code: '1234' });
  check('verifying is refused with the "different number" message', afterMismatch.status === 400 && /different number/.test(afterMismatch.body.message), afterMismatch);

  console.log('\n--- the SAME number ---');
  const p2 = phone();
  const s2 = await api('POST', '/auth/send-otp', { identifier: p2, purpose: 'reset' });
  const ok = await webhook(msg('91' + p2, `Hello KEYSHOPS ${s2.body.ref.toLowerCase()}`));
  check('the webhook answers 200', ok.status === 200, ok);
  await sleep(300);
  const st = await status(s2.body.ref);
  check('a code was issued (CODE_SENT, or SEND_FAILED here because the dummy token cannot reach WhatsApp)', st === 'CODE_SENT' || st === 'SEND_FAILED', st);
  const repeat = await webhook(msg('91' + p2, `KEYSHOPS ${s2.body.ref}`));
  check('a repeated message does not issue anything new', repeat.status === 200 && (await status(s2.body.ref)) === st);
  const wrong = await api('POST', '/auth/verify-otp', { identifier: p2, purpose: 'reset', code: '0000' });
  check('a wrong code is refused', wrong.status === 400 && /Incorrect/i.test(JSON.stringify(wrong.body)), wrong);

  console.log('\n--- status endpoint ---');
  for (const ref of ['', 'short', 'ZZZZZZZZ', '../etc']) {
    const r = await api('GET', `/auth/otp-status?ref=${encodeURIComponent(ref)}`);
    check(`status of "${ref}" is UNKNOWN`, r.body.state === 'UNKNOWN', r);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('Test crashed:', e); process.exit(1); });
