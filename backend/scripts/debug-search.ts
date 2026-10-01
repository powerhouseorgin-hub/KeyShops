process.env.FIREBASE_SERVICE_ACCOUNT_JSON = require('fs').readFileSync(__dirname + '/../firebase-service-account-old.json', 'utf8');
const BASE = 'http://127.0.0.1:4100/api';
async function main() {
  const suffix = Date.now();
  const reg = await fetch(`${BASE}/auth/register-shop`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
    shopName: `Debug Search Shop ${suffix}`, ownerName: 'X', phone: `9${String(suffix).slice(-9)}`, password: 'TestPass123',
    location: 'x', categoryId: 'key-shops', startTrial: true,
  })}).then(r => r.json());
  const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: reg.loginPhone, password: 'TestPass123', platform: 'native' })}).then(r => r.json());
  const token = login.accessToken;
  const cust = await fetch(`${BASE}/shop/customers`, { method: 'POST', headers: {'Content-Type':'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({ name: 'Test', phone: `6${String(suffix).slice(-9)}` })}).then(r => r.json());
  console.log('customer phone field:', cust.phone);
  const res = await fetch(`${BASE}/shop/customers/global-search?search=${cust.phone}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  console.log('search status:', res.status, 'body:', text.slice(0, 500));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
