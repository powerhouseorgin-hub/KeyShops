package com.kee.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

// In-app updater. The web layer decides WHEN an update is needed (it compares the installed versionCode with
// the manifest published on the landing page, see src/utils/appUpdate.js); this plugin does the part a WebView
// cannot: download the APK, check it against the published SHA-256, and hand it to Android's package installer.
//
// Safety:
//   - only HTTPS URLs on the project's own hosts are fetched;
//   - the file is checked against the SHA-256 from the manifest before the installer is launched, and a
//     mismatch deletes it;
//   - Android itself refuses to install an update that is not signed with the same key as the installed app.
// Android 8+ also requires the user to allow "Install unknown apps" for this app once; when that is missing the
// plugin opens that settings page and rejects with code NEEDS_PERMISSION (the downloaded file is kept, so the
// retry does not download again).
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final List<String> ALLOWED_HOSTS = Arrays.asList("keyshops.in", "www.keyshops.in", "keee-7d6cb.web.app");
    private static final String DIR_NAME = "updates";
    private static final String FILE_NAME = "keyshop-update.apk";

    @Override
    public void load() {
        // A leftover APK from an earlier update is only wasted space once the new version is running.
        deleteQuietly(new File(getContext().getCacheDir(), DIR_NAME));
    }

    @PluginMethod
    public void install(final PluginCall call) {
        final String url = call.getString("url");
        final String sha256 = call.getString("sha256");

        if (url == null || !isAllowedUrl(url)) {
            call.reject("The update link is not allowed.", "BAD_URL");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File apk = ensureDownloaded(url, sha256);
                    if (needsInstallPermission()) {
                        openInstallPermissionSettings();
                        call.reject("Allow installs from this app, then try again.", "NEEDS_PERMISSION");
                        return;
                    }
                    launchInstaller(apk);
                    JSObject result = new JSObject();
                    result.put("started", true);
                    call.resolve(result);
                } catch (ChecksumException e) {
                    call.reject("The downloaded update did not match the published file.", "BAD_CHECKSUM");
                } catch (Exception e) {
                    call.reject("Download failed: " + e.getMessage(), "DOWNLOAD_FAILED");
                }
            }
        }).start();
    }

    private static class ChecksumException extends Exception {}

    private boolean isAllowedUrl(String url) {
        try {
            URL u = new URL(url);
            return "https".equals(u.getProtocol()) && ALLOWED_HOSTS.contains(u.getHost().toLowerCase(Locale.ROOT));
        } catch (Exception e) {
            return false;
        }
    }

    private File ensureDownloaded(String url, String expectedSha256) throws Exception {
        File dir = new File(getContext().getCacheDir(), DIR_NAME);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create cache folder");
        File target = new File(dir, FILE_NAME);

        // A previous attempt (e.g. one that stopped at the permission screen) may already hold the right file.
        if (target.exists() && expectedSha256 != null && expectedSha256.equalsIgnoreCase(sha256Of(target))) {
            return target;
        }

        File tmp = new File(dir, FILE_NAME + ".part");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        try {
            if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
            long total = conn.getContentLengthLong();
            InputStream in = conn.getInputStream();
            OutputStream out = new FileOutputStream(tmp);
            try {
                byte[] buf = new byte[32 * 1024];
                long done = 0;
                int lastPercent = -1;
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int percent = (int) (done * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("progress", progress);
                        }
                    }
                }
            } finally {
                out.close();
                in.close();
            }
        } finally {
            conn.disconnect();
        }

        if (expectedSha256 != null && !expectedSha256.equalsIgnoreCase(sha256Of(tmp))) {
            tmp.delete();
            throw new ChecksumException();
        }
        if (target.exists() && !target.delete()) throw new Exception("cannot replace the old download");
        if (!tmp.renameTo(target)) throw new Exception("cannot finish the download");
        return target;
    }

    private String sha256Of(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        FileInputStream in = new FileInputStream(file);
        try {
            byte[] buf = new byte[32 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) digest.update(buf, 0, n);
        } finally {
            in.close();
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    private boolean needsInstallPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void openInstallPermissionSettings() {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private void launchInstaller(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private void deleteQuietly(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File c : children) deleteQuietly(c);
        file.delete();
    }
}
