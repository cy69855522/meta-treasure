import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_MIN_CHARS } from "@/features/deep-radar/lib/constants";
import { memoryStore } from "@/features/deep-radar/lib/memory-store";
import {
  applyAndDrain,
  configureOrchestrator,
  drain,
  rewindAndResume,
  type SessionStore,
} from "@/features/deep-radar/lib/research-orchestrator";
import type { LlmPort } from "@/features/deep-radar/lib/research-nodes";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";

function padReport(body: string) {
  const filler = "补充论证与证据说明。".repeat(
    Math.ceil(REPORT_MIN_CHARS / 10),
  );
  return `${body.trim()}\n\n${filler}\n`;
}

function isReportFile(value: unknown): value is { reportFile: string } {
  return Boolean(value && typeof value === "object" && "reportFile" in value);
}

function jsonLlm(replies: unknown[]): LlmPort {
  const queue = [...replies];
  return {
    async complete() {
      const next = queue.shift();
      if (next === undefined) throw new Error("LLM queue empty");
      if (isReportFile(next)) throw new Error("expected complete JSON, got reportFile");
      return JSON.stringify(next);
    },
    async completeWorkspace({ cwd }) {
      const next = queue.shift();
      if (!isReportFile(next)) throw new Error("LLM workspace queue empty");
      await writeFile(join(cwd, "report.md"), next.reportFile, "utf8");
      await writeFile(join(cwd, "STATUS.md"), "DONE\n", "utf8");
      return { text: "ok", threadId: "mock-thread" };
    },
  };
}

const sampleLink: ResearchLink = {
  url: "https://zhuanlan.zhihu.com/p/1",
  normalizedUrl: "https://zhuanlan.zhihu.com/p/1",
  title: "DeepSeek 训练综述",
  source: "zhihu",
  snippet: "讲数据与后训练",
  cited: false,
  roundIndex: 0,
};

