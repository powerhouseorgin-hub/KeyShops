import { Injectable } from '@nestjs/common';
import { AggregateField } from 'firebase-admin/firestore';
import { FirestoreService } from '../firestore.service';
import { PlatformConfigService } from '../config/platform-config.service';
import { TtlCache } from '../../common/ttl-cache';

// Firestore port of ReportService's two dashboard aggregation endpoints.
// Two structural gaps from the Prisma/SQL originals, both disclosed rather
// than silently worked around:
//
// 1. `collectionGroup('documents')` ambiguity - CustomerDocument
//    (shops/{id}/customers/{id}/documents/{id}) and ShopDocument
//    (shops/{id}/documents/{id}) are BOTH named "documents" as their last
//    path segment, and Firestore's collectionGroup queries match on that
//    name alone regardless of nesting depth - a naive collectionGroup query
//    would silently mix the two together. Disambiguated here by filtering
//    `deletedAt == null`: CustomerDocument rows always carry that field
//    (even when not deleted, it's set to null); ShopDocument rows never
//    have it at all (see ShopService's hard-delete convention for that
//    collection), so Firestore's equality filter naturally excludes them.
// 2. "Popular keys" (originally a SQL GROUP BY over the whole Customer
//    table) and the Shop Dashboard's 6-month registration trend
//    (originally a raw SQL date-bucketed GROUP BY) have no Firestore
//    equivalent without either maintained counter documents (a real Cloud
//    Functions build-out, called out as separate future work in the
//    migration plan) or fetching and aggregating in application code. This
//    fetches a capped, bounded batch and aggregates in memory - correct at
//    this app's current data volume, but an approximation that would need
//    the counter-document approach if the platform-wide customer/key volume
//    grows large enough that a capped fetch stops being representative.
const DASHBOARD_CACHE_TTL_MS = 30 * 1000;
const dashboardCache = new TtlCache<any>(50);
const POPULAR_KEYS_SAMPLE_CAP = 2000;

