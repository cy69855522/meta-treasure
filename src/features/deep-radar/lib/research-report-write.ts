import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  REPORT_MIN_CHARS,
  REPORT_WORKSPACE_EXTRACT_LIMIT,
  REPORT_WORKSPACE_MAX_SOURCES,
  REPORT_WORKSPACE_ROUND_TEXT_LIMIT,
  REPORT_WRITE_MAX_TURNS,
} from "@/features/deep-radar/lib/constants";
import { extractEqualsMarks, mergeKeywords } from "@/features/deep-radar/lib/candy-highlight";
import {
  REPORT_WRITE_CONTINUE,
  REPORT_WRITE_INSTRUCTIONS,
  REPORT_WRITE_TURN,
  snapshotPrompt,
  type PromptMessage,
} from "@/features/deep-radar/lib/research-prompts";
import type {
  MessageImage,
  Report,
  ReportPlan,
  ResearchLink,
  ResearchState,
} from "@/features/deep-radar/lib/research-types";

export type WorkspaceTurn = {
  instructions: string;
  text: string;
  cwd: string;
  threadId?: string;
  images?: MessageImage[];
};

export type ReportWriteLlm = {
  completeWorkspace: (
    turn: WorkspaceTurn,
    signal?: AbortSignal,
  ) => Promise<{ text: string; threadId: string }>;
};

export const REPORT_WORKSPACE_ROOT = path.join(
  tmpdir(),
  "deep-radar-reports",
);

