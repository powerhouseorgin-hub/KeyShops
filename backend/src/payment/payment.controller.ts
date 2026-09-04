import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';

// Public (no auth) - reached from the shop self-registration wizard before
// an account exists. Only ever returns an order id/amount/currency/key id
// (all safe to expose); the key secret never leaves PaymentService.
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // Each call hits Razorpay's own API - tighter than the app-wide default so
  // this can't be used to hammer Razorpay's API or spin up abandoned orders.
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('create-order')
  async createOrder() {
    return this.paymentService.createSubscriptionOrder();
  }
}
