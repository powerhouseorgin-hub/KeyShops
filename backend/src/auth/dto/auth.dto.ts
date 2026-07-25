import { IsEmail, IsNotEmpty, IsString, IsOptional, MinLength, Matches, IsNumber } from 'class-validator';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../../common/validators/phone';

export class LoginDto {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  // Sent by the frontend so the backend can tell a browser login apart from
  // the native Android/iOS app (Capacitor.isNativePlatform()). Optional and
  // defaults to 'web' when omitted, so older/unaware clients are still
  // treated as web for the Shop Admin web-login restriction below.
  @IsOptional()
  @IsString()
  platform?: string; // 'web' | 'native'
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Old password is required' })
  oldPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  newPassword: string;
}

export class ResetPasswordPublicDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @IsNotEmpty()
  method: string; // 'email' | 'phone'

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  newPassword: string;
}

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @IsNotEmpty()
  method: string; // 'email' | 'phone'

  @IsString()
  @IsNotEmpty()
  purpose: string; // 'register' | 'reset' | 'customer_verify' etc.
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsNotEmpty()
  purpose: string;

  @IsString()
  @IsNotEmpty({ message: 'OTP code is required' })
  code: string;
}

// Public self-registration wizard's payload - two steps on the frontend:
// Step 1 (shop/owner details, matches the app's registration screenshot -
// name, shop name, address+GPS, city, state, PIN code, optional Aadhaar
// number, OTP-verified mobile number) and Step 2 (password, plan, payment).
// There's no `email` field - login credentials aren't collected from the
// shop owner directly; AuthService.registerShop() auto-generates a login
// email from the verified phone number and returns it in the response so
// it can be shown to the owner once (see the Step 2 success screen).
export class RegisterShopDto {
  @IsString()
  @IsNotEmpty()
  shopName: string;

  @IsString()
  @IsNotEmpty()
  ownerName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_REGEX_MESSAGE })
  phone: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  // City & state are auto-filled on the frontend from reverse-geocoding the
  // GPS position captured by the "Current Location" button (Nominatim's
  // district/state fields - see geo.controller.ts) but stay editable, so
  // they're still required here rather than derived server-side.
  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'PIN code must be exactly 6 digits' })
  pinCode: string;

  // Optional - captured as a plain 12-digit number (not an uploaded
  // document) and encrypted at rest, see AuthService.registerShop().
  @IsOptional()
  @IsString()
  @Matches(/^\d{12}$/, { message: 'Aadhaar number must be exactly 12 digits' })
  aadhaarNumber?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  plan: string; // 'MONTHLY' | 'HALF_YEARLY' | 'YEARLY' (the free trial plan has been retired)

  // Captured alongside `location` by the "Current Location" GPS button (see
  // captureShopLocation in App.jsx) - optional since a shop owner can type
  // the address manually instead of using GPS.
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}
