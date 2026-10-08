// A pragmatic email check (one @, a dot in the domain, no spaces) - the real proof an address works is that a code reaches it.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_REGEX_MESSAGE = 'Enter a valid email address';

// Lower-cased and trimmed - the form used as the OTP identifier and as the emailIndex key. Returns null when it is not an email.
export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const email = String(raw).trim().toLowerCase();
  return email.length <= 254 && EMAIL_REGEX.test(email) ? email : null;
}
