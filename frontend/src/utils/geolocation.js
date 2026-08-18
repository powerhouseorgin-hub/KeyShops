import { API_BASE } from '../apiConfig';
import { IS_NATIVE_APP } from './platform';

// Shared "Current Location" resolver used by both the Shop Registration wizard
// (captureShopLocation) and the Customer Registration wizard
// (captureCustomerLocation). Centralizing this means both flows enforce the
// exact same permission/GPS-availability checks:
//   1. Check whether location permission is already granted.
//   2. If not, prompt the OS permission dialog (native only - on web the
//      browser's own permission prompt fires automatically the first time
//      getCurrentPosition() is called, so there's nothing to request upfront).
//   3. If the user denies permission, reject with kind: 'permission'.
//   4. If permission is granted but device location services (GPS) are
//      switched off, reject with kind: 'disabled'.
//   5. Otherwise resolve the device's actual current GPS coordinates.
//
// A single getCurrentPosition() call (even with enableHighAccuracy) often
// returns a coarse, network/cell-tower-based fix instead of a real GPS lock
// - especially right after the app opens, before the GPS chip has warmed
// up, which is what made "current location" land hundreds of meters off.
// So instead we sample multiple updates via watchPosition() for up to ~9s
// and keep whichever reading has the smallest accuracy radius, resolving
// early the moment a good-enough fix (<=20m accuracy) comes in.
// A failure here can genuinely be either cause (denied permission vs GPS/
// Location Services switched off) - the OS/browser doesn't always report
// which one clearly, and guessing wrong sends the user to fix the wrong
// setting. So every message mentions BOTH requirements together instead of
// picking one; `kind` is kept distinct only to drive which follow-up
// shortcut button is most likely to help (e.g. "Open App Settings" for a
// permission denial).
const LOCATION_TROUBLESHOOT_MSG = "Couldn't get your current location. Please make sure location permission is allowed for this app AND that your device's Location Services (GPS) is turned on, then try again.";

function classifyLocationError(e) {
  const msg = ((e && e.message) || '').toLowerCase();
  if ((e && e.code === 1) || msg.includes('permission') || msg.includes('denied')) {
    const err = new Error(LOCATION_TROUBLESHOOT_MSG);
    err.kind = 'permission';
    return err;
  }
  if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('location services') || msg.includes('turned off')) {
    const err = new Error(LOCATION_TROUBLESHOOT_MSG);
    err.kind = 'disabled';
    return err;
  }
  const err = new Error(LOCATION_TROUBLESHOOT_MSG);
  err.kind = 'unavailable';
  return err;
}

export async function resolveCurrentLocation() {
  const { Geolocation } = await import('@capacitor/geolocation');

  if (IS_NATIVE_APP) {
    let status;
    try {
      status = await Geolocation.checkPermissions();
    } catch (e) {
      status = { location: 'prompt', coarseLocation: 'prompt' };
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      try {
        status = await Geolocation.requestPermissions();
      } catch (e) {
        const err = new Error(LOCATION_TROUBLESHOOT_MSG);
        err.kind = 'permission';
        throw err;
      }
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      const err = new Error(LOCATION_TROUBLESHOOT_MSG);
      err.kind = 'permission';
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    let best = null;
    let watchId = null;
    let settled = false;
    let fallbackError = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId != null) {
        Geolocation.clearWatch({ id: watchId }).catch(() => { });
      }
      if (best) {
        resolve({ lat: best.coords.latitude, lng: best.coords.longitude, accuracy: best.coords.accuracy });
      } else {
        reject(fallbackError || classifyLocationError(new Error('unavailable')));
      }
    };

    const timer = setTimeout(finish, 9000);

    Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }, (pos, err) => {
      if (err) {
        fallbackError = classifyLocationError(err);
        return;
      }
      if (pos && (!best || pos.coords.accuracy < best.coords.accuracy)) {
        best = pos;
      }
      if (pos && pos.coords.accuracy <= 20) {
        finish();
      }
    }).then((id) => {
      watchId = id;
    }).catch((e) => {
      fallbackError = classifyLocationError(e);
      finish();
    });
  });
}

// Reverse-geocodes GPS coordinates into a structured, street-level address
// via our own backend (see backend/src/geo/geo.controller.ts) rather than
// calling a third-party geocoder directly from the client. Nominatim
// (OpenStreetMap), which is what actually returns house number / road
// detail, doesn't send CORS headers for direct browser/WebView requests -
// routing through our backend sidesteps that. Returns null on any failure
// so callers can fall back to raw coordinates.
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`${API_BASE}/api/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
    return null;
  }
}


// Opens the device's native location-settings screen (Android/iOS only - a
// no-op on web, where there's no equivalent OS settings screen to deep-link
// to). Used by the "Enable Location Services" prompt shown when GPS is off.
export async function openDeviceLocationSettings() {
  if (!IS_NATIVE_APP) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
    await NativeSettings.open({ optionAndroid: AndroidSettings.Location, optionIOS: IOSSettings.LocationServices });
  } catch (e) {
    console.warn('Could not open device location settings:', e);
  }
}

// Opens this app's own OS permission/settings page (not a specific settings
// category like location above). This is the only way for a user to recover
// from a "permanently denied" (Android "Don't ask again") runtime permission
// - once that state is hit, requestPermissions() resolves as denied instantly
// without ever showing the OS prompt again, so the app has to hand the user
// off to Settings > Apps > Key Shop > Permissions manually.
export async function openAppSettings() {
  if (!IS_NATIVE_APP) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
    await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
  } catch (e) {
    console.warn('Could not open app settings:', e);
  }
}
