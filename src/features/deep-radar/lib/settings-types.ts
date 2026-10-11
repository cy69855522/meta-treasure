import {
  ALL_SEARCH_SOURCES,
  SEARCH_SOURCE_CATALOG,
  SOURCE_TITLE,
  normalizeSearchSources,
  type DeepRadarSettings,
  type SearchSource,
} from "@/lib/settings-types";

export type AppSettings = DeepRadarSettings;
export type { SearchSource };

export {
  ALL_SEARCH_SOURCES,
  SEARCH_SOURCE_CATALOG,
  SOURCE_TITLE,
};

export function normalizeSources(value: unknown): SearchSource[] {
  return normalizeSearchSources(value);
}

export function isSourceEnabled(
  sources: unknown,
  source: SearchSource,
): boolean {
  return normalizeSources(sources).includes(source);
}

export function toggleSource(
  sources: unknown,
  source: SearchSource,
): SearchSource[] {
  const current = normalizeSources(sources);
  if (current.includes(source)) {
    return current.filter((item) => item !== source);
  }
  const next = [...current, source];
  return ALL_SEARCH_SOURCES.filter((item) => next.includes(item));
}
