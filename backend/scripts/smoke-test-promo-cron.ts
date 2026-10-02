import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { FirestorePromotionService } from '../src/firestore/promotion/firestore-promotion.service';
import { FirebaseFileService } from '../src/firestore/storage/firebase-file.service';
import { AlgoliaSearchService } from '../src/firestore/search/algolia-search.service';

async function main() {
  const firestore = new FirestoreService();
  const files = new FirebaseFileService();
  const promotions = new FirestorePromotionService(firestore, files, new AlgoliaSearchService());

  const now = Date.now();
  const expiredRef = await firestore.db.collection('promotions').add({
    type: 'PRODUCT', title: 'Expired machine', shopId: 'shop-x', createdById: 'user-x',
    validUntil: now - 1000, deletedAt: null, createdAt: now - 100000, updatedAt: now - 100000, imageUrls: [],
  });
  const activeRef = await firestore.db.collection('promotions').add({
    type: 'PRODUCT', title: 'Active machine', shopId: 'shop-x', createdById: 'user-x',
    validUntil: now + 1000000, deletedAt: null, createdAt: now, updatedAt: now, imageUrls: [],
  });

  await promotions.deleteExpiredProducts();

  const expiredSnap = await expiredRef.get();
  const activeSnap = await activeRef.get();
  console.log('Expired doc deleted (expect false/exists=false):', expiredSnap.exists);
  console.log('Active doc still exists (expect true):', activeSnap.exists);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
