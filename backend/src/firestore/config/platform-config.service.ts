import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';

// Maps Prisma's PlatformConfig singleton (fixed id: 'default') onto a single
// Firestore document - the simplest possible translation, no repository
// base needed (no soft-delete, no list queries).
const DOC_PATH = ['config', 'platform'] as const;

export interface PlatformConfigData {
  whatsapp: string;
  videos: { name: string; url: string }[];
  subscriptionPrice: number;
  gstPercent: number;
  email: string | null;
  customerCareNumber: string | null;
  trialDays: number;
}

const DEFAULTS: PlatformConfigData = {
  whatsapp: '+91 98765 43210',
  videos: [],
  subscriptionPrice: 999,
  gstPercent: 18,
  email: null,
  customerCareNumber: null,
  trialDays: 14,
};

@Injectable()
export class PlatformConfigService {
  constructor(private readonly firestore: FirestoreService) {}

  private docRef() {
    return this.firestore.db.collection(DOC_PATH[0]).doc(DOC_PATH[1]);
  }

  async get(): Promise<PlatformConfigData> {
    const doc = await this.docRef().get();
    if (!doc.exists) return DEFAULTS;
    return { ...DEFAULTS, ...(doc.data() as Partial<PlatformConfigData>) };
  }

  async update(data: Partial<PlatformConfigData>): Promise<PlatformConfigData> {
    await this.docRef().set(data, { merge: true });
    return this.get();
  }
}
