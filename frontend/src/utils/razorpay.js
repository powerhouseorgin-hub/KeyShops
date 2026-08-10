// Thin wrapper around Razorpay's Checkout widget (https://checkout.razorpay.com/v1/checkout.js).
// Loaded on demand rather than bundled/pre-loaded on every page load, since
// only the shop self-registration wizard's payment step ever needs it.
let razorpayScriptPromise = null;

export function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => {
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

// order: { orderId, amount, currency, keyId } from POST /api/payment/create-order
// prefill: { name, email, contact }
// onSuccess(response) receives Razorpay's { razorpay_order_id, razorpay_payment_id, razorpay_signature }
export async function openRazorpayCheckout({ order, prefill, description, onSuccess, onDismiss, onError }) {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    onError?.(new Error('Could not load the payment gateway. Check your connection and try again.'));
    return;
  }

  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: 'Kee',
    description: description || 'Shop Subscription',
    order_id: order.orderId,
    prefill,
    theme: { color: '#8C24FF' },
    handler: (response) => onSuccess(response),
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });

  rzp.on('payment.failed', (response) => {
    onError?.(new Error(response?.error?.description || 'Payment failed. Please try again.'));
  });

  rzp.open();
}
