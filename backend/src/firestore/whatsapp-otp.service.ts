import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { FirestoreService } from './firestore.service';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../common/validators/phone';

// Replaces both of the pre-migration OTP paths (MSG91 SMS for web,
// Firebase Phone Auth for native) with one unified, self-hosted mechanism
// delivered over WhatsApp instead - see the migration plan's revised
// decision #6. Structurally the same verification model as the old
// Postgres-backed OtpCode (random code, bcrypt-hashed, 5-minute expiry,
// per-record failed-attempt lockout), just against a Firestore collection
// and a different delivery channel. Firebase Auth itself is untouched by
// this - it still owns the login session, this only gates
// registration/reset/customer-verify/etc, same as before.
const OTP_COLLECTION = 'otpCodes';
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const OTP_HASH_COST = 10;

// Meta's WhatsApp Cloud API - sends a pre-approved "Authentication" category
// template with the code as its one variable (these templates get Meta's
// built-in one-time-password UI treatment - e.g. a "Copy Code" button - and
// are held to a stricter approval/rate process than marketing templates,
// by design, since they're meant purely for OTP delivery).
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export interface SendOtpResult {
  success: true;
  delivered: boolean;
}

export interface VerifyOtpResult {
  success: true;
}

@Injectable()
export class WhatsappOtpService {
  constructor(private readonly firestore: FirestoreService) {}

  async sendOtp(identifierRaw: string, purpose: string): Promise<SendOtpResult> {
    const identifier = normalizePhone(identifierRaw);
    if (!identifier) {
      throw new BadRequestException(PHONE_REGEX_MESSAGE);
    }

    const code = String(Math.floor(1000 + Math.random() * 9000));
    const codeHash = await bcrypt.hash(code, OTP_HASH_COST);

    const col = this.firestore.db.collection(OTP_COLLECTION);

    // Invalidate any prior un-consumed code for this (identifier, purpose) -
    // same rationale as the Postgres version: a fresh send always
    // supersedes whatever was pending before it.
    const stale = await col
      .where('identifier', '==', identifier)
      .where('purpose', '==', purpose)
      .where('consumed', '==', false)
      .get();
    const batch = this.firestore.db.batch();
    stale.docs.forEach((doc) => batch.update(doc.ref, { consumed: true }));
    const newDocRef = col.doc();
    batch.set(newDocRef, {
      identifier,
      purpose,
      codeHash,
      consumed: false,
      failedAttempts: 0,
      expiresAt: Date.now() + OTP_TTL_MS,
      createdAt: Date.now(),
    });
    await batch.commit();

    const delivered = await this.sendWhatsAppTemplate(identifier, code);
    if (!delivered) {
      // Same "never leak the code" stance as the Postgres/MSG91 version -
      // only the server log carries it when delivery isn't configured or
      // fails, never the API response.
      console.log(`[WhatsApp OTP dev fallback] delivery not configured/failed — code for ${identifier}: ${code}`);
    }

    return { success: true, delivered };
  }

  async verifyOtp(identifierRaw: string, purpose: string, code: string): Promise<VerifyOtpResult> {
    const identifier = normalizePhone(identifierRaw);
    if (!identifier) {
      throw new BadRequestException(PHONE_REGEX_MESSAGE);
    }

    const col = this.firestore.db.collection(OTP_COLLECTION);
    const snap = await col
      .where('identifier', '==', identifier)
      .where('purpose', '==', purpose)
      .where('consumed', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      throw new BadRequestException('No pending OTP found. Please request a new code.');
    }
    const doc = snap.docs[0];
    const record = doc.data();

    if (record.expiresAt < Date.now()) {
      throw new BadRequestException('OTP code has expired. Please request a new code.');
    }
    if (record.failedAttempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }

    const isMatch = await bcrypt.compare(code, record.codeHash);
    if (!isMatch) {
      await doc.ref.update({ failedAttempts: record.failedAttempts + 1 });
      throw new BadRequestException('Incorrect OTP code. Please try again.');
    }

    await doc.ref.update({ consumed: true });
    return { success: true };
  }

  // Sends a WhatsApp "Authentication" template message via Meta's Cloud
  // API directly (no BSP middleman). Returns false (never throws) on any
  // config/delivery failure so sendOtp's dev-fallback log path can take
  // over - mirrors the old MSG91 integration's fail-soft behavior.
  private async sendWhatsAppTemplate(phoneDigits: string, code: string): Promise<boolean> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || '';
    if (!accessToken || !phoneNumberId || !templateName) return false;

    try {
      const to = `91${phoneDigits}`; // Meta expects full E.164-style digits, no leading '+'
      const res = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: templateName,
              language: { code: 'en' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: code }] },
                // Meta's OTP templates require the code again on the button
                // component when a "Copy Code" quick-reply button is
                // configured on the template - harmless to include if the
                // approved template has no button, per Meta's docs.
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        console.error('WhatsApp OTP send failed:', body);
        return false;
      }
      return true;
    } catch (err) {
      console.error('WhatsApp OTP send failed:', err.message);
      return false;
    }
  }
}
