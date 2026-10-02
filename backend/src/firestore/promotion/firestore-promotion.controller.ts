import { BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { FirestorePromotionService, type CreatePromotionInput } from './firestore-promotion.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '@prisma/client';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function assertValidImageUpload(file: any) {
  if (!file) throw new BadRequestException('An image file is required');
  if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Image size exceeds the 5MB limit');
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException('Only JPEG, PNG, and WebP images are accepted');
  }
}

// See FirestorePromotionService's class doc comment: `search` is accepted
// here for API-shape compatibility with the old client but silently has no
// effect yet - it's blocked on the Algolia setup called out in the
// migration plan, not forgotten.
@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class FirestorePromotionController {
  constructor(private readonly promotions: FirestorePromotionService) {}

  @Get('promotions')
  async getAllPromotions(
    @Req() req: any,
    @Query('includeExpiredOffers') includeExpiredOffers?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('type') type?: 'PRODUCT' | 'AD' | 'OFFER',
    @Query('excludeOffers') excludeOffers?: string,
    @Query('mine') mine?: string,
    @Query('town') town?: string,
    @Query('search') search?: string,
  ) {
    return this.promotions.getAllPromotions({
      includeExpiredOffers: includeExpiredOffers === 'true',
      cursor,
      limit: limit ? Number(limit) : undefined,
      category: category || undefined,
      type: type || undefined,
      excludeOffers: excludeOffers === 'true',
      town: town || undefined,
      search: search || undefined,
      ...(mine === 'true' ? { ownerShopId: req.user.shopId ?? null, ownerUserId: req.user.id } : {}),
    });
  }

  @Post('shop/promotions/upload-image')
  @Roles(Role.SHOP_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadShopPromotionImage(@Req() req: any, @UploadedFile() file: any) {
    assertValidImageUpload(file);
    return this.promotions.uploadImage(req.user.shopId, file);
  }

  @Post('shop/promotions')
  @Roles(Role.SHOP_ADMIN)
  async createPromotion(@Req() req: any, @Body() dto: CreatePromotionInput) {
    return this.promotions.createPromotion(req.user.shopId, req.user.id, dto);
  }

  @Put('shop/promotions/:id')
  @Roles(Role.SHOP_ADMIN)
  async updateOwnPromotion(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreatePromotionInput>) {
    return this.promotions.updatePromotionAsShop(id, req.user.shopId, dto);
  }

  @Delete('shop/promotions/:id')
  @Roles(Role.SHOP_ADMIN)
  async deleteOwnPromotion(@Req() req: any, @Param('id') id: string) {
    return this.promotions.deletePromotionAsShop(id, req.user.shopId);
  }

  @Post('super/promotions/upload-image')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadSuperPromotionImage(@UploadedFile() file: any) {
    assertValidImageUpload(file);
    return this.promotions.uploadImage(null, file);
  }

  @Post('super/promotions')
  @Roles(Role.SUPER_ADMIN)
  async createPromotionAsSuperAdmin(@Req() req: any, @Body() dto: CreatePromotionInput) {
    return this.promotions.createPromotion(null, req.user.id, dto);
  }

  @Put('super/promotions/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateAnyPromotion(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreatePromotionInput>) {
    return this.promotions.updatePromotionAsSuperAdmin(id, req.user.id, dto);
  }

  @Delete('super/promotions/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteAnyPromotion(@Req() req: any, @Param('id') id: string) {
    return this.promotions.deletePromotionAsSuperAdmin(id, req.user.id);
  }
}

// PUBLIC (no auth): pre-login mobile app's Machines/Products directory.
// `search` is accepted for shape-compatibility but not yet implemented -
// see the class doc comment on FirestorePromotionService.
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('public/machines')
export class PublicPromotionController {
  constructor(private readonly promotions: FirestorePromotionService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async list(
    @Query('category') category?: string,
    @Query('town') town?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('shopId') shopId?: string,
    @Query('search') search?: string,
  ) {
    return this.promotions.getPublicPromotions({
      category, town, cursor, shopId, search: search || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const promotion = await this.promotions.getPublicPromotionById(id);
    if (!promotion) throw new NotFoundException('Listing not found');
    return promotion;
  }
}
