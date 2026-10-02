// Deletes smoke-test debris created against the REAL keee-7d6cb project
// during backend migration validation. Safe by default: runs as a DRY RUN
// (reports what it would delete) unless invoked with --confirm.
//
//   npx ts-node -r tsconfig-paths/register scripts/cleanup-test-data.ts
//   npx ts-node -r tsconfig-paths/register scripts/cleanup-test-data.ts --confirm
//
// Identifies test data purely by name/email patterns used across
// scripts/smoke-test-*.ts and scripts/debug-*.ts - never touches anything
// that doesn't match one of these known throwaway patterns. Real production
// shops (registered via the actual app/website) won't match any of them.
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';

const DRY_RUN = !process.argv.includes('--confirm');
// Opt-in only: also removes the standing UI fixtures (shops 'UI Test Shop' /
// 'Curl Test Shop' and the super@uitest.com Super Admin). Never default -
// they're needed for local/browser testing - but they MUST be gone from the
// production project: seed-ui-test-accounts.ts is committed with their
// password, so a live super@uitest.com is a known-credential Super Admin.
const INCLUDE_FIXTURES = process.argv.includes('--include-fixtures');
const FIXTURE_SHOP_NAMES = ['UI Test Shop', 'Curl Test Shop'];
const FIXTURE_SUPER_ADMIN_EMAIL_RE = /^super@uitest\.com$/i;

// Every test-shop name prefix found across scripts/smoke-test-*.ts and
// scripts/debug-*.ts (shopName/name fields, all `${prefix}${suffix}` where
// suffix is Date.now()-derived).
const TEST_SHOP_NAME_PREFIXES = [
  'Audit Fix Shop ', // smoke-test-audit-fixes.ts
  'Customer Test Shop ',
  'Cutover Test Shop ', // smoke-test-cutover-gaps.ts
  'Debug Search Shop ',
  'Debug Shop ',
  'Doc Test Shop ',
  'Files Test Shop ',
  'Promo Test Shop ',
  'Provisioned Shop ',
  'Renamed Shop ', // smoke-test-shop.ts renames "Provisioned Shop X" to this mid-run
];

// Throwaway Super Admin accounts created directly against Firebase Auth by
// smoke tests (shopId: null, so not reachable via the shop-linked cleanup
// below). Deliberately excludes the standing UI fixtures super@uitest.com /
// shopadmin@uitest.com seeded by seed-ui-test-accounts.ts.
const ORPHAN_SUPER_ADMIN_EMAIL_RE = /^super-\d+@example\.com$/;

// Test customers/listings created directly through the live UI (browser
// re-verification pass) under the standing fixture shops (UI Test Shop /
// Curl Test Shop) - these don't match TEST_SHOP_NAME_PREFIXES since the
// fixture shops themselves are legitimate and must stay. Exact-name matched
// rather than prefix-matched since these shops may later hold real data.
const FRONTEND_TEST_CUSTOMER_NAMES = ['WhatsApp OTP Verify Customer', 'Invoice Flow Verify Customer'];
const FRONTEND_TEST_PROMOTION_TITLES = ['Frontend Verify Key Cutter'];

function isTestShopName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (INCLUDE_FIXTURES && FIXTURE_SHOP_NAMES.includes(name)) return true;
  return TEST_SHOP_NAME_PREFIXES.some((p) => name.startsWith(p));
}

