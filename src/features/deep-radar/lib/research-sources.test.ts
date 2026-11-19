import { describe, expect, it } from "vitest";
import { READ_SOURCES_MAX_PER_BATCH } from "@/features/deep-radar/lib/constants";
import {
  parseFindingsTool,
  parseReportPlanTool,
  readSourceBatch,
} from "@/features/deep-radar/lib/research-sources";
import { createInitialState } from "@/features/deep-radar/lib/research-types";

describe("research sources tools", () => {
  it("parses read_sources and submit_findings decisions", () => {
    expect(
      parseFindingsTool(
        JSON.stringify({
          tool: "read_sources",
          urls: ["https://a.com", "https://b.com"],
          reason: "核对",
        }),
      ),
    ).toEqual({
      tool: "read_sources",
      urls: ["https://a.com", "https://b.com"],
      reason: "核对",
    });
    expect(
      parseFindingsTool(
        JSON.stringify({
          summary: "总结",
          analysis: "分析",
          shouldStop: true,
        }),
      ),
    ).toMatchObject({
      tool: "submit_findings",
      summary: "总结",
      analysis: "分析",
      shouldStop: true,
    });
  });

  it("falls back to plain prose when the model ignores the JSON contract", () => {
    const decision = parseFindingsTool(
      "针对 3D DiT 训练中网格解析与体素化引发 GPU 饥饿，工业界建立了离线 Latent Cache 预编码管线。",
    );
    expect(decision.tool).toBe("submit_findings");
    if (decision.tool !== "submit_findings") throw new Error("unexpected tool");
    expect(decision.summary).toContain("Latent Cache");
    expect(decision.shouldStop).toBe(false);
  });

  it("still throws when the model returns nothing at all", () => {
    expect(() => parseFindingsTool("   ")).toThrow(/模型没有返回有效的 JSON 对象/);
  });

  it("caps one read_sources batch", () => {
    const state = createInitialState();
    state.links = Array.from({ length: 8 }, (_, i) => ({
      url: `https://example.com/${i}`,
      normalizedUrl: `https://example.com/${i}`,
      title: `t${i}`,
      source: "zhihu" as const,
      cited: true,
      roundIndex: 0,
      extracted: `body-${i}`,
    }));
    const urls = state.links.map((link) => link.url);
    const batch = readSourceBatch(state, urls);
    expect(batch).toHaveLength(READ_SOURCES_MAX_PER_BATCH);
    expect(batch[0]?.body).toContain("body-0");
  });

  it("parses submit_plan", () => {
    expect(
      parseReportPlanTool(
        JSON.stringify({
          tool: "submit_plan",
          title: "计划",
          markdown: "## 一",
        }),
      ),
    ).toEqual({
      tool: "submit_plan",
      title: "计划",
      markdown: "## 一",
      keywords: undefined,
    });
  });
});
