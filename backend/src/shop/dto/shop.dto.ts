import { IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean, IsHexColor, IsNumber, MinLength } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class CreateShopDto {
  @IsString()
  @IsNotEmpty({ message: 'Shop name is required' })
  name: string;

  @IsString()
  @IsOptional()
  companyDetails?: string;

  @IsString()
  @IsOptional()
  @IsHexColor({ message: 'Theme color must be a valid hex color' })
  themeColor?: string;

  // Verification documents, provided as base64 data URIs. Persisted as real
  // files + ShopDocument rows (NOT stored in companyDetails - see AuthService/
  // ShopService.persistShopDocuments).
  @IsString()
  @IsOptional()
  shopPhoto?: string;

  @IsString()
  @IsOptional()
  shopLicense?: string;

  @IsString()
  @IsOptional()
  ownerAadhaar?: string;

  // Initial Admin User Info
  @IsString()
  @IsNotEmpty({ message: 'Admin email is required' })
  adminEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'Admin name is required' })
  adminName: string;

  @IsString()
  @IsNotEmpty({ message: 'Admin initial password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  adminPassword: string;

  // Login identifier alongside adminEmail - matches self-registration's
  // RegisterShopDto.phone (see AuthService.registerShop). Format is not
  // enforced by decorator here for the same reason: ShopService.createShop
  // normalizes it itself before use. This was previously missing entirely,
  // so a Super-Admin-provisioned shop's phone (typed into the form) was only
  // ever saved inside companyDetails' free-text JSON, never onto the User
  // row - meaning that phone number could never actually be used to log in.
  @IsString()
  @IsNotEmpty({ message: 'Admin phone number is required' })
  adminPhone: string;

  // References a ShopCategory row, same as self-registration's
  // RegisterShopDto.categoryId - required there, so required here too for
  // parity ("same required fields" as the self-service flow).
  @IsString()
  @IsNotEmpty({ message: 'Please select a shop category' })
  categoryId: string;

  // Auto-filled from the "Current Location" reverse-geocode, same as
  // RegisterShopDto's equivalent fields - all optional since a Super Admin
  // can type the address manually instead of using GPS.
  @IsOptional()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  district?: string;

  // Unlike town/district above, state/pinCode have no dedicated Shop column
  // anywhere in this app (see registerShop) - they only ever live inside
  // companyDetails' JSON, which the frontend already builds and sends as a
  // whole, so no separate field is needed for them here.

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class UpdateShopDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  companyDetails?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  themeColor?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateSettingsDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  companyDetails?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  themeColor?: string;
}

// Only a single yearly plan exists platform-wide, so managing a subscription
// just means setting its status - renewing always creates a fresh one-year
// window starting now (see ShopService.updateSubscription).
export class ManageSubscriptionDto {
  @IsEnum(SubscriptionStatus)
  @IsNotEmpty({ message: 'Subscription status is required' })
  status: SubscriptionStatus;
}
