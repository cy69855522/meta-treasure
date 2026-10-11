import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";
import type { SearchHit } from "@progress/deep-research";

export function hitsToLinks(
  hits: SearchHit[],
  roundIndex: number,
): ResearchLink[] {
  return hits.map((hit) => ({
    url: hit.url,
    normalizedUrl: normalizeUrl(hit.url) || hit.url,
    title: hit.title,
    source: hit.source,
    snippet: hit.snippet,
    author: hit.author,
    publishedAt: hit.publishedAt,
    contentType: hit.contentType,
    cited: false,
    roundIndex,
  }));
}

export function mergeUniqueLinks(
  existing: ResearchLink[],
  incoming: ResearchLink[],
): ResearchLink[] {
  const seen = new Set(
    existing.map((l) => l.normalizedUrl).filter(Boolean),
  );
  const unique: ResearchLink[] = [];
  for (const link of incoming) {
    const key = link.normalizedUrl || link.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }
  return unique;
}
