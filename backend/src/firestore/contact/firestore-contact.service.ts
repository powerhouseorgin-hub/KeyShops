import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { FirestoreNotificationService } from '../notification/firestore-notification.service';

@Injectable()
export class FirestoreContactService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly notifications: FirestoreNotificationService,
  ) {}

  private col() {
    return this.firestore.db.collection('contactMessages');
  }

  async createMessage(dto: { name: string; email: string; message: string }) {
    const now = Date.now();
    const data = { name: dto.name, email: dto.email, message: dto.message, isRead: false, createdAt: now };
    await this.col().add(data);

    const preview = dto.message.length > 100 ? `${dto.message.slice(0, 100)}…` : dto.message;
    await this.notifications.createNotification(
      'New Contact Us Message',
      `${dto.name} (${dto.email}): ${preview}`,
      'CONTACT_SUBMISSION',
      undefined,
      'SUPER_ADMIN',
    );
    return { success: true };
  }

  // Cursor pagination instead of page/skip - same adjustment as
  // FirestoreActivityLogService, same reason (no Firestore offset support).
  async getMessages(params: { limit: number; cursor?: string }) {
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    let q = this.col().orderBy('createdAt', 'desc').limit(limit + 1) as FirebaseFirestore.Query;
    if (params.cursor) {
      const cursorDoc = await this.col().doc(params.cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }
    const snap = await q.get();
    const hasMore = snap.docs.length > limit;
    const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    return {
      items: page.map((d) => ({ id: d.id, ...d.data() })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async markAsRead(id: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists) throw new NotFoundException('Message not found');
    await doc.ref.update({ isRead: true });
    return { id, ...doc.data(), isRead: true };
  }
}
