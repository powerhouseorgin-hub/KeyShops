import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { UpdateSupportConfigDto } from './dto/update-support-config.dto';

@Injectable()
export class ReportService {
  constructor(private readonly tenantService: TenantService) {}

  // ==========================================
  // SUPER ADMIN DASHBOARD
  // ==========================================
  async getSuperDashboard() {
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

    return {
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
      customersForGraph,
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
      this.tenantService.prisma.customer.findMany({
        where: { shopId, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
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

    customersForGraph.forEach(c => {
      const mName = c.createdAt.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      if (monthlyCounts[mName] !== undefined) {
        monthlyCounts[mName]++;
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

  async getSupportConfig() {
    const config = await this.tenantService.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    if (!config) {
      return { whatsapp: '+91 98765 43210', videos: [], email: null, customerCareNumber: null, subscriptionPrice: 999, gstPercent: 18 };
    }
    return {
      whatsapp: config.whatsapp,
      videos: config.videos,
      email: config.email,
      customerCareNumber: config.customerCareNumber,
      subscriptionPrice: config.subscriptionPrice,
      gstPercent: config.gstPercent,
    };
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
    const where: any = {};
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
