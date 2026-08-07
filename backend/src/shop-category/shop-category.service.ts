import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateShopCategoryDto, UpdateShopCategoryDto } from './dto/shop-category.dto';

@Injectable()
export class ShopCategoryService {
  constructor(private readonly tenantService: TenantService) {}

  // PUBLIC: List active categories - used both to populate the Category
  // dropdown on the pre-login self-registration wizard and by the Super
  // Admin's Shop Categories management screen. Ordered by the Super
  // Admin-controlled sortOrder (see reorderCategories) rather than name, so
  // dragging categories in the management screen actually changes what
  // shop owners see in the dropdown.
  async getAllCategories() {
    return this.tenantService.prisma.shopCategory.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  // SUPER ADMIN: Create a category. If a category with this name was
  // previously soft-deleted, revives that row instead of inserting a new
  // one - `name` has a hard DB-level unique constraint that isn't
  // deletedAt-aware, so a plain create() here would fail with a raw Prisma
  // unique-constraint error even though the name looks "free" once the
  // active-only list filters the old row out.
  async createCategory(dto: CreateShopCategoryDto) {
    const trimmedName = dto.name.trim();
    const existing = await this.tenantService.prisma.shopCategory.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' } },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException('A shop category with this name already exists');
    }

    // New/revived categories are appended after whatever currently has the
    // highest sortOrder, so they land at the end of the dropdown instead of
    // jumping to wherever their old position (or the default 0) happens to
    // sort - matches how a newly-added item is expected to behave.
    const highest = await this.tenantService.prisma.shopCategory.aggregate({ _max: { sortOrder: true } });
    const nextSortOrder = (highest._max.sortOrder ?? -1) + 1;

    if (existing) {
      return this.tenantService.prisma.shopCategory.update({
        where: { id: existing.id },
        data: { name: trimmedName, deletedAt: null, sortOrder: nextSortOrder },
      });
    }

    return this.tenantService.prisma.shopCategory.create({
      data: { name: trimmedName, sortOrder: nextSortOrder },
    });
  }

  // SUPER ADMIN: Persist a new drag-and-drop display order. `orderedIds`
  // must be every active category's id, in the order they should appear -
  // each one's sortOrder becomes its index in that array.
  async reorderCategories(orderedIds: string[]) {
    const categories = await this.tenantService.prisma.shopCategory.findMany({
      where: { id: { in: orderedIds }, deletedAt: null },
      select: { id: true },
    });
    if (categories.length !== orderedIds.length) {
      throw new NotFoundException('One or more shop categories were not found');
    }

    await this.tenantService.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.tenantService.prisma.shopCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.getAllCategories();
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
