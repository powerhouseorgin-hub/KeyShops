import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { NotificationService } from '../notification/notification.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly notificationService: NotificationService,
  ) {}

  // PUBLIC: a visitor submitting the marketing site's Contact Us form.
  // There's no email-sending infrastructure anywhere in this app (nodemailer
  // is an installed-but-unused dependency) - so the message is durably
  // stored here AND surfaced immediately via the existing Notification bell
  // (audience: SUPER_ADMIN, same mechanism used for "new shop registered"),
  // rather than attempting real email delivery.
  async createMessage(dto: CreateContactMessageDto) {
    const created = await this.tenantService.prisma.contactMessage.create({
      data: { name: dto.name, email: dto.email, message: dto.message },
    });

    const preview = dto.message.length > 100 ? `${dto.message.slice(0, 100)}…` : dto.message;
    await this.notificationService.createNotification(
      'New Contact Us Message',
      `${dto.name} (${dto.email}): ${preview}`,
      'CONTACT_SUBMISSION',
      undefined,
      'SUPER_ADMIN',
    );

    return { success: true };
  }

  // SUPER ADMIN: paginated message log - same page/limit/skip shape as
  // ReportService.getActivityLog, which the frontend view mirrors.
  async getMessages(params: { page: number; limit: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));

    const [items, total] = await Promise.all([
      this.tenantService.prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.tenantService.prisma.contactMessage.count(),
    ]);

    return { items, total, page, limit };
  }

  // SUPER ADMIN: mark one message as read once reviewed.
  async markAsRead(id: string) {
    const message = await this.tenantService.prisma.contactMessage.findUnique({ where: { id } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return this.tenantService.prisma.contactMessage.update({
      where: { id },
      data: { isRead: true },
    });
  }
}
