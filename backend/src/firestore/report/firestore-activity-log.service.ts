import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';

// Firestore port of ReportService.getActivityLog. Two things changed from
// the original, both noted in the migration plan:
// 1. Offset pagination (page/skip) has no Firestore equivalent - switched
//    to cursor pagination (same nextCursor shape every other list view in
//    this app already uses) instead of page numbers. The frontend's
//    Activity Log screen will need the small adjustment from a page-number
//    control to "Load more" - same UX every other paginated screen here
//    already has.
// 2. Prisma's `include` (user/shop names) has no join equivalent - resolved
//    with a batched Admin SDK getAll() over the unique user/shop ids in the
//    fetched page, instead of denormalizing those fields onto every
//    ActivityLog write site (would touch every place that creates one).
@Injectable()
export class FirestoreActivityLogService {
  constructor(private readonly firestore: FirestoreService) {}

  private col() {
    return this.firestore.db.collection('activityLogs');
  }

  async getActivityLog(params: { limit: number; cursor?: string; shopId?: string; action?: string }) {
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    let q = this.col() as FirebaseFirestore.Query;

    if (params.shopId) q = q.where('shopId', '==', params.shopId);
    if (params.action) {
      q = q.where('action', '==', params.action);
    } else {
      // Matches the old default: LOGIN excluded unless explicitly requested.
      q = q.where('action', '!=', 'LOGIN');
    }
    q = q.orderBy('action').orderBy('createdAt', 'desc').limit(limit + 1);
    if (params.cursor) {
      const cursorDoc = await this.col().doc(params.cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > limit;
    const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const rows = page.map((d) => ({ id: d.id, ...d.data() }) as any);

    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    const shopIds = [...new Set(rows.map((r) => r.shopId).filter(Boolean))];
    const [userDocs, shopDocs] = await Promise.all([
      userIds.length ? this.firestore.db.getAll(...userIds.map((id) => this.firestore.db.collection('users').doc(id))) : [],
      shopIds.length ? this.firestore.db.getAll(...shopIds.map((id) => this.firestore.db.collection('shops').doc(id))) : [],
    ]);
    const userMap = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as any]));
    const shopMap = new Map(shopDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as any]));

    const items = rows.map((r) => ({
      ...r,
      user: userMap.has(r.userId) ? { name: userMap.get(r.userId).name, email: userMap.get(r.userId).email, phone: userMap.get(r.userId).phone, role: userMap.get(r.userId).role } : null,
      shop: r.shopId && shopMap.has(r.shopId) ? { name: shopMap.get(r.shopId).name } : null,
    }));

    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }
}
