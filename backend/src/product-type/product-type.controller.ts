import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ProductTypeService } from './product-type.service';
import { CreateProductTypeDto, UpdateProductTypeDto } from './dto/product-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

// Unlike ShopCategoryController, this doesn't need a pre-login public route
// (Inventory Product Creation only happens after login), so every route
// here requires a valid JWT - GET is open to any authenticated role (Shop
// Admin needs it for the Product Type dropdown), while create/update/delete
// stay Super Admin-only. Mirrors ReportController's support-config routes.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductTypeController {
  constructor(private readonly productTypeService: ProductTypeService) {}

  @Get('product-types')
  async getProductTypes() {
    return this.productTypeService.getAllProductTypes();
  }

  @Post('super/product-types')
  @Roles(Role.SUPER_ADMIN)
  async createProductType(@Body() dto: CreateProductTypeDto) {
    return this.productTypeService.createProductType(dto);
  }

  @Put('super/product-types/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateProductType(@Param('id') id: string, @Body() dto: UpdateProductTypeDto) {
    return this.productTypeService.updateProductType(id, dto);
  }

  @Delete('super/product-types/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteProductType(@Param('id') id: string) {
    return this.productTypeService.deleteProductType(id);
  }
}
