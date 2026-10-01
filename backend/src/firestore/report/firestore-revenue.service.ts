import { Injectable, BadRequestException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';

@Injectable()
export class FirestoreRevenueService {
  constructor(private readonly firestore: FirestoreService) {}

  private col() {
    return this.firestore.db.collection('revenueRecords');
  }

  async logRevenue(month: number, year: number, amount: number, notes?: string) {
    if (month < 1 || month > 12) throw new BadRequestException('Month must be between 1 and 12');
    const now = Date.now();
    const existingSnap = await this.col().where('month', '==', month).where('year', '==', year).limit(1).get();
    if (!existingSnap.empty) {
      const doc = existingSnap.docs[0];
      await doc.ref.update({ amount, notes, updatedAt: now });
      return { id: doc.id, ...doc.data(), amount, notes, updatedAt: now };
    }
    const data = { month, year, amount, notes: notes || null, createdAt: now, updatedAt: now };
    const ref = await this.col().add(data);
    return { id: ref.id, ...data };
  }

  async getRevenueRecords() {
    const snap = await this.col().orderBy('year', 'desc').orderBy('month', 'desc').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}
