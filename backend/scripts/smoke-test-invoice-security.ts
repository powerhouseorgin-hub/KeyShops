import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:4100') + '/api';
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
  const customers = await jsonReq('GET', '/super/customers', undefined, superToken);
  const [c1, c2] = customers.body;
  console.log('c1:', c1?.id, 'c2:', c2?.id);
  if (!c2) { console.log('need at least 2 customers, skipping'); process.exit(0); }

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-c1-invoice')], { type: 'application/pdf' }), 'invoice.pdf');
  form.append('fileName', 'Invoice_C1.pdf');
  const uploadRes = await fetch(`${BASE}/super/customers/${c1.id}/report`, {
    method: 'POST', headers: { Authorization: `Bearer ${superToken}` }, body: form as any,
  });
  const { id: reportId } = await uploadRes.json();
  console.log('report belongs to c1:', reportId);

  const hijack = await jsonReq('POST', `/super/customers/${c2.id}/send-invoice`, { reportId }, superToken);
  console.log('attempt to send c1\'s report to c2 (expect 404):', hijack.status, hijack.body);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
