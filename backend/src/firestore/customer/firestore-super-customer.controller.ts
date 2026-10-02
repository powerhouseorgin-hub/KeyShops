import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirestoreCustomerService, type CreateCustomerDtoInput, type UpdateCustomerInput } from './firestore-customer.service';
import { CustomerFilesService } from './customer-files.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

export interface CreateSuperCustomerDtoInput extends CreateCustomerDtoInput {
  shopId: string;
}

@Controller('super/customers')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class FirestoreSuperCustomerController {
  constructor(
    private readonly customers: FirestoreCustomerService,
    private readonly files: CustomerFilesService,
  ) {}

  @Get()
  async getCustomers(
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('keysOnly') keysOnly?: string,
  ) {
    return this.customers.getSuperCustomers(search, { cursor, limit: limit ? Number(limit) : undefined, keysOnly: keysOnly === 'true' });
  }

  @Post()
  async createCustomer(@Body() dto: CreateSuperCustomerDtoInput, @Req() req: any) {
    const { shopId, ...rest } = dto;
    return this.customers.createCustomer(shopId, req.user.id, rest);
  }

  @Put(':id')
  async updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerInput) {
    return this.customers.updateSuperCustomer(id, dto);
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
    return this.files.addCustomerDocumentSuper(id, req.user.id, documentType, file);
  }

  @Post(':id/report')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReport(@Param('id') id: string, @Body('fileName') fileName: string, @UploadedFile() file: any) {
    if (!fileName) throw new BadRequestException('fileName is required');
    if (!file) throw new BadRequestException('Report file is required');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('File size exceeds the 10MB limit');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Only PDF files are accepted');
    return this.files.createCustomerReportSuper(id, fileName, file);
  }

  // See FirestoreCustomerController.sendInvoice's doc comment.
  @Post(':id/send-invoice')
  async sendInvoice(@Param('id') id: string, @Body('reportId') reportId: string) {
    if (!reportId) throw new BadRequestException('reportId is required');
    return this.files.sendCustomerInvoiceSuper(id, reportId);
  }
}
