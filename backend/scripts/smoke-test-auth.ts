// Smoke test for FirebaseAuthService against the local Auth emulator. Run:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   npx ts-node -r tsconfig-paths/register scripts/smoke-test-auth.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { FirebaseAuthService } from '../src/firestore/auth/firebase-auth.service';

async function main() {
  new FirestoreService(); // initializes the shared 'kee-admin' app
  const auth = new FirebaseAuthService();

  console.log('--- Create a user (Firebase Auth owns the password now, no bcrypt) ---');
  const user = await auth.createUser({
    email: 'smoketest@example.com',
    phoneNumber: '9888888888',
    password: 'TestPass123',
    displayName: 'Smoke Test Admin',
  });
  console.log('Created uid:', user.uid);

  console.log('\n--- Sign in with CORRECT password ---');
  const loginResult = await auth.signInWithPassword('smoketest@example.com', 'TestPass123');
  console.log('Got idToken (truncated):', loginResult.idToken.slice(0, 30) + '...', '| uid matches:', loginResult.uid === user.uid);

  console.log('\n--- Sign in with WRONG password (expect rejection) ---');
  try {
    await auth.signInWithPassword('smoketest@example.com', 'WrongPassword');
    console.log('FAIL: wrong password was accepted');
  } catch (e) {
    console.log('Correctly rejected:', e.message);
  }

  console.log('\n--- Verify the ID token (native app path) ---');
  const decoded = await auth.verifyRequestToken(loginResult.idToken);
  console.log('Decoded uid:', decoded.uid, '| email:', decoded.email);

  console.log('\n--- Create + verify a session cookie (web path) ---');
  const sessionCookie = await auth.createSessionCookie(loginResult.idToken, 24 * 60 * 60 * 1000);
  const decodedCookie = await auth.verifyRequestToken(sessionCookie);
  console.log('Session cookie verified, uid:', decodedCookie.uid);

  console.log('\n--- Set custom claims (role, shopId) and confirm they appear on next verify ---');
  await auth.setCustomClaims(user.uid, { role: 'SHOP_ADMIN', shopId: 'shop-abc-123' });
  const freshLogin = await auth.signInWithPassword('smoketest@example.com', 'TestPass123');
  const decodedWithClaims = await auth.verifyRequestToken(freshLogin.idToken);
  console.log('Custom claims on fresh token:', { role: decodedWithClaims.role, shopId: decodedWithClaims.shopId });

  console.log('\n--- Verify a garbage token is rejected ---');
  try {
    await auth.verifyRequestToken('not-a-real-token');
    console.log('FAIL: garbage token was accepted');
  } catch (e) {
    console.log('Correctly rejected:', e.message);
  }

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
