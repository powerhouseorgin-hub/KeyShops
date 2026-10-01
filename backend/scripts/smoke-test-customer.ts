// Smoke test for CustomerRegistrationService against the local Firestore
// emulator. Run with:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node -r tsconfig-paths/register scripts/smoke-test-customer.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { ShopRepository } from '../src/firestore/shop/shop.repository';
import { MasterKeyRepository } from '../src/firestore/customer/master-key.repository';
import { CustomerRegistrationService } from '../src/firestore/customer/customer-registration.service';

async function main() {
  const firestore = new FirestoreService();
  const shops = new ShopRepository(firestore);
  const masterKeys = new MasterKeyRepository(firestore);
  const customerReg = new CustomerRegistrationService(firestore, shops, masterKeys);

  const shopId = 'smoke-test-shop';
  await firestore.db.collection('shops').doc(shopId).set({
    name: 'Smoke Test Shop', isActive: true, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  });

  console.log('--- Create customer with a NEW key number (should create MasterKey) ---');
  const r1 = await customerReg.createCustomer({
    shopId, actorUserId: 'admin-uid', name: 'Alice', phone: '9000000001', keyNumber: 'ABC123', vehicleCategory: 'TWO_WHEELER',
  });
  console.log(r1);
  const mk1 = await masterKeys.findByKeyNumber(shopId, 'ABC123');
  console.log('MasterKey created:', mk1?.keyNumber, '| category:', mk1?.category);

  console.log('\n--- Create a SECOND customer with the SAME key number (should reuse the existing MasterKey, not duplicate) ---');
  const r2 = await customerReg.createCustomer({
    shopId, actorUserId: 'admin-uid', name: 'Bob', phone: '9000000002', keyNumber: 'ABC123', vehicleCategory: 'TWO_WHEELER',
  });
  console.log(r2);
  console.log('Same masterKeyId reused:', r1.masterKeyId === r2.masterKeyId);

  const mkSnap = await firestore.db.collection('masterKeys').where('keyNumber', '==', 'ABC123').get();
  console.log('Exactly one MasterKey doc exists for ABC123:', mkSnap.size === 1);

  console.log('\n--- Verify Customer, ActivityLog, Notification docs were all created ---');
  const customersSnap = await shops.customers(shopId).get();
  console.log('Customers in shop:', customersSnap.size);
  const activitySnap = await firestore.db.collection('activityLogs').where('shopId', '==', shopId).where('action', '==', 'CUSTOMER_CREATE').get();
  console.log('ActivityLog CUSTOMER_CREATE entries:', activitySnap.size);
  const notifSnap = await firestore.db.collection('notifications').where('shopId', '==', shopId).get();
  console.log('Notification entries:', notifSnap.size);

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
