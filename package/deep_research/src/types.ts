export type SearchSource = "wechat" | "zhihu";

/** Numeric engagement / stats for display (Chinese labels as keys). */
export type SearchMetrics = Record<string, number>;

/** Extra scalar metadata for display (Chinese labels as keys). */
export type SearchMeta = Record<string, string>;

export type SearchHit = {
  source: SearchSource;
  title: string;
  url: string;
  snippet?: string;
  author?: string;
  publishedAt?: string;
  rawId?: string;
  /** Cover / thumbnail when available. */
  coverUrl?: string;
  /** e.g. article / question / answer */
  contentType?: string;
  /** Likes, comments, favorites, views, etc. when the API returns them. */
  metrics?: SearchMetrics;
  /** Other displayable metadata (excluding title/url/snippet already shown). */
  meta?: SearchMeta;
};

export type GroupedSearchResult = {
  keyword: string;
  groups: Record<SearchSource, SearchHit[]>;
  errors?: Partial<Record<SearchSource, string>>;
};

export type DeepResearchAgentOptions = {
  apiKey?: string;
  baseUrl?: string;
  /** Default 45000 — WeChat search can be slow. */
  timeoutMs?: number;
};

export const DEFAULT_TIKHUB_BASE_URL = "https://api.tikhub.io";
