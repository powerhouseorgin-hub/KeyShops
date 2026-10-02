// Smoke test for ShopRegistrationService against the local Firestore
// emulator. Run with:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node -r tsconfig-paths/register scripts/smoke-test-registration.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { ShopRepository } from '../src/firestore/shop/shop.repository';
import { UserRepository } from '../src/firestore/shop/user.repository';
import { PlatformConfigService } from '../src/firestore/config/platform-config.service';
import { ShopRegistrationService } from '../src/firestore/shop/shop-registration.service';
import { CryptoService } from '../src/crypto/crypto.service';

async function main() {
  const firestore = new FirestoreService();
  const shops = new ShopRepository(firestore);
  const users = new UserRepository(firestore);
  const platformConfig = new PlatformConfigService(firestore);
  const registration = new ShopRegistrationService(firestore, shops, users, platformConfig, new CryptoService());

  // Seed a shop category (registration requires a valid one).
  const catRef = firestore.db.collection('shopCategories').doc('key-shops');
  await catRef.set({ name: 'Key Shops', sortOrder: 0, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now() });

  console.log('--- Trial registration ---');
  const result1 = await registration.registerShop({
    uid: 'test-uid-1',
    shopName: 'Test Trial Shop',
    ownerName: 'Test Owner',
    phone: '9111111111',
    location: 'Test Address',
    categoryId: 'key-shops',
    startTrial: true,
  });
  console.log(result1);

  const shop1 = await shops.findById(result1.shopId);
  const user1 = await users.findById('test-uid-1');
  console.log('Shop created:', shop1?.name, '| isActive:', shop1?.isActive);
  console.log('User created:', user1?.name, '| role:', user1?.role, '| shopId matches:', user1?.shopId === result1.shopId);

  console.log('\n--- Duplicate phone should be rejected ---');
  try {
    await registration.registerShop({
      uid: 'test-uid-2',
      shopName: 'Dupe Shop',
      ownerName: 'Dupe Owner',
      phone: '9111111111', // same phone as above
      location: 'Test',
      categoryId: 'key-shops',
      startTrial: true,
    });
    console.log('FAIL: duplicate phone was accepted');
  } catch (e) {
    console.log('Correctly rejected:', e.message);
  }

  console.log('\n--- Paid (YEARLY) registration + revenue record ---');
  const result2 = await registration.registerShop({
    uid: 'test-uid-3',
    shopName: 'Test Paid Shop',
    ownerName: 'Paid Owner',
    phone: '9222222222',
    location: 'Test Address 2',
    categoryId: 'key-shops',
    startTrial: false,
    razorpayOrderId: 'order_smoke1',
    razorpayPaymentId: 'pay_smoke1',
  });
  console.log(result2);
  const paymentDoc = await firestore.db.collection('razorpayPayments').doc('pay_smoke1').get();
  console.log('Payment recorded as used:', paymentDoc.exists && paymentDoc.data()?.shopId === result2.shopId);
  try {
    await registration.registerShop({
      uid: 'test-uid-3b', shopName: 'Replay Shop', ownerName: 'Replay', phone: '9222222223', location: 'x',
      categoryId: 'key-shops', startTrial: false, razorpayOrderId: 'order_smoke1', razorpayPaymentId: 'pay_smoke1',
    });
    console.log('FAIL: a reused payment id registered a second shop');
  } catch (e: any) {
    console.log('Reused payment rejected (expect true):', /already been used/.test(e.message));
  }
  const replayIndex = await firestore.db.collection('phoneIndex').doc('9222222223').get();
  console.log('Replay left no phone index behind (expect false):', replayIndex.exists);
  const revenueSnap = await firestore.db.collection('revenueRecords').where('notes', '>=', '').get();
  const matchingRevenue = revenueSnap.docs.find((d) => (d.data().notes || '').includes('Test Paid Shop'));
  console.log('Revenue record created:', !!matchingRevenue, matchingRevenue?.data());

  console.log('\n--- Referral flow ---');
  const result3 = await registration.registerShop({
    uid: 'test-uid-4',
    shopName: 'Referred Shop',
    ownerName: 'Referred Owner',
    phone: '9333333333',
    location: 'Test',
    categoryId: 'key-shops',
    referralCode: '9111111111', // refers the first (trial) shop
    startTrial: true,
  });
  console.log(result3);
  const referrerShop = await shops.findById(result1.shopId);
  console.log('Referrer referralPoints incremented to:', referrerShop?.referralPoints);
  const referralDoc = await firestore.db.collection('referrals').doc(result3.shopId).get();
  console.log('Referral doc exists:', referralDoc.exists, referralDoc.data());

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
