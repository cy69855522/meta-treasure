import {
  ALL_SEARCH_SOURCES,
  DEFAULT_SEARCH_SOURCES,
  SEARCH_SOURCE_CATALOG,
  SOURCE_TITLE,
  isSearchSource,
  type SearchSource,
} from "../../package/deep_research/src/catalog";

export type ThemeMode = "light" | "dark" | "system";
export type { SearchSource };

export { ALL_SEARCH_SOURCES, SEARCH_SOURCE_CATALOG, SOURCE_TITLE };

export type DeepRadarSettings = {
  maxRounds: number;
  sources: SearchSource[];
  codexModelId: string;
};

export type AppSettings = {
  theme: ThemeMode;
  deepRadar: DeepRadarSettings;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  deepRadar: {
    maxRounds: 6,
    sources: [...DEFAULT_SEARCH_SOURCES],
    codexModelId: "",
  },
};

/** Accept old single-source values as well as the current independent list. */
export function normalizeSearchSources(value: unknown): SearchSource[] {
  if (value === "both") return ["zhihu", "wechat"];
  if (value === "zhihu") return ["zhihu"];
  if (value === "wechat") return ["wechat"];
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.deepRadar.sources];
  const next: SearchSource[] = [];
  for (const item of value) {
    if (isSearchSource(item) && !next.includes(item)) next.push(item);
  }
  return next;
}
