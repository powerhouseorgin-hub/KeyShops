import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ReportService {
  constructor(private readonly tenantService: TenantService) {}

  // ==========================================
  // SUPER ADMIN DASHBOARD
  // ==========================================
  async getSuperDashboard() {
    const totalShops = await this.tenantService.prisma.shop.count();
    const activeShops = await this.tenantService.prisma.shop.count({ where: { isActive: true } });
    const inactiveShops = totalShops - activeShops;

    const totalCustomers = await this.tenantService.prisma.customer.count();
    const totalDocuments = await this.tenantService.prisma.customerDocument.count();

    // Sum of storageUsed across all shops
    const shopsStorage = await this.tenantService.prisma.shop.aggregate({
      _sum: {
        storageUsed: true,
      },
    });
    const totalStorageBytes = Number(shopsStorage._sum.storageUsed || 0);

    // Platform-wide popular keys: Group by keyNumber in Customer
    const popularKeysRaw = await this.tenantService.prisma.customer.groupBy({
      by: ['keyNumber'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    });
    const popularKeys = popularKeysRaw.map(item => ({
      keyNumber: item.keyNumber,
      count: item._count.id,
    }));

    // Subscriptions nearing expiry (ends in next 10 days)
    const now = new Date();
    const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const expiringSubscriptions = await this.tenantService.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          gte: now,
          lte: in10Days,
        },
      },
      include: {
        shop: {
          select: { name: true },
        },
      },
    });

    // Recent revenue records
    const recentRevenue = await this.tenantService.prisma.revenueRecord.findMany({
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
      ],
      take: 6,
    });

    // Compute total subscription revenue using the single configurable yearly price
    const platformConfig = await this.tenantService.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const subscriptionPrice = platformConfig?.subscriptionPrice ?? 999;
    const subscriptionCount = await this.tenantService.prisma.subscription.count();
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

    // Today's registered customers
    const todayCustomers = await this.tenantService.prisma.customer.count({
      where: {
        shopId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // Total registered customers
    const totalCustomers = await this.tenantService.prisma.customer.count({
      where: { shopId },
    });

    // Recent customers (last 5)
    const recentCustomers = await this.tenantService.prisma.customer.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Popular keys in this specific shop
    const popularKeysRaw = await this.tenantService.prisma.customer.groupBy({
      by: ['keyNumber'],
      where: { shopId },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    });
    const popularKeys = popularKeysRaw.map(item => ({
      keyNumber: item.keyNumber,
      count: item._count.id,
    }));

    // Subscription status
    const subscription = await this.tenantService.prisma.subscription.findFirst({
      where: { shopId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    let daysRemaining = 0;
    if (subscription) {
      const diffTime = subscription.endDate.getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const customersForGraph = await this.tenantService.prisma.customer.findMany({
      where: {
        shopId,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    });

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
      return { whatsapp: '+91 98765 43210', videos: [], ownerName: null, ownerPhone: null, ownerAddress: null, subscriptionPrice: 999 };
    }
    return {
      whatsapp: config.whatsapp,
      videos: config.videos,
      ownerName: config.ownerName,
      ownerPhone: config.ownerPhone,
      ownerAddress: config.ownerAddress,
      subscriptionPrice: config.subscriptionPrice,
    };
  }

  async updateSupportConfig(dto: {
    whatsapp: string;
    videos: { name: string; url: string }[];
    ownerName?: string;
    ownerPhone?: string;
    ownerAddress?: string;
    subscriptionPrice?: number;
  }) {
    const data = {
      whatsapp: dto.whatsapp,
      videos: dto.videos ?? [],
      ownerName: dto.ownerName ?? null,
      ownerPhone: dto.ownerPhone ?? null,
      ownerAddress: dto.ownerAddress ?? null,
      ...(dto.subscriptionPrice !== undefined ? { subscriptionPrice: dto.subscriptionPrice } : {}),
    };
    const updated = await this.tenantService.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    return {
      whatsapp: updated.whatsapp,
      videos: updated.videos,
      ownerName: updated.ownerName,
      ownerPhone: updated.ownerPhone,
      ownerAddress: updated.ownerAddress,
      subscriptionPrice: updated.subscriptionPrice,
    };
  }
}
