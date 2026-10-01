import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirestoreAdService, type CreateAdInput } from './firestore-ad.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '@prisma/client';

// IMPORTANT: FirebaseAuthGuard only proves "this request is authenticated
// as someone" - it does NOT check role. RolesGuard (reused unchanged from
// the pre-migration code - it's pure Reflector + req.user.role, no Prisma
// dependency at all) must run alongside it on every route that isn't
// meant for both roles equally. A live HTTP test caught this exact gap
// during development - a Shop Admin token was able to create a
// Super-Admin-only ad before this was added.
@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class FirestoreAdController {
  constructor(private readonly ads: FirestoreAdService) {}

  @Get('super/advertisements')
  @Roles(Role.SUPER_ADMIN)
  async superGetAds() {
    return this.ads.getAllAds();
  }

  @Post('super/advertisements/upload-image')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAdImage(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('An image file is required');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Image size exceeds the 5MB limit');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are accepted');
    }
    return this.ads.uploadImage(file);
  }

  @Post('super/advertisements')
  @Roles(Role.SUPER_ADMIN)
  async createAd(@Body() dto: CreateAdInput) {
    return this.ads.createAd(dto);
  }

  @Put('super/advertisements/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateAd(@Param('id') id: string, @Body() dto: Partial<CreateAdInput>) {
    return this.ads.updateAd(id, dto);
  }

  @Delete('super/advertisements/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteAd(@Param('id') id: string) {
    return this.ads.deleteAd(id);
  }

  @Get('shop/advertisements')
  @Roles(Role.SHOP_ADMIN)
  async shopGetAds(@Req() req: any) {
    return this.ads.getTargetedAds(req.user.shopId);
  }
}
