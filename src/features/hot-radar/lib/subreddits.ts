export const DEFAULT_SUBREDDIT = "SaaS";

export function allSubredditNames(): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const group of SUBREDDIT_GROUPS) {
    for (const cluster of group.clusters) {
      for (const name of cluster.names) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
    }
  }
  return names;
}

export type SubredditCluster = {
  names: string[];
  description: string;
};

export type SubredditGroup = {
  title: string;
  note?: string;
  clusters: SubredditCluster[];
};

export const SUBREDDIT_GROUPS: SubredditGroup[] = [
  {
    title: "独立开发",
    clusters: [
      {
        names: ["SaaS", "microsaas"],
        description:
          "独立开发的阵地，看大家在做什么、在骂什么。SaaS 同时是商业信标：不把产品卖给同行，而是看谁已经跑通月流水，以及评论区在骂竞品什么。",
      },
      {
        names: ["SideProject"],
        description:
          "独立开发者展示新玩具的地方，评论区里充满了一针见血的建议，那是你改进产品的最佳灵感矿。也用来看已被验证的微型产品，作为用 AI 重做一遍的标杆。",
      },
      {
        names: ["Entrepreneur", "smallbusiness", "freelance"],
        description:
          "这些地方的人群是最优质的付费客户，讨论的都是“怎么解决这个业务流程”，“怎么提高转换率”。",
      },
    ],
  },
  {
    title: "工作流痛点区",
    note: "AI 切入点的平替矿源",
    clusters: [
      {
        names: ["excel", "sheets"],
        description:
          "Excel 是最大的低代码平台，这里堆满了成千上万条“求自动化公式/求脚本”的诉求，AI 改造平替空间极大。",
      },
      {
        names: ["Notion"],
        description: "办公协作插件/模板类项目的根据地。",
      },
      {
        names: ["automation", "zapier"],
        description: "进阶效率控，这里全是“谁能帮我用这三个工具连起来”的诉求。",
      },
    ],
  },
  {
    title: "电商卖家区",
    note: "离钱最近、付费最爽快",
    clusters: [
      {
        names: ["shopify", "FulfillmentByAmazon", "dropship", "ecommerce"],
        description:
          "卖家在搞钱，痛点极度清晰（引流难、退款难、合规难、UI 乱），付费意愿极强。独立站和亚马逊卖家还在为棚拍、白底图换生活场景、多语言口型视频、差评图核验花大钱，适合做成一键出图的订阅工具。",
      },
    ],
  },
  {
    title: "内容创作者与营销人",
    note: "批量化交付",
    clusters: [
      {
        names: ["SocialMediaMarketing", "contentcreators", "marketing"],
        description:
          "海外社媒运营、代运营和自由职业剪辑、文案。长视频切片加字幕、长文转轮播图、按品牌色批量出配图，都是一键出成品的位置。",
      },
    ],
  },
  {
    title: "垂直高毛利传统行业",
    note: "大厂看不上的缝隙",
    clusters: [
      {
        names: ["realestate"],
        description:
          "欧美房产中介和室内设计师单笔佣金高，不在乎每月几十美金。空房虚拟软装、光线打光、老照片修复，大厂不会做定制界面和家具资产。",
      },
    ],
  },
  {
    title: "视觉与审美区",
    note: "AI 生成潜力",
    clusters: [
      {
        names: ["graphic_design", "copywriting"],
        description:
          "这里全是专业人士对 AI 生成内容的“审视”，如果你能解决 AI 产出质量不专业的问题，这里就是最好的验证场。",
      },
    ],
  },
];
