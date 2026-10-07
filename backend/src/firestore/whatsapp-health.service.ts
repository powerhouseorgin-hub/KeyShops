import { Injectable } from '@nestjs/common';
import { FirestoreService } from './firestore.service';
import { FirestoreNotificationService } from './notification/firestore-notification.service';

// A daily check that the WhatsApp side of the OTP flow still works - added after the system user lost its assignment on the WhatsApp
// Business account (2026-10-06): inbound messages silently stopped reaching the server, every OTP stayed WAITING, and nobody was told.
//
// What it checks (all read-only, nothing is sent to anyone):
//   1. the access token can still read the phone number;
//   2. the token can still read the WhatsApp Business account (WHATSAPP_BUSINESS_ACCOUNT_ID) - "missing permissions" here is exactly what a
//      removed asset assignment looks like - and the Key Shops app is still subscribed to it (WHATSAPP_APP_ID, when set; otherwise any app);
//   3. the OTP flow in the last 24 hours: if several OTP requests were made and NONE of them was ever answered (all still WAITING), the
//      messages are not reaching us; if replies keep failing (SEND_FAILED), say so.
// The outcome is stored in systemHealth/whatsapp, logged (console.error when something is wrong, so Cloud Logging alerts can use it) and,
// when something is wrong, a notification is added for the Super Admin (the bell). A recovery is announced once.
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REQUESTS_TO_JUDGE = 3;
const MIN_FAILED_REPLIES = 2;

export interface WhatsappHealth {
  ok: boolean;
  checkedAt: number;
  problems: string[];
  stats: { otpRequests24h: number; answered24h: number; replyFailures24h: number };
}

@Injectable()
export class WhatsappHealthService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly notifications: FirestoreNotificationService,
  ) {}

  private doc() {
    return this.firestore.db.collection('systemHealth').doc('whatsapp');
  }

  private async graph(path: string, token: string): Promise<{ ok: boolean; status: number; body: any }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      const body: any = await res.json().catch(() => ({}));
      return { ok: res.ok && !body.error, status: res.status, body };
    } catch (e: any) {
      return { ok: false, status: 0, body: { error: { message: e?.name === 'AbortError' ? 'timed out' : String(e?.message || e) } } };
    } finally {
      clearTimeout(timer);
    }
  }

  async last(): Promise<WhatsappHealth | null> {
    const snap = await this.doc().get();
    return snap.exists ? (snap.data() as WhatsappHealth) : null;
  }

  async run(now: number = Date.now()): Promise<WhatsappHealth> {
    const problems: string[] = [];
    const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
    const appId = process.env.WHATSAPP_APP_ID || '';

    if (!token || !phoneId) {
      problems.push('WhatsApp is not configured on the server (access token or phone number id missing).');
    } else {
      const phone = await this.graph(`${phoneId}?fields=id`, token);
      if (!phone.ok) problems.push(`The WhatsApp access token cannot read the phone number (${this.why(phone)}). It may have been revoked or expired.`);

      if (!wabaId) {
        problems.push('WHATSAPP_BUSINESS_ACCOUNT_ID is not set, so the WhatsApp account subscription cannot be checked.');
      } else {
        const subs = await this.graph(`${wabaId}/subscribed_apps`, token);
        if (!subs.ok) {
          problems.push(`The access token can no longer read the WhatsApp Business account ${wabaId} (${this.why(subs)}). In Meta Business Settings, make sure the "keyshops" system user is still assigned that WhatsApp account with full control.`);
        } else {
          const apps: any[] = subs.body?.data || [];
          const wanted = appId ? apps.some((a) => String(a?.whatsapp_business_api_data?.id) === appId) : apps.length > 0;
          if (!wanted) problems.push('The Key Shops app is not subscribed to the WhatsApp Business account, so incoming WhatsApp messages (OTP requests) will not reach the server.');
        }
      }
    }

    const stats = await this.otpStats(now);
    if (stats.otpRequests24h >= MIN_REQUESTS_TO_JUDGE && stats.answered24h === 0) {
      problems.push(`${stats.otpRequests24h} OTP requests in the last 24 hours and none was ever answered - WhatsApp messages are probably not reaching the server.`);
    }
    if (stats.replyFailures24h >= MIN_FAILED_REPLIES) {
      problems.push(`${stats.replyFailures24h} OTP replies failed to send in the last 24 hours.`);
    }

    const health: WhatsappHealth = { ok: problems.length === 0, checkedAt: now, problems, stats };
    await this.record(health);
    return health;
  }

  private why(r: { status: number; body: any }): string {
    const e = r.body?.error;
    return e ? `${e.code ? `error ${e.code}: ` : ''}${String(e.message || '').slice(0, 120)}` : `HTTP ${r.status}`;
  }

  private async otpStats(now: number) {
    const snap = await this.firestore.db.collection('otpCodes').where('createdAt', '>=', now - DAY_MS).get();
    let requests = 0;
    let answered = 0;
    let failures = 0;
    for (const d of snap.docs) {
      const r: any = d.data();
      if (!r.state) continue; // template / legacy records have no inbound state
      requests += 1;
      if (r.state !== 'WAITING') answered += 1;
      if (r.state === 'SEND_FAILED') failures += 1;
    }
    return { otpRequests24h: requests, answered24h: answered, replyFailures24h: failures };
  }

  // stores the result, logs it, and tells the Super Admin when something is wrong (and once when it recovers)
  private async record(health: WhatsappHealth) {
    let previous: WhatsappHealth | null = null;
    try { previous = await this.last(); } catch (e) { /* first run */ }
    await this.doc().set(health);

    if (!health.ok) {
      console.error('[WhatsApp health] PROBLEM:', health.problems.join(' | '));
      await this.notifications
        .createNotification('WhatsApp OTP needs attention', health.problems.join(' '), 'WHATSAPP_HEALTH', undefined, 'SUPER_ADMIN')
        .catch((e) => console.error('[WhatsApp health] could not create the notification', e?.message));
    } else {
      console.log('[WhatsApp health] ok', JSON.stringify(health.stats));
      if (previous && !previous.ok) {
        await this.notifications
          .createNotification('WhatsApp OTP is working again', 'The daily WhatsApp check passed.', 'WHATSAPP_HEALTH', undefined, 'SUPER_ADMIN')
          .catch(() => undefined);
      }
    }
  }
}
