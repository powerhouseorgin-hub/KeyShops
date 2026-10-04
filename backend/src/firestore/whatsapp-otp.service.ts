import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { FirestoreService } from './firestore.service';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../common/validators/phone';

// One unified, self-hosted OTP mechanism for web and native, delivered over WhatsApp: a random code,
// bcrypt-hashed, 5-minute expiry, per-record failed-attempt lockout, stored in the `otpCodes` Firestore
// collection. Firebase Auth itself is untouched by this - it owns the login session; OTPs only gate
// registration / reset / customer-verify / change-credentials / delete-account.
const OTP_COLLECTION = 'otpCodes';
const OTP_TTL_MS = 5 * 60 * 1000;

// Codes are unique among all LIVE codes: before a code is used it is claimed in `otpCodeLocks/<code>` (inside a transaction, so two
// requests can never claim the same one) and the claim lasts as long as the code can be used. The code space is 1000-9999.
const CODE_LOCK_COLLECTION = 'otpCodeLocks';
const CODE_LOCK_SLACK_MS = 10 * 1000;
const CODE_CLAIM_ATTEMPTS = 60;
const generateCode = () => String(randomInt(1000, 10000));
const MAX_OTP_ATTEMPTS = 5;
const OTP_HASH_COST = 10;

// Meta's WhatsApp Cloud API - sends a pre-approved "Authentication" category
// template with the code as its one variable (these templates get Meta's
// built-in one-time-password UI treatment - e.g. a "Copy Code" button - and
// are held to a stricter approval/rate process than marketing templates,
// by design, since they're meant purely for OTP delivery).
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

// How the code reaches the user over WhatsApp:
//   'template' - an approved Authentication template (WHATSAPP_OTP_TEMPLATE_NAME). We message the user; nothing is needed from them.
//   'inbound'  - NO template. The user's own WhatsApp sends us a message ("KEYSHOPS <ref>", prefilled by the app's wa.me link);
//                the webhook receives it, checks that the SENDER'S NUMBER is the number that was entered in the app, and only
//                then replies with the code in that chat. Because WhatsApp itself authenticates the sender, this also proves the
//                user controls the number. A reply is allowed because the user messaged us first (24-hour window). Needs
//                WHATSAPP_OTP_INBOUND=true, the app secret (the webhook must be signed), the business number, and the Meta app
//                subscribed to the WhatsApp account with the "messages" webhook field live.
//   'none'     - not configured; no code can reach the user (the code is never shown on screen in production).
// A customer_verify code goes to the CUSTOMER's phone, but the shop owner is the one holding the app - so a message sent from the
// owner's phone could never match the customer's number. That purpose therefore never uses 'inbound'.
export type OtpDeliveryMode = 'template' | 'inbound' | 'none';

// Lifecycle of an inbound request, as shown to the app while it waits.
export type InboundState = 'WAITING' | 'CODE_SENT' | 'SEND_FAILED' | 'MISMATCH' | 'EXPIRED' | 'DONE' | 'UNKNOWN';

export interface SendOtpResult {
  success: true;
  delivered: boolean;
  // 'inbound' mode: no code exists yet. The app opens waLink (the user just taps Send in WhatsApp) and polls the status of ref.
  mode?: OtpDeliveryMode;
  ref?: string;
  waLink?: string;
  expiresInSeconds?: number;
  // LOCAL TESTING ONLY: present solely when running against the Firebase emulator (FIRESTORE_EMULATOR_HOST set) with
  // OTP_SHOW_CODE_IN_UI=true, so the smoke tests can sign up. The deployed API never has an emulator host, so it can never
  // return - or log - a code, whatever environment variables are set.
  devCode?: string;
}

// Purposes whose code may be shown in the UI as a fallback. Deliberately
// EXCLUDES 'reset' and 'delete-account': send-otp is unauthenticated and
// shop phone numbers are public (the shop directory lists them), so showing
// the code for a password reset would let anyone take over any shop admin's
// account just by knowing their number. Those two stay log-only until real
// WhatsApp delivery is live.
const UI_FALLBACK_PURPOSES = new Set(['register', 'customer_verify', 'change-credentials']);

