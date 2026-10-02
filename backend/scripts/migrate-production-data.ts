// One-time production data migration: Postgres (via Prisma) -> Firestore
// (keee-7d6cb), as planned for the Render/Supabase -> Cloud Run/Firestore
// cutover. Safe-by-default like cleanup-test-data.ts: dry run unless
// --confirm is passed. Also supports --test-user-import to run JUST the
// Firebase Auth user import in isolation, so the bcrypt password-hash
// import can be verified with a real login BEFORE the full migration runs.
//
//   npx ts-node -r tsconfig-paths/register scripts/migrate-production-data.ts
//   npx ts-node -r tsconfig-paths/register scripts/migrate-production-data.ts --test-user-import
//   npx ts-node -r tsconfig-paths/register scripts/migrate-production-data.ts --confirm
//
// Deliberately does NOT delete the live secrets the way
// bootstrap-firestore-app.ts/main-firestore.ts do - this script needs real
// DATABASE_URL/DIRECT_URL (Prisma) AND real SUPABASE_* (Storage downloads)
// AND real FIREBASE_SERVICE_ACCOUNT_JSON (Firestore/Auth writes)
// simultaneously. This is the one script in this project where that's
// correct and necessary.
//
// ID strategy: reuse the existing Postgres UUID as the new Firestore
// document ID (and Firebase Auth UID for User) wherever straightforward -
// simplest, fully traceable, no mapping table needed. Two exceptions, where
// the new schema's own deterministic-ID convention takes over instead:
// MasterKey -> `${shopId}_${keyNumber}` (MasterKeyRepository.docId), and
// Referral -> doc ID is referredShopId. ShopCategory/ProductType/KeyType are
// matched BY NAME against whatever's already in Firestore (seeded earlier
// this session) rather than re-inserted under the old Postgres ID, to avoid
// duplicating already-seeded reference data.
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { PrismaClient } from '@prisma/client';
import { FirestoreService } from '../src/firestore/firestore.service';
import { FirebaseFileService } from '../src/firestore/storage/firebase-file.service';
import { FileService as SupabaseFileService } from '../src/customer/file.service';
import { MasterKeyRepository } from '../src/firestore/customer/master-key.repository';
import { ShopCategoryService, ProductTypeService, KeyTypeService } from '../src/firestore/config/reference-lists.module';
import { PlatformConfigService } from '../src/firestore/config/platform-config.service';
import { syntheticEmailForPhone } from '../src/firestore/auth/firebase-auth.service';
import { getApps } from 'firebase-admin/app';
import { getAuth, type UserImportRecord } from 'firebase-admin/auth';
import { BadRequestException } from '@nestjs/common';

const DRY_RUN = !process.argv.includes('--confirm');
const TEST_USER_IMPORT_ONLY = process.argv.includes('--test-user-import');

function toMs(d: Date | null | undefined): number | null {
  return d ? d.getTime() : null;
}

