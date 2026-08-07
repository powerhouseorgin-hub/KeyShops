package com.kee.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate() - activates the AndroidX
        // core-splashscreen compat backport of the Android 12+ SplashScreen
        // API on devices below API 31 (this app's minSdk is 24). Without
        // this call, the windowSplashScreenBackground/AnimatedIcon theme
        // attributes only take effect natively on API 31+; older devices
        // would fall back to an unstyled black window on launch instead.
        SplashScreen.installSplashScreen(this);
        registerPlugin(SaveToDownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
