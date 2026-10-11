import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";
import { SOURCE_TITLE } from "@/features/deep-radar/lib/settings-types";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
const CITE_LABEL_UNITS = 12;

export function markdownLinkHrefs(markdown: string): string[] {
  return [...markdown.matchAll(MARKDOWN_LINK_RE)].map((match) => match[2]);
}

const BARE_OR_MD_LINK_RE =
  /\[([^\]]*)\]\((https?:[^)\s]+)\)|https?:\/\/[^\s<>\]）】，。；、]+/g;

export function autolinkBareUrls(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```|`[^`]+`)/);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(BARE_OR_MD_LINK_RE, (all, _text, href) => {
        if (href) return all;
        return `[${all}](${all})`;
      });
    })
    .join("");
}

export function clipCiteLabel(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "来源";
  let width = 0;
  let out = "";
  for (const ch of text) {
    const unit = /[\u3400-\u9fff]/.test(ch) ? 1 : 0.55;
    if (width + unit > CITE_LABEL_UNITS) return `${out}…`;
    out += ch;
    width += unit;
  }
  return out;
}

export function shortCiteLabel(link: ResearchLink): string {
  const author = compact(link.author);
  if (author) return clipCiteLabel(author);
  const title = compact(link.title);
  if (title && !looksLikeHost(title)) {
    return clipCiteLabel(firstChunk(title));
  }
  if (link.roundIndex >= 0) {
    const source = SOURCE_CITE_LABEL[link.source] ?? SOURCE_TITLE[link.source];
    if (source) return clipCiteLabel(source);
  }
  return clipCiteLabel(hostLabel(link.url));
}

export function displayCiteLabel(raw: string, link: ResearchLink): string {
  const text = compact(raw);
  if (!text || looksLikeHost(text) || /^https?:/i.test(text)) {
    return shortCiteLabel(link);
  }
  return clipCiteLabel(text);
}

export function resolveReportLink(
  href: string,
  catalog: ResearchLink[],
): ResearchLink {
  const normalized = normalizeUrl(href);
  const found = catalog.find(
    (link) =>
      link.url === href ||
      link.normalizedUrl === href ||
      link.normalizedUrl === normalized ||
      normalizeUrl(link.url) === normalized,
  );
  if (found) return found;
  let title = href;
  let source: ResearchLink["source"] = "baidu";
  try {
    const url = new URL(href);
    title = url.hostname.replace(/^www\./, "");
    if (url.hostname.includes("weixin") || url.hostname.includes("wechat")) {
      source = "wechat";
    } else if (url.hostname.includes("zhihu")) {
      source = "zhihu";
    }
  } catch {
    title = href;
  }
  return {
    url: href,
    normalizedUrl: normalized || href,
    title,
    source,
    cited: true,
    roundIndex: -1,
  };
}

export function withInlineCites(
  markdown: string,
  urls: string[] | undefined,
  catalog: ResearchLink[],
): string {
  const body = markdown.trim();
  const present = new Set(
    markdownLinkHrefs(body).map((href) => normalizeUrl(href) || href),
  );
  const missing = (urls ?? []).filter((url) => {
    const key = normalizeUrl(url) || url;
    return key && !present.has(key) && !present.has(url);
  });
  if (missing.length === 0) return markdown;
  const tags = missing
    .map((url) => {
      const link = resolveReportLink(url, catalog);
      return `[${shortCiteLabel(link)}](${url})`;
    })
    .join("、");
  if (!body) return `根据 ${tags}。`;
  return `${body}\n\n根据 ${tags}。`;
}

const SOURCE_CITE_LABEL: Partial<Record<string, string>> = {
  wechat: "微信",
  bing_cn: "必应",
  bing_int: "必应",
  google_hk: "Google",
  so360: "360",
  toutiao: "头条",
};

function compact(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstChunk(title: string): string {
  return title.split(/[：:\-|｜【】]/)[0]?.trim() || title;
}

function looksLikeHost(value: string): boolean {
  return /^[\w.-]+\.[a-z]{2,}$/i.test(value);
}

function hostLabel(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const pathSeg = url.pathname.split("/").filter(Boolean)[0];
    if (/(^|\.)github\.com$/i.test(host) && pathSeg) return pathSeg;
    const labels = host.split(".").filter(Boolean);
    if (labels.length >= 3) return labels[0];
    return labels[0] || host;
  } catch {
    return "来源";
  }
}
