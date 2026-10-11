import "server-only";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { DEFAULT_SUBREDDIT } from "@/features/hot-radar/lib/subreddits";

export const REDDIT_PERIOD = "week" as const;
export type RedditPeriod = typeof REDDIT_PERIOD;

const LISTING_LIMIT = 100;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type RedditPost = {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  permalink: string;
  url: string;
  createdAt: number;
  thumbnail: string | null;
  score: number | null;
  comments: number | null;
  flair: string | null;
  nsfw: boolean;
};

export type WeekListing =
  | { ok: true; posts: RedditPost[] }
  | { ok: false; rateLimited: true; retryAfterSec: number; error: string }
  | { ok: false; rateLimited: false; error: string };

export function parseSubreddit(raw: string | undefined): string | null {
  const value = (raw ?? DEFAULT_SUBREDDIT).trim().replace(/^\/?r\//i, "");
  if (!value) return DEFAULT_SUBREDDIT;
  if (!/^[A-Za-z0-9_]{2,21}$/.test(value)) return null;
  return value;
}

function proxyDispatcher() {
  const proxy = process.env.REDDIT_PROXY?.trim();
  if (!proxy) return undefined;
  return new ProxyAgent(proxy);
}

async function redditFetch(url: string, accept: string): Promise<Response> {
  const dispatcher = proxyDispatcher();
  const response = await undiciFetch(url, {
    dispatcher,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(20_000),
  });
  return response as unknown as Response;
}

function rateLimitSeconds(response: Response): number | null {
  const reset = Number(response.headers.get("x-ratelimit-reset") || response.headers.get("retry-after"));
  if (!Number.isFinite(reset) || reset <= 0) return null;
  return Math.ceil(reset);
}

function listingPath(subreddit: string, period: RedditPeriod) {
  return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.rss?t=${period}&limit=${LISTING_LIMIT}`;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function tagText(chunk: string, tag: string): string {
  const match = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseRssListing(xml: string, fallbackSubreddit: string): RedditPost[] {
  const chunks = xml.split(/<entry\b/).slice(1);
  return chunks.flatMap((raw, index) => {
    const chunk = raw.split("</entry>")[0] ?? raw;
    const title = tagText(chunk, "title");
    if (!title) return [];
    const id = tagText(chunk, "id").replace(/^t3_/, "") || `rss-${index}`;
    const link = chunk.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const permalink = link ? decodeXml(link) : `https://www.reddit.com/r/${fallbackSubreddit}`;
    const published = tagText(chunk, "published") || tagText(chunk, "updated");
    const author = tagText(chunk, "name").replace(/^\/u\//, "");
    const category = chunk.match(/<category[^>]*term="([^"]+)"/)?.[1];
    const content = tagText(chunk, "content");
    const hrefs = [...content.matchAll(/href="([^"]+)"/g)].map((match) => decodeXml(match[1]));
    const external = hrefs.find(
      (href) => !/reddit\.com|redd\.it/i.test(href),
    );
    return [
      {
        id,
        title,
        author: author || "unknown",
        subreddit: category ? decodeXml(category) : fallbackSubreddit,
        permalink,
        url: external || permalink,
        createdAt: published ? Date.parse(published) || 0 : 0,
        thumbnail: null,
        score: null,
        comments: null,
        flair: null,
        nsfw: false,
      },
    ];
  });
}

function statusError(status: number, subreddit: string): string {
  if (status === 404) return `找不到 r/${subreddit}`;
  if (status === 403) return "Reddit 拒绝了未登录访问";
  if (status === 429) return "Reddit 限流了";
  return `Reddit 返回 ${status}`;
}

export async function fetchWeekListing(subreddit: string): Promise<WeekListing> {
  try {
    const response = await redditFetch(
      listingPath(subreddit, REDDIT_PERIOD),
      "application/atom+xml, application/xml, text/xml",
    );
    const body = await response.text();
    if (response.status === 429) {
      return {
        ok: false,
        rateLimited: true,
        retryAfterSec: rateLimitSeconds(response) ?? 60,
        error: statusError(429, subreddit),
      };
    }
    if (!response.ok || !body.includes("<feed")) {
      return { ok: false, rateLimited: false, error: statusError(response.status, subreddit) };
    }
    return { ok: true, posts: parseRssListing(body, subreddit) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求 Reddit 失败";
    const timedOut = /timeout|aborted/i.test(message);
    return {
      ok: false,
      rateLimited: false,
      error: timedOut
        ? "连接 Reddit 超时。若本机访问不了 reddit.com，请在 .env.local 设置 REDDIT_PROXY。"
        : "连接 Reddit 失败。请确认网络或 REDDIT_PROXY 可用。",
    };
  }
}
