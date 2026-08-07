import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateProductTypeDto, UpdateProductTypeDto } from './dto/product-type.dto';

@Injectable()
export class ProductTypeService {
  constructor(private readonly tenantService: TenantService) {}

  // PUBLIC: List active product types - powers the Product Type dropdown on
  // the Inventory Product Creation form as well as the Super Admin's
  // Product Types management screen.
  async getAllProductTypes() {
    return this.tenantService.prisma.productType.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  // SUPER ADMIN: Create a product type. If a product type with this name was
  // previously soft-deleted, revives that row instead of inserting a new
  // one - `name` has a hard DB-level unique constraint that isn't
  // deletedAt-aware, so a plain create() here would fail with a raw Prisma
  // unique-constraint error even though the name looks "free" once the
  // active-only list filters the old row out.
  async createProductType(dto: CreateProductTypeDto) {
    const trimmedName = dto.name.trim();
    const existing = await this.tenantService.prisma.productType.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' } },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException('A product type with this name already exists');
    }

    if (existing) {
      return this.tenantService.prisma.productType.update({
        where: { id: existing.id },
        data: { name: trimmedName, deletedAt: null },
      });
    }

    return this.tenantService.prisma.productType.create({
      data: { name: trimmedName },
    });
  }

  // SUPER ADMIN: Rename a product type
  async updateProductType(id: string, dto: UpdateProductTypeDto) {
    const existing = await this.tenantService.prisma.productType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Product type not found');

    const duplicate = await this.tenantService.prisma.productType.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, deletedAt: null, NOT: { id } },
    });
    if (duplicate) {
      throw new ConflictException('A product type with this name already exists');
    }

    return this.tenantService.prisma.productType.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
  }

  // SUPER ADMIN: Soft-delete a product type. Existing listings that already
  // used this type as their (freeform string) productType are untouched -
  // it just disappears from the dropdown/list for future selections.
  async deleteProductType(id: string) {
    const existing = await this.tenantService.prisma.productType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Product type not found');

    return this.tenantService.prisma.productType.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
