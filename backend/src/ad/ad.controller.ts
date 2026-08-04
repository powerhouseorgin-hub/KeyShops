import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdService } from './ad.service';
import { CreateAdDto, UpdateAdDto } from './dto/ad.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdController {
  constructor(private readonly adService: AdService) {}

  // ==========================================
  // SUPER ADMIN CRUD ENDPOINTS
  // ==========================================

  @Get('super/advertisements')
  @Roles(Role.SUPER_ADMIN)
  async superGetAds() {
    return this.adService.getAllAds();
  }

  // Uploads a banner image to real file storage, returning a URL to send as
  // `imageUrl` in the create/update DTO below. Same 5MB/JPEG-PNG-WebP
  // limits as every other upload in this app - see PromotionController's
  // identical guard for the "why" (client already resizes before upload).
  @Post('super/advertisements/upload-image')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAdImage(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('An image file is required');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image size exceeds the 5MB limit');
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are accepted');
    }
    return this.adService.uploadImage(file);
  }

  @Post('super/advertisements')
  @Roles(Role.SUPER_ADMIN)
  async createAd(@Body() dto: CreateAdDto) {
    return this.adService.createAd(dto);
  }

  @Put('super/advertisements/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateAd(@Param('id') id: string, @Body() dto: UpdateAdDto) {
    return this.adService.updateAd(id, dto);
  }

  @Delete('super/advertisements/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteAd(@Param('id') id: string) {
    return this.adService.deleteAd(id);
  }

  // ==========================================
  // SHOP ADMIN ENDPOINTS
  // ==========================================

  @Get('shop/advertisements')
  @Roles(Role.SHOP_ADMIN)
  async shopGetAds(@Request() req) {
    return this.adService.getTargetedAds(req.user.shopId);
  }
}
