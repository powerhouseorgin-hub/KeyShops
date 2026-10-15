// firebase-admin's auth module pulls in an ES-module-only dependency that Jest cannot load; the controller only needs the class shapes here.
jest.mock('./firebase-auth.service', () => ({ FirebaseAuthService: class {}, syntheticEmailForPhone: (p: string) => p + '@phone.keyshops.internal' }));
jest.mock('./firebase-auth.guard', () => ({ FirebaseAuthGuard: class {} }));

import { FirestoreAuthController } from './firestore-auth.controller';

// Login by phone number must reach the shop's OWN account even when Firebase's "user by phone number" lookup returns an older phone-only
// Auth user (no email, no password) that happens to hold the same number - the real defect found on 2026-10-15.
describe('FirestoreAuthController login: resolving the identifier to an email', () => {
  const OWN_EMAIL = '9000000001@phone.keyshops.internal';

  function setup(opts: { profile?: { id: string } | null; ownEmail?: string | null; firebaseLookup?: string | null; ownEmailThrows?: boolean }) {
    const firebaseAuth: any = {
      // what Firebase's own phone lookup answers (the older, email-less user => null)
      resolveLoginEmail: jest.fn(async () => (opts.firebaseLookup === undefined ? null : opts.firebaseLookup)),
      getAuthEmail: jest.fn(async () => {
        if (opts.ownEmailThrows) throw new Error('auth/user-not-found');
        return opts.ownEmail === undefined ? OWN_EMAIL : opts.ownEmail;
      }),
    };
    const users: any = { findByEmailOrPhone: jest.fn(async () => (opts.profile === undefined ? { id: 'uid-own' } : opts.profile)) };
    const ctrl: any = new FirestoreAuthController(firebaseAuth, {} as any, {} as any, {} as any, {} as any, users);
    return { ctrl, firebaseAuth, users };
  }

  it('an email identifier is used as it is', async () => {
    const { ctrl, users, firebaseAuth } = setup({});
    expect(await ctrl.resolveLoginEmail('owner@example.com')).toBe('owner@example.com');
    expect(users.findByEmailOrPhone).not.toHaveBeenCalled();
    expect(firebaseAuth.resolveLoginEmail).not.toHaveBeenCalled();
  });

  it('a phone number is resolved through our phone index to the profile\'s own account - not through Firebase\'s phone lookup', async () => {
    const { ctrl, users, firebaseAuth } = setup({ firebaseLookup: null }); // Firebase would hand back the email-less stray user
    expect(await ctrl.resolveLoginEmail('90000 00001')).toBe(OWN_EMAIL);
    expect(users.findByEmailOrPhone).toHaveBeenCalledWith('9000000001');
    expect(firebaseAuth.getAuthEmail).toHaveBeenCalledWith('uid-own');
    expect(firebaseAuth.resolveLoginEmail).not.toHaveBeenCalled();
  });

  it('+91 and 0-prefixed spellings of the number reach the same account', async () => {
    for (const typed of ['+91 90000 00001', '919000000001', '09000000001']) {
      const { ctrl, users } = setup({});
      expect(await ctrl.resolveLoginEmail(typed)).toBe(OWN_EMAIL);
      expect(users.findByEmailOrPhone).toHaveBeenCalledWith('9000000001');
    }
  });

  it('a number with no index entry falls back to Firebase\'s own lookup (unchanged behaviour)', async () => {
    const { ctrl, firebaseAuth } = setup({ profile: null, firebaseLookup: 'legacy@example.com' });
    expect(await ctrl.resolveLoginEmail('9000000001')).toBe('legacy@example.com');
    expect(firebaseAuth.resolveLoginEmail).toHaveBeenCalledWith('9000000001');
  });

  it('an unknown number resolves to nothing (the caller answers "Invalid email or password")', async () => {
    const { ctrl } = setup({ profile: null, firebaseLookup: null });
    expect(await ctrl.resolveLoginEmail('9000000001')).toBeNull();
  });

  it('if the indexed profile\'s Auth user cannot be read, it still falls back rather than failing', async () => {
    const { ctrl, firebaseAuth } = setup({ ownEmailThrows: true, firebaseLookup: 'fallback@example.com' });
    expect(await ctrl.resolveLoginEmail('9000000001')).toBe('fallback@example.com');
    expect(firebaseAuth.resolveLoginEmail).toHaveBeenCalled();
  });
});
