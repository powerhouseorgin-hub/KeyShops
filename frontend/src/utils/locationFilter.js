import { useState, useRef, useEffect } from 'react';

// Shared by every location-dropdown screen that should default to the
// user's GPS-resolved location (see App()'s defaultLocation resolution) -
// Key Shops/ECM/Meter/Scanning via CategoryShopsView and Used Machines via
// PromotionsFeed in App.jsx, plus PublicMobileApp.jsx's Shops/Machines tabs.
// Extracted out of App.jsx (like backHandler.js) so PublicMobileApp.jsx can
// use it too without a circular import - App.jsx already imports
// PublicMobileApp, so the reverse can't hold.
//
// Applies `defaultTown` once App()'s GPS resolution attempt finishes
// (`locationReady` flips true - see App()'s defaultLocation/locationReady
// effect), and never overwrites a choice the user already made themselves,
// including deliberately picking "All Locations" (empty string) back after a
// GPS default was applied.
//
// `locationReady` isn't just informational here - every caller also gates
// its own initial data-fetch effect on it (`if (!locationReady) return;`),
// so the first fetch never fires with an unresolved '' town and then
// re-fires once GPS/reverse-geocode completes. That two-fetch sequence is
// exactly the "load all, then flicker to filtered results" bug this and the
// gating pattern together are meant to prevent - see App()'s locationReady
// state for the single source of truth all consumers share.
export function useLocationFilter(defaultTown, locationReady) {
  const [town, setTownState] = useState(defaultTown || '');
  const userPicked = useRef(false);
  useEffect(() => {
    if (locationReady && defaultTown && !userPicked.current && !town) {
      setTownState(defaultTown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady, defaultTown]);
  const setTown = (value) => {
    userPicked.current = true;
    setTownState(value);
  };
  return [town, setTown];
}
