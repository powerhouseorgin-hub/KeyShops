process.env.FIREBASE_SERVICE_ACCOUNT_JSON = require('fs').readFileSync(__dirname + '/../firebase-service-account-old.json', 'utf8');
const BASE = 'http://127.0.0.1:4100/api';
async function jsonReq(method: string, p: string, body?: any, token?: string) {
  const res = await fetch(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = text; }
  return { status: res.status, body: b };
}
async function main() {
  const login = await jsonReq('POST', '/auth/login', { email: 'super@uitest.com', password: 'TestPass123', platform: 'native' });
  const superToken = login.body.accessToken;
  const shops = await jsonReq('GET', '/super/shops?limit=1', undefined, superToken);
  const shopId = shops.body.items[0].id;
  console.log('using shop:', shopId, shops.body.items[0].name);

  const suspend = await jsonReq('POST', `/super/shops/${shopId}/suspend`, { isActive: false }, superToken);
  console.log('suspend:', suspend.status, suspend.body.isActive);

  console.log('waiting 2s...');
  await new Promise(r => setTimeout(r, 2000));

  const reactivate = await jsonReq('POST', `/super/shops/${shopId}/suspend`, { isActive: true }, superToken);
  console.log('reactivate:', reactivate.status, reactivate.body.isActive);

  // Check the shop doc directly
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const firestore = new FirestoreService();
  const doc = await firestore.db.collection('shops').doc(shopId).get();
  console.log('Firestore shop.isActive directly:', (doc.data() as any).isActive);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
