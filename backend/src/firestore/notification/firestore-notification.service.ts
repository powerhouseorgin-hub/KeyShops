import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';

// Firestore port of NotificationService. The old `OR: [{shopId}, {shopId:
// null, audience:'SHOP'}]` (flagged during planning as a hard-to-port
// pattern) is resolved by just running two separate queries and merging
// client-side, rather than fighting Firestore's more restricted OR-query
// rules for a two-query-sized problem - simpler and needs no extra
// composite index.
@Injectable()
export class FirestoreNotificationService {
  constructor(private readonly firestore: FirestoreService) {}

  private col() {
    return this.firestore.db.collection('notifications');
  }

  async getNotifications(shopId: string) {
    const [ownSnap, globalSnap] = await Promise.all([
      this.col().where('shopId', '==', shopId).orderBy('createdAt', 'desc').limit(50).get(),
      this.col().where('shopId', '==', null).where('audience', '==', 'SHOP').orderBy('createdAt', 'desc').limit(50).get(),
    ]);
    const merged = [...ownSnap.docs, ...globalSnap.docs]
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    return merged;
  }

  async markAsRead(shopId: string, id: string) {
    const doc = await this.col().doc(id).get();
    const data = doc.data() as any;
    const belongsToRequester = doc.exists && (data.shopId === shopId || (data.shopId === null && data.audience === 'SHOP'));
    if (!belongsToRequester) throw new NotFoundException('Notification not found');
    await this.col().doc(id).update({ isRead: true });
    return { id, ...data, isRead: true };
  }

  async getSuperNotifications() {
    const snap = await this.col().where('shopId', '==', null).orderBy('createdAt', 'desc').limit(50).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async markSuperAsRead(id: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists || (doc.data() as any).shopId !== null) throw new NotFoundException('Notification not found');
    await this.col().doc(id).update({ isRead: true });
    return { id, ...doc.data(), isRead: true };
  }

  async createNotification(title: string, message: string, type: string, shopId?: string, audience: 'SHOP' | 'SUPER_ADMIN' = 'SHOP') {
    const data = { title, message, type, shopId: shopId || null, audience, isRead: false, createdAt: Date.now() };
    const ref = await this.col().add(data);
    return { id: ref.id, ...data };
  }
}
