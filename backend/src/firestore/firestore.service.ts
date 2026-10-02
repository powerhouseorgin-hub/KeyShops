import { Injectable } from '@nestjs/common';
import { initializeApp, applicationDefault, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Owns the Firebase Admin app for the keee-7d6cb project (Firestore, Auth and Storage all share it) as a
// NAMED app instance, so it never collides with the SDK's default-app singleton. When FIRESTORE_EMULATOR_HOST
// is set (local dev), the Admin SDK transparently connects to the emulator instead of production - no extra
// code needed here for that.
let app: App | null = null;

function getApp(): App {
  if (app) return app;
  const existing = getApps().find((a) => a.name === 'kee-admin');
  if (existing) {
    app = existing;
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (raw) {
    app = initializeApp({ credential: cert(JSON.parse(raw)) }, 'kee-admin');
    return app;
  }
  // No explicit key - this must be running NATIVELY inside the
  // keee-7d6cb project (a deployed Cloud Function), where the runtime's own
  // service account already has full project access via Application
  // Default Credentials. FIREBASE_SERVICE_ACCOUNT_JSON can't be supplied as
  // a deployed env var there anyway - Cloud Functions reserves any env var
  // name starting with FIREBASE_/X_GOOGLE_/EXT_ - and ADC makes supplying
  // the key redundant in that one context regardless (see
  // functions-api/.env.api's comment). Every local/standalone script still
  // sets FIREBASE_SERVICE_ACCOUNT_JSON explicitly, so this fallback is only
  // ever reached when truly running inside GCP.
  app = initializeApp({ credential: applicationDefault() }, 'kee-admin');
  return app;
}

@Injectable()
export class FirestoreService {
  readonly db: Firestore = getFirestore(getApp());
}
