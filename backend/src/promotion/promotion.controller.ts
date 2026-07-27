import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { PromotionService } from './promotion.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  // ==========================================
  // CROSS-SHOP FEED - visible to any authenticated user (Shop Admin or Super Admin)
  // ==========================================

  // includeExpiredOffers is used by the Super Admin's Offer Management screen,
  // which needs to see/manage every offer regardless of expiry. The shared
  // shop-facing marketplace feed omits it, so only "active" offers show.
  @Get('promotions')
  async getAllPromotions(@Query('includeExpiredOffers') includeExpiredOffers?: string) {
    return this.promotionService.getAllPromotions(includeExpiredOffers === 'true');
  }

  // ==========================================
  // SHOP ADMIN: create/edit/delete listings owned by their own shop only
  // ==========================================

  @Post('shop/promotions')
  @Roles(Role.SHOP_ADMIN)
  async createPromotion(@Request() req, @Body() dto: CreatePromotionDto) {
    return this.promotionService.createPromotion(req.user.shopId, req.user.id, dto);
  }

  @Put('shop/promotions/:id')
  @Roles(Role.SHOP_ADMIN)
  async updateOwnPromotion(@Request() req, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionService.updatePromotionAsShop(id, req.user.shopId, dto);
  }

  @Delete('shop/promotions/:id')
  @Roles(Role.SHOP_ADMIN)
  async deleteOwnPromotion(@Request() req, @Param('id') id: string) {
    return this.promotionService.deletePromotionAsShop(id, req.user.shopId);
  }

  // ==========================================
  // SUPER ADMIN: create/edit/delete listings owned by the Super Admin only
  // (shopId null - independent of every shop's inventory)
  // ==========================================

  @Post('super/promotions')
  @Roles(Role.SUPER_ADMIN)
  async createPromotionAsSuperAdmin(@Request() req, @Body() dto: CreatePromotionDto) {
    return this.promotionService.createPromotion(null, req.user.id, dto);
  }

  @Put('super/promotions/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateAnyPromotion(@Request() req, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionService.updatePromotionAsSuperAdmin(id, req.user.id, dto);
  }

  @Delete('super/promotions/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteAnyPromotion(@Request() req, @Param('id') id: string) {
    return this.promotionService.deletePromotionAsSuperAdmin(id, req.user.id);
  }
}
