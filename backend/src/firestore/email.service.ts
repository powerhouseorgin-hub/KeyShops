import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

// Sends the verification-code emails. Provider-neutral: any SMTP service works (Brevo, Amazon SES, Resend's SMTP, Gmail with an app
// password ...) - the server only needs these settings:
//   SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER, SMTP_PASS, EMAIL_FROM ("Key Shops <no-reply@keyshops.in>")
// Without them the service is simply "not configured": sending reports false and the OTP flow says the code could not be delivered
// (fail-soft, the same way the WhatsApp side behaves). The code is never logged.
@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private transporterKey = '';

  isConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
  }

  // Rebuilt only when the settings change, so a test (or a rotated password) takes effect without a restart.
  private transport(): nodemailer.Transporter {
    const port = Number(process.env.SMTP_PORT || 587);
    const key = [process.env.SMTP_HOST, port, process.env.SMTP_USER, process.env.SMTP_PASS].join('|');
    if (!this.transporter || key !== this.transporterKey) {
      this.transporter = nodemailer.createTransport({
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

  // Never throws: false when email is not configured or the provider refused / timed out.
  async sendCode(to: string, code: string, reason: string, minutes: number): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.transport().sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject: `${code} is your Key Shops verification code`,
        text: `${code} is your Key Shops verification code.\n\nUse it to ${reason}. It is valid for ${minutes} minutes.\nDo not share this code with anyone. If you did not ask for it, you can ignore this email.\n\nKey Shops - keyshops.in`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1f1a17">
  <h2 style="margin:0 0 12px;font-size:18px">Key Shops</h2>
  <p style="margin:0 0 16px;font-size:14px">Use this code to ${escapeHtml(reason)}:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:14px 0;text-align:center;background:#f6f1ea;border-radius:10px">${escapeHtml(code)}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#5b524b">It is valid for ${minutes} minutes. Do not share this code with anyone. If you did not ask for it, you can ignore this email.</p>
</div>`,
      });
      return true;
    } catch (err: any) {
      console.error('Email OTP send failed:', err?.code || '', String(err?.message || err).slice(0, 160));
      return false;
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
