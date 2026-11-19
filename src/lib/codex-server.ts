import "server-only";
import path from "node:path";
import { z } from "zod";
import { getCodexModelOptions, resolveCodexModel } from "@/lib/codex-config";
import {
  answerRequest,
  ensurePump,
  isBusy,
  syncMessagesOnce,
  toClientState,
  toolsFor,
} from "@/lib/codex-requests";
import { codexService, type ServiceState } from "@/lib/codex-service-client";
import type { CodexState } from "@/lib/codex-types";
import { partsFromStoredMessage } from "@/lib/chat-message-parts";
import {
  getProject,
  listAgentMessages,
  listRequiredRules,
  listRequiredSkills,
  listSkillsByRecentUse,
  listStewardMessages,
  markSkillsUsed,
} from "@/lib/db";
import {
  buildProjectAgentSystemPrompt,
  buildProjectAgentTurnSnapshot,
} from "@/lib/project-agent";
import { extractSkillCommands, normalizeSkillCommand, skillCommandName } from "@/lib/skill-commands";
import { buildStewardSystemPrompt, buildStewardTurnSnapshot } from "@/lib/steward";
import type { MessageImage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Request guards

export function checkScope(scope: string) {
  if (scope !== "steward" && !getProject(scope)) throw new Error("项目不存在");
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new Error("代码工作区仅允许本机访问");
  if (origin && new URL(origin).host !== host) throw new Error("不允许跨站访问代码工作区");
}

// ---------------------------------------------------------------------------
// State

/** The service keeps the live conversation; the first read seeds it from the database. */
async function loadState(scope: string): Promise<ServiceState> {
  checkScope(scope);
  const state = await codexService.state(scope);
  if (state.initialized) return state;
  const rows = scope === "steward" ? listStewardMessages() : listAgentMessages(scope);
  return codexService.init(
    scope,
    rows.map((m) => ({ id: m.id, role: m.role, parts: partsFromStoredMessage(m) })),
  );
}

/** Pure read plus two idempotent nudges: keep the tool pump alive, mirror finished chats to SQLite. */
export async function getCodexState(scope: string): Promise<CodexState> {
  const state = await loadState(scope);
  if (isBusy(state) || state.requests.length) ensurePump(scope);
  syncMessagesOnce(scope, state);
  return toClientState(scope, state);
}

export async function stopCodex(scope: string) {
  checkScope(scope);
  return toClientState(scope, await codexService.stop(scope));
}

export async function setCodexDirectory(scope: string, cwd: string) {
  checkScope(scope);
  return toClientState(scope, await codexService.setDirectory(scope, cwd));
}

export async function respondToCodexRequest(
  scope: string,
  id: string,
  approved: boolean,
  answers?: Record<string, { answers: string[] }>,
) {
  checkScope(scope);
  await answerRequest(scope, id, approved, answers);
  ensurePump(scope);
  return getCodexState(scope);
}

/** Drop everything after `messageId`; the service rebuilds its thread from what is kept. */
export async function rewindCodex(scope: string, messageId: string, keepMessage: boolean) {
  checkScope(scope);
  const state = await codexService.rewind(scope, messageId, keepMessage);
  syncMessagesOnce(scope, state);
  return state;
}

/** Response body of the two rewind routes (history list shape, not live state). */
export function rewindResponseBody(state: ServiceState) {
  return {
    messages: state.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.parts.map((p) => (p.type === "text" ? p.text ?? "" : "")).join(""),
      skills: m.parts
        .filter((p) => p.type === "skill")
        .map((p) => ({ id: String(p.id), name: String(p.name), command: String(p.command) })),
      images: m.parts
        .filter((p) => p.type === "image")
        .map((p) => ({
          id: String(p.id),
          name: String(p.name),
          url: String(p.url),
          path: String(p.path),
          mimeType: String(p.mimeType),
        })),
    })),
    hasMore: false,
  };
}

// ---------------------------------------------------------------------------
// Models

export async function getCodexModels() {
  return getCodexModelOptions();
}

export async function setCodexModel(scope: string, modelId: unknown) {
  checkScope(scope);
  const model = await resolveCodexModel(modelId);
  return toClientState(
    scope,
    await codexService.setModel(scope, { modelId: model.id, model: model.model, modelProvider: model.provider }),
  );
}

// ---------------------------------------------------------------------------
// Starting a turn

function explicitSkills(text: string) {
  const requested = new Set(extractSkillCommands(text).map(normalizeSkillCommand));
  if (requested.size === 0) return [];
  return listSkillsByRecentUse().filter((skill) => requested.has(normalizeSkillCommand(skill.name)));
}

