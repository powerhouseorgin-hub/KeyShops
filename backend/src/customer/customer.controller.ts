import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('shop/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SHOP_ADMIN)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  async createCustomer(@Request() req, @Body() dto: CreateCustomerDto) {
    return this.customerService.createCustomer(req.user.shopId, dto);
  }

  // cursor/limit are optional - see CustomerService.getCustomers for how
  // omitting `limit` preserves the original unpaginated behavior (used by
  // the global-search route below and a couple of other unpaginated
  // consumers); the Customer History screen passes `limit` to page through
  // everything.
  @Get()
  async getCustomers(
    @Request() req,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customerService.getCustomers(req.user.shopId, search, { cursor, limit: limit ? Number(limit) : undefined });
  }

  // Despite the route name, this powers the Shop Admin's own dashboard
  // global-search bar (see App.jsx's KeysSearchView) - it must stay scoped to
  // the caller's own shop like every other route on this controller. It used
  // to call the Super Admin's unscoped getSuperCustomers(), which leaked
  // every shop's customer PII (including decrypted ID proof numbers) to any
  // Shop Admin token - see getCustomers() below for the correctly-scoped
  // equivalent this now reuses.
  @Get('global-search')
  async getGlobalCustomers(@Request() req, @Query('search') search?: string) {
    return this.customerService.getCustomers(req.user.shopId, search);
  }

  @Post(':id/docs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDoc(
    @Request() req,
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
    // Size limit check (5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }
    
    // MIME type check
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and PDF formats are accepted');
    }

    return this.customerService.addCustomerDocument(req.user.shopId, id, documentType, file);
  }

  @Delete(':id/docs/:docId')
  async deleteDoc(
    @Request() req,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.customerService.deleteCustomerDocument(req.user.shopId, id, docId);
  }

  @Put(':id')
  async updateCustomer(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.updateCustomer(req.user.shopId, id, dto);
  }
}
