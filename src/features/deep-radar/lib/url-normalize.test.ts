import { describe, expect, it } from "vitest";
import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";

describe("normalizeUrl", () => {
  it("drops tracking params and hashes", () => {
    expect(
      normalizeUrl(
        "https://www.zhihu.com/question/1/answer/2?utm_source=qq#foo",
      ),
    ).toBe("https://www.zhihu.com/question/1/answer/2");
  });

  it("treats the same WeChat article params as one url", () => {
    const a = normalizeUrl(
      "http://mp.weixin.qq.com/s?__biz=MzA&mid=1&idx=1&sn=abc&scene=27",
    );
    const b = normalizeUrl(
      "https://mp.weixin.qq.com/s?__biz=MzA&mid=1&idx=1&sn=abc&clicktime=9",
    );
    expect(a).toBe(b);
  });
});
