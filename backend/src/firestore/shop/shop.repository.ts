import { Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreService } from '../firestore.service';
import { FirestoreRepository } from '../firestore-repository.base';

export interface ShopDoc {
  name: string;
  companyDetails: string | null;
  logoUrl: string | null;
  themeColor: string;
  isActive: boolean;
  storageUsed: number;
  aadhaarNumber: string | null;
  latitude: number | null;
  longitude: number | null;
  town: string | null;
  district: string | null;
  categoryId: string | null;
  referralCode: string | null;
  referredByCode: string | null;
  referralPoints: number;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class ShopRepository extends FirestoreRepository<ShopDoc> {
  constructor(private readonly firestore: FirestoreService) {
    super();
  }

  protected collection() {
    return this.firestore.db.collection('shops') as FirebaseFirestore.CollectionReference<ShopDoc>;
  }

  get db(): Firestore {
    return this.firestore.db;
  }

  // referralCode doubles as a shop's registered phone number, already
  // unique via phoneIndex - a direct doc-ID lookup would be nicer, but
  // referralCode isn't the doc ID (shopId is), so this stays a query.
  // Low cardinality/low frequency (only hit when someone enters a referral
  // code at signup), so an indexed equality query is fine.
  async findByReferralCode(code: string) {
    const snap = await this.collection().where('referralCode', '==', code).where('deletedAt', '==', null).limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  // shops/{shopId}/subscriptions/{subId}
  subscriptions(shopId: string) {
    return this.db.collection('shops').doc(shopId).collection('subscriptions');
  }

  // shops/{shopId}/customers/{customerId}
  customers(shopId: string) {
    return this.db.collection('shops').doc(shopId).collection('customers');
  }

  // shops/{shopId}/documents/{docId} (ShopDocument - photo/license/Aadhaar)
  documents(shopId: string) {
    return this.db.collection('shops').doc(shopId).collection('documents');
  }
}
