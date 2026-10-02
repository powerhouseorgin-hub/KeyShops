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
  const superLogin = await jsonReq('POST', '/auth/login', { email: 'super@uitest.com', password: 'TestPass123', platform: 'native' });
  const superToken = superLogin.body.accessToken;

  console.log('--- Super Admin dashboard ---');
  const superDash = await jsonReq('GET', '/super/dashboard', undefined, superToken);
  console.log(superDash.status, JSON.stringify(superDash.body, null, 2));

  console.log('\n--- Shop Admin dashboard ---');
  const shopLogin = await jsonReq('POST', '/auth/login', { email: 'shopadmin@uitest.com', password: 'TestPass123', platform: 'native' });
  const shopToken = shopLogin.body.accessToken;
  const shopDash = await jsonReq('GET', '/shop/dashboard', undefined, shopToken);
  console.log(shopDash.status, JSON.stringify(shopDash.body, null, 2));

  console.log('\n--- SECURITY: Shop Admin cannot hit super/dashboard ---');
  const forbidden = await jsonReq('GET', '/super/dashboard', undefined, shopToken);
  console.log('shop admin on super/dashboard (expect 403):', forbidden.status);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
