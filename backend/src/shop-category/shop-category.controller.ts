import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ShopCategoryService } from './shop-category.service';
import { CreateShopCategoryDto, UpdateShopCategoryDto, ReorderShopCategoriesDto } from './dto/shop-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
export class ShopCategoryController {
  constructor(private readonly shopCategoryService: ShopCategoryService) {}

  // PUBLIC (no auth): powers the Category dropdown on the pre-login public
  // self-registration wizard, as well as the Super Admin's Shop Categories
  // screen once logged in.
  @Get('shop-categories')
  async getShopCategories() {
    return this.shopCategoryService.getAllCategories();
  }

  @Post('super/shop-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async createShopCategory(@Body() dto: CreateShopCategoryDto) {
    return this.shopCategoryService.createCategory(dto);
  }

  // Declared before the ':id' PUT route below - a static path segment like
  // "reorder" would otherwise be captured as the :id param, since NestJS
  // matches routes in class-declaration order.
  @Put('super/shop-categories/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async reorderShopCategories(@Body() dto: ReorderShopCategoriesDto) {
    return this.shopCategoryService.reorderCategories(dto.ids);
  }

  @Put('super/shop-categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async updateShopCategory(@Param('id') id: string, @Body() dto: UpdateShopCategoryDto) {
    return this.shopCategoryService.updateCategory(id, dto);
  }

  @Delete('super/shop-categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async deleteShopCategory(@Param('id') id: string) {
    return this.shopCategoryService.deleteCategory(id);
  }
}
