import { TikHubClient } from "./client";
import { PAGE_EXTRACT_CHAR_LIMIT } from "./limits";
import { searchWechatArticles, extractWechatPage } from "./sources/wechat";
import { searchZhihu } from "./sources/zhihu";
import { isScrapeSource, searchScrapeSource } from "./sources/scrape";
import { pagePlainText, fetchHtml } from "./sources/html";
import {
  htmlChildLinks,
  looksLikeMarkdown,
  markdownChildLinks,
  pageTitle,
  fallbackTitle,
  type PageExtract,
} from "./sources/page-links";
import { extractGithubPage, parseGithubUrl } from "./sources/github";
import {
  fetchWechatArticle,
  fetchZhihuAnswerText,
  fetchZhihuArticle,
  fetchZhihuQuestionAnswers,
  zhihuAnswerIdFromUrl,
  zhihuArticleIdFromUrl,
  zhihuQuestionIdFromUrl,
} from "./sources/extract";
import { pickQueryForSource } from "./catalog";
import type {
  DeepResearchAgentOptions,
  GroupedSearchResult,
  SearchHit,
  SearchSource,
} from "./types";

export class DeepResearchAgent {
  private client: TikHubClient | null = null;
  private readonly apiKey?: string;
  private readonly baseUrl?: string;
  private readonly timeoutMs?: number;

  constructor(options: DeepResearchAgentOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
  }

  private tikhub(): TikHubClient {
    if (this.client) return this.client;
    const key = (this.apiKey ?? process.env.TIKHUB_API_KEY ?? "").trim();
    if (!key) {
      throw new Error("知乎搜索需要 TIKHUB_API_KEY");
    }
    this.client = new TikHubClient({
      apiKey: key,
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
    });
    return this.client;
  }

  searchWechat(keyword: string): Promise<SearchHit[]> {
    return searchWechatArticles(keyword);
  }

  async searchZhihu(keyword: string): Promise<SearchHit[]> {
    const hits = await searchZhihu(this.tikhub(), keyword);
    const extra: SearchHit[] = [];
    const questions = hits.filter(
      (h) =>
        h.contentType === "question" ||
        /\/question\/\d+$/.test(h.url.replace(/\/$/, "")),
    );
    const seen = new Set<string>();
    for (const q of questions.slice(0, 3)) {
      const qid = zhihuQuestionIdFromUrl(q.url);
      if (!qid || seen.has(qid)) continue;
      seen.add(qid);
      try {
        extra.push(...(await fetchZhihuQuestionAnswers(this.tikhub(), qid, 5)));
      } catch {
        // Keep the question hit even if answers fail.
      }
    }
    return [...hits, ...extra];
  }

  async search(
    keyword: string,
    sources: SearchSource[] = ["wechat", "zhihu"],
    pair?: { queryZh?: string; queryEn?: string },
  ): Promise<GroupedSearchResult> {
    const queryZh = (pair?.queryZh ?? keyword).trim();
    const queryEn = (pair?.queryEn ?? keyword).trim();
    const display = queryZh || queryEn || keyword.trim();
    const groups: GroupedSearchResult["groups"] = {};
    const errors: Partial<Record<SearchSource, string>> = {};
    if (!display) return { keyword: display, groups };

    const jobs = sources.map(async (source) => {
      const q = pickQueryForSource(source, queryZh, queryEn);
      if (!q) {
        groups[source] = [];
        return;
      }
      try {
        groups[source] = await this.searchSource(source, q);
      } catch (err) {
        groups[source] = [];
        errors[source] = errorMessage(err);
      }
    });
    await Promise.all(jobs);
    return {
      keyword: display,
      groups,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  private searchSource(source: SearchSource, keyword: string): Promise<SearchHit[]> {
    if (source === "wechat") return this.searchWechat(keyword);
    if (source === "zhihu") return this.searchZhihu(keyword);
    if (isScrapeSource(source)) return searchScrapeSource(source, keyword);
    return Promise.resolve([]);
  }

  async extract(url: string, source: SearchSource): Promise<string> {
    const page = await this.extractPage(url, source);
    return page.text;
  }

  async extractPage(url: string, source: SearchSource): Promise<PageExtract> {
    if (parseGithubUrl(url)) return extractGithubPage(url);
    if (source === "wechat") {
      try {
        const text = await extractWechatPage(url);
        if (text.trim().length > 40) {
          return {
            url,
            title: fallbackTitle(url),
            text,
            links: markdownChildLinks(text, url),
          };
        }
      } catch {
        // fall through to TikHub if configured
      }
      const key = (this.apiKey ?? process.env.TIKHUB_API_KEY ?? "").trim();
      if (key) {
        const text = await fetchWechatArticle(this.tikhub(), url);
        return {
          url,
          title: fallbackTitle(url),
          text,
          links: markdownChildLinks(text, url),
        };
      }
      return emptyPage(url);
    }
    if (source === "zhihu") {
      const articleId = zhihuArticleIdFromUrl(url);
      if (articleId) {
        const text = await fetchZhihuArticle(this.tikhub(), articleId);
        return {
          url,
          title: fallbackTitle(url),
          text,
          links: markdownChildLinks(text, url),
        };
      }
      const questionId = zhihuQuestionIdFromUrl(url);
      const answerId = zhihuAnswerIdFromUrl(url);
      if (questionId && answerId) {
        const text = await fetchZhihuAnswerText(
          this.tikhub(),
          questionId,
          answerId,
        );
        return {
          url,
          title: fallbackTitle(url),
          text,
          links: markdownChildLinks(text, url),
        };
      }
      return extractWebPage(url);
    }
    return extractWebPage(url);
  }
}

async function extractWebPage(url: string): Promise<PageExtract> {
  try {
    const { html, finalUrl } = await fetchHtml(url, { timeoutMs: 15_000 });
    if (looksLikeMarkdown(finalUrl || url, html)) {
      return {
        url,
        finalUrl,
        title: fallbackTitle(finalUrl || url),
        text: html.slice(0, PAGE_EXTRACT_CHAR_LIMIT),
        links: markdownChildLinks(html, finalUrl || url),
      };
    }
    return {
      url,
      finalUrl,
      title: pageTitle(html, fallbackTitle(finalUrl || url)),
      text: pagePlainText(html),
      links: htmlChildLinks(html, finalUrl || url),
    };
  } catch {
    return emptyPage(url);
  }
}

function emptyPage(url: string): PageExtract {
  return { url, title: fallbackTitle(url), text: "", links: [] };
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return String(reason);
}