function mergeSkillsById(...groups: ReturnType<typeof listSkillsByRecentUse>[]) {
  const map = new Map<string, (typeof groups)[number][number]>();
  for (const group of groups) {
    for (const skill of group) map.set(skill.id, skill);
  }
  return [...map.values()];
}

function formatInjectedLibraryBlock(
  title: string,
  intro: string,
  items: Array<{ name: string; description: string; body: string }>,
) {
  if (items.length === 0) return "";
  return [
    "",
    title,
    intro,
    "界面会用标签展示已挂载项；回答正文不要在开头复述它们的名称/摘要清单，直接按正文执行。",
    ...items.map((item) => `\n### ${item.name}\n${item.description}\n\n${item.body}`),
  ].join("\n");
}

function allowedImages(rawImages: unknown): MessageImage[] {
  const imageRoot = path.join(process.cwd(), "data", "codex-images") + path.sep;
  return (Array.isArray(rawImages) ? rawImages : [])
    .filter(
      (image): image is MessageImage =>
        typeof image?.id === "string" &&
        typeof image?.name === "string" &&
        typeof image?.url === "string" &&
        typeof image?.path === "string" &&
        typeof image?.mimeType === "string" &&
        path.resolve(image.path).startsWith(imageRoot),
    )
    .slice(0, 9);
}

export async function startCodex(
  scope: string,
  text: string,
  rawImages: unknown,
  retry = false,
  modelId?: unknown,
) {
  await loadState(scope);
  const images = allowedImages(rawImages);
  if (!text?.trim() && !images.length) throw new Error("消息或图片不能为空");

  const tools = Object.entries(toolsFor(scope)).map(([name, tool]) => ({
    type: "function" as const,
    name,
    description: tool.description || name,
    inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodType),
  }));
  const toolsKey = tools.map((tool) => tool.name).sort().join("|");

  const required = listRequiredSkills();
  const explicit = explicitSkills(text).filter((skill) => skill.usageMode !== "required");
  const selectedSkills = mergeSkillsById(required, explicit);
  // Standing constraints apply to every agent surface, not only Steward.
  const requiredRules = listRequiredRules();
  const baseInstructions =
    scope === "steward" ? buildStewardSystemPrompt() : buildProjectAgentSystemPrompt(scope);
  const rulesBlock = formatInjectedLibraryBlock(
    "=== 必载规则（必须使用，每轮自动注入） ===",
    "以下规则为「必须使用」。本轮回答必须遵守其正文；若与用户请求冲突，应说明冲突，不能静默忽略。",
    requiredRules,
  );
  const libraryInstructions =
    formatInjectedLibraryBlock(
      "=== 必载技能（必须使用，每轮自动注入） ===",
      "以下技能为「必须使用」。本轮回答必须遵循其正文；若与用户请求冲突，应说明冲突，不能静默忽略。",
      required,
    ) +
    formatInjectedLibraryBlock(
      "=== 本轮用户显式指定的技能（必须执行） ===",
      "用户通过 /技能名 明确要求本轮使用以下技能。必须按技能正文完成接下来的行动；若技能与请求冲突，应说明冲突，不能静默忽略。",
      explicit,
    ) +
    rulesBlock;
  const libraryKey = [
    ...required.map((item) => `skill:${item.id}`),
    ...explicit.map((item) => `skill:${item.id}`),
    ...requiredRules.map((item) => `rule:${item.id}`),
  ]
    .sort()
    .join("|");

  const model = await resolveCodexModel(modelId);
  const turnSnapshot =
    scope === "steward" ? buildStewardTurnSnapshot() : buildProjectAgentTurnSnapshot(scope);
  // Turn-level copy so resumed threads cannot drop standing rules or stale snapshots.
  const turnLibraryPrefix = [rulesBlock.trim(), turnSnapshot.trim()].filter(Boolean).join("\n\n");

  const result = await codexService.start({
    scope,
    text,
    images,
    retry,
    tools,
    toolsKey,
    instructions: baseInstructions + libraryInstructions,
    turnLibraryPrefix: turnLibraryPrefix || undefined,
    libraryKey,
    skills: selectedSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      command: skillCommandName(skill.name),
      description: skill.description,
    })),
    rules: requiredRules.map((rule) => ({ id: rule.id, name: rule.name, description: rule.description })),
    modelId: model.id,
    model: model.model,
    modelProvider: model.provider,
  });
  markSkillsUsed(selectedSkills.map((skill) => skill.id));
  ensurePump(scope);
  return toClientState(scope, result);
}
