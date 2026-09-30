import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { z } from "zod";
import { tool, type ToolSet } from "@/lib/codex-tool";

const URL_LIMIT = 5;
const DEFAULT_MAX_CHARS = 20_000;
const MAX_CHARS_CAP = 60_000;
const LINK_LIMIT = 60;
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const BROWSER_TIMEOUT_MS = 40_000;
const MIN_HTML_TEXT = 200;

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const CHROME_CANDIDATES = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const DROP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "template",
  "iframe",
  "canvas",
  "form",
  "nav",
  "footer",
  "header nav",
  "[aria-hidden=true]",
];

const CONTENT_SELECTORS = [
  "article",
  "main",
  "[role=main]",
  "#js_content",
  ".article-body",
  ".markdown-body",
  "#content",
  "body",
];

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt",
  "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li",
  "main", "ol", "p", "pre", "section", "table", "tbody", "thead", "tfoot",
  "tr", "ul",
]);

type RawResponse = {
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
};

type PageResult = {
  ok: boolean;
  url: string;
  finalUrl: string;
  status?: number;
  via?: "fetch" | "browser";
  contentType?: string;
  title: string;
  description?: string;
  text: string;
  charCount: number;
  startChar: number;
  truncated: boolean;
  links?: Array<{ text: string; url: string }>;
  error?: string;
};

function normalizeUrl(input: string): URL {
  const raw = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("只支持 http / https 网址");
  }
  url.hash = "";
  return url;
}

function charsetOf(contentType: string, head: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];
  return (fromMeta || "utf-8").toLowerCase();
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const charset = charsetOf(contentType, head);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function directFetch(url: URL): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const length = Number(res.headers.get("content-length") || 0);
    if (length > MAX_BYTES) throw new Error(`页面过大（${Math.round(length / 1024 / 1024)}MB）`);
    const bytes = new Uint8Array(await res.arrayBuffer()).slice(0, MAX_BYTES);
    return {
      status: res.status,
      finalUrl: res.url || url.toString(),
      contentType,
      body: decodeBody(bytes, contentType),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求超时（${FETCH_TIMEOUT_MS / 1000}s）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function chromePath(): string | null {
  const configured = process.env.PROGRESS_CHROME_PATH?.trim();
  if (configured) return existsSync(configured) ? configured : null;
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) || null;
}

