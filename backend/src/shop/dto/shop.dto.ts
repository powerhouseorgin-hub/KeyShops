import { IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean, IsHexColor, IsDateString } from 'class-validator';
import { Plan, SubscriptionStatus } from '@prisma/client';

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
  adminPassword?: string;

  // Initial subscription
  @IsEnum(Plan)
  @IsNotEmpty({ message: 'Subscription plan is required' })
  plan: Plan;

  @IsDateString()
  @IsNotEmpty({ message: 'Subscription end date is required' })
  endDate: string;
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

export class ManageSubscriptionDto {
  @IsEnum(Plan)
  @IsNotEmpty({ message: 'Plan is required' })
  plan: Plan;

  @IsEnum(SubscriptionStatus)
  @IsNotEmpty({ message: 'Subscription status is required' })
  status: SubscriptionStatus;

  @IsDateString()
  @IsNotEmpty({ message: 'Start date is required' })
  startDate: string;

  @IsDateString()
  @IsNotEmpty({ message: 'End date is required' })
  endDate: string;
}
