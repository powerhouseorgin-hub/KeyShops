import { useRef, useState, useCallback } from 'react';

// Centralizes the "disable + prevent duplicate submits" pattern already used
// correctly in CustomerRegistrationWizard.jsx (savingRecord + a guard clause),
// so every other Save/Submit/Update/Create action can reuse it instead of
// reinventing (or skipping) it. Wrap the async handler's body in run() - the
// caller's own try/catch around the awaited work still owns success/error
// messaging exactly as before; this only owns the submitting flag and
// re-entrancy guard (a ref, not just state, so a second click arriving before
// the first render commits still gets blocked).
export function useSubmitting() {
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (fn) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submitting, run };
}
