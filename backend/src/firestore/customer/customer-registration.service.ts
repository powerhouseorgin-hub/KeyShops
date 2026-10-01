import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { ShopRepository } from '../shop/shop.repository';
import { MasterKeyRepository } from './master-key.repository';

export interface CreateCustomerInput {
  shopId: string;
  actorUserId: string;
  name: string;
  phone: string;
  address?: string;
  idProofType?: string;
  idProofNumber?: string; // already encrypted by the caller (CryptoService), same as before
  reason?: string;
  keyNumber?: string;
  keyType?: string;
  vehicleNumber?: string;
  latitude?: number;
  longitude?: number;
  mapsLink?: string;
  capturedAddress?: string;
  billAmount?: number;
  billNumber?: string;
  vehicleName?: string;
  lostKey?: boolean;
  addKey?: boolean;
  homeOfficeName?: string;
  vehicleCategory?: string;
}

// Firestore counterpart to CustomerService.createCustomer's $transaction -
// upserts a shop-scoped MasterKey catalog entry (find-or-create by the
// deterministic doc ID, see MasterKeyRepository), then creates the
// Customer (as a shops/{shopId}/customers subcollection doc), an
// ActivityLog row, and a Notification, all atomically - same "never end up
// with a customer pointing at a missing key" guarantee the old Prisma
// transaction gave.
@Injectable()
export class CustomerRegistrationService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly shops: ShopRepository,
    private readonly masterKeys: MasterKeyRepository,
  ) {}

  async createCustomer(input: CreateCustomerInput): Promise<{ customerId: string; masterKeyId: string | null }> {
    const db = this.firestore.db;
    const customerRef = this.shops.customers(input.shopId).doc();
    const masterKeyRef = input.keyNumber ? this.masterKeys.docRef(input.shopId, input.keyNumber) : null;

    return db.runTransaction(async (tx) => {
      // ---- READS ----
      const masterKeySnap = masterKeyRef ? await tx.get(masterKeyRef) : null;

      // ---- WRITES ----
      const now = Date.now();
      let masterKeyId: string | null = null;
      if (masterKeyRef && input.keyNumber) {
        masterKeyId = masterKeyRef.id;
        if (!masterKeySnap!.exists) {
          tx.set(masterKeyRef, {
            keyNumber: input.keyNumber,
            category: input.vehicleCategory || 'Other',
            backImageUrl: null,
            shopId: input.shopId,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Customer docs are unaddressable by ID alone once nested under
      // shops/{shopId}/customers/{id} - Firestore's collectionGroup queries
      // can't filter by documentId() without already knowing the full
      // parent path. A tiny lookup index (customerShopIndex/{customerId} ->
      // {shopId}) is the standard fix, same pattern as emailIndex/phoneIndex
      // - used by Super Admin's cross-shop document/report upload endpoints
      // (see CustomerFilesService), which only ever receive a bare
      // customerId.
      tx.set(db.collection('customerShopIndex').doc(customerRef.id), { shopId: input.shopId });

      tx.set(customerRef, {
        name: input.name,
        phone: input.phone,
        address: input.address || null,
        idProofType: input.idProofType || null,
        idProofNumber: input.idProofNumber || null,
        reason: input.reason || null,
        keyNumber: input.keyNumber || null,
        keyType: input.keyType || null,
        vehicleNumber: input.vehicleNumber || null,
        masterKeyId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        mapsLink: input.mapsLink || null,
        capturedAddress: input.capturedAddress || null,
        photoUrl: null,
        billAmount: input.billAmount ?? null,
        billNumber: input.billNumber || null,
        vehicleName: input.vehicleName || null,
        lostKey: input.lostKey ?? false,
        addKey: input.addKey ?? false,
        homeOfficeName: input.homeOfficeName || null,
        vehicleCategory: input.vehicleCategory || null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(db.collection('activityLogs').doc(), {
        shopId: input.shopId,
        userId: input.actorUserId,
        action: 'CUSTOMER_CREATE',
        details: JSON.stringify({ customerId: customerRef.id, name: input.name }),
        ipAddress: null,
        createdAt: now,
      });

      tx.set(db.collection('notifications').doc(), {
        shopId: input.shopId,
        title: 'New Customer Registered',
        message: `Customer "${input.name}" (Key: ${input.keyNumber || 'N/A'}) has been registered.`,
        type: 'CUSTOMER_REGISTRATION',
        audience: 'SHOP',
        isRead: false,
        createdAt: now,
      });

      return { customerId: customerRef.id, masterKeyId };
    });
  }
}
