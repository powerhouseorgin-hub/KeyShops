import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateKeyDto, UpdateKeyDto } from './dto/key.dto';

@Injectable()
export class KeyService {
  constructor(private readonly tenantService: TenantService) {}

  // SUPER ADMIN: Create Master Key (global catalog entry, shopId null)
  async createKey(dto: CreateKeyDto) {
    const existing = await this.tenantService.prisma.masterKey.findFirst({
      where: { shopId: null, keyNumber: dto.keyNumber },
    });
    if (existing) {
      throw new BadRequestException(`Key with blank number '${dto.keyNumber}' already exists in database`);
    }

    return this.tenantService.prisma.masterKey.create({
      data: dto,
    });
  }

  // SUPER ADMIN: Update Master Key
  async updateKey(id: string, dto: UpdateKeyDto) {
    const existing = await this.tenantService.prisma.masterKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Key blank not found');

    if (dto.keyNumber && dto.keyNumber !== existing.keyNumber) {
      const collision = await this.tenantService.prisma.masterKey.findFirst({
        where: { shopId: existing.shopId, keyNumber: dto.keyNumber, NOT: { id } },
      });
      if (collision) {
        throw new BadRequestException(`Key with blank number '${dto.keyNumber}' already exists`);
      }
    }

    return this.tenantService.prisma.masterKey.update({
      where: { id },
      data: dto,
    });
  }

  // SUPER ADMIN: Delete Master Key
  async deleteKey(id: string) {
    const existing = await this.tenantService.prisma.masterKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Key blank not found');

    return this.tenantService.prisma.masterKey.delete({ where: { id } });
  }

  // SUPER ADMIN: List/Search Keys across ALL shops (Query filters based on category, keyNumber).
  //
  // Pagination is opt-in via `pageOpts.limit`, same additive pattern used
  // throughout this codebase (PromotionService.getAllPromotions,
  // CustomerService.getSuperCustomers, etc.) - omitting it preserves the
  // exact original unpaginated flat-array behavior, since other callers
  // (the global header search, the "Blank Key Search" screen, and the
  // Customer Registration wizard's key dropdown) rely on that shape and
  // aren't part of the Master Catalogue screen this pagination was added for.
  async getKeys(search?: string, pageOpts: { cursor?: string; limit?: number } = {}) {
    const { cursor, limit } = pageOpts;
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { keyNumber: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }
    const include = {
      shop: { select: { id: true, name: true } },
      // Surfaced in the Super Admin "Modify Key" dialog so an admin can see
      // which customer compliance record(s) this key blank is tied to
      // before editing/removing it - capped since a popular key blank can
      // accumulate thousands of historical customer registrations, which
      // would otherwise bloat every row of this list/search response just
      // to populate a dialog most keys never open.
      customers: { select: { id: true, name: true, phone: true }, take: 20 },
    };

    if (!limit) {
      return this.tenantService.prisma.masterKey.findMany({
        where: whereClause,
        orderBy: { keyNumber: 'asc' },
        include,
      });
    }

    // Cursor pagination here orders by keyNumber (not createdAt, unlike the
    // other paginated lists in this codebase) to match this screen's
    // alphabetical catalog browsing - `id` stays the tiebreaker/cursor field.
    const rows = await this.tenantService.prisma.masterKey.findMany({
      where: whereClause,
      orderBy: [{ keyNumber: 'asc' }, { id: 'asc' }],
      include,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // SHOP ADMIN: List/Search Keys created within their own shop only
  async getShopKeys(shopId: string, search?: string) {
    const whereClause: any = { shopId };
    if (search) {
      whereClause.OR = [
        { keyNumber: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.tenantService.prisma.masterKey.findMany({
      where: whereClause,
      orderBy: { keyNumber: 'asc' },
    });
  }

  // SHARED: Get Key by ID
  async getKeyById(id: string) {
    const key = await this.tenantService.prisma.masterKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Key blank not found');
    return key;
  }
}
