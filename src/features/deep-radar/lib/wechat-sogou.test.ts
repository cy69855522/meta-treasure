import { describe, expect, it } from "vitest";
import {
  extractSogouRedirect,
  parseWechatSearchHtml,
} from "@progress/deep-research/sources/wechat";

describe("sogou wechat search", () => {
  it("parses news-list cards from search html", () => {
    const html = `
      <ul class="news-list">
        <li>
          <h3><a href="/link?url=abc">大模型没有秘密</a></h3>
          <p class="txt-info">汤道生对话姚顺雨</p>
          <div class="s-p">
            <span class="all-time-y2">腾讯云</span>
            <span class="s2"><script>timeConvert('1710000000')</script></span>
          </div>
        </li>
      </ul>
    `;
    const hits = parseWechatSearchHtml(html, 8);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.source).toBe("wechat");
    expect(hits[0]?.title).toBe("大模型没有秘密");
    expect(hits[0]?.url).toContain("weixin.sogou.com/link?url=abc");
    expect(hits[0]?.author).toBe("腾讯云");
    expect(hits[0]?.snippet).toContain("姚顺雨");
  });

  it("extracts mp.weixin url from sogou jump script", () => {
    const html = `
      <script>
        var url = '';
        url += 'https://mp.weixin.qq.com/s?__biz=MzA';
        url += '&mid=1';
        location.replace(url);
      </script>
    `;
    expect(extractSogouRedirect(html)).toBe(
      "https://mp.weixin.qq.com/s?__biz=MzA&mid=1",
    );
  });
});
