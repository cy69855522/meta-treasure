import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DeepResearchAgent } from "@progress/deep-research";
import type { SearchSource } from "@progress/deep-research";
import { tool, type ToolSet } from "@/lib/codex-tool";

export const WEB_SEARCH_SOURCES = ["wechat", "baidu", "google"] as const;
export type WebSearchSource = (typeof WEB_SEARCH_SOURCES)[number];

const sourceSchema = z.enum(WEB_SEARCH_SOURCES);

const HIT_LIMIT = 8;
const FETCH_LIMIT = 6;
const TEXT_CLIP = 12_000;

function researchAgent() {
  return new DeepResearchAgent({
    apiKey: process.env.TIKHUB_API_KEY,
    timeoutMs: 60_000,
  });
}

function clipText(text: string, max = TEXT_CLIP) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function webSearchTools(): ToolSet {
  return {
    webSearch: tool({
      description:
        "网页搜索（第一阶段）：按来源检索候选链接（标题/URL/摘要），不打开正文。sources 可选 wechat（微信公众号）、baidu（百度）、google（谷歌）；可多选。拿到结果后，再用 fetchPages 批量抽取需要的页面正文。",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词（中文为主）"),
        queryEn: z
          .string()
          .optional()
          .describe("可选英文查询；选 google 时建议同时提供"),
        sources: z
          .array(sourceSchema)
          .min(1)
          .describe("搜索来源：wechat / baidu / google，可多选"),
        limitPerSource: z
          .number()
          .int()
          .min(1)
          .max(HIT_LIMIT)
          .optional()
          .describe(`每个来源最多返回条数，默认 ${HIT_LIMIT}`),
      }),
      execute: async ({ query, queryEn, sources, limitPerSource }) => {
        const q = query.trim();
        if (!q) throw new Error("query 不能为空");
        const limit = limitPerSource ?? HIT_LIMIT;
        const uniqueSources = [...new Set(sources)] as SearchSource[];
        const result = await researchAgent().search(q, uniqueSources, {
          queryZh: q,
          queryEn: queryEn?.trim() || q,
        });

        const hits = uniqueSources.flatMap((source) => {
          const list = (result.groups[source] || []).slice(0, limit);
          return list.map((hit, index) => ({
            id: `${source}-${index + 1}`,
            source,
            title: hit.title,
            url: hit.url,
            snippet: hit.snippet || "",
          }));
        });

        const searchId = randomUUID();
        return {
          ok: true as const,
          searchId,
          query: result.keyword || q,
          sources: uniqueSources,
          hitCount: hits.length,
          hits,
          errors: result.errors || null,
          next:
            "若需正文，调用 fetchPages，传入本结果的 searchId 与要打开的 url 列表（可带来源 source）。",
        };
      },
    }),

    fetchPages: tool({
      description:
        "网页抽取（第二阶段）：对 webSearch 返回的候选链接批量抓取正文。每次最多 6 个 URL；优先选高相关链接。应传入上一轮的 searchId 以便界面归并展示。",
      inputSchema: z.object({
        searchId: z
          .string()
          .optional()
          .describe("对应 webSearch 返回的 searchId；有则界面归并到同一次搜索"),
        items: z
          .array(
            z.object({
              url: z.string().describe("要抽取的页面 URL"),
              source: sourceSchema
                .optional()
                .describe("来源：wechat / baidu / google，有助于选择抽取策略"),
              title: z.string().optional().describe("可选标题"),
            }),
          )
          .min(1)
          .max(FETCH_LIMIT)
          .describe(`要抽取的页面列表，最多 ${FETCH_LIMIT} 个`),
      }),
      execute: async ({ searchId, items }) => {
        const agent = researchAgent();
        const pages = await Promise.all(
          items.map(async (item) => {
            const source = (item.source || "baidu") as SearchSource;
            try {
              const page = await agent.extractPage(item.url, source);
              return {
                ok: true as const,
                url: item.url,
                finalUrl: page.finalUrl || item.url,
                source,
                title: page.title || item.title || item.url,
                text: clipText(page.text || ""),
                charCount: (page.text || "").trim().length,
              };
            } catch (error) {
              return {
                ok: false as const,
                url: item.url,
                source,
                title: item.title || item.url,
                text: "",
                charCount: 0,
                error: error instanceof Error ? error.message : "抽取失败",
              };
            }
          }),
        );

        return {
          ok: true as const,
          searchId: searchId || randomUUID(),
          pageCount: pages.filter((page) => page.ok && page.text).length,
          pages,
          next: "根据抽取正文作答；不要假装访问了未抽取的链接。",
        };
      },
    }),
  };
}
