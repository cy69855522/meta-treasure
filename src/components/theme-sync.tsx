"use client";

import { useEffect } from "react";
import type { ThemeMode } from "@/lib/settings-types";

function resolveDark(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemeToDocument(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", resolveDark(theme));
}

/** Keep `dark` class in sync when preference is `system` or after navigation. */
export function ThemeSync({ theme }: { theme: ThemeMode }) {
  useEffect(() => {
    applyThemeToDocument(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeToDocument("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}
