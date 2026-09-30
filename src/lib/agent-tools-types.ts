export type AgentToolScope = "project" | "steward";

export type ActionDiff = {
  field: string;
  before: string | null;
  after: string | null;
};

export type ActionAffects = "notes" | "tasks" | "projects" | "skills" | "rules";

export type ActionPreview = {
  toolName: string;
  actionLabel: string;
  summary: string;
  diffs: ActionDiff[];
  risk: "low" | "medium" | "high";
  affects: ActionAffects;
};

export const AGENT_TOOL_NAMES = [
  "createMemoryNote",
  "updateMemoryNote",
  "deleteMemoryNote",
  "createTask",
  "updateTask",
  "completeTask",
  "deleteTask",
  "reorderProjects",
  "moveProjectToPiggyBank",
  "restoreProjectFromPiggyBank",
  "createSkillFolder",
  "updateSkillFolder",
  "deleteSkillFolder",
  "createSkill",
  "updateSkill",
  "deleteSkill",
  "createRuleFolder",
  "updateRuleFolder",
  "deleteRuleFolder",
  "createRule",
  "updateRule",
  "deleteRule",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type FunctionToolParam = {
  name: string;
  type: string;
  description: string;
  required: boolean;
};

export type FunctionToolCatalogItem = {
  name: string;
  description: string;
  audiences: Array<"steward" | "project">;
  parameters: FunctionToolParam[];
};

export function isAgentToolName(name: string): name is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

export function toolNameFromPartType(partType: string): string | null {
  if (partType.startsWith("tool-")) return partType.slice("tool-".length);
  if (partType === "dynamic-tool") return null;
  return null;
}
