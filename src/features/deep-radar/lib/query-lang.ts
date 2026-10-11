export type QueryPair = {
  query: string;
  queryZh: string;
  queryEn: string;
};

export function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

export function normalizeQueryPair(input: {
  query?: string;
  queryZh?: string;
  queryEn?: string;
}): QueryPair | null {
  const raw = (input.query ?? "").trim();
  const zh = (input.queryZh ?? "").trim() || (hasCjk(raw) ? raw : "");
  const en = (input.queryEn ?? "").trim() || (!hasCjk(raw) && raw ? raw : "");
  const query = zh || en || raw;
  if (!query) return null;
  return {
    query,
    queryZh: zh || query,
    queryEn: en || query,
  };
}

export function formatQueryPair(pair: QueryPair): string {
  if (pair.queryZh && pair.queryEn && pair.queryZh !== pair.queryEn) {
    return `${pair.queryZh}  ·  ${pair.queryEn}`;
  }
  return pair.query;
}
