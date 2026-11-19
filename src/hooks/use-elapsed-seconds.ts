"use client";

import { useEffect, useRef, useState } from "react";

/** Whole seconds since `active` became true. Stays continuous across status changes that remain active. */
export function useElapsedSeconds(active: boolean) {
  const startedAt = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      return;
    }
    startedAt.current ??= Date.now();
    const tick = () => {
      const start = startedAt.current;
      if (start == null) return;
      setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return active ? seconds : null;
}
