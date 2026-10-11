import { describe, expect, it } from "vitest";
import { MAX_GRILL_QUESTIONS } from "@/features/deep-radar/lib/constants";
import { reduce } from "@/features/deep-radar/lib/research-machine";
import {
  createInitialState,
  type LoopSnapshot,
  type Outline,
  type ReduceContext,
  type ResearchLink,
  type ResearchState,
} from "@/features/deep-radar/lib/research-types";

const settings: LoopSnapshot = { maxRounds: 3, sources: ["zhihu", "wechat"] };
const ctx: ReduceContext = { settings };

const outline: Outline = {
  goal: "弄清 DeepSeek 的训练路线：从公开材料还原数据、方法和对外口径。",
  objectives: ["弄清预训练数据从哪里来、是否可复现。"],
  exclusions: ["股价"],
};

function link(url: string, title = "t"): ResearchLink {
  return {
    url,
    normalizedUrl: url,
    title,
    source: "zhihu",
    cited: false,
    roundIndex: 0,
  };
}

function apply(
  state: ResearchState,
  events: Parameters<typeof reduce>[1][],
) {
  let current = state;
  const messages = [];
  for (const event of events) {
    const result = reduce(current, event, ctx);
    current = result.state;
    messages.push(...result.messages);
  }
  return { state: current, messages };
}

