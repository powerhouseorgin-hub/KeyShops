import { IsEmail, IsNotEmpty, IsString, IsOptional, MinLength, Matches, IsNumber, IsUrl } from 'class-validator';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../../common/validators/phone';

export class LoginDto {
  // Accepts either the account's email address OR its mobile number - both
  // are valid login identifiers sharing the same password (see
  // AuthService.login). Kept as `email` (rather than renaming to
  // `identifier`) to avoid a breaking API change; validation is relaxed to
  // a plain non-empty string since a phone number isn't valid email format.
  @IsString()
  @IsNotEmpty({ message: 'Email address or mobile number is required' })
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

// Native app's phone verification via Firebase Phone Auth (see
// AuthService.verifyFirebasePhoneToken) - the OTP itself was already
// generated, sent, and checked entirely by Firebase on the device; this
// DTO just carries the resulting ID token in for the backend to confirm
// it's genuine and actually covers the phone number being verified.
export class VerifyFirebasePhoneDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // the phone number the caller claims this token verifies

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsString()
  @IsNotEmpty({ message: 'Firebase ID token is required' })
  idToken: string;
}

// Public self-registration wizard's payload - two steps on the frontend:
// Step 1 (basic details - name, shop name, address+GPS, city, state, PIN
// code, optional Aadhaar number, email, OTP-verified mobile number,
// password, all in one flat form) and Step 2 (payment for the single yearly
// plan only - see AuthService.registerShop, which always creates a YEARLY
// subscription).
// Both email and phone double as login identifiers post-registration (see
// AuthService.login) and must each be unique across all shop accounts -
// enforced in AuthService.registerShop().
export class RegisterShopDto {
  @IsString()
  @IsNotEmpty()
  shopName: string;

  @IsString()
  @IsNotEmpty()
  ownerName: string;

  // Optional - a shop can self-register with just a mobile number and log in
  // with that alone (see AuthService.login/registerShop). When provided, it's
  // still validated as a well-formed email and must be unique.
  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_REGEX_MESSAGE })
  phone: string;

  // References a ShopCategory row (see shop-category module), picked from
  // the Super-Admin-curated dropdown on the registration form. Defines what
  // "type" of shop this account is (e.g. Dealers).
  @IsString()
  @IsNotEmpty({ message: 'Please select a shop category' })
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  // City/state/PIN code are only ever auto-filled from reverse-geocoding the
  // GPS position captured by the "Current Location" button (Nominatim's
  // district/state fields - see geo.controller.ts) - there is no manual input
  // for them on the form (the visible Address field is the only editable
  // location text). Making these required blocked registration entirely
  // whenever GPS/reverse-geocoding failed (no permission, GPS disabled, no
  // signal, etc.), since there was then no way to ever satisfy them - see
  // the "Current Location" bug fix in App.jsx's Shop Registration Continue
  // handler. `location` (the free-text address) remains the one truly
  // required location field.
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN code must be exactly 6 digits' })
  pinCode?: string;

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

  // Captured alongside `location` by the "Current Location" GPS button (see
  // captureShopLocation in App.jsx) - optional since a shop owner can type
  // the address manually instead of using GPS.
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  // Optional referral code entered by the new shop owner, generated by another
  // shop admin via the "Refer" button in Shop Settings. Validated against
  // existing Shop.referralCode values in AuthService.registerShop().
  @IsOptional()
  @IsString()
  referralCode?: string;

  // Optional shop website, gated behind an ON/OFF toggle on the registration
  // form (default OFF). Stored inside Shop.companyDetails JSON alongside
  // gst/city/state/pinCode rather than as its own column - see
  // AuthService.registerShop().
  @IsOptional()
  @IsUrl({}, { message: 'Please enter a valid website URL' })
  website?: string;

  // Razorpay Checkout's success-handler response for the subscription order
  // created via PaymentService.createSubscriptionOrder just before this
  // form was submitted - verified server-side in AuthService.registerShop
  // before the shop account is created (see PaymentService.verifyPaymentSignature).
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}
