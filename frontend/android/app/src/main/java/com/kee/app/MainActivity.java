package com.kee.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The @capacitor/splash-screen plugin (see capacitor.config.json's
        // SplashScreen.launchAutoHide: false) calls
        // androidx.core.splashscreen.SplashScreen.installSplashScreen()
        // itself internally, at the correct point in Capacitor's own Bridge
        // initialization - calling it again here would be redundant and
        // risks conflicting with the plugin's own keep-on-screen condition.
        registerPlugin(SaveToDownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
