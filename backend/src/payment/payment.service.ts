import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
// The razorpay package is a plain CommonJS `module.exports = Razorpay`, and
// this project's tsconfig doesn't set esModuleInterop - `import Razorpay
// from 'razorpay'` compiles to `razorpay_1.default`, which doesn't exist and
// throws "is not a constructor" at runtime. `= require(...)` avoids the
// interop assumption entirely.
import Razorpay = require('razorpay');
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class PaymentService {
  private razorpayInstance: Razorpay | null = null;

  constructor(private readonly tenantService: TenantService) {}

  // Lazily constructed so a missing key doesn't crash the whole app at
  // startup - it only surfaces when a payment is actually attempted.
  private getRazorpay(): Razorpay {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new InternalServerErrorException('Payment gateway is not configured');
    }
    if (!this.razorpayInstance) {
      this.razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
    return this.razorpayInstance;
  }

  // Amount is always read from PlatformConfig server-side - never trusted
  // from the client - so a tampered request can't create an order for less
  // than the real subscription price.
  async createSubscriptionOrder() {
    const platformConfig = await this.tenantService.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    const subscriptionPrice = platformConfig?.subscriptionPrice ?? 999;
    const amountPaise = Math.round(subscriptionPrice * 100);

    // This Razorpay account is shared with other websites/apps (e.g.
    // staffregister.in) - `notes.source` tags every order from this backend
    // so Kee's payments are filterable/identifiable in the Razorpay
    // Dashboard's combined transaction ledger.
    const razorpay = this.getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `shop_reg_${Date.now()}`,
      notes: { source: 'kee' },
    });

    return {
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    };
  }

  // Standard Razorpay Checkout verification: HMAC-SHA256 of
  // "order_id|payment_id" using the account's key secret must equal the
  // signature Razorpay returned to the client on success. Only Razorpay and
  // this backend ever know the key secret, so a matching signature proves
  // Razorpay itself generated payment_id against order_id - the client
  // can't forge this without the secret.
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret || !orderId || !paymentId || !signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch {
      // Buffer length mismatch (malformed signature) - definitely not valid.
      return false;
    }
  }
}
