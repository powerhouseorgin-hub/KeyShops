import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirestoreShopService, type CreateShopInput, type UpdateShopInput, type UpdateSettingsInput } from './firestore-shop.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class FirestoreShopController {
  constructor(private readonly shopService: FirestoreShopService) {}

  // ==========================================
  // SUPER ADMIN ENDPOINTS
  // ==========================================

  @Get('super/shops')
  @Roles(Role.SUPER_ADMIN)
  async getShops(
    @Query('search') search?: string,
    @Query('town') town?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shopService.getShops({ search, town, cursor, limit: limit ? Number(limit) : undefined });
  }

  @Post('super/shops')
  @Roles(Role.SUPER_ADMIN)
  async createShop(@Body() dto: CreateShopInput) {
    return this.shopService.createShop(dto);
  }

  @Get('super/shops/:id')
  @Roles(Role.SUPER_ADMIN)
  async getShopById(@Param('id') id: string) {
    return this.shopService.getShopById(id);
  }

  @Put('super/shops/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateShop(@Param('id') id: string, @Body() dto: UpdateShopInput, @Req() req: any) {
    return this.shopService.updateShop(id, dto, req.user.id);
  }

  @Post('super/shops/:id/suspend')
  @Roles(Role.SUPER_ADMIN)
  async suspendShop(@Param('id') id: string, @Body('isActive') isActive: boolean, @Req() req: any) {
    return this.shopService.setShopStatus(id, isActive, req.user.id);
  }

  @Post('super/subscriptions/:shopId')
  @Roles(Role.SUPER_ADMIN)
  async manageSubscription(@Param('shopId') shopId: string, @Body() dto: { status: string }, @Req() req: any) {
    return this.shopService.updateSubscription(shopId, dto, req.user.id);
  }

  // ==========================================
  // SHOP ADMIN ENDPOINTS (also reachable by SUPER_ADMIN via ?shopId=)
  // ==========================================

  private resolveShopId(req: any, shopId?: string): string {
    if (req.user.role === Role.SUPER_ADMIN) {
      if (!shopId) throw new BadRequestException('shopId is required for Super Admin');
      return shopId;
    }
    return req.user.shopId;
  }

  @Get('shop/settings')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async getSettings(@Req() req: any, @Query('shopId') shopId?: string) {
    return this.shopService.getSettings(this.resolveShopId(req, shopId));
  }

  @Put('shop/settings')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async updateSettings(@Req() req: any, @Body() dto: UpdateSettingsInput, @Query('shopId') shopId?: string) {
    return this.shopService.updateSettings(this.resolveShopId(req, shopId), dto);
  }

  @Post('shop/settings/documents')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadSettingsDocument(
    @Req() req: any,
    @Body('documentType') documentType: string,
    @Query('shopId') shopId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    if (!documentType) throw new BadRequestException('documentType text is required');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('File size exceeds the 5MB limit');
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and PDF formats are accepted');
    }
    return this.shopService.addOrReplaceShopDocument(this.resolveShopId(req, shopId), documentType, file);
  }

  @Delete('shop/settings/documents/:id')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async deleteSettingsDocument(@Req() req: any, @Param('id') id: string, @Query('shopId') shopId?: string) {
    return this.shopService.deleteShopDocument(this.resolveShopId(req, shopId), id);
  }

  @Post('shop/settings/logo/upload')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadShopLogo(@Req() req: any, @Query('shopId') shopId: string, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('A file is required');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('File size exceeds the 5MB limit');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are accepted');
    }
    return this.shopService.uploadLogo(this.resolveShopId(req, shopId), file);
  }

  @Post('shop/settings/referral')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async generateReferralCode(@Req() req: any, @Query('shopId') shopId?: string) {
    return { referralCode: await this.shopService.getOrCreateReferralCode(this.resolveShopId(req, shopId)) };
  }

  @Get('shop/referral')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async getReferralOverview(@Req() req: any, @Query('shopId') shopId?: string) {
    return this.shopService.getReferralOverview(this.resolveShopId(req, shopId));
  }
}
