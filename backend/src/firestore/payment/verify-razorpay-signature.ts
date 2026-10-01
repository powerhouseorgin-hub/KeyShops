import * as crypto from 'crypto';

// Pure-crypto port of PaymentService.verifyPaymentSignature - no DB
// dependency in the original either, so this is copied verbatim rather
// than pulling in the whole Prisma-backed PaymentService just for this one
// method (which would reintroduce a TenantService dependency into an
// otherwise Firestore-only module graph).
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret || !orderId || !paymentId || !signature) return false;

  const expectedSignature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch {
    return false;
  }
}
