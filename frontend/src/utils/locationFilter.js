import { useState, useRef, useLayoutEffect } from 'react';

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
// Returns a 3rd value, `filterReady`, that every caller gates its initial
// data-fetch effect on (`if (!filterReady) return;`) INSTEAD OF the raw
// `locationReady` flag. This distinction matters: the render where
// `locationReady` first flips true is *not* the same render where `town`
// has actually been corrected to `defaultTown` yet (that correction happens
// in the layout effect below, landing one render later, even though it's
// still before the browser paints - see the useLayoutEffect comment below).
// A consumer that gated its fetch on `locationReady` alone would still fire
// one real fetch with the stale '' town during that in-between render,
// immediately followed by a second corrected fetch - i.e. exactly the
// two-fetch "load all, then flicker to filtered results" bug this hook
// exists to prevent, just compressed into microseconds instead of the
// original multi-second GPS-resolution gap. Gating on `filterReady`
// (`locationReady && settled`) instead means the fetch effect only ever
// runs once `town` has already reached its final starting value, so
// exactly one fetch fires, with the correct town from the start.
//
// `settled` latches permanently true the first time it's set (by the
// layout effect below, or immediately by a user's own pick via `setTown`)
// and is never reset - a user changing the dropdown after the initial
// default was applied must not re-trigger this "waiting to settle" gate.
export function useLocationFilter(defaultTown, locationReady) {
  const [town, setTownState] = useState(defaultTown || '');
  const userPicked = useRef(false);
  const [settled, setSettled] = useState(false);

  // Deliberately useLayoutEffect, not useEffect, here. useEffect runs
  // *after* the browser paints, so on the very first Shops/Products screen
  // visited each session (the window while GPS is still resolving), the
  // moment locationReady/defaultTown flip in from App(), a plain useEffect
  // would let the browser paint one real frame with the dropdown still
  // showing "All Locations" (town still '') before correcting it a tick
  // later - the visible "All Locations, then Coimbatore" flash this hook
  // exists to prevent. useLayoutEffect instead runs synchronously before
  // that paint, so the correction (and `settled` flipping true) lands
  // before the user - or a fetch effect gated on `filterReady` - ever sees
  // the stale value.
  useLayoutEffect(() => {
    if (!locationReady || settled) return;
    if (defaultTown && !userPicked.current && !town) {
      setTownState(defaultTown);
    }
    setSettled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady, defaultTown, settled]);

  const setTown = (value) => {
    userPicked.current = true;
    setTownState(value);
    setSettled(true);
  };

  return [town, setTown, locationReady && settled];
}
