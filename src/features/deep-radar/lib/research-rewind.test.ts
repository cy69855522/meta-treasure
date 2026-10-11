import { describe, expect, it } from "vitest";
import { createInitialState, type ChatMessage } from "@/features/deep-radar/lib/research-types";
import {
  cutIndex,
  lostUserQuestion,
  appendComposerDraft,
  rebuildStateFromMessages,
  restoreAfterCut,
  resumeReplay,
  rewindActionOptions,
} from "@/features/deep-radar/lib/research-rewind";

function msg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "kind" | "role" | "content">,
): ChatMessage {
  return {
    sessionId: "s1",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("research rewind", () => {
  it("auto-continues when rewinding an assistant answer, not a user question", () => {
    expect(rewindActionOptions("rewind", { role: "assistant" })).toEqual({
      keepMessage: false,
      resume: true,
    });
    expect(rewindActionOptions("rewind", { role: "user" })).toEqual({
      keepMessage: false,
      resume: false,
    });
    expect(rewindActionOptions("retry", { role: "assistant" })).toEqual({
      keepMessage: false,
      resume: true,
    });
    expect(rewindActionOptions("retry", { role: "user" })).toEqual({
      keepMessage: true,
      resume: true,
    });
  });

  it("cuts before the target message unless keepMessage is set", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(cutIndex(rows, "b", false)).toBe(1);
    expect(cutIndex(rows, "b", true)).toBe(2);
  });

  it("restores the first deleted user question for the composer", () => {
    const rows = [
      msg({ id: "u1", role: "user", kind: "text", content: "第一问" }),
      msg({ id: "a1", role: "assistant", kind: "text", content: "追问" }),
      msg({ id: "u2", role: "user", kind: "text", content: "补充范围" }),
    ];
    expect(lostUserQuestion(rows, "u2")).toBe("补充范围");
    expect(lostUserQuestion(rows, "a1")).toBe("补充范围");
    expect(lostUserQuestion(rows, "u1")).toBe("第一问");
    expect(appendComposerDraft("", "第一问")).toBe("第一问");
    expect(appendComposerDraft("已有草稿", "第一问")).toBe("已有草稿\n第一问");
  });

  it("restores idle when every message is removed", () => {
    const state = restoreAfterCut([], false);
    expect(state).toEqual(createInitialState());
  });

  it("rebuilds outline_pending from remaining cards when checkpoints are missing", () => {
    const state = rebuildStateFromMessages([
      msg({
        id: "u1",
        role: "user",
        kind: "text",
        content: "研究大模型有没有秘密",
      }),
      msg({
        id: "o1",
        role: "assistant",
        kind: "outline",
        content: "验证没有秘密",
        payload: {
          goal: "验证没有秘密",
          subquestions: [],
          exclusions: [],
        },
      }),
    ]);
    expect(state.phase).toBe("outline_pending");
    expect(state.pendingOutline?.goal).toBe("验证没有秘密");
  });

  it("replays the assistant command for a cut grill or outline", () => {
    const user = msg({
      id: "u1",
      role: "user",
      kind: "text",
      content: "想研究 DeepSeek",
    });
    const grill = msg({
      id: "a1",
      role: "assistant",
      kind: "text",
      content: "你更关心数据还是推理？",
    });
    const outlined = msg({
      id: "o1",
      role: "assistant",
      kind: "outline",
      content: "弄清训练路线",
      payload: { goal: "弄清训练路线", objectives: [], exclusions: [] },
    });
    const grilled = resumeReplay(
      {
        ...createInitialState(),
        phase: "grilling",
        pendingCommands: [{ type: "codexGrill" }],
      },
      grill,
      [user],
    );
    expect(grilled.pendingCommands).toEqual([{ type: "codexGrill" }]);
    const staleGrill = resumeReplay(
      {
        ...createInitialState(),
        phase: "grilling",
        pendingCommands: [{ type: "codexGrill" }],
      },
      outlined,
      [user],
    );
    expect(staleGrill.pendingCommands).toEqual([{ type: "codexOutline" }]);
    expect(staleGrill.phase).toBe("grilling");
  });

  it("replays the writing plan or the workspace report loop", () => {
    const plan = msg({
      id: "p1",
      role: "assistant",
      kind: "report_plan",
      content: "怎么写",
      payload: { title: "怎么写", markdown: "## 结构" },
    });
    const report = msg({
      id: "r1",
      role: "assistant",
      kind: "report",
      content: "研究报告",
      payload: { markdown: "# 研究报告\n\n终稿。" },
    });
    const replayPlan = resumeReplay(
      {
        ...createInitialState(),
        phase: "reporting",
        pendingCommands: [{ type: "codexReportWrite" }],
      },
      plan,
      [],
    );
    expect(replayPlan.pendingCommands).toEqual([{ type: "codexReportPlan" }]);
    expect(replayPlan.reportPlan).toBeNull();
    const replayReport = resumeReplay(
      {
        ...createInitialState(),
        phase: "ready",
        reportPlan: { title: "怎么写", markdown: "## 结构" },
        report: { markdown: "# 研究报告\n\n终稿。" },
        pendingCommands: [],
      },
      report,
      [plan],
    );
    expect(replayReport.pendingCommands).toEqual([{ type: "codexReportWrite" }]);
    expect(replayReport.phase).toBe("reporting");
    expect(replayReport.report).toBeNull();
  });
});
