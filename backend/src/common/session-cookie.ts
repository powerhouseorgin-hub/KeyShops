import { CookieOptions } from 'express';

// Web-only session cookie carrying a Firebase session cookie (minted from the user's ID token at login, see
// FirebaseAuthService.createSessionCookie) - httpOnly so it's unreachable from JS (the point of this: an XSS
// bug can't read a persisted, long-lived token out of localStorage - see AuthContext.jsx). Native never gets
// this cookie at all (see the `platform !== 'native'` check at the call sites) - it sends the Firebase ID
// token via the Authorization header instead, since a Capacitor WebView's cookie jar doesn't reliably carry a
// cross-origin cookie the way a real browser does.
//
// Set and cleared with the exact same options - clearCookie only actually
// removes a cookie whose Domain/Path/SameSite match what it was set with.
export const SESSION_COOKIE_NAME = 'kee_session';

// The web app (keyshops.in) and the API (api.keyshops.in) are different
// subdomains of the same registrable domain - Domain=.keyshops.in is what
// makes the cookie sent to keyshops.in during login also reach
// api.keyshops.in on every later request, and it puts both under the same
// "site" for SameSite purposes, so Lax (not None) is enough. Omitted in
// dev, where the API is plain http://localhost and a Domain attribute
// pointing at a real registrable domain would make the browser reject the
// cookie outright.
export function sessionCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: isProd ? '.keyshops.in' : undefined,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24h, matches the session-cookie lifetime minted in FirebaseAuthService
  };
}

// res.clearCookie(name, options) works by re-issuing the cookie with an
// empty value and an immediately-past Expires - but Express computes
// Expires from `maxAge` when one is present in the options, which silently
// overrides that past-Expires back to "24h from now" (the emptied value
// still fails session-cookie verification, so login-gating stays correct either way,
// but the cookie then lingers in the browser for a full day instead of
// actually being removed). Every field must otherwise match what the
// cookie was set with, or the browser treats this as a different cookie
// and the original is never matched to be cleared at all.
export function clearedSessionCookieOptions(): CookieOptions {
  const { maxAge, ...rest } = sessionCookieOptions();
  return rest;
}
