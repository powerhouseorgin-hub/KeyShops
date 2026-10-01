import { Injectable, InternalServerErrorException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import Razorpay = require('razorpay');
import { PlatformConfigService } from '../config/platform-config.service';

// Firestore counterpart to PaymentService.createSubscriptionOrder -
// identical Razorpay-SDK logic (nothing here was Prisma-specific to begin
// with, see the original's own doc comment: no order record is persisted to
// the DB at all, Razorpay itself is the order store), only the pricing
// lookup source changes from a Prisma PlatformConfig row to
// PlatformConfigService.get(). verifyPaymentSignature is a pure function
// already ported separately (see ../payment/verify-razorpay-signature.ts).
@Injectable()
export class FirestorePaymentService {
  private razorpayInstance: Razorpay | null = null;

  constructor(private readonly platformConfig: PlatformConfigService) {}

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

  async createSubscriptionOrder() {
    const config = await this.platformConfig.get();
    const baseAmount = config.subscriptionPrice ?? 999;
    const gstPercent = config.gstPercent ?? 18;
    const gstAmount = Math.round(baseAmount * (gstPercent / 100) * 100) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
    const amountPaise = Math.round(totalAmount * 100);

    const razorpay = this.getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `shop_reg_${Date.now()}`,
      notes: { source: 'kee', baseAmount: String(baseAmount), gstPercent: String(gstPercent), gstAmount: String(gstAmount) },
    });

    return {
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      baseAmount,
      gstPercent,
      gstAmount,
      totalAmount,
    };
  }
}
