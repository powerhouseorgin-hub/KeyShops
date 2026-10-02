import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

// SAFETY: this script creates a Super Admin (super@uitest.com) with a
// password that is committed to git. Against the production project that is a
// known-credential Super Admin account, so refuse to run there. Only the
// Firestore/Auth emulator (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST)
// or a non-production service account is allowed.
const PRODUCTION_PROJECT_ID = 'keee-7d6cb';
const targetProject = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
if (targetProject === PRODUCTION_PROJECT_ID && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    `Refusing to seed UI test accounts into the production project "${PRODUCTION_PROJECT_ID}": ` +
      'super@uitest.com has a known password. Run against the emulator (set FIRESTORE_EMULATOR_HOST ' +
      'and FIREBASE_AUTH_EMULATOR_HOST) or a separate non-production Firebase project.',
  );
  process.exit(1);
}

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const { FirebaseAuthService } = await import('../src/firestore/auth/firebase-auth.service');
  const firestore = new FirestoreService();
  const auth = new FirebaseAuthService();

  await firestore.db.collection('shopCategories').doc('key-shops').set({
    name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  // Super Admin
  const superEmail = 'super@uitest.com';
  let superUid: string;
  try {
    const existing = await auth.createUser({ email: superEmail, password: 'TestPass123', displayName: 'UI Test Super Admin' });
    superUid = existing.uid;
  } catch {
    const { getApps } = await import('firebase-admin/app');
    const app = getApps().find((a) => a.name === 'firestore-migration')!;
    const rec = await (await import('firebase-admin/auth')).getAuth(app).getUserByEmail(superEmail);
    superUid = rec.uid;
  }
  await firestore.db.collection('users').doc(superUid).set({
    email: superEmail, phone: null, name: 'UI Test Super Admin', role: 'SUPER_ADMIN', shopId: null,
    deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await auth.setCustomClaims(superUid, { role: 'SUPER_ADMIN', shopId: null });
  console.log('Super Admin ready: super@uitest.com / TestPass123');

  // Shop Admin (via register-shop through the real HTTP flow so a shop+subscription exists)
  const res = await fetch('http://127.0.0.1:4100/api/auth/register-shop', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopName: 'UI Test Shop', ownerName: 'UI Test Shop Admin',
      email: 'shopadmin@uitest.com', phone: '9000000001', password: 'TestPass123',
      location: 'UI Test Address', town: 'Chennai', district: 'Chennai',
      categoryId: 'key-shops', startTrial: true,
    }),
  });
  const body = await res.json();
  console.log('Shop Admin register result:', res.status, body);
  console.log('Shop Admin ready: shopadmin@uitest.com / TestPass123 (or phone 9000000001)');

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
