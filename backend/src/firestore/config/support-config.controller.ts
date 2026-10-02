import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformConfigService } from './platform-config.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

class SupportVideoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  url: string;
}

export class UpdateSupportConfigDto {
  @IsString()
  @IsNotEmpty()
  whatsapp: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportVideoDto)
  videos: SupportVideoDto[];

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  customerCareNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subscriptionPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  gstPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trialDays?: number;
}

// Public (no auth) - powers the pre-login landing page's support widgets and
// the self-registration wizard's trial-length/pricing display.
// PlatformConfigService.get() already matches this response shape exactly
// (whatsapp, videos, subscriptionPrice, gstPercent, email,
// customerCareNumber, trialDays) - no separate cache needed here since
// PlatformConfigService is a single small Firestore doc read.
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('support-config')
export class PublicSupportConfigController {
  constructor(private readonly platformConfig: PlatformConfigService) {}

  @Get()
  async get() {
    return this.platformConfig.get();
  }
}

@Controller('super/support-config')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class SuperSupportConfigController {
  constructor(private readonly platformConfig: PlatformConfigService) {}

  @Post()
  async update(@Body() dto: UpdateSupportConfigDto) {
    // Explicit-null-on-omit semantics for email/customerCareNumber (Firestore's `.set(..., {merge:true})`
    // would otherwise leave a previously-set value untouched when the field
    // is omitted from this request, not clear it).
    return this.platformConfig.update({
      whatsapp: dto.whatsapp,
      // class-transformer (@Type(() => SupportVideoDto), driven by the
      // global ValidationPipe's transform: true) turns each array element
      // into a real SupportVideoDto class instance, not a plain object -
      // Firestore's SDK rejects any value with a custom prototype ("found
      // in field videos.`0`"), so these need to be plain-object-mapped
      // before being written.
      videos: (dto.videos ?? []).map((v) => ({ name: v.name, url: v.url })),
      email: dto.email ?? null,
      customerCareNumber: dto.customerCareNumber ?? null,
      ...(dto.subscriptionPrice !== undefined ? { subscriptionPrice: dto.subscriptionPrice } : {}),
      ...(dto.gstPercent !== undefined ? { gstPercent: dto.gstPercent } : {}),
      ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
    });
  }
}
