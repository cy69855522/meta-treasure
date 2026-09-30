import type { SearchHit, SearchSource } from "../types";
import { absUrl, fetchHtml, parseHtml, textOf } from "./html";

export type ScrapeEngine = {
  id: Exclude<SearchSource, "zhihu" | "wechat">;
  searchUrl: (query: string) => string;
  itemSelector: string;
  titleSelector: string;
  hrefSelector: string;
  snippetSelector: string;
  headers?: Record<string, string>;
  requireHttp?: boolean;
};

const q = (query: string) => encodeURIComponent(query);

export const SCRAPE_ENGINES: ScrapeEngine[] = [
  {
    id: "baidu",
    searchUrl: (query) => `https://www.baidu.com/s?wd=${q(query)}`,
    itemSelector: "div.result, div.c-container",
    titleSelector: "h3 a, a.c-title",
    hrefSelector: "h3 a, a.c-title",
    snippetSelector: "div.c-abstract, div.abstract, span.content-right_8Zs40",
  },
  {
    id: "bing_cn",
    searchUrl: (query) => `https://cn.bing.com/search?q=${q(query)}&ensearch=0`,
    itemSelector: "li.b_algo",
    titleSelector: "h2 a",
    hrefSelector: "h2 a",
    snippetSelector: "div.b_caption p, div.b_caption",
  },
  {
    id: "bing_int",
    searchUrl: (query) => `https://www.bing.com/search?q=${q(query)}`,
    itemSelector: "li.b_algo",
    titleSelector: "h2 a",
    hrefSelector: "h2 a",
    snippetSelector: "div.b_caption p, div.b_caption",
  },
  {
    id: "sogou",
    searchUrl: (query) => `https://www.sogou.com/web?query=${q(query)}`,
    itemSelector: "div.vrwrap, div.rb, div.results > div",
    titleSelector: "h3 a, a.vr-title",
    hrefSelector: "h3 a, a.vr-title",
    snippetSelector: "div.star-wiki, p.star-wiki, div.fz-mid, div.space-txt",
  },
  {
    id: "so360",
    searchUrl: (query) => `https://www.so.com/s?q=${q(query)}`,
    itemSelector: "li.res-list, div.result",
    titleSelector: "h3 a, a.title",
    hrefSelector: "h3 a, a.title",
    snippetSelector: "p.res-desc, div.res-rich, p.res-linkinfo",
  },
  {
    id: "toutiao",
    searchUrl: (query) => `https://www.toutiao.com/search/?keyword=${q(query)}`,
    itemSelector: "div.result-content, div.article, div[class*='result']",
    titleSelector: "h3 a, a[class*='title']",
    hrefSelector: "h3 a, a[class*='title']",
    snippetSelector: "p[class*='abstract'], div[class*='desc']",
  },
  {
    id: "jisilu",
    searchUrl: (query) => `https://app.jisilu.cn/search/?q=${q(query)}`,
    itemSelector: "div.aw-item, div.search-result, tr",
    titleSelector: "h4 a, a.aw-hide-txt, td a",
    hrefSelector: "h4 a, a.aw-hide-txt, td a",
    snippetSelector: "p, td",
  },
  {
    id: "google",
    searchUrl: (query) => `https://www.google.com/search?q=${q(query)}&hl=zh-CN`,
    itemSelector: "div.g, div.tF2Cxc",
    titleSelector: "h3",
    hrefSelector: "a",
    snippetSelector: "div.VwiK3b, div.IsZvec",
    requireHttp: true,
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  },
  {
    id: "google_hk",
    searchUrl: (query) => `https://www.google.com.hk/search?q=${q(query)}&hl=zh-CN`,
    itemSelector: "div.g, div.tF2Cxc",
    titleSelector: "h3",
    hrefSelector: "a",
    snippetSelector: "div.VwiK3b, div.IsZvec",
    requireHttp: true,
    headers: { "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.7" },
  },
  {
    id: "duckduckgo",
    searchUrl: (query) => `https://html.duckduckgo.com/html/?q=${q(query)}`,
    itemSelector: "div.result",
    titleSelector: "h2 a, a.result__a",
    hrefSelector: "h2 a, a.result__a",
    snippetSelector: "a.result__snippet, td.result__snippet",
  },
  {
    id: "startpage",
    searchUrl: (query) => `https://www.startpage.com/sp/search?query=${q(query)}`,
    itemSelector: "div.w-gl__result, article, li[class*='result']",
    titleSelector: "h3 a, a[class*='title']",
    hrefSelector: "h3 a, a[class*='title']",
    snippetSelector: "p[class*='desc'], p.w-gl__description",
  },
  {
    id: "brave",
    searchUrl: (query) => `https://search.brave.com/search?q=${q(query)}`,
    itemSelector: "div.snippet[data-type='web'], div[class*='snippet']",
    titleSelector: "a.heading-serpresult, a[class*='title'], h3 a",
    hrefSelector: "a.heading-serpresult, a[class*='title'], h3 a",
    snippetSelector: "p.snippet-description, div.snippet-description",
  },
  {
    id: "yahoo",
    searchUrl: (query) => `https://search.yahoo.com/search?p=${q(query)}`,
    itemSelector: "div.algo, li[class*='res']",
    titleSelector: "h3 a, a.d-ib",
    hrefSelector: "h3 a, a.d-ib",
    snippetSelector: "div.compText, p.s-desc",
  },
  {
    id: "ecosia",
    searchUrl: (query) => `https://www.ecosia.org/search?q=${q(query)}`,
    itemSelector: "article[class*='result'], div.result-web",
    titleSelector: "a[class*='result-title'], h2 a, h3 a",
    hrefSelector: "a[class*='result-title'], h2 a, h3 a",
    snippetSelector: "p[class*='snippet'], p[class*='result-snippet']",
  },
  {
    id: "qwant",
    searchUrl: (query) => `https://www.qwant.com/?q=${q(query)}&t=web`,
    itemSelector: "div[class*='result'], article[class*='result']",
    titleSelector: "h3 a, a[class*='title']",
    hrefSelector: "h3 a, a[class*='title']",
    snippetSelector: "p[class*='description'], p[class*='snippet']",
  },
  {
    id: "wolfram",
    searchUrl: (query) => `https://www.wolframalpha.com/input?i=${q(query)}`,
    itemSelector: "section, div[class*='pod']",
    titleSelector: "h2, h3, [class*='pod-title']",
    hrefSelector: "a",
    snippetSelector: "p, [class*='pod-content']",
  },
];

