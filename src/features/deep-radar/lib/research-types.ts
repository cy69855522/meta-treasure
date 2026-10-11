import type { SearchSource } from "@/features/deep-radar/lib/settings-types";

export type MessageImage = {
  id: string;
  name: string;
  url: string;
  path: string;
  mimeType: string;
};

export type Phase =
  | "idle"
  | "grilling"
  | "outline_pending"
  | "looping"
  | "paused"
  | "reporting"
  | "ready"
  | "supplement_pending";

export type MessageKind =
  | "text"
  | "outline"
  | "round"
  | "report_plan"
  | "report"
  | "status";

export type OutlineSubquestion = {
  question: string;
  searchDirections: string[];
};

export type Outline = {
  goal: string;
  /** One-sentence detail goals. Preferred over legacy subquestions. */
  objectives?: string[];
  /** @deprecated Old sessions stored nested cards here. */
  subquestions?: OutlineSubquestion[];
  exclusions: string[];
};

export type LoopSnapshot = {
  maxRounds: number;
  sources: SearchSource[];
};

export type CitedPick = {
  url: string;
  reason: string;
};

export type UnusedPick = {
  url: string;
  relevant?: boolean;
  reason?: string;
};

export type ResearchLink = {
  url: string;
  normalizedUrl: string;
  title: string;
  source: SearchSource;
  snippet?: string;
  author?: string;
  publishedAt?: string;
  contentType?: string;
  cited: boolean;
  relevant?: boolean;
  reason?: string;
  extracted?: string;
  childLinks?: Array<{ url: string; title: string }>;
  parentUrl?: string;
  roundIndex: number;
};

export type DraftRound = {
  query: string;
  queryZh?: string;
  queryEn?: string;
  targetQuestion?: string;
  step: "searching" | "filtering" | "extracting" | "exploring" | "summarizing";
  hits: ResearchLink[];
  cited?: CitedPick[];
  unused?: UnusedPick[];
  exploredUrls?: string[];
  exploreCount?: number;
  errors?: Partial<Record<SearchSource, string>>;
};

export type ResearchRound = {
  index: number;
  query: string;
  queryZh?: string;
  queryEn?: string;
  targetQuestion?: string;
  findings: string;
  gaps: string;
  summary?: string;
  analysis?: string;
  keywords?: string[];
  citedUrls: string[];
  unusedUrls: string[];
  errors?: Partial<Record<SearchSource, string>>;
};

export type ReportConclusion = {
  headline: string;
  notes: string;
  links: string[];
};

export type ReportPlan = {
  title: string;
  markdown: string;
  keywords?: string[];
};

export type Report = {
  markdown?: string;
  conclusions?: ReportConclusion[];
  judgment?: string;
  actionPath?: string;
  keywords?: string[];
};

export type Command =
  | { type: "codexGrill" }
  | { type: "codexOutline"; feedback?: string }
  | { type: "codexQuery" }
  | { type: "search"; query: string; queryZh?: string; queryEn?: string }
  | { type: "codexFilter" }
  | { type: "extract"; urls: string[] }
  | { type: "codexExplore" }
  | { type: "codexFindings" }
  | { type: "codexReportPlan" }
  | { type: "codexReportWrite" }
  /** @deprecated Old sessions queued a one-shot report. Treated as the plan step. */
  | { type: "codexReport" }
  | { type: "codexFollowup"; text: string };

export type NewMessage = {
  role: "user" | "assistant";
  kind: MessageKind;
  content: string;
  payload?: unknown;
  images?: MessageImage[];
};

export type ChatMessage = NewMessage & {
  id: string;
  sessionId: string;
  createdAt: string;
};

export type ResearchState = {
  phase: Phase;
  grillCount: number;
  outline: Outline | null;
  pendingOutline: Outline | null;
  snapshot: LoopSnapshot | null;
  rounds: ResearchRound[];
  loopStartIndex: number;
  draftRound: DraftRound | null;
  links: ResearchLink[];
  reportPlan: ReportPlan | null;
  report: Report | null;
  /** Live progress while iterating report.md in the workspace loop. */
  reportWrite: { turn: number; maxTurns: number } | null;
  stopRequested: boolean;
  pendingCommands: Command[];
  error: string | null;
};

