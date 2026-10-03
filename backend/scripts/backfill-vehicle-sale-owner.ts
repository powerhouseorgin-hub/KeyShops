// One-time backfill: stamps owner fields on vehicle sales saved before owners were recorded
// (ownerType / ownerId / shopId / ownerName), so the Super Admin review can filter them by shop.
// Reads shops/{id}/vehicleSales only (Super Admin sales always carry their owner). DRY RUN unless --confirm.
//
//   npx ts-node -r tsconfig-paths/register scripts/backfill-vehicle-sale-owner.ts
//   npx ts-node -r tsconfig-paths/register scripts/backfill-vehicle-sale-owner.ts --confirm
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8');
import { FirestoreService } from '../src/firestore/firestore.service';

(async () => {
  const confirm = process.argv.includes('--confirm');
  const db = new FirestoreService().db;
  const shops = await db.collection('shops').get();
  let scanned = 0;
  let toFix = 0;
  for (const shop of shops.docs) {
    const sales = await shop.ref.collection('vehicleSales').get();
    scanned += sales.size;
    const missing = sales.docs.filter((d) => (d.data() as any).ownerType === undefined || (d.data() as any).shopId === undefined);
    if (!missing.length) continue;
    toFix += missing.length;
    const name = String((shop.data() as any).name || '');
    console.log(`${confirm ? 'fixing' : 'would fix'} ${missing.length} sale(s) of shop "${name}" (${shop.id})`);
    if (confirm) {
      const batch = db.batch();
      missing.forEach((d) => batch.update(d.ref, { ownerType: 'SHOP', ownerId: shop.id, shopId: shop.id, ownerName: name }));
      await batch.commit();
    }
  }
  console.log(`\n${confirm ? 'DONE' : 'DRY RUN'}: ${scanned} sale(s) scanned, ${toFix} ${confirm ? 'updated' : 'need the owner fields'}.`);
  process.exit(0);
})();
