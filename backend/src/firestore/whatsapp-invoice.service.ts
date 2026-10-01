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

  private async send(params: { phone: string; customerName: string; shopName: string; documentUrl: string; fileName: string }): Promise<boolean> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const templateName = process.env.WHATSAPP_INVOICE_TEMPLATE_NAME || '';
    if (!accessToken || !phoneNumberId || !templateName) return false;

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
      const body = await res.json();
      if (!res.ok) {
        console.error('WhatsApp invoice send failed:', body);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('WhatsApp invoice send failed:', err.message);
      return false;
    }
  }
}
