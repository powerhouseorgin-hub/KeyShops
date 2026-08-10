import { Controller, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';

// Public (no auth) - reached from the shop self-registration wizard before
// an account exists. Only ever returns an order id/amount/currency/key id
// (all safe to expose); the key secret never leaves PaymentService.
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  async createOrder() {
    return this.paymentService.createSubscriptionOrder();
  }
}
