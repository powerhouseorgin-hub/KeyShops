// One-time (idempotent) setup: lets browsers and the Android WebView READ files from the project's storage bucket.
// The app shows stored photos with <img> (no CORS needed) but the receipt generator downloads them with fetch() to draw them
// into the PDF, and without these CORS rules the browser blocks that download ("invoice could not be created").
// Read-only (GET/HEAD); a file is still reachable only through its unguessable download token.
//
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/set-storage-cors.ts          # show the current rules
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/set-storage-cors.ts --apply  # set them
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const account = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8'));
initializeApp({ credential: cert(account) });

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'keee-7d6cb.firebasestorage.app';
const RULES = [{ origin: ['*'], method: ['GET', 'HEAD'], responseHeader: ['Content-Type', 'Content-Length', 'Range'], maxAgeSeconds: 3600 }];

async function main() {
  const bucket = getStorage().bucket(BUCKET);
  const [before] = await bucket.getMetadata();
  console.log(`${bucket.name} current CORS:`, JSON.stringify(before.cors ?? null));
  if (process.argv.includes('--apply')) {
    await bucket.setCorsConfiguration(RULES);
    const [after] = await bucket.getMetadata();
    console.log('CORS now:', JSON.stringify(after.cors));
  }
  process.exit(0);
}
main().catch((e) => { console.error('failed:', e.message); process.exit(1); });
