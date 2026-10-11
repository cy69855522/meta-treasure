import type { CitedPick, ResearchLink, UnusedPick } from "@/features/deep-radar/lib/research-types";

export type HitReview = {
  url: string;
  relevant: boolean;
  reason: string;
};

export type FilterLlmResult = {
  reviews?: HitReview[];
  cited?: Array<string | { url: string; reason?: string }>;
  unused?: Array<
    string | { url: string; relevant?: boolean; reason?: string }
  >;
};

function itemUrl(item: string | { url: string }): string {
  return typeof item === "string" ? item : item.url;
}

function itemReason(item: string | { reason?: string }): string {
  return typeof item === "string" ? "" : (item.reason ?? "").trim();
}

export function matchHit(
  hits: ResearchLink[],
  url: string,
): ResearchLink | undefined {
  const needle = url.trim();
  return hits.find(
    (hit) =>
      hit.url === needle ||
      hit.normalizedUrl === needle ||
      hit.url.replace(/\/$/, "") === needle.replace(/\/$/, ""),
  );
}

export function applyHitReviews(
  hits: ResearchLink[],
  raw: FilterLlmResult,
): { cited: CitedPick[]; unused: UnusedPick[] } {
  const reviews = new Map<string, HitReview>();

  const write = (url: string, relevant: boolean, reason: string) => {
    const hit = matchHit(hits, url);
    if (!hit) return;
    reviews.set(hit.url, {
      url: hit.url,
      relevant,
      reason: reason.trim(),
    });
  };

  for (const review of raw.reviews ?? []) {
    write(review.url, Boolean(review.relevant), review.reason ?? "");
  }

  for (const item of raw.cited ?? []) {
    const hit = matchHit(hits, itemUrl(item));
    if (!hit) continue;
    const previous = reviews.get(hit.url);
    write(
      hit.url,
      previous?.relevant ?? true,
      itemReason(item) || previous?.reason || "",
    );
  }

  for (const item of raw.unused ?? []) {
    const url = itemUrl(item);
    const hit = matchHit(hits, url);
    if (!hit || reviews.has(hit.url)) continue;
    const relevant =
      typeof item === "string" ? true : (item.relevant ?? true);
    write(url, relevant, itemReason(item));
  }

  for (const hit of hits) {
    if (!reviews.has(hit.url)) {
      write(hit.url, true, "模型未单独评审，暂按相关处理。");
    }
  }

  const citedIds = new Set(
    (raw.cited ?? [])
      .map((item) => matchHit(hits, itemUrl(item))?.url)
      .filter((url): url is string => Boolean(url)),
  );

  const cited: CitedPick[] = [];
  const unused: UnusedPick[] = [];

  for (const hit of hits) {
    const review = reviews.get(hit.url);
    if (!review) continue;
    const reason =
      review.reason ||
      (review.relevant ? "与本轮目标相关。" : "与本轮目标无关。");
    if (citedIds.has(hit.url) && review.relevant) {
      cited.push({ url: hit.url, reason });
    } else {
      unused.push({
        url: hit.url,
        relevant: review.relevant,
        reason,
      });
    }
  }

  return { cited, unused };
}
