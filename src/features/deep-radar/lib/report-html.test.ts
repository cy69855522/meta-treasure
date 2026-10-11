import { describe, expect, it } from "vitest";
import {
  buildReportHtmlDocument,
  reportDisplayTitle,
  reportDownloadFilename,
} from "@/features/deep-radar/lib/report-html";

describe("report-html", () => {
  it("prefers the first markdown heading as the title", () => {
    expect(
      reportDisplayTitle({
        markdown: "# 视觉分割 FP8 指南\n\n正文",
      }),
    ).toBe("视觉分割 FP8 指南");
  });

  it("builds a full-bleed standalone html document", () => {
    const html = buildReportHtmlDocument({
      title: "测试报告",
      bodyHtml: "<h1>测试报告</h1><p>hello</p>",
      exportedAt: new Date("2026-09-25T12:00:00+08:00"),
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("max-width: 64rem");
    expect(html).toContain("<article class=\"report\">");
    expect(html).toContain("<p>hello</p>");
    expect(reportDownloadFilename("a/b:c")).toBe("abc.html");
  });
});