async function browserFetch(url: URL): Promise<RawResponse> {
  const chrome = chromePath();
  if (!chrome) throw new Error("本机未找到 Chrome / Chromium，可设置 PROGRESS_CHROME_PATH");
  const profile = await mkdtemp(join(tmpdir(), "progress-fetch-"));
  try {
    const html = await new Promise<string>((resolve, reject) => {
      execFile(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--no-first-run",
          "--no-default-browser-check",
          "--mute-audio",
          "--hide-scrollbars",
          `--user-data-dir=${profile}`,
          `--user-agent=${BROWSER_UA}`,
          "--virtual-time-budget=10000",
          "--timeout=30000",
          "--dump-dom",
          url.toString(),
        ],
        { timeout: BROWSER_TIMEOUT_MS, maxBuffer: MAX_BYTES * 2, encoding: "utf8" },
        (error, stdout) => {
          if (stdout && stdout.trim()) resolve(stdout);
          else reject(error || new Error("浏览器未返回页面内容"));
        },
      );
    });
    return { status: 200, finalUrl: url.toString(), contentType: "text/html", body: html };
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

function isHtml(contentType: string, body: string) {
  if (/html|xhtml/i.test(contentType)) return true;
  if (contentType) return false;
  return /^\s*(<!doctype html|<html)/i.test(body);
}

function isTextual(contentType: string) {
  return (
    !contentType ||
    /^text\//i.test(contentType) ||
    /json|xml|javascript|yaml|markdown|csv/i.test(contentType)
  );
}

function looksBlocked(raw: RawResponse) {
  if ([401, 403, 429, 503].includes(raw.status)) return true;
  const head = raw.body.slice(0, 20_000);
  return /Just a moment\.\.\.|cf-challenge|challenges\.cloudflare\.com|Attention Required! \| Cloudflare|captcha-delivery|verify you are human/i.test(
    head,
  );
}

function squash(text: string) {
  return text.replace(/[ \t\f\v\u00a0]+/g, " ");
}

function renderText(node: Node, out: string[]) {
  if (node.nodeType === 3) {
    out.push(squash(node.text));
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase() || "";
  if (tag === "pre") {
    out.push(`\n\n${el.text.replace(/\n+$/, "")}\n\n`);
    return;
  }
  const heading = /^h([1-6])$/.exec(tag);
  if (heading) {
    out.push(`\n\n${"#".repeat(Number(heading[1]))} ${squash(el.text).trim()}\n\n`);
    return;
  }
  const block = BLOCK_TAGS.has(tag);
  if (block) out.push("\n");
  if (tag === "li") out.push("- ");
  if (tag === "td" || tag === "th") out.push(" | ");
  for (const child of el.childNodes) renderText(child, out);
  if (block) out.push("\n");
}

function htmlToPage(html: string, baseUrl: string, includeLinks: boolean) {
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ""), { comment: false });
  const title =
    root.querySelector("meta[property=og:title]")?.getAttribute("content")?.trim() ||
    root.querySelector("title")?.text.trim() ||
    root.querySelector("h1")?.text.trim() ||
    "";
  const description =
    root.querySelector("meta[name=description]")?.getAttribute("content")?.trim() ||
    root.querySelector("meta[property=og:description]")?.getAttribute("content")?.trim() ||
    "";
  for (const selector of DROP_SELECTORS) {
    for (const node of root.querySelectorAll(selector)) node.remove();
  }
  const content =
    CONTENT_SELECTORS.map((selector) => root.querySelector(selector)).find(
      (el) => el && el.text.trim().length > MIN_HTML_TEXT,
    ) ||
    root.querySelector("body") ||
    root;

  const parts: string[] = [];
  renderText(content, parts);
  const text = parts
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let links: Array<{ text: string; url: string }> | undefined;
  if (includeLinks) {
    const seen = new Set<string>();
    links = [];
    for (const a of content.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href")?.trim() || "";
      if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue;
      let abs: string;
      try {
        abs = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
      if (seen.has(abs)) continue;
      seen.add(abs);
      links.push({ text: squash(a.text).trim().slice(0, 120), url: abs });
      if (links.length >= LINK_LIMIT) break;
    }
  }
  return { title, description, text, links };
}

type ReadOptions = {
  maxChars: number;
  startChar: number;
  includeLinks: boolean;
  useBrowser: boolean;
};

type ExtractedPage = {
  title: string;
  description: string;
  text: string;
  links?: Array<{ text: string; url: string }>;
};

const ZENDESK_ARTICLE = /^\/hc\/([\w-]+)\/articles\/(\d+)/;

async function zendeskArticle(url: URL, includeLinks: boolean) {
  const match = ZENDESK_ARTICLE.exec(url.pathname);
  if (!match) return null;
  const api = new URL(`/api/v2/help_center/${match[1]}/articles/${match[2]}.json`, url.origin);
  const raw = await directFetch(api).catch(() => null);
  if (!raw || raw.status >= 400) return null;
  let article: { title?: string; body?: string; html_url?: string; updated_at?: string } | undefined;
  try {
    article = JSON.parse(raw.body)?.article;
  } catch {
    return null;
  }
  if (!article?.body) return null;
  const finalUrl = article.html_url || url.toString();
  const page = htmlToPage(article.body, finalUrl, includeLinks);
  return {
    raw: { ...raw, finalUrl, contentType: "text/html" },
    page: {
      ...page,
      title: article.title || page.title,
      description: article.updated_at ? `更新于 ${article.updated_at}` : page.description,
    },
  };
}

function browserErrorCode(html: string) {
  if (!/id="main-frame-error"|<body[^>]*class="neterror"/i.test(html)) return null;
  return /ERR_[A-Z_]+/.exec(html)?.[0] || "ERR_FAILED";
}

async function readUrl(input: string, opts: ReadOptions): Promise<PageResult> {
  let url: URL;
  try {
    url = normalizeUrl(input);
  } catch (error) {
    return failed(input, error instanceof Error ? error.message : "无效网址");
  }

  const attempts: string[] = [];
  let raw: RawResponse | null = null;
  let page: ExtractedPage | null = null;
  let via: "fetch" | "browser" = "fetch";

  const zendesk = await zendeskArticle(url, opts.includeLinks);
  if (zendesk) return finish(url, zendesk.raw, zendesk.page, "fetch", opts);

  if (!opts.useBrowser) {
    try {
      raw = await directFetch(url);
    } catch (error) {
      const message = `直接请求失败：${errorText(error)}`;
      if (UNREACHABLE_CODES.has(causeCode(error))) return failed(url.toString(), message);
      attempts.push(message);
    }
    if (raw && looksBlocked(raw)) {
      attempts.push(`直接请求被站点拦截（HTTP ${raw.status}）`);
      raw = null;
    } else if (raw && isHtml(raw.contentType, raw.body)) {
      page = htmlToPage(raw.body, raw.finalUrl, opts.includeLinks);
    }
  }

  const thin = raw && page && page.text.length < MIN_HTML_TEXT;
  if (opts.useBrowser || !raw || thin) {
    try {
      const rendered = await browserFetch(raw ? new URL(raw.finalUrl) : url);
      const errorCode = browserErrorCode(rendered.body);
      if (errorCode) {
        attempts.push(`浏览器无法打开（${errorCode}）`);
      } else if (looksBlocked(rendered)) {
        attempts.push("浏览器渲染后仍停在人机验证页");
      } else {
        const renderedPage = htmlToPage(rendered.body, rendered.finalUrl, opts.includeLinks);
        if (!page || renderedPage.text.length > page.text.length) {
          raw = rendered;
          page = renderedPage;
          via = "browser";
        }
      }
    } catch (error) {
      attempts.push(`浏览器渲染失败：${errorText(error)}`);
    }
  }

  if (!raw) return failed(url.toString(), attempts.join("；") || "请求失败");
  return finish(url, raw, page, via, opts);
}

function finish(
  url: URL,
  raw: RawResponse,
  page: ExtractedPage | null,
  via: "fetch" | "browser",
  opts: ReadOptions,
): PageResult {
  let title = page?.title || "";
  let fullText = page?.text || "";
  if (!page) {
    if (!isTextual(raw.contentType)) {
      return failed(url.toString(), `暂不支持该内容类型：${raw.contentType || "未知"}`, raw);
    }
    fullText = raw.body.trim();
    title = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
  }
  if (raw.status >= 400 && !fullText) {
    return failed(url.toString(), `HTTP ${raw.status}`, raw);
  }
  if (!fullText) {
    return failed(url.toString(), "页面没有可读取的正文", raw);
  }

  const startChar = Math.min(opts.startChar, fullText.length);
  const text = fullText.slice(startChar, startChar + opts.maxChars);
  return {
    ok: raw.status < 400,
    url: url.toString(),
    finalUrl: raw.finalUrl,
    status: raw.status,
    via,
    contentType: raw.contentType,
    title: title || url.hostname,
    ...(page?.description ? { description: page.description } : {}),
    text,
    charCount: fullText.length,
    startChar,
    truncated: startChar + text.length < fullText.length,
    ...(page?.links ? { links: page.links } : {}),
    ...(raw.status >= 400 ? { error: `HTTP ${raw.status}` } : {}),
  };
}

const UNREACHABLE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

function causeCode(error: unknown) {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return typeof cause?.code === "string" ? cause.code : "";
}

function errorText(error: unknown) {
  const code = causeCode(error);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "域名无法解析";
  if (code === "ECONNREFUSED") return "连接被拒绝";
  if (error && typeof error === "object" && "killed" in error && error.killed) return "超时";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const message = error instanceof Error ? error.message : String(error);
  return cause && cause !== message ? `${message}（${cause}）` : message;
}

function failed(url: string, error: string, raw?: RawResponse): PageResult {
  return {
    ok: false,
    url,
    finalUrl: raw?.finalUrl || url,
    ...(raw ? { status: raw.status, contentType: raw.contentType } : {}),
    title: url,
    text: "",
    charCount: 0,
    startChar: 0,
    truncated: false,
    error,
  };
}

export function webFetchTools(): ToolSet {
  return {
    fetchUrl: tool({
      description:
        "直接访问指定网址并读取页面正文（标题、描述、正文文本，可选页内链接）。用户给出具体 URL、或你已知道目标页面地址时，必须优先用它直接读取，而不是用 webSearch 搜 site:。先直接请求，遇到反爬/JS 渲染页面会自动用本机无头浏览器重试。支持 HTML、纯文本、Markdown、JSON；长页面可用 startChar 分段续读。",
      inputSchema: z.object({
        urls: z
          .array(z.string())
          .min(1)
          .max(URL_LIMIT)
          .describe(`要访问的网址列表（http/https），最多 ${URL_LIMIT} 个`),
        maxChars: z
          .number()
          .int()
          .min(1_000)
          .max(MAX_CHARS_CAP)
          .optional()
          .describe(`每页最多返回的正文字符数，默认 ${DEFAULT_MAX_CHARS}`),
        startChar: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("从正文第几个字符开始返回；上次结果 truncated=true 时用于续读"),
        includeLinks: z
          .boolean()
          .optional()
          .describe("是否返回页内链接列表（用于继续跳转到子页面），默认 false"),
        useBrowser: z
          .boolean()
          .optional()
          .describe("跳过直接请求，直接用无头浏览器渲染（已知是 JS 渲染页面时使用）"),
      }),
      execute: async ({ urls, maxChars, startChar, includeLinks, useBrowser }) => {
        const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
        if (!unique.length) throw new Error("urls 不能为空");
        const opts = {
          maxChars: maxChars ?? DEFAULT_MAX_CHARS,
          startChar: startChar ?? 0,
          includeLinks: includeLinks ?? false,
          useBrowser: useBrowser ?? false,
        };
        const pages = await Promise.all(unique.map((url) => readUrl(url, opts)));
        return {
          ok: true as const,
          searchId: randomUUID(),
          pageCount: pages.filter((page) => page.ok && page.text).length,
          pages,
          next: pages.some((page) => page.truncated)
            ? "有页面被截断：需要后文时用相同 url 与 startChar=startChar+text.length 续读。"
            : "根据读取到的正文作答；读取失败的页面要如实告知，不要编造内容。",
        };
      },
    }),
  };
}
