export const SEARCH_SOURCE_GROUPS = ["community", "web"] as const;

export type SearchSourceGroup = (typeof SEARCH_SOURCE_GROUPS)[number];

export type SearchSourceMeta = {
  id: string;
  title: string;
  hint: string;
  group: SearchSourceGroup;
  kind: "tikhub" | "scrape";
  queryLang: "zh" | "en";
  defaultOn: boolean;
};

export const SEARCH_SOURCE_CATALOG = [
  {
    id: "zhihu",
    title: "知乎",
    hint: "中文问答与专栏，适合争议观点、从业者讨论和长文拆解。",
    group: "community",
    kind: "tikhub",
    queryLang: "zh",
    defaultOn: true,
  },
  {
    id: "wechat",
    title: "微信公众号",
    hint: "搜公众号文章，适合媒体稿、机构解读和一手转载；不含视频号。",
    group: "community",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: true,
  },
  {
    id: "baidu",
    title: "百度",
    hint: "中文网页检索，国内站点覆盖广，适合新闻、百科和中文资料。",
    group: "web",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: false,
  },
  {
    id: "bing_cn",
    title: "必应中国",
    hint: "必应中国版，中文网页为主，也会带上一部分国际结果。",
    group: "web",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: false,
  },
  {
    id: "bing_int",
    title: "必应国际",
    hint: "必应国际版，英文网页、文档和海外报道较多。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "sogou",
    title: "搜狗",
    hint: "中文网页搜索，微信生态相关结果往往比其他引擎更多。",
    group: "web",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: false,
  },
  {
    id: "so360",
    title: "360 搜索",
    hint: "国内网页与资讯检索，可补百度、搜狗没抓到的中文页面。",
    group: "web",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: false,
  },
  {
    id: "toutiao",
    title: "今日头条",
    hint: "资讯流搜索，适合近期中文新闻、热点评论和转载稿。",
    group: "web",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: false,
  },
  {
    id: "jisilu",
    title: "集思录",
    hint: "投资社区检索，适合债券、可转债、基金等金融讨论。",
    group: "web",
    kind: "scrape",
    queryLang: "zh",
    defaultOn: false,
  },
  {
    id: "google",
    title: "Google",
    hint: "英文网页覆盖最全，适合论文、官方文档和海外报道；反爬较严。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "google_hk",
    title: "Google 香港",
    hint: "Google 香港站点，中英结果混排，有时比 google.com 更容易抓到。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "duckduckgo",
    title: "DuckDuckGo",
    hint: "英文网页检索，不追踪用户，HTML 版相对稳定。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "startpage",
    title: "Startpage",
    hint: "用 Google 结果做隐私搜索，适合要英文网页又不想直接打 Google 时。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "brave",
    title: "Brave",
    hint: "Brave 自有索引的英文网页搜索，独立于 Google 结果。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "yahoo",
    title: "Yahoo",
    hint: "英文网页搜索，新闻与旧文归档有时能补上其他引擎的缺口。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "ecosia",
    title: "Ecosia",
    hint: "种树搜索引擎，英文网页结果为主，索引接近 Bing。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "qwant",
    title: "Qwant",
    hint: "欧洲隐私搜索，适合英、法语网页和欧盟视角的报道。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
  {
    id: "wolfram",
    title: "Wolfram Alpha",
    hint: "计算与事实引擎，适合公式、数据和定义，不适合长文报道。",
    group: "web",
    kind: "scrape",
    queryLang: "en",
    defaultOn: false,
  },
] as const satisfies readonly SearchSourceMeta[];

export type SearchSource = (typeof SEARCH_SOURCE_CATALOG)[number]["id"];

export const ALL_SEARCH_SOURCES: SearchSource[] = SEARCH_SOURCE_CATALOG.map(
  (item) => item.id,
);

export const DEFAULT_SEARCH_SOURCES: SearchSource[] = SEARCH_SOURCE_CATALOG.filter(
  (item) => item.defaultOn,
).map((item) => item.id);

export const SOURCE_TITLE: Record<SearchSource, string> = Object.fromEntries(
  SEARCH_SOURCE_CATALOG.map((item) => [item.id, item.title]),
) as Record<SearchSource, string>;

export function isSearchSource(value: unknown): value is SearchSource {
  return typeof value === "string" && ALL_SEARCH_SOURCES.includes(value as SearchSource);
}

export function queryLangForSource(source: SearchSource): "zh" | "en" {
  return SEARCH_SOURCE_CATALOG.find((item) => item.id === source)?.queryLang ?? "zh";
}

export function pickQueryForSource(
  source: SearchSource,
  queryZh: string,
  queryEn: string,
): string {
  const lang = queryLangForSource(source);
  const preferred = lang === "en" ? queryEn.trim() : queryZh.trim();
  const fallback = lang === "en" ? queryZh.trim() : queryEn.trim();
  return preferred || fallback;
}
