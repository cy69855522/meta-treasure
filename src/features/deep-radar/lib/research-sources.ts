import {
  READ_SOURCES_BODY_LIMIT,
  READ_SOURCES_MAX_PER_BATCH,
  SNIPPET_CHAR_LIMIT,
} from "@/features/deep-radar/lib/constants";
import { extractJson } from "@/features/deep-radar/lib/extract-json";
import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";
import type { ResearchLink, ResearchState } from "@/features/deep-radar/lib/research-types";

export type SourceCatalogItem = {
  url: string;
  title?: string;
  source?: string;
  author?: string;
  reason?: string;
  snippet?: string;
  cited?: boolean;
  hasBody: boolean;
  chars?: number;
};

function clip(text: string | undefined, limit: number) {
  if (!text) return text;
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function linkBody(link: ResearchLink | undefined) {
  const raw = (link?.extracted || link?.snippet || "").trim();
  if (!raw) return "";
  return raw.length <= READ_SOURCES_BODY_LIMIT
    ? raw
    : `${raw.slice(0, READ_SOURCES_BODY_LIMIT)}…`;
}

export function catalogItem(link: ResearchLink): SourceCatalogItem {
  const body = (link.extracted || "").trim();
  const preview =
    (link.snippet || "").trim() ||
    (body ? body.slice(0, Math.min(160, SNIPPET_CHAR_LIMIT)) : "");
  return {
    url: link.url,
    title: link.title,
    source: link.source,
    author: link.author,
    reason: link.reason,
    snippet: clip(preview || undefined, 160),
    cited: link.cited,
    hasBody: Boolean(body),
    chars: body ? body.length : undefined,
  };
}

export function collectReadableLinks(state: ResearchState): ResearchLink[] {
  const byUrl = new Map<string, ResearchLink>();
  const put = (link: ResearchLink | undefined) => {
    if (!link?.url) return;
    const key = normalizeUrl(link.url) || link.url;
    const prev = byUrl.get(key);
    if (!prev) {
      byUrl.set(key, link);
      return;
    }
    // Prefer the copy that still has extracted body.
    if (!prev.extracted && link.extracted) byUrl.set(key, link);
  };
  for (const link of state.links) put(link);
  for (const hit of state.draftRound?.hits ?? []) put(hit);
  return [...byUrl.values()];
}

export function lookupLink(
  state: ResearchState,
  url: string,
): ResearchLink | undefined {
  const key = normalizeUrl(url) || url;
  const all = collectReadableLinks(state);
  return all.find((link) => (normalizeUrl(link.url) || link.url) === key);
}

export function readSourceBatch(
  state: ResearchState,
  urls: string[],
): Array<{
  url: string;
  title?: string;
  source?: string;
  author?: string;
  reason?: string;
  body: string;
  missing?: boolean;
}> {
  const out: Array<{
    url: string;
    title?: string;
    source?: string;
    author?: string;
    reason?: string;
    body: string;
    missing?: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (out.length >= READ_SOURCES_MAX_PER_BATCH) break;
    const key = normalizeUrl(raw) || raw;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const link = lookupLink(state, raw);
    if (!link) {
      out.push({ url: raw, body: "", missing: true });
      continue;
    }
    const body = linkBody(link);
    out.push({
      url: link.url,
      title: link.title,
      source: link.source,
      author: link.author,
      reason: link.reason,
      body: body || "（无正文，仅有标题/摘要）",
      missing: !body,
    });
  }
  return out;
}

export type FindingsToolDecision =
  | { tool: "read_sources"; urls: string[]; reason?: string }
  | {
      tool: "submit_findings";
      summary: string;
      analysis: string;
      keywords?: string[];
      shouldStop?: boolean;
    };

export function parseFindingsTool(text: string): FindingsToolDecision {
  const parsed = extractJson<{
    tool?: string;
    urls?: unknown;
    url?: string;
    reason?: string;
    summary?: string;
    analysis?: string;
    findings?: string;
    gaps?: string;
    keywords?: string[];
    shouldStop?: boolean;
  }>(text);

  const tool = (parsed.tool || "").trim();
  if (tool === "read_sources") {
    const urls: string[] = [];
    if (typeof parsed.url === "string") urls.push(parsed.url);
    if (Array.isArray(parsed.urls)) {
      for (const item of parsed.urls) {
        if (typeof item === "string") urls.push(item);
      }
    }
    return {
      tool: "read_sources",
      urls: urls.slice(0, READ_SOURCES_MAX_PER_BATCH),
      reason: parsed.reason,
    };
  }

  const summary = (parsed.summary ?? parsed.findings ?? "").trim();
  const analysis = (parsed.analysis ?? parsed.gaps ?? "").trim();
  if (!summary) throw new Error("书记员没有返回 summary");
  return {
    tool: "submit_findings",
    summary,
    analysis,
    keywords: parsed.keywords,
    shouldStop: Boolean(parsed.shouldStop),
  };
}

export type ReportPlanToolDecision =
  | { tool: "read_sources"; urls: string[]; reason?: string }
  | {
      tool: "submit_plan";
      title: string;
      markdown: string;
      keywords?: string[];
    };

export function parseReportPlanTool(text: string): ReportPlanToolDecision {
  const parsed = extractJson<{
    tool?: string;
    urls?: unknown;
    url?: string;
    reason?: string;
    title?: string;
    markdown?: string;
    keywords?: string[];
  }>(text);
  const tool = (parsed.tool || "").trim();
  if (tool === "read_sources") {
    const urls: string[] = [];
    if (typeof parsed.url === "string") urls.push(parsed.url);
    if (Array.isArray(parsed.urls)) {
      for (const item of parsed.urls) {
        if (typeof item === "string") urls.push(item);
      }
    }
    return {
      tool: "read_sources",
      urls: urls.slice(0, READ_SOURCES_MAX_PER_BATCH),
      reason: parsed.reason,
    };
  }
  const markdown = (parsed.markdown ?? "").trim();
  if (!markdown) throw new Error("撰写计划是空的");
  return {
    tool: "submit_plan",
    title: parsed.title?.trim() || "报告撰写计划",
    markdown,
    keywords: parsed.keywords,
  };
}
