// One-time seed of the REAL shop categories (names fixed in business logic -
// see ShopService.searchPublicShops's category-name matching) into the
// now-live keee-7d6cb Firestore. Safe to re-run: NamedReferenceListService's
// create() revives-by-name instead of duplicating.
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const { ShopCategoryService } = await import('../src/firestore/config/reference-lists.module');
  const firestore = new FirestoreService();
  const categories = new ShopCategoryService(firestore);

  const names = ['Key Shops', 'Dealers', 'ECM', 'Meter', 'Scanning'];
  for (const name of names) {
    const result = await categories.create(name);
    console.log('Seeded:', result.id, result.name);
  }
  const all = await categories.getAll();
  console.log('\nTotal shop categories now in production Firestore:', all.length);
  process.exit(0);
}
main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
