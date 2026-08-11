import { Injectable, UnauthorizedException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantService } from '../tenant/tenant.service';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { LoginDto, ChangePasswordDto, ResetPasswordPublicDto, RegisterShopDto, VerifyFirebasePhoneDto } from './dto/auth.dto';
import { Role } from '@prisma/client';
import { PHONE_REGEX, PHONE_REGEX_MESSAGE } from '../common/validators/phone';
import { CryptoService } from '../crypto/crypto.service';
import { PaymentService } from '../payment/payment.service';
import { getFirebaseAdminApp } from './firebase-admin';
import { getAuth } from 'firebase-admin/auth';

// bcrypt's cost factor is exponential (each +1 roughly doubles the CPU time
// spent per hash/compare) - 12 was fine on typical hardware (~200-300ms) but
// measured ~1.5-1.8s per login on this app's actual production host (Render),
// which has much weaker/shared CPU. 10 is still well above OWASP's current
// minimum recommendation and cuts that cost by roughly 4x. This only affects
// hashes created from here on - see login()'s upgrade-on-verify step below
// for how existing users' already-cost-12 hashes get migrated transparently.
const PASSWORD_HASH_COST = 10;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
    private readonly cryptoService: CryptoService,
    private readonly paymentService: PaymentService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultRecords();
  }

  private async seedDefaultRecords() {
    try {
      // Check if any Super Admin exists
      const superAdminCount = await this.tenantService.prisma.user.count({
        where: { role: Role.SUPER_ADMIN },
      });

      if (superAdminCount === 0) {
        // Credentials are configurable via env vars so production deploys
        // don't ship with a known hardcoded password. Falls back to the
        // original dev-only defaults when unset (local Docker dev only).
        const seedEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@kee.com';
        const seedPassword = process.env.SEED_SUPER_ADMIN_PASSWORD || 'adminpassword';
        const seedName = process.env.SEED_SUPER_ADMIN_NAME || 'KEE Platform Administrator';

        console.log('No Super Admin found. Auto-seeding Super Admin credentials...');
        const salt = await bcrypt.genSalt(PASSWORD_HASH_COST);
        const passwordHash = await bcrypt.hash(seedPassword, salt);

        await this.tenantService.prisma.user.create({
          data: {
            email: seedEmail,
            name: seedName,
            passwordHash,
            role: Role.SUPER_ADMIN,
          },
        });
        console.log(`Auto-seeded Super Admin: ${seedEmail}`);

        // Intentionally no demo Shop/Shop Admin is seeded here. In production,
        // shop accounts are created through the app's own self-registration
        // flow (or by the Super Admin via "Provision New Shop"), not auto-seeded.
      }
    } catch (err) {
      console.error('Error during auto-seeding:', err.message);
    }
  }

  async sendOtp(dto: { identifier: string, method: string, purpose?: string }) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (dto.method === 'email' && !emailRegex.test(dto.identifier)) {
      throw new BadRequestException('Invalid email address format');
    }
    if (dto.method === 'phone' && !PHONE_REGEX.test(dto.identifier)) {
      throw new BadRequestException(PHONE_REGEX_MESSAGE);
    }

    if (dto.purpose === 'register') {
      if (dto.method === 'email') {
        const existing = await this.tenantService.prisma.user.findUnique({
          where: { email: dto.identifier },
        });
        if (existing) {
          throw new BadRequestException('Email address already registered to another user');
        }
      }
      if (dto.method === 'phone') {
        const existing = await this.tenantService.prisma.user.findUnique({
          where: { phone: dto.identifier },
        });
        if (existing) {
          throw new BadRequestException('This mobile number is already registered to another shop');
        }
      }
    }

    if (dto.purpose === 'reset') {
      if (dto.method === 'email') {
        const existing = await this.tenantService.prisma.user.findUnique({
          where: { email: dto.identifier },
        });
        if (!existing) {
          throw new BadRequestException('No registered account found with this email');
        }
      }
    }

    const otpCode = String(Math.floor(1000 + Math.random() * 9000));
    const purpose = dto.purpose || 'default';

    await this.tenantService.prisma.otpCode.updateMany({
      where: { identifier: dto.identifier, purpose, consumed: false },
      data: { consumed: true },
    });

    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(otpCode, salt);
    await this.tenantService.prisma.otpCode.create({
      data: {
        identifier: dto.identifier,
        method: dto.method,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    let delivered = false;

    if (dto.method === 'email') {
      const host = process.env.SMTP_HOST || '';
      const user = process.env.SMTP_USER || '';
      const pass = process.env.SMTP_PASS || '';

      if (host && user && pass) {
        const transporter = nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: { user, pass },
        });

        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || '"KEE Key Space Platform" <no-reply@kee.com>',
            to: dto.identifier,
            subject: 'KEE Secure Verification Code',
            text: `Your KEE verification code is: ${otpCode}`,
            html: `<h3>KEE Verification Code</h3><p>Your OTP code is: <strong>${otpCode}</strong></p>`,
          });
          delivered = true;
        } catch (err) {
          console.error('SMTP email send failed:', err.message);
        }
      }
    } else {
      // MSG91's OTP-send endpoint, passed our own bcrypt-hashed-and-stored
      // `otpCode` as the `otp` query param rather than letting MSG91 generate
      // and verify it themselves - keeps verifyOtp() below (DB-backed,
      // already working) as the single source of truth, MSG91 is purely a
      // delivery channel. template_id must be an approved OTP template in
      // the MSG91 dashboard (DLT-registered, required for Indian numbers).
      const authKey = process.env.MSG91_AUTH_KEY || '';
      const templateId = process.env.MSG91_OTP_TEMPLATE_ID || '';

      if (authKey && templateId) {
        try {
          const digits = dto.identifier.replace(/\D/g, '');
          const mobile = digits.length === 10 ? `91${digits}` : digits;
          const params = new URLSearchParams({
            authkey: authKey,
            template_id: templateId,
            mobile,
            otp: otpCode,
          });
          const res = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`, { method: 'POST' });
          const body = await res.json();
          if (res.ok && body.type === 'success') {
            delivered = true;
          } else {
            console.error('MSG91 SMS send failed:', body);
          }
        } catch (err) {
          console.error('MSG91 SMS send failed:', err.message);
        }
      }
    }

    if (!delivered) {
      console.log(`[OTP dev fallback] No ${dto.method} provider configured — code for ${dto.identifier}: ${otpCode}`);
    }

    // No SMTP/MSG91 provider is configured yet, so there is currently no other way
    // for a real (or testing) user to receive the code - surface it in the API
    // response so the frontend can log it to the browser console. This is only ever
    // included when delivery via a real provider failed/wasn't attempted, so as soon
    // as SMTP_HOST/MSG91_* env vars are set on this environment, delivered becomes
    // true and the code stops being exposed here automatically.
    const devCode = !delivered ? otpCode : undefined;

    return { success: true, delivered, ...(devCode ? { devCode } : {}) };
  }

  async verifyOtp(dto: { identifier: string, method: string, purpose?: string, code: string }) {
    const purpose = dto.purpose || 'default';

    const record = await this.tenantService.prisma.otpCode.findFirst({
      where: { identifier: dto.identifier, purpose, consumed: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('No pending OTP found. Please request a new code.');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('OTP code has expired. Please request a new code.');
    }

    const isMatch = await bcrypt.compare(dto.code, record.codeHash);
    if (!isMatch) {
      throw new BadRequestException('Incorrect OTP code. Please try again.');
    }

    await this.tenantService.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumed: true },
    });

    return { success: true };
  }

  // NATIVE APP: phone verification via Firebase Phone Auth. The OTP itself
  // was already generated, texted, and checked entirely by Firebase on the
  // device (see the Capacitor Firebase Authentication plugin flow in
  // OtpVerificationModal.jsx) - this only confirms the resulting ID token is
  // genuine and actually covers the phone number the caller claims to be
  // verifying, so one verified phone's token can't be replayed to verify a
  // different number.
  async verifyFirebasePhoneToken(dto: VerifyFirebasePhoneDto) {
    const app = getFirebaseAdminApp();
    if (!app) {
      throw new BadRequestException('Firebase phone verification is not configured on this server.');
    }

    let decoded;
    try {
      decoded = await getAuth(app).verifyIdToken(dto.idToken);
    } catch (err) {
      throw new BadRequestException('Invalid or expired verification token. Please try again.');
    }

    const tokenPhone = (decoded.phone_number || '').replace(/\D/g, '');
    const claimedPhone = dto.identifier.replace(/\D/g, '');
    // Compare by last 10 digits so a country-code prefix mismatch (+91 vs
    // none) between what Firebase returns and what the form stored doesn't
    // falsely reject a legitimate match.
    if (!tokenPhone || tokenPhone.slice(-10) !== claimedPhone.slice(-10)) {
      throw new BadRequestException('Verification token does not match the phone number being verified.');
    }

    return { success: true };
  }

  async login(loginDto: LoginDto) {
    // `loginDto.email` is either the account's email address or its mobile
    // number - both are valid login identifiers for a Shop Admin (see
    // RegisterShopDto/registerShop below), sharing the same password.
    // The shop's isActive is pulled via `include` in the same query instead
    // of a separate findUnique afterward - one DB round-trip instead of two
    // on the critical path.
    const user = await this.tenantService.prisma.user.findFirst({
      where: { OR: [{ email: loginDto.email }, { phone: loginDto.email }] },
      include: { shop: { select: { isActive: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Transparently upgrades this user's stored hash to the current (lower)
    // cost factor the first time they successfully log in after the
    // PASSWORD_HASH_COST reduction above - existing users were hashed at
    // cost 12 (~1.5-1.8s to verify on this app's production host) and would
    // otherwise stay that slow forever, since the cost is baked into the
    // hash itself and there's no way to "downgrade" it without the
    // plaintext password, which only ever exists in memory right here.
    // Fire-and-forget: never block/slow down the login response for this.
    if (bcrypt.getRounds(user.passwordHash) > PASSWORD_HASH_COST) {
      bcrypt
        .hash(loginDto.password, PASSWORD_HASH_COST)
        .then((newHash) => this.tenantService.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }))
        .catch((err) => console.error('Failed to upgrade password hash cost for user', user.id, err));
    }

    // Shop Admin accounts are only allowed to sign in from the native mobile
    // app - the web login is reserved for Super Admin. `platform` is sent by
    // the frontend as 'native' only when running inside Capacitor; anything
    // else (including omitted, for older clients) is treated as web.
    if (user.role === Role.SHOP_ADMIN && loginDto.platform !== 'native') {
      throw new UnauthorizedException('Shop Admin accounts can only sign in from the Key Shop mobile app. Please download the app to continue.');
    }

    // Verify tenant is active if SHOP_ADMIN
    if (user.role === Role.SHOP_ADMIN && user.shopId) {
      if (!user.shop || !user.shop.isActive) {
        throw new UnauthorizedException('Your shop access has been suspended');
      }
    }

    const payload = { sub: user.id, email: user.email, role: user.role, shopId: user.shopId };

    // Log activity - fire-and-forget, same rationale as the hash upgrade
    // above: this is an audit record, not something the client needs to
    // wait on before getting their token back.
    this.tenantService.prisma.activityLog
      .create({
        data: {
          userId: user.id,
          shopId: user.shopId,
          action: 'LOGIN',
          details: JSON.stringify({ email: user.email, name: user.name }),
        },
      })
      .catch((err) => console.error('Failed to write LOGIN activity log for user', user.id, err));

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.tenantService.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(
      changePasswordDto.oldPassword,
      user.passwordHash,
    );
    if (!isOldPasswordValid) {
      throw new BadRequestException('Current password input is incorrect');
    }

    const salt = await bcrypt.genSalt(PASSWORD_HASH_COST);
    const newPasswordHash = await bcrypt.hash(changePasswordDto.newPassword, salt);

    await this.tenantService.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Log activity
    await this.tenantService.prisma.activityLog.create({
      data: {
        userId: user.id,
        shopId: user.shopId,
        action: 'CHANGE_PASSWORD',
        details: JSON.stringify({ message: 'Password updated successfully' }),
      },
    });

    return { success: true, message: 'Password updated successfully' };
  }

  async resetPasswordPublic(dto: ResetPasswordPublicDto) {
    let user;
    if (dto.method === 'email') {
      user = await this.tenantService.prisma.user.findUnique({
        where: { email: dto.identifier },
      });
    } else {
      user = await this.tenantService.prisma.user.findUnique({
        where: { phone: dto.identifier },
      });
    }

    if (!user) {
      throw new BadRequestException(`No active profile registered with this ${dto.method}`);
    }

    const salt = await bcrypt.genSalt(PASSWORD_HASH_COST);
    const newPasswordHash = await bcrypt.hash(dto.newPassword, salt);

    await this.tenantService.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Log activity
    await this.tenantService.prisma.activityLog.create({
      data: {
        userId: user.id,
        shopId: user.shopId,
        action: 'RESET_PASSWORD_PUBLIC',
        details: JSON.stringify({ message: `Password reset successfully via public ${dto.method} recovery` }),
      },
    });

    return { success: true, message: 'Password reset successfully' };
  }

  // Public self-registration wizard's submit handler - two frontend steps
  // (Step 1: a single flat "Basic Details" form covering shop/owner details,
  // email, OTP-verified mobile and password; Step 2: plan + payment)
  // collapse into this single call. The owner-chosen email and phone are
  // both stored as login identifiers on the User record - either can be
  // used to sign in afterwards with the same password (see AuthService.login).
  async registerShop(dto: RegisterShopDto) {
    // Real payment gate: the order was created server-side (see
    // PaymentService.createSubscriptionOrder) for the exact platform-wide
    // subscription price, so a valid signature here cryptographically proves
    // that exact amount was actually captured by Razorpay against this
    // order - not just that the client claims it was. Checked before any
    // other validation/DB write so an unpaid request never reaches them.
    const paymentValid = this.paymentService.verifyPaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );
    if (!paymentValid) {
      throw new BadRequestException('Payment verification failed. Please try again.');
    }

    // Referral code is optional, but if the owner entered one it must match
    // another shop's referralCode - which is that shop's own registered
    // mobile number (see below - not a random code), so the lookup is
    // normalized to digits-only to tolerate spaces/dashes/+91 prefixes typed
    // or pasted in. That shop must not be the new owner's own (matched by
    // email/phone, since the new shop doesn't exist yet so it has no code of
    // its own to compare against) - prevents self-referral point farming.
    // Checked BEFORE the generic duplicate-account check below so a
    // self-referral attempt (which necessarily reuses the referrer's own
    // email or phone) gets this specific message rather than being masked by
    // the generic "already registered" one.
    let referredByCode: string | null = null;
    let referrerShopId: string | null = null;
    if (dto.referralCode) {
      // Strip everything but digits, then keep only the last 10 - tolerates
      // a leading +91/91/0 country/trunk prefix the owner may have pasted
      // in, since referralCode is always stored as the bare 10-digit number.
      const enteredCode = dto.referralCode.replace(/\D/g, '').slice(-10);
      const referrer = await this.tenantService.prisma.shop.findFirst({
        where: { referralCode: enteredCode, deletedAt: null },
        include: { users: { select: { email: true, phone: true } } },
      });
      if (!referrer) {
        throw new BadRequestException('Invalid referral code');
      }
      const isSelfReferral = referrer.users.some((u) => u.email === dto.email || u.phone === dto.phone);
      if (isSelfReferral) {
        throw new BadRequestException('You cannot use your own referral code');
      }
      referredByCode = referrer.referralCode;
      referrerShopId = referrer.id;
    }

    // Re-check uniqueness at submit time (in addition to the check already
    // done when the OTP was sent) since time may have passed and another
    // registration could have raced in between.
    // Email is optional now, so the OR array is built conditionally - Prisma
    // strips `undefined` values from a where clause, so an unconditional
    // `{ email: dto.email }` would collapse to `{}` (an always-true match)
    // whenever the owner didn't enter an email, matching every user in the table.
    const duplicateCheckOr: any[] = [{ phone: dto.phone }];
    if (dto.email) {
      duplicateCheckOr.push({ email: dto.email });
    }
    const existingUser = await this.tenantService.prisma.user.findFirst({
      where: { OR: duplicateCheckOr },
    });
    if (existingUser) {
      if (dto.email && existingUser.email === dto.email) {
        throw new BadRequestException('This email address is already registered to another shop');
      }
      throw new BadRequestException('This mobile number is already registered to another shop');
    }

    // Category must reference a real, still-active ShopCategory (a Super
    // Admin may have deleted the one the client had cached in its dropdown).
    const category = await this.tenantService.prisma.shopCategory.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
    });
    if (!category) {
      throw new BadRequestException('Please select a valid shop category');
    }

    const salt = await bcrypt.genSalt(PASSWORD_HASH_COST);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    // Every new shop's shareable referral code is simply its own registered
    // mobile number - already guaranteed unique across all shops by the
    // existingUser check above, so no separate random-code generation/retry
    // is needed here (see ShopService.getOrCreateReferralCode for the
    // equivalent fallback on shops created before this existed).
    const newShopReferralCode = dto.phone;

    return this.tenantService.prisma.$transaction(async (tx) => {
      // 1. Create Shop, automatically active - no manual Super Admin approval
      // step is required before a shop can log in and start using the platform.
      const shop = await tx.shop.create({
        data: {
          name: dto.shopName,
          themeColor: '#8C24FF',
          isActive: true,
          companyDetails: JSON.stringify({
            address: dto.location || 'Pending registration details',
            city: dto.city,
            state: dto.state,
            pinCode: dto.pinCode,
            gst: 'Pending',
            phone: dto.phone,
            website: dto.website || undefined,
          }),
          // Owner Aadhaar is a plain 12-digit number on this wizard (not an
          // uploaded document) - encrypted at rest, see CustomerService's
          // idProofNumber for the same pattern.
          aadhaarNumber: dto.aadhaarNumber ? this.cryptoService.encrypt(dto.aadhaarNumber) : null,
          // GPS coordinates from the wizard's "Current Location" button, when
          // the shop owner granted location permission (see RegisterShopDto).
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          // Type of shop being registered, picked from the Super-Admin-curated
          // dropdown (see ShopCategoryService).
          categoryId: dto.categoryId,
          referralCode: newShopReferralCode,
          referredByCode,
        },
      });

      // 2. Create User - both email and phone are stored as login
      // identifiers, sharing the single password the owner chose.
      await tx.user.create({
        data: {
          email: dto.email || null,
          phone: dto.phone,
          name: dto.ownerName,
          passwordHash,
          role: Role.SHOP_ADMIN,
          shopId: shop.id,
        },
      });

      // 3. Create Subscription - single YEARLY plan platform-wide.
      const subStartDate = new Date();
      const subEndDate = new Date(subStartDate);
      subEndDate.setFullYear(subEndDate.getFullYear() + 1);

      await tx.subscription.create({
        data: {
          shopId: shop.id,
          plan: 'YEARLY',
          status: 'ACTIVE',
          startDate: subStartDate,
          endDate: subEndDate,
        },
      });

      // 3b. Record this subscription's payment (verified against Razorpay
      // above) as platform revenue, once, at the moment the account is
      // created - feeds the
      // Super Admin Revenue Report (see ReportService.getSuperDashboard /
      // getRevenueRecords). Always INSERTs a new row - unlike
      // ReportService.logRevenue's manual one-row-per-month upsert - since
      // multiple shops can register in the same month and each is its own
      // distinct income event, not a figure to be overwritten. This can only
      // ever run once per shop: registerShop can't be re-run for the same
      // account (the email/phone uniqueness check above rejects
      // re-registration), and nothing else in the app creates a
      // RevenueRecord tied to a shop, so later edits/updates to the shop can
      // never duplicate or touch this entry.
      const platformConfig = await tx.platformConfig.findUnique({ where: { id: 'default' } });
      const subscriptionPrice = platformConfig?.subscriptionPrice ?? 999;
      await tx.revenueRecord.create({
        data: {
          month: subStartDate.getMonth() + 1,
          year: subStartDate.getFullYear(),
          amount: subscriptionPrice,
          notes: `Revenue generated from a new Shop Account subscription — ${dto.shopName}.`,
        },
      });

      // 4. Credit the referring shop, only after this shop's account creation
      // and (simulated) payment above have both succeeded. The Referral row's
      // unique referredShopId means this can only ever run once for this shop
      // - re-running registerShop for the same shop isn't possible since the
      // email/phone uniqueness check above would already have rejected it.
      if (referrerShopId) {
        await tx.referral.create({
          data: {
            referrerShopId,
            referredShopId: shop.id,
            pointsAwarded: 1,
          },
        });
        await tx.shop.update({
          where: { id: referrerShopId },
          data: { referralPoints: { increment: 1 } },
        });
      }

      // 5. Notify Super Admin of the new shop (informational only - no action required)
      await tx.notification.create({
        data: {
          title: 'New Shop Registered',
          message: `Shop "${dto.shopName}" by ${dto.ownerName} has registered and is now active.`,
          type: 'SHOP_REGISTRATION',
          shopId: null, // no specific shop's notification feed
          audience: 'SUPER_ADMIN', // internal to the Super Admin panel only - must NOT reach shop admins
        },
      });

      return {
        success: true,
        shopId: shop.id,
        ...(dto.email ? { loginEmail: dto.email } : {}),
        loginPhone: dto.phone,
        message: 'Registration successful! Your shop account is now active - you can log in right away.',
      };
    });
  }
}
