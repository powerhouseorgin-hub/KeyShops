import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { WhatsappOtpService } from './whatsapp-otp.service';
import type { Request, Response } from 'express';

// Constant-time check of Meta's X-Hub-Signature-256 header ("sha256=<hex>") against the raw request body, signed
// with the app secret. Exported for tests.
export function verifyMetaSignature(rawBody: Buffer | string | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header || !appSecret || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
  } catch {
    return false;
  }
}

// Constant-time string comparison that also copes with different lengths.
function sameSecret(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Receiver for WhatsApp Cloud API webhooks: https://api.keyshops.in/api/webhooks/whatsapp
//
//   GET  - Meta's one-time subscription handshake. It calls with hub.mode=subscribe, hub.verify_token and
//          hub.challenge; the challenge is echoed back only when the token equals WHATSAPP_WEBHOOK_VERIFY_TOKEN.
//   POST - delivery events and incoming messages. Status events are only logged (message id, status and error code - no phone
//          numbers or content). Incoming TEXT messages are handed to WhatsappOtpService.handleInboundMessage, which acts only on
//          a live "KEYSHOPS <ref>" (the WhatsApp OTP flow) and ignores everything else; that path needs WHATSAPP_APP_SECRET, so it can
//          only be driven by calls signed by Meta. When the secret is set, the payload's signature is verified first and an
//          unsigned or wrongly signed call is rejected.
//
// Public by necessity (Meta calls it), so it does as little as possible and trusts nothing in the payload.
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly otp: WhatsappOtpService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
    if (!expected || mode !== 'subscribe' || typeof token !== 'string' || !sameSecret(token, expected) || typeof challenge !== 'string' || challenge.length > 200) {
      return res.status(403).type('text/plain').send('Forbidden');
    }
    return res.status(200).type('text/plain').send(challenge);
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request & { rawBody?: Buffer }, @Body() body: any) {
    const secret = process.env.WHATSAPP_APP_SECRET || '';
    if (secret) {
      const raw = req.rawBody ?? (req as any)._rawBody;
      if (!verifyMetaSignature(raw, req.header('x-hub-signature-256'), secret)) {
        console.warn('WhatsApp webhook: rejected a call with a missing or invalid signature');
        return { received: false };
      }
    }

    try {
      for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
          const value = change?.value;
          for (const s of Array.isArray(value?.statuses) ? value.statuses : []) {
            const error = Array.isArray(s?.errors) && s.errors[0] ? ` error=${String(s.errors[0].code)}` : '';
            console.log(`[WhatsApp status] ${String(s?.status)} id=${String(s?.id).slice(0, 80)}${error}`);
          }
          // incoming messages: only for OUR business number, only text, one at a time; a failure on one never affects the rest
          if (value?.metadata?.phone_number_id && value.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
          for (const m of Array.isArray(value?.messages) ? value.messages : []) {
            if (m?.type !== 'text' || typeof m?.from !== 'string' || typeof m?.text?.body !== 'string') continue;
            try {
              const outcome = await this.otp.handleInboundMessage({ from: m.from, id: String(m.id || ''), body: m.text.body });
              if (outcome !== 'ignored') console.log(`[WhatsApp inbound] ${outcome} id=${String(m.id).slice(0, 80)}`);
            } catch (err: any) {
              console.error('WhatsApp inbound message handling failed:', err?.message);
            }
          }
        }
      }
    } catch {
      // a malformed payload must never turn into an error response - Meta would retry it
    }
    return { received: true };
  }
}
