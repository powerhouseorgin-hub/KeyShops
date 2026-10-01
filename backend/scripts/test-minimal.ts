import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);
console.log('Step 1: env set');

async function main() {
  console.log('Step 2: main started');
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  console.log('Step 3: FirestoreService imported');
  const firestore = new FirestoreService();
  console.log('Step 4: FirestoreService instantiated');
  const doc = await firestore.db.collection('_healthcheck').doc('test').get();
  console.log('Step 5: Firestore read succeeded, exists:', doc.exists);
  await firestore.db.collection('_healthcheck').doc('test').set({ ts: Date.now() });
  console.log('Step 6: Firestore write succeeded');
  process.exit(0);
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
