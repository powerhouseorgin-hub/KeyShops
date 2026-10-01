import { BadRequestException, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { FirebaseAuthService, syntheticEmailForPhone } from './firebase-auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { ShopRegistrationService, type RegisterShopInput } from '../shop/shop-registration.service';
import { WhatsappOtpService } from '../whatsapp-otp.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirestoreService } from '../firestore.service';
import { UserRepository } from '../shop/user.repository';
import { getShopSubscriptionStateFirestore } from './firestore-subscription-status';
import { SUBSCRIPTION_EXPIRED_MESSAGE } from '../../common/subscription-status';
import { sessionCookieOptions, clearedSessionCookieOptions, SESSION_COOKIE_NAME } from '../../common/session-cookie';
import { verifyRazorpaySignature } from '../payment/verify-razorpay-signature';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../../common/validators/phone';

// Firestore/Firebase-Auth counterpart to AuthController - same route paths
// (/auth/login, /auth/register-shop, /auth/send-otp, /auth/verify-otp) so
// this is a drop-in replacement at cutover time, not a parallel API
// surface the frontend would need to learn about.
export class LoginDto {
  email: string; // identifier - email or phone, same dual-purpose field as before
  password: string;
  platform?: string;
}

export class RegisterShopDto {
  shopName: string;
  ownerName: string;
  email?: string;
  phone: string;
  password: string;
  location: string;
  town?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  categoryId: string;
  aadhaarNumber?: string;
  referralCode?: string;
  startTrial?: boolean;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

@Controller('auth')
export class FirestoreAuthController {
  constructor(
    private readonly firebaseAuth: FirebaseAuthService,
    private readonly registration: ShopRegistrationService,
    private readonly otp: WhatsappOtpService,
    private readonly firestore: FirestoreService,
    private readonly users: UserRepository,
  ) {}

  // Backs GET /auth/me - see AuthService.getSessionInfo's doc comment for
  // why `subscription` is only present during GRACE_PERIOD (not on every
  // healthy subscription): a bare truthiness check on the frontend
  // otherwise misreads an always-present field as "expired".
  @UseGuards(FirebaseAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    const user = req.user;
    if (user.role !== 'SHOP_ADMIN' || !user.shopId) {
      return { user };
    }
    const subscription = await getShopSubscriptionStateFirestore(this.firestore, user.shopId);
    return { user, ...(subscription.state === 'GRACE_PERIOD' ? { subscription } : {}) };
  }

  // Matches AuthService.login's exact response shape - `user` and the
  // conditional `subscription` field are both required, not cosmetic: the
  // frontend's AuthContext JSON.stringifies `res.user` straight into
  // localStorage on every login, and a missing `user` key there crashes
  // <AuthProvider> on the very next reload (JSON.parse("undefined")).
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    // dto.email is either a real email or a phone number (same dual-purpose
    // field as the pre-migration DTO) - resolved to whatever email Firebase
    // Auth actually has on file (real or synthetic) before attempting
    // sign-in, since Firebase's password sign-in only accepts an email.
    const resolvedEmail = await this.firebaseAuth.resolveLoginEmail(dto.email);
    if (!resolvedEmail) throw new UnauthorizedException('Invalid email or password');

    const { idToken, uid } = await this.firebaseAuth.signInWithPassword(resolvedEmail, dto.password);

    const profile = await this.users.findById(uid);
    if (!profile) throw new UnauthorizedException('Invalid email or password');

    // Shop Admin accounts may only sign in from the native mobile app - same
    // restriction as before, web login is reserved for Super Admin.
    if (profile.role === 'SHOP_ADMIN' && dto.platform !== 'native') {
      throw new UnauthorizedException('Shop Admin accounts can only sign in from the Key Shop mobile app. Please download the app to continue.');
    }

    let subscription: { state: string; daysRemaining: number | null; endDate: number | null } | null = null;
    if (profile.role === 'SHOP_ADMIN' && profile.shopId) {
      const shopDoc = await this.firestore.db.collection('shops').doc(profile.shopId).get();
      if (!shopDoc.exists || !(shopDoc.data() as any)?.isActive) {
        throw new UnauthorizedException('Your shop access has been suspended');
      }
      subscription = await getShopSubscriptionStateFirestore(this.firestore, profile.shopId);
      if (subscription.state === 'GRACE_PERIOD_EXPIRED') {
        throw new UnauthorizedException(SUBSCRIPTION_EXPIRED_MESSAGE);
      }
    }

    this.firestore.db.collection('activityLogs').add({
      shopId: profile.shopId, userId: uid, action: 'LOGIN',
      details: JSON.stringify({ message: `${profile.name} logged in`, email: profile.email, name: profile.name }),
      ipAddress: null, createdAt: Date.now(),
    }).catch((err) => console.error('Failed to write LOGIN activity log for user', uid, err));

    const user = { id: uid, email: profile.email, phone: profile.phone, name: profile.name, role: profile.role, shopId: profile.shopId };
    const extra = subscription && subscription.state === 'GRACE_PERIOD' ? { subscription } : {};

    if (dto.platform !== 'native') {
      const sessionCookie = await this.firebaseAuth.createSessionCookie(idToken, 24 * 60 * 60 * 1000);
      res.cookie(SESSION_COOKIE_NAME, sessionCookie, sessionCookieOptions());
      return { accessToken: sessionCookie, user, ...extra };
    }
    return { accessToken: idToken, user, ...extra };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
    return { success: true };
  }

  @Post('send-otp')
  async sendOtp(@Body() dto: { identifier: string; purpose: string }) {
    return this.otp.sendOtp(dto.identifier, dto.purpose);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: { identifier: string; purpose: string; code: string }) {
    return this.otp.verifyOtp(dto.identifier, dto.purpose, dto.code);
  }

  @Post('register-shop')
  async registerShop(@Body() dto: RegisterShopDto) {
    const normalizedPhone = normalizePhone(dto.phone);
    if (!normalizedPhone) throw new BadRequestException(PHONE_REGEX_MESSAGE);

    // Same payment gate as the pre-migration code: skipped entirely for a
    // free-trial signup, otherwise Razorpay's signature must verify before
    // any Auth user or Firestore doc gets created.
    if (!dto.startTrial) {
      if (!dto.razorpayOrderId || !dto.razorpayPaymentId || !dto.razorpaySignature) {
        throw new BadRequestException('Payment details are required to complete registration.');
      }
      const valid = verifyRazorpaySignature(dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
      if (!valid) throw new BadRequestException('Payment verification failed. Please try again.');
    }

    // Firebase Auth user first (it owns uniqueness/password storage) - the
    // Firestore transaction then uses this uid as the User doc's ID. If the
    // transaction fails for any reason, the Auth user is rolled back too, so
    // there's no orphaned login with no Firestore profile. Firebase Auth
    // enforces its own email/phone uniqueness BEFORE the Firestore
    // transaction's own index-collision check ever runs, so its duplicate
    // errors have to be translated here too - left unhandled, they surfaced
    // as an opaque 500 instead of the same friendly 400 the Firestore-side
    // check gives for the identical situation.
    let authUser;
    try {
      authUser = await this.firebaseAuth.createUser({
        email: dto.email || syntheticEmailForPhone(normalizedPhone),
        phoneNumber: normalizedPhone,
        password: dto.password,
        displayName: dto.ownerName,
      });
    } catch (err: any) {
      if (err.code === 'auth/phone-number-already-exists') {
        throw new BadRequestException('This mobile number is already registered to another shop');
      }
      if (err.code === 'auth/email-already-exists') {
        throw new BadRequestException('This email address is already registered to another user');
      }
      throw err;
    }

    const input: RegisterShopInput = {
      uid: authUser.uid,
      shopName: dto.shopName,
      ownerName: dto.ownerName,
      email: dto.email,
      phone: normalizedPhone,
      location: dto.location,
      town: dto.town,
      district: dto.district,
      latitude: dto.latitude,
      longitude: dto.longitude,
      categoryId: dto.categoryId,
      aadhaarNumber: dto.aadhaarNumber,
      referralCode: dto.referralCode,
      startTrial: dto.startTrial,
    };

    try {
      const result = await this.registration.registerShop(input);
      await this.firebaseAuth.setCustomClaims(authUser.uid, { role: 'SHOP_ADMIN', shopId: result.shopId });
      return {
        success: true,
        shopId: result.shopId,
        loginPhone: normalizedPhone,
        message: 'Registration successful! Your shop account is now active - you can log in right away.',
      };
    } catch (err) {
      // Roll back the orphaned Auth user rather than leaving a login with
      // no Firestore profile behind it.
      await this.firebaseAuth.deleteUser(authUser.uid).catch(() => {});
      throw err;
    }
  }
}

@Controller('auth-test')
@UseGuards(FirebaseAuthGuard)
export class AuthGuardSmokeTestController {
  @Post('whoami')
  async whoami() {
    return { ok: true };
  }
}
