import {
  TikHubClient,
  asString,
  findObjectList,
  isPlainObject,
  pickString,
  stripHtml,
} from "../client";
import { PAGE_EXTRACT_CHAR_LIMIT } from "../limits";
import type { SearchHit } from "../types";

type Envelope = { data?: unknown };

export async function fetchWechatArticle(
  client: TikHubClient,
  url: string,
): Promise<string> {
  try {
    const envelope = await client.getJson<Envelope>(
      "/api/v1/wechat_mp/v2/fetch_article_detail",
      { url, raw: false },
    );
    return extractText(envelope.data ?? envelope);
  } catch {
    const envelope = await client.postJson<Envelope>(
      "/api/v1/wechat_mp/v2/fetch_article_detail",
      { url, raw: false },
    );
    return extractText(envelope.data ?? envelope);
  }
}

export async function fetchZhihuArticle(
  client: TikHubClient,
  articleId: string,
): Promise<string> {
  const envelope = await client.getJson<Envelope>(
    "/api/v1/zhihu/web/fetch_column_article_detail",
    { article_id: articleId },
  );
  return extractText(envelope.data ?? envelope);
}

export async function fetchZhihuQuestionAnswers(
  client: TikHubClient,
  questionId: string,
  limit = 5,
): Promise<SearchHit[]> {
  const envelope = await client.getJson<Envelope>(
    "/api/v1/zhihu/web/fetch_question_answers",
    { question_id: questionId, limit, offset: 0, order: "default" },
  );
  const items = findObjectList(envelope.data ?? envelope, [
    "data",
    "answers",
    "items",
  ]);
  const hits: SearchHit[] = [];
  for (const item of items) {
    const id =
      pickString(item, ["id", "answer_id", "url_token"]) ?? "";
    const title =
      stripHtml(
        pickString(item, ["question.title", "excerpt_title", "title"]) ?? "",
      ) || `知乎回答 ${id}`;
    const url = id
      ? `https://www.zhihu.com/question/${questionId}/answer/${id}`
      : pickString(item, ["url", "share_url"]) ?? "";
    if (!url) continue;
    const authorObj = isPlainObject(item.author) ? item.author : null;
    const snippet = stripHtml(
      pickString(item, ["excerpt", "content", "desc"]) ?? "",
    );
    hits.push({
      source: "zhihu",
      title,
      url,
      snippet: snippet.slice(0, 400) || undefined,
      author: authorObj
        ? pickString(authorObj, ["name", "fullname"])
        : undefined,
      rawId: id,
      contentType: "answer",
    });
  }
  return hits;
}

export async function fetchZhihuAnswerText(
  client: TikHubClient,
  questionId: string,
  answerId: string,
): Promise<string> {
  const envelope = await client.getJson<Envelope>(
    "/api/v1/zhihu/web/fetch_question_answers",
    { question_id: questionId, limit: 20, offset: 0, order: "default" },
  );
  const items = findObjectList(envelope.data ?? envelope, [
    "data",
    "answers",
    "items",
  ]);
  const match = items.find((item) => {
    const id = pickString(item, ["id", "answer_id", "url_token"]);
    return id === answerId;
  });
  if (!match) return "";
  return extractText(match);
}

export function zhihuArticleIdFromUrl(url: string): string | undefined {
  const m = url.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/);
  if (m) return m[1];
  const api = url.match(/\/articles\/(\d+)/);
  return api?.[1];
}

export function zhihuQuestionIdFromUrl(url: string): string | undefined {
  const m = url.match(/zhihu\.com\/question\/(\d+)/);
  return m?.[1];
}

export function zhihuAnswerIdFromUrl(url: string): string | undefined {
  const m = url.match(/\/answer\/(\d+)/);
  return m?.[1];
}

export function extractText(root: unknown): string {
  if (!root) return "";
  if (typeof root === "string") return stripHtml(root).slice(0, PAGE_EXTRACT_CHAR_LIMIT);
  if (!isPlainObject(root)) return "";
  const direct =
    pickString(root, [
      "content",
      "content_text",
      "text",
      "article.content",
      "data.content",
      "body",
      "html",
    ]) ?? "";
  if (direct && stripHtml(direct).length > 80) {
    return stripHtml(direct).slice(0, PAGE_EXTRACT_CHAR_LIMIT);
  }
  const chunks: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || chunks.join("").length > PAGE_EXTRACT_CHAR_LIMIT) return;
    if (typeof value === "string") {
      const t = stripHtml(value);
      if (t.length > 40) chunks.push(t);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (["content", "text", "html", "excerpt", "body"].includes(k)) {
          visit(v, depth + 1);
        }
      }
    }
  };
  visit(root, 0);
  return chunks.join("\n\n").slice(0, PAGE_EXTRACT_CHAR_LIMIT);
}

export function asId(value: unknown): string | undefined {
  return asString(value);
}