// How long after a successful verify-otp the follow-up action (reset
// password, change phone, delete account) may still redeem it.
const VERIFICATION_REDEEM_WINDOW_MS = 15 * 60 * 1000;

// Reference carried in the user's WhatsApp message: 8 characters from an alphabet without look-alikes (~1e12 values), single use.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REF_LENGTH = 8;
const REF_IN_MESSAGE = /KEYSHOPS[\s:#-]*([A-Z0-9]{8})/i;
const REF_ONLY = /^[A-Z0-9]{8}$/;
const generateRef = () => Array.from({ length: REF_LENGTH }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('');

export interface InboundMessage {
  from: string; // the sender's WhatsApp id: country code + number, e.g. 919361906840
  id: string;
  body: string;
}
export type InboundOutcome = 'ignored' | 'issued' | 'mismatch' | 'expired';

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

    const mode = this.deliveryMode(purpose);
    if (mode === 'inbound') {
      const ref = generateRef();
      await this.createRecord(identifier, purpose, { codeHash: null, ref, state: 'WAITING' });
      return { success: true, delivered: false, mode, ref, waLink: this.waLink(ref), expiresInSeconds: OTP_TTL_MS / 1000 };
    }

    const claim = await this.claimCode();
    const code = claim.code;
    try {
      const codeHash = await bcrypt.hash(code, OTP_HASH_COST);
      await this.createRecord(identifier, purpose, { codeHash });
    } catch (e) {
      await this.releaseCode(claim);
      throw e;
    }

    const delivered = mode === 'template' ? await this.sendWhatsAppTemplate(identifier, code) : false;
    if (!delivered && this.localTestingMode() && UI_FALLBACK_PURPOSES.has(purpose)) {
      console.log(`[WhatsApp OTP local testing] delivery not configured/failed - code for ${identifier}: ${code}`);
      return { success: true, delivered: false, devCode: code };
    }

    return { success: true, delivered };
  }

  // True only on a developer machine talking to the Firebase emulator, with the explicit switch on. Never true when deployed.
  private localTestingMode(): boolean {
    return !!process.env.FIRESTORE_EMULATOR_HOST && process.env.OTP_SHOW_CODE_IN_UI === 'true';
  }

  // Claims a code nobody else currently holds. The claim expires with the code itself (a new claim may reuse an expired one).
  private async claimCode(): Promise<{ code: string; holder: string }> {
    const db = this.firestore.db;
    const holder = randomBytes(8).toString('hex');
    for (let i = 0; i < CODE_CLAIM_ATTEMPTS; i++) {
      const code = generateCode();
      const lockRef = db.collection(CODE_LOCK_COLLECTION).doc(code);
      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(lockRef);
        const lock: any = snap.exists ? snap.data() : null;
        if (lock && lock.expiresAt > Date.now()) return false;
        tx.set(lockRef, { holder, expiresAt: Date.now() + OTP_TTL_MS + CODE_LOCK_SLACK_MS });
        return true;
      });
      if (claimed) return { code, holder };
    }
    throw new ServiceUnavailableException('Too many verification requests right now. Please try again in a few minutes.');
  }

  // Gives back a claim whose code was never used (only the holder can release it).
  private async releaseCode(claim: { code: string; holder: string }): Promise<void> {
    try {
      const db = this.firestore.db;
      const lockRef = db.collection(CODE_LOCK_COLLECTION).doc(claim.code);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(lockRef);
        if (snap.exists && (snap.data() as any)?.holder === claim.holder) tx.delete(lockRef);
      });
    } catch (e) {
      console.error('[OTP] could not release a code claim', (e as Error).message);
    }
  }

  // A fresh record for (identifier, purpose); any earlier un-consumed one is superseded.
  private async createRecord(identifier: string, purpose: string, extra: Record<string, unknown>) {
    const col = this.firestore.db.collection(OTP_COLLECTION);
    const stale = await col
      .where('identifier', '==', identifier)
      .where('purpose', '==', purpose)
      .where('consumed', '==', false)
      .get();
    const batch = this.firestore.db.batch();
    stale.docs.forEach((doc) => batch.update(doc.ref, { consumed: true }));
    batch.set(col.doc(), {
      identifier,
      purpose,
      consumed: false,
      failedAttempts: 0,
      expiresAt: Date.now() + OTP_TTL_MS,
      createdAt: Date.now(),
      ...extra,
    });
    await batch.commit();
  }

  // 'template' when an approved template is configured (it works for anyone); 'inbound' when switched on and fully configured;
  // otherwise 'none'. See OtpDeliveryMode.
  deliveryMode(purpose?: string): OtpDeliveryMode {
    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return 'none';
    if (process.env.WHATSAPP_OTP_TEMPLATE_NAME) return 'template';
    if (this.inboundEnabled() && purpose !== 'customer_verify') return 'inbound';
    return 'none';
  }

  // Inbound needs everything: the switch, credentials, the business number (for the link) and the app secret (so the webhook that
  // triggers code delivery can only be driven by signed calls from Meta).
  inboundEnabled(): boolean {
    return process.env.WHATSAPP_OTP_INBOUND === 'true'
      && !!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID
      && !!(process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '')
      && !!process.env.WHATSAPP_APP_SECRET;
  }

  // wa.me link that opens a chat with the business number, "KEYSHOPS <ref>" ready to send.
  private waLink(ref: string): string | undefined {
    const number = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '');
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(`KEYSHOPS ${ref}`)}` : undefined;
  }

  // The webhook calls this for every incoming WhatsApp text. Only a message carrying a live "KEYSHOPS <ref>" does anything:
  //   - the sender's number must equal the number entered in the app (else MISMATCH, no code is sent);
  //   - the request must still be waiting and unexpired (a retried or repeated delivery of the same message does nothing);
  //   - then the code is generated (only its hash is stored) and sent to the sender in that chat.
  async handleInboundMessage(msg: InboundMessage): Promise<InboundOutcome> {
    if (!this.inboundEnabled()) return 'ignored';
    const found = REF_IN_MESSAGE.exec(msg.body || '');
    if (!found) return 'ignored';
    const ref = found[1].toUpperCase();

    const snap = await this.firestore.db.collection(OTP_COLLECTION).where('ref', '==', ref).limit(1).get();
    if (snap.empty) return 'ignored';
    const docRef = snap.docs[0].ref;

    // WhatsApp ids are country code + number; this app is India-only (+91).
    const digits = String(msg.from || '').replace(/\D/g, '');
    const sender = /^91[1-9]\d{9}$/.test(digits) ? digits.slice(2) : null;

    // Cheap early exit so a repeated message does not claim a code it will not use.
    const early: any = snap.docs[0].data();
    if (!early || early.consumed || early.state !== 'WAITING') return 'ignored';

    const claim = await this.claimCode();
    const code = claim.code;
    const codeHash = await bcrypt.hash(code, OTP_HASH_COST);

    const outcome: InboundOutcome = await this.firestore.db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      const r: any = doc.data();
      if (!r || r.consumed || r.state !== 'WAITING') return 'ignored';
      if (r.expiresAt < Date.now()) { tx.update(docRef, { state: 'EXPIRED' }); return 'expired'; }
      if (!sender || sender !== r.identifier) { tx.update(docRef, { state: 'MISMATCH' }); return 'mismatch'; }
      tx.update(docRef, { state: 'CODE_SENT', codeHash, inboundMessageId: msg.id, codeSentAt: Date.now() });
      return 'issued';
    });

    if (outcome !== 'issued') await this.releaseCode(claim);

    if (outcome === 'issued') {
      const sent = await this.sendWhatsAppText(digits, `${code} is your Key Shops verification code. It is valid for 5 minutes. Do not share it with anyone.`);
      if (!sent) await docRef.update({ state: 'SEND_FAILED' });
    } else if (outcome === 'mismatch') {
      await this.sendWhatsAppText(digits, 'Key Shops: this message came from a different number than the one entered in the app, so no code was sent. Please send it from the same WhatsApp number you entered.');
    } else if (outcome === 'expired') {
      await this.sendWhatsAppText(digits, 'Key Shops: this request has expired. Please start again in the app.');
    }
    return outcome;
  }

  // What the app polls while it waits. The ref is unguessable and single use, and nothing sensitive is returned.
  async getInboundStatus(refRaw: string): Promise<{ state: InboundState }> {
    const ref = String(refRaw || '').toUpperCase();
    if (!REF_ONLY.test(ref)) return { state: 'UNKNOWN' };
    const snap = await this.firestore.db.collection(OTP_COLLECTION).where('ref', '==', ref).limit(1).get();
    if (snap.empty) return { state: 'UNKNOWN' };
    const r: any = snap.docs[0].data();
    if (r.verifiedAt) return { state: 'DONE' };
    if (r.state === 'WAITING' && r.expiresAt < Date.now()) return { state: 'EXPIRED' };
    if (r.consumed && r.state === 'WAITING') return { state: 'EXPIRED' }; // superseded by a newer request
    return { state: (r.state as InboundState) || 'UNKNOWN' };
  }

  // One-shot redemption of a recent successful verify-otp, for endpoints that
  // act on a prior verification (reset password, change phone, delete
  // account) rather than re-accepting the raw code. Keyed on `verifiedAt`,
  // which ONLY verifyOtp sets - not on `consumed`, which sendOtp also sets
  // on superseded codes (so requesting two codes can't fake a verification).
  // Clears the marker on success so one verification authorizes one action.
  async redeemVerification(identifierRaw: string, purpose: string): Promise<boolean> {
    const identifier = normalizePhone(identifierRaw);
    if (!identifier) return false;
    const snap = await this.firestore.db
      .collection(OTP_COLLECTION)
      .where('identifier', '==', identifier)
      .where('purpose', '==', purpose)
      .where('consumed', '==', true)
      .get();
    const now = Date.now();
    const fresh = snap.docs
      .filter((d) => typeof d.data().verifiedAt === 'number' && now - d.data().verifiedAt <= VERIFICATION_REDEEM_WINDOW_MS)
      .sort((a, b) => b.data().verifiedAt - a.data().verifiedAt)[0];
    if (!fresh) return false;
    await fresh.ref.update({ verifiedAt: null });
    return true;
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
    // An inbound request that has not produced a code yet
    if (!record.codeHash) {
      if (record.state === 'MISMATCH') throw new BadRequestException('The WhatsApp message came from a different number than the one entered. Please send it from the same number.');
      throw new BadRequestException('No code has been sent yet. Tap "Get code on WhatsApp" and send the message first.');
    }
    if (record.failedAttempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }

    const isMatch = await bcrypt.compare(code, record.codeHash);
    if (!isMatch) {
      await doc.ref.update({ failedAttempts: record.failedAttempts + 1 });
      throw new BadRequestException('Incorrect OTP code. Please try again.');
    }

    await doc.ref.update({ consumed: true, verifiedAt: Date.now() });
    return { success: true };
  }

  // Sends a plain WhatsApp text (no template) to a WhatsApp id. Only delivered when that person messaged the business number in
  // the last 24 hours - always true for the inbound flow, where we reply to the message that just arrived. Never throws.
  private async sendWhatsAppText(toDigits: string, body: string): Promise<boolean> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    if (!accessToken || !phoneNumberId) return false;
    try {
      const res = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: toDigits, type: 'text', text: { body } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('WhatsApp text send failed:', err);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('WhatsApp text send failed:', err.message);
      return false;
    }
  }

  // Sends a WhatsApp "Authentication" template message via Meta's Cloud
  // API directly (no BSP middleman). Returns false (never throws) on any
  // config/delivery failure so sendOtp's dev-fallback log path can take
  // over (fail-soft: a delivery problem never blocks the flow).
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
