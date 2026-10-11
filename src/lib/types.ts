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
  description?: string;
};

export type InvokedRule = {
  id: string;
  name: string;
  description?: string;
};

export type InvokedSearchHit = {
  id: string;
  source: string;
  title: string;
  url: string;
  snippet?: string;
};

export type InvokedSearchPage = {
  url: string;
  title: string;
  source?: string;
  text: string;
  error?: string;
};

/** One webSearch (+ optional later fetchPages), or one direct fetchUrl visit, attached to an assistant message. */
export type InvokedSearch = {
  id: string;
  query: string;
  sources: string[];
  hits: InvokedSearchHit[];
  pages?: InvokedSearchPage[];
  /** Streaming / lifecycle status for inline bubble bars. */
  status?: "searching" | "fetching" | "done" | "error";
  phase?: "search" | "fetch" | "visit";
  callId?: string;
  error?: string;
  /**
   * Character offset into concatenated text parts where this search bar sits.
   * Used to rebuild interleaved text→search→text after DB round-trip.
   */
  at?: number;
};

/** Deep Radar research job attached to an assistant bubble. */
export type InvokedRadar = {
  sessionId: string;
  title: string;
  url: string;
  reportUrl: string;
};

/** Live Deep Radar progress returned by deepRadarProgress and the bubble poll. */
export type DeepRadarProgress = {
  sessionId: string;
  title: string;
  phase: string;
  phaseLabel: string;
  label: string;
  busy: boolean;
  error: string | null;
  rounds: number;
  maxRounds: number;
  reportWrite: { turn: number; maxTurns: number } | null;
  hasReport: boolean;
  percent: number | null;
  terminal: "running" | "done" | "failed";
  url: string;
  reportUrl: string;
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
  rules: InvokedRule[];
  searches: InvokedSearch[];
  radars: InvokedRadar[];
  images: MessageImage[];
  createdAt: string;
};

/** Compact hit returned by Agent / Steward chat history search. */
export type ChatMessageSearchHit = {
  id: string;
  role: AgentMessageRole;
  snippet: string;
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
  rules: InvokedRule[];
  searches: InvokedSearch[];
  radars: InvokedRadar[];
  images: MessageImage[];
  createdAt: string;
};
