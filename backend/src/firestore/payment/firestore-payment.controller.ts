import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FirestorePaymentService } from './firestore-payment.service';

// Public (no auth) - reached from the shop self-registration wizard before
// an account exists. See FirestorePaymentService's doc comment.
@Controller('payment')
export class FirestorePaymentController {
  constructor(private readonly payment: FirestorePaymentService) {}

  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('create-order')
  async createOrder() {
    return this.payment.createSubscriptionOrder();
  }
}
