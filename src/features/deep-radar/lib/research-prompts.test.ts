import { describe, expect, it } from "vitest";
import {
  EXPLORE_INSTRUCTIONS,
  FINDINGS_INSTRUCTIONS,
  GRILL_INSTRUCTIONS,
  QUERY_INSTRUCTIONS,
  REPORT_PLAN_INSTRUCTIONS,
  REPORT_WRITE_CONTINUE,
  REPORT_WRITE_INSTRUCTIONS,
  REPORT_WRITE_TURN,
  dialogueForPrompt,
  snapshotPrompt,
} from "@/features/deep-radar/lib/research-prompts";
import { createInitialState } from "@/features/deep-radar/lib/research-types";

describe("research prompts", () => {
  it("puts the user utterance into dialogue so the model can read it", () => {
    const prompt = snapshotPrompt(createInitialState(), "next", [
      {
        role: "user",
        kind: "text",
        content:
          "kimi和腾讯姚顺宇等说过大模型没有秘密，我希望找到能佐证这个观点的资料。",
      },
    ]);
    expect(prompt).toContain("用户：kimi和腾讯姚顺宇等说过大模型没有秘密");
    expect(GRILL_INSTRUCTIONS).toContain("禁止再问");
    expect(GRILL_INSTRUCTIONS).toContain("核心问题是什么");
    expect(QUERY_INSTRUCTIONS).toContain("targetQuestion");
    expect(QUERY_INSTRUCTIONS).toContain("queryZh");
    expect(QUERY_INSTRUCTIONS).toContain("queryEn");
    expect(FINDINGS_INSTRUCTIONS).toContain("完整段落");
    expect(FINDINGS_INSTRUCTIONS).toContain("keywords");
    expect(FINDINGS_INSTRUCTIONS).toContain("==重点词==");
    expect(FINDINGS_INSTRUCTIONS).toContain("read_sources");
    expect(FINDINGS_INSTRUCTIONS).toContain("submit_findings");
    expect(FINDINGS_INSTRUCTIONS).not.toContain("便于扫读的笔记");
    expect(REPORT_PLAN_INSTRUCTIONS).toContain("撰写计划");
    expect(REPORT_PLAN_INSTRUCTIONS).toContain("Deep Research");
    expect(REPORT_PLAN_INSTRUCTIONS).toContain("read_sources");
    expect(REPORT_PLAN_INSTRUCTIONS).toContain("submit_plan");
    expect(REPORT_WRITE_INSTRUCTIONS).toContain("report.md");
    expect(REPORT_WRITE_INSTRUCTIONS).toContain("完整、可独立阅读");
    expect(REPORT_WRITE_INSTRUCTIONS).toContain("禁止「行动路线」口吻");
    expect(REPORT_WRITE_INSTRUCTIONS).toContain("sources/index.md");
    expect(REPORT_WRITE_INSTRUCTIONS).toContain("sources/*.md");
    expect(REPORT_WRITE_INSTRUCTIONS).toContain("每一轮 Codex 回合只推进有限进度");
    expect(REPORT_WRITE_TURN).toContain("只搭骨架");
    expect(REPORT_WRITE_TURN).toContain("NOT_DONE");
    expect(REPORT_WRITE_CONTINUE).toContain("至多 4 个");
    expect(REPORT_WRITE_INSTRUCTIONS).not.toContain("学习笔记口吻");
    expect(REPORT_WRITE_INSTRUCTIONS).not.toContain("可用 emoji 做分点");
    expect(EXPLORE_INSTRUCTIONS).toContain("fetch_page");
    expect(EXPLORE_INSTRUCTIONS).toContain("每次 fetch_page 最多 32 个 url");
    expect(EXPLORE_INSTRUCTIONS).toContain("最多 100 次");
  });

  it("caps filter candidates so a large hit list does not blow the prompt", () => {
    const state = createInitialState();
    state.draftRound = {
      query: "q",
      step: "filtering",
      hits: Array.from({ length: 80 }, (_, i) => ({
        url: `https://example.com/${i}`,
        normalizedUrl: `https://example.com/${i}`,
        title: `t${i}`,
        source: "zhihu" as const,
        snippet: "x".repeat(500),
        cited: false,
        roundIndex: 0,
      })),
    };
    const prompt = snapshotPrompt(state);
    expect(prompt).toContain('"hitTotal": 80');
    expect(prompt.match(/example\.com/g)?.length).toBe(48);
  });

  it("keeps extracted bodies when summarizing a round", () => {
    const state = createInitialState();
    state.draftRound = {
      query: "q",
      step: "summarizing",
      hits: [
        {
          url: "https://example.com/a",
          normalizedUrl: "https://example.com/a",
          title: "原文",
          source: "wechat",
          cited: true,
          roundIndex: 0,
          extracted: "姚顺雨说今天做大模型没什么秘密",
        },
      ],
    };
    expect(snapshotPrompt(state)).toContain("姚顺雨说今天做大模型没什么秘密");
  });

  it("omits extracted bodies and exposes sourceCatalog when includeExtracted is false", () => {
    const longBody = `姚顺雨说今天做大模型没什么秘密。${"细节。".repeat(80)}`;
    const state = createInitialState();
    state.draftRound = {
      query: "q",
      step: "summarizing",
      hits: [
        {
          url: "https://example.com/a",
          normalizedUrl: "https://example.com/a",
          title: "原文",
          source: "wechat",
          cited: true,
          roundIndex: 0,
          snippet: "搜索摘要一句",
          extracted: longBody,
        },
      ],
    };
    const prompt = snapshotPrompt(state, undefined, [], { includeExtracted: false });
    expect(prompt).not.toContain(longBody);
    expect(prompt).toContain("搜索摘要一句");
    expect(prompt).toContain('"sourceCatalog"');
    expect(prompt).toContain('"hasBody": true');
    expect(prompt).toContain('"readSourcesMaxPerBatch": 4');
    expect(prompt).not.toMatch(/"extracted":\s*"/);
  });

  it("includes outline and round cards in the full dialogue", () => {
    const text = dialogueForPrompt([
      { role: "user", kind: "text", content: "想查训练数据" },
      {
        role: "assistant",
        kind: "outline",
        content: "弄清数据来源",
        payload: { goal: "弄清数据来源", subquestions: [], exclusions: [] },
      },
    ]);
    expect(text).toContain("[outline]");
    expect(text).toContain("弄清数据来源");
  });

  it("mentions attached images in the dialogue", () => {
    const text = dialogueForPrompt([
      {
        role: "user",
        kind: "text",
        content: "",
        images: [{ id: "a.jpg", name: "白板.jpg" }],
      },
    ]);
    expect(text).toContain("白板.jpg");
    expect(text).toContain("附图");
  });
});
