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
