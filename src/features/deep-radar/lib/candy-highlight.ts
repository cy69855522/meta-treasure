export const CANDY_HIGHLIGHT_CLASSES = [
  "bg-pink-200/45 text-pink-950 dark:bg-pink-400/25 dark:text-pink-50",
  "bg-lime-200/45 text-lime-950 dark:bg-lime-400/25 dark:text-lime-50",
  "bg-yellow-200/45 text-yellow-950 dark:bg-yellow-400/25 dark:text-yellow-50",
  "bg-violet-200/45 text-violet-950 dark:bg-violet-400/25 dark:text-violet-50",
  "bg-orange-200/45 text-orange-950 dark:bg-orange-400/25 dark:text-orange-50",
  "bg-cyan-200/45 text-cyan-950 dark:bg-cyan-400/25 dark:text-cyan-50",
  "bg-fuchsia-200/45 text-fuchsia-950 dark:bg-fuchsia-400/25 dark:text-fuchsia-50",
] as const;

export function candyClassFor(term: string): string {
  const key = term.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CANDY_HIGHLIGHT_CLASSES[hash % CANDY_HIGHLIGHT_CLASSES.length];
}

export function extractEqualsMarks(content: string): {
  text: string;
  marks: string[];
} {
  const marks: string[] = [];
  const text = content.replace(/==([^=\n]+)==/g, (_, inner: string) => {
    const mark = inner.trim();
    if (mark) marks.push(mark);
    return inner;
  });
  return { text, marks };
}

export function mergeKeywords(
  ...lists: Array<readonly string[] | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const term = raw.trim();
      if (term.length < 2) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(term);
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

export type HighlightPiece = {
  text: string;
  hit?: string;
};

export function splitByKeywords(
  text: string,
  keywords: string[],
): HighlightPiece[] {
  if (!text || keywords.length === 0) return [{ text }];
  const escaped = keywords.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  if (escaped.length === 0) return [{ text }];
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts
    .filter((part) => part !== "")
    .map((part) => {
      const hit = keywords.find(
        (term) => term.toLowerCase() === part.toLowerCase(),
      );
      return hit ? { text: part, hit } : { text: part };
    });
}
