import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FirestoreContactService } from './firestore-contact.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CreateContactMessageDto } from '../../contact/dto/create-contact-message.dto';

@Controller('contact')
export class FirestoreContactController {
  constructor(private readonly contact: FirestoreContactService) {}

  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post()
  async create(@Body() dto: CreateContactMessageDto) {
    return this.contact.createMessage(dto);
  }
}

@Controller('super/contact-messages')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class FirestoreSuperContactController {
  constructor(private readonly contact: FirestoreContactService) {}

  // Cursor pagination instead of page numbers - see
  // FirestoreContactService's doc comment (no Firestore offset support).
  @Get()
  async getMessages(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.contact.getMessages({ cursor, limit: limit ? Number(limit) : 25 });
  }

  @Put(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.contact.markAsRead(id);
  }
}
