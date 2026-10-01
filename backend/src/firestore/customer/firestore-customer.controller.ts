import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirestoreCustomerService, type CreateCustomerDtoInput, type UpdateCustomerInput } from './firestore-customer.service';
import { CustomerFilesService } from './customer-files.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('shop/customers')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SHOP_ADMIN)
export class FirestoreCustomerController {
  constructor(
    private readonly customers: FirestoreCustomerService,
    private readonly files: CustomerFilesService,
  ) {}

  @Post()
  async createCustomer(@Req() req: any, @Body() dto: CreateCustomerDtoInput) {
    return this.customers.createCustomer(req.user.shopId, req.user.id, dto);
  }

  @Get()
  async getCustomers(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('keysOnly') keysOnly?: string,
    @Query('town') town?: string,
  ) {
    return this.customers.getCustomers(req.user.shopId, search, {
      cursor, limit: limit ? Number(limit) : undefined, keysOnly: keysOnly === 'true', town,
    });
  }

  @Get('global-search')
  async getGlobalCustomers(@Req() req: any, @Query('search') search?: string) {
    return this.customers.getCustomers(req.user.shopId, search);
  }

  @Post(':id/docs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDoc(@Req() req: any, @Param('id') id: string, @Body('documentType') documentType: string, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Verification file document is required');
    if (!documentType) throw new BadRequestException('documentType text is required');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('File size exceeds the 5MB limit');
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and PDF formats are accepted');
    }
    return this.files.addCustomerDocument(req.user.shopId, id, req.user.id, documentType, file);
  }

  @Delete(':id/docs/:docId')
  async deleteDoc(@Req() req: any, @Param('id') id: string, @Param('docId') docId: string) {
    await this.files.deleteCustomerDocument(req.user.shopId, id, req.user.id, docId);
    return { success: true };
  }

  @Post(':id/report')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReport(@Req() req: any, @Param('id') id: string, @Body('fileName') fileName: string, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Report file is required');
    if (!fileName) throw new BadRequestException('fileName is required');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('File size exceeds the 10MB limit');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Only PDF files are accepted');
    return this.files.createCustomerReport(req.user.shopId, id, fileName, file);
  }

  @Put(':id')
  async updateCustomer(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCustomerInput) {
    return this.customers.updateCustomer(req.user.shopId, id, req.user.id, dto);
  }

  // Sends a previously-uploaded invoice PDF (see :id/report above - the same
  // upload-then-share flow) to the customer's own WhatsApp number
  // automatically. Requires WHATSAPP_INVOICE_TEMPLATE_NAME to be configured
  // with an approved Meta template - fails soft otherwise (see
  // WhatsappInvoiceService), so a client should treat `delivered: false` as
  // "logged server-side, not actually sent" rather than an error.
  @Post(':id/send-invoice')
  async sendInvoice(@Req() req: any, @Param('id') id: string, @Body('reportId') reportId: string) {
    if (!reportId) throw new BadRequestException('reportId is required');
    return this.files.sendCustomerInvoice(req.user.shopId, id, reportId);
  }
}
