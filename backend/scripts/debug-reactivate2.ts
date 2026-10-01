process.env.FIREBASE_SERVICE_ACCOUNT_JSON = require('fs').readFileSync(__dirname + '/../firebase-service-account-old.json', 'utf8');
const BASE = 'http://127.0.0.1:4100/api';
async function jsonReq(method: string, p: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = text; }
  return { status: res.status, body: b };
}
async function main() {
  const superLogin = await jsonReq('POST', '/auth/login', { email: 'super@uitest.com', password: 'TestPass123', platform: 'native' });
  const superToken = superLogin.body.accessToken;

  // Create a fresh shop for this test
  const suffix = Date.now();
  const create = await jsonReq('POST', '/super/shops', {
    name: `Debug Shop ${suffix}`, adminEmail: `debugadmin${suffix}@uitest.com`, adminName: 'Debug Admin',
    adminPassword: 'TestPass123', adminPhone: `8${String(suffix).slice(-9)}`, categoryId: 'key-shops',
  }, superToken);
  const shopId = create.body.id;
  const adminEmail = `debugadmin${suffix}@uitest.com`;
  console.log('created shop:', shopId);

  const adminLogin = await jsonReq('POST', '/auth/login', { email: adminEmail, password: 'TestPass123', platform: 'native' });
  const adminToken = adminLogin.body.accessToken;
  console.log('admin login:', adminLogin.status);

  const whoami1 = await jsonReq('POST', '/auth-test/whoami', undefined, adminToken);
  console.log('whoami before suspend (expect 201):', whoami1.status);

  const suspend = await jsonReq('POST', `/super/shops/${shopId}/suspend`, { isActive: false }, superToken);
  console.log('suspend:', suspend.status, suspend.body.isActive);

  const whoami2 = await jsonReq('POST', '/auth-test/whoami', undefined, adminToken);
  console.log('whoami while suspended (expect 401):', whoami2.status);

  const reactivate = await jsonReq('POST', `/super/shops/${shopId}/suspend`, { isActive: true }, superToken);
  console.log('reactivate:', reactivate.status, reactivate.body.isActive);

  const whoami3 = await jsonReq('POST', '/auth-test/whoami', undefined, adminToken);
  console.log('whoami after reactivate (expect 201):', whoami3.status, whoami3.body);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
