import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

const BASE = 'http://127.0.0.1:4100/api';

async function jsonReq(method: string, urlPath: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  const login = await jsonReq('POST', '/auth/login', { email: 'super@uitest.com', password: 'TestPass123', platform: 'native' });
  const superToken = login.body.accessToken;
  console.log('super login:', login.status);

  const customers = await jsonReq('GET', '/super/customers', undefined, superToken);
  const customer = customers.body[0];
  console.log('using customer:', customer?.id, customer?.name);

  // Upload a fake invoice PDF for this customer via the super route.
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-fake-invoice-bytes')], { type: 'application/pdf' }), 'invoice.pdf');
  form.append('fileName', 'Invoice_Test.pdf');
  const uploadRes = await fetch(`${BASE}/super/customers/${customer.id}/report`, {
    method: 'POST', headers: { Authorization: `Bearer ${superToken}` }, body: form as any,
  });
  const uploadBody = await uploadRes.json();
  console.log('upload invoice:', uploadRes.status, uploadBody);

  const sendRes = await jsonReq('POST', `/super/customers/${customer.id}/send-invoice`, { reportId: uploadBody.id }, superToken);
  console.log('send-invoice (super):', sendRes.status, sendRes.body);

  console.log('\nSmoke test complete.');
  process.exit(0);
}
main().catch((e) => { console.error('Smoke test failed:', e); process.exit(1); });