const BY_ID = new Map(SCRAPE_ENGINES.map((engine) => [engine.id, engine]));

function unwrapHref(href: string): string {
  try {
    const url = new URL(href);
    const nested =
      url.searchParams.get("uddg") ||
      url.searchParams.get("q") ||
      url.searchParams.get("url");
    if (nested?.startsWith("http")) return nested;
  } catch {
    return href;
  }
  return href;
}

export function isScrapeSource(
  source: SearchSource,
): source is ScrapeEngine["id"] {
  return BY_ID.has(source as ScrapeEngine["id"]);
}

export async function searchScrapeSource(
  source: ScrapeEngine["id"],
  keyword: string,
  limit = 8,
): Promise<SearchHit[]> {
  const engine = BY_ID.get(source);
  if (!engine) return [];
  const qtext = keyword.trim();
  if (!qtext) return [];
  const url = engine.searchUrl(qtext);
  const { html, finalUrl, status } = await fetchHtml(url, {
    headers: engine.headers,
  });
  if (status >= 400) {
    throw new Error(`${engine.id} 搜索页 HTTP ${status}`);
  }
  const root = parseHtml(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const item of root.querySelectorAll(engine.itemSelector)) {
    const titleEl = item.querySelector(engine.titleSelector);
    const hrefEl = item.querySelector(engine.hrefSelector);
    const href = absUrl(hrefEl?.getAttribute("href") || "", finalUrl);
    const title = textOf(titleEl) || textOf(hrefEl);
    if (!title) continue;
    if (engine.requireHttp && !href.startsWith("http")) continue;
    const link =
      href ||
      (source === "wolfram" ? url : "");
    if (!link) continue;
    if (seen.has(link)) continue;
    seen.add(link);
    const snippet = textOf(item.querySelector(engine.snippetSelector)).slice(
      0,
      280,
    );
    hits.push({
      source,
      title,
      url: unwrapHref(link),
      snippet: snippet || undefined,
      contentType: "web",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
