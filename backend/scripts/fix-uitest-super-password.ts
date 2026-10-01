// One-off: force-resets super@uitest.com's password to the documented
// TestPass123 value, in case an earlier seeding attempt created the account
// with a different password (Admin SDK updateUser doesn't need the old one).
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  new FirestoreService();
  const app = getApps().find((a) => a.name === 'firestore-migration')!;
  const auth = getAuth(app);
  const rec = await auth.getUserByEmail('super@uitest.com');
  await auth.updateUser(rec.uid, { password: 'TestPass123' });
  console.log('Password reset for', rec.uid, rec.email);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
