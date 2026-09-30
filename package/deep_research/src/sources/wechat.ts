import type { SearchHit } from "../types";
import { stripHtml } from "../client";
import { PAGE_EXTRACT_CHAR_LIMIT } from "../limits";
import { absUrl, fetchHtml, parseHtml, textOf } from "./html";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function randomUa() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

async function sogouCookie(): Promise<string> {
  try {
    const res = await fetch("https://v.sogou.com/v?ie=utf8&query=&p=40030600", {
      headers: {
        "User-Agent": randomUa(),
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const raw =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    const parts = raw.map((row) => row.split(";")[0]).filter(Boolean);
    return parts.join("; ");
  } catch {
    return "";
  }
}

export function extractSogouRedirect(html: string): string | undefined {
  const meta = html.match(
    /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["']\d+;\s*url=([^"']+)["'][^>]*>/i,
  );
  if (meta?.[1]) return meta[1];
  const js =
    html.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
    html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
  if (js?.[1]) return js[1];
  const parts: string[] = [];
  for (const m of html.matchAll(/url\s*\+=\s*'([^']*)'/g)) {
    if (m[1]) parts.push(m[1]);
  }
  for (const m of html.matchAll(/url\s*\+=\s*"([^"]*)"/g)) {
    if (m[1]) parts.push(m[1]);
  }
  const joined = parts.join("");
  if (joined.includes("mp.weixin.qq.com")) return joined;
  return undefined;
}

export function parseWechatSearchHtml(html: string, limit: number): SearchHit[] {
  const root = parseHtml(html);
  const items = root.querySelectorAll("ul.news-list li");
  const hits: SearchHit[] = [];
  for (const item of items) {
    const titleLink = item.querySelector("h3 a");
    if (!titleLink) continue;
    const title = textOf(titleLink);
    let href = titleLink.getAttribute("href") || "";
    if (href.startsWith("/")) href = `https://weixin.sogou.com${href}`;
    href = absUrl(href, "https://weixin.sogou.com/");
    if (!title || !href) continue;
    const snippet = textOf(item.querySelector("p.txt-info"));
    const author =
      textOf(item.querySelector(".all-time-y2")) ||
      textOf(item.querySelector("a.account"));
    const script = item.querySelector(".s2 script")?.text || "";
    const ts = script.match(/(\d{10})/);
    const publishedAt = ts
      ? new Date(Number(ts[1]) * 1000).toISOString()
      : undefined;
    hits.push({
      source: "wechat",
      title,
      url: href,
      snippet: snippet || undefined,
      author: author || undefined,
      publishedAt,
      contentType: "article",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function resolveSogouWechatUrl(url: string): Promise<string> {
  if (!url.includes("weixin.sogou.com")) return url;
  const cookie = await sogouCookie();
  const { html, finalUrl, status } = await fetchHtml(url, {
    timeoutMs: 8_000,
    cookie,
    headers: {
      "User-Agent": randomUa(),
      Referer: "https://weixin.sogou.com/",
      Host: "weixin.sogou.com",
    },
  });
  if (finalUrl.includes("mp.weixin.qq.com")) return finalUrl;
  if (status >= 300) return url;
  const redirected = extractSogouRedirect(html);
  if (redirected?.includes("mp.weixin.qq.com")) return redirected;
  return url;
}

export async function searchWechatArticles(
  keyword: string,
  limit = 10,
): Promise<SearchHit[]> {
  const q = keyword.trim();
  if (!q) return [];
  const cookie = await sogouCookie();
  const hits: SearchHit[] = [];
  const pages = Math.min(Math.ceil(limit / 10), 3);
  for (let page = 1; page <= pages && hits.length < limit; page++) {
    const url = `https://weixin.sogou.com/weixin?query=${encodeURIComponent(q)}&s_from=input&_sug_=n&type=2&page=${page}&ie=utf8`;
    const { html, status } = await fetchHtml(url, {
      timeoutMs: 20_000,
      cookie,
      headers: {
        "User-Agent": randomUa(),
        Referer: "https://weixin.sogou.com/",
        Host: "weixin.sogou.com",
      },
    });
    if (status >= 400) {
      throw new Error(`搜狗微信搜索 HTTP ${status}`);
    }
    if (html.includes("antispider") && hits.length === 0) {
      throw new Error("搜狗微信触发反爬，稍后再试");
    }
    const parsed = parseWechatSearchHtml(html, limit - hits.length);
    if (parsed.length === 0) break;
    hits.push(...parsed);
  }
  return hits;
}

export async function extractWechatPage(url: string): Promise<string> {
  const real = await resolveSogouWechatUrl(url);
  const { html } = await fetchHtml(real, {
    timeoutMs: 15_000,
    headers: { Referer: "https://weixin.sogou.com/" },
  });
  const root = parseHtml(html);
  const content = root.querySelector("#js_content");
  if (content) return stripHtml(content.innerHTML).slice(0, PAGE_EXTRACT_CHAR_LIMIT);
  return textOf(root.querySelector("body")).slice(0, PAGE_EXTRACT_CHAR_LIMIT);
}
