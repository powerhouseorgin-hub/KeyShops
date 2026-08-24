import { Controller, Get, Put, Param, Query, UseGuards } from '@nestjs/common';
import { ContactService } from './contact.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

// SUPER ADMIN only - the reviewable log of Contact Us submissions, alongside
// the instant Notification bell alert created at submission time (see
// ContactService.createMessage). Split into its own controller/prefix
// (super/contact-messages) rather than nesting under ContactController,
// mirroring ShopController's public-vs-guarded split.
@Controller('super/contact-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class SuperContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  async getMessages(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.contactService.getMessages({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @Put(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.contactService.markAsRead(id);
  }
}