// Dry-run output should prove the migration WOULD do the right thing
// without actually printing real customers' PII into logs/terminal
// scrollback - masks everything but enough shape to sanity-check counts
// and role distribution.
function maskEmail(email: string | null): string {
  if (!email) return '-';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain ?? '?'}`;
}
function maskPhone(phone: string | null): string {
  if (!phone) return '-';
  return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

async function findOrCreateByName(svc: ShopCategoryService | ProductTypeService | KeyTypeService, name: string): Promise<string> {
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  try {
    const created = await svc.create(name);
    return created.id;
  } catch (e) {
    if (e instanceof BadRequestException) return slug; // already exists active - same deterministic slug
    throw e;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const firestore = new FirestoreService();
  const db = firestore.db;
  const app = getApps().find((a) => a.name === 'firestore-migration')!;
  const auth = getAuth(app);
  const fileService = new FirebaseFileService();
  const supabaseFiles = new SupabaseFileService();
  (supabaseFiles as any).onModuleInit();
  const shopCategorySvc = new ShopCategoryService(firestore);
  const productTypeSvc = new ProductTypeService(firestore);
  const keyTypeSvc = new KeyTypeService(firestore);
  const platformConfigSvc = new PlatformConfigService(firestore);

  console.log(DRY_RUN ? '=== DRY RUN (pass --confirm to actually migrate) ===\n' : '=== LIVE MIGRATION ===\n');

  // ---- Users (isolated test path) ----
  // --test-user-import performs a REAL import of just this one phase (not a
  // dry run) so the bcrypt hash import can be verified with an actual login
  // before trusting it for the full --confirm migration.
  const liveForUsers = !DRY_RUN || TEST_USER_IMPORT_ONLY;
  async function migrateUsers(): Promise<Map<string, { email: string | null; phone: string | null }>> {
    const users = await prisma.user.findMany();
    console.log(`User: ${users.length}`);
    const info = new Map<string, { email: string | null; phone: string | null }>();
    if (!liveForUsers) {
      users.forEach((u) => console.log(`  - ${u.id}  ${u.role}  email=${maskEmail(u.email)}  phone=${maskPhone(u.phone)}`));
      return info;
    }
    const records: UserImportRecord[] = [];
    for (const u of users) {
      info.set(u.id, { email: u.email, phone: u.phone });
      const existing = await auth.getUser(u.id).catch(() => null);
      if (existing) {
        console.log(`  - ${u.id} already imported, skipping`);
        continue;
      }
      records.push({
        uid: u.id,
        email: u.email || syntheticEmailForPhone(u.phone!),
        phoneNumber: u.phone ? `+91${u.phone}` : undefined,
        displayName: u.name,
        passwordHash: Buffer.from(u.passwordHash),
        customClaims: { role: u.role, shopId: u.shopId },
      });
    }
    if (records.length) {
      const result = await auth.importUsers(records, { hash: { algorithm: 'BCRYPT' } });
      console.log(`  imported: ${result.successCount}, failed: ${result.failureCount}`);
      result.errors.forEach((e) => console.error(`  import error at index ${e.index}:`, e.error.message));
    }
    return info;
  }

  if (TEST_USER_IMPORT_ONLY) {
    await migrateUsers();
    console.log('\n--test-user-import complete. Test a real login (email/phone + their existing password) against the bootstrap server before running the full --confirm migration.');
    process.exit(0);
  }

  const counts: Record<string, number> = {};

  // ---- Reference lists (find-or-create by name, not by old ID) ----
  const categoryIdMap = new Map<string, string>(); // old Postgres ShopCategory.id -> new Firestore doc id
  const categories = await prisma.shopCategory.findMany();
  console.log(`ShopCategory: ${categories.length}`);
  counts.shopCategories = categories.length;
  if (!DRY_RUN) {
    for (const c of categories) categoryIdMap.set(c.id, await findOrCreateByName(shopCategorySvc, c.name));
  }

  const productTypes = await prisma.productType.findMany();
  console.log(`ProductType: ${productTypes.length}`);
  counts.productTypes = productTypes.length;
  if (!DRY_RUN) for (const p of productTypes) await findOrCreateByName(productTypeSvc, p.name);

  const keyTypes = await prisma.keyType.findMany();
  console.log(`KeyType: ${keyTypes.length}`);
  counts.keyTypes = keyTypes.length;
  if (!DRY_RUN) for (const k of keyTypes) await findOrCreateByName(keyTypeSvc, k.name);

  // ---- Shops ----
  const shops = await prisma.shop.findMany();
  console.log(`Shop: ${shops.length}`);
  counts.shops = shops.length;
  if (!DRY_RUN) {
    for (const s of shops) {
      await db.collection('shops').doc(s.id).set({
        name: s.name,
        companyDetails: s.companyDetails,
        logoUrl: s.logoUrl,
        themeColor: s.themeColor,
        isActive: s.isActive,
        storageUsed: Number(s.storageUsed),
        aadhaarNumber: s.aadhaarNumber,
        latitude: s.latitude,
        longitude: s.longitude,
        town: s.town,
        district: s.district,
        categoryId: s.categoryId ? categoryIdMap.get(s.categoryId) ?? null : null,
        referralCode: s.referralCode,
        referredByCode: s.referredByCode,
        referralPoints: s.referralPoints,
        deletedAt: toMs(s.deletedAt),
        createdAt: s.createdAt.getTime(),
        updatedAt: s.updatedAt.getTime(),
      });
    }
  }

  // ---- Users (full pass, now that Shops exist for shopId references) ----
  const userInfo = await migrateUsers();
  if (!DRY_RUN) {
    const users = await prisma.user.findMany();
    for (const u of users) {
      await db.collection('users').doc(u.id).set({
        email: u.email, phone: u.phone, name: u.name, role: u.role, shopId: u.shopId,
        deletedAt: toMs(u.deletedAt), createdAt: u.createdAt.getTime(), updatedAt: u.updatedAt.getTime(),
      });
      if (u.email) await db.collection('emailIndex').doc(u.email.toLowerCase()).set({ uid: u.id });
      if (u.phone) await db.collection('phoneIndex').doc(u.phone).set({ uid: u.id });
    }
  }

  // ---- MasterKeys ----
  const masterKeyIdMap = new Map<string, string>(); // old MasterKey.id -> new deterministic doc id
  const masterKeys = await prisma.masterKey.findMany();
  console.log(`MasterKey: ${masterKeys.length}`);
  counts.masterKeys = masterKeys.length;
  if (!DRY_RUN) {
    for (const mk of masterKeys) {
      const newId = MasterKeyRepository.docId(mk.shopId, mk.keyNumber);
      masterKeyIdMap.set(mk.id, newId);
      await db.collection('masterKeys').doc(newId).set({
        keyNumber: mk.keyNumber, category: mk.category, backImageUrl: mk.backImageUrl, shopId: mk.shopId,
        deletedAt: toMs(mk.deletedAt), createdAt: mk.createdAt.getTime(), updatedAt: mk.updatedAt.getTime(),
      });
    }
  }

  // ---- Customers ----
  const customers = await prisma.customer.findMany();
  console.log(`Customer: ${customers.length}`);
  counts.customers = customers.length;
  if (!DRY_RUN) {
    for (const c of customers) {
      await db.collection('shops').doc(c.shopId).collection('customers').doc(c.id).set({
        name: c.name, phone: c.phone, address: c.address, idProofType: c.idProofType, idProofNumber: c.idProofNumber,
        reason: c.reason, keyNumber: c.keyNumber, keyType: c.keyType, vehicleNumber: c.vehicleNumber,
        masterKeyId: c.masterKeyId ? masterKeyIdMap.get(c.masterKeyId) ?? null : null,
        latitude: c.latitude, longitude: c.longitude, mapsLink: c.mapsLink, capturedAddress: c.capturedAddress,
        photoUrl: c.photoUrl, billAmount: c.billAmount, billNumber: c.billNumber, vehicleName: c.vehicleName,
        lostKey: c.lostKey, addKey: c.addKey, homeOfficeName: c.homeOfficeName, vehicleCategory: c.vehicleCategory,
        deletedAt: toMs(c.deletedAt), createdAt: c.createdAt.getTime(), updatedAt: c.updatedAt.getTime(),
      });
      await db.collection('customerShopIndex').doc(c.id).set({ shopId: c.shopId });
    }
  }

  // ---- File-backed docs: re-upload bytes Supabase -> Firebase Storage ----
  async function migrateFile(oldFileKey: string, originalName: string | null, namespace: string): Promise<{ fileUrl: string; fileKey: string } | null> {
    try {
      const { buffer } = await supabaseFiles.downloadFileBuffer(oldFileKey);
      return await fileService.uploadFile(originalName || oldFileKey, buffer, namespace);
    } catch (err: any) {
      console.warn(`    file migration failed for "${oldFileKey}":`, err.message);
      return null;
    }
  }

  const customerDocuments = await prisma.customerDocument.findMany({ include: { customer: true } });
  console.log(`CustomerDocument: ${customerDocuments.length}`);
  counts.customerDocuments = customerDocuments.length;
  if (!DRY_RUN) {
    for (const d of customerDocuments) {
      const uploaded = await migrateFile(d.fileKey, d.originalName, d.customer.shopId);
      await db.collection('shops').doc(d.customer.shopId).collection('customers').doc(d.customerId).collection('documents').doc(d.id).set({
        documentType: d.documentType,
        fileUrl: uploaded?.fileUrl ?? d.fileUrl,
        fileKey: uploaded?.fileKey ?? d.fileKey,
        fileSize: d.fileSize, originalName: d.originalName,
        deletedAt: toMs(d.deletedAt), createdAt: d.createdAt.getTime(), updatedAt: d.updatedAt.getTime(),
      });
    }
  }

  const customerReports = await prisma.customerReport.findMany({ include: { customer: true } });
  console.log(`CustomerReport: ${customerReports.length}`);
  counts.customerReports = customerReports.length;
  if (!DRY_RUN) {
    for (const r of customerReports) {
      const uploaded = await migrateFile(r.fileKey, r.fileName, r.customer.shopId);
      await db.collection('customerReports').doc(r.id).set({
        customerId: r.customerId, shopId: r.customer.shopId,
        fileKey: uploaded?.fileKey ?? r.fileKey, fileName: r.fileName,
        createdAt: r.createdAt.getTime(),
      });
    }
  }

  const shopDocuments = await prisma.shopDocument.findMany();
  console.log(`ShopDocument: ${shopDocuments.length}`);
  counts.shopDocuments = shopDocuments.length;
  if (!DRY_RUN) {
    for (const d of shopDocuments) {
      const uploaded = await migrateFile(d.fileKey, d.originalName, d.shopId);
      await db.collection('shops').doc(d.shopId).collection('documents').doc(d.id).set({
        documentType: d.documentType,
        fileUrl: uploaded?.fileUrl ?? d.fileUrl,
        fileKey: uploaded?.fileKey ?? d.fileKey,
        fileSize: d.fileSize, originalName: d.originalName,
        deletedAt: toMs(d.deletedAt), createdAt: d.createdAt.getTime(), updatedAt: d.updatedAt.getTime(),
      });
    }
  }

  // ---- Subscriptions ----
  const subscriptions = await prisma.subscription.findMany();
  console.log(`Subscription: ${subscriptions.length}`);
  counts.subscriptions = subscriptions.length;
  if (!DRY_RUN) {
    for (const s of subscriptions) {
      await db.collection('shops').doc(s.shopId).collection('subscriptions').doc(s.id).set({
        plan: s.plan, status: s.status, startDate: s.startDate.getTime(), endDate: s.endDate.getTime(),
        createdAt: s.createdAt.getTime(), updatedAt: s.updatedAt.getTime(),
      });
    }
  }

  // ---- Promotions ----
  const promotions = await prisma.promotion.findMany();
  console.log(`Promotion: ${promotions.length}`);
  counts.promotions = promotions.length;
  if (!DRY_RUN) {
    for (const p of promotions) {
      await db.collection('promotions').doc(p.id).set({
        type: p.type, title: p.title, description: p.description, imageUrl: p.imageUrl, imageUrls: p.imageUrls,
        price: p.price, discountPercentage: p.discountPercentage, validUntil: toMs(p.validUntil),
        linkedPromotionId: p.linkedPromotionId, productType: p.productType, phone: p.phone,
        shopId: p.shopId, createdById: p.createdById,
        deletedAt: toMs(p.deletedAt), createdAt: p.createdAt.getTime(), updatedAt: p.updatedAt.getTime(),
      });
    }
  }

  // ---- Referrals ----
  const referrals = await prisma.referral.findMany();
  console.log(`Referral: ${referrals.length}`);
  counts.referrals = referrals.length;
  if (!DRY_RUN) {
    for (const r of referrals) {
      await db.collection('referrals').doc(r.referredShopId).set({
        referrerShopId: r.referrerShopId, referredShopId: r.referredShopId, pointsAwarded: r.pointsAwarded,
        createdAt: r.createdAt.getTime(),
      });
    }
  }

  // ---- ActivityLog / Notification / RevenueRecord / ContactMessage / Advertisement ----
  const activityLogs = await prisma.activityLog.findMany();
  console.log(`ActivityLog: ${activityLogs.length}`);
  counts.activityLogs = activityLogs.length;
  if (!DRY_RUN) {
    for (const a of activityLogs) {
      await db.collection('activityLogs').doc(a.id).set({
        shopId: a.shopId, userId: a.userId, action: a.action, details: a.details, ipAddress: a.ipAddress,
        createdAt: a.createdAt.getTime(),
      });
    }
  }

  const notifications = await prisma.notification.findMany();
  console.log(`Notification: ${notifications.length}`);
  counts.notifications = notifications.length;
  if (!DRY_RUN) {
    for (const n of notifications) {
      await db.collection('notifications').doc(n.id).set({
        shopId: n.shopId, title: n.title, message: n.message, type: n.type, audience: n.audience, isRead: n.isRead,
        createdAt: n.createdAt.getTime(),
      });
    }
  }

  const revenueRecords = await prisma.revenueRecord.findMany();
  console.log(`RevenueRecord: ${revenueRecords.length}`);
  counts.revenueRecords = revenueRecords.length;
  if (!DRY_RUN) {
    for (const r of revenueRecords) {
      await db.collection('revenueRecords').doc(r.id).set({
        month: r.month, year: r.year, amount: r.amount, notes: r.notes,
        createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
      });
    }
  }

  const platformConfig = await prisma.platformConfig.findUnique({ where: { id: 'default' } });
  console.log(`PlatformConfig: ${platformConfig ? 1 : 0}`);
  counts.platformConfig = platformConfig ? 1 : 0;
  if (!DRY_RUN && platformConfig) {
    await platformConfigSvc.update({
      whatsapp: platformConfig.whatsapp,
      videos: platformConfig.videos as any,
      subscriptionPrice: platformConfig.subscriptionPrice,
      gstPercent: platformConfig.gstPercent,
      email: platformConfig.email,
      customerCareNumber: platformConfig.customerCareNumber,
      trialDays: platformConfig.trialDays,
    });
  }

  const contactMessages = await prisma.contactMessage.findMany();
  console.log(`ContactMessage: ${contactMessages.length}`);
  counts.contactMessages = contactMessages.length;
  if (!DRY_RUN) {
    for (const m of contactMessages) {
      await db.collection('contactMessages').doc(m.id).set({
        name: m.name, email: m.email, message: m.message, isRead: m.isRead, createdAt: m.createdAt.getTime(),
      });
    }
  }

  const advertisements = await prisma.advertisement.findMany();
  console.log(`Advertisement: ${advertisements.length}`);
  counts.advertisements = advertisements.length;
  if (!DRY_RUN) {
    for (const a of advertisements) {
      await db.collection('advertisements').doc(a.id).set({
        title: a.title, imageUrl: a.imageUrl, type: a.type, startDate: a.startDate.getTime(), endDate: a.endDate.getTime(),
        priority: a.priority, targetAll: a.targetAll, targetShops: a.targetShops,
        createdAt: a.createdAt.getTime(), updatedAt: a.updatedAt.getTime(),
      });
    }
  }

  console.log('\n=== Summary ===');
  console.log(counts);
  console.log(DRY_RUN ? '\nThis was a DRY RUN - nothing was written. Run --test-user-import first, then --confirm for the real migration.' : '\nDone.');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