function clip(text: string | undefined, limit: number) {
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function sourceFileSlug(link: ResearchLink, index: number) {
  const raw = (link.title || link.url || `source-${index + 1}`)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const slug = raw || `source-${index + 1}`;
  return `${String(index + 1).padStart(3, "0")}-${slug}.md`;
}

function listedSources(links: ResearchLink[]) {
  const withBody = links.filter((link) => (link.extracted || "").trim());
  const cited = withBody.filter((link) => link.cited);
  const preferred = cited.length ? cited : withBody;
  return preferred.slice(0, REPORT_WORKSPACE_MAX_SOURCES);
}

function workspaceResearchJson(
  state: ResearchState,
  messages: PromptMessage[],
) {
  const raw = JSON.parse(
    snapshotPrompt(state, "写作工作区快照", messages, {
      includeExtracted: false,
    }),
  ) as {
    dialogue?: string;
    rounds?: Array<Record<string, unknown>>;
    links?: unknown;
    sourceCatalog?: unknown;
    draftRound?: unknown;
    [key: string]: unknown;
  };
  // Bodies live in sources/*.md — keep research.json tiny.
  delete raw.sourceCatalog;
  delete raw.draftRound;
  raw.links = Array.isArray(raw.links)
    ? (raw.links as Array<Record<string, unknown>>).slice(0, 80).map((link) => ({
        url: link.url,
        title: link.title,
        source: link.source,
        cited: link.cited,
        hasBody: link.hasBody,
      }))
    : [];
  if (typeof raw.dialogue === "string" && raw.dialogue.length > 12_000) {
    raw.dialogue = `${raw.dialogue.slice(0, 12_000)}…`;
  }
  if (Array.isArray(raw.rounds)) {
    raw.rounds = raw.rounds.map((round) => {
      const next: Record<string, unknown> = {
        query: round.query,
        queryZh: round.queryZh,
        queryEn: round.queryEn,
        targetQuestion: round.targetQuestion,
        keywords: round.keywords,
      };
      for (const key of ["summary", "analysis", "findings", "gaps"] as const) {
        const value = round[key];
        if (typeof value === "string") {
          next[key] =
            value.length > REPORT_WORKSPACE_ROUND_TEXT_LIMIT
              ? `${value.slice(0, REPORT_WORKSPACE_ROUND_TEXT_LIMIT)}…`
              : value;
        }
      }
      return next;
    });
  }
  return `${JSON.stringify(raw, null, 2)}\n`;
}

function sourcesIndexMarkdown(
  links: ResearchLink[],
  files: Array<{ link: ResearchLink; file: string }>,
) {
  if (files.length === 0) {
    return [
      "# 资料目录",
      "",
      "正文拆在 `sources/` 目录。当前没有抽出可用正文，只能依据搜索摘要与 research.json。",
      "",
    ].join("\n");
  }
  return [
    "# 资料目录",
    "",
    "正文按文件拆在 `sources/*.md`。写作时按章节需要分批打开，不要一次读完全部。",
    "",
    "| # | 文件 | 标题 | url | 有正文 |",
    "|---|------|------|-----|--------|",
    ...files.map(({ link, file }, index) => {
      const hasBody = Boolean((link.extracted || "").trim());
      const title = (link.title || link.url).replace(/\|/g, "/");
      return `| ${index + 1} | sources/${file} | ${title} | ${link.url} | ${hasBody ? "是" : "否"} |`;
    }),
    "",
  ].join("\n");
}

function sourceBodyMarkdown(link: ResearchLink) {
  return [
    `# ${link.title || link.url}`,
    "",
    `- url: ${link.url}`,
    `- source: ${link.source}`,
    link.author ? `- author: ${link.author}` : "",
    link.reason ? `- reason: ${link.reason}` : "",
    "",
    clip(link.extracted || link.snippet, REPORT_WORKSPACE_EXTRACT_LIMIT) ||
      "（无正文）",
    "",
  ]
    .filter((row) => row !== "")
    .join("\n");
}

async function writeSourceBodies(cwd: string, links: ResearchLink[]) {
  const listed = listedSources(links);
  const sourcesDir = path.join(cwd, "sources");
  await mkdir(sourcesDir, { recursive: true });
  const files = listed.map((link, index) => ({
    link,
    file: sourceFileSlug(link, index),
  }));
  await writeFile(
    path.join(sourcesDir, "index.md"),
    sourcesIndexMarkdown(links, files),
    "utf8",
  );
  for (const { link, file } of files) {
    await writeFile(path.join(sourcesDir, file), sourceBodyMarkdown(link), "utf8");
  }
  return files;
}

const REPORT_STUB_MARK = "请按 plan.md 重写本文件";

export function isStubReport(markdown: string) {
  return markdown.includes(REPORT_STUB_MARK);
}

export function isReportWriteDone(status: string, markdown: string) {
  const body = markdown.trim();
  if (!body || isStubReport(body) || body.length < REPORT_MIN_CHARS) return false;
  return /^\s*DONE\s*$/im.test(status);
}

async function readOptional(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function withReportWorkspace<T>(
  sessionId: string,
  fn: (cwd: string) => Promise<T>,
): Promise<T> {
  await mkdir(REPORT_WORKSPACE_ROOT, { recursive: true, mode: 0o700 });
  const safe =
    sessionId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "session";
  const cwd = await mkdtemp(path.join(REPORT_WORKSPACE_ROOT, `${safe}-`));
  try {
    return await fn(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export async function seedReportWorkspace(
  cwd: string,
  state: ResearchState,
  messages: PromptMessage[],
  plan: ReportPlan | null,
) {
  await writeFile(
    path.join(cwd, "plan.md"),
    plan?.markdown?.trim()
      ? `# ${plan.title}\n\n${plan.markdown.trim()}\n`
      : "# 报告撰写计划\n\n（没有单独的撰写计划，请依据 research.json 自行组织。）\n",
    "utf8",
  );
  await writeFile(
    path.join(cwd, "research.json"),
    workspaceResearchJson(state, messages),
    "utf8",
  );
  const files = await writeSourceBodies(cwd, state.links);
  await writeFile(
    path.join(cwd, "sources.md"),
    [
      "# 资料阅读说明",
      "",
      "完整正文在 `sources/index.md` 与 `sources/*.md`。",
      "按撰写计划分批打开需要的文件（建议每批不超过 4 个），不要一次读完全库。",
      "",
      `当前共 ${files.length} 篇资料。`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(cwd, "report.md"),
    `# 研究报告\n\n（草稿：${REPORT_STUB_MARK}。）\n`,
    "utf8",
  );
  await writeFile(path.join(cwd, "STATUS.md"), "", "utf8");
}

export function reportFromMarkdown(
  markdown: string,
  extraKeywords?: string[],
): Report {
  const trimmed = markdown.trim();
  const { marks } = extractEqualsMarks(trimmed);
  return {
    markdown: trimmed,
    keywords: mergeKeywords(extraKeywords, marks),
  };
}

export function isThreadLostError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /thread not found|no such thread|unknown thread/i.test(message);
}

export async function writeReportInWorkspace(
  llm: ReportWriteLlm,
  state: ResearchState,
  messages: PromptMessage[],
  options: {
    sessionId: string;
    images?: MessageImage[];
    signal?: AbortSignal;
    onTurn?: (turn: number, maxTurns: number) => void | Promise<void>;
  },
): Promise<Report> {
  return withReportWorkspace(options.sessionId, async (cwd) => {
    await seedReportWorkspace(cwd, state, messages, state.reportPlan);
    let threadId: string | undefined;
    for (let turn = 0; turn < REPORT_WRITE_MAX_TURNS; turn += 1) {
      if (options.signal?.aborted) throw new Error("已停止");
      await options.onTurn?.(turn + 1, REPORT_WRITE_MAX_TURNS);
      const run = (id: string | undefined, fresh: boolean) =>
        llm.completeWorkspace(
          {
            // A fresh thread has no developer instructions yet, even mid-report.
            instructions: turn === 0 || fresh ? REPORT_WRITE_INSTRUCTIONS : "",
            text: turn === 0 ? REPORT_WRITE_TURN : REPORT_WRITE_CONTINUE,
            cwd,
            threadId: id,
            images: turn === 0 ? options.images : undefined,
          },
          options.signal,
        );
      let result: { text: string; threadId: string };
      try {
        result = await run(threadId, false);
      } catch (error) {
        // Codex restarted (or pruned the thread): workspace files hold all
        // progress, so continue the same report on a brand-new thread.
        if (!threadId || !isThreadLostError(error)) throw error;
        threadId = undefined;
        result = await run(undefined, true);
      }
      threadId = result.threadId || threadId;
      const markdown = await readOptional(path.join(cwd, "report.md"));
      const status = await readOptional(path.join(cwd, "STATUS.md"));
      if (isReportWriteDone(status, markdown)) {
        return reportFromMarkdown(markdown, state.reportPlan?.keywords);
      }
    }
    const markdown = await readOptional(path.join(cwd, "report.md"));
    const status = await readOptional(path.join(cwd, "STATUS.md"));
    const trimmed = markdown.trim();
    
    if (!trimmed) {
      throw new Error(
        `报告生成失败：达到 ${REPORT_WRITE_MAX_TURNS} 轮上限，但 report.md 为空。最后状态：${status.slice(0, 200) || "（无状态信息）"}`,
      );
    }
    
    if (isStubReport(trimmed)) {
      throw new Error(
        `报告生成未开始：达到 ${REPORT_WRITE_MAX_TURNS} 轮上限，但 report.md 仍是初始占位符。最后状态：${status.slice(0, 200) || "（无状态信息）"}`,
      );
    }
    
    if (trimmed.length < REPORT_MIN_CHARS) {
      // 如果有部分内容（超过500字符），返回部分报告而不是失败
      if (trimmed.length >= 500) {
        console.warn(
          `[Deep Radar] 报告未达到最小长度要求（${trimmed.length} / ${REPORT_MIN_CHARS} 字符），但返回部分内容`,
        );
        return reportFromMarkdown(markdown, state.reportPlan?.keywords);
      }
      
      throw new Error(
        `报告生成不完整：达到 ${REPORT_WRITE_MAX_TURNS} 轮上限，当前 ${trimmed.length} 字符（需要至少 ${REPORT_MIN_CHARS} 字符）。最后状态：${status.slice(0, 200) || "（无状态信息）"}。报告预览：${trimmed.slice(0, 500)}...`,
      );
    }
    
    return reportFromMarkdown(markdown, state.reportPlan?.keywords);
  });
}
