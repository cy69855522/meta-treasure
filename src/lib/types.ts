export type Lane = "inbox" | "now" | "next" | "later" | "done";

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  /** Parked in the Project Piggy Bank — hidden from main sidebar / Project Order. */
  inPiggyBank: boolean;
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

export type AgentMessageRole = "user" | "assistant";

export type InvokedSkill = {
  id: string;
  name: string;
  command: string;
};

export type MessageImage = { id: string; name: string; url: string; path: string; mimeType: string };

export type ProjectAgent = {
  id: string;
  projectId: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentMemoryNote = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentMessage = {
  id: string;
  projectId: string;
  role: AgentMessageRole;
  content: string;
  skills: InvokedSkill[];
  images: MessageImage[];
  createdAt: string;
};

/** Folder in the Skills Library. */
export type SkillFolder = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * How a Skill or Rule is loaded into agent turns:
 * - required — body injected every turn
 * - on_demand — catalog only; load via getSkill/getRule when relevant
 */
export type LibraryUsageMode = "required" | "on_demand";

/** @deprecated Prefer LibraryUsageMode; kept for existing Skill call sites. */
export type SkillUsageMode = LibraryUsageMode;

/**
 * Collected agent Skill, stored in Cursor-style SKILL.md shape:
 * YAML frontmatter (name + description) + markdown body.
 */
export type Skill = {
  id: string;
  folderId: string;
  name: string;
  description: string;
  body: string;
  usageMode: LibraryUsageMode;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

/** Folder in the Rules Library. */
export type RuleFolder = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Collected agent Rule, stored in Cursor-rule shape:
 * YAML frontmatter (name + description) + markdown body of persistent constraints.
 * Unlike a Skill (procedural playbook), a Rule is standing guidance.
 */
export type Rule = {
  id: string;
  folderId: string;
  name: string;
  description: string;
  body: string;
  usageMode: LibraryUsageMode;
  createdAt: string;
  updatedAt: string;
};

/** Editable long-lived note for the Steward (workspace-wide). */
export type StewardMemoryNote = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** One turn in the Steward conversation. */
export type StewardMessage = {
  id: string;
  role: AgentMessageRole;
  content: string;
  skills: InvokedSkill[];
  images: MessageImage[];
  createdAt: string;
};
