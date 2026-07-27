import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
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

  @Get('super/shops')
  @Roles(Role.SUPER_ADMIN)
  async getShops() {
    return this.shopService.getShops();
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

  @Get('shop/settings')
  @Roles(Role.SHOP_ADMIN)
  async getSettings(@Request() req) {
    return this.shopService.getSettings(req.user.shopId);
  }

  @Put('shop/settings')
  @Roles(Role.SHOP_ADMIN)
  async updateSettings(@Request() req, @Body() dto: UpdateSettingsDto) {
    return this.shopService.updateSettings(req.user.shopId, dto);
  }

  @Post('shop/settings/documents')
  @Roles(Role.SHOP_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadSettingsDocument(
    @Request() req,
    @Body('documentType') documentType: string,
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
    return this.shopService.addOrReplaceShopDocument(req.user.shopId, documentType, file);
  }

  @Delete('shop/settings/documents/:id')
  @Roles(Role.SHOP_ADMIN)
  async deleteSettingsDocument(@Request() req, @Param('id') id: string) {
    return this.shopService.deleteShopDocument(req.user.shopId, id);
  }

  @Post('shop/settings/referral')
  @Roles(Role.SHOP_ADMIN)
  async generateReferralCode(@Request() req) {
    return { referralCode: await this.shopService.getOrCreateReferralCode(req.user.shopId) };
  }
}
