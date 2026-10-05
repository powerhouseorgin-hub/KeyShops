// One-time (idempotent) tune-up of the vehicle-sale files that were saved BEFORE the fast details screen existed:
//   1. gives every sale photo / signature file a long-lived cache header (they used to be "max-age=0", so a device downloaded them again
//      every time a sale was opened);
//   2. stores each small signature PNG inline on its sale (`sellerSignature.data` / `buyerSignature.data`), which is what lets the details
//      screen show signatures from the one request that loads the sale.
// New sales get both automatically. Photos' inline thumbnails are made by the app at upload time, so older photos have none (they still
// load from storage, now with the cache header).
//
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/optimize-sale-files.ts            # dry run: report only
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/optimize-sale-files.ts --apply    # make the changes
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const account = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8'));
initializeApp({ credential: cert(account) });

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'keee-7d6cb.firebasestorage.app';
const CACHE = 'private, max-age=31536000, immutable';
const MAX_INLINE = 60 * 1024;
const apply = process.argv.includes('--apply');

async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);
  const snap = await db.collectionGroup('vehicleSales').get();
  let sales = 0; let files = 0; let cached = 0; let inlined = 0; let failed = 0;

  for (const doc of snap.docs) {
    const sale: any = doc.data();
    sales += 1;
    const updates: Record<string, any> = {};
    const entries: Array<[string, any]> = [
      ...((sale.photos || []) as any[]).map((p, i): [string, any] => [`photos[${i}]`, p]),
      ['sellerSignature', sale.sellerSignature],
      ['buyerSignature', sale.buyerSignature],
    ];
    for (const [label, entry] of entries) {
      if (!entry?.key) continue;
      files += 1;
      try {
        const file = bucket.file(entry.key);
        const [meta] = await file.getMetadata();
        if (meta.cacheControl !== CACHE) {
          if (apply) await file.setMetadata({ cacheControl: CACHE });
          cached += 1;
        }
        if (label.endsWith('Signature') && !entry.data && (entry.size || 0) <= MAX_INLINE) {
          const [buf] = await file.download();
          if (buf.length <= MAX_INLINE && buf.subarray(0, 4).toString('hex') === '89504e47') {
            updates[`${label}.data`] = `data:image/png;base64,${buf.toString('base64')}`;
            inlined += 1;
          }
        }
      } catch (e: any) {
        failed += 1;
        console.warn(`  ${doc.ref.path} ${label}: ${e.message}`);
      }
    }
    if (apply && Object.keys(updates).length) await doc.ref.update(updates);
  }
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: ${sales} sales, ${files} files; cache header ${apply ? 'set on' : 'would be set on'} ${cached}, signature data ${apply ? 'stored for' : 'would be stored for'} ${inlined}, ${failed} failed`);
  process.exit(0);
}
main().catch((e) => { console.error('failed:', e.message); process.exit(1); });
