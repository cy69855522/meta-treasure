import "server-only";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_CHARS = 1_200_000;
const TEXT_LIMIT = 12_000;

export type ExtractResult =
  | { ok: true; url: string; title: string; text: string }
  | { ok: false; error: string };

function proxyDispatcher() {
  const proxy = process.env.REDDIT_PROXY?.trim();
  if (!proxy) return undefined;
  return new ProxyAgent(proxy);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function assertPublicHttp(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("链接无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("只提取 http 网页");
  if (isPrivateHost(url.hostname)) throw new Error("不提取内网地址");
  return url;
}

function isMedia(url: URL): boolean {
  return /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov)(\?|$)/i.test(url.pathname) || /^(i|v|preview)\.redd\.it$/i.test(url.hostname);
}

function isRedditHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "");
  return /reddit\.com$|redd\.it$/i.test(host);
}

function redditThreadRss(permalink: string): string {
  const url = assertPublicHttp(permalink);
  const id = url.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1];
  if (!id) throw new Error("不是 Reddit 帖子链接");
  return `https://www.reddit.com/comments/${id}.rss`;
}

function safePublicUrl(raw: string): URL | null {
  try {
    return assertPublicHttp(raw);
  } catch {
    return null;
  }
}

function classify(url: string, permalink: string): { reddit: boolean; target: string } {
  const page = safePublicUrl(url);
  if (page && !isMedia(page) && !isRedditHost(page.hostname)) {
    return { reddit: false, target: page.toString() };
  }
  const source = safePublicUrl(permalink) ?? page;
  if (!source) throw new Error("链接无效");
  return { reddit: true, target: redditThreadRss(source.toString()) };
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<video[\s\S]*?<\/video>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, "\n");
  return decodeHtml(stripped.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickRegion(html: string): string {
  const md = html.match(/<div class="[^"]*\bmd\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (md) {
    const text = htmlToText(md[1]);
    if (text.length > 40) return md[1];
  }
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body?.[1] ?? html;
}

function tagText(chunk: string, tag: string): string {
  const match = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeHtml(match[1].trim()) : "";
}

function markdownText(content: string): string {
  const decoded = decodeHtml(content);
  const body = decoded.match(/<div class="md">([\s\S]*?)<\/div>/i);
  if (!body) return "";
  const text = htmlToText(body[1]);
  if (!text || /^\[(deleted|removed)\]$/i.test(text)) return "";
  return text;
}

function threadText(xml: string): { title: string; text: string } | null {
  const entries = xml.split(/<entry\b/).slice(1).map((raw) => raw.split("</entry>")[0] ?? raw);
  if (!entries.length) return null;
  const title = tagText(entries[0], "title");
  const selftext = markdownText(tagText(entries[0], "content"));
  const comments = entries.slice(1).flatMap((entry) => {
    const text = markdownText(tagText(entry, "content"));
    if (!text) return [];
    const author = tagText(entry, "name").replace(/^\/u\//, "") || "unknown";
    return [`u/${author}\n${text}`];
  });
  const parts: string[] = [];
  if (selftext) parts.push(selftext);
  else parts.push("这条帖子没有正文，下面是评论。");
  if (comments.length) parts.push(comments.join("\n\n"));
  const text = parts.join("\n\n").trim();
  if (!selftext && comments.length === 0) return null;
  return { title, text };
}

function isLoginShell(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  return /welcome to reddit/i.test(compact) && /skip to main content/i.test(compact);
}

function pickTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decodeHtml(og[1]).trim();
  const titled = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titled ? decodeHtml(titled[1]).replace(/\s+/g, " ").trim() : "";
}

export type PageContent =
  | { ok: true; url: string; title: string; text: string }
  | { ok: false; rateLimited: true; retryAfterSec: number; error: string }
  | { ok: false; rateLimited: false; error: string };

async function fetchText(target: string, accept: string): Promise<
  | { ok: true; body: string }
  | { ok: false; rateLimited: true; retryAfterSec: number; error: string }
  | { ok: false; rateLimited: false; error: string }
> {
  const response = await undiciFetch(target, {
    dispatcher: proxyDispatcher(),
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) {
    const reset = Number(response.headers.get("x-ratelimit-reset") || response.headers.get("retry-after"));
    const seconds = Number.isFinite(reset) && reset > 0 ? Math.ceil(reset) : 60;
    await response.arrayBuffer().catch(() => undefined);
    return { ok: false, rateLimited: true, retryAfterSec: seconds, error: "网页限流了" };
  }
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    return { ok: false, rateLimited: false, error: `网页返回 ${response.status}` };
  }
  const type = response.headers.get("content-type") ?? "";
  if (/image|video|audio|pdf/i.test(type)) {
    await response.arrayBuffer().catch(() => undefined);
    return { ok: false, rateLimited: false, error: "这个链接不是文本文档" };
  }
  return { ok: true, body: (await response.text()).slice(0, MAX_CHARS) };
}

export async function extractPageContent(url: string, permalink: string): Promise<PageContent> {
  let reddit = false;
  let target = "";
  try {
    const classified = classify(url, permalink);
    reddit = classified.reddit;
    target = classified.target;
  } catch (error) {
    return { ok: false, rateLimited: false, error: error instanceof Error ? error.message : "链接无效" };
  }

  try {
    const fetched = await fetchText(
      target,
      reddit ? "application/atom+xml, application/xml, text/xml" : "text/html,application/xhtml+xml",
    );
    if (!fetched.ok) return fetched;
    if (reddit) {
      if (!fetched.body.includes("<feed")) return { ok: false, rateLimited: false, error: "没有拿到帖子内容" };
      const thread = threadText(fetched.body);
      if (!thread) return { ok: false, rateLimited: false, error: "这个帖子没有可提取的文字" };
      return { ok: true, url: permalink || url, title: thread.title, text: thread.text.slice(0, TEXT_LIMIT) };
    }
    if (/blocked by network security|just a moment/i.test(fetched.body) && fetched.body.length < 4000) {
      return { ok: false, rateLimited: false, error: "网页拒绝了未登录访问" };
    }
    const title = pickTitle(fetched.body);
    const text = htmlToText(pickRegion(fetched.body)).slice(0, TEXT_LIMIT);
    if (text.length < 20 || isLoginShell(text)) {
      return { ok: false, rateLimited: false, error: "这个页面没有提取到正文" };
    }
    return { ok: true, url: target, title, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "提取失败";
    if (/timeout|aborted/i.test(message)) return { ok: false, rateLimited: false, error: "提取超时" };
    return { ok: false, rateLimited: false, error: "提取失败" };
  }
}

export async function extractPageText(url: string, permalink: string): Promise<ExtractResult> {
  const result = await extractPageContent(url, permalink);
  if (result.ok) return { ok: true, url: result.url, title: result.title, text: result.text };
  if (result.rateLimited) return { ok: false, error: `网页限流了，约 ${result.retryAfterSec} 秒后再试` };
  return { ok: false, error: result.error };
}
