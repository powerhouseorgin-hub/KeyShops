import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class NotificationService {
  constructor(private readonly tenantService: TenantService) {}

  // SHOP ADMIN: notifications for their own shop, plus true global broadcasts
  // (shopId: null AND audience: 'SHOP'). Deliberately excludes shopId: null
  // notifications tagged audience: 'SUPER_ADMIN' — those are internal to the
  // Super Admin panel (e.g. new-shop-registration approval requests) and must
  // never be visible to any shop admin, including the shop that triggered them.
  // Capped to the 50 most recent - this powers a notification bell dropdown,
  // not a full history view, and a Customer registration creates one of
  // these rows every time (see CustomerService.createCustomer), so an
  // established shop's notification log grows unboundedly otherwise and was
  // being fetched in full on every single login.
  async getNotifications(shopId: string) {
    return this.tenantService.prisma.notification.findMany({
      where: {
        OR: [
          { shopId },
          { shopId: null, audience: 'SHOP' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // SHOP ADMIN: mark one of their own/global-SHOP notifications as read
  async markAsRead(shopId: string, id: string) {
    const notification = await this.tenantService.prisma.notification.findFirst({
      where: {
        id,
        OR: [
          { shopId },
          { shopId: null, audience: 'SHOP' },
        ],
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.tenantService.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  // SUPER ADMIN: every system-wide notification (shopId: null), regardless of
  // audience — the Super Admin panel is the one place both global shop broadcasts
  // and super-admin-only notifications (like registration requests) are visible
  // together. Shop-specific notifications (shopId set) are intentionally excluded;
  // Super Admin sees those in shop detail views, not the notification bell.
  // Capped to the 50 most recent - same rationale as getNotifications above
  // (a shop signup creates one of these rows every time too, see
  // AuthService.registerShop).
  async getSuperNotifications() {
    return this.tenantService.prisma.notification.findMany({
      where: { shopId: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // SUPER ADMIN: mark a system-wide notification as read
  async markSuperAsRead(id: string) {
    const notification = await this.tenantService.prisma.notification.findFirst({
      where: { id, shopId: null },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.tenantService.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  // System Utility: Create platform notification.
  // audience only matters when shopId is omitted/null - see schema comment on
  // Notification.audience for the SHOP vs SUPER_ADMIN distinction.
  async createNotification(
    title: string,
    message: string,
    type: string,
    shopId?: string,
    audience: 'SHOP' | 'SUPER_ADMIN' = 'SHOP',
  ) {
    return this.tenantService.prisma.notification.create({
      data: {
        title,
        message,
        type,
        shopId: shopId || null,
        audience,
      },
    });
  }
}
