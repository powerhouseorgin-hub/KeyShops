import { Controller, Get, Put, Param, Req, UseGuards } from '@nestjs/common';
import { FirestoreNotificationService } from './firestore-notification.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

@Controller('shop/notifications')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SHOP_ADMIN)
export class FirestoreNotificationController {
  constructor(private readonly notifications: FirestoreNotificationService) {}

  @Get()
  async getNotifications(@Req() req: any) {
    return this.notifications.getNotifications(req.user.shopId);
  }

  @Put(':id')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.notifications.markAsRead(req.user.shopId, id);
  }
}

@Controller('super/notifications')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class FirestoreSuperNotificationController {
  constructor(private readonly notifications: FirestoreNotificationService) {}

  @Get()
  async getNotifications() {
    return this.notifications.getSuperNotifications();
  }

  @Put(':id')
  async markAsRead(@Param('id') id: string) {
    return this.notifications.markSuperAsRead(id);
  }
}
