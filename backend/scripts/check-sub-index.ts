process.env.FIREBASE_SERVICE_ACCOUNT_JSON = require('fs').readFileSync(__dirname + '/../firebase-service-account-old.json', 'utf8');
async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const firestore = new FirestoreService();
  try {
    await firestore.db.collectionGroup('shops').limit(0).get(); // noop warm-up, ignore
  } catch {}
  try {
    const dummyRef = firestore.db.collection('shops').doc('dummy').collection('subscriptions');
    await dummyRef.where('status', '==', 'ACTIVE').orderBy('endDate', 'desc').limit(1).get();
    console.log('OK: subscriptions [status, endDate DESC]');
  } catch (e: any) { console.log('NOT READY: subscriptions [status, endDate DESC] -', e.message.slice(0, 80)); }
  try {
    const dummyRef = firestore.db.collection('shops').doc('dummy').collection('subscriptions');
    await dummyRef.where('status', '==', 'ACTIVE').orderBy('createdAt', 'desc').limit(1).get();
    console.log('OK: subscriptions [status, createdAt DESC]');
  } catch (e: any) { console.log('NOT READY: subscriptions [status, createdAt DESC] -', e.message.slice(0, 80)); }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
