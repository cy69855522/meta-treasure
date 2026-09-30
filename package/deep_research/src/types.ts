export type {
  SearchSource,
  SearchSourceGroup,
  SearchSourceMeta,
} from "./catalog";
export {
  ALL_SEARCH_SOURCES,
  DEFAULT_SEARCH_SOURCES,
  SEARCH_SOURCE_CATALOG,
  SOURCE_TITLE,
  isSearchSource,
  pickQueryForSource,
  queryLangForSource,
} from "./catalog";
import type { SearchSource } from "./catalog";

export type SearchMetrics = Record<string, number>;
export type SearchMeta = Record<string, string>;

export type SearchHit = {
  source: SearchSource;
  title: string;
  url: string;
  snippet?: string;
  author?: string;
  publishedAt?: string;
  rawId?: string;
  coverUrl?: string;
  contentType?: string;
  metrics?: SearchMetrics;
  meta?: SearchMeta;
};

export type GroupedSearchResult = {
  keyword: string;
  groups: Partial<Record<SearchSource, SearchHit[]>>;
  errors?: Partial<Record<SearchSource, string>>;
};

export type DeepResearchAgentOptions = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export const DEFAULT_TIKHUB_BASE_URL = "https://api.tikhub.io";
