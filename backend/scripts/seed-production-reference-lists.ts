// One-time seed of the REAL product types and key types (previously
// hardcoded defaults in the old Prisma migrations - see
// prisma/migrations/20260726090000_add_product_type and
// 20260726110000_add_key_type) into the now-live keee-7d6cb Firestore.
// Mirrors seed-production-categories.ts for shopCategories. Safe to re-run:
// NamedReferenceListService's create() revives-by-name instead of
// duplicating.
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const { ProductTypeService, KeyTypeService } = await import('../src/firestore/config/reference-lists.module');
  const firestore = new FirestoreService();
  const productTypes = new ProductTypeService(firestore);
  const keyTypes = new KeyTypeService(firestore);

  const productTypeNames = ['Key Cutting Machines', 'Used Machines', 'ECM', 'Meter', 'Scanning'];
  for (const name of productTypeNames) {
    const result = await productTypes.create(name);
    console.log('Seeded product type:', result.id, result.name);
  }

  const keyTypeNames = ['Vehicle Key'];
  for (const name of keyTypeNames) {
    const result = await keyTypes.create(name);
    console.log('Seeded key type:', result.id, result.name);
  }

  const allProductTypes = await productTypes.getAll();
  const allKeyTypes = await keyTypes.getAll();
  console.log('\nTotal product types now in production Firestore:', allProductTypes.length);
  console.log('Total key types now in production Firestore:', allKeyTypes.length);
  process.exit(0);
}
main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
