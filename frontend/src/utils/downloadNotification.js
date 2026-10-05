import { Capacitor, registerPlugin } from '@capacitor/core';

// The Android progress notification of an in-app download (DownloadNotificationPlugin.java): an ongoing notification with a progress bar
// and percentage while the download runs (it also starts a small foreground service so the app is not frozen when it goes to the
// background), and a normal "finished" notification at the end. A no-op on the website (the in-app downloads panel shows the progress
// there). Never throws - a download must not depend on its notification.
const Native = registerPlugin('DownloadNotification');
const native = () => Capacitor.isNativePlatform();
let asked = false;

export async function notifyStart(title, text) {
  if (!native()) return;
  try {
    if (!asked) {
      asked = true;
      await Native.requestPermissions(); // Android 13+: asks to allow notifications, once
    }
    await Native.start({ title, text });
  } catch (e) {
    console.warn('Download notification could not start:', e);
  }
}

export function notifyProgress(title, text, percent) {
  if (!native()) return;
  Native.update({ title, text, progress: percent }).catch(() => {});
}

export function notifyFinish(title, text, success = true) {
  if (!native()) return;
  Native.finish({ title, text, success }).catch(() => {});
}
