import { Injectable } from '@nestjs/common';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Firestore-rewrite counterpart to TenantService's Prisma client (see the
// migration plan). Per the later decision to migrate into the SAME project
// that's already live (keee-7d6cb) rather than a separate one, this now
// points at the same GCP project AuthService.getFirebaseAdminApp() already
// uses for native phone-auth verification - still a separate NAMED app
// instance ('firestore-migration', not the SDK's default app), since the
// two are initialized independently and the live app's default-app
// singleton shouldn't be disturbed by this parallel module tree. When
// FIRESTORE_EMULATOR_HOST is set (local dev), the Admin SDK transparently
// connects to the emulator instead of production - no extra code needed
// here for that.
let app: App | null = null;

function getApp(): App {
  if (app) return app;
  const existing = getApps().find((a) => a.name === 'firestore-migration');
  if (existing) {
    app = existing;
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set (keee-7d6cb service account key)');
  }
  const serviceAccount = JSON.parse(raw);
  app = initializeApp({ credential: cert(serviceAccount) }, 'firestore-migration');
  return app;
}

@Injectable()
export class FirestoreService {
  readonly db: Firestore = getFirestore(getApp());
}
