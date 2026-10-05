// One-time (idempotent) backfill: gives every vehicle-sale photo saved BEFORE inline thumbnails existed a small inline JPEG thumbnail
// (`photos[i].thumb`, ~240 px), so the sale details screen shows those photos from the one request that loads the sale instead of
// waiting for a download from file storage. New photos get their thumbnail from the app at upload time. Needs `sharp` (a dev
// dependency of the backend, used only by this script - it is not part of the deployed function).
//
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/backfill-sale-thumbs.ts            # dry run: report only
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/backfill-sale-thumbs.ts --apply    # make the changes
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const account = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8'));
initializeApp({ credential: cert(account) });

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'keee-7d6cb.firebasestorage.app';
const MAX_THUMB_BYTES = 60 * 1024;
const apply = process.argv.includes('--apply');

async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);
  const snap = await db.collectionGroup('vehicleSales').get();
  let sales = 0; let photos = 0; let made = 0; let failed = 0;

  for (const doc of snap.docs) {
    const sale: any = doc.data();
    const list: any[] = Array.isArray(sale.photos) ? sale.photos : [];
    if (!list.length) continue;
    sales += 1;
    let changed = false;
    const next = [...list];
    for (let i = 0; i < list.length; i += 1) {
      photos += 1;
      if (list[i]?.thumb || !list[i]?.key) continue;
      try {
        const [buf] = await bucket.file(list[i].key).download();
        // rotate by the camera's orientation tag, 240 px on the long side, JPEG ~60% - a few KB
        let quality = 60;
        let out = await sharp(buf).rotate().resize(240, 240, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
        while (out.length > MAX_THUMB_BYTES && quality > 25) {
          quality -= 10;
          out = await sharp(buf).rotate().resize(240, 240, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
        }
        if (out.length > MAX_THUMB_BYTES) throw new Error(`thumbnail still ${out.length} bytes`);
        next[i] = { ...list[i], thumb: `data:image/jpeg;base64,${out.toString('base64')}` };
        changed = true;
        made += 1;
      } catch (e: any) {
        failed += 1;
        console.warn(`  ${doc.ref.path} photo ${i + 1}: ${e.message}`);
      }
    }
    if (apply && changed) await doc.ref.update({ photos: next });
  }
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: ${sales} sales with photos, ${photos} photos; thumbnail ${apply ? 'stored for' : 'would be stored for'} ${made}, ${failed} failed`);
  process.exit(0);
}
main().catch((e) => { console.error('failed:', e.message); process.exit(1); });
