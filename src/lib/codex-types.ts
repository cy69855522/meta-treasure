import type { InvokedSkill, InvokedRule, InvokedSearch, InvokedRadar, MessageImage } from "@/lib/types";

export type UIMessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type SkillMessagePart = InvokedSkill & { type: "skill" };
export type RuleMessagePart = InvokedRule & { type: "rule" };
export type SearchMessagePart = InvokedSearch & { type: "search" };
export type RadarMessagePart = InvokedRadar & { type: "radar" };
export type ImageMessagePart = MessageImage & { type: "image" };

export function isImageMessagePart(part: UIMessagePart): part is ImageMessagePart {
  return part.type === "image" && typeof part.id === "string" && typeof part.url === "string" && typeof part.path === "string";
}

export function isSkillMessagePart(part: UIMessagePart): part is SkillMessagePart {
  return (
    part.type === "skill" &&
    typeof part.id === "string" &&
    typeof part.name === "string" &&
    typeof part.command === "string"
  );
}

export function isRuleMessagePart(part: UIMessagePart): part is RuleMessagePart {
  return (
    part.type === "rule" &&
    typeof part.id === "string" &&
    typeof part.name === "string"
  );
}

export function isRadarMessagePart(part: UIMessagePart): part is RadarMessagePart {
  return part.type === "radar" && typeof part.sessionId === "string" && part.sessionId.length > 0;
}

export function isSearchMessagePart(part: UIMessagePart): part is SearchMessagePart {
  return (
    part.type === "search" &&
    typeof part.id === "string" &&
    (typeof part.query === "string" || Array.isArray(part.hits) || Array.isArray(part.pages))
  );
}

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UIMessagePart[];
};
export type CodexModelOption = {
  id: string;
  label: string;
  model: string | null;
  provider: string | null;
  available: boolean;
  detail: string;
};
export type CodexCatalogModel = {
  model?: string;
  displayName?: string;
  description?: string;
  hidden?: boolean;
  inputModalities?: string[];
  isDefault?: boolean;
};
export type CodexRequest = { id: string | number; method: string; preview?: import("@/lib/agent-tools-types").ActionPreview; params: Record<string, unknown> };

export type CodexStatus = "ready" | "submitted" | "streaming" | "error";

export type CodexState = {
  scope: string;
  /** Change counter: equal `rev` means nothing the client can see has changed. */
  rev: number;
  messages: UIMessage[];
  /** Only requests a person must decide; auto-approved and in-flight ones are filtered out. */
  requests: CodexRequest[];
  status: CodexStatus;
  error?: string | null;
  cwd?: string | null;
  modelId?: string | null;
  model?: string | null;
  modelProvider?: string | null;
};

/** What GET /api/codex/[scope]?since=<rev> answers. */
export type CodexPoll = CodexState | { unchanged: true; rev: number };

/** Every command the browser can send to POST /api/codex/[scope]. */
export type CodexAction =
  | { action: "start"; text: string; images?: unknown[]; retry?: boolean; modelId?: string }
  | { action: "model"; modelId: string }
  | { action: "directory"; cwd: string }
  | { action: "respond"; id: string | number; approved: boolean; answers?: Record<string, { answers: string[] }> }
  | { action: "stop" };
