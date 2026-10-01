import { Injectable, ConflictException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FirestoreService } from '../firestore.service';

// users/{uid} - doc ID is the Firebase Auth UID (set by AuthService after
// creating the Firebase Auth user; this repository never creates Auth
// users itself, only the Firestore profile doc alongside one).
//
// email/phone uniqueness (Postgres' `@unique` on both, nullable) has no
// Firestore-native equivalent, so it's enforced via two lookup collections
// written in the SAME transaction as the user doc - see registerUser().
// This is the exact same guarantee the DB gave for free before: either
// both index docs + the user doc land, or none of them do.
export type Role = 'SUPER_ADMIN' | 'SHOP_ADMIN';

export interface UserDoc {
  email: string | null;
  phone: string | null;
  name: string;
  role: Role;
  shopId: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class UserRepository {
  constructor(private readonly firestore: FirestoreService) {}

  private get db(): Firestore {
    return this.firestore.db;
  }

  users() {
    return this.db.collection('users');
  }

  private emailIndex(email: string) {
    return this.db.collection('emailIndex').doc(email.toLowerCase());
  }

  private phoneIndex(phone: string) {
    return this.db.collection('phoneIndex').doc(phone);
  }

  async findByEmailOrPhone(identifier: string): Promise<(UserDoc & { id: string }) | null> {
    // Login accepts either identifier - try phone index first (numeric,
    // cheaper to rule out), then email index.
    const phoneDoc = await this.phoneIndex(identifier).get();
    const uid = phoneDoc.exists ? (phoneDoc.data() as any).uid : (await this.emailIndex(identifier).get()).data()?.uid;
    if (!uid) return null;
    const userDoc = await this.users().doc(uid).get();
    if (!userDoc.exists) return null;
    return { id: userDoc.id, ...(userDoc.data() as UserDoc) };
  }

  // Call within an existing transaction (e.g. registerShop's) so the user
  // doc and its uniqueness index docs commit atomically alongside whatever
  // else that transaction is doing (shop, subscription, etc.).
  async createInTransaction(tx: Transaction, uid: string, data: Omit<UserDoc, 'deletedAt' | 'createdAt' | 'updatedAt'>): Promise<void> {
    if (data.email) {
      const existing = await tx.get(this.emailIndex(data.email));
      if (existing.exists) throw new ConflictException('This email address is already registered to another shop');
    }
    if (data.phone) {
      const existing = await tx.get(this.phoneIndex(data.phone));
      if (existing.exists) throw new ConflictException('This mobile number is already registered to another shop');
    }
    const now = Date.now();
    tx.set(this.users().doc(uid), { ...data, deletedAt: null, createdAt: now, updatedAt: now });
    if (data.email) tx.set(this.emailIndex(data.email), { uid });
    if (data.phone) tx.set(this.phoneIndex(data.phone), { uid });
  }

  async findById(uid: string): Promise<(UserDoc & { id: string }) | null> {
    const doc = await this.users().doc(uid).get();
    if (!doc.exists) return null;
    const data = doc.data() as UserDoc;
    if (data.deletedAt) return null;
    return { id: doc.id, ...data };
  }
}
