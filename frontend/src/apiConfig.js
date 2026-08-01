import { Capacitor, registerPlugin } from '@capacitor/core';

// Native bridge to SaveToDownloadsPlugin.java - see downloadAsset() below
// for why this exists (Capacitor's built-in Filesystem plugin can't write
// to the public Downloads folder on Android 10+ scoped storage). Exported so
// other locally-generated files (e.g. the registration summary PDF) can reuse
// the same native save flow instead of only remote-URL downloads.
export const SaveToDownloads = registerPlugin('SaveToDownloads');

// Base URL for the NestJS backend. In local dev this stays empty, so
// requests go to relative paths like /api/... which Vite's dev server
// proxies to http://localhost:4000 (see vite.config.js).
//
// In production (Firebase Hosting), the frontend and backend are on
// different domains (Firebase Hosting can't proxy /api/** to an external
// host like Render — that rewrite type only supports Cloud Functions/Cloud
// Run). So VITE_API_BASE_URL must be set at build time to the live Render
// backend URL, e.g. https://kee-dopg.onrender.com, and every request is
// made directly to that origin instead. The backend already has CORS
// enabled for all origins (see backend/src/main.ts), so this works as-is.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Uploaded file URLs (customer photos/documents, shop
// verification docs) are stored in the DB as backend-relative paths like
// "/api/uploads/xxx.png" (see backend/src/customer/file.service.ts). Those
// need the same API_BASE prefix to resolve cross-origin. Client-generated
// previews (data: URLs from webcam capture, before upload) and
// any absolute http(s) URLs (e.g. ad/promotion image links) are returned
// unchanged.
export const getAssetUrl = (url) => {
  if (!url) return url;
  return url.startsWith('/api') ? `${API_BASE}${url}` : url;
};

// Builds a download filename from a stored asset URL's own extension plus a
// human-readable base name, e.g. ("/api/uploads/x_1.jpg", "shop_photo") ->
// "shop_photo.jpg". Some call sites used to hardcode an extension (e.g.
// always ".pdf" for a license upload) which produced a wrong/misleading
// extension whenever the shop had actually uploaded a JPG/PNG instead -
// this keeps the downloaded file's extension accurate to what was uploaded.
export const filenameForAsset = (url, baseName) => {
  if (!url) return baseName;
  const clean = url.split('?')[0].split('#')[0];
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(clean);
  return match ? `${baseName}.${match[1].toLowerCase()}` : baseName;
};

// Best-effort MIME type guess from a filename's extension, for the native
// save-to-Downloads path below (Filesystem.downloadFile() on native doesn't
// return a `blob` with its real content-type the way it does on web - see
// the comment inside downloadAsset()).
const MIME_TYPE_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
const guessMimeType = (name) => {
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(name);
  return (match && MIME_TYPE_BY_EXT[match[1].toLowerCase()]) || 'application/octet-stream';
};

