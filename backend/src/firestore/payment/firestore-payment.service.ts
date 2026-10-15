import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import Razorpay = require('razorpay');
import { PlatformConfigService } from '../config/platform-config.service';
import { FirestoreService } from '../firestore.service';
import { ExtensionError, planRenewal } from '../../common/subscription-extension';

// Creates Razorpay orders for subscription payments - the first one when a shop registers, and later the renewals a shop pays for itself.
// The price always comes from PlatformConfigService.get() (the app never sends an amount). Registration orders are not stored anywhere
// (Razorpay is the order store); a RENEWAL order is also recorded in renewalOrders/{orderId} so that, when the payment comes back, it can
// only be applied to the shop it was created for, and only once (see FirestoreShopService.renewSubscription).
// Signature verification is a pure function in ./verify-razorpay-signature.ts.
@Injectable()
export class FirestorePaymentService {
  private razorpayInstance: Razorpay | null = null;

  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly firestore: FirestoreService,
  ) {}

  // Overridable in tests.
  protected getRazorpay(): Razorpay {
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

  private async priceBreakdown() {
    const config = await this.platformConfig.get();
    const baseAmount = config.subscriptionPrice ?? 999;
    const gstPercent = config.gstPercent ?? 18;
    const gstAmount = Math.round(baseAmount * (gstPercent / 100) * 100) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
    return { baseAmount, gstPercent, gstAmount, totalAmount, amountPaise: Math.round(totalAmount * 100) };
  }

  async createSubscriptionOrder() {
    const { baseAmount, gstPercent, gstAmount, totalAmount, amountPaise } = await this.priceBreakdown();

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

  // A shop pays for its own renewal: one more year, stacked after its current end date (see planRenewal). Refused for a shop a Super Admin
  // switched off, and when the shop is already paid up to the longest period allowed - nobody is charged for something that cannot be applied.
  async createRenewalOrder(shopId: string) {
    const db = this.firestore.db;
    const shopDoc = await db.collection('shops').doc(shopId).get();
    if (!shopDoc.exists) throw new NotFoundException('Shop not found');
    if ((shopDoc.data() as any).isActive === false) {
      throw new ForbiddenException('Your shop account is suspended. Please contact support before renewing.');
    }

    const activeSnap = await db.collection('shops').doc(shopId).collection('subscriptions').where('status', '==', 'ACTIVE').get();
    const active = activeSnap.docs.map((d) => d.data() as any).sort((a, b) => b.endDate - a.endDate)[0] || null;
    const now = Date.now();
    let plan;
    try {
      plan = planRenewal(active ? { plan: active.plan, startDate: active.startDate, endDate: active.endDate } : null, now);
    } catch (e) {
      if (e instanceof ExtensionError) throw new BadRequestException(e.message);
      throw e;
    }

    const { baseAmount, gstPercent, gstAmount, totalAmount, amountPaise } = await this.priceBreakdown();
    const razorpay = this.getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `renew_${Date.now()}`, // Razorpay allows at most 40 characters here
      notes: { source: 'kee', type: 'renewal', shopId, baseAmount: String(baseAmount), gstPercent: String(gstPercent), gstAmount: String(gstAmount) },
    });

    await db.collection('renewalOrders').doc(order.id).set({
      shopId, status: 'CREATED', months: 12, amountPaise, baseAmount, gstPercent, gstAmount, totalAmount, createdAt: now,
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
      currentEndDate: active ? active.endDate : null,
      newEndDate: plan.endDate,
    };
  }
}
