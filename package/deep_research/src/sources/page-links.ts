import { parseHtml, absUrl, textOf } from "./html";

export type PageChildLink = {
  url: string;
  title: string;
};

export type PageExtract = {
  url: string;
  finalUrl?: string;
  title: string;
  text: string;
  links: PageChildLink[];
};

const SKIP_EXT =
  /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|woff2?|ttf|mp4|mp3|zip|tar|gz|tgz)$/i;
const SKIP_HOST_PATH =
  /github\.com\/(?:login|signup|pricing|features|topics|notifications|settings|marketplace)\b/i;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function looksLikeMarkdown(url: string, body: string): boolean {
  if (/\.(?:md|markdown|rst|txt)(?:$|\?)/i.test(url)) return true;
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<") && /<html[\s>]/i.test(trimmed.slice(0, 200))) {
    return false;
  }
  return /^#\s+\S/m.test(body) && body.includes("](");
}

export function markdownChildLinks(
  markdown: string,
  base: string,
  limit = 24,
): PageChildLink[] {
  const out: PageChildLink[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const href = absUrl(match[2] ?? "", base);
    const title = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!usableLink(href, base) || seen.has(href)) continue;
    seen.add(href);
    out.push({ url: href, title: title || fallbackTitle(href) });
    if (out.length >= limit) break;
  }
  return out;
}

export function htmlChildLinks(
  html: string,
  base: string,
  limit = 24,
): PageChildLink[] {
  const root = parseHtml(html);
  const scope =
    root.querySelector("article") ||
    root.querySelector("main") ||
    root.querySelector("#readme") ||
    root.querySelector("body") ||
    root;
  const out: PageChildLink[] = [];
  const seen = new Set<string>();
  for (const anchor of scope.querySelectorAll("a[href]")) {
    const href = absUrl(anchor.getAttribute("href") || "", base);
    if (!usableLink(href, base) || seen.has(href)) continue;
    seen.add(href);
    const title = textOf(anchor) || fallbackTitle(href);
    out.push({ url: href, title });
    if (out.length >= limit) break;
  }
  return out;
}

export function pageTitle(html: string, fallback: string): string {
  const root = parseHtml(html);
  const og = root
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  if (og?.trim()) return og.trim();
  const title = textOf(root.querySelector("title"));
  if (title) return title.replace(/\s+/g, " ").trim();
  const h1 = textOf(root.querySelector("h1"));
  return h1 || fallback;
}

export function fallbackTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || parsed.hostname);
  } catch {
    return url;
  }
}

function usableLink(href: string, base: string): boolean {
  if (!href || href === base) return false;
  if (!/^https?:\/\//i.test(href)) return false;
  if (SKIP_EXT.test(href)) return false;
  if (SKIP_HOST_PATH.test(href)) return false;
  try {
    const url = new URL(href);
    if (url.username || url.password) return false;
  } catch {
    return false;
  }
  return true;
}
