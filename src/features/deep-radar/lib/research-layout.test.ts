import { describe, expect, it } from "vitest";
import { applyHitReviews } from "@/features/deep-radar/lib/research-filter";
import { normalizeOutline, outlinePoints } from "@/features/deep-radar/lib/research-outline";
import {
  extractEqualsMarks,
  mergeKeywords,
  splitByKeywords,
} from "@/features/deep-radar/lib/candy-highlight";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";

function hit(url: string, title: string): ResearchLink {
  return {
    url,
    normalizedUrl: url,
    title,
    source: "zhihu",
    cited: false,
    roundIndex: 0,
  };
}

describe("research outline", () => {
  it("keeps a paragraph goal and one-sentence detail points", () => {
    const outline = normalizeOutline({
      goal: "弄清这句话的出处和争议。",
      objectives: ["核对原文语境。", "收集反对意见。"],
      exclusions: ["股价"],
    });
    expect(outline.subquestions).toBeUndefined();
    expect(outlinePoints(outline)).toEqual([
      "核对原文语境。",
      "收集反对意见。",
    ]);
  });

  it("flattens legacy nested outline cards into sentences", () => {
    const outline = normalizeOutline({
      goal: "旧纲要",
      subquestions: [
        {
          question: "数据从哪来",
          searchDirections: ["预训练 数据"],
        },
      ],
      exclusions: [],
    });
    expect(outlinePoints(outline)).toEqual(["数据从哪来：预训练 数据"]);
  });
});

describe("hit reviews", () => {
  it("classifies unused hits as related or unrelated before citing", () => {
    const hits = [
      hit("https://a.example/1", "相关文"),
      hit("https://a.example/2", "相关但不引"),
      hit("https://a.example/3", "广告"),
    ];
    const { cited, unused } = applyHitReviews(hits, {
      reviews: [
        { url: "https://a.example/1", relevant: true, reason: "直接回答目标问题。" },
        { url: "https://a.example/2", relevant: true, reason: "背景有用但与本轮重复。" },
        { url: "https://a.example/3", relevant: false, reason: "软文推销，与研究无关。" },
      ],
      cited: [{ url: "https://a.example/1" }],
    });
    expect(cited).toEqual([
      { url: "https://a.example/1", reason: "直接回答目标问题。" },
    ]);
    expect(unused).toEqual([
      {
        url: "https://a.example/2",
        relevant: true,
        reason: "背景有用但与本轮重复。",
      },
      {
        url: "https://a.example/3",
        relevant: false,
        reason: "软文推销，与研究无关。",
      },
    ]);
  });
});

describe("candy highlights", () => {
  it("strips ==marks== into keywords and splits text without dropping neighbors", () => {
    const { text, marks } = extractEqualsMarks("**==缩放定律==** 仍然成立");
    expect(text).toBe("**缩放定律** 仍然成立");
    expect(marks).toEqual(["缩放定律"]);
    expect(mergeKeywords(["涌现"], marks)).toEqual(["缩放定律", "涌现"]);
    expect(splitByKeywords("缩放定律与涌现", ["缩放定律", "涌现"])).toEqual([
      { text: "缩放定律", hit: "缩放定律" },
      { text: "与" },
      { text: "涌现", hit: "涌现" },
    ]);
  });
});
