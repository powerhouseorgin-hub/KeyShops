import { initializeApp, cert, type App } from 'firebase-admin/app';

// Lazy, guarded singleton - mirrors the "no-op until configured" pattern
// used for SMTP/MSG91 elsewhere in AuthService, so the app boots fine and
// every other auth flow keeps working even before Firebase is set up.
// FIREBASE_SERVICE_ACCOUNT_JSON holds the *raw JSON contents* of the
// service account key file downloaded from Firebase Console -> Project
// Settings -> Service Accounts -> Generate new private key (pasted directly
// into the env var, not a file path - this app has no persistent disk on
// Render).
let app: App | null | undefined;

export function getFirebaseAdminApp(): App | null {
  if (app !== undefined) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) {
    app = null;
    return app;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    app = initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err.message);
    app = null;
  }
  return app;
}
