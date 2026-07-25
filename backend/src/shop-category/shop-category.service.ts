import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateShopCategoryDto, UpdateShopCategoryDto } from './dto/shop-category.dto';

@Injectable()
export class ShopCategoryService {
  constructor(private readonly tenantService: TenantService) {}

  // PUBLIC: List active categories - used both to populate the Category
  // dropdown on the pre-login self-registration wizard and by the Super
  // Admin's Shop Categories management screen.
  async getAllCategories() {
    return this.tenantService.prisma.shopCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  // SUPER ADMIN: Create a category
  async createCategory(dto: CreateShopCategoryDto) {
    const existing = await this.tenantService.prisma.shopCategory.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('A shop category with this name already exists');
    }
    return this.tenantService.prisma.shopCategory.create({
      data: { name: dto.name.trim() },
    });
  }

  // SUPER ADMIN: Rename a category
  async updateCategory(id: string, dto: UpdateShopCategoryDto) {
    const existing = await this.tenantService.prisma.shopCategory.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Shop category not found');

    const duplicate = await this.tenantService.prisma.shopCategory.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, deletedAt: null, NOT: { id } },
    });
    if (duplicate) {
      throw new ConflictException('A shop category with this name already exists');
    }

    return this.tenantService.prisma.shopCategory.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
  }

  // SUPER ADMIN: Soft-delete a category. Shops already assigned to it keep
  // referencing the (now hidden) row via categoryId - they aren't touched -
  // but it disappears from the dropdown/list for future selections.
  async deleteCategory(id: string) {
    const existing = await this.tenantService.prisma.shopCategory.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Shop category not found');

    return this.tenantService.prisma.shopCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
