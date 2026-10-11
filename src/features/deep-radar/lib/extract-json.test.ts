import { describe, expect, it } from "vitest";
import { extractJson } from "@/features/deep-radar/lib/extract-json";

describe("extractJson", () => {
  it("提取普通 JSON 对象", () => {
    const result = extractJson<{ query: string }>('{"query": "test"}');
    expect(result).toEqual({ query: "test" });
  });

  it("从 markdown 代码块中提取 JSON", () => {
    const result = extractJson<{ query: string }>(`
一些文字
\`\`\`json
{"query": "test"}
\`\`\`
更多文字
    `);
    expect(result).toEqual({ query: "test" });
  });

  it("从混合文本中提取 JSON", () => {
    const result = extractJson<{ tool: string }>(`
这是一些解释文字
{"tool": "done", "reason": "完成"}
后续文字
    `);
    expect(result).toEqual({ tool: "done", reason: "完成" });
  });

  it("忽略 LaTeX 数学公式中的花括号", () => {
    expect(() => {
      extractJson(`{CES} = (\\text{点赞} \\times 1) + (\\text{收藏} \\times 1)`);
    }).toThrow(/模型没有返回有效的 JSON 对象/);
  });

  it("在 LaTeX 之后找到真正的 JSON", () => {
    const result = extractJson<{ query: string }>(`
{CES} = (\\text{点赞} \\times 1)

决策：{"query": "test"}
    `);
    expect(result).toEqual({ query: "test" });
  });

  it("处理嵌套的 JSON 对象", () => {
    const result = extractJson<{ data: { nested: string } }>(`
{"data": {"nested": "value"}}
    `);
    expect(result).toEqual({ data: { nested: "value" } });
  });

  it("提取多行格式化的 JSON", () => {
    const result = extractJson<{ a: number; b: string }>(`
{
  "a": 1,
  "b": "test"
}
    `);
    expect(result).toEqual({ a: 1, b: "test" });
  });

  it("当完全没有 JSON 时抛出清晰的错误", () => {
    expect(() => {
      extractJson("这只是普通文本，没有任何 JSON");
    }).toThrow(/模型没有返回有效的 JSON 对象/);
  });

  it("当 JSON 格式错误时提供详细信息", () => {
    expect(() => {
      extractJson('{"query": invalid}');
    }).toThrow(/JSON 解析失败/);
  });
});
