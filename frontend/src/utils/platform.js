import { Capacitor } from '@capacitor/core';

// True only when running inside the native Android/iOS shell (Capacitor),
// never in a regular desktop/mobile browser. Used to skip the marketing
// landing page (PublicSite) for the packaged app and drop straight into the
// login screen, since a native app has no reason to show a browsable
// marketing site before sign-in.
export const IS_NATIVE_APP = Capacitor.isNativePlatform();

// Public landing page shared in referral invites (see the header Refer
// button and the Shop Settings referral card) - the same domain already
// used for the subscription payment QR code. Must be the real deployed
// Firebase Hosting URL (not a placeholder) since recipients actually need to
// be able to open it.
export const KEE_LANDING_PAGE_URL = 'https://keyshops.in';
