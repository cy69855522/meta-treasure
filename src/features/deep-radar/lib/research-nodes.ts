import { extractJson } from "@/features/deep-radar/lib/extract-json";
import type { FilterLlmResult } from "@/features/deep-radar/lib/research-filter";
import { normalizeOutline, outlinePoints } from "@/features/deep-radar/lib/research-outline";
import { normalizeQueryPair } from "@/features/deep-radar/lib/query-lang";
import {
  EXPLORE_INSTRUCTIONS,
  FILTER_INSTRUCTIONS,
  FINDINGS_INSTRUCTIONS,
  FOLLOWUP_INSTRUCTIONS,
  GRILL_INSTRUCTIONS,
  OUTLINE_INSTRUCTIONS,
  QUERY_INSTRUCTIONS,
  REPORT_PLAN_INSTRUCTIONS,
  snapshotPrompt,
  type PromptMessage,
} from "@/features/deep-radar/lib/research-prompts";
import { parseExploreDecision } from "@/features/deep-radar/lib/research-explore";
import {
  DEFAULT_MAX_ROUNDS,
  EXPLORE_MAX_BATCHES,
  EXPLORE_MAX_URLS_PER_BATCH,
  READ_SOURCES_MAX_BATCHES,
  READ_SOURCES_MAX_PER_BATCH,
} from "@/features/deep-radar/lib/constants";
import { extractEqualsMarks, mergeKeywords } from "@/features/deep-radar/lib/candy-highlight";
import { writeReportInWorkspace, type WorkspaceTurn } from "@/features/deep-radar/lib/research-report-write";
import {
  parseFindingsTool,
  parseReportPlanTool,
  readSourceBatch,
} from "@/features/deep-radar/lib/research-sources";
import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";
import {
  currentLoopRoundCount,
  type MessageImage,
  type Outline,
  type ReportPlan,
  type ResearchState,
} from "@/features/deep-radar/lib/research-types";

export type { PromptMessage, WorkspaceTurn };

export type LlmPort = {
  complete: (
    instructions: string,
    prompt: string,
    signal?: AbortSignal,
    images?: MessageImage[],
  ) => Promise<string>;
  completeWorkspace?: (
    turn: WorkspaceTurn,
    signal?: AbortSignal,
  ) => Promise<{ text: string; threadId: string }>;
};

export async function grillNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
) {
  const text = await llm.complete(
    GRILL_INSTRUCTIONS,
    snapshotPrompt(
      state,
      "根据 dialogue 决定下一问或结束追问。禁止重复用户已陈述的意图。",
      messages,
    ),
  );
  return extractJson<{ done: boolean; question?: string | null }>(text);
}

export async function outlineNode(
  llm: LlmPort,
  state: ResearchState,
  feedback?: string,
  messages: PromptMessage[] = [],
) {
  const text = await llm.complete(
    OUTLINE_INSTRUCTIONS,
    snapshotPrompt(
      state,
      feedback ? `用户修改意见：${feedback}` : undefined,
      messages,
    ),
  );
  return normalizeOutline(extractJson<unknown>(text));
}

export async function queryNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
) {
  const used = state.rounds.flatMap((round) =>
    [round.query, round.queryZh, round.queryEn].filter(Boolean),
  );
  const text = await llm.complete(
    QUERY_INSTRUCTIONS,
    snapshotPrompt(state, `已经用过的搜索词：${JSON.stringify(used)}`, messages),
  );
  const parsed = extractJson<{
    query?: string;
    queryZh?: string;
    queryEn?: string;
    targetQuestion?: string;
  }>(text);
  const pair = normalizeQueryPair(parsed);
  if (!pair) return { query: "", queryZh: "", queryEn: "", targetQuestion: "" };
  const targetQuestion =
    (parsed.targetQuestion ?? "").trim() ||
    outlinePoints(state.outline).find((point) =>
      !state.rounds.some((round) => round.targetQuestion === point),
    ) ||
    pair.query;
  return { ...pair, targetQuestion };
}