describe("research state machine", () => {
  it("starts grilling on the first user message", () => {
    const result = reduce(
      createInitialState(),
      { type: "USER_MESSAGE", text: "想研究 DeepSeek" },
      ctx,
    );
    expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe("grilling");
    expect(result.state.pendingCommands).toEqual([{ type: "codexGrill" }]);
    expect(result.messages[0]).toMatchObject({
      role: "user",
      content: "想研究 DeepSeek",
    });
  });

  it("accepts an image-only user message", () => {
    const result = reduce(
      createInitialState(),
      {
        type: "USER_MESSAGE",
        text: "  ",
        images: [
          {
            id: "11111111-1111-1111-1111-111111111111.jpg",
            name: "shot.jpg",
            url: "/api/research/images/11111111-1111-1111-1111-111111111111.jpg",
            path: "/tmp/shot.jpg",
            mimeType: "image/jpeg",
          },
        ],
      },
      ctx,
    );
    expect(result.error).toBeUndefined();
    expect(result.state.pendingCommands).toEqual([{ type: "codexGrill" }]);
    expect(result.messages[0]).toMatchObject({
      role: "user",
      content: "",
      images: [{ name: "shot.jpg" }],
    });
  });

  it("asks one grill question at a time", () => {
    const started = reduce(
      createInitialState(),
      { type: "USER_MESSAGE", text: "想研究 DeepSeek" },
      ctx,
    ).state;
    const asked = reduce(
      started,
      { type: "GRILL_RESULT", done: false, question: "你更关心训练还是推理？" },
      ctx,
    );
    expect(asked.state.grillCount).toBe(1);
    expect(asked.state.pendingCommands).toEqual([]);
    expect(asked.messages).toEqual([
      {
        role: "assistant",
        kind: "text",
        content: "你更关心训练还是推理？",
      },
    ]);
  });

  it("skips remaining grill questions when the user asks for the outline", () => {
    let state = createInitialState();
    state = reduce(state, { type: "USER_MESSAGE", text: "想研究" }, ctx).state;
    state = reduce(
      state,
      { type: "GRILL_RESULT", done: false, question: "范围是？" },
      ctx,
    ).state;
    const result = reduce(
      state,
      { type: "USER_MESSAGE", text: "直接出纲要" },
      ctx,
    );
    expect(result.state.pendingCommands).toEqual([{ type: "codexOutline" }]);
  });

  it("skips grill immediately when skipGrill is set", () => {
    const result = reduce(
      createInitialState(),
      { type: "USER_MESSAGE", text: "研究 DeepSeek 的训练成本", skipGrill: true },
      ctx,
    );
    expect(result.state.pendingCommands).toEqual([{ type: "codexOutline" }]);
    expect(result.state.phase).toBe("grilling");
  });

  it("forces the outline after the grill cap", () => {
    const state = createInitialState();
    state.phase = "grilling";
    state.grillCount = MAX_GRILL_QUESTIONS;
    const result = reduce(
      state,
      { type: "USER_MESSAGE", text: "就这些" },
      ctx,
    );
    expect(result.state.pendingCommands).toEqual([{ type: "codexOutline" }]);
  });

  it("drafts an outline card instead of a separate goal approval", () => {
    const state = createInitialState();
    state.phase = "grilling";
    const result = reduce(
      state,
      { type: "OUTLINE_DRAFTED", outline },
      ctx,
    );
    expect(result.state.phase).toBe("outline_pending");
    expect(result.messages[0]?.kind).toBe("outline");
    expect(result.messages[0]?.payload).toEqual(outline);
  });

  it("snapshots settings on outline approval and starts the loop", () => {
    const state = createInitialState();
    state.phase = "outline_pending";
    state.pendingOutline = outline;
    const result = reduce(state, { type: "APPROVE_OUTLINE" }, {
      settings: { maxRounds: 2, sources: ["zhihu"] },
    });
    expect(result.state.phase).toBe("looping");
    expect(result.state.snapshot).toEqual({
      maxRounds: 2,
      sources: ["zhihu"],
    });
    expect(result.state.outline).toEqual(outline);
    expect(result.state.pendingCommands).toEqual([{ type: "codexQuery" }]);
  });

  it("stops in-flight grill reasoning and drops the late question", () => {
    const state = createInitialState();
    state.phase = "grilling";
    state.pendingCommands = [{ type: "codexGrill" }];
    const stopped = reduce(state, { type: "STOP" }, ctx);
    expect(stopped.state.phase).toBe("grilling");
    expect(stopped.state.pendingCommands).toEqual([]);
    expect(stopped.state.stopRequested).toBe(true);
    const late = reduce(
      stopped.state,
      { type: "GRILL_RESULT", done: false, question: "还要补充范围吗？" },
      ctx,
    );
    expect(late.messages).toEqual([]);
    expect(late.state.phase).toBe("grilling");
    expect(late.state.pendingCommands).toEqual([]);
  });

  it("discards an in-flight round when stopped", () => {
    const state = createInitialState();
    state.phase = "looping";
    state.snapshot = settings;
    state.draftRound = {
      query: "DeepSeek 训练",
      step: "searching",
      hits: [],
    };
    const result = reduce(state, { type: "STOP" }, ctx);
    expect(result.state.phase).toBe("paused");
    expect(result.state.draftRound).toBeNull();
    expect(result.state.rounds).toHaveLength(0);
    expect(result.state.pendingCommands).toEqual([]);
  });

  it("ignores late search results after stop", () => {
    const state = createInitialState();
    state.phase = "paused";
    state.stopRequested = true;
    const result = reduce(
      state,
      { type: "SEARCH_DONE", hits: [link("https://example.com/a")] },
      ctx,
    );
    expect(result.state.phase).toBe("paused");
    expect(result.state.pendingCommands).toEqual([]);
  });

  it("runs another query after a round unless the cap or early-stop hits", () => {
    const state = createInitialState();
    state.phase = "looping";
    state.snapshot = settings;
    state.draftRound = {
      query: "q1",
      step: "summarizing",
      hits: [link("https://zhihu.com/p/1", "A")],
      cited: [{ url: "https://zhihu.com/p/1", reason: "核心" }],
      unused: [],
    };
    const cont = reduce(
      state,
      {
        type: "ROUND_FINDINGS",
        findings: "发现一",
        gaps: "还缺成本",
        keywords: ["成本"],
        shouldStop: false,
      },
      ctx,
    );
    expect(cont.state.phase).toBe("looping");
    expect(cont.state.rounds).toHaveLength(1);
    expect(cont.state.pendingCommands).toEqual([{ type: "codexQuery" }]);
    expect(cont.messages[0]?.kind).toBe("round");
    expect(cont.state.rounds[0]?.keywords).toEqual(["成本"]);

    const early = reduce(
      { ...state, draftRound: { ...state.draftRound } },
      {
        type: "ROUND_FINDINGS",
        findings: "够了",
        gaps: "",
        shouldStop: true,
      },
      ctx,
    );
    expect(early.state.phase).toBe("reporting");
    expect(early.state.pendingCommands).toEqual([{ type: "codexReportPlan" }]);
  });

  it("caps the current loop by the snapshot maxRounds", () => {
    const state = createInitialState();
    state.phase = "looping";
    state.snapshot = { maxRounds: 1, sources: ["zhihu", "wechat"] };
    state.draftRound = {
      query: "q1",
      step: "summarizing",
      hits: [link("https://zhihu.com/p/1")],
      cited: [{ url: "https://zhihu.com/p/1", reason: "核心" }],
      unused: [],
    };
    const result = reduce(
      state,
      {
        type: "ROUND_FINDINGS",
        findings: "第一轮",
        gaps: "还有",
        shouldStop: false,
      },
      ctx,
    );
    expect(result.state.phase).toBe("reporting");
  });

  it("rejects chatting while a loop is running", () => {
    const state = createInitialState();
    state.phase = "looping";
    const result = reduce(
      state,
      { type: "USER_MESSAGE", text: "插一句" },
      ctx,
    );
    expect(result.error).toBe("loop_busy");
    expect(result.messages).toHaveLength(0);
    expect(result.state.phase).toBe("looping");
  });

  it("continues from pause and reports from pause", () => {
    const state = createInitialState();
    state.phase = "paused";
    state.snapshot = settings;
    const cont = reduce(state, { type: "CONTINUE" }, ctx);
    expect(cont.state.phase).toBe("looping");
    expect(cont.state.pendingCommands).toEqual([{ type: "codexQuery" }]);

    const report = reduce(state, { type: "GENERATE_REPORT" }, ctx);
    expect(report.state.phase).toBe("reporting");
    expect(report.state.pendingCommands).toEqual([{ type: "codexReportPlan" }]);
  });

  it("resumes report write when a plan already exists", () => {
    const state = createInitialState();
    state.phase = "paused";
    state.snapshot = settings;
    state.reportPlan = {
      title: "怎么写",
      markdown: "## 结构\n写结论。",
    };
    const cont = reduce(state, { type: "CONTINUE" }, ctx);
    expect(cont.state.phase).toBe("reporting");
    expect(cont.state.pendingCommands).toEqual([{ type: "codexReportWrite" }]);
    expect(cont.state.reportPlan?.title).toBe("怎么写");

    const report = reduce(state, { type: "GENERATE_REPORT" }, ctx);
    expect(report.state.pendingCommands).toEqual([{ type: "codexReportWrite" }]);
  });

  it("opens a new loop after a supplemental outline is approved", () => {
    let state = createInitialState();
    state.phase = "ready";
    state.rounds = [
      {
        index: 0,
        query: "old",
        findings: "old",
        gaps: "",
        citedUrls: [],
        unusedUrls: [],
      },
    ];
    state = reduce(
      state,
      { type: "FOLLOWUP_NEED_SEARCH", outline },
      ctx,
    ).state;
    expect(state.phase).toBe("supplement_pending");
    const approved = reduce(state, { type: "APPROVE_OUTLINE" }, ctx);
    expect(approved.state.phase).toBe("looping");
    expect(approved.state.loopStartIndex).toBe(1);
    expect(approved.state.rounds).toHaveLength(1);
  });

  it("continues a paused loop when followup resolves to CONTINUE", () => {
    const state = createInitialState();
    state.phase = "paused";
    state.snapshot = settings;
    state.outline = {
      goal: "弄清训练路线",
      objectives: ["数据从哪来"],
      exclusions: [],
    };
    const cont = reduce(state, { type: "CONTINUE" }, ctx);
    expect(cont.state.phase).toBe("looping");
    expect(cont.state.pendingCommands[0]?.type).toBe("codexQuery");
    expect(cont.state.stopRequested).toBe(false);
  });

  it("stores the final report in the conversation", () => {
    const state = createInitialState();
    state.phase = "reporting";
    const report = {
      markdown: "# 研究报告\n\n数据是核心。更可信的是工程向观点。下一步读源论文。",
    };
    const result = reduce(state, { type: "REPORT_DONE", report }, ctx);
    expect(result.state.phase).toBe("ready");
    expect(result.messages[0]?.kind).toBe("report");
    expect(result.state.report).toEqual(report);
  });

  it("shows the writing plan then queues the workspace report loop", () => {
    const state = createInitialState();
    state.phase = "reporting";
    const plan = {
      title: "怎么写这篇报告",
      markdown: "## 结构\n- 结论\n- 证据",
    };
    const result = reduce(state, { type: "REPORT_PLAN_DRAFTED", plan }, ctx);
    expect(result.state.phase).toBe("reporting");
    expect(result.state.reportPlan).toEqual(plan);
    expect(result.state.pendingCommands).toEqual([{ type: "codexReportWrite" }]);
    expect(result.messages[0]?.kind).toBe("report_plan");
  });

  it("walks a happy-path loop from search to findings", () => {
    const { state, messages } = apply(createInitialState(), [
      { type: "USER_MESSAGE", text: "研究 DeepSeek" },
      { type: "GRILL_RESULT", done: true },
      { type: "OUTLINE_DRAFTED", outline },
      { type: "APPROVE_OUTLINE" },
      { type: "QUERY_GENERATED", query: "DeepSeek 训练路线" },
      {
        type: "SEARCH_DONE",
        hits: [link("https://zhuanlan.zhihu.com/p/1", "训练")],
      },
      {
        type: "FILTER_DONE",
        cited: [{ url: "https://zhuanlan.zhihu.com/p/1", reason: "讲架构" }],
        unused: [],
      },
      {
        type: "EXTRACT_DONE",
        extracts: { "https://zhuanlan.zhihu.com/p/1": "正文" },
      },
      {
        type: "ROUND_FINDINGS",
        findings: "架构来自公开论文",
        gaps: "",
        shouldStop: true,
      },
    ]);
    expect(state.phase).toBe("reporting");
    expect(state.links[0]?.extracted).toBe("正文");
    expect(state.links[0]?.cited).toBe(true);
    expect(messages.some((m) => m.kind === "round")).toBe(true);
    expect(state.pendingCommands).toEqual([{ type: "codexReportPlan" }]);
    expect(state.rounds[0]?.query).toBe("DeepSeek 训练路线");
    expect(state.rounds[0]?.queryZh).toBe("DeepSeek 训练路线");
  });

  it("lets fetch_page open a GitHub subpage after extracting a repo", () => {
    const repo = "https://github.com/Young-Lord/cs336-2026-notes";
    const syllabus =
      "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/04-syllabus.md";
    const { state } = apply(createInitialState(), [
      { type: "USER_MESSAGE", text: "研究 CS336" },
      { type: "GRILL_RESULT", done: true },
      { type: "OUTLINE_DRAFTED", outline },
      { type: "APPROVE_OUTLINE" },
      { type: "QUERY_GENERATED", query: "CS336 syllabus" },
      {
        type: "SEARCH_DONE",
        hits: [link(repo, "cs336 notes")],
      },
      {
        type: "FILTER_DONE",
        cited: [{ url: repo, reason: "仓库目录" }],
        unused: [],
      },
      {
        type: "EXTRACT_DONE",
        extracts: { [repo]: "课程仓库" },
        pages: {
          [repo]: {
            title: "cs336-2026-notes",
            links: [{ url: syllabus, title: "04-syllabus.md" }],
          },
        },
      },
    ]);
    expect(state.pendingCommands).toEqual([{ type: "codexExplore" }]);
    expect(state.draftRound?.hits[0]?.childLinks?.[0]?.url).toBe(syllabus);

    const explored = reduce(
      state,
      {
        type: "EXPLORE_DECIDED",
        urls: [syllabus],
        reason: "读课程大纲",
      },
      ctx,
    );
    expect(explored.state.pendingCommands).toEqual([
      { type: "extract", urls: [syllabus] },
    ]);
    expect(explored.state.draftRound?.hits).toHaveLength(2);
    expect(explored.state.draftRound?.cited?.map((item) => item.url)).toContain(
      syllabus,
    );

    const afterSubpage = reduce(
      explored.state,
      {
        type: "EXTRACT_DONE",
        extracts: { [syllabus]: "课程大纲正文" },
        pages: {
          [syllabus]: {
            title: "syllabus",
            links: [
              {
                url: "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/05-math.md",
                title: "05-math.md",
              },
            ],
          },
        },
      },
      ctx,
    );
    expect(afterSubpage.state.pendingCommands).toEqual([{ type: "codexExplore" }]);
    expect(afterSubpage.state.draftRound?.step).toBe("exploring");
  });

  it("stops the fetch_page loop after 100 iterations", () => {
    const repo = "https://github.com/Young-Lord/cs336-2026-notes";
    const { state } = apply(createInitialState(), [
      { type: "USER_MESSAGE", text: "研究 CS336" },
      { type: "GRILL_RESULT", done: true },
      { type: "OUTLINE_DRAFTED", outline },
      { type: "APPROVE_OUTLINE" },
      { type: "QUERY_GENERATED", query: "CS336 syllabus" },
      { type: "SEARCH_DONE", hits: [link(repo, "cs336 notes")] },
      {
        type: "FILTER_DONE",
        cited: [{ url: repo, reason: "仓库目录" }],
        unused: [],
      },
    ]);
    const draft = state.draftRound;
    expect(draft).toBeTruthy();
    const capped = reduce(
      {
        ...state,
        draftRound: { ...draft!, exploreCount: 100 },
      },
      {
        type: "EXTRACT_DONE",
        extracts: { [repo]: "课程仓库" },
      },
      ctx,
    );
    expect(capped.state.pendingCommands).toEqual([{ type: "codexFindings" }]);
    expect(capped.state.draftRound?.step).toBe("summarizing");
  });

  it("keeps Chinese and English queries on the search command", () => {
    const { state } = apply(createInitialState(), [
      { type: "USER_MESSAGE", text: "研究 DeepSeek" },
      { type: "GRILL_RESULT", done: true },
      { type: "OUTLINE_DRAFTED", outline },
      { type: "APPROVE_OUTLINE" },
      {
        type: "QUERY_GENERATED",
        queryZh: "大模型没有秘密 杨植麟",
        queryEn: "large language models have no secrets Yang Zhilin",
      },
    ]);
    expect(state.pendingCommands).toEqual([
      {
        type: "search",
        query: "大模型没有秘密 杨植麟",
        queryZh: "大模型没有秘密 杨植麟",
        queryEn: "large language models have no secrets Yang Zhilin",
      },
    ]);
    expect(state.draftRound?.queryZh).toBe("大模型没有秘密 杨植麟");
    expect(state.draftRound?.queryEn).toBe(
      "large language models have no secrets Yang Zhilin",
    );
  });
});
