import {
  TikHubClient,
  findObjectList,
  isPlainObject,
  pickString,
  stripHtml,
  extractMetrics,
  formatUnixOrString,
} from "../client";
import type { SearchHit, SearchMeta } from "../types";

type TikHubEnvelope = {
  data?: unknown;
};

/**
 * Search WeChat Official Account articles via TikHub 搜一搜.
 * POST /api/v1/wechat_search/v2/fetch_search with business_type=article.
 *
 * Note: this search endpoint typically does NOT return like/view counts —
 * only title, digest, url, account, time, cover.
 */
export async function searchWechatArticles(
  client: TikHubClient,
  keyword: string,
): Promise<SearchHit[]> {
  const q = keyword.trim();
  if (!q) return [];

  const envelope = await client.postJson<TikHubEnvelope>(
    "/api/v1/wechat_search/v2/fetch_search",
    {
      keyword: q,
      business_type: "article",
      sort: "default",
      publish_time: "all",
      offset: 0,
      raw: false,
    },
  );

  const items = findObjectList(envelope.data ?? envelope, [
    "items",
    "results",
    "list",
    "articles",
  ]);

  const hits: SearchHit[] = [];
  for (const item of items) {
    const hit = mapWechatItem(item);
    if (hit) hits.push(hit);
  }
  return hits;
}

function mapWechatItem(item: Record<string, unknown>): SearchHit | null {
  const rawTitle =
    pickString(item, ["title", "doc.title", "item.title"]) ?? "";
  const title = stripHtml(rawTitle);

  let url =
    pickString(item, [
      "doc_url",
      "docUrl",
      "url",
      "link",
      "article_url",
      "doc.url",
      "item.url",
      "jumpInfo.url",
      "jump_info.url",
    ]) ?? "";

  const jump = item.jumpInfo ?? item.jump_info;
  if (!url && isPlainObject(jump)) {
    url =
      pickString(jump, ["url", "link", "extInfo.url", "ext_info.url"]) ?? "";
  }

  if (url.startsWith("http://mp.weixin.qq.com")) {
    url = `https://${url.slice("http://".length)}`;
  }

  if (!title && !url) return null;

  const source = isPlainObject(item.source) ? item.source : null;
  const author =
    (source && pickString(source, ["title", "nickName", "name"])) ||
    pickString(item, [
      "author",
      "nick_name",
      "nickname",
      "account_name",
      "biz_nickname",
    ]);

  const rawSnippet = pickString(item, [
    "desc",
    "digest",
    "description",
    "snippet",
    "summary",
    "content",
  ]);
  const snippet = rawSnippet ? stripHtml(rawSnippet) : undefined;

  const relativeTime =
    (source && pickString(source, ["dateTime", "date"])) || undefined;
  const absoluteTime = formatUnixOrString(
    item.date ?? item.timestamp ?? item.publish_time,
  );
  const publishedAt = relativeTime || absoluteTime;

  const rawId = pickString(item, [
    "docID",
    "docId",
    "doc_id",
    "id",
    "app_msg_id",
    "appmsgid",
  ]);

  const coverUrl =
    pickString(item, ["thumbUrl", "thumb_url", "cover", "cover_url"]) ??
    undefined;

  const metrics = extractMetrics(item);
  const meta: SearchMeta = {};
  if (relativeTime && absoluteTime && relativeTime !== absoluteTime) {
    meta["发布时间"] = absoluteTime;
  }
  if (source && pickString(source, ["title"])) {
    meta["公众号"] = pickString(source, ["title"])!;
  }
  const docType = item.docType ?? item.doc_type;
  if (docType !== undefined && docType !== null && String(docType) !== "") {
    meta["文档类型"] = String(docType);
  }
  const itemShowType = item.itemShowType ?? item.item_show_type;
  if (
    itemShowType !== undefined &&
    itemShowType !== null &&
    String(itemShowType) !== ""
  ) {
    meta["内容类型"] = String(itemShowType);
  }
  if (coverUrl) meta["封面"] = coverUrl;

  return {
    source: "wechat",
    title: title || url || "（无标题）",
    url: url || "",
    snippet,
    author,
    publishedAt,
    rawId,
    coverUrl,
    contentType: "article",
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}
