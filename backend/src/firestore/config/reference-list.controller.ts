import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';
import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ShopCategoryService, ProductTypeService, KeyTypeService } from './reference-lists.module';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

// Firestore port of the three near-identical reference-list controllers
// (key-type, product-type, shop-category) - one file since they're now all
// thin wrappers around the same NamedReferenceListService subclasses (see
// reference-lists.module.ts). Guard placement is deliberately per-route, not
// class-level: every GET stays public (pre-login self-registration wizard's
// Category dropdown, the Machines/Products filter chips, and the
// authenticated dropdowns all read the same public list), only the
// Super-Admin write routes are guarded.
export class CreateReferenceNameDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;
}

export class UpdateReferenceNameDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;
}

export class ReorderShopCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];
}

@Controller()
export class KeyTypeController {
  constructor(private readonly keyTypes: KeyTypeService) {}

  @Get('key-types')
  async getAll() {
    return this.keyTypes.getAll();
  }

  @Post('super/key-types')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async create(@Body() dto: CreateReferenceNameDto) {
    return this.keyTypes.create(dto.name);
  }

  @Put('super/key-types/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateReferenceNameDto) {
    await this.keyTypes.update(id, dto.name);
    return { success: true };
  }

  @Delete('super/key-types/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async delete(@Param('id') id: string) {
    await this.keyTypes.softDelete(id);
    return { success: true };
  }
}

@Controller()
export class ProductTypeController {
  constructor(private readonly productTypes: ProductTypeService) {}

  @Get('product-types')
  async getAll() {
    return this.productTypes.getAll();
  }

  @Post('super/product-types')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async create(@Body() dto: CreateReferenceNameDto) {
    return this.productTypes.create(dto.name);
  }

  @Put('super/product-types/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateReferenceNameDto) {
    await this.productTypes.update(id, dto.name);
    return { success: true };
  }

  @Delete('super/product-types/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async delete(@Param('id') id: string) {
    await this.productTypes.softDelete(id);
    return { success: true };
  }
}

@Controller()
export class ShopCategoryController {
  constructor(private readonly categories: ShopCategoryService) {}

  @Get('shop-categories')
  async getAll() {
    return this.categories.getAll();
  }

  @Post('super/shop-categories')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async create(@Body() dto: CreateReferenceNameDto) {
    return this.categories.create(dto.name);
  }

  // Declared before the :id route below - a static segment ("reorder") would
  // otherwise never be reached, since Nest matches routes in registration
  // order and :id greedily captures any single path segment.
  @Put('super/shop-categories/reorder')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async reorder(@Body() dto: ReorderShopCategoriesDto) {
    await this.categories.reorder(dto.ids);
    return { success: true };
  }

  @Put('super/shop-categories/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateReferenceNameDto) {
    await this.categories.update(id, dto.name);
    return { success: true };
  }

  @Delete('super/shop-categories/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async delete(@Param('id') id: string) {
    await this.categories.softDelete(id);
    return { success: true };
  }
}
