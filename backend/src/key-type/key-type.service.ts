import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateKeyTypeDto, UpdateKeyTypeDto } from './dto/key-type.dto';

@Injectable()
export class KeyTypeService {
  constructor(private readonly tenantService: TenantService) {}

  // PUBLIC: List active key types - powers the Key Type dropdown on the
  // Customer Registration form as well as the Super Admin's Key Types
  // management screen.
  async getAllKeyTypes() {
    return this.tenantService.prisma.keyType.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  // SUPER ADMIN: Create a key type. If a key type with this name was
  // previously soft-deleted, revives that row instead of inserting a new
  // one - `name` has a hard DB-level unique constraint that isn't
  // deletedAt-aware, so a plain create() here would fail with a raw Prisma
  // unique-constraint error even though the name looks "free" once the
  // active-only list filters the old row out.
  async createKeyType(dto: CreateKeyTypeDto) {
    const trimmedName = dto.name.trim();
    const existing = await this.tenantService.prisma.keyType.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' } },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException('A key type with this name already exists');
    }

    if (existing) {
      return this.tenantService.prisma.keyType.update({
        where: { id: existing.id },
        data: { name: trimmedName, deletedAt: null },
      });
    }

    return this.tenantService.prisma.keyType.create({
      data: { name: trimmedName },
    });
  }

  // SUPER ADMIN: Rename a key type
  async updateKeyType(id: string, dto: UpdateKeyTypeDto) {
    const existing = await this.tenantService.prisma.keyType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Key type not found');

    const duplicate = await this.tenantService.prisma.keyType.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, deletedAt: null, NOT: { id } },
    });
    if (duplicate) {
      throw new ConflictException('A key type with this name already exists');
    }

    return this.tenantService.prisma.keyType.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
  }

  // SUPER ADMIN: Soft-delete a key type. Existing customers that already
  // used this type as their (freeform string) keyType are untouched - it
  // just disappears from the dropdown/list for future selections.
  async deleteKeyType(id: string) {
    const existing = await this.tenantService.prisma.keyType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Key type not found');

    return this.tenantService.prisma.keyType.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
