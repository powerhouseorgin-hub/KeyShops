import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { UpdateSupportConfigDto } from './dto/update-support-config.dto';
import { TtlCache } from '../common/ttl-cache';

const SUPPORT_CONFIG_CACHE_KEY = 'default';
const SUPPORT_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min safety-net TTL; updateSupportConfig invalidates immediately

const DASHBOARD_CACHE_KEY = 'default';
// No mutation anywhere invalidates this - the dashboard aggregates 10
// platform-wide counts/sums that change from dozens of unrelated mutations
// (new shop, new customer, revenue log, subscription change, etc.), so
// wiring explicit invalidation into all of them isn't worth it. A short TTL
// bounds staleness instead - same trade-off as the public ad carousel/shop
// directory caches (see AdService/ShopService).
const DASHBOARD_CACHE_TTL_MS = 30 * 1000;

@Injectable()
export class ReportService {
  private supportConfigCache = new TtlCache();
  private dashboardCache = new TtlCache();

  constructor(private readonly tenantService: TenantService) {}

  // ==========================================
  // SUPER ADMIN DASHBOARD
  // ==========================================
  async getSuperDashboard() {
    const cached = this.dashboardCache.get(DASHBOARD_CACHE_KEY);
    if (cached) return cached;

    const now = new Date();
    const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    // All of these queries are independent of one another (none needs another's
    // result), so they're fired concurrently via Promise.all instead of one
    // at a time - each round-trip to the DB adds real latency, and awaiting
    // them sequentially was making this endpoint take as long as the sum of
    // all 9 queries instead of the slowest one.
    const [
      totalShops,
      activeShops,
      totalCustomers,
      totalDocuments,
      shopsStorage,
      popularKeysRaw,
      expiringSubscriptions,
      recentRevenue,
      platformConfig,
      subscriptionCount,
    ] = await Promise.all([
      this.tenantService.prisma.shop.count(),
      this.tenantService.prisma.shop.count({ where: { isActive: true } }),
      this.tenantService.prisma.customer.count(),
      this.tenantService.prisma.customerDocument.count(),
      this.tenantService.prisma.shop.aggregate({ _sum: { storageUsed: true } }),
      this.tenantService.prisma.customer.groupBy({
        by: ['keyNumber'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      this.tenantService.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { gte: now, lte: in10Days },
        },
        include: {
          shop: { select: { name: true } },
        },
      }),
      this.tenantService.prisma.revenueRecord.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 6,
      }),
      this.tenantService.prisma.platformConfig.findUnique({ where: { id: 'default' } }),
      this.tenantService.prisma.subscription.count(),
    ]);

    const inactiveShops = totalShops - activeShops;
    const totalStorageBytes = Number(shopsStorage._sum.storageUsed || 0);
    const popularKeys = popularKeysRaw.map(item => ({
      keyNumber: item.keyNumber,
      count: item._count.id,
    }));
    const subscriptionPrice = platformConfig?.subscriptionPrice ?? 999;
    const subscriptionTotal = subscriptionCount * subscriptionPrice;

    const result = {
      shops: {
        total: totalShops,
        active: activeShops,
        inactive: inactiveShops,
      },
      stats: {
        customers: totalCustomers,
        documents: totalDocuments,
        storageUsed: totalStorageBytes,
      },
      popularKeys,
      expiringSubscriptions: expiringSubscriptions.map(s => ({
        id: s.id,
        shopId: s.shopId,
        shopName: s.shop.name,
        plan: s.plan,
        endDate: s.endDate,
      })),
      revenue: recentRevenue,
      subscriptionRevenue: subscriptionTotal,
    };
    this.dashboardCache.set(DASHBOARD_CACHE_KEY, result, DASHBOARD_CACHE_TTL_MS);
    return result;
  }

  // Log manual revenue record
  async logRevenue(month: number, year: number, amount: number, notes?: string) {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }
    const existing = await this.tenantService.prisma.revenueRecord.findFirst({
      where: { month, year },
    });

    if (existing) {
      return this.tenantService.prisma.revenueRecord.update({
        where: { id: existing.id },
        data: { amount, notes },
      });
    }

    return this.tenantService.prisma.revenueRecord.create({
      data: { month, year, amount, notes },
    });
  }

  // Get all revenue records
  async getRevenueRecords() {
    return this.tenantService.prisma.revenueRecord.findMany({
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
      ],
    });
  }

  // ==========================================
  // SHOP ADMIN DASHBOARD
  // ==========================================
  async getShopDashboard(shopId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Independent queries fired concurrently instead of one at a time - see
    // the same fix/rationale in getSuperDashboard() above.
    const [
      todayCustomers,
      totalCustomers,
      recentCustomers,
      popularKeysRaw,
      subscription,
      monthlyRaw,
    ] = await Promise.all([
      this.tenantService.prisma.customer.count({
        where: { shopId, createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      this.tenantService.prisma.customer.count({ where: { shopId } }),
      this.tenantService.prisma.customer.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.tenantService.prisma.customer.groupBy({
        by: ['keyNumber'],
        where: { shopId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      this.tenantService.prisma.subscription.findFirst({
        where: { shopId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }),
      // Aggregated in SQL rather than fetching every matching row over the
      // network just to bucket it in JS - a growing shop's registration
      // history over 6 months would otherwise mean an ever-larger row-set
      // pulled across a cross-region connection on every dashboard load,
      // just to compute at most 6 numbers. $queryRaw bypasses
      // TenantService's auto soft-delete filter (it only hooks Prisma's own
      // query methods, not raw SQL), so "deletedAt" IS NULL is explicit here.
      this.tenantService.prisma.$queryRaw<{ year: number; month: number; count: bigint }[]>`
        SELECT EXTRACT(YEAR FROM "createdAt")::int AS year, EXTRACT(MONTH FROM "createdAt")::int AS month, COUNT(*)::int AS count
        FROM "Customer"
        WHERE "shopId" = ${shopId} AND "createdAt" >= ${sixMonthsAgo} AND "deletedAt" IS NULL
        GROUP BY EXTRACT(YEAR FROM "createdAt"), EXTRACT(MONTH FROM "createdAt")
      `,
    ]);

    const popularKeys = popularKeysRaw.map(item => ({
      keyNumber: item.keyNumber,
      count: item._count.id,
    }));

    let daysRemaining = 0;
    if (subscription) {
      const diffTime = subscription.endDate.getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    const monthlyCounts: { [monthStr: string]: number } = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mName = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      monthlyCounts[mName] = 0;
    }

    monthlyRaw.forEach((row) => {
      const mName = new Date(row.year, row.month - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
      if (monthlyCounts[mName] !== undefined) {
        monthlyCounts[mName] += Number(row.count);
      }
    });

    const monthlyStats = Object.keys(monthlyCounts).map(month => ({
      month,
      count: monthlyCounts[month],
    }));

    return {
      todayCustomers,
      totalCustomers,
      recentCustomers: recentCustomers.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        keyNumber: c.keyNumber,
        vehicleNumber: c.vehicleNumber || null,
        capturedAddress: c.capturedAddress || null,
        createdAt: c.createdAt,
      })),
      popularKeys,
      monthlyStats,
      subscription: subscription ? {
        plan: subscription.plan,
        endDate: subscription.endDate,
        daysRemaining,
        status: subscription.status,
      } : null,
    };
  }

  // Hit on nearly every pre-login and dashboard screen load (WhatsApp
  // support number, subscription price) and rarely changes, so it's cached
  // in-process (see TtlCache's doc comment for why not Redis) -
  // updateSupportConfig invalidates it immediately below.
  async getSupportConfig() {
    const cached = this.supportConfigCache.get(SUPPORT_CONFIG_CACHE_KEY);
    if (cached) return cached;

    const config = await this.tenantService.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const result = !config
      ? { whatsapp: '+91 98765 43210', videos: [], email: null, customerCareNumber: null, subscriptionPrice: 999, gstPercent: 18 }
      : {
        whatsapp: config.whatsapp,
        videos: config.videos,
        email: config.email,
        customerCareNumber: config.customerCareNumber,
        subscriptionPrice: config.subscriptionPrice,
        gstPercent: config.gstPercent,
      };
    this.supportConfigCache.set(SUPPORT_CONFIG_CACHE_KEY, result, SUPPORT_CONFIG_CACHE_TTL_MS);
    return result;
  }

  async updateSupportConfig(dto: UpdateSupportConfigDto) {
    const data = {
      whatsapp: dto.whatsapp,
      videos: dto.videos ?? [],
      email: dto.email ?? null,
      customerCareNumber: dto.customerCareNumber ?? null,
      ...(dto.subscriptionPrice !== undefined ? { subscriptionPrice: dto.subscriptionPrice } : {}),
      ...(dto.gstPercent !== undefined ? { gstPercent: dto.gstPercent } : {}),
    };
    const updated = await this.tenantService.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    this.supportConfigCache.invalidate(SUPPORT_CONFIG_CACHE_KEY);
    return {
      whatsapp: updated.whatsapp,
      videos: updated.videos,
      email: updated.email,
      customerCareNumber: updated.customerCareNumber,
      subscriptionPrice: updated.subscriptionPrice,
      gstPercent: updated.gstPercent,
    };
  }

  // ==========================================
  // ACTIVITY LOG (Super Admin: all shops, optionally narrowed to one via
  // `shopId`; Shop Admin: TenantInterceptor's tenant context auto-injects
  // `where.shopId` for the ActivityLog model - see tenant.service.ts's
  // TENANT_SCOPED_MODELS - so a Shop Admin only ever sees their own shop's
  // entries here regardless of what's passed in, with no extra filtering
  // needed in this method.)
  // ==========================================
  async getActivityLog(params: { page: number; limit: number; shopId?: string; action?: string }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    // LOGIN entries are excluded by default - this view is meant as a record
    // of what changed (registrations, edits, deletions), not a session/login
    // audit trail, and login events dominated the list with no useful
    // detail. The explicit action filter still overrides this when a caller
    // asks for a specific action (never LOGIN, since it's no longer offered
    // in the frontend's filter dropdown).
    const where: any = { action: { not: 'LOGIN' } };
    if (params.shopId) where.shopId = params.shopId;
    if (params.action) where.action = params.action;

    const [items, total] = await Promise.all([
      this.tenantService.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true, email: true, phone: true, role: true } },
          shop: { select: { name: true } },
        },
      }),
      this.tenantService.prisma.activityLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
