export type Lane = "inbox" | "now" | "next" | "later" | "done";

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  lane: Lane;
  sortOrder: number;
  attributes: Record<string, string>;
  createdAt: string;
  /** 首次进入 Now（当前聚焦）的时间 */
  startedAt: string | null;
  /** 标记完成（进入历史）的时间 */
  completedAt: string | null;
  updatedAt: string;
};

export const LANES: Lane[] = ["inbox", "now", "next", "later", "done"];
export const ROADMAP_LANES: Array<"now" | "next" | "later"> = [
  "now",
  "next",
  "later",
];
export const NOW_WIP_LIMIT = 3;

export const LANE_LABELS: Record<Lane, string> = {
  inbox: "收件箱",
  now: "Now · 当前聚焦",
  next: "Next · 近期规划",
  later: "Later · 远期想法",
  done: "历史 · 已完成",
};
