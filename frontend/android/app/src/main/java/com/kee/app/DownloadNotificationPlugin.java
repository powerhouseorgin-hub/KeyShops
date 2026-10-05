package com.kee.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

// The progress notification of an in-app download (Sales "Download All"): start() shows an ongoing notification and starts the
// keep-alive foreground service, update() moves its progress bar / percentage, finish() replaces it with a "finished" notification.
// Every method is fail-soft - a missing notification permission or a refused foreground service never breaks the download itself.
// requestPermissions() (inherited, asks for POST_NOTIFICATIONS on Android 13+) is called by the web layer once, before the first download.
@CapacitorPlugin(
    name = "DownloadNotification",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class DownloadNotificationPlugin extends Plugin {

    private boolean canNotify() {
        Context c = getContext();
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    private void notifySafely(int id, android.app.Notification notification) {
        if (!canNotify()) return;
        try {
            NotificationManagerCompat.from(getContext()).notify(id, notification);
        } catch (SecurityException ignored) {
            // permission revoked between the check and the call
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "Download");
        String text = call.getString("text", "");
        Context c = getContext();
        try {
            Intent service = new Intent(c, DownloadKeepAliveService.class);
            service.putExtra(DownloadKeepAliveService.EXTRA_TITLE, title);
            service.putExtra(DownloadKeepAliveService.EXTRA_TEXT, text);
            ContextCompat.startForegroundService(c, service);
        } catch (Exception e) {
            // no keep-alive service: still show the ordinary ongoing notification below
        }
        notifySafely(DownloadNotifications.ID_PROGRESS, DownloadNotifications.progress(c, title, text, -1));
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "Download");
        String text = call.getString("text", "");
        Integer progress = call.getInt("progress", -1);
        notifySafely(DownloadNotifications.ID_PROGRESS, DownloadNotifications.progress(getContext(), title, text, progress == null ? -1 : progress));
        call.resolve();
    }

    @PluginMethod
    public void finish(PluginCall call) {
        String title = call.getString("title", "Download");
        String text = call.getString("text", "");
        boolean success = Boolean.TRUE.equals(call.getBoolean("success", true));
        Context c = getContext();
        try {
            c.stopService(new Intent(c, DownloadKeepAliveService.class));
        } catch (Exception ignored) {
            // already stopped
        }
        NotificationManagerCompat.from(c).cancel(DownloadNotifications.ID_PROGRESS);
        notifySafely(DownloadNotifications.ID_DONE, DownloadNotifications.finished(c, title, text, success));
        JSObject result = new JSObject();
        result.put("shown", canNotify());
        call.resolve(result);
    }
}
