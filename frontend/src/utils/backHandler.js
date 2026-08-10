import { useRef, useEffect } from 'react';

// Shared hardware-Back-button stack, extracted out of App.jsx so both the
// authenticated shell (App.jsx) and the pre-login public mobile app
// (PublicMobileApp.jsx) can register onto the exact same stack without a
// circular import between the two (App.jsx imports PublicMobileApp, so
// PublicMobileApp can't import back from App.jsx).
//
// Every modal and multi-step wizard in the app registers itself here via
// useBackHandler() while it's open; the Back listener (see App.jsx) always
// invokes only the most-recently-opened one first (LIFO), matching how a
// real screen/dialog stack behaves - open two things, Back closes the most
// recent one first.
export const backHandlerStack = [];

// Registers `onBack` to run once the next time hardware Back is pressed,
// for as long as `active` is true (e.g. `showAddModal`, or `step > 1` in a
// wizard). Automatically unregisters when `active` flips back to false or
// the owning component unmounts, so a closed modal never intercepts Back for
// whatever screen is now underneath it.
export function useBackHandler(active, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const handler = () => onBackRef.current();
    backHandlerStack.push(handler);
    return () => {
      const idx = backHandlerStack.lastIndexOf(handler);
      if (idx !== -1) backHandlerStack.splice(idx, 1);
    };
  }, [active]);
}