@Injectable()
export class FirestoreDashboardService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  private get db() {
    return this.firestore.db;
  }

  async getSuperDashboard() {
    const cached = dashboardCache.get('super');
    if (cached) return cached;

    const now = Date.now();
    const in10Days = now + 10 * 24 * 60 * 60 * 1000;

    const [
      totalShopsSnap,
      activeShopsSnap,
      totalCustomersSnap,
      totalDocumentsSnap,
      storageSumSnap,
      popularKeysSample,
      expiringSubsSnap,
      recentRevenueSnap,
      platformConfig,
      subscriptionCountSnap,
    ] = await Promise.all([
      this.db.collection('shops').count().get(),
      this.db.collection('shops').where('isActive', '==', true).count().get(),
      this.db.collectionGroup('customers').count().get(),
      this.db.collectionGroup('documents').where('deletedAt', '==', null).count().get(),
      this.db.collection('shops').aggregate({ totalStorage: AggregateField.sum('storageUsed') }).get(),
      this.db.collectionGroup('customers').where('keyNumber', '!=', null).limit(POPULAR_KEYS_SAMPLE_CAP).get(),
      this.db.collectionGroup('subscriptions').where('status', '==', 'ACTIVE').where('endDate', '>=', now).where('endDate', '<=', in10Days).get(),
      this.db.collection('revenueRecords').orderBy('year', 'desc').orderBy('month', 'desc').limit(6).get(),
      this.platformConfig.get(),
      this.db.collectionGroup('subscriptions').count().get(),
    ]);

    const totalShops = totalShopsSnap.data().count;
    const activeShops = activeShopsSnap.data().count;
    const popularKeys = topKeyNumbers(popularKeysSample.docs.map((d) => (d.data() as any).keyNumber), 5);

    const shopIds = [...new Set(expiringSubsSnap.docs.map((d) => d.ref.parent.parent!.id))];
    const shopDocs = shopIds.length ? await this.db.getAll(...shopIds.map((id) => this.db.collection('shops').doc(id))) : [];
    const shopNameMap = new Map(shopDocs.filter((d) => d.exists).map((d) => [d.id, (d.data() as any).name]));

    const subscriptionCount = subscriptionCountSnap.data().count;
    const subscriptionPrice = platformConfig.subscriptionPrice ?? 999;

    const result = {
      shops: { total: totalShops, active: activeShops, inactive: totalShops - activeShops },
      stats: {
        customers: totalCustomersSnap.data().count,
        documents: totalDocumentsSnap.data().count,
        storageUsed: (storageSumSnap.data().totalStorage as number) || 0,
      },
      popularKeys,
      expiringSubscriptions: expiringSubsSnap.docs.map((d) => {
        const data = d.data() as any;
        const shopId = d.ref.parent.parent!.id;
        return { id: d.id, shopId, shopName: shopNameMap.get(shopId) || null, plan: data.plan, endDate: data.endDate };
      }),
      revenue: recentRevenueSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      subscriptionRevenue: subscriptionCount * subscriptionPrice,
    };
    dashboardCache.set('super', result, DASHBOARD_CACHE_TTL_MS);
    return result;
  }

  async getShopDashboard(shopId: string) {
    const shopRef = this.db.collection('shops').doc(shopId);
    const customers = shopRef.collection('customers');
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const [
      todayCountSnap,
      totalCountSnap,
      recentCustomersSnap,
      keySampleSnap,
      subSnap,
      monthlyCounts,
    ] = await Promise.all([
      customers.where('createdAt', '>=', todayStart.getTime()).where('createdAt', '<=', todayEnd.getTime()).count().get(),
      customers.count().get(),
      customers.orderBy('createdAt', 'desc').limit(5).get(),
      customers.where('keyNumber', '!=', null).limit(POPULAR_KEYS_SAMPLE_CAP).get(),
      shopRef.collection('subscriptions').where('status', '==', 'ACTIVE').orderBy('createdAt', 'desc').limit(1).get(),
      // Registrations per calendar month for the last 6 months. One count() aggregation per month
      // instead of downloading every customer document of the period (a busy shop has thousands, and each
      // carries personal data) just to tally them - cost is 6 small aggregation reads, whatever the volume.
      Promise.all(
        Array.from({ length: 6 }, (_, k) => {
          const monthsBack = 5 - k;
          const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
          const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
          return customers
            .where('createdAt', '>=', start.getTime())
            .where('createdAt', '<', end.getTime())
            .count()
            .get()
            .then((snap) => ({
              month: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
              count: snap.data().count,
            }));
        }),
      ),
    ]);

    const popularKeys = topKeyNumbers(keySampleSnap.docs.map((d) => (d.data() as any).keyNumber), 5);

    const monthlyStats = monthlyCounts;

    let subscription: any = null;
    if (!subSnap.empty) {
      const sub = subSnap.docs[0].data() as any;
      const daysRemaining = Math.max(0, Math.ceil((sub.endDate - Date.now()) / (1000 * 60 * 60 * 24)));
      subscription = { plan: sub.plan, endDate: sub.endDate, daysRemaining, status: sub.status };
    }

    return {
      todayCustomers: todayCountSnap.data().count,
      totalCustomers: totalCountSnap.data().count,
      recentCustomers: recentCustomersSnap.docs.map((d) => {
        const c = d.data() as any;
        return { id: d.id, name: c.name, phone: c.phone, keyNumber: c.keyNumber, vehicleNumber: c.vehicleNumber || null, capturedAddress: c.capturedAddress || null, createdAt: c.createdAt };
      }),
      popularKeys,
      monthlyStats,
      subscription,
    };
  }
}

function topKeyNumbers(keyNumbers: (string | null | undefined)[], limit: number) {
  const counts = new Map<string, number>();
  for (const k of keyNumbers) {
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyNumber, count]) => ({ keyNumber, count }));
}
