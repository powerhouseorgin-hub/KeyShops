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

// Best-effort, non-blocking storage/media permission priming before opening
// a document/photo picker (native Android only - iOS's photo picker and the
// web <input type=file> UI never need an explicit runtime permission
// request). Deliberately never throws or blocks the picker from opening:
// on modern Android (13+) gallery access goes through the permission-less
// system Photo Picker / Storage Access Framework, so this is a courtesy
// request for older OS versions rather than a hard gate.
export async function primeStoragePermission() {
  if (!IS_NATIVE_APP) return;
  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage !== 'granted') {
      await Filesystem.requestPermissions();
    }
  } catch (e) {
    console.warn('Storage permission priming skipped:', e);
  }
}
