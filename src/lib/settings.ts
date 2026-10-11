import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type DeepRadarSettings,
  type ThemeMode,
  normalizeSearchSources,
} from "./settings-types";

export type { AppSettings, DeepRadarSettings, ThemeMode };

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function getSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      theme: isThemeMode(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      deepRadar: {
        maxRounds:
          typeof parsed.deepRadar?.maxRounds === "number" &&
          parsed.deepRadar.maxRounds >= 1
            ? Math.min(15, Math.round(parsed.deepRadar.maxRounds))
            : DEFAULT_SETTINGS.deepRadar.maxRounds,
        sources: normalizeSearchSources(parsed.deepRadar?.sources),
        codexModelId:
          typeof parsed.deepRadar?.codexModelId === "string"
            ? parsed.deepRadar.codexModelId
            : DEFAULT_SETTINGS.deepRadar.codexModelId,
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const next: AppSettings = {
    theme: isThemeMode(patch.theme) ? patch.theme : current.theme,
    deepRadar: {
      maxRounds:
        typeof patch.deepRadar?.maxRounds === "number" &&
        patch.deepRadar.maxRounds >= 1
          ? Math.min(15, Math.round(patch.deepRadar.maxRounds))
          : current.deepRadar.maxRounds,
      sources:
        patch.deepRadar?.sources === undefined
          ? current.deepRadar.sources
          : normalizeSearchSources(patch.deepRadar.sources),
      codexModelId:
        typeof patch.deepRadar?.codexModelId === "string"
          ? patch.deepRadar.codexModelId
          : current.deepRadar.codexModelId,
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function getDeepRadarSettings(): DeepRadarSettings {
  return getSettings().deepRadar;
}

export function updateDeepRadarSettings(
  patch: Partial<DeepRadarSettings>,
): DeepRadarSettings {
  const current = getSettings();
  return updateSettings({
    deepRadar: { ...current.deepRadar, ...patch },
  }).deepRadar;
}
