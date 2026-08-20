// Thin wrapper around Razorpay's Checkout widget (https://checkout.razorpay.com/v1/checkout.js).
// Loaded on demand rather than bundled/pre-loaded on every page load, since
// only the shop self-registration wizard's payment step ever needs it.
//
// Inside the packaged Android app, this same web checkout.js runs inside a
// WebView instead of a real mobile browser - Razorpay's own docs confirm
// that UPI-intent apps (GPay/PhonePe) and redirect-based methods
// (Netbanking) are unreliable there without extra native glue. So on native
// platforms we instead open Razorpay's real native Checkout Activity via
// the capacitor-razorpay plugin (see MainActivity.java's registerPlugin),
// which doesn't have either problem. The website keeps using checkout.js
// below unchanged, since a real browser tab has no such limitation.
import { Capacitor } from '@capacitor/core';
import { Checkout as NativeCheckout } from 'capacitor-razorpay';

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
  if (Capacitor.isNativePlatform()) {
    return openNativeRazorpayCheckout({ order, prefill, description, onSuccess, onDismiss, onError });
  }

  const loaded = await loadRazorpayScript();
  if (!loaded) {
    onError?.(new Error('Could not load the payment gateway. Check your connection and try again.'));
    return;
  }

  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: 'Key Shops',
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

async function openNativeRazorpayCheckout({ order, prefill, description, onSuccess, onDismiss, onError }) {
  try {
    const result = await NativeCheckout.open({
      key: order.keyId,
      // The native SDK wants amount as a string, unlike checkout.js's number.
      amount: String(order.amount),
      currency: order.currency,
      name: 'Key Shops',
      description: description || 'Shop Subscription',
      order_id: order.orderId,
      prefill,
      theme: { color: '#8C24FF' },
    });

    // The native plugin resolves with { response: <the Razorpay payment
    // payload> } - it's normally already a plain object by the time it
    // crosses Capacitor's JS bridge, but parse defensively in case a given
    // Android/plugin version instead returns it JSON-stringified.
    let payload = result?.response;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { /* leave as-is below */ }
    }
    if (!payload?.razorpay_payment_id || !payload?.razorpay_signature) {
      throw new Error('Payment did not return the expected confirmation data.');
    }
    onSuccess(payload);
  } catch (err) {
    // The plugin rejects with a JSON-stringified Razorpay error object for
    // real failures, or a plain string for "user closed/cancelled" -
    // treat cancellation the same as checkout.js's modal.ondismiss (silent,
    // no error banner) rather than as a failure.
    const rawMessage = err?.message || '';
    let description = rawMessage;
    try {
      const parsed = JSON.parse(rawMessage);
      description = parsed?.description || parsed?.error?.description || rawMessage;
    } catch { /* rawMessage wasn't JSON - use as-is */ }

    if (/cancel/i.test(description)) {
      onDismiss?.();
    } else {
      onError?.(new Error(description || 'Payment failed. Please try again.'));
    }
  }
}
