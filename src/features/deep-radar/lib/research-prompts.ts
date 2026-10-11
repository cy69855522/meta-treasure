import type { ResearchState } from "@/features/deep-radar/lib/research-types";
import {
  EXPLORE_CHILD_LINK_LIMIT,
  EXTRACT_CHAR_LIMIT,
  FILTER_HIT_LIMIT,
  READ_SOURCES_MAX_PER_BATCH,
  SNIPPET_CHAR_LIMIT,
} from "@/features/deep-radar/lib/constants";
import { catalogItem, collectReadableLinks } from "@/features/deep-radar/lib/research-sources";

export type PromptMessage = {
  role: string;
  kind?: string;
  content: string;
  payload?: unknown;
  images?: Array<{ id?: string; name?: string; url?: string }>;
};

export type SnapshotPromptOptions = {
  /** When false, omit full extracted bodies; LLM should use read_sources. Default true. */
  includeExtracted?: boolean;
};

function clip(text: string | undefined, limit: number) {
  if (!text) return text;
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function compactLinks(state: ResearchState, includeExtracted: boolean) {
  return state.links.map((l) => ({
    url: l.url,
    title: l.title,
    source: l.source,
    cited: l.cited,
    reason: l.reason,
    snippet: clip(l.snippet, SNIPPET_CHAR_LIMIT),
    author: l.author,
    publishedAt: l.publishedAt,
    extracted:
      includeExtracted && l.cited
        ? clip(l.extracted, EXTRACT_CHAR_LIMIT)
        : undefined,
    hasBody: Boolean(l.extracted?.trim()),
    chars: l.extracted?.trim() ? l.extracted.trim().length : undefined,
  }));
}

function compactDialoguePayload(kind: string | undefined, payload: unknown) {
  if (payload === undefined) return undefined;
  if (kind !== "round" || !payload || typeof payload !== "object") return payload;
  const row = payload as {
    round?: {
      query?: string;
      queryZh?: string;
      queryEn?: string;
      targetQuestion?: string;
      findings?: string;
      gaps?: string;
      summary?: string;
      analysis?: string;
      keywords?: string[];
    };
    cited?: Array<{ url?: string; title?: string }>;
    unused?: unknown[];
  };
  return {
    query: row.round?.query,
    queryZh: row.round?.queryZh,
    queryEn: row.round?.queryEn,
    targetQuestion: row.round?.targetQuestion,
    summary: row.round?.summary ?? row.round?.findings,
    analysis: row.round?.analysis ?? row.round?.gaps,
    keywords: row.round?.keywords,
    cited: (row.cited ?? []).map((item) => ({
      url: item.url,
      title: item.title,
    })),
    unusedCount: Array.isArray(row.unused) ? row.unused.length : 0,
  };
}

export function dialogueForPrompt(messages: PromptMessage[] = []) {
  return messages
    .filter(
      (message) =>
        message.content.trim() ||
        message.payload !== undefined ||
        Boolean(message.images?.length),
    )
    .map((message) => {
      const who = message.role === "user" ? "用户" : "助手";
      const kind =
        message.kind && message.kind !== "text" ? `[${message.kind}] ` : "";
      const packed = compactDialoguePayload(message.kind, message.payload);
      const payload =
        packed === undefined ? "" : `\n${JSON.stringify(packed, null, 2)}`;
      const pictures = message.images?.length
        ? `\n[附图：${message.images.map((image) => image.name || image.id || "image").join("、")}]`
        : "";
      return `${who}：${kind}${message.content.trim()}${pictures}${payload}`;
    })
    .join("\n\n");
}

export function snapshotPrompt(
  state: ResearchState,
  extra?: string,
  messages: PromptMessage[] = [],
  options: SnapshotPromptOptions = {},
) {
  const includeExtracted = options.includeExtracted !== false;
  const body = {
    phase: state.phase,
    grillCount: state.grillCount,
    dialogue: dialogueForPrompt(messages),
    outline: state.outline ?? state.pendingOutline,
    snapshot: state.snapshot,
    rounds: state.rounds,
    draftRound: state.draftRound
      ? {
          query: state.draftRound.query,
          queryZh: state.draftRound.queryZh,
          queryEn: state.draftRound.queryEn,
          targetQuestion: state.draftRound.targetQuestion,
          step: state.draftRound.step,
          hits: (
            state.draftRound.step === "filtering"
              ? state.draftRound.hits.slice(0, FILTER_HIT_LIMIT)
              : state.draftRound.hits
          ).map((h) => ({
            url: h.url,
            title: h.title,
            source: h.source,
            snippet: clip(h.snippet, SNIPPET_CHAR_LIMIT),
            author: h.author,
            contentType: h.contentType,
            extracted: includeExtracted
              ? clip(h.extracted, EXTRACT_CHAR_LIMIT)
              : undefined,
            hasBody: Boolean(h.extracted?.trim()),
            chars: h.extracted?.trim() ? h.extracted.trim().length : undefined,
            childLinks: (h.childLinks ?? [])
              .slice(0, EXPLORE_CHILD_LINK_LIMIT)
              .map((link) => ({
              url: link.url,
              title: link.title,
            })),
            parentUrl: h.parentUrl,
          })),
          hitTotal: state.draftRound.hits.length,
          cited: state.draftRound.cited,
          unused: state.draftRound.unused,
          exploredUrls: state.draftRound.exploredUrls,
          exploreCount: state.draftRound.exploreCount,
        }
      : null,
    links: compactLinks(state, includeExtracted),
    sourceCatalog: includeExtracted
      ? undefined
      : collectReadableLinks(state).map(catalogItem),
    readSourcesMaxPerBatch: includeExtracted
      ? undefined
      : READ_SOURCES_MAX_PER_BATCH,
    reportPlan: state.reportPlan,
    report: state.report,
    extra,
  };
  return JSON.stringify(body, null, 2);
}

export const GRILL_INSTRUCTIONS = `你是 Deep Radar 的研究意图访谈官。
输入 JSON 的 dialogue 字段是到目前为止的对话，必须先读完再提问。

硬性规则：
- 每次只问一个问题。
- 不要重复用户已经说过的内容。用户第一句话若已给出研究对象、观点和用途，禁止再问「你想研究什么」「核心问题是什么」这类开场白。
- 用户可能附图；结合图片和文字一起判断意图，不要假装没看到图。
- 下一问只补还缺的约束，例如：只要佐证还是也要反驳、时间范围、中文社区还是也要论文、要原文语境还是业界评论。
- 不要给搜索结果。不要现在写纲要。
- 用户说「直接出纲要」，或目标/对象/要验证的观点已经可执行时，把 done 设为 true，question 设为 null。
只返回 JSON：
{"done": boolean, "question": string | null}`;

export const OUTLINE_INSTRUCTIONS = `你是 Deep Radar 的研究纲要编辑。
根据 dialogue 里的用户意图写搜索纲要。若有 feedback，按反馈改写。
写法：
- goal：一小段话（两到四句），总结本次 Deep Research 的宏观目标：要弄清什么、给谁用、成功长什么样。不要只写标题。
- objectives：3 到 6 条细节目标。每条必须是完整的一句话，说明要查清的一件具体事情。不要再套子卡片，不要写检索词列表。
- exclusions：明确不查什么；没有就空数组。
只返回 JSON：
{
  "goal": "一小段宏观目标",
  "objectives": ["细节目标一句话", "细节目标一句话"],
  "exclusions": ["不查什么"]
}
信息源和最大轮次由系统配置，不要写进纲要。`;

export const QUERY_INSTRUCTIONS = `你是 Deep Radar 的搜索词生成器。
根据纲要、完整对话记录 dialogue、已完成轮次的发现/缺口，生成本轮检索。
本轮只对准大纲里尚未被充分覆盖的一条细节目标。
必须同时给出：
- targetQuestion：一句简短的本轮目标问题（问句）。
- queryZh：给知乎、微信公众号、百度、必应中国、搜狗、360、头条、集思录。
- queryEn：给 Google、DuckDuckGo、Brave、Yahoo、必应国际等英文网页引擎。
专有名词可保留通行写法（如 杨植麟 / Yang Zhilin，Kimi，DeepSeek），不要整句机械翻译。
搜索词可以是词组或短句。不要重复已经用过的中文或英文搜索词。
只返回 JSON：{"targetQuestion": string, "queryZh": string, "queryEn": string}`;

export const FILTER_INSTRUCTIONS = `你是 Deep Radar 的材料筛选器。
输入是本轮去重后的候选链接（标题/摘要/来源，最多前若干条，见 hitTotal）以及到目前为止的完整对话。
必须先给每一条候选打相关标记，再从「相关」里选出要引用抽正文的条目。
- reviews 必须覆盖输入里的每一条 url。
- relevant=true：对当前目标问题或大纲有帮助；reason 用一句话说明为什么相关。
- relevant=false：跑题、广告、重复转载或无法核验；reason 用一句话说明为什么无关。
- cited 只能来自 relevant=true 的 url。标题高度相似（含跨来源转载）的只引用一条。
- 目录型页面（GitHub 仓库、docs 首页、课程大纲、讲义目录）只要可能含目标材料，标 relevant 并 cited，后续可以用 fetch_page 打开子页面。
- 同一知乎问题下的不同回答不要当重复。
只返回 JSON：
{
  "reviews": [{"url": "必须是候选里的 url", "relevant": true, "reason": "一句话"}],
  "cited": [{"url": "必须来自 reviews 里 relevant=true 的 url"}]
}`;

export const EXPLORE_INSTRUCTIONS = `你是 Deep Radar 的网页探索器。
你有一个函数工具 fetch_page：打开已经读到的页面里的超链接或子页面，继续抽取正文。
典型场景：GitHub 仓库首页、docs 目录、课程大纲、讲义/转录目录。先看 draftRound.hits 的 extracted 和 childLinks。
规则：
- 只打开对当前 targetQuestion 有用的子页面，优先 README、syllabus、讲义 markdown、lecture/transcript 正文、官方目录列出的文档。
- 若用户要逐讲/逐节掌握一门课，尽量按目录把相关讲次文件逐个打开，不要只停在大纲页。
- 不要打开图片、登录页、无关 issue。
- url 必须来自 childLinks，或同一 GitHub 仓库下的 blob/tree/raw 地址。
- 每次 fetch_page 最多 32 个 url。读完这批正文后，可以继续调用，也可以结束。
- 本轮深入循环最多 100 次。材料已经够用、没有新的有用子页、或继续点开也挖不出目标材料时，返回 tool=done，不要为了凑次数而乱打开。
- 不要写研究报告，不要输出 summary。
只返回 JSON，两种之一：
{"tool":"fetch_page","urls":["https://..."],"reason":"为什么要打开"}
{"tool":"done"}`;

export const FINDINGS_INSTRUCTIONS = `你是 Deep Radar 的轮次书记员。
根据完整对话、本轮目标问题、搜索词、资料目录（sourceCatalog）和历史轮次，写本轮记录。

你有 function tool 按需读正文，禁止假设已经读过全部原文：
1) read_sources — 批量打开资料正文。urls 必须来自 sourceCatalog / draftRound.hits / links；每批最多 readSourcesMaxPerBatch 条。
{"tool":"read_sources","urls":["https://..."],"reason":"为什么要读这批"}
2) submit_findings — 材料够了就提交本轮记录。
{"tool":"submit_findings","summary":"资料总结","analysis":"结果分析","keywords":["重点词"],"shouldStop": boolean}

工作方式：
- 先看目录里的 title/snippet/reason/hasBody/chars，再 read_sources 打开真正需要的正文；可多次调用。
- 不要一次读完全部；优先高相关、有正文、能回答本轮 targetQuestion 的条目。
- 已读正文会在后续 extra.openedSources 里回传，不要重复打开同一 url，除非还要核对。

submit_findings 正文要求：
- summary：直接、充分地回答本轮目标问题。写成可供终稿写作引用的实质笔记：用完整段落说明证据、机制、数字与出处；需要分点时用 markdown 列表，但每条都要有解释，禁止只堆关键词。
- analysis：是否覆盖大纲对应细节目标；若未停，写下一轮应对准哪一条；若材料已够或已到最大轮次，写明终止原因与缺口。
链接写成 [可读标签](url)，标签最多约 12 个汉字或等价宽度；url 必须来自已有链接。
需要强调的术语写成 ==重点词==，keywords 列 8 到 16 个。
不要用 emoji；不要写「行动路线」「速通」口吻。
extra 里有本轮序号和最大轮次，必须读。
若纲要缺口已补齐，或再搜也挖不出新东西，或已经是最后一轮，shouldStop=true。`;

export const REPORT_PLAN_INSTRUCTIONS = `你是 Deep Radar 的报告撰写策划。
搜索已经结束。现在不要写研究报告正文，只规划「这篇报告应该怎么写」。
目标是产出类似 OpenAI Deep Research 的完整研究报告：有充分论证、可独立阅读。

你有 function tool 按需读正文：
1) read_sources — 批量打开资料。urls 来自 sourceCatalog / links；每批最多 readSourcesMaxPerBatch 条。
{"tool":"read_sources","urls":["https://..."],"reason":"为什么要读"}
2) submit_plan — 提交可执行撰写计划。
{"tool":"submit_plan","title":"报告标题或计划标题","markdown":"完整撰写计划（markdown）","keywords":["重点词"]}

先看目录与各轮 summary，再按需 read_sources 核对关键原文；不要假装读过未打开的正文。
计划至少包括：
- 报告标题与读者（用户真正想弄清什么；成功标准是什么）
- 章节结构：每节写什么、预计篇幅、用哪些材料（写 url 或短标签）支撑、避免什么；若用户要求按讲次/章节掌握，必须按讲次或等价单元展开
- 核心论点和反证怎么处理
- 引用规则：嵌在句子里，短标签，url 必须来自已有链接
- 哪些缺口要在正文里诚实标明
- 终稿完整度要求
markdown 用中文，写清楚到可以直接照着写。`;

export const REPORT_WRITE_INSTRUCTIONS = `你是 Deep Radar 的研究报告作者，当前是一次可写工作区的编码任务。
产出标准对齐 OpenAI Deep Research：完整、可独立阅读的长篇研究报告，而不是扫读笔记、关键词墙或「速通精要」。

工作区里已有：
- plan.md：撰写计划，必须遵守
- research.json：对话、纲要、轮次摘要（通常不含全文）
- sources.md：资料目录与阅读说明
- sources/index.md：全部资料索引（标题/url/本地文件）
- sources/*.md：单篇资料全文；不要假设已经读过，按需用工具分批打开（建议每批不超过 4 个文件）
- report.md：报告草稿，这是你要迭代完善的唯一交付文件
- STATUS.md：终稿标记

硬性规则：
- 写作分多轮完成：每一轮 Codex 回合只推进有限进度，不要指望一轮写完整份报告。
- 用工具阅读 sources/index.md 与少量 sources/*.md，再修改 report.md。
- 禁止只复述 research.json 里的短摘要；关键论断必须回到 sources/*.md 原文。
- 不要把报告全文或整份资料库贴进对话。交付物就是 report.md。
- 结构建议：标题 → 简短总览（几段即可）→ 若干正文大节（每节有完整段落）→ 局限与资料缺口 → 结论。按用户目标组织；若用户要逐讲/逐节掌握，按讲次或等价单元写。
- 正文以完整段落为主；列表只用于步骤、对比或清单，且每条要有说明。禁止通篇 emoji、禁止「行动路线」口吻、禁止只有标题+关键词的空壳章节。
- 引用必须嵌在句子里，不要单独列引用卡片或文末链接列表。写法示例：根据 [姚顺雨](https://example.com/a)，做大模型没有什么秘密。
- 引用标签用作者、机构或标题前半，最多约 12 个汉字或等价宽度。url 必须来自 sources 索引里已有链接。
- 文中要有判断：谁的说法更可信、证据与分歧、局限是什么。需要强调的词可写成 ==重点词==，但不要为高亮而堆词。
- 终稿应充分覆盖用户目标与大纲；宁可写长并诚实标明缺口，也不要交短摘要交差。
- 只有整份报告已可独立阅读时，才把 STATUS.md 写成单独一行 DONE。
- 未完成时 STATUS.md 写成 NOT_DONE。若章节仍是提纲、证据不足、或明显短于一份可交付研究报告，不要标 DONE。

禁止编造对话和资料里没有的出处。`;

export const REPORT_WRITE_TURN = `本轮是写作第 1 回合：只搭骨架，不要写完整终稿。
1) 读 plan.md、sources/index.md（不要一次打开全部 sources/*.md）。
2) 把 report.md 写成：标题 + 总览（2–4 段）+ 各章节标题与每节 1–2 段开篇；最多再打开 4 个最相关的 sources/*.md 补证据。
3) STATUS.md 写成一行 NOT_DONE。
不要把全文贴进对话。后续回合会继续补全。`;

export const REPORT_WRITE_CONTINUE = `继续完善 report.md（本回合只推进若干章节，不要强求一次写完）。
对照 plan.md 与 sources/index.md：缺证据就再打开至多 4 个 sources/*.md，补段落、删空壳小节。
若报告仍未达到可独立阅读的完整终稿，STATUS.md 写成 NOT_DONE 并结束本回合；只有已是完整终稿时才写 DONE。不要把全文贴进对话。`;

export const FOLLOWUP_INSTRUCTIONS = `你是 Deep Radar 的研究顾问。
要结合完整对话历史与 snapshot 里的 phase，不要假装没看过前面的追问、纲要、轮次和报告。

你有一组 function tools，每次只调用其中一个，返回对应 JSON（不要混其它字段）：

1) continue_research — 仅当 phase=paused（研究循环或写报告被中断/冻结，尚未完成）且用户要继续、接着做、恢复、往下走时使用。
{"tool":"continue_research","reason":"一句话说明为何继续"}

2) generate_report — 仅当 phase=paused，且现有材料已够写终稿、用户明确要求直接出报告时使用。
{"tool":"generate_report","reason":"一句话说明为何开写"}

3) answer — 已有材料能回答用户问题时使用；phase=ready 时的普通追问也用这个。
{"tool":"answer","text":"markdown"}

4) need_search — 用户要新角度且必须再搜时使用，并给出补充纲要。
{"tool":"need_search","outline":{"goal":"一小段宏观目标","objectives":["细节目标一句话"],"exclusions":[]}}

硬性规则：
- phase=paused 且用户意图是继续未完成流程时，必须用 continue_research（或明确要求写报告时用 generate_report），禁止只用文字敷衍说「你可以点继续」。
- phase=ready（报告已完成）时禁止 continue_research / generate_report。
- 兼容旧写法：kind=answer / need_search / continue / generate_report 也可识别。`;
