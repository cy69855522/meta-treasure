import { describe, expect, it } from "vitest";
import { pickQueryForSource } from "@progress/deep-research";
import { normalizeQueryPair } from "@/features/deep-radar/lib/query-lang";

describe("query language", () => {
  it("fills a missing English or Chinese term from a single query", () => {
    expect(normalizeQueryPair({ query: "大模型没有秘密" })).toEqual({
      query: "大模型没有秘密",
      queryZh: "大模型没有秘密",
      queryEn: "大模型没有秘密",
    });
    expect(normalizeQueryPair({ query: "no secrets in LLMs" })).toEqual({
      query: "no secrets in LLMs",
      queryZh: "no secrets in LLMs",
      queryEn: "no secrets in LLMs",
    });
  });

  it("keeps distinct Chinese and English terms for the same intent", () => {
    expect(
      normalizeQueryPair({
        queryZh: "大模型没有秘密 杨植麟",
        queryEn: "LLMs have no secrets Yang Zhilin",
      }),
    ).toEqual({
      query: "大模型没有秘密 杨植麟",
      queryZh: "大模型没有秘密 杨植麟",
      queryEn: "LLMs have no secrets Yang Zhilin",
    });
  });

  it("picks Chinese for domestic engines and English for international ones", () => {
    expect(
      pickQueryForSource("zhihu", "大模型没有秘密", "LLMs have no secrets"),
    ).toBe("大模型没有秘密");
    expect(
      pickQueryForSource("wechat", "大模型没有秘密", "LLMs have no secrets"),
    ).toBe("大模型没有秘密");
    expect(
      pickQueryForSource("baidu", "大模型没有秘密", "LLMs have no secrets"),
    ).toBe("大模型没有秘密");
    expect(
      pickQueryForSource("google", "大模型没有秘密", "LLMs have no secrets"),
    ).toBe("LLMs have no secrets");
    expect(
      pickQueryForSource(
        "duckduckgo",
        "大模型没有秘密",
        "LLMs have no secrets",
      ),
    ).toBe("LLMs have no secrets");
  });
});
