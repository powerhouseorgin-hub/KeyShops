package com.kee.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

// Opens WhatsApp straight into the CUSTOMER's own chat with a document (the
// PDF itself, not a link) already attached and ready to send - one tap on
// Send. Capacitor's generic Share plugin can only open the system share sheet,
// where the shop admin has to pick WhatsApp and then hunt for the customer's
// contact again. WhatsApp honours a `jid` extra (<countrycode><number>@
// s.whatsapp.net) on ACTION_SEND to pre-select the chat, which is what makes
// the direct hand-off possible.
//
// `path` is a file the web layer has already written into the app's cache dir
// (Filesystem.writeFile + getUri in pdfDelivery.js); it is exposed to
// WhatsApp through the app's existing FileProvider (${applicationId}.fileprovider,
// cache-path in file_paths.xml) with a one-shot read grant.
//
// Rejects with code NOT_INSTALLED when neither WhatsApp nor WhatsApp Business
// is present, so the caller can fall back to the generic share sheet.
@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {
    private static final String[] WHATSAPP_PACKAGES = { "com.whatsapp", "com.whatsapp.w4b" };

    @PluginMethod
    public void sendDocument(PluginCall call) {
        String path = call.getString("path");
        String phone = call.getString("phone"); // digits only, with country code
        String mimeType = call.getString("mimeType", "application/pdf");
        String text = call.getString("text");

        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }

        Uri shareUri;
        try {
            Uri parsed = Uri.parse(path);
            String filePath = "file".equals(parsed.getScheme()) || parsed.getScheme() == null ? parsed.getPath() : path;
            File file = new File(filePath);
            if (!file.exists()) {
                call.reject("File not found: " + filePath);
                return;
            }
            shareUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (Exception e) {
            call.reject("Could not prepare the file for sharing: " + e.getMessage());
            return;
        }

        for (String pkg : WHATSAPP_PACKAGES) {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, shareUri);
            if (text != null && !text.isEmpty()) {
                intent.putExtra(Intent.EXTRA_TEXT, text);
            }
            if (phone != null && !phone.isEmpty()) {
                intent.putExtra("jid", phone + "@s.whatsapp.net");
            }
            intent.setClipData(ClipData.newRawUri("", shareUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.setPackage(pkg);
            try {
                getContext().grantUriPermission(pkg, shareUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("package", pkg);
                call.resolve(result);
                return;
            } catch (ActivityNotFoundException e) {
                // try the next WhatsApp flavour
            } catch (Exception e) {
                call.reject("Could not open WhatsApp: " + e.getMessage());
                return;
            }
        }
        call.reject("WhatsApp is not installed", "NOT_INSTALLED");
    }
}
