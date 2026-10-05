package com.kee.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

// Builds the notifications of a long-running in-app download (e.g. "Download All" invoices), like a browser's download notification:
//   - an ONGOING one with a progress bar and percentage while it runs (it is also the foreground-service notification, see
//     DownloadKeepAliveService, so the system keeps the app's process alive while the receipts are being made);
//   - a normal dismissible one when it finishes (or fails / is cancelled).
// Tapping either opens the app.
final class DownloadNotifications {
    static final String CHANNEL_PROGRESS = "downloads_progress";
    static final String CHANNEL_DONE = "downloads_done";
    static final int ID_PROGRESS = 4201;
    static final int ID_DONE = 4202;

    private DownloadNotifications() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        // LOW importance: shows in the shade without sound or a pop-up on every progress update
        NotificationChannel progress = new NotificationChannel(CHANNEL_PROGRESS, "Download progress", NotificationManager.IMPORTANCE_LOW);
        progress.setDescription("Shows how far a download is");
        progress.setShowBadge(false);
        nm.createNotificationChannel(progress);
        NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Download finished", NotificationManager.IMPORTANCE_DEFAULT);
        done.setDescription("Tells you when a download has finished");
        nm.createNotificationChannel(done);
    }

    private static PendingIntent openApp(Context context) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) return null;
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** progress: 0-100, or a negative number for an indeterminate bar */
    static android.app.Notification progress(Context context, String title, String text, int progress) {
        ensureChannels(context);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_PROGRESS)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp(context));
        if (progress < 0) b.setProgress(0, 0, true);
        else b.setProgress(100, Math.min(100, progress), false).setSubText(Math.min(100, progress) + "%");
        return b.build();
    }

    static android.app.Notification finished(Context context, String title, String text, boolean success) {
        ensureChannels(context);
        return new NotificationCompat.Builder(context, CHANNEL_DONE)
            .setSmallIcon(success ? android.R.drawable.stat_sys_download_done : android.R.drawable.stat_notify_error)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openApp(context))
            .build();
    }
}
