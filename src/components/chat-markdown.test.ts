import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "@/components/chat-markdown";

describe("ChatMarkdown", () => {
  it("keeps br-separated content inside one GFM table row", () => {
    const markdown = `| 模型名称 | 官方链接 | 能力特点 | 硬件门槛 |
| :--- | :--- | :--- | :--- |
| **FLUX.1**<br>*(BFL)* | [GitHub](https://github.com/example)<br>[HF](https://huggingface.co/example) | 画质很高。<br>- 12B 参数。<br>- 支持文本改图。 | 16GB ~ 24GB |`;

    const html = renderToStaticMarkup(createElement(ChatMarkdown, { content: markdown }));

    expect(html.match(/<tr/g)).toHaveLength(2);
    expect(html.match(/<td/g)).toHaveLength(4);
    expect(html).toContain("FLUX.1</strong><br/>");
    expect(html).toContain("12B 参数");
    expect(html).not.toContain("<ul>");
  });
});
