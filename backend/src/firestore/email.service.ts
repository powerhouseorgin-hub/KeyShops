import { Injectable } from '@nestjs/common';
import * as dns from 'dns';
import * as nodemailer from 'nodemailer';

// Sends the verification-code emails. Two ways, chosen by the environment:
//
//  1. RELAY - hand the message to an SMTP service (Gmail with an app password, Brevo, Amazon SES, a company mailbox ...). Works from
//     anywhere, including Cloud Functions. One mailbox is enough:
//       SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER, SMTP_PASS, EMAIL_FROM
//     A mailbox has a daily sending limit (Gmail: about 500 a day), so up to four BACKUP mailboxes can be added with the same names
//     and a _2 ... _5 suffix: SMTP_USER_2, SMTP_PASS_2, EMAIL_FROM_2 (SMTP_HOST_2 / SMTP_PORT_2 only if it is a different provider; the
//     host and port of the first one are used otherwise). They are tried in order: when one refuses (daily limit reached, wrong
//     password ...) the message goes out through the next, and the refusing one is left alone for a while. Wins over DIRECT.
//  2. DIRECT (EMAIL_DIRECT=true) - no email provider at all. Our own code looks up the recipient's mail server in DNS (MX records),
//     connects to it and hands the message over, signed with our own DKIM key. Needs EMAIL_FROM, EMAIL_HELO_HOSTNAME (the server's own
//     name, e.g. mail.keyshops.in), DKIM_DOMAIN, DKIM_SELECTOR, DKIM_PRIVATE_KEY (see scripts/generate-dkim.ts), DNS records for the
//     sending domain (SPF, DKIM, DMARC) and a server whose IP has a matching reverse-DNS name. It must run somewhere that allows
//     outbound port 25: Google Cloud's serverless platforms (Cloud Functions / Cloud Run) block it, so from there nothing is delivered.
//     Without those records and a proper IP, big mailbox providers (Gmail, Outlook, Yahoo) put such mail in spam or refuse it.
//
// Neither set = "not configured": sending reports false and the OTP flow says the code could not be delivered (fail-soft, like the
// WhatsApp side). The code is never logged.
const DIRECT_MAX_HOSTS = 3;
const MAX_RELAY_ACCOUNTS = 5;
// How long a mailbox that refused is left alone: a reached daily limit, or a rejected login. Other failures (a timeout) do not pause it.
const PAUSE_QUOTA_MS = 60 * 60 * 1000;
const PAUSE_AUTH_MS = 30 * 60 * 1000;

export interface MailMessage { from: string; to: string; subject: string; text: string; html: string }
interface RelayAccount { host: string; port: number; user: string; pass: string; from: string }

@Injectable()
export class EmailService {
  private relayTransports = new Map<string, { key: string; transporter: nodemailer.Transporter }>();
  // mailbox (SMTP user) -> time until which it is not tried, after it refused with a limit / login error
  private pausedUntil = new Map<string, number>();

  // Replaceable in tests (and the only DNS the direct mode needs).
  resolveMx: (domain: string) => Promise<dns.MxRecord[]> = (domain) => dns.promises.resolveMx(domain);

  // The configured mailboxes, in the order they are tried: the plain names first, then _2 ... _5.
  private relayAccounts(): RelayAccount[] {
    const list: RelayAccount[] = [];
    const baseHost = process.env.SMTP_HOST || '';
    const basePort = Number(process.env.SMTP_PORT || 587);
    for (let i = 1; i <= MAX_RELAY_ACCOUNTS; i++) {
      const sfx = i === 1 ? '' : `_${i}`;
      const user = process.env[`SMTP_USER${sfx}`];
      const pass = process.env[`SMTP_PASS${sfx}`];
      const host = process.env[`SMTP_HOST${sfx}`] || baseHost;
      const from = process.env[`EMAIL_FROM${sfx}`] || (i > 1 && user && user.includes('@') ? `Key Shops <${user}>` : '');
      if (user && pass && host && from) {
        list.push({ host, port: Number(process.env[`SMTP_PORT${sfx}`] || basePort), user, pass, from });
      }
    }
    return list;
  }

  private relayConfigured(): boolean {
    return this.relayAccounts().length > 0;
  }

  private directEnabled(): boolean {
    return process.env.EMAIL_DIRECT === 'true' && !!process.env.EMAIL_FROM;
  }

  isConfigured(): boolean {
    return this.relayConfigured() || this.directEnabled();
  }

