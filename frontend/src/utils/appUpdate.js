import { App as CapApp } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { IS_NATIVE_APP, KEE_LANDING_PAGE_URL } from './platform';

// In-app update check. The latest version is published on the landing page as /downloads/version.json, which
// scripts/deploy-web.js writes from the APK it embeds - so the number here can never drift from the file the
// download button actually serves:
//   { "versionCode": 117, "versionName": "1.58.20", "apkUrl": "https://keyshops.in/downloads/keyshop-app.keeapp",
//     "sha256": "...", "size": 11230368, "required": true }
// The native side (AppUpdatePlugin.java) downloads the APK, verifies the hash and opens Android's installer.
export const VERSION_MANIFEST_URL = `${KEE_LANDING_PAGE_URL}/downloads/version.json`;

const AppUpdate = registerPlugin('AppUpdate');

// Pure so it is easy to reason about: an update is offered only when the published build is NEWER than the
// installed one. A device that is ahead of the page (e.g. a build that has not been published yet) is never
// asked to "update" back to an older version.
export function isUpdateAvailable(installedBuild, latestVersionCode) {
  return Number.isInteger(installedBuild) && Number.isInteger(latestVersionCode) && latestVersionCode > installedBuild;
}

// Returns the manifest when an update is available, otherwise null. Never throws: if the device is offline or the
// manifest is unreachable or malformed, the app simply opens normally - a version check must not lock anyone out.
export async function checkForUpdate({ timeoutMs = 6000 } = {}) {
  const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('forceUpdateCheck') : null;
  if (!IS_NATIVE_APP && preview === null) return null;
  try {
    const info = preview !== null ? { build: preview, version: `dev-${preview}` } : await CapApp.getInfo();
    const installedBuild = parseInt(info.build, 10);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let manifest;
    try {
      const res = await fetch(`${preview !== null ? '/downloads/version.json' : VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return null;
      manifest = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const apkUrl = typeof manifest?.apkUrl === 'string' ? manifest.apkUrl : '';
    if (!apkUrl.startsWith('https://')) return null;
    if (!isUpdateAvailable(installedBuild, manifest.versionCode)) return null;

    return {
      versionCode: manifest.versionCode,
      versionName: String(manifest.versionName || manifest.versionCode),
      apkUrl,
      sha256: typeof manifest.sha256 === 'string' ? manifest.sha256 : undefined,
      required: manifest.required !== false,
      installedVersionName: String(info.version || installedBuild),
    };
  } catch (e) {
    console.warn('Update check skipped:', e);
    return null;
  }
}

// Downloads + installs. Rejects with err.code of NEEDS_PERMISSION (the user must allow installs from this app,
// the settings page has been opened), BAD_CHECKSUM, BAD_URL or DOWNLOAD_FAILED.
export async function downloadAndInstall(update, onProgress) {
  if (!IS_NATIVE_APP) throw Object.assign(new Error('not native'), { code: 'DOWNLOAD_FAILED' });
  const handle = await AppUpdate.addListener('progress', (e) => onProgress?.(e.percent));
  try {
    return await AppUpdate.install({ url: update.apkUrl, sha256: update.sha256 });
  } finally {
    handle.remove();
  }
}
