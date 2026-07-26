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

  // SUPER ADMIN: Create a key type
  async createKeyType(dto: CreateKeyTypeDto) {
    const existing = await this.tenantService.prisma.keyType.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('A key type with this name already exists');
    }
    return this.tenantService.prisma.keyType.create({
      data: { name: dto.name.trim() },
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
