# @progress/deep-research

Lightweight multi-source search utility (no UI, no summarization).

## Sources (v1)

- **WeChat** Official Account articles — TikHub `POST /api/v1/wechat_search/v2/fetch_search` (`business_type=article`)
- **Zhihu** — TikHub `GET /api/v1/zhihu/web/fetch_article_search_v3`

## Usage

```ts
import { DeepResearchAgent } from "@progress/deep-research";

const agent = new DeepResearchAgent({
  apiKey: process.env.TIKHUB_API_KEY,
});

// Per-source (one page of results as returned by TikHub)
const wechat = await agent.searchWechat("关键词");
const zhihu = await agent.searchZhihu("关键词");

// All sources, grouped
const result = await agent.search("关键词");
// result.groups.wechat / result.groups.zhihu
// result.errors?.wechat — one source failing does not fail the other
```

## Env

```bash
TIKHUB_API_KEY=your_token
```

Get a key at https://user.tikhub.io

## Note

- WeChat search endpoints may require paid TikHub balance (free credit may be rejected with HTTP 402).
- WeChat 搜一搜 article results usually **do not** include like/view counts — only title, digest, url, account, time, cover.
- Zhihu results typically include 点赞 / 评论 / 收藏 (and for questions: 浏览 / 回答 / 关注).