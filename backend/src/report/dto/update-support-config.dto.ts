import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator';

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
}
