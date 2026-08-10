import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ProductTypeService } from './product-type.service';
import { CreateProductTypeDto, UpdateProductTypeDto } from './dto/product-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

// GET is now also PUBLIC (no auth) - it powers the pre-login mobile app's
// Machines/Products filter chips in addition to the authenticated Product
// Type dropdown, so the class-level guard is split per-route the same way
// ShopCategoryController already does: no class-level @UseGuards, only the
// mutating Super-Admin routes below carry their own guard.
@Controller()
export class ProductTypeController {
  constructor(private readonly productTypeService: ProductTypeService) {}

  @Get('product-types')
  async getProductTypes() {
    return this.productTypeService.getAllProductTypes();
  }

  @Post('super/product-types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async createProductType(@Body() dto: CreateProductTypeDto) {
    return this.productTypeService.createProductType(dto);
  }

  @Put('super/product-types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async updateProductType(@Param('id') id: string, @Body() dto: UpdateProductTypeDto) {
    return this.productTypeService.updateProductType(id, dto);
  }

  @Delete('super/product-types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async deleteProductType(@Param('id') id: string) {
    return this.productTypeService.deleteProductType(id);
  }
}
