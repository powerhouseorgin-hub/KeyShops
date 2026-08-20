import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CustomerService } from './customer.service';

// Public (unauthenticated) - the customer receiving a WhatsApp share link
// never logs in. `id` is a CustomerReport row's own random UUID, never the
// Customer's own id, so this link can be shared freely without revealing
// which customer/shop it belongs to - see the model's doc comment in
// schema.prisma. Streams the file straight back through this response
// (rather than redirecting to a signed Supabase Storage URL, as this used
// to) so the recipient's browser only ever sees our own domain - a redirect
// would show the storage bucket name, internal file path, and signature
// token in their address bar once followed.
@Controller('public/reports')
export class PublicReportController {
  constructor(private readonly customerService: CustomerService) {}

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType, fileName } = await this.customerService.getReportFile(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.send(buffer);
  }
}
