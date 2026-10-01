import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CustomerFilesService } from './customer-files.service';

// Public (unauthenticated) - see CustomerFilesService.getReportFile's doc
// comment for why this is safe to leave open (the id is an unguessable
// random token, not the customer/shop id) and why the file is streamed
// through this response instead of redirecting to a signed Storage URL.
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('public/reports')
export class PublicReportController {
  constructor(private readonly files: CustomerFilesService) {}

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType, fileName } = await this.files.getReportFile(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.send(buffer);
  }
}
