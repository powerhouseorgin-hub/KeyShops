import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerService } from './customer.service';
import { UpdateCustomerDto, CreateSuperCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('super/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class SuperCustomerController {
  constructor(private readonly customerService: CustomerService) {}

  // cursor/limit are optional - see CustomerService.getSuperCustomers for how
  // omitting `limit` preserves the original unpaginated behavior (used by
  // the global header search and a couple of single-record lookups); the
  // Customer Registry screen passes `limit` to page through everything.
  @Get()
  async getCustomers(
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customerService.getSuperCustomers(search, { cursor, limit: limit ? Number(limit) : undefined });
  }

  @Post()
  async createCustomer(@Body() dto: CreateSuperCustomerDto) {
    const { shopId, ...rest } = dto;
    return this.customerService.createCustomer(shopId, rest);
  }

  @Put(':id')
  async updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customerService.updateSuperCustomer(id, dto);
  }

  // Mirrors CustomerController#uploadDoc (shop/customers/:id/docs) so the
  // unified Customer Registration wizard can upload documents right after
  // creating a customer on a shop's behalf.
  @Post(':id/docs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDoc(
    @Param('id') id: string,
    @Body('documentType') documentType: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Verification file document is required');
    }
    if (!documentType) {
      throw new BadRequestException('documentType text is required');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and PDF formats are accepted');
    }

    return this.customerService.addCustomerDocumentSuper(id, documentType, file);
  }

  // Mirrors CustomerController#uploadReport (shop/customers/:id/report).
  @Post(':id/report')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReport(
    @Param('id') id: string,
    @Body('fileName') fileName: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Report file is required');
    }
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 10MB limit');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted');
    }

    return this.customerService.createCustomerReportSuper(id, fileName, file);
  }
}
