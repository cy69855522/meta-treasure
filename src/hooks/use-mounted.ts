"use client";

import { useEffect, useState } from "react";

/** Avoid SSR/client hydration mismatches from libraries with module-level IDs (e.g. dnd-kit). */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
