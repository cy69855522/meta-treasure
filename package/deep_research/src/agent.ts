import { TikHubClient } from "./client";
import { searchWechatArticles } from "./sources/wechat";
import { searchZhihu } from "./sources/zhihu";
import type {
  DeepResearchAgentOptions,
  GroupedSearchResult,
  SearchHit,
  SearchSource,
} from "./types";

function resolveApiKey(explicit?: string): string {
  const key = (explicit ?? process.env.TIKHUB_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "Missing TIKHUB_API_KEY — set env or pass apiKey to DeepResearchAgent",
    );
  }
  return key;
}

/**
 * Lightweight multi-source search agent (no summarization).
 * Currently: WeChat Official Account articles + Zhihu.
 */
export class DeepResearchAgent {
  private readonly client: TikHubClient;

  constructor(options: DeepResearchAgentOptions = {}) {
    this.client = new TikHubClient({
      apiKey: resolveApiKey(options.apiKey),
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  /** WeChat 公众号文章搜索 — one page of results as returned by TikHub. */
  searchWechat(keyword: string): Promise<SearchHit[]> {
    return searchWechatArticles(this.client, keyword);
  }

  /** 知乎搜索 — one page of results as returned by TikHub. */
  searchZhihu(keyword: string): Promise<SearchHit[]> {
    return searchZhihu(this.client, keyword);
  }

  /**
   * Search all sources in parallel; group hits by source.
   * A failing source does not fail the whole call — see `errors`.
   * Uses whatever count each source returns for a single request (no topK trim).
   */
  async search(keyword: string): Promise<GroupedSearchResult> {
    const q = keyword.trim();

    const groups: Record<SearchSource, SearchHit[]> = {
      wechat: [],
      zhihu: [],
    };
    const errors: Partial<Record<SearchSource, string>> = {};

    if (!q) {
      return { keyword: q, groups };
    }

    const settled = await Promise.allSettled([
      this.searchWechat(q),
      this.searchZhihu(q),
    ]);

    const [wechatResult, zhihuResult] = settled;
    if (wechatResult.status === "fulfilled") {
      groups.wechat = wechatResult.value;
    } else {
      errors.wechat = errorMessage(wechatResult.reason);
    }
    if (zhihuResult.status === "fulfilled") {
      groups.zhihu = zhihuResult.value;
    } else {
      errors.zhihu = errorMessage(zhihuResult.reason);
    }

    return {
      keyword: q,
      groups,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return String(reason);
}
