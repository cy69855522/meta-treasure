import { describe, expect, it } from "vitest";
import {
  autolinkBareUrls,
  withInlineCites,
  clipCiteLabel,
  displayCiteLabel,
  resolveReportLink,
  shortCiteLabel,
} from "@/features/deep-radar/lib/cite-links";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";

const catalog: ResearchLink[] = [
  {
    url: "https://zhuanlan.zhihu.com/p/1",
    normalizedUrl: "https://zhuanlan.zhihu.com/p/1",
    title: "姚顺雨谈大模型没有秘密",
    source: "zhihu",
    author: "姚顺雨",
    cited: true,
    roundIndex: 0,
  },
];

describe("inline report cites", () => {
  it("keeps existing markdown cites and appends missing ones as 根据 tags", () => {
    const already =
      "根据 [姚顺雨](https://zhuanlan.zhihu.com/p/1)，核心流程没有太多秘密。";
    expect(withInlineCites(already, [catalog[0].url], catalog)).toBe(already);

    const injected = withInlineCites("方法已经公开。", [catalog[0].url], catalog);
    expect(injected).toContain("根据 [姚顺雨](https://zhuanlan.zhihu.com/p/1)。");
    expect(shortCiteLabel(catalog[0])).toBe("姚顺雨");
    expect(clipCiteLabel("科技巫师的魔法书")).toBe("科技巫师的魔法书");
    expect(displayCiteLabel("kaggle竞赛宝典", catalog[0])).toBe("kaggle竞赛宝典");
    expect(
      displayCiteLabel("mp.weixin.qq.com", {
        ...catalog[0],
        author: undefined,
        title: "mp.weixin.qq.com",
        source: "wechat",
      }),
    ).toBe("微信");
    expect(
      displayCiteLabel(
        "https://cs336.stanford.edu/",
        resolveReportLink("https://cs336.stanford.edu/", []),
      ),
    ).toBe("cs336");
    expect(
      autolinkBareUrls(
        "入口 https://cs336.stanford.edu/、仓库 https://github.com/stanford-cs336/lectures",
      ),
    ).toContain("[https://cs336.stanford.edu/](https://cs336.stanford.edu/)");
  });
});
