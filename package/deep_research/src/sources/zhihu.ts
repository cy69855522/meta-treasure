import {
  TikHubClient,
  findObjectList,
  isPlainObject,
  pickString,
  asString,
  stripHtml,
  extractMetrics,
  formatUnixOrString,
} from "../client";
import type { SearchHit, SearchMeta } from "../types";

type TikHubEnvelope = {
  data?: unknown;
};

const SKIP_TYPES = new Set([
  "people",
  "user",
  "topic",
  "column",
  "ebook",
  "pin",
  "roundtable",
]);

/**
 * Search Zhihu content via TikHub article search V3.
 * GET /api/v1/zhihu/web/fetch_article_search_v3
 */
export async function searchZhihu(
  client: TikHubClient,
  keyword: string,
): Promise<SearchHit[]> {
  const q = keyword.trim();
  if (!q) return [];

  // TikHub default page size for this endpoint is 20.
  const envelope = await client.getJson<TikHubEnvelope>(
    "/api/v1/zhihu/web/fetch_article_search_v3",
    {
      keyword: q,
      offset: "0",
      limit: "20",
      show_all_topics: 0,
      search_source: "Normal",
    },
  );

  const root = envelope.data ?? envelope;
  const items = findObjectList(root, [
    "data",
    "items",
    "list",
    "contents",
    "search_result",
  ]);

  const hits: SearchHit[] = [];
  for (const item of items) {
    const hit = mapZhihuItem(item);
    if (hit) hits.push(hit);
  }
  return hits;
}

function mapZhihuItem(item: Record<string, unknown>): SearchHit | null {
  const highlight = isPlainObject(item.highlight) ? item.highlight : null;
  const node =
    (isPlainObject(item.object) && item.object) ||
    (isPlainObject(item.data) && item.data) ||
    (isPlainObject(item.result) && item.result) ||
    item;

  const typeHint = (
    pickString(node, ["type", "doc_type", "result_type"]) ?? ""
  ).toLowerCase();
  // Prefer object.type; outer wrapper is often "search_result".
  const objectType = typeHint || (pickString(item, ["type"]) ?? "").toLowerCase();
  if (SKIP_TYPES.has(objectType)) return null;

  const rawTitle =
    (highlight && pickString(highlight, ["title"])) ||
    pickString(node, ["title", "question.title", "excerpt_title", "name"]) ||
    pickString(item, ["title"]) ||
    "";
  const title = stripHtml(rawTitle);

  let url =
    pickString(node, ["url", "link", "share_url", "content_url"]) ??
    pickString(item, ["url", "link"]) ??
    "";

  const id =
    pickString(node, ["id", "token", "url_token"]) ??
    pickString(item, ["id"]) ??
    "";

  url = toPublicZhihuUrl(url, objectType || typeHint, id, node);

  if (!url || !isUsefulZhihuUrl(url)) return null;
  if (!title && !url) return null;

  const authorObj = isPlainObject(node.author) ? node.author : null;
  const author =
    (authorObj &&
      pickString(authorObj, ["name", "fullname_name", "fullname"])) ||
    pickString(node, ["author.name", "author.fullname_name"]) ||
    undefined;

  const rawSnippet =
    (highlight && pickString(highlight, ["description", "excerpt"])) ||
    pickString(node, [
      "excerpt",
      "snippet",
      "summary",
      "desc",
      "description",
    ]) ||
    undefined;
  const snippet = rawSnippet ? stripHtml(rawSnippet) : undefined;

  const publishedAt = formatUnixOrString(
    node.created_time ?? node.created ?? node.updated_time ?? node.publish_time,
  );

  const metrics = {
    ...extractMetrics(node),
    ...(authorObj ? extractMetrics(authorObj) : {}),
  };

  // Prefer content metrics over author follower labeled the same — extractMetrics
  // on author may add 关注; that's fine.
  const thumb =
    isPlainObject(node.thumbnail_info) &&
    Array.isArray((node.thumbnail_info as { thumbnails?: unknown }).thumbnails)
      ? ((node.thumbnail_info as { thumbnails: unknown[] }).thumbnails[0] as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const coverUrl =
    pickString(node, ["image_url", "thumbnail", "cover"]) ??
    (thumb ? pickString(thumb, ["url"]) : undefined);

  const meta: SearchMeta = {};
  if (objectType) meta["类型"] = objectType;
  const updated = formatUnixOrString(node.updated_time);
  if (updated && updated !== publishedAt) meta["更新时间"] = updated;
  if (authorObj) {
    const headline = pickString(authorObj, ["headline", "description"]);
    if (headline) meta["作者简介"] = stripHtml(headline);
  }
  if (coverUrl) meta["封面"] = coverUrl;

  return {
    source: "zhihu",
    title: title || url || "（无标题）",
    url,
    snippet,
    author,
    publishedAt,
    rawId: id,
    coverUrl,
    contentType: objectType || undefined,
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

function isUsefulZhihuUrl(url: string): boolean {
  if (!url.startsWith("http")) return false;
  if (url.includes("/people/")) return false;
  if (url.includes("/kvip/") || url.includes("/ebook/")) return false;
  if (url.includes("api.zhihu.com/people")) return false;
  return true;
}

function toPublicZhihuUrl(
  url: string,
  typeHint: string,
  id: string,
  node: Record<string, unknown>,
): string {
  if (url.includes("api.zhihu.com/articles/")) {
    const articleId = url.split("/articles/")[1]?.split(/[?#]/)[0];
    if (articleId) return `https://zhuanlan.zhihu.com/p/${articleId}`;
  }
  if (url.includes("api.zhihu.com/questions/")) {
    const qid = url.split("/questions/")[1]?.split(/[/?#]/)[0];
    if (qid) return `https://www.zhihu.com/question/${qid}`;
  }
  if (url.includes("api.zhihu.com/answers/")) {
    const aid = url.split("/answers/")[1]?.split(/[/?#]/)[0];
    if (aid) return `https://www.zhihu.com/answer/${aid}`;
  }
  if (url.startsWith("http")) return url;

  if (!id) return url;

  if (typeHint.includes("answer") || node.question) {
    const qid =
      pickString(node, ["question.id", "question_id"]) ??
      (isPlainObject(node.question)
        ? asString((node.question as Record<string, unknown>).id)
        : undefined);
    return qid
      ? `https://www.zhihu.com/question/${qid}/answer/${id}`
      : `https://www.zhihu.com/answer/${id}`;
  }
  if (typeHint.includes("article") || typeHint.includes("post")) {
    return `https://zhuanlan.zhihu.com/p/${id}`;
  }
  if (typeHint.includes("question")) {
    return `https://www.zhihu.com/question/${id}`;
  }
  return url;
}
