import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_MIN_CHARS, REPORT_WRITE_MAX_TURNS } from "@/features/deep-radar/lib/constants";
import { createInitialState } from "@/features/deep-radar/lib/research-types";
import {
  isReportWriteDone,
  seedReportWorkspace,
  writeReportInWorkspace,
} from "@/features/deep-radar/lib/research-report-write";

const LONG_ENOUGH_REPORT = `# 研究报告

这是一份足够长的终稿，用来确认写作循环可以结束。报告需要覆盖研究目标、关键证据、分歧与局限，并以完整段落展开，而不是关键词速览。

${"正文补充。".repeat(Math.ceil(REPORT_MIN_CHARS / 5))}
`;

describe("research report write loop", () => {
  it("treats a short draft as unfinished even if STATUS says DONE", () => {
    expect(isReportWriteDone("DONE\n", "# 短")).toBe(false);
    expect(isReportWriteDone("DONE\n", LONG_ENOUGH_REPORT)).toBe(true);
  });

  it("doubles report-write turn budget to 32", () => {
    expect(REPORT_WRITE_MAX_TURNS).toBe(32);
  });

  it("seeds sources as an index plus per-file bodies", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "deep-radar-seed-"));
    try {
      const longBody = `姚顺雨说今天做大模型没什么秘密。${"细节。".repeat(80)}`;
      const state = createInitialState();
      state.links = [
        {
          url: "https://example.com/a",
          normalizedUrl: "https://example.com/a",
          title: "原文 A",
          source: "wechat",
          cited: true,
          roundIndex: 0,
          snippet: "搜索摘要",
          extracted: longBody,
        },
        {
          url: "https://example.com/only-snippet",
          normalizedUrl: "https://example.com/only-snippet",
          title: "仅摘要",
          source: "zhihu",
          cited: true,
          roundIndex: 0,
          snippet: "没有正文的条目不应落盘",
        },
      ];
      await seedReportWorkspace(cwd, state, [], {
        title: "计划",
        markdown: "写长文",
      });
      const guide = await readFile(join(cwd, "sources.md"), "utf8");
      const index = await readFile(join(cwd, "sources", "index.md"), "utf8");
      const research = await readFile(join(cwd, "research.json"), "utf8");
      expect(guide).toContain("sources/index.md");
      expect(index).toContain("https://example.com/a");
      expect(index).not.toContain("https://example.com/only-snippet");
      expect(index).toContain("sources/");
      expect(research).not.toContain(longBody);
      // Bodies live in sources/*.md — research.json keeps slim links only.
      expect(research).not.toContain("sourceCatalog");
      expect(research).toContain('"hasBody": true');
      const bodyName = index.match(/sources\/(\d{3}-[^|\s]+\.md)/)?.[1];
      expect(bodyName).toBeTruthy();
      const body = await readFile(join(cwd, "sources", bodyName!), "utf8");
      expect(body).toContain(longBody);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("keeps the same temp markdown across Codex turns until STATUS is DONE", async () => {
    let turns = 0;
    const report = await writeReportInWorkspace(
      {
        async completeWorkspace({ cwd, threadId }) {
          turns += 1;
          if (turns === 1) {
            await writeFile(
              join(cwd, "report.md"),
              "# 研究报告\n\n草稿还太短。\n",
              "utf8",
            );
            return { text: "draft", threadId: threadId || "t1" };
          }
          await writeFile(join(cwd, "report.md"), LONG_ENOUGH_REPORT, "utf8");
          await writeFile(join(cwd, "STATUS.md"), "DONE\n", "utf8");
          return { text: "done", threadId: threadId || "t1" };
        },
      },
      {
        ...createInitialState(),
        reportPlan: {
          title: "怎么写",
          markdown: "## 结构\n写结论。",
        },
      },
      [],
      { sessionId: "s-write-loop" },
    );
    expect(turns).toBe(2);
    expect(report.markdown).toContain("足够长的终稿");
  });

  it("restarts on a new thread when Codex lost the old one", async () => {
    const seen: Array<{ threadId?: string; instructions: string }> = [];
    const report = await writeReportInWorkspace(
      {
        async completeWorkspace({ cwd, threadId, instructions }) {
          seen.push({ threadId, instructions });
          if (seen.length === 1) {
            await writeFile(join(cwd, "report.md"), "# 研究报告\n\n草稿。\n", "utf8");
            return { text: "draft", threadId: "t-old" };
          }
          if (threadId === "t-old") {
            throw new Error("thread not found: t-old");
          }
          await writeFile(join(cwd, "report.md"), LONG_ENOUGH_REPORT, "utf8");
          await writeFile(join(cwd, "STATUS.md"), "DONE\n", "utf8");
          return { text: "done", threadId: "t-new" };
        },
      },
      {
        ...createInitialState(),
        reportPlan: { title: "怎么写", markdown: "## 结构\n写结论。" },
      },
      [],
      { sessionId: "s-thread-lost" },
    );
    expect(seen.map((row) => row.threadId)).toEqual([undefined, "t-old", undefined]);
    expect(seen[2]?.instructions).toBeTruthy();
    expect(report.markdown).toContain("足够长的终稿");
  });
});
