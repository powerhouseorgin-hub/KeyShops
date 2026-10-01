import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';

// masterKeys/{autoId} - kept as a TOP-LEVEL flat collection (not a
// shops/{shopId}/masterKeys subcollection) because, unlike Customer, it has
// a genuine "no shop" case: shopId: null means a global catalog entry
// (Super Admin's cross-shop Master Key Catalogue mixes shop-owned and
// global rows in one view). A subcollection has nowhere to put a
// shopId:null row, so this mirrors the old nullable-FK column instead.
//
// The old @@unique([shopId, keyNumber]) becomes a deterministic doc ID:
// `${shopId ?? 'GLOBAL'}_${keyNumber}` - uniqueness is then just "it's the
// doc ID", no transaction/query needed to enforce it.
export interface MasterKeyDoc {
  keyNumber: string;
  category: string;
  backImageUrl: string | null;
  shopId: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class MasterKeyRepository {
  constructor(private readonly firestore: FirestoreService) {}

  private col() {
    return this.firestore.db.collection('masterKeys');
  }

  static docId(shopId: string | null, keyNumber: string): string {
    return `${shopId ?? 'GLOBAL'}_${keyNumber}`;
  }

  async findByKeyNumber(shopId: string | null, keyNumber: string) {
    const doc = await this.col().doc(MasterKeyRepository.docId(shopId, keyNumber)).get();
    if (!doc.exists) return null;
    const data = doc.data() as MasterKeyDoc;
    if (data.deletedAt) return null;
    return { id: doc.id, ...data };
  }

  docRef(shopId: string | null, keyNumber: string) {
    return this.col().doc(MasterKeyRepository.docId(shopId, keyNumber));
  }
}