export async function filterNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
) {
  const text = await llm.complete(
    FILTER_INSTRUCTIONS,
    snapshotPrompt(state, undefined, messages),
  );
  return extractJson<FilterLlmResult>(text);
}

export async function exploreNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
) {
  const used = state.draftRound?.exploredUrls?.length ?? 0;
  const iterated = state.draftRound?.exploreCount ?? 0;
  const text = await llm.complete(
    EXPLORE_INSTRUCTIONS,
    snapshotPrompt(
      state,
      `fetch_page 本轮已迭代 ${iterated} / ${EXPLORE_MAX_BATCHES} 次，已打开 ${used} 页。每次最多 ${EXPLORE_MAX_URLS_PER_BATCH} 个 url。读完后自行决定：还有目标材料的子页面就继续 fetch_page；目录已经够用或没有新线索就 tool=done。`,
      messages,
    ),
  );
  return parseExploreDecision(text);
}

export async function findingsNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
) {
  const loopCount = currentLoopRoundCount(state) + 1;
  const maxRounds = state.snapshot?.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const openedSources: ReturnType<typeof readSourceBatch> = [];
  const openedKeys = new Set<string>();

  for (let batch = 0; batch < READ_SOURCES_MAX_BATCHES; batch += 1) {
    const forceSubmit = batch === READ_SOURCES_MAX_BATCHES - 1;
    const text = await llm.complete(
      FINDINGS_INSTRUCTIONS,
      snapshotPrompt(
        state,
        [
          `本轮是第 ${loopCount} / ${maxRounds} 轮。若这已是最后一轮仍不够，analysis 必须写明达到最大迭代次数终止。`,
          `read_sources 已用 ${batch} / ${READ_SOURCES_MAX_BATCHES} 批，每批最多 ${READ_SOURCES_MAX_PER_BATCH} 条。`,
          forceSubmit
            ? "这是最后一次机会：必须调用 submit_findings，不要再 read_sources。"
            : "先按需 read_sources，材料够了再 submit_findings。",
          `openedSources=${JSON.stringify(openedSources)}`,
        ].join("\n"),
        messages,
        { includeExtracted: false },
      ),
    );
    const decision = parseFindingsTool(text);
    if (decision.tool === "read_sources") {
      if (forceSubmit) {
        throw new Error("书记员在最后一轮仍未提交 findings");
      }
      const fresh = decision.urls.filter((url) => {
        const key = normalizeUrl(url) || url.trim();
        if (!key || openedKeys.has(key)) return false;
        openedKeys.add(key);
        return true;
      });
      const batchRows = readSourceBatch(state, fresh.length ? fresh : decision.urls);
      openedSources.push(...batchRows);
      continue;
    }

    const summary = decision.summary.trim();
    const analysis = decision.analysis.trim();
    const keywords = mergeKeywords(
      decision.keywords,
      extractEqualsMarks(summary).marks,
      extractEqualsMarks(analysis).marks,
    );
    return {
      summary,
      analysis,
      findings: summary,
      gaps: analysis,
      keywords,
      shouldStop: Boolean(decision.shouldStop),
    };
  }

  throw new Error("书记员没有提交 findings");
}

