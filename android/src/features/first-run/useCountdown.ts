// A whole-second countdown, e.g. the 2.2 lock after five wrong PINs (plan §4.6).
import { useCallback, useEffect, useState } from 'react';

export function useCountdown() {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback((seconds: number) => setRemaining(Math.max(0, Math.ceil(seconds))), []);

  return { remaining, running: remaining > 0, start };
}
