import "server-only";

import {
  getDeepRadarSettings,
  updateDeepRadarSettings,
} from "@/lib/settings";
import type { AppSettings } from "@/features/deep-radar/lib/settings-types";

export function getSettings(): AppSettings {
  return getDeepRadarSettings();
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  return updateDeepRadarSettings(patch);
}
