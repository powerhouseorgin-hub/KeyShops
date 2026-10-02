import * as crypto from 'crypto';

// Verifies a Razorpay payment signature (HMAC-SHA256 of "orderId|paymentId" with the key secret) in constant
// time. Pure crypto, no database dependency.
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
