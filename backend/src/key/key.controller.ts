import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { KeyService } from './key.service';
import { CreateKeyDto, UpdateKeyDto } from './dto/key.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class KeyController {
  constructor(private readonly keyService: KeyService) {}

  // ==========================================
  // SUPER ADMIN CRUD ENDPOINTS
  // ==========================================

  // cursor/limit are optional - see KeyService.getKeys for how omitting
  // `limit` preserves the original unpaginated behavior (used by the global
  // header search, "Blank Key Search", and the Customer Registration
  // wizard's key dropdown); the Master Catalogue screen passes `limit` to
  // page through everything.
  @Get('super/keys')
  @Roles(Role.SUPER_ADMIN)
  async superGetKeys(
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.keyService.getKeys(search, { cursor, limit: limit ? Number(limit) : undefined });
  }

  @Post('super/keys')
  @Roles(Role.SUPER_ADMIN)
  async createKey(@Body() dto: CreateKeyDto) {
    return this.keyService.createKey(dto);
  }

  @Put('super/keys/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateKey(@Param('id') id: string, @Body() dto: UpdateKeyDto) {
    return this.keyService.updateKey(id, dto);
  }

  @Delete('super/keys/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteKey(@Param('id') id: string) {
    return this.keyService.deleteKey(id);
  }

  // Super Admin needs to browse a SPECIFIC shop's key catalog when creating a
  // customer on that shop's behalf (see the Customer Registration wizard's
  // "select shop" step). Reuses the same shop-scoped query as the Shop Admin
  // endpoint below, just gated by the SUPER_ADMIN role with an explicit :shopId
  // param instead of trusting req.user.shopId.
  @Get('super/shops/:shopId/keys')
  @Roles(Role.SUPER_ADMIN)
  async superGetShopKeys(@Param('shopId') shopId: string, @Query('search') search?: string) {
    return this.keyService.getShopKeys(shopId, search);
  }

  // ==========================================
  // SHOP ADMIN ENDPOINTS (own shop's keys only)
  // ==========================================

  @Get('shop/keys/search')
  @Roles(Role.SHOP_ADMIN)
  async shopSearchKeys(@Request() req, @Query('query') query?: string) {
    return this.keyService.getShopKeys(req.user.shopId, query);
  }
}
