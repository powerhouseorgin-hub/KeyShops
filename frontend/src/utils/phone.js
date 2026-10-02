// Exactly 10 digits, first digit 1-9 (cannot start with 0). Mirrors
// backend/src/common/validators/phone.ts.
export const PHONE_REGEX = /^[1-9]\d{9}$/;
export const PHONE_REGEX_MESSAGE = 'Phone number must be exactly 10 digits and cannot start with 0';

// Accepts any standard Indian phone format a user might type or paste -
// bare 10-digit, +91/91-prefixed, a leading trunk 0, mixed with
// spaces/dashes/parens - and normalizes it down to the canonical bare
// 10-digit form the backend stores and expects. Returns null if the input
// can't be resolved to a valid 10-digit number.
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let candidate = digits;
  if (digits.length === 12 && digits.startsWith('91')) candidate = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) candidate = digits.slice(1);
  return PHONE_REGEX.test(candidate) ? candidate : null;
}

// E.164 form (India-only, matches normalizePhone).
export function toE164(raw) {
  const normalized = normalizePhone(raw);
  return normalized ? `+91${normalized}` : null;
}

// Digits-only international form WhatsApp links/intents need (wa.me/<this>,
// the Android `jid` extra): the canonical bare 10-digit number gets India's
// +91 country code prepended. Without the country code WhatsApp can't resolve
// the number at all, so a link built from the stored 10-digit phone opens no
// chat. Anything that doesn't normalize to a valid Indian number is passed
// through as plain digits (it may already carry another country code).
export function toWhatsAppNumber(raw) {
  const normalized = normalizePhone(raw);
  if (normalized) return `91${normalized}`;
  return String(raw || '').replace(/\D/g, '');
}
