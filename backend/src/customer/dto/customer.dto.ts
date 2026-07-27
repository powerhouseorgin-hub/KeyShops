import { IsNotEmpty, IsString, IsOptional, IsNumber, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../../common/validators/phone';

// Inline "register this key blank while creating the customer" payload, used when
// the shop admin typed a key number that doesn't match anything in the existing
// catalog (see CreateCustomerDto.manualKey doc comment for why this must travel
// in the SAME request as the customer, not a separate prior request).
export class ManualKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  category: string;
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(PHONE_REGEX, { message: PHONE_REGEX_MESSAGE })
  phone: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  idProofType?: string;

  @IsString()
  @IsOptional()
  idProofNumber?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsNotEmpty({ message: 'Key number is required' })
  keyNumber: string;

  @IsString()
  @IsOptional()
  vehicleNumber?: string;

  @IsString()
  @IsOptional()
  masterKeyId?: string;

  // Set instead of masterKeyId when the shop admin typed a key number that isn't in
  // the existing catalog. The MasterKey row it describes is created atomically with
  // this customer (same DB transaction) so it can never be persisted without an
  // owning customer — see CustomerService.createCustomer for why this matters:
  // the previous flow had the frontend call POST /shop/keys as a separate prior
  // request, so if customer creation failed afterwards (network error, validation
  // error, payload-too-large, etc.) the key row was left permanently orphaned with
  // zero customers referencing it (real example: key TN69097).
  @IsOptional()
  @ValidateNested()
  @Type(() => ManualKeyDto)
  manualKey?: ManualKeyDto;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  mapsLink?: string;

  @IsString()
  @IsOptional()
  capturedAddress?: string;

  @IsString()
  @IsOptional()
  photoBase64?: string;
}

// SUPER ADMIN: same shape as CreateCustomerDto, plus a required target shop.
// The Super Admin picks which shop's compliance registry the new customer
// belongs to; everything else follows the normal customer-creation flow
// (CustomerService.createCustomer is reused as-is with this shopId).
export class CreateSuperCustomerDto extends CreateCustomerDto {
  @IsString()
  @IsNotEmpty({ message: 'Shop is required' })
  shopId: string;
}

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_REGEX_MESSAGE })
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  idProofType?: string;

  @IsString()
  @IsOptional()
  idProofNumber?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  keyNumber?: string;

  @IsString()
  @IsOptional()
  vehicleNumber?: string;
}
