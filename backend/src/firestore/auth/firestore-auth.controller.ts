import { BadRequestException, Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { invalidateAuthCache } from '../../auth/auth-cache';
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

// Authentication endpoints (/auth/*): login (Firebase password sign-in + session cookie / ID token), logout,
// OTP send/verify, shop self-registration, password reset/change, login-phone change and account deletion.
export class LoginDto {
  email: string; // identifier - email or phone (a dual-purpose field)
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

  // Backs GET /auth/me. `subscription` is only present during GRACE_PERIOD (not on every healthy
  // subscription): a bare truthiness check on the frontend would otherwise misread an always-present
  // field as "expired".
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

  // Response shape: `user` and the
  // conditional `subscription` field are both required, not cosmetic: the
  // frontend's AuthContext JSON.stringifies `res.user` straight into
  // localStorage on every login, and a missing `user` key there crashes
  // <AuthProvider> on the very next reload (JSON.parse("undefined")).
  @Throttle({ default: { limit: 20, ttl: 600000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    // dto.email is either a real email or a phone number (a dual-purpose
    // field) - resolved to whatever email Firebase
    // Auth actually has on file (real or synthetic) before attempting
    // sign-in, since Firebase's password sign-in only accepts an email.
    const resolvedEmail = await this.firebaseAuth.resolveLoginEmail(dto.email);
    if (!resolvedEmail) throw new UnauthorizedException('Invalid email or password');

    const { idToken, uid } = await this.firebaseAuth.signInWithPassword(resolvedEmail, dto.password);

    const profile = await this.users.findById(uid);
    if (!profile) throw new UnauthorizedException('Invalid email or password');

    // Shop Admin accounts may only sign in from the native mobile app; web login is reserved for Super Admin.
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

  // 4-digit codes (9000 values) need a strict per-route limit or an attacker
  // could brute-force one inside its 5-minute window.
  @Throttle({ default: { limit: 6, ttl: 600000 } })
  @Post('send-otp')
  async sendOtp(@Body() dto: { identifier: string; purpose: string }) {
    return this.otp.sendOtp(dto.identifier, dto.purpose);
  }

  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: { identifier: string; purpose: string; code: string }) {
    return this.otp.verifyOtp(dto.identifier, dto.purpose, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post('register-shop')
  async registerShop(@Body() dto: RegisterShopDto) {
    const normalizedPhone = normalizePhone(dto.phone);
    if (!normalizedPhone) throw new BadRequestException(PHONE_REGEX_MESSAGE);
    // Exactly 12 digits - checked before anything is created.
    if (dto.aadhaarNumber && !/^\d{12}$/.test(dto.aadhaarNumber)) {
      throw new BadRequestException('Aadhaar number must be exactly 12 digits');
    }

    // Payment gate: skipped entirely for a free-trial signup, otherwise Razorpay's signature must verify before
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

  // Unauthenticated by design (the user forgot their password) - a recently
  // verified 'reset' OTP for this exact phone IS the authentication.
  // redeemVerification is
  // single-use, so one verified code can reset one password once.
  @Throttle({ default: { limit: 6, ttl: 600000 } })
  @Post('reset-password-public')
  async resetPasswordPublic(@Body() dto: { identifier: string; method?: string; newPassword: string }) {
    const phone = normalizePhone(dto.identifier);
    if (!phone) throw new BadRequestException(PHONE_REGEX_MESSAGE);
    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }
    if (!(await this.otp.redeemVerification(phone, 'reset'))) {
      throw new BadRequestException('Please verify your OTP again before resetting your password.');
    }
    const profile = await this.users.findByEmailOrPhone(phone);
    if (!profile) throw new BadRequestException('No active profile registered with this phone number');

    await this.firebaseAuth.updatePassword(profile.id, dto.newPassword);
    invalidateAuthCache(profile.id);
    await this.logActivity(profile.id, profile.shopId, 'RESET_PASSWORD_PUBLIC', 'Password reset successfully via public phone recovery');
    return { success: true, message: 'Password reset successfully' };
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() dto: { oldPassword: string; newPassword: string }) {
    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }
    const email = await this.firebaseAuth.getAuthEmail(req.user.id);
    if (!email) throw new BadRequestException('User not found');
    try {
      await this.firebaseAuth.signInWithPassword(email, dto.oldPassword);
    } catch {
      throw new BadRequestException('Current password input is incorrect');
    }
    await this.firebaseAuth.updatePassword(req.user.id, dto.newPassword);
    await this.logActivity(req.user.id, req.user.shopId, 'CHANGE_PASSWORD', 'Password updated successfully');
    return { success: true, message: 'Password updated successfully' };
  }

  // Changes the caller's own login phone after the frontend has already run
  // the OTP flow against the NEW number ('change-credentials'). Only the
  // phone changes - the Firebase Auth login email (real, or the synthetic
  // one derived from the OLD phone) stays as-is, since login resolves a
  // phone to its account via the Auth user's phoneNumber, not via the email.
  @UseGuards(FirebaseAuthGuard)
  @Post('update-credentials')
  async updateLoginCredentials(@Req() req: any, @Body() dto: { newPhone?: string }) {
    if (!dto.newPhone) throw new BadRequestException('Provide a new phone number to update.');
    const phone = normalizePhone(dto.newPhone);
    if (!phone) throw new BadRequestException(PHONE_REGEX_MESSAGE);

    const uid: string = req.user.id;
    const db = this.firestore.db;
    const existing = await db.collection('phoneIndex').doc(phone).get();
    if (existing.exists && (existing.data() as any).uid !== uid) {
      throw new BadRequestException('This phone number is already in use by another account.');
    }
    if (!(await this.otp.redeemVerification(phone, 'change-credentials'))) {
      throw new BadRequestException('Please verify your new phone number with an OTP before saving.');
    }

    const userRef = db.collection('users').doc(uid);
    const oldPhone: string | null = req.user.phone ?? null;
    try {
      await this.firebaseAuth.updatePhoneNumber(uid, phone);
    } catch (err: any) {
      if (err.code === 'auth/phone-number-already-exists') {
        throw new BadRequestException('This phone number is already in use by another account.');
      }
      throw err;
    }
    const batch = db.batch();
    batch.update(userRef, { phone, updatedAt: Date.now() });
    batch.set(db.collection('phoneIndex').doc(phone), { uid });
    if (oldPhone && oldPhone !== phone) batch.delete(db.collection('phoneIndex').doc(oldPhone));
    await batch.commit();
    invalidateAuthCache(uid);

    await this.logActivity(uid, req.user.shopId, 'UPDATE_LOGIN_CREDENTIALS', 'Login credentials updated successfully', { fields: ['phone'] });
    return { success: true, email: req.user.email ?? null, phone };
  }

  // Closes the caller's own account (and, for a Shop Admin, their shop - one
  // user owns each shop, so these are the same action). Requires a recently
  // verified OTP against their own phone. Soft delete: the user/shop docs get deletedAt, the Auth user is disabled and
  // its sessions revoked, so the very next request 401s.
  @UseGuards(FirebaseAuthGuard)
  @Delete('account')
  async deleteAccount(@Req() req: any) {
    const uid: string = req.user.id;
    const phone: string | null = req.user.phone ?? null;
    if (!phone) throw new BadRequestException('Account deletion requires a verified phone number.');
    if (!(await this.otp.redeemVerification(phone, 'delete-account'))) {
      throw new BadRequestException('Please verify your phone number with an OTP before deleting your account.');
    }

    const db = this.firestore.db;
    const now = Date.now();
    const batch = db.batch();
    batch.update(db.collection('users').doc(uid), { deletedAt: now, updatedAt: now });
    if (req.user.shopId) batch.update(db.collection('shops').doc(req.user.shopId), { deletedAt: now, updatedAt: now });
    await batch.commit();
    await this.firebaseAuth.disableUser(uid);
    invalidateAuthCache(uid);

    await this.logActivity(uid, req.user.shopId, 'DELETE_ACCOUNT', 'Account deleted by user request', { email: req.user.email, phone });
    return { success: true, message: 'Your account has been deleted.' };
  }

  private async logActivity(userId: string, shopId: string | null, action: string, message: string, extra: Record<string, unknown> = {}) {
    await this.firestore.db.collection('activityLogs').add({
      shopId, userId, action,
      details: JSON.stringify({ message, ...extra }),
      ipAddress: null, createdAt: Date.now(),
    }).catch((err) => console.error(`Failed to write ${action} activity log for user`, userId, err));
  }
}
