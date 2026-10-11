import { describe, expect, it } from "vitest";
import {
  findingsNode,
  grillNode,
  parseFollowupDecision,
  queryNode,
  reportPlanNode,
} from "@/features/deep-radar/lib/research-nodes";
import { createInitialState } from "@/features/deep-radar/lib/research-types";
import { FOLLOWUP_INSTRUCTIONS } from "@/features/deep-radar/lib/research-prompts";

describe("research nodes", () => {
  it("exposes continue_research tool for interrupted deep research", () => {
    expect(FOLLOWUP_INSTRUCTIONS).toContain("continue_research");
    expect(FOLLOWUP_INSTRUCTIONS).toContain("generate_report");
    expect(FOLLOWUP_INSTRUCTIONS).toContain("function tools");
  });

  it("parses continue_research only when phase is paused", () => {
    expect(
      parseFollowupDecision(
        JSON.stringify({ tool: "continue_research", reason: "用户要继续" }),
        "paused",
      ),
    ).toEqual({ kind: "continue" });
    expect(
      parseFollowupDecision(
        JSON.stringify({ tool: "continue_research" }),
        "ready",
      ).kind,
    ).toBe("answer");
    expect(
      parseFollowupDecision(
        JSON.stringify({ tool: "generate_report" }),
        "paused",
      ),
    ).toEqual({ kind: "generate_report" });
    expect(
      parseFollowupDecision(
        JSON.stringify({ tool: "answer", text: "可以这样看。" }),
        "ready",
      ),
    ).toEqual({ kind: "answer", text: "可以这样看。" });
  });
  it("sends the user message to the model instead of an empty snapshot", async () => {
    let prompt = "";
    const result = await grillNode(
      {
        async complete(_instructions, text) {
          prompt = text;
          return JSON.stringify({
            done: false,
            question: "你更想要原文语境，还是业界对这句话的评论？",
          });
        },
      },
      createInitialState(),
      [
        {
          role: "user",
          kind: "text",
          content:
            "kimi和腾讯姚顺宇等说过大模型没有秘密，我希望找到能佐证这个观点的资料。",
        },
      ],
    );
    expect(prompt).toContain("大模型没有秘密");
    expect(prompt).toContain("用户：");
    expect(result.question).toContain("原文语境");
  });

  it("sends the full dialogue, including outline cards, into later research nodes", async () => {
    let prompt = "";
    await queryNode(
      {
        async complete(_instructions, text) {
          prompt = text;
          return JSON.stringify({ query: "大模型 没有秘密 原文" });
        },
      },
      createInitialState(),
      [
        {
          role: "user",
          kind: "text",
          content: "kimi和姚顺宇说大模型没有秘密",
        },
        {
          role: "assistant",
          kind: "outline",
          content: "验证这句话",
          payload: { goal: "验证这句话", subquestions: [], exclusions: [] },
        },
      ],
    );
    expect(prompt).toContain("kimi和姚顺宇说大模型没有秘密");
    expect(prompt).toContain("[outline]");
    expect(prompt).toContain("验证这句话");
  });

  it("returns bilingual search terms and a target question", async () => {
    const result = await queryNode(
      {
        async complete() {
          return JSON.stringify({
            queryZh: "大模型没有秘密 原文",
            queryEn: "large models have no secrets original quote",
            targetQuestion: "这句话最早是在什么语境下说的？",
          });
        },
      },
      createInitialState(),
    );
    expect(result).toEqual({
      query: "大模型没有秘密 原文",
      queryZh: "大模型没有秘密 原文",
      queryEn: "large models have no secrets original quote",
      targetQuestion: "这句话最早是在什么语境下说的？",
    });
  });

  it("lets findings open sources in batches before submitting", async () => {
    let calls = 0;
    const longBody = `姚顺雨说今天做大模型没什么秘密。${"证据段落。".repeat(40)}`;
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
          snippet: "搜索摘要",
          extracted: longBody,
        },
      ],
    };
    const result = await findingsNode(
      {
        async complete(_instructions, prompt) {
          calls += 1;
          if (calls === 1) {
            expect(prompt).not.toContain(longBody);
            expect(prompt).toContain("sourceCatalog");
            return JSON.stringify({
              tool: "read_sources",
              urls: ["https://example.com/a"],
              reason: "核对原文",
            });
          }
          expect(prompt).toContain(longBody);
          return JSON.stringify({
            tool: "submit_findings",
            summary: "原文确认了主张。",
            analysis: "本轮目标已覆盖。",
            keywords: ["姚顺雨"],
            shouldStop: true,
          });
        },
      },
      state,
    );
    expect(calls).toBe(2);
    expect(result.summary).toContain("原文确认");
    expect(result.shouldStop).toBe(true);
  });

  it("lets report plan read sources before submit_plan", async () => {
    let calls = 0;
    const longBody = `社区认为这句话被过度简化了。${"评论细节。".repeat(40)}`;
    const state = createInitialState();
    state.links = [
      {
        url: "https://example.com/b",
        normalizedUrl: "https://example.com/b",
        title: "评论",
        source: "zhihu",
        cited: true,
        roundIndex: 0,
        snippet: "知乎摘要",
        extracted: longBody,
      },
    ];
    const plan = await reportPlanNode(
      {
        async complete(_instructions, prompt) {
          calls += 1;
          if (calls === 1) {
            expect(prompt).not.toContain(longBody);
            return JSON.stringify({
              tool: "read_sources",
              urls: ["https://example.com/b"],
            });
          }
          expect(prompt).toContain(longBody);
          return JSON.stringify({
            tool: "submit_plan",
            title: "怎么写",
            markdown: "## 结构\n写结论与反证。",
            keywords: ["反证"],
          });
        },
      },
      state,
    );
    expect(calls).toBe(2);
    expect(plan.title).toBe("怎么写");
    expect(plan.markdown).toContain("反证");
  });
});
