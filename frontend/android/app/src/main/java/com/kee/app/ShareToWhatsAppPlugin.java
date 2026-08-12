package com.kee.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

// Shares a file + caption text directly to WhatsApp, guaranteeing both
// arrive together in the same message.
//
// @capacitor/share's generic Share.share() always wraps its intent in
// Intent.createChooser() (see node_modules/@capacitor/share's
// SharePlugin.java) - that always shows Android's universal share sheet,
// which includes a "direct share" row of quick-contact avatars above the
// app list. Tapping one of those avatar chips bypasses WhatsApp's own
// Activity entirely - Android delivers just the EXTRA_STREAM straight to
// that specific chat and silently drops EXTRA_TEXT, so the caption never
// appears (confirmed via a user screenshot showing the PDF alone with no
// message). Tapping the plain "WhatsApp" app icon instead does work
// correctly (it opens WhatsApp's own contact picker + caption screen), but
// there's no way to steer the user to one row over the other from a generic
// chooser intent.
//
// The fix is to skip the OS chooser altogether: setPackage("com.whatsapp")
// forces Android to launch WhatsApp's own ShareActivity directly, which
// always shows its contact picker with the caption pre-filled from
// EXTRA_TEXT - there is no direct-share row to accidentally tap.
public class ShareToWhatsAppPlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String filePath = call.getString("filePath");
        String text = call.getString("text", "");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (filePath == null) {
            call.reject("filePath is required");
            return;
        }

        String whatsappPackage = resolveWhatsAppPackage();
        if (whatsappPackage == null) {
            call.reject("WhatsApp is not installed");
            return;
        }

        try {
            String path = filePath.startsWith("file://") ? filePath.substring(7) : filePath;
            Uri fileUri = FileProvider.getUriForFile(
                getActivity(),
                getContext().getPackageName() + ".fileprovider",
                new File(Uri.decode(path))
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setPackage(whatsappPackage);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, fileUri);
            if (text != null && !text.isEmpty()) {
                intent.putExtra(Intent.EXTRA_TEXT, text);
            }
            intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getActivity().startActivity(intent);
            call.resolve(new JSObject());
        } catch (ActivityNotFoundException ex) {
            call.reject("Could not open WhatsApp: " + ex.getMessage(), ex);
        } catch (Exception ex) {
            call.reject("Failed to share to WhatsApp: " + ex.getMessage(), ex);
        }
    }

    // Prefers the regular consumer WhatsApp app, falls back to WhatsApp
    // Business if that's what the shop admin has installed instead.
    private String resolveWhatsAppPackage() {
        PackageManager pm = getContext().getPackageManager();
        String[] candidates = { "com.whatsapp", "com.whatsapp.w4b" };
        for (String pkg : candidates) {
            try {
                pm.getPackageInfo(pkg, 0);
                return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return null;
    }
}
