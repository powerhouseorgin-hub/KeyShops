import { Injectable } from '@nestjs/common';

// Sends the customer-facing service invoice (see the frontend's
// customerInvoicePdf.js) as a WhatsApp document straight to the customer's
// own number, right after registration - the automatic counterpart to the
// existing manual "Share via WhatsApp" wa.me link (which still requires the
// shop admin to tap Send). A business can only ever *originate* a WhatsApp
// conversation with a pre-approved template message (Meta's rule, not
// ours) - this customer has virtually never messaged the shop's WhatsApp
// number first, so there is no open 24h session to send a free-form
// document into. A separate, dedicated template from the OTP one is
// expected here (WHATSAPP_INVOICE_TEMPLATE_NAME): a Meta-approved
// "Utility" category template with a DOCUMENT header (send-time link +
// filename) and two body text variables, {{1}} customer name and {{2}} shop
// name - e.g. body "Hi {{1}}, thank you for visiting {{2}}. Your service
// invoice is attached." Same fail-soft contract as WhatsappOtpService: never
// throws, just logs and returns false when creds/template aren't configured
// or Meta's API rejects the send, so a customer-invoice failure never blocks
// the registration flow that triggered it.
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export interface SendInvoiceResult {
  success: true;
  delivered: boolean;
}

@Injectable()
export class WhatsappInvoiceService {
  async sendInvoiceDocument(params: {
    phone: string; // bare 10-digit, normalized by the caller
    customerName: string;
    shopName: string;
    documentUrl: string;
    fileName: string;
  }): Promise<SendInvoiceResult> {
    const delivered = await this.send(params);
    if (!delivered) {
      console.log(`[WhatsApp Invoice dev fallback] delivery not configured/failed — invoice for ${params.customerName} (${params.phone}): ${params.documentUrl}`);
    }
    return { success: true, delivered };
  }

  // Same send, but says WHY it failed (a short, user-safe sentence) so a screen can show which recipient failed and why.
  async sendInvoiceDocumentDetailed(params: {
    phone: string; customerName: string; shopName: string; documentUrl: string; fileName: string;
    templateName?: string; // another approved template with the same shape (document header, {{1}} name, {{2}} shop); default: WHATSAPP_INVOICE_TEMPLATE_NAME
  }): Promise<{ ok: boolean; error?: string }> {
    const outcome = await this.sendWithReason(params);
    if (!outcome.ok) console.log(`[WhatsApp Invoice] not sent to ${params.customerName}: ${outcome.error}`);
    return outcome;
  }

  private async send(params: { phone: string; customerName: string; shopName: string; documentUrl: string; fileName: string }): Promise<boolean> {
    return (await this.sendWithReason(params)).ok;
  }

  private async sendWithReason(params: { phone: string; customerName: string; shopName: string; documentUrl: string; fileName: string; templateName?: string }): Promise<{ ok: boolean; error?: string }> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const templateName = params.templateName || process.env.WHATSAPP_INVOICE_TEMPLATE_NAME || '';
    if (!accessToken || !phoneNumberId || !templateName) return { ok: false, error: 'WhatsApp sending is not set up on the server' };

    try {
      const to = `91${params.phone}`;
      const res = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: templateName,
              language: { code: 'en' },
              components: [
                {
                  type: 'header',
                  parameters: [{ type: 'document', document: { link: params.documentUrl, filename: params.fileName } }],
                },
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: params.customerName },
                    { type: 'text', text: params.shopName },
                  ],
                },
              ],
            },
          }),
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('WhatsApp invoice send failed:', body);
        const detail = String(body?.error?.error_user_msg || body?.error?.message || `HTTP ${res.status}`).slice(0, 140);
        return { ok: false, error: detail };
      }
      return { ok: true };
    } catch (err: any) {
      console.error('WhatsApp invoice send failed:', err.message);
      return { ok: false, error: 'Could not reach WhatsApp' };
    }
  }
}
