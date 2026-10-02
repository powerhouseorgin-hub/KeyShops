import { Injectable, UnauthorizedException } from '@nestjs/common';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';

// Firebase Auth owns password storage/verification, not us. Two things the
// Admin SDK deliberately does NOT do (by design - it's a trusted-server
// SDK, password verification is a client-facing operation) had to be
// worked around:
//
// 1. There's no Admin SDK method to "check this email+password" - that's
//    only exposed via Firebase Auth's REST API
//    (accounts:signInWithPassword), gated by the project's Web API Key
//    (not a secret in the traditional sense - it identifies the Firebase
//    project to Google's auth backend, same key a web/mobile client SDK
//    would embed - but calling it server-side here means the backend
//    still owns the login endpoint the frontend already talks to, instead
//    of every client needing its own Firebase client SDK integration).
// 2. Verifying a *session cookie* vs a raw *ID token* are different Admin
//    SDK calls (verifySessionCookie vs verifyIdToken) - the guard has to try
//    the right one depending on which the request is carrying (see
//    verifyRequestToken below).
// GCF_WEB_API_KEY is a fallback for deployed Cloud Functions specifically:
// env var names starting with FIREBASE_/X_GOOGLE_/EXT_ are reserved there,
// so functions-api/.env.api supplies the same value under this name
// instead. Standalone scripts/local dev keep using FIREBASE_WEB_API_KEY
// (from backend/.env) unaffected.
function getWebApiKey(): string {
  return process.env.FIREBASE_WEB_API_KEY || process.env.GCF_WEB_API_KEY || '';
}

export interface FirebaseLoginResult {
  idToken: string;
  uid: string;
  email: string | null;
}

// Firebase Auth's password sign-in (accounts:signInWithPassword) has no
// phone+password equivalent - only email+password. A Shop Admin logs in with EITHER their email or phone
// (no real email is required at all). To support that while still fully delegating password
// storage/verification to Firebase, every Auth user gets a login-identity email: the one they typed, or - when
// they only gave a phone - a synthetic, never-user-facing address derived from it. This is a standard pattern
// for "phone+password via Firebase Auth" (the REST API leaves no other option); UserRepository's Firestore
// profile doc still stores the real email as null/undefined - the synthetic address only ever exists inside
// Firebase Auth's own user record.
const SYNTHETIC_EMAIL_DOMAIN = 'phone.keyshops.internal';

export function syntheticEmailForPhone(phone: string): string {
  return `${phone}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

@Injectable()
export class FirebaseAuthService {
  private get auth(): Auth {
    const app = getApps().find((a) => a.name === 'kee-admin');
    if (!app) throw new Error('Firebase admin app not initialized - see FirestoreService');
    return getAuth(app);
  }

  // Verifies email+password against Firebase Auth itself via the REST API
  // (see class doc comment) - throws UnauthorizedException on any failure,
  // with a generic "Invalid email or password" (Firebase's own error codes are
  // intentionally not leaked to the client: don't reveal whether the email exists).
  async signInWithPassword(email: string, password: string): Promise<FirebaseLoginResult> {
    const apiKey = getWebApiKey();
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (!apiKey && !emulatorHost) {
      throw new Error('FIREBASE_WEB_API_KEY/GCF_WEB_API_KEY is not set (Firebase Console -> Project Settings -> General -> Web API Key)');
    }

    // When FIREBASE_AUTH_EMULATOR_HOST is set (local dev/testing - see
    // firebase.json's emulator config), the Auth emulator serves the same
    // REST surface locally and accepts any non-empty API key.
    const baseUrl = emulatorHost
      ? `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`
      : 'https://identitytoolkit.googleapis.com/v1';

    const res = await fetch(
      `${baseUrl}/accounts:signInWithPassword?key=${apiKey || 'emulator-key'}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const body = await res.json();
    if (!res.ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { idToken: body.idToken, uid: body.localId, email: body.email || null };
  }

  // Resolves whatever the login form's single identifier field holds (a
  // real email, or a phone number) to the actual email Firebase Auth has
  // on file for that user - see syntheticEmailForPhone's doc comment.
  // Deliberately returns null rather than throwing on "no such user": the
  // caller should surface a generic "Invalid
  // email or password" either way, never revealing whether the account
  // exists.
  async resolveLoginEmail(identifier: string): Promise<string | null> {
    if (identifier.includes('@')) return identifier;
    const digits = identifier.replace(/\D/g, '');
    const phoneDigits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    try {
      const user = await this.auth.getUserByPhoneNumber(`+91${phoneDigits}`);
      return user.email || null;
    } catch {
      return null;
    }
  }

  // Web session cookie - 24h lifetime, carried as an httpOnly cookie (see
  // session-cookie.ts for the cookie options).
  async createSessionCookie(idToken: string, expiresInMs: number): Promise<string> {
    return this.auth.createSessionCookie(idToken, { expiresIn: expiresInMs });
  }

  // Dual verification: native sends the raw ID token as a Bearer header (verifyIdToken), web
  // sends the session cookie (verifySessionCookie). Tries ID-token
  // verification first (cheaper, no revocation-list round trip) and falls
  // back to session-cookie verification - a request only ever carries one
  // or the other, so exactly one of these succeeds for a genuinely valid
  // credential.
  async verifyRequestToken(token: string): Promise<DecodedIdToken> {
    try {
      return await this.auth.verifyIdToken(token);
    } catch {
      try {
        return await this.auth.verifySessionCookie(token);
      } catch {
        throw new UnauthorizedException('Invalid or expired session');
      }
    }
  }

  async createUser(params: { uid?: string; email?: string; phoneNumber?: string; password: string; displayName: string }) {
    return this.auth.createUser({
      uid: params.uid,
      email: params.email,
      phoneNumber: params.phoneNumber ? `+91${params.phoneNumber}` : undefined,
      password: params.password,
      displayName: params.displayName,
    });
  }

  async setCustomClaims(uid: string, claims: { role: string; shopId: string | null }): Promise<void> {
    await this.auth.setCustomUserClaims(uid, claims);
  }

  // The email Firebase Auth actually has on file for this user (real or
  // synthetic - see syntheticEmailForPhone), needed to verify a current
  // password via signInWithPassword for change-password.
  async getAuthEmail(uid: string): Promise<string | null> {
    return (await this.auth.getUser(uid)).email || null;
  }

  async updatePassword(uid: string, newPassword: string): Promise<void> {
    await this.auth.updateUser(uid, { password: newPassword });
    await this.auth.revokeRefreshTokens(uid);
  }

  async updatePhoneNumber(uid: string, phone10Digits: string): Promise<void> {
    await this.auth.updateUser(uid, { phoneNumber: `+91${phone10Digits}` });
  }

  async disableUser(uid: string): Promise<void> {
    await this.auth.updateUser(uid, { disabled: true });
    await this.auth.revokeRefreshTokens(uid);
  }

  async revokeAllSessions(uid: string): Promise<void> {
    await this.auth.revokeRefreshTokens(uid);
  }

  async deleteUser(uid: string): Promise<void> {
    await this.auth.deleteUser(uid);
  }
}
