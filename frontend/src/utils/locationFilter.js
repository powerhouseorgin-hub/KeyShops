import { useState, useRef, useEffect } from 'react';

// Shared by every location-dropdown screen that should default to the
// user's GPS-resolved location (see App()'s defaultLocation resolution) -
// Key Shops/ECM/Meter/Scanning via CategoryShopsView and Used Machines via
// PromotionsFeed in App.jsx, plus PublicMobileApp.jsx's Shops/Machines tabs.
// Extracted out of App.jsx (like backHandler.js) so PublicMobileApp.jsx can
// use it too without a circular import - App.jsx already imports
// PublicMobileApp, so the reverse can't hold.
//
// Applies `defaultTown` (once it resolves - it starts as '' and may arrive
// asynchronously after this screen has already mounted) exactly once, and
// never overwrites a choice the user already made themselves, including
// deliberately picking "All Locations" (empty string) back after a GPS
// default was applied.
export function useLocationFilter(defaultTown) {
  const [town, setTownState] = useState(defaultTown || '');
  const userPicked = useRef(false);
  useEffect(() => {
    if (defaultTown && !userPicked.current && !town) {
      setTownState(defaultTown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTown]);
  const setTown = (value) => {
    userPicked.current = true;
    setTownState(value);
  };
  return [town, setTown];
}
