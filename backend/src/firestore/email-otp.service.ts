import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { FirestoreService } from './firestore.service';
import { WhatsappOtpService, VerifyOtpResult } from './whatsapp-otp.service';
import { EmailService } from './email.service';
import { EMAIL_REGEX_MESSAGE, normalizeEmail } from '../common/validators/email';

// Verification codes by email, next to the WhatsApp ones. Same code rules (unique among live codes, bcrypt-hashed, 5 minutes, 5 wrong
// tries, single use) - they come from WhatsappOtpService - only the way the code travels differs.
//
// Two purposes, and no others (an email proves a mailbox, not a phone number, so it must not unlock phone-bound actions):
//   'verify-email' - proves the user controls an address (shop registration, settings). The code goes to the address typed.
//   'reset'        - password reset for someone who forgot their password. The code goes ONLY to an address that belongs to an account
//                    AND was verified earlier; for any other address nothing is sent but the answer looks exactly the same, so the
//                    endpoint cannot be used to find out which emails are registered.
// Abuse limits: 3 codes per address per 10 minutes (on top of the per-IP limit on the route).
export const EMAIL_OTP_PURPOSES = new Set(['verify-email', 'reset']);
const RATE_COLLECTION = 'emailOtpRate';
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 3;

const REASON: Record<string, string> = {
  'verify-email': 'verify your email address',
  reset: 'reset your password',
};

export interface SendEmailOtpResult {
  success: true;
  delivered: boolean;
  mode: 'email';
  expiresInSeconds: number;
  // LOCAL TESTING ONLY - same rule as the WhatsApp code: only against the Firebase emulator with OTP_SHOW_CODE_IN_UI=true.
  devCode?: string;
}

@Injectable()
export class EmailOtpService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly otp: WhatsappOtpService,
    private readonly email: EmailService,
  ) {}

  isEmailPurpose(purpose: string): boolean {
    return EMAIL_OTP_PURPOSES.has(purpose);
  }

  async send(emailRaw: string, purpose: string): Promise<SendEmailOtpResult> {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new BadRequestException(EMAIL_REGEX_MESSAGE);
    if (!this.isEmailPurpose(purpose)) {
      throw new BadRequestException('Email codes are only available for verifying an email address and for password reset.');
    }
    const expiresInSeconds = this.otp.ttlMinutes * 60;
    await this.takeRateSlot(email);

    const eligible = purpose !== 'reset' || (await this.resetEligible(email));

    if (!this.email.isConfigured()) {
      // Email is not set up on the server. Everybody gets the same "not delivered" answer. Only a developer machine on the emulator
      // (OTP_SHOW_CODE_IN_UI=true) is handed the code, so the screens can be tried end to end; a deployed server never is.
      if (this.otp.localTesting() && eligible) {
        const issued = await this.otp.issueCode(email, purpose);
        console.log(`[Email OTP local testing] email not configured - code for ${email}: ${issued.code}`);
        return { success: true, delivered: false, mode: 'email', expiresInSeconds, devCode: issued.code };
      }
      return { success: true, delivered: false, mode: 'email', expiresInSeconds };
    }

    // A reset for an address that is not a verified account: nothing is sent, but the answer looks exactly like a send.
    if (!eligible) return { success: true, delivered: true, mode: 'email', expiresInSeconds };

    const issued = await this.otp.issueCode(email, purpose);
    const sent = await this.email.sendCode(email, issued.code, REASON[purpose], this.otp.ttlMinutes);
    if (!sent) {
      await issued.release();
      return { success: true, delivered: false, mode: 'email', expiresInSeconds };
    }
    return { success: true, delivered: true, mode: 'email', expiresInSeconds };
  }

  async verify(emailRaw: string, purpose: string, code: string): Promise<VerifyOtpResult> {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new BadRequestException(EMAIL_REGEX_MESSAGE);
    if (!this.isEmailPurpose(purpose)) throw new BadRequestException('Email codes are only available for verifying an email address and for password reset.');
    return this.otp.verifyIdentifier(email, purpose, code);
  }

  // One verification authorises one action (resetting a password, or marking an email verified).
  async redeem(emailRaw: string, purpose: string): Promise<boolean> {
    const email = normalizeEmail(emailRaw);
    if (!email || !this.isEmailPurpose(purpose)) return false;
    return this.otp.redeemIdentifier(email, purpose);
  }

  // The account an email belongs to, only when that email was verified and the account is active.
  async findVerifiedAccount(emailRaw: string): Promise<{ uid: string; phone: string | null; shopId: string | null } | null> {
    const email = normalizeEmail(emailRaw);
    if (!email) return null;
    const db = this.firestore.db;
    const index = await db.collection('emailIndex').doc(email).get();
    const uid = index.exists ? (index.data() as any)?.uid : null;
    if (!uid) return null;
    const user = await db.collection('users').doc(uid).get();
    const data: any = user.exists ? user.data() : null;
    if (!data || data.deletedAt || data.emailVerified !== true || String(data.email || '').toLowerCase() !== email) return null;
    return { uid, phone: data.phone ?? null, shopId: data.shopId ?? null };
  }

  private async resetEligible(email: string): Promise<boolean> {
    return !!(await this.findVerifiedAccount(email));
  }

  // Marks the account's email as verified (after a redeemed 'verify-email' code for that same address).
  async markVerified(uid: string): Promise<void> {
    const now = Date.now();
    await this.firestore.db.collection('users').doc(uid).update({ emailVerified: true, emailVerifiedAt: now, updatedAt: now });
  }

  private async takeRateSlot(email: string): Promise<void> {
    const db = this.firestore.db;
    const ref = db.collection(RATE_COLLECTION).doc(createHash('sha256').update(email).digest('hex'));
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const cur: any = snap.exists ? snap.data() : null;
      if (!cur || now - cur.windowStart >= RATE_WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1 });
        return true;
      }
      if (cur.count >= RATE_MAX) return false;
      tx.update(ref, { count: cur.count + 1 });
      return true;
    });
    if (!allowed) {
      throw new HttpException('Too many codes were requested for this email. Please wait a few minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
