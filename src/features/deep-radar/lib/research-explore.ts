import { extractJson } from "@/features/deep-radar/lib/extract-json";
import { EXPLORE_MAX_URLS_PER_BATCH } from "@/features/deep-radar/lib/constants";
import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";
import { parseGithubUrl, sameGithubRepo } from "@progress/deep-research";
import type { DraftRound } from "@/features/deep-radar/lib/research-types";

export type ExploreDecision = {
  urls: string[];
  reason?: string;
};

export function parseExploreDecision(text: string): ExploreDecision {
  const parsed = extractJson<{
    tool?: string;
    done?: boolean;
    url?: string;
    urls?: unknown;
    reason?: string;
  }>(text);
  if (parsed.done === true || parsed.tool === "done") {
    return { urls: [], reason: parsed.reason };
  }
  const urls: string[] = [];
  if (typeof parsed.url === "string") urls.push(parsed.url);
  if (Array.isArray(parsed.urls)) {
    for (const item of parsed.urls) {
      if (typeof item === "string") urls.push(item);
    }
  }
  return {
    urls: uniqueHttp(urls).slice(0, EXPLORE_MAX_URLS_PER_BATCH),
    reason: parsed.reason,
  };
}

export function allowedExploreUrls(
  draft: DraftRound,
  requested: string[],
): string[] {
  const already = new Set(
    [
      ...draft.hits
        .filter((hit) => hit.extracted?.trim())
        .map((hit) => normalizeUrl(hit.url) || hit.url),
      ...(draft.exploredUrls ?? []).map((url) => normalizeUrl(url) || url),
    ].filter(Boolean),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of requested) {
    const key = normalizeUrl(url) || url;
    if (!key || seen.has(key) || already.has(key)) continue;
    if (!isAllowedExploreUrl(url, draft)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= EXPLORE_MAX_URLS_PER_BATCH) break;
  }
  return out;
}

export function isAllowedExploreUrl(url: string, draft: DraftRound): boolean {
  const key = normalizeUrl(url) || url;
  if (!key) return false;
  const github = parseGithubUrl(url);
  for (const hit of draft.hits) {
    if ((normalizeUrl(hit.url) || hit.url) === key) return true;
    if (
      hit.childLinks?.some((child) => (normalizeUrl(child.url) || child.url) === key)
    ) {
      return true;
    }
    if (github && sameGithubRepo(url, hit.url)) {
      return (
        github.kind === "blob" ||
        github.kind === "raw" ||
        github.kind === "tree" ||
        github.kind === "repo"
      );
    }
  }
  return false;
}

function uniqueHttp(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = normalizeUrl(url) || url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}
