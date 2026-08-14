import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsDateString, IsArray, ArrayMaxSize } from 'class-validator';
import { PromotionType } from '@prisma/client';

// Listing photo cap - see PromotionService.clampImageUrls, which enforces
// this same limit server-side regardless of what the client sends.
export const PROMOTION_MAX_PHOTOS = 4;

export class CreatePromotionDto {
  @IsEnum(PromotionType)
  @IsNotEmpty({ message: 'Promotion type is required' })
  type: PromotionType;

  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  // Up to PROMOTION_MAX_PHOTOS URLs, in display order - the service clamps
  // to the cap and syncs `imageUrl` to imageUrls[0] regardless of what's
  // sent here, so this validator only rejects grossly oversized payloads.
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(PROMOTION_MAX_PHOTOS)
  @IsOptional()
  imageUrls?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  // Optional on any listing type - for PRODUCT this is an optional offer
  // percent, used to compute and display a discounted price.
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  // OFFER-only.
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsString()
  @IsOptional()
  linkedPromotionId?: string;

  // Inventory category shown on the OLX-style product grid. As of the
  // "Product Type" rework this is the sole classification a listing has -
  // the frontend's Listing Type (AD/OFFER) picker was removed, so every new
  // listing is created with type === PRODUCT and categorized only here.
  @IsString()
  @IsOptional()
  productType?: string;

  // Seller contact number, required for every new listing - shown on the
  // product card as a tap-to-call button.
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone: string;
}

export class UpdatePromotionDto {
  @IsEnum(PromotionType)
  @IsOptional()
  type?: PromotionType;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(PROMOTION_MAX_PHOTOS)
  @IsOptional()
  imageUrls?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsString()
  @IsOptional()
  linkedPromotionId?: string;

  @IsString()
  @IsOptional()
  productType?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
