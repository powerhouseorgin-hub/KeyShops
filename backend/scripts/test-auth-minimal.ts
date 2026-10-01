import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

async function main() {
  console.log('Step 1: importing services');
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const { FirebaseAuthService } = await import('../src/firestore/auth/firebase-auth.service');
  console.log('Step 2: imported, instantiating FirestoreService first (initializes the named app)');
  new FirestoreService();
  const auth = new FirebaseAuthService();
  console.log('Step 3: instantiated, calling createUser');
  const email = `test-minimal-${Date.now()}@uitest.com`;
  const user = await auth.createUser({ email, password: 'TestPass123', displayName: 'Minimal Test' });
  console.log('Step 4: createUser succeeded, uid:', user.uid);
  await auth.deleteUser(user.uid);
  console.log('Step 5: cleanup deleteUser succeeded');
  process.exit(0);
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
