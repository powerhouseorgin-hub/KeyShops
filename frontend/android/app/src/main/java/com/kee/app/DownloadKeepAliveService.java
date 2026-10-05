package com.kee.app;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.IBinder;
import androidx.core.app.ServiceCompat;

// A foreground service whose only job is to show the ongoing download notification and, by being a foreground service, keep the app's
// process alive and un-throttled while the receipts of a long download are being made in the web view (a plain app in the background can
// be frozen after a short while). It does no work itself. Started and stopped by DownloadNotificationPlugin.
public class DownloadKeepAliveService extends Service {
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null ? intent.getStringExtra(EXTRA_TITLE) : "Download";
        String text = intent != null && intent.getStringExtra(EXTRA_TEXT) != null ? intent.getStringExtra(EXTRA_TEXT) : "";
        try {
            ServiceCompat.startForeground(
                this, DownloadNotifications.ID_PROGRESS, DownloadNotifications.progress(this, title, text, -1),
                android.os.Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0
            );
        } catch (Exception e) {
            // not allowed to run as a foreground service right now: the download carries on, just without the keep-alive
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
