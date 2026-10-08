import { Injectable } from '@nestjs/common';
import * as dns from 'dns';
import * as nodemailer from 'nodemailer';

// Sends the verification-code emails. Two ways, chosen by the environment:
//
//  1. DIRECT (EMAIL_DIRECT=true) - no email provider at all. Our own code looks up the recipient's mail server in DNS (MX records),
//     connects to it and hands the message over, signed with our own DKIM key. Needs:
//       EMAIL_FROM ("Key Shops <no-reply@keyshops.in>"), EMAIL_HELO_HOSTNAME (the server's own name, e.g. mail.keyshops.in),
//       DKIM_DOMAIN, DKIM_SELECTOR, DKIM_PRIVATE_KEY (see scripts/generate-dkim.ts), and DNS records for the sending domain (SPF, DKIM,
//       DMARC) plus a server whose IP has a matching reverse-DNS name. IMPORTANT: it must run somewhere that allows outbound port 25.
//       Google Cloud's serverless platforms (Cloud Functions / Cloud Run) block port 25, so from there nothing is delivered.
//       Without those records and a proper IP, big mailbox providers (Gmail, Outlook, Yahoo) put such mail in spam or refuse it.
//  2. RELAY (SMTP_HOST ...) - hand the message to any SMTP service (Brevo, Amazon SES, Gmail with an app password ...):
//       SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER, SMTP_PASS, EMAIL_FROM. Works from anywhere. Wins when both are set.
//
// Neither set = "not configured": sending reports false and the OTP flow says the code could not be delivered (fail-soft, like the
// WhatsApp side). The code is never logged.
const DIRECT_MAX_HOSTS = 3;

export interface MailMessage { from: string; to: string; subject: string; text: string; html: string }

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private transporterKey = '';

  // Replaceable in tests (and the only DNS the direct mode needs).
  resolveMx: (domain: string) => Promise<dns.MxRecord[]> = (domain) => dns.promises.resolveMx(domain);

  private relayConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
  }

  private directEnabled(): boolean {
    return process.env.EMAIL_DIRECT === 'true' && !!process.env.EMAIL_FROM;
  }

  isConfigured(): boolean {
    return this.relayConfigured() || this.directEnabled();
  }

  // Rebuilt only when the settings change, so a test (or a rotated password) takes effect without a restart.
  private relayTransport(): nodemailer.Transporter {
    const port = Number(process.env.SMTP_PORT || 587);
    const key = [process.env.SMTP_HOST, port, process.env.SMTP_USER, process.env.SMTP_PASS].join('|');
    if (!this.transporter || key !== this.transporterKey) {
      this.transporter = this.makeTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      this.transporterKey = key;
    }
    return this.transporter;
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
      if (this.relayConfigured()) {
        await this.relayTransport().sendMail(message);
        return true;
      }
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
