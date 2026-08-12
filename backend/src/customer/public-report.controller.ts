import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CustomerService } from './customer.service';

// Public (unauthenticated) - the customer receiving a WhatsApp share link
// never logs in. `id` is a CustomerReport row's own random UUID, never the
// Customer's own id, so this link can be shared freely without revealing
// which customer/shop it belongs to - see the model's doc comment in
// schema.prisma. Redirects to a freshly-signed, short-lived Supabase Storage
// URL rather than ever handing out a long-lived one, so the link itself
// stays valid indefinitely even though each individual signed URL expires
// in minutes.
@Controller('public/reports')
export class PublicReportController {
  constructor(private readonly customerService: CustomerService) {}

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { url } = await this.customerService.getReportDownloadUrl(id);
    res.redirect(url);
  }
}