export type ResearchEvent =
  | {
      type: "USER_MESSAGE";
      text: string;
      images?: MessageImage[];
      /** Progress bridge: skip grill and draft the outline immediately. */
      skipGrill?: boolean;
    }
  | { type: "GRILL_RESULT"; done: boolean; question?: string }
  | { type: "OUTLINE_DRAFTED"; outline: Outline }
  | { type: "APPROVE_OUTLINE" }
  | { type: "REVISE_OUTLINE"; feedback: string }
  | {
      type: "QUERY_GENERATED";
      query?: string;
      queryZh?: string;
      queryEn?: string;
      targetQuestion?: string;
    }
  | {
      type: "SEARCH_DONE";
      hits: ResearchLink[];
      errors?: Partial<Record<SearchSource, string>>;
    }
  | { type: "FILTER_DONE"; cited: CitedPick[]; unused: UnusedPick[] }
  | {
      type: "EXTRACT_DONE";
      extracts: Record<string, string>;
      pages?: Record<
        string,
        { title?: string; links?: Array<{ url: string; title: string }> }
      >;
    }
  | { type: "EXPLORE_DECIDED"; urls: string[]; reason?: string }
  | {
      type: "ROUND_FINDINGS";
      findings: string;
      gaps: string;
      summary?: string;
      analysis?: string;
      keywords?: string[];
      shouldStop: boolean;
    }
  | { type: "REPORT_PLAN_DRAFTED"; plan: ReportPlan }
  | { type: "REPORT_DONE"; report: Report }
  | { type: "FOLLOWUP_ANSWER"; text: string }
  | { type: "FOLLOWUP_NEED_SEARCH"; outline: Outline }
  | { type: "STOP" }
  | { type: "CONTINUE" }
  | { type: "GENERATE_REPORT" }
  | { type: "NODE_FAILED"; error: string };

export type ReduceContext = {
  settings: LoopSnapshot;
  now?: string;
};

export type ReduceResult = {
  state: ResearchState;
  messages: NewMessage[];
  error?: string;
};

export type SessionSummary = {
  id: string;
  title: string;
  phase: Phase;
  updatedAt: string;
  createdAt: string;
  favoritedAt?: string | null;
};

export type ResearchSession = {
  id: string;
  title: string;
  state: ResearchState;
  createdAt: string;
  updatedAt: string;
  favoritedAt?: string | null;
};

export function createInitialState(): ResearchState {
  return {
    phase: "idle",
    grillCount: 0,
    outline: null,
    pendingOutline: null,
    snapshot: null,
    rounds: [],
    loopStartIndex: 0,
    draftRound: null,
    links: [],
    reportPlan: null,
    report: null,
    reportWrite: null,
    stopRequested: false,
    pendingCommands: [],
    error: null,
  };
}

export function currentLoopRoundCount(state: ResearchState): number {
  return state.rounds.length - state.loopStartIndex;
}

export function composerDisabled(phase: Phase): boolean {
  return phase === "looping" || phase === "reporting";
}

/** Loop/report can always stop. Other phases can stop while a model turn is in flight. */
export function canStop(phase: Phase, busy = false): boolean {
  if (phase === "looping" || phase === "reporting") return true;
  if (!busy) return false;
  return (
    phase === "grilling" ||
    phase === "outline_pending" ||
    phase === "supplement_pending" ||
    phase === "ready" ||
    phase === "paused"
  );
}

export function canContinue(phase: Phase): boolean {
  return phase === "paused";
}

export function reportPreview(report: Report): string {
  const markdown = report.markdown?.trim();
  if (markdown) {
    const line = markdown
      .split("\n")
      .map((row) => row.replace(/^#+\s*/, "").trim())
      .find(Boolean);
    return line || "研究报告";
  }
  const headlines = (report.conclusions ?? [])
    .map((item) => item.headline.trim())
    .filter(Boolean);
  return headlines.join("\n") || "研究报告";
}
