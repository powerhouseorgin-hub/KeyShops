package com.kee.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.ionicframework.capacitor.Checkout;

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
        registerPlugin(ShareToWhatsAppPlugin.class);
        // capacitor-razorpay: opens Razorpay's real native Android Checkout
        // Activity instead of the web checkout.js popup - needed because
        // checkout.js inside this app's WebView can't reliably launch UPI
        // apps (GPay/PhonePe) or survive netbanking's redirect-away-and-back
        // flow (see src/utils/razorpay.js, which only uses this native path
        // when Capacitor.isNativePlatform() - the website keeps checkout.js).
        registerPlugin(Checkout.class);
        super.onCreate(savedInstanceState);
    }
}
