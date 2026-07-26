import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { KeyTypeService } from './key-type.service';
import { CreateKeyTypeDto, UpdateKeyTypeDto } from './dto/key-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

// Mirrors ProductTypeController: every route here requires a valid JWT - GET
// is open to any authenticated role (Shop Admin needs it for the Key Type
// dropdown on Customer Registration), while create/update/delete stay Super
// Admin-only.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class KeyTypeController {
  constructor(private readonly keyTypeService: KeyTypeService) {}

  @Get('key-types')
  async getKeyTypes() {
    return this.keyTypeService.getAllKeyTypes();
  }

  @Post('super/key-types')
  @Roles(Role.SUPER_ADMIN)
  async createKeyType(@Body() dto: CreateKeyTypeDto) {
    return this.keyTypeService.createKeyType(dto);
  }

  @Put('super/key-types/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateKeyType(@Param('id') id: string, @Body() dto: UpdateKeyTypeDto) {
    return this.keyTypeService.updateKeyType(id, dto);
  }

  @Delete('super/key-types/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteKeyType(@Param('id') id: string) {
    return this.keyTypeService.deleteKeyType(id);
  }
}
