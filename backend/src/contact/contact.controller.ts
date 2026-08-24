import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

// PUBLIC (no auth) - the marketing site's Contact Us form is submitted by
// anonymous visitors who have no account. Rate-limited well below the
// global 120/min default (see app.module.ts) since a form like this is a
// spam target and each submission fans out into a Super Admin notification.
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post()
  async create(@Body() dto: CreateContactMessageDto) {
    return this.contactService.createMessage(dto);
  }
}
