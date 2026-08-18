import { useState, useEffect, useRef } from 'react';

export default function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = Number(value) || 0;
    const startTime = performance.now();
    let raf;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setDisplay(end);
      prevValue.current = end;
    };
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    raf = requestAnimationFrame(tick);
    // requestAnimationFrame is throttled/suspended entirely in background or
    // inactive tabs, which would leave the counter stuck at its start value
    // forever — this timer is a safety net that forces the final value in.
    const fallback = setTimeout(finish, duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [value, duration]);

  return <>{prefix}{display.toFixed(decimals)}{suffix}</>;
}
