// Exercises every collection/collectionGroup query pattern across the
// Firestore port against the REAL project, to surface every composite index
// Firestore actually requires (the local emulator doesn't enforce these, so
// they were never discovered until testing against real Firestore). Each
// FAILED_PRECONDITION error includes a direct index-creation link.
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'), 'utf8',
);

async function tryQuery(label: string, fn: () => Promise<any>) {
  try {
    await fn();
    console.log(`OK   ${label}`);
  } catch (e: any) {
    if (e.code === 9 || /FAILED_PRECONDITION/.test(e.message)) {
      console.log(`INDEX NEEDED  ${label}`);
      console.log(`  ${e.message.split('You can create it here: ')[1] || e.message}`);
    } else {
      console.log(`ERROR ${label}: ${e.message}`);
    }
  }
}

async function main() {
  const { FirestoreService } = await import('../src/firestore/firestore.service');
  const firestore = new FirestoreService();
  const db = firestore.db;
  const now = Date.now();

  await tryQuery('shopCategories: deletedAt==null orderBy sortOrder', () =>
    db.collection('shopCategories').where('deletedAt', '==', null).orderBy('sortOrder', 'asc').get());
  await tryQuery('productTypes: deletedAt==null orderBy name', () =>
    db.collection('productTypes').where('deletedAt', '==', null).orderBy('name', 'asc').get());
  await tryQuery('keyTypes: deletedAt==null orderBy name', () =>
    db.collection('keyTypes').where('deletedAt', '==', null).orderBy('name', 'asc').get());

  await tryQuery('masterKeys: shopId==X orderBy keyNumber', () =>
    db.collection('masterKeys').where('shopId', '==', 'dummy').orderBy('keyNumber', 'asc').get());
  await tryQuery('masterKeys: orderBy keyNumber (no filter)', () =>
    db.collection('masterKeys').orderBy('keyNumber', 'asc').limit(5).get());
  await tryQuery('collectionGroup customers: masterKeyId==X', () =>
    db.collectionGroup('customers').where('masterKeyId', '==', 'dummy').limit(5).get());

  await tryQuery('notifications: shopId==X orderBy createdAt', () =>
    db.collection('notifications').where('shopId', '==', 'dummy').orderBy('createdAt', 'desc').limit(5).get());
  await tryQuery('notifications: shopId==null AND audience==SHOP orderBy createdAt', () =>
    db.collection('notifications').where('shopId', '==', null).where('audience', '==', 'SHOP').orderBy('createdAt', 'desc').limit(5).get());
  await tryQuery('notifications: shopId==null orderBy createdAt', () =>
    db.collection('notifications').where('shopId', '==', null).orderBy('createdAt', 'desc').limit(5).get());

  await tryQuery('promotions: deletedAt==null orderBy createdAt,__name__', () =>
    db.collection('promotions').where('deletedAt', '==', null).orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(5).get());
  await tryQuery('promotions: deletedAt==null type==PRODUCT orderBy createdAt,__name__', () =>
    db.collection('promotions').where('deletedAt', '==', null).where('type', '==', 'PRODUCT').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(5).get());

  await tryQuery('activityLogs: action==X orderBy action,createdAt', () =>
    db.collection('activityLogs').where('action', '==', 'LOGIN').orderBy('action').orderBy('createdAt', 'desc').limit(5).get());
  await tryQuery('activityLogs: shopId==X orderBy action,createdAt', () =>
    db.collection('activityLogs').where('shopId', '==', 'dummy').orderBy('action').orderBy('createdAt', 'desc').limit(5).get());

  await tryQuery('collectionGroup documents: deletedAt==null (count)', () =>
    db.collectionGroup('documents').where('deletedAt', '==', null).count().get());
  await tryQuery('collectionGroup customers: keyNumber!=null', () =>
    db.collectionGroup('customers').where('keyNumber', '!=', null).limit(5).get());
  await tryQuery('collectionGroup customers: orderBy createdAt,__name__', () =>
    db.collectionGroup('customers').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(5).get());
  await tryQuery('collectionGroup customers: orderBy keyNumber,__name__', () =>
    db.collectionGroup('customers').orderBy('keyNumber', 'asc').orderBy('__name__', 'asc').limit(5).get());
  await tryQuery('collectionGroup subscriptions: status==ACTIVE orderBy endDate', () =>
    db.collectionGroup('subscriptions').where('status', '==', 'ACTIVE').where('endDate', '>=', now).where('endDate', '<=', now + 1000).get());
  await tryQuery('collectionGroup subscriptions: count', () =>
    db.collectionGroup('subscriptions').count().get());

  await tryQuery('revenueRecords: orderBy year,month', () =>
    db.collection('revenueRecords').orderBy('year', 'desc').orderBy('month', 'desc').limit(5).get());

  await tryQuery('referrals: referrerShopId==X orderBy createdAt', () =>
    db.collection('referrals').where('referrerShopId', '==', 'dummy').orderBy('createdAt', 'desc').limit(5).get());

  await tryQuery('shops: orderBy createdAt,__name__', () =>
    db.collection('shops').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(5).get());

  await tryQuery('customers (subcollection): orderBy createdAt,__name__', () =>
    db.collection('shops').doc('dummy').collection('customers').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(5).get());

  process.exit(0);
}
main().catch((e) => { console.error('Discover failed:', e); process.exit(1); });
