import { z } from "zod";
import { tool, type ToolSet } from "@/lib/codex-tool";
import {
  listFavoriteSnapshots,
  listSessionSnapshots,
  postProgressAction,
  progressSnapshot,
  reportSnapshot,
  sessionSnapshot,
  startResearchFromProgress,
} from "@/features/deep-radar/lib/service";

const sessionId = z
  .string()
  .describe(
    "Deep Radar 研究会话 id（来自 start/list/status，或收藏研究报告目录中的 id）",
  );

export function deepRadarTools(): ToolSet {
  return {
    deepRadarStart: tool({
      description:
        "在 Deep Radar 新建研究会话，并立刻用给定需求开始 Deep Research（跳过追问，纲要生成后自动批准并进入搜索）。返回进度摘要和可打开的页面链接。研究在 Deep Radar 里异步进行，本调用不会等到报告写完。",
      inputSchema: z.object({
        brief: z.string().describe("研究需求全文，直接交给 Deep Radar"),
        title: z.string().optional().describe("可选会话标题；缺省截取需求开头"),
      }),
      execute: async ({ brief, title }) =>
        startResearchFromProgress(brief, title),
    }),

    deepRadarList: tool({
      description: "列出 Deep Radar 已有研究会话（含阶段、是否已有报告、页面链接）。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional().describe("最多条数，默认 30"),
      }),
      execute: async ({ limit }) => ({
        sessions: listSessionSnapshots(limit ?? 30),
      }),
    }),

    deepRadarFavoriteList: tool({
      description:
        "列出 Deep Radar 收藏夹中的研究报告（id、标题、摘要、打开报告的链接）。目录已注入系统提示；需要刷新或核对收藏时调用本工具。读取正文请用 deepRadarReport。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("最多条数，默认 50"),
      }),
      execute: async ({ limit }) => ({
        favorites: listFavoriteSnapshots(limit ?? 50),
      }),
    }),

    deepRadarStatus: tool({
      description:
        "查看某个 Deep Radar 研究会话的当前摘要（阶段、是否忙碌、轮次、有无报告、打开链接）。需要百分比和报告撰写进度时用 deepRadarProgress。",
      inputSchema: z.object({ sessionId }),
      execute: async ({ sessionId: id }) => {
        const session = sessionSnapshot(id);
        if (!session) throw new Error("研究会话不存在");
        return session;
      },
    }),

    deepRadarProgress: tool({
      description:
        "读取某个 Deep Radar 研究会话的实时进度：阶段、百分比、搜索轮次、报告撰写 turn/maxTurns、是否已结束。聊天气泡底部的进度条走同一接口。研究进行中（含撰写报告）可调用；已完成或失败后不必再查。",
      inputSchema: z.object({ sessionId }),
      execute: async ({ sessionId: id }) => {
        const progress = progressSnapshot(id);
        if (!progress) throw new Error("研究会话不存在");
        return progress;
      },
    }),

    deepRadarReport: tool({
      description:
        "按 sessionId 读取 Deep Radar 研究报告正文（可能被截断）以及打开报告位置的链接。sessionId 可来自收藏研究报告目录、deepRadarFavoriteList 或 deepRadarList。没有报告时会说明尚未完成。",
      inputSchema: z.object({ sessionId }),
      execute: async ({ sessionId: id }) => {
        const report = reportSnapshot(id);
        if (!report) throw new Error("研究会话不存在");
        return report;
      },
    }),

    deepRadarAct: tool({
      description:
        "对已有 Deep Radar 会话追加操作：message 插入用户消息，approve 批准纲要，continue 继续研究，report 生成报告，stop 停止。返回最新进度和页面链接。",
      inputSchema: z.object({
        sessionId,
        action: z.enum(["message", "approve", "continue", "report", "stop"]),
        text: z.string().optional().describe("action=message 时的消息正文"),
      }),
      execute: async ({ sessionId: id, action, text }) =>
        postProgressAction(id, action, text),
    }),
  };
}