  // One transport per mailbox, rebuilt only when its settings change, so a rotated password takes effect without a restart.
  private relayTransport(acc: RelayAccount): nodemailer.Transporter {
    const key = [acc.host, acc.port, acc.user, acc.pass].join('|');
    const cached = this.relayTransports.get(acc.user);
    if (cached && cached.key === key) return cached.transporter;
    const transporter = this.makeTransport({
      host: acc.host,
      port: acc.port,
      secure: acc.port === 465,
      auth: { user: acc.user, pass: acc.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    this.relayTransports.set(acc.user, { key, transporter });
    return transporter;
  }

  // One connection to one receiving mail server, signed with our DKIM key when it is set up. TLS is used when the server offers it
  // (like any mail server does) but an unverifiable certificate does not stop delivery.
  private directTransport(host: string): nodemailer.Transporter {
    const dkimKey = (process.env.DKIM_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    return this.makeTransport({
      host,
      port: Number(process.env.EMAIL_DIRECT_PORT || 25),
      secure: false,
      name: process.env.EMAIL_HELO_HOSTNAME || undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      ...(dkimKey && process.env.DKIM_DOMAIN && process.env.DKIM_SELECTOR
        ? { dkim: { domainName: process.env.DKIM_DOMAIN, keySelector: process.env.DKIM_SELECTOR, privateKey: dkimKey } }
        : {}),
    });
  }

  // Overridable in tests.
  protected makeTransport(options: any): nodemailer.Transporter {
    return nodemailer.createTransport(options);
  }

  // How long to leave a mailbox alone after this failure (0 = do not pause it). A reached sending limit and a rejected login both mean
  // "this mailbox cannot send right now"; a timeout or a network blip says nothing about the mailbox itself.
  private pauseFor(err: any): number {
    const text = `${err?.response || ''} ${err?.message || ''}`;
    if (err?.code === 'EAUTH' || err?.responseCode === 535) return PAUSE_AUTH_MS;
    if (/5\.4\.5|4\.7\.0|quota|limit exceeded|sending limit/i.test(text)) return PAUSE_QUOTA_MS;
    return 0;
  }

  // The RECIPIENT's address was refused (does not exist, mailbox full ...): another of our mailboxes would get the same answer, and it
  // says nothing against the mailbox that tried.
  private recipientRefused(err: any): boolean {
    return /\b5\.[12]\.\d\b/.test(String(err?.response || '')) || (Array.isArray(err?.rejected) && err.rejected.length > 0);
  }

  // Tries the mailboxes in order and returns on the first that accepts the message. Mailboxes that recently refused are skipped; when
  // every one is paused, the one whose pause ends first is tried anyway so a recovered mailbox is noticed.
  private async deliverRelay(message: MailMessage): Promise<boolean> {
    const accounts = this.relayAccounts();
    const now = Date.now();
    let candidates = accounts.filter((a) => (this.pausedUntil.get(a.user) || 0) <= now);
    if (candidates.length === 0 && accounts.length) {
      candidates = [accounts.slice().sort((a, b) => (this.pausedUntil.get(a.user) || 0) - (this.pausedUntil.get(b.user) || 0))[0]];
    }
    const failures: string[] = [];
    for (const acc of candidates) {
      try {
        await this.relayTransport(acc).sendMail({ ...message, from: acc.from });
        this.pausedUntil.delete(acc.user);
        if (failures.length) console.error(`Email OTP: sent through backup mailbox #${accounts.indexOf(acc) + 1} after: ${failures.join(' | ')}`);
        return true;
      } catch (err: any) {
        if (this.recipientRefused(err)) {
          console.error('Email OTP: the recipient address was refused', String(err?.response || '').slice(0, 100).replace(/\s+/g, ' '));
          return false;
        }
        const pause = this.pauseFor(err);
        if (pause) this.pausedUntil.set(acc.user, Date.now() + pause);
        failures.push(`mailbox #${accounts.indexOf(acc) + 1} ${err?.responseCode || err?.code || ''} ${String(err?.response || err?.message || err).slice(0, 100).replace(/\s+/g, ' ')}`.trim());
      }
    }
    console.error('Email OTP relay failed:', failures.join(' | '));
    return false;
  }

  // The receiving servers for an address, best first; with no MX record the domain itself receives the mail (RFC 5321).
  private async mailHostsFor(address: string): Promise<string[]> {
    const domain = address.split('@')[1] || '';
    if (!domain) return [];
    try {
      const mx = (await this.resolveMx(domain)).filter((r) => r.exchange && r.exchange !== '.');
      if (mx.length) return mx.sort((a, b) => a.priority - b.priority).slice(0, DIRECT_MAX_HOSTS).map((r) => r.exchange);
    } catch (e: any) {
      if (e?.code !== 'ENODATA' && e?.code !== 'ENOTFOUND') console.error('Email MX lookup failed:', e?.code || '', String(e?.message || e).slice(0, 120));
      if (e?.code === 'ENOTFOUND') return [];
    }
    return [domain];
  }

  private async deliverDirect(message: MailMessage): Promise<boolean> {
    const hosts = await this.mailHostsFor(message.to);
    if (hosts.length === 0) return false;
    let lastError = '';
    for (const host of hosts) {
      try {
        await this.directTransport(host).sendMail(message);
        return true;
      } catch (err: any) {
        lastError = `${err?.code || ''} ${String(err?.message || err).slice(0, 140)}`.trim();
      }
    }
    console.error('Email OTP direct delivery failed:', lastError);
    return false;
  }

  // Never throws: false when email is not configured or the receiving side refused / timed out.
  async sendCode(to: string, code: string, reason: string, minutes: number): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const message: MailMessage = {
      from: process.env.EMAIL_FROM as string,
      to,
      subject: `${code} is your Key Shops verification code`,
      text: `${code} is your Key Shops verification code.\n\nUse it to ${reason}. It is valid for ${minutes} minutes.\nDo not share this code with anyone. If you did not ask for it, you can ignore this email.\n\nKey Shops - keyshops.in`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1f1a17">
  <h2 style="margin:0 0 12px;font-size:18px">Key Shops</h2>
  <p style="margin:0 0 16px;font-size:14px">Use this code to ${escapeHtml(reason)}:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:14px 0;text-align:center;background:#f6f1ea;border-radius:10px">${escapeHtml(code)}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#5b524b">It is valid for ${minutes} minutes. Do not share this code with anyone. If you did not ask for it, you can ignore this email.</p>
</div>`,
    };
    try {
      if (this.relayConfigured()) return await this.deliverRelay(message);
      return await this.deliverDirect(message);
    } catch (err: any) {
      console.error('Email OTP send failed:', err?.code || '', String(err?.message || err).slice(0, 160));
      return false;
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