async function deleteAllDocs(db: FirebaseFirestore.Firestore, docs: QueryDocumentSnapshot[]) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function main() {
  const firestore = new FirestoreService();
  const db = firestore.db;
  const app = getApps().find((a) => a.name === 'firestore-migration')!;
  const auth = getAuth(app);
  // Not set in backend/.env (the running bootstrap server was started with
  // it exported inline in its shell, not via .env) - default to the real
  // bucket confirmed during Storage setup rather than relying on the SDK's
  // bucket() fallback, which doesn't infer the .firebasestorage.app naming.
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'keee-7d6cb.firebasestorage.app';
  const bucket = getStorage(app).bucket(bucketName);

  console.log(DRY_RUN ? '=== DRY RUN (pass --confirm to actually delete) ===\n' : '=== LIVE DELETE ===\n');

  const shopsSnap = await db.collection('shops').get();
  const testShops = shopsSnap.docs.filter((d) => isTestShopName((d.data() as any).name));
  console.log(`Found ${testShops.length} test shop(s) out of ${shopsSnap.size} total shops:`);
  testShops.forEach((d) => console.log(`  - ${d.id}  "${(d.data() as any).name}"`));

  const totals = {
    customers: 0, admins: 0, masterKeys: 0, promotions: 0,
    activityLogs: 0, notifications: 0, referrals: 0, reports: 0, storageFiles: 0,
  };

  const revenueSnap = await db.collection('revenueRecords').get();
  const testRevenueRecords = revenueSnap.docs.filter((d) => {
    const notes = (d.data() as any).notes as string | undefined;
    return !!notes && testShops.some((s) => notes.includes((s.data() as any).name));
  });

  // smoke-test-promotion.ts's cross-tenant security check creates a
  // promotion doc with a fake shopId ('other-shop-id') that doesn't belong
  // to any real shop, purely to verify the current shop admin can't delete
  // it - by design it's never cleaned up by that test, so it survives in
  // the real project and shows up in the Super Admin marketplace view.
  const orphanPromotionsSnap = await db.collection('promotions').where('shopId', '==', 'other-shop-id').get();
  console.log(`\nFound ${orphanPromotionsSnap.size} orphan security-test promotion(s) (shopId: 'other-shop-id').`);
  if (!DRY_RUN) {
    await deleteAllDocs(db, orphanPromotionsSnap.docs);
  }

  // Named test listings created directly through the UI under fixture shops
  // (not caught by TEST_SHOP_NAME_PREFIXES since the shops themselves are
  // legitimate fixtures, not throwaway).
  let frontendTestPromotions = 0;
  for (const title of FRONTEND_TEST_PROMOTION_TITLES) {
    const snap = await db.collection('promotions').where('title', '==', title).get();
    frontendTestPromotions += snap.size;
    if (snap.size) console.log(`Found ${snap.size} frontend-test promotion(s) titled "${title}".`);
    if (!DRY_RUN) await deleteAllDocs(db, snap.docs);
  }

  // Named test customers created directly through the UI under fixture
  // shops (UI Test Shop / Curl Test Shop) during browser re-verification -
  // same rationale as above. ActivityLogs/notifications referencing these
  // customers are left alone (low-value log noise, not surfaced in any
  // feed, and not cheaply queryable by customerId).
  const allShopsSnap = await db.collection('shops').get();
  let frontendTestCustomers = 0;
  let frontendTestReports = 0;
  let frontendTestStorageFiles = 0;
  for (const shopDoc of allShopsSnap.docs) {
    const shopId = shopDoc.id;
    const customersSnap = await db.collection('shops').doc(shopId).collection('customers')
      .where('name', 'in', FRONTEND_TEST_CUSTOMER_NAMES).get();
    if (customersSnap.empty) continue;
    console.log(`\nFound ${customersSnap.size} frontend-test customer(s) under "${(shopDoc.data() as any).name}" (${shopId}):`);
    for (const custDoc of customersSnap.docs) {
      const customerId = custDoc.id;
      console.log(`  - ${customerId}  "${(custDoc.data() as any).name}"`);
      frontendTestCustomers++;
      const reportsSnap = await db.collection('customerReports').where('customerId', '==', customerId).get();
      const fileKeys = reportsSnap.docs.map((d) => (d.data() as any).fileKey).filter(Boolean);
      frontendTestReports += reportsSnap.size;
      frontendTestStorageFiles += fileKeys.length;
      if (!DRY_RUN) {
        await Promise.all(fileKeys.map((k) => bucket.file(k).delete().catch(() => {})));
        await deleteAllDocs(db, reportsSnap.docs);
        await db.collection('customerShopIndex').doc(customerId).delete().catch(() => {});
        // recursiveDelete also removes this customer's own documents subcollection.
        await db.recursiveDelete(db.collection('shops').doc(shopId).collection('customers').doc(customerId));
      }
    }
  }

  for (const shopDoc of testShops) {
    const shopId = shopDoc.id;
    const shopData = shopDoc.data() as any;
    console.log(`\n--- ${shopData.name} (${shopId}) ---`);

    const customersSnap = await db.collection('shops').doc(shopId).collection('customers').get();
    const customerIds = customersSnap.docs.map((d) => d.id);
    totals.customers += customerIds.length;
    console.log(`  customers: ${customerIds.length}`);

    let reportDocs: QueryDocumentSnapshot[] = [];
    for (let i = 0; i < customerIds.length; i += 30) {
      const chunk = customerIds.slice(i, i + 30);
      const snap = await db.collection('customerReports').where('customerId', 'in', chunk).get();
      reportDocs.push(...snap.docs);
    }
    totals.reports += reportDocs.length;
    console.log(`  customerReports: ${reportDocs.length}`);

    const usersSnap = await db.collection('users').where('shopId', '==', shopId).get();
    totals.admins += usersSnap.size;
    console.log(`  shop admin users: ${usersSnap.size}`);

    const masterKeysSnap = await db.collection('masterKeys').where('shopId', '==', shopId).get();
    totals.masterKeys += masterKeysSnap.size;
    console.log(`  masterKeys: ${masterKeysSnap.size}`);

    const promotionsSnap = await db.collection('promotions').where('shopId', '==', shopId).get();
    totals.promotions += promotionsSnap.size;
    console.log(`  promotions: ${promotionsSnap.size}`);

    const activityLogsSnap = await db.collection('activityLogs').where('shopId', '==', shopId).get();
    totals.activityLogs += activityLogsSnap.size;
    console.log(`  activityLogs: ${activityLogsSnap.size}`);

    const notificationsSnap = await db.collection('notifications').where('shopId', '==', shopId).get();
    totals.notifications += notificationsSnap.size;
    console.log(`  notifications: ${notificationsSnap.size}`);

    const referralDocs = new Map<string, DocumentReference>();
    const referralAsReferred = await db.collection('referrals').doc(shopId).get();
    if (referralAsReferred.exists) referralDocs.set(referralAsReferred.id, referralAsReferred.ref);
    const referralAsReferrer = await db.collection('referrals').where('referrerShopId', '==', shopId).get();
    referralAsReferrer.docs.forEach((d) => referralDocs.set(d.id, d.ref));
    totals.referrals += referralDocs.size;
    console.log(`  referrals: ${referralDocs.size}`);

    const cleanShopId = shopId.replace(/[^a-zA-Z0-9]/g, '');
    const [files] = await bucket.getFiles({ prefix: `${cleanShopId}_` });
    totals.storageFiles += files.length;
    console.log(`  storage files: ${files.length}`);

    if (!DRY_RUN) {
      await Promise.all(files.map((f) => f.delete().catch((e: any) => console.warn(`    storage delete failed for ${f.name}:`, e.message))));

      if (customerIds.length) {
        const batch = db.batch();
        customerIds.forEach((id) => batch.delete(db.collection('customerShopIndex').doc(id)));
        await batch.commit();
      }
      await deleteAllDocs(db, reportDocs);

      for (const userDoc of usersSnap.docs) {
        const u = userDoc.data() as any;
        try {
          await auth.deleteUser(userDoc.id);
        } catch (e: any) {
          if (e.code !== 'auth/user-not-found') console.warn(`    auth delete failed for ${userDoc.id}:`, e.message);
        }
        if (u.email) await db.collection('emailIndex').doc(String(u.email).toLowerCase()).delete().catch(() => {});
        if (u.phone) await db.collection('phoneIndex').doc(String(u.phone)).delete().catch(() => {});
        await userDoc.ref.delete();
      }
      if (shopData.referralCode) {
        await db.collection('phoneIndex').doc(String(shopData.referralCode)).delete().catch(() => {});
      }

      await deleteAllDocs(db, masterKeysSnap.docs);
      await deleteAllDocs(db, promotionsSnap.docs);
      await deleteAllDocs(db, activityLogsSnap.docs);
      await deleteAllDocs(db, notificationsSnap.docs);
      for (const ref of referralDocs.values()) await ref.delete().catch(() => {});

      // Recursively removes subscriptions/documents/customers (and each
      // customer's own documents subcollection) plus the shop doc itself.
      await db.recursiveDelete(db.collection('shops').doc(shopId));
      console.log('  deleted.');
    }
  }

  const superAdminsSnap = await db.collection('users').where('role', '==', 'SUPER_ADMIN').get();
  const orphanSuperAdmins = superAdminsSnap.docs.filter((d) => {
    const email = (d.data() as any).email || '';
    return ORPHAN_SUPER_ADMIN_EMAIL_RE.test(email) || (INCLUDE_FIXTURES && FIXTURE_SUPER_ADMIN_EMAIL_RE.test(email));
  });
  console.log(`\nFound ${orphanSuperAdmins.length} throwaway Super Admin test user(s) (no shop):`);
  orphanSuperAdmins.forEach((d) => console.log(`  - ${d.id}  ${(d.data() as any).email}`));
  if (!DRY_RUN) {
    for (const d of orphanSuperAdmins) {
      const u = d.data() as any;
      try {
        await auth.deleteUser(d.id);
      } catch (e: any) {
        if (e.code !== 'auth/user-not-found') console.warn(`  auth delete failed for ${d.id}:`, e.message);
      }
      if (u.email) await db.collection('emailIndex').doc(String(u.email).toLowerCase()).delete().catch(() => {});
      await d.ref.delete();
    }
  }

  console.log(`\nFound ${testRevenueRecords.length} test-related revenueRecord(s).`);
  if (!DRY_RUN) {
    for (const d of testRevenueRecords) await d.ref.delete().catch(() => {});
  }

  console.log('\n=== Summary ===');
  console.log({
    testShops: testShops.length,
    ...totals,
    orphanSuperAdmins: orphanSuperAdmins.length,
    testRevenueRecords: testRevenueRecords.length,
    orphanPromotions: orphanPromotionsSnap.size,
    frontendTestPromotions,
    frontendTestCustomers,
    frontendTestReports,
    frontendTestStorageFiles,
  });
  console.log(DRY_RUN ? '\nThis was a DRY RUN - nothing was deleted. Re-run with --confirm to actually delete.' : '\nDone.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