// Triggers a real file download rather than a page/tab navigation.
//
// Earlier version of this fetched the file as a blob first (await
// fetch(...).blob()) and clicked a blob: link afterwards. That broke on
// mobile browsers: fetching a blob first introduces an async gap between
// the user's tap and the click(), and most mobile browsers only allow
// download-triggering actions within the synchronous call stack of the
// original user gesture — once that gap exists, the browser falls back to
// just opening/viewing the file instead of downloading it.
//
// The fix for the *web* build is a plain, synchronous <a> click (no await
// beforehand) so it stays inside the gesture, combined with the backend
// sending `Content-Disposition: attachment` on these URLs (see
// file.service.ts and main.ts) — that HTTP header is what actually forces
// a save-to-device across every browser, same-origin or not, rather than
// relying on the HTML `download` attribute (which browsers ignore
// cross-origin anyway).
//
// Inside the packaged Android app (Capacitor), that same <a href> click is
// a top-level WebView navigation to a cross-origin URL. Capacitor's
// WebViewClient has no DownloadListener wired up and, unless the target
// origin is explicitly allow-listed, blocks the navigation outright — this
// is what surfaced to users as "Download redirects to a Chrome error
// page." Fetching over the WebView is also unreliable for the Firebase
// Storage-backed URLs. So on native platforms we bypass the WebView
// entirely: Filesystem.downloadFile() uses the native OS HTTP stack (not
// subject to WebView navigation rules or page-level CORS) to fetch the file
// into the app's private cache dir, then the native SaveToDownloads plugin
// (android/app/src/main/java/com/kee/app/SaveToDownloadsPlugin.java) copies
// it straight into the device's public Downloads folder - so tapping
// Download actually downloads the file immediately, the same way a browser
// download would, without the user having to go through a share sheet and
// manually pick a save target.
//
// On Android 10+ this needs no permission prompt at all (it uses the
// scoped-storage MediaStore.Downloads API, which Google designed to not
// require one). On Android 9 and below it requests the classic
// WRITE_EXTERNAL_STORAGE permission the first time - the native plugin
// handles that prompt itself.
export const downloadAsset = async (url, filename) => {
  if (!url) return;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('document_downloaded'));
    }
  } catch (e) {}
  const fullUrl = getAssetUrl(url);
  const safeName = (filename || fullUrl.split('/').pop().split('?')[0] || 'download').replace(/[\\/]/g, '_');

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    // Step 1: actually fetch the file onto the device. A failure here is a
    // real download failure (bad URL, no connection, server error) and is
    // worth surfacing to the user.
    let uri;
    try {
      // @capacitor/filesystem v5.1+ (we're on v8) no longer returns a `uri`
      // from downloadFile() itself - only `path` (and `blob`, web-only). The
      // real file:// URI has to be resolved separately via getUri() using the
      // same path/directory the file was just saved to. Previously this
      // destructured a non-existent `uri` field (always undefined), which
      // then got handed to Share.share({ url: undefined, ... }) below and
      // threw - this is what surfaced to users as "Download errors and
      // doesn't download".
      await Filesystem.downloadFile({
        url: fullUrl,
        path: safeName,
        directory: Directory.Cache,
      });
      ({ uri } = await Filesystem.getUri({ path: safeName, directory: Directory.Cache }));
    } catch (err) {
      console.error('Native file download failed:', err);
      window.alert(`Could not download "${safeName}". Please check your connection and try again.`);
      return;
    }

    // Step 2: copy the already-downloaded file straight into the public
    // Downloads folder via the native plugin. If that fails for any reason
    // (older OEM storage quirks, permission denied, etc.) fall back to the
    // OS share sheet so the user still has a way to get the file out,
    // rather than hitting a dead end - but a failure/cancel in THAT
    // fallback step must not show the same "could not download" alert,
    // since the file was already genuinely downloaded in step 1 by then.
    try {
      await SaveToDownloads.saveFile({
        sourcePath: uri,
        fileName: safeName,
        mimeType: guessMimeType(safeName),
      });
      window.alert(`"${safeName}" downloaded to your Downloads folder.`);
    } catch (err) {
      console.warn('Direct save to Downloads failed, falling back to share sheet:', err);
      try {
        const { Share } = await import('@capacitor/share');
        // Share.share's `url` option is for sharing a web link, not a local
        // file - local files must go through `files` (an array of file://
        // URIs) instead, or the OS share sheet silently rejects/ignores it.
        await Share.share({ files: [uri], dialogTitle: `Save ${safeName}` });
      } catch (shareErr) {
        // Android's chooser almost always reports back RESULT_CANCELED here
        // even when the user picked a target and the share genuinely
        // succeeded (see @capacitor/share's SharePlugin.java) - so this is
        // just logged, not shown as an error, since the file is already
        // sitting safely in the app's cache either way.
        console.warn('Share sheet dismissed or result unreported (file was already downloaded):', shareErr);
      }
    }
    return;
  }

  const link = document.createElement('a');
  link.href = fullUrl;
  if (filename) link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