export async function reportPlanNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
): Promise<ReportPlan> {
  const openedSources: ReturnType<typeof readSourceBatch> = [];
  const openedKeys = new Set<string>();

  for (let batch = 0; batch < READ_SOURCES_MAX_BATCHES; batch += 1) {
    const forceSubmit = batch === READ_SOURCES_MAX_BATCHES - 1;
    const text = await llm.complete(
      REPORT_PLAN_INSTRUCTIONS,
      snapshotPrompt(
        state,
        [
          `read_sources 已用 ${batch} / ${READ_SOURCES_MAX_BATCHES} 批，每批最多 ${READ_SOURCES_MAX_PER_BATCH} 条。`,
          forceSubmit
            ? "这是最后一次机会：必须调用 submit_plan，不要再 read_sources。"
            : "先按需 read_sources 核对关键原文，再 submit_plan。",
          `openedSources=${JSON.stringify(openedSources)}`,
        ].join("\n"),
        messages,
        { includeExtracted: false },
      ),
    );
    const decision = parseReportPlanTool(text);
    if (decision.tool === "read_sources") {
      if (forceSubmit) {
        throw new Error("策划在最后一轮仍未提交撰写计划");
      }
      const fresh = decision.urls.filter((url) => {
        const key = normalizeUrl(url) || url.trim();
        if (!key || openedKeys.has(key)) return false;
        openedKeys.add(key);
        return true;
      });
      const batchRows = readSourceBatch(state, fresh.length ? fresh : decision.urls);
      openedSources.push(...batchRows);
      continue;
    }

    return {
      title: decision.title,
      markdown: decision.markdown,
      keywords: mergeKeywords(decision.keywords),
    };
  }

  throw new Error("撰写计划是空的");
}

/** @deprecated Stale bundler graphs still import this name. */
export const reportNode = reportPlanNode;

export async function reportWriteNode(
  llm: LlmPort,
  state: ResearchState,
  messages: PromptMessage[] = [],
  options: {
    sessionId: string;
    images?: MessageImage[];
    signal?: AbortSignal;
    onTurn?: (turn: number, maxTurns: number) => void | Promise<void>;
  },
) {
  if (!llm.completeWorkspace) {
    throw new Error("当前模型接口不支持工作区写作循环");
  }
  return writeReportInWorkspace(
    llm as { completeWorkspace: NonNullable<LlmPort["completeWorkspace"]> },
    state,
    messages,
    options,
  );
}

export async function followupNode(
  llm: LlmPort,
  state: ResearchState,
  userText: string,
  messages: PromptMessage[] = [],
) {
  const text = await llm.complete(
    FOLLOWUP_INSTRUCTIONS,
    snapshotPrompt(
      state,
      [
        `用户说：${userText}`,
        `当前 phase=${state.phase}。`,
        state.phase === "paused"
          ? "研究流程尚未完成。若用户要继续未完成的 Deep Research，调用 continue_research；若要直接写终稿，调用 generate_report。"
          : "报告阶段已结束或无可恢复循环。不要调用 continue_research / generate_report。",
      ].join("\n"),
      messages,
      { includeExtracted: false },
    ),
  );
  return parseFollowupDecision(text, state.phase);
}

export type FollowupDecision =
  | { kind: "answer"; text: string }
  | { kind: "need_search"; outline: Outline }
  | { kind: "continue" }
  | { kind: "generate_report" };

export function parseFollowupDecision(
  text: string,
  phase: ResearchState["phase"],
): FollowupDecision {
  const parsed = extractJson<{
    tool?: string;
    kind?: string;
    text?: string;
    reason?: string;
    outline?: Outline;
  }>(text);
  const tool = (parsed.tool || parsed.kind || "").trim();

  if (tool === "continue_research" || tool === "continue") {
    if (phase !== "paused") {
      return {
        kind: "answer",
        text: "当前没有未完成的研究循环可以继续。你可以追问已有结论，或说明新的搜索角度。",
      };
    }
    return { kind: "continue" };
  }

  if (tool === "generate_report" || tool === "report") {
    if (phase !== "paused") {
      return {
        kind: "answer",
        text: "当前不在可开写终稿的暂停状态。若研究已完成，请直接基于报告追问；否则说明还想补查什么。",
      };
    }
    return { kind: "generate_report" };
  }

  if (tool === "need_search") {
    return { kind: "need_search", outline: normalizeOutline(parsed.outline) };
  }

  const answer = (parsed.text ?? "").trim();
  if (!answer) throw new Error("顾问没有返回可用回答");
  return { kind: "answer", text: answer };
}