describe("research orchestrator", () => {
  it("runs grill → outline approve → one search round → report with mocks", async () => {
    const store = memoryStore();
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search(query, _sources, pair) {
          expect(query).toBe("DeepSeek 预训练 数据来源");
          expect(pair).toEqual({
            queryZh: "DeepSeek 预训练 数据来源",
            queryEn: "DeepSeek pretraining data sources",
          });
          return { hits: [sampleLink] };
        },
        async extract() {
          return "文章正文：预训练用了大量网络数据。";
        },
      },
      llm: jsonLlm([
        { done: false, question: "你更关心训练数据还是推理成本？" },
        {
          goal: "弄清 DeepSeek 的训练路线：从公开材料还原预训练数据从哪来。",
          objectives: ["弄清预训练数据从哪里来、是否可复现。"],
          exclusions: ["股价"],
        },
        {
          targetQuestion: "DeepSeek 预训练数据从哪来？",
          queryZh: "DeepSeek 预训练 数据来源",
          queryEn: "DeepSeek pretraining data sources",
        },
          {
            cited: [
              {
                url: "https://zhuanlan.zhihu.com/p/1",
                reason: "讲数据",
              },
            ],
            reviews: [
              {
                url: "https://zhuanlan.zhihu.com/p/1",
                relevant: true,
                reason: "直接讲预训练数据从哪来。",
              },
            ],
          },
          { tool: "done" },
          {
          summary: "数据来自公开网页。",
          analysis: "本轮已覆盖数据来源，资料已经满足大纲要求。",
          shouldStop: true,
        },
        {
          title: "DeepSeek 训练数据从哪来",
          markdown: "## 结构\n写结论、证据和判断。引用必须嵌在句子里。",
        },
        {
          reportFile: padReport(`# 研究报告

数据是公开网络为主。多篇文章指向网页抓取。工程向作者更可信。下一步读官方技术报告，并核对原始出处。
`),
        },
      ]),
    });

    await applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "想研究 DeepSeek 怎么训练",
    });
    expect(store.session.state.phase).toBe("grilling");
    expect(store.messages.some((m) => m.content.includes("训练数据"))).toBe(
      true,
    );

    await applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "直接出纲要",
    });
    expect(store.session.state.phase).toBe("outline_pending");
    expect(store.session.state.pendingOutline?.goal).toContain("训练");

    await applyAndDrain(store, "s1", { type: "APPROVE_OUTLINE" });
    expect(store.session.state.phase).toBe("ready");
    expect(store.session.state.report?.markdown).toContain(
      "数据是公开网络为主",
    );
    expect(store.messages.some((m) => m.kind === "report_plan")).toBe(true);
    expect(store.messages.some((m) => m.kind === "round")).toBe(true);
    expect(store.messages.some((m) => m.kind === "report")).toBe(true);
    expect(store.session.state.links[0]?.extracted).toContain("预训练");
  });

  it("rewinds a user turn and can retry from the kept message", async () => {
    const store = memoryStore();
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search() {
          return { hits: [] };
        },
        async extract() {
          return "";
        },
      },
      llm: jsonLlm([
        { done: false, question: "范围是国内还是也看论文？" },
        { done: false, question: "重试后的下一问？" },
      ]),
    });
    await applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "想研究大模型有没有秘密",
    });
    expect(store.messages).toHaveLength(2);
    const userId = store.messages[0].id;
    store.rewind("s1", store.messages[1].id, false);
    expect(store.messages).toHaveLength(1);
    expect(store.session.state.pendingCommands).toEqual([]);
    store.rewind("s1", userId, true);
    expect(store.messages).toHaveLength(1);
    expect(store.session.state.pendingCommands).toEqual([{ type: "codexGrill" }]);
  });

  it("stops drain quietly if the session was deleted", async () => {
    const inner = memoryStore();
    let gone = false;
    const store: SessionStore = {
      get(id) {
        return gone ? null : inner.get(id);
      },
      save(id, state, title) {
        if (!gone) inner.save(id, state, title);
      },
      append(id, messages, state) {
        return gone ? [] : inner.append(id, messages, state);
      },
      list(id) {
        return gone ? [] : inner.list(id);
      },
      rewind(id, messageId, keepMessage) {
        if (!gone) inner.rewind(id, messageId, keepMessage);
      },
    };
    inner.session.state.pendingCommands = [{ type: "codexGrill" }];
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search() {
          return { hits: [] };
        },
        async extract() {
          return "";
        },
      },
      llm: {
        async complete() {
          gone = true;
          return JSON.stringify({ done: true, question: "还会问吗？" });
        },
      },
    });
    await drain(store, "s1");
    expect(inner.session.state.phase).toBe("idle");
    expect(inner.messages).toEqual([]);
  });

  it("aborts in-flight reasoning on rewind and does not keep the late reply", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = memoryStore();
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search() {
          return { hits: [] };
        },
        async extract() {
          return "";
        },
      },
      llm: {
        async complete(_instructions, _prompt, signal) {
          await gate;
          if (signal?.aborted) throw new Error("已停止");
          return JSON.stringify({
            done: false,
            question: "不该出现的追问",
          });
        },
      },
    });
    const draining = applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "想研究大模型有没有秘密",
    });
    await Promise.resolve();
    const userId = store.messages[0]?.id;
    expect(userId).toBeTruthy();
    const rewinding = rewindAndResume(store, "s1", userId!, false);
    release();
    await rewinding;
    await draining;
    expect(store.messages).toEqual([]);
    expect(
      store.messages.some((message) => message.content.includes("不该出现")),
    ).toBe(false);
  });

  it("retries an assistant grill answer and continues the flow", async () => {
    const store = memoryStore();
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search() {
          return { hits: [] };
        },
        async extract() {
          return "";
        },
      },
      llm: jsonLlm([
        { done: false, question: "第一问：更关心数据还是推理？" },
        { done: false, question: "重试后的追问？" },
        {
          goal: "弄清 DeepSeek 的训练路线：从公开材料还原预训练数据从哪来。",
          objectives: ["弄清预训练数据从哪里来、是否可复现。"],
          exclusions: ["股价"],
        },
      ]),
    });
    await applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "想研究 DeepSeek 怎么训练",
    });
    const grillId = store.messages.find((message) => message.role === "assistant")?.id;
    expect(grillId).toBeTruthy();
    expect(store.messages.some((message) => message.content.includes("第一问"))).toBe(
      true,
    );
    await rewindAndResume(store, "s1", grillId!, {
      keepMessage: false,
      resume: true,
    });
    expect(store.messages.some((message) => message.content.includes("第一问"))).toBe(
      false,
    );
    expect(store.messages.some((message) => message.content.includes("重试后"))).toBe(
      true,
    );
    expect(store.session.state.phase).toBe("grilling");
  });

  it("retries an outline card and keeps waiting for approval", async () => {
    const store = memoryStore();
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search() {
          return { hits: [] };
        },
        async extract() {
          return "";
        },
      },
      llm: jsonLlm([
        { done: true, question: null },
        {
          goal: "第一份纲要：弄清训练数据从哪来。",
          objectives: ["弄清预训练数据从哪里来。"],
          exclusions: [],
        },
        {
          goal: "重试后的纲要：核对训练数据出处。",
          objectives: ["核对预训练数据出处。"],
          exclusions: [],
        },
      ]),
    });
    await applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "想研究 DeepSeek 怎么训练",
    });
    const outlineId = store.messages.find((message) => message.kind === "outline")?.id;
    expect(store.session.state.pendingOutline?.goal).toContain("第一份");
    await rewindAndResume(store, "s1", outlineId!, {
      keepMessage: false,
      resume: true,
    });
    expect(store.session.state.phase).toBe("outline_pending");
    expect(store.session.state.pendingOutline?.goal).toContain("重试后");
    expect(store.messages.filter((message) => message.kind === "outline")).toHaveLength(1);
  });

  it("retries a round card and continues into the report", async () => {
    const store = memoryStore();
    configureOrchestrator({
      settings: () => ({
        theme: "light",
        maxRounds: 3,
        sources: ["zhihu", "wechat"],
        codexModelId: "",
      }),
      search: {
        async search() {
          return { hits: [sampleLink] };
        },
        async extract() {
          return "文章正文：预训练用了大量网络数据。";
        },
      },
      llm: jsonLlm([
        { done: true, question: null },
        {
          goal: "弄清 DeepSeek 的训练路线：从公开材料还原预训练数据从哪来。",
          objectives: ["弄清预训练数据从哪里来、是否可复现。"],
          exclusions: ["股价"],
        },
        {
          targetQuestion: "DeepSeek 预训练数据从哪来？",
          queryZh: "DeepSeek 预训练 数据来源",
          queryEn: "DeepSeek pretraining data sources",
        },
        {
          cited: [{ url: "https://zhuanlan.zhihu.com/p/1", reason: "讲数据" }],
          reviews: [
            {
              url: "https://zhuanlan.zhihu.com/p/1",
              relevant: true,
              reason: "直接讲预训练数据从哪来。",
            },
          ],
        },
        { tool: "done" },
        {
          summary: "第一轮总结。",
          analysis: "本轮已覆盖数据来源，资料已经满足大纲要求。",
          shouldStop: true,
        },
        {
          title: "不该留下的计划",
          markdown: "旧计划：不要用这份。",
        },
        {
          reportFile: padReport(`# 研究报告

不该留下的报告。这份旧稿不应该在重试之后还出现，需要被后面的新报告覆盖掉。
`),
        },
        {
          targetQuestion: "重试后的目标问题？",
          queryZh: "DeepSeek 预训练 数据来源",
          queryEn: "DeepSeek pretraining data sources",
        },
        {
          cited: [{ url: "https://zhuanlan.zhihu.com/p/1", reason: "讲数据" }],
          reviews: [
            {
              url: "https://zhuanlan.zhihu.com/p/1",
              relevant: true,
              reason: "直接讲预训练数据从哪来。",
            },
          ],
        },
        { tool: "done" },
        {
          summary: "重试后的轮次总结。",
          analysis: "资料已经满足大纲要求。",
          shouldStop: true,
        },
        {
          title: "重试后的计划",
          markdown: "新计划：按重试后的材料写。",
        },
        {
          reportFile: padReport(`# 研究报告

重试后的结论。新报告应该覆盖旧稿，并给出下一步读官方技术报告、交叉验证数据来源。
`),
        },
      ]),
    });
    await applyAndDrain(store, "s1", {
      type: "USER_MESSAGE",
      text: "想研究 DeepSeek 怎么训练",
    });
    await applyAndDrain(store, "s1", { type: "APPROVE_OUTLINE" });
    expect(store.session.state.report?.markdown).toContain("不该留下");
    const roundId = store.messages.find((message) => message.kind === "round")?.id;
    expect(roundId).toBeTruthy();
    await rewindAndResume(store, "s1", roundId!, {
      keepMessage: false,
      resume: true,
    });
    expect(store.messages.some((message) => message.content.includes("重试后的轮次"))).toBe(
      true,
    );
    expect(store.session.state.report?.markdown).toContain("重试后");
    expect(store.session.state.phase).toBe("ready");
  });
});
