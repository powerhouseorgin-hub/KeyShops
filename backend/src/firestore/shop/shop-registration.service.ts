import { Injectable, BadRequestException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { ShopRepository } from './shop.repository';
import { UserRepository } from './user.repository';
import { PlatformConfigService } from '../config/platform-config.service';
import { CryptoService } from '../../crypto/crypto.service';

export interface RegisterShopInput {
  uid: string; // Firebase Auth UID, created by the caller (FirestoreAuthController) before this runs
  shopName: string;
  ownerName: string;
  email?: string;
  phone: string;
  location: string;
  town?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  categoryId: string;
  aadhaarNumber?: string;
  referralCode?: string;
  startTrial?: boolean;
}

// Shop registration as one atomic Firestore transaction: Shop + User + Subscription + Referral, with a
// trial-or-paid branch. Payment verification (Razorpay) and the free-trial decision stay the CALLER's job (the
// payment gate runs before the transaction) - this only owns the atomic write.
//
// Firestore transactions require ALL reads before ANY writes, so every
// existence/uniqueness check below runs first, then every write happens
// in the callback's second half.
@Injectable()
export class ShopRegistrationService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly shops: ShopRepository,
    private readonly users: UserRepository,
    private readonly platformConfig: PlatformConfigService,
    private readonly crypto: CryptoService,
  ) {}

  async registerShop(input: RegisterShopInput): Promise<{ shopId: string; plan: 'TRIAL' | 'YEARLY'; endDate: number }> {
    const db = this.firestore.db;
    const shopRef = db.collection('shops').doc();
    const emailIndexRef = input.email ? db.collection('emailIndex').doc(input.email.toLowerCase()) : null;
    const phoneIndexRef = db.collection('phoneIndex').doc(input.phone);
    const referralIndexRef = input.referralCode ? null : null; // resolved inside the transaction (needs a read first)
    const categoryRef = db.collection('shopCategories').doc(input.categoryId);
    const platformConfigRef = db.collection('config').doc('platform');

    return db.runTransaction(async (tx) => {
      // ---- READS (all of them, before any write) ----
      const [emailIndexSnap, phoneIndexSnap, categorySnap, platformConfigSnap] = await Promise.all([
        emailIndexRef ? tx.get(emailIndexRef) : Promise.resolve(null),
        tx.get(phoneIndexRef),
        tx.get(categoryRef),
        tx.get(platformConfigRef),
      ]);

      if (emailIndexSnap?.exists) {
        throw new BadRequestException('This email address is already registered to another shop');
      }
      if (phoneIndexSnap.exists) {
        throw new BadRequestException('This mobile number is already registered to another shop');
      }
      if (!categorySnap.exists || (categorySnap.data() as any).deletedAt) {
        throw new BadRequestException('Please select a valid shop category');
      }

      let referrerSnap: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      if (input.referralCode) {
        const enteredCode = input.referralCode.replace(/\D/g, '').slice(-10);
        const referrerQuery = await tx.get(
          db.collection('shops').where('referralCode', '==', enteredCode).where('deletedAt', '==', null).limit(1),
        );
        if (referrerQuery.empty) throw new BadRequestException('Invalid referral code');
        referrerSnap = referrerQuery.docs[0];
        const referrerData = referrerSnap.data();
        if (referrerData.referralCode === input.phone) {
          throw new BadRequestException('You cannot use your own referral code');
        }
      }

      // ---- WRITES ----
      const now = Date.now();
      const platformConfig = platformConfigSnap.exists ? (platformConfigSnap.data() as any) : {};
      const trialDays = platformConfig.trialDays ?? 14;
      const subscriptionPrice = platformConfig.subscriptionPrice ?? 999;

      tx.set(shopRef, {
        name: input.shopName,
        themeColor: '#8C24FF',
        isActive: true,
        storageUsed: 0,
        companyDetails: JSON.stringify({ address: input.location || 'Pending registration details', gst: 'Pending', phone: input.phone }),
        // Encrypted at rest - this must never be stored (or copied into the Algolia index) as a plain
        // 12-digit number.
        aadhaarNumber: input.aadhaarNumber ? this.crypto.encrypt(input.aadhaarNumber) : null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        town: input.town || null,
        district: input.district || null,
        categoryId: input.categoryId,
        referralCode: input.phone,
        referredByCode: referrerSnap ? referrerSnap.data().referralCode : null,
        referralPoints: 0,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(db.collection('users').doc(input.uid), {
        email: input.email || null,
        phone: input.phone,
        name: input.ownerName,
        role: 'SHOP_ADMIN',
        shopId: shopRef.id,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      if (emailIndexRef) tx.set(emailIndexRef, { uid: input.uid });
      tx.set(phoneIndexRef, { uid: input.uid });

      const subEndDate = new Date(now);
      const plan: 'TRIAL' | 'YEARLY' = input.startTrial ? 'TRIAL' : 'YEARLY';
      if (input.startTrial) {
        subEndDate.setDate(subEndDate.getDate() + trialDays);
      } else {
        subEndDate.setFullYear(subEndDate.getFullYear() + 1);
      }
      const subRef = shopRef.collection('subscriptions').doc();
      tx.set(subRef, {
        plan,
        status: 'ACTIVE',
        startDate: now,
        endDate: subEndDate.getTime(),
        createdAt: now,
        updatedAt: now,
      });

      if (!input.startTrial) {
        const revenueRef = db.collection('revenueRecords').doc();
        tx.set(revenueRef, {
          month: new Date(now).getMonth() + 1,
          year: new Date(now).getFullYear(),
          amount: subscriptionPrice,
          notes: `Revenue generated from a new Shop Account subscription — ${input.shopName}.`,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (referrerSnap) {
        tx.update(referrerSnap.ref, { referralPoints: (referrerSnap.data().referralPoints || 0) + 1, updatedAt: now });
        tx.set(db.collection('referrals').doc(shopRef.id), {
          referrerShopId: referrerSnap.id,
          referredShopId: shopRef.id,
          pointsAwarded: 1,
          createdAt: now,
        });
      }

      // ActivityLog stays a flat top-level collection (not a shop
      // subcollection) - unlike Customer/MasterKey/etc, it also needs to
      // hold shopId: null "global" Super Admin actions, which wouldn't fit
      // under any one shop's subcollection. Shop Admin's own view filters
      // `where('shopId','==',shopId)`; Super Admin's cross-shop view reads
      // the collection unfiltered.
      tx.set(db.collection('activityLogs').doc(), {
        shopId: shopRef.id,
        userId: input.uid,
        action: 'SHOP_REGISTERED',
        details: JSON.stringify({ message: `Shop "${input.shopName}" registered`, shopName: input.shopName }),
        ipAddress: null,
        createdAt: now,
      });

      return { shopId: shopRef.id, plan, endDate: subEndDate.getTime() };
    });
  }
}
