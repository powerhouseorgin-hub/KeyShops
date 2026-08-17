import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ShopService } from './shop.service';
import { CreateShopDto, UpdateShopDto, UpdateSettingsDto, ManageSubscriptionDto } from './dto/shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // ==========================================
  // SUPER ADMIN ENDPOINTS
  // ==========================================

  // search/cursor/limit are optional - see ShopService.getShops for how
  // omitting `limit` preserves the original unpaginated behavior (used by
  // the global header search and a couple of "all shops for a picker"
  // consumers); the Shop Management screen passes `limit` (and `search`,
  // newly added alongside pagination) to page through everything.
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
  async createShop(@Body() dto: CreateShopDto) {
    return this.shopService.createShop(dto);
  }

  @Get('super/shops/:id')
  @Roles(Role.SUPER_ADMIN)
  async getShopById(@Param('id') id: string) {
    return this.shopService.getShopById(id);
  }

  @Put('super/shops/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateShop(@Param('id') id: string, @Body() dto: UpdateShopDto) {
    return this.shopService.updateShop(id, dto);
  }

  @Post('super/shops/:id/suspend')
  @Roles(Role.SUPER_ADMIN)
  async suspendShop(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.shopService.setShopStatus(id, isActive);
  }

  @Post('super/subscriptions/:shopId')
  @Roles(Role.SUPER_ADMIN)
  async manageSubscription(@Param('shopId') shopId: string, @Body() dto: ManageSubscriptionDto) {
    return this.shopService.updateSubscription(shopId, dto);
  }

  // ==========================================
  // SHOP ADMIN ENDPOINTS
  // ==========================================
  // Also reachable by SUPER_ADMIN so Shop Settings (Manage Shop -> Settings)
  // can be administered on behalf of any shop from the Super Admin Shops
  // Management screen. SHOP_ADMIN callers are always scoped to their own
  // shop (req.user.shopId); SUPER_ADMIN callers must pass ?shopId= to say
  // which shop they're editing, since Super Admins don't belong to a shop.

  private resolveShopId(req, shopId?: string): string {
    if (req.user.role === Role.SUPER_ADMIN) {
      if (!shopId) {
        throw new BadRequestException('shopId is required for Super Admin');
      }
      return shopId;
    }
    return req.user.shopId;
  }

  @Get('shop/settings')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async getSettings(@Request() req, @Query('shopId') shopId?: string) {
    return this.shopService.getSettings(this.resolveShopId(req, shopId));
  }

  @Put('shop/settings')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async updateSettings(@Request() req, @Body() dto: UpdateSettingsDto, @Query('shopId') shopId?: string) {
    return this.shopService.updateSettings(this.resolveShopId(req, shopId), dto);
  }

  @Post('shop/settings/documents')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadSettingsDocument(
    @Request() req,
    @Body('documentType') documentType: string,
    @Query('shopId') shopId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (!documentType) {
      throw new BadRequestException('documentType text is required');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and PDF formats are accepted');
    }
    return this.shopService.addOrReplaceShopDocument(this.resolveShopId(req, shopId), documentType, file);
  }

  @Delete('shop/settings/documents/:id')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async deleteSettingsDocument(@Request() req, @Param('id') id: string, @Query('shopId') shopId?: string) {
    return this.shopService.deleteShopDocument(this.resolveShopId(req, shopId), id);
  }

  // Shop's own logo/photo, shown on its public Shop Details page (see
  // ShopService.mapPublicShop). Unlike the verification document above,
  // this is a single always-current image (not a versioned/verifiable
  // document row) - upload directly overwrites Shop.logoUrl.
  @Post('shop/settings/logo/upload')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadShopLogo(@Request() req, @Query('shopId') shopId: string, @UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are accepted');
    }
    return this.shopService.uploadLogo(this.resolveShopId(req, shopId), file);
  }

  @Post('shop/settings/referral')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async generateReferralCode(@Request() req, @Query('shopId') shopId?: string) {
    return { referralCode: await this.shopService.getOrCreateReferralCode(this.resolveShopId(req, shopId)) };
  }

  @Get('shop/referral')
  @Roles(Role.SHOP_ADMIN, Role.SUPER_ADMIN)
  async getReferralOverview(@Request() req, @Query('shopId') shopId?: string) {
    return this.shopService.getReferralOverview(this.resolveShopId(req, shopId));
  }
}
