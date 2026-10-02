import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { FirestoreKeyService, type CreateKeyInput, type UpdateKeyInput } from './firestore-key.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class FirestoreKeyController {
  constructor(private readonly keys: FirestoreKeyService) {}

  @Get('super/keys')
  @Roles(Role.SUPER_ADMIN)
  async getKeys(@Query('search') search?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.keys.getKeys(search, { cursor, limit: limit ? Number(limit) : undefined });
  }

  @Post('super/keys')
  @Roles(Role.SUPER_ADMIN)
  async createKey(@Body() dto: CreateKeyInput) {
    return this.keys.createKey(dto);
  }

  @Put('super/keys/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateKey(@Param('id') id: string, @Body() dto: UpdateKeyInput) {
    return this.keys.updateKey(id, dto);
  }

  @Delete('super/keys/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteKey(@Param('id') id: string) {
    return this.keys.deleteKey(id);
  }

  @Get('super/shops/:shopId/keys')
  @Roles(Role.SUPER_ADMIN)
  async getShopKeysAsSuper(@Param('shopId') shopId: string, @Query('search') search?: string) {
    return this.keys.getShopKeys(shopId, search);
  }

  @Get('shop/keys/search')
  @Roles(Role.SHOP_ADMIN)
  async searchShopKeys(@Req() req: any, @Query('query') query?: string) {
    return this.keys.getShopKeys(req.user.shopId, query);
  }
}
