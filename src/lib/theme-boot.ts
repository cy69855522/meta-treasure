import type { ThemeMode } from "@/lib/settings-types";

/** Inline boot script to sync theme before paint (esp. `system`). */
export function themeBootScript(theme: ThemeMode): string {
  if (theme === "dark") {
    return `(function(){document.documentElement.classList.add("dark");})();`;
  }
  if (theme === "light") {
    return `(function(){document.documentElement.classList.remove("dark");})();`;
  }
  return `(function(){try{var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
}
