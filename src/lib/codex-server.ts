import "server-only";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  buildActionPreview,
  buildProjectAgentTools,
  buildStewardTools,
} from "@/lib/agent-tools";
import { getCodexModelOptions, resolveCodexModel } from "@/lib/codex-config";
import {
  buildProjectAgentSystemPrompt,
  buildProjectAgentTurnSnapshot,
} from "@/lib/project-agent";
import {
  buildStewardSystemPrompt,
  buildStewardTurnSnapshot,
} from "@/lib/steward";
import { getProject, getRule, getSkill, listAgentMessages, listRequiredRules, listRequiredSkills, listSkillsByRecentUse, listStewardMessages, markSkillsUsed, syncCodexMessages } from "@/lib/db";
import { extractSkillCommands, normalizeSkillCommand, skillCommandName } from "@/lib/skill-commands";
import { partsFromStoredMessage } from "@/lib/chat-message-parts";
import type { CodexCatalogModel, CodexState } from "@/lib/codex-types";
import type { MessageImage } from "@/lib/types";

const stateDir = path.join(
  process.env.XDG_STATE_HOME || path.join(homedir(), ".local/state"),
  "progress-codex",
);
const serviceVersion = 29;
let launching: Promise<void> | undefined;
async function credentials() {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, "token");
  try { await fs.writeFile(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  return (await fs.readFile(file, "utf8")).trim();
}
async function request(
  action: string,
  body: object,
): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  const token = await credentials();
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath: path.join(stateDir, "service.sock"),
        path: `/${action}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let responseText = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseText += chunk;
        });
        res.on("end", () =>
          resolve({
            ok: res.statusCode === 200,
            json: async () => JSON.parse(responseText),
          }),
        );
      },
    );
    req.setTimeout(65000, () =>
      req.destroy(new Error("Codex 服务请求超时")),
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}
async function ensureService() {
  try {
    const r = await request("health", {});
    const health = await r.json() as { error?: string; version?: number };
    if (r.ok && health.version === serviceVersion) return;
    if (r.ok) {
      const shutdown = await request("shutdown", {});
      if (!shutdown.ok) throw new Error("Codex 本机服务版本过旧，请重启开发服务器");
      await new Promise(resolve => setTimeout(resolve, 150));
      await fs.unlink(path.join(stateDir, "service.sock")).catch(() => undefined);
      throw Object.assign(new Error("正在更新 Codex 本机服务"), { code: "ECONNREFUSED" });
    }
    throw new Error(health.error || "Codex 服务不可用，请重启执行服务");
  }
  catch (e) { if (!["ENOENT","ECONNREFUSED"].includes((e as NodeJS.ErrnoException).code || "")) throw e;
    if ((e as NodeJS.ErrnoException).code === "ECONNREFUSED") await fs.unlink(path.join(stateDir,"service.sock")).catch(()=>{});
  }
  launching ||= (async () => {
    await credentials();
    const proc = spawn(process.execPath, [path.join(process.cwd(), "scripts/codex-service.mjs")], { cwd: process.cwd(), detached: true, stdio: "ignore" });
    let launchError: Error | undefined;
    proc.on("error", e => { launchError = e; }); proc.unref();
    for (let i = 0; i < 80; i++) {
      if (launchError) throw launchError;
      await new Promise(resolve => setTimeout(resolve, 250));
      try { if ((await request("health", {})).ok) return; } catch { /* Starting. */ }
    }
    throw new Error("无法启动本机 Codex CLI，请在终端确认 codex 可运行并已登录。");
  })().finally(() => { launching = undefined; });
  await launching;
}
export async function codexCall<T = CodexState>(action: string, body: object): Promise<T> {
  await ensureService();
  const response = await request(action, body);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Codex 请求失败");
  return data;
}
export async function listCodexModels() {
  const result = await codexCall<{ models?: CodexCatalogModel[] }>("models", {});
  return result.models || [];
}
async function safeCodexModels() {
  try { return await listCodexModels(); } catch { return []; }
}
export function checkScope(scope: string) {
  if (scope !== "steward" && !getProject(scope)) throw new Error("项目不存在");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new Error("代码工作区仅允许本机访问");
  if (origin && new URL(origin).host !== host) throw new Error("不允许跨站访问代码工作区");
}
async function rawState(scope: string) {
  checkScope(scope);
  const rows = scope === "steward" ? listStewardMessages() : listAgentMessages(scope);
  return codexCall("init", { scope, messages: rows.map(m => ({
    id: m.id,
    role: m.role,
    parts: partsFromStoredMessage(m),
  })) });
}
export async function getCodexState(scope: string) {
  let state = await rawState(scope);
  for (const req of state.requests) {
    if (req.method === "item/tool/call" && ["getSkill", "getRule", "webSearch", "fetchPages", "fetchUrl", "deepRadarStart", "deepRadarList", "deepRadarStatus", "deepRadarProgress", "deepRadarReport", "deepRadarAct"].includes(String(req.params.tool))) {
      try { state = await respond(scope, String(req.id), true); } catch { /* Another request may have claimed it. */ }
    }
  }
  for (const req of state.requests) {
    if (req.method === "item/tool/call") req.preview = buildActionPreview({scope:scope === "steward" ? "steward" : "project",projectId:scope === "steward" ? undefined : scope,toolName:String(req.params.tool),input:req.params.arguments});
  }
  syncCodexMessages(scope, state.messages);
  return state;
}
const toolsFor = (scope: string) => scope === "steward" ? buildStewardTools() : buildProjectAgentTools(scope);
function hostOf(url: string) {
  try { return new URL(url).hostname; } catch { return ""; }
}
function explicitSkills(text: string) {
  const requested = new Set(extractSkillCommands(text).map(normalizeSkillCommand));
  if (requested.size === 0) return [];
  return listSkillsByRecentUse().filter((skill) => requested.has(normalizeSkillCommand(skill.name)));
}

function mergeSkillsById(
  ...groups: ReturnType<typeof listSkillsByRecentUse>[]
) {
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
    ...items.map(
      (item) => `\n### ${item.name}\n${item.description}\n\n${item.body}`,
    ),
  ].join("\n");
}

export async function startCodex(scope: string, text: string, rawImages: unknown, retry = false, modelId?: unknown) {
  await getCodexState(scope);
  const imageRoot = path.join(process.cwd(), "data", "codex-images") + path.sep;
  const images = (Array.isArray(rawImages) ? rawImages : []).filter((image): image is MessageImage =>
    typeof image?.id === "string" && typeof image?.name === "string" && typeof image?.url === "string" && typeof image?.path === "string" && typeof image?.mimeType === "string" && path.resolve(image.path).startsWith(imageRoot)
  ).slice(0, 9);
  if (!text?.trim() && !images.length) throw new Error("消息或图片不能为空");
  const tools = Object.entries(toolsFor(scope)).map(([name, tool]) => ({ type: "function", name, description: tool.description || name, inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodType) }));
  const toolsKey = tools.map((tool) => tool.name).sort().join("|");
  const required = listRequiredSkills();
  const explicit = explicitSkills(text).filter(
    (skill) => skill.usageMode !== "required",
  );
  const selectedSkills = mergeSkillsById(required, explicit);
  // Standing constraints apply to every agent surface, not only Steward.
  const requiredRules = listRequiredRules();
  const baseInstructions = scope === "steward" ? buildStewardSystemPrompt() : buildProjectAgentSystemPrompt(scope);
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
  const instructions = baseInstructions + libraryInstructions;
  const libraryKey = [
    ...required.map((item) => `skill:${item.id}`),
    ...explicit.map((item) => `skill:${item.id}`),
    ...requiredRules.map((item) => `rule:${item.id}`),
  ]
    .sort()
    .join("|");
  const model = await resolveCodexModel(modelId, await safeCodexModels());
  const turnSnapshot =
    scope === "steward"
      ? buildStewardTurnSnapshot()
      : buildProjectAgentTurnSnapshot(scope);
  const turnLibraryPrefix = [rulesBlock.trim(), turnSnapshot.trim()]
    .filter(Boolean)
    .join("\n\n");
  const result = await codexCall("start", {
    scope,
    text,
    images,
    retry,
    tools,
    toolsKey,
    instructions,
    // Turn-level copy so resumed threads cannot drop standing rules or stale snapshots.
    turnLibraryPrefix: turnLibraryPrefix || undefined,
    libraryKey,
    skills: selectedSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      command: skillCommandName(skill.name),
      description: skill.description,
    })),
    rules: requiredRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
    })),
    modelId: model.id,
    model: model.model,
    modelProvider: model.provider,
  });
  markSkillsUsed(selectedSkills.map((skill) => skill.id));
  return result;
}
export async function setCodexModel(scope: string, modelId: unknown) {
  checkScope(scope);
  const model = await resolveCodexModel(modelId, await safeCodexModels());
  return codexCall("model", { scope, modelId: model.id, model: model.model, modelProvider: model.provider });
}
export async function getCodexModels() {
  return getCodexModelOptions(await safeCodexModels());
}
function rejectionResultForRequest(req: { method: string; params: Record<string, unknown> }) {
  if (req.method === "item/tool/call") {
    return {
      contentItems: [
        {
          type: "inputText",
          text: JSON.stringify({ error: "用户拒绝了操作；本轮已停止，等待用户新消息" }),
        },
      ],
      success: false,
    };
  }
  if (req.method === "item/tool/requestUserInput") return { answers: {} };
  if (req.method === "item/permissions/requestApproval") {
    return { permissions: {}, scope: "turn" };
  }
  return { decision: "decline" };
}

export async function respond(scope: string, id: string, approved: boolean, answers?: Record<string, { answers: string[] }>) {
  const state = await rawState(scope);
  const req = state.requests.find(r => String(r.id) === id);
  if (!req) throw new Error("请求已失效");

  if (!approved) {
    if (req.method === "item/tool/call") {
      try { await codexCall("claim", { scope, id }); } catch { /* already claimed / gone */ }
    }
    await codexCall("respond", {
      scope,
      id,
      result: rejectionResultForRequest(req),
    });

    // Decline any siblings still waiting, then interrupt so Codex does not continue.
    const remaining = (await rawState(scope)).requests;
    for (const other of remaining) {
      try {
        if (other.method === "item/tool/call") {
          try { await codexCall("claim", { scope, id: String(other.id) }); } catch { /* ignore */ }
        }
        await codexCall("respond", {
          scope,
          id: String(other.id),
          result: rejectionResultForRequest(other),
        });
      } catch { /* request may already be gone after interrupt races */ }
    }

    try {
      await codexCall("stop", { scope });
    } catch { /* turn may already be idle */ }

    return getCodexState(scope);
  }

  let result: unknown;
  let usedSkill: { id: string; name: string; command: string; description?: string } | undefined;
  let usedRule: { id: string; name: string; description?: string } | undefined;
  let usedSearch: Record<string, unknown> | undefined;
  let usedRadar: { sessionId: string; title: string; url: string; reportUrl: string } | undefined;
  if (req.method === "item/tool/call") {
    const name = String(req.params.tool);
    const tool = toolsFor(scope)[name];
    if (!tool || !tool.execute) throw new Error("未知项目工具");
    await codexCall("claim", {scope, id});
    let output: unknown = { error: "工具执行失败" }; let success = false;
    let parsedInput: unknown;
    try {
      parsedInput = (tool.inputSchema as z.ZodType).parse(req.params.arguments);
      output = await (
        tool.execute as unknown as (
          value: unknown,
          options: {
            toolCallId: string;
            messages: unknown[];
            context?: unknown;
          },
        ) => unknown | Promise<unknown>
      )(parsedInput, {
        toolCallId: String(req.params.callId),
        messages: [],
        context: undefined,
      });
      success = true;
      if (name === "getSkill") {
        const skillId = String((parsedInput as { skillId?: unknown }).skillId || "");
        const skill = getSkill(skillId);
        if (skill) {
          usedSkill = {
            id: skill.id,
            name: skill.name,
            command: skillCommandName(skill.name),
            description: skill.description,
          };
          markSkillsUsed([skill.id]);
        }
      }
      if (name === "getRule") {
        const ruleId = String((parsedInput as { ruleId?: unknown }).ruleId || "");
        const rule = getRule(ruleId);
        if (rule) {
          usedRule = {
            id: rule.id,
            name: rule.name,
            description: rule.description,
          };
        }
      }
      if (name === "webSearch" && output && typeof output === "object") {
        const data = output as {
          searchId?: string;
          query?: string;
          sources?: string[];
          hits?: Array<{ id?: string; source?: string; title?: string; url?: string; snippet?: string }>;
        };
        if (data.searchId && data.query && Array.isArray(data.hits)) {
          usedSearch = {
            id: data.searchId,
            query: data.query,
            sources: Array.isArray(data.sources) ? data.sources : [],
            hits: data.hits
              .filter((hit) => hit && typeof hit.url === "string" && typeof hit.title === "string")
              .map((hit, index) => ({
                id: String(hit.id || `${index + 1}`),
                source: String(hit.source || "web"),
                title: String(hit.title),
                url: String(hit.url),
                ...(hit.snippet ? { snippet: String(hit.snippet) } : {}),
              })),
            pages: [],
          };
        }
      }
      if (name === "fetchPages" && output && typeof output === "object") {
        const data = output as {
          searchId?: string;
          pages?: Array<{
            url?: string;
            title?: string;
            source?: string;
            text?: string;
            error?: string;
            ok?: boolean;
          }>;
        };
        const input = parsedInput as {
          searchId?: string;
          items?: Array<{ url?: string; title?: string; source?: string }>;
        };
        const searchId = data.searchId || input.searchId || String(req.params.callId || id);
        usedSearch = {
          id: searchId,
          query: "",
          sources: [],
          hits: [],
          pages: (data.pages || [])
            .filter((page) => page && typeof page.url === "string")
            .map((page) => ({
              url: String(page.url),
              title: String(page.title || page.url),
              ...(page.source ? { source: String(page.source) } : {}),
              text: String(page.text || ""),
              ...(page.error ? { error: String(page.error) } : {}),
            })),
        };
      }
      if (name === "fetchUrl" && output && typeof output === "object") {
        const data = output as {
          searchId?: string;
          pages?: Array<{ url?: string; finalUrl?: string; title?: string; text?: string; error?: string }>;
        };
        const pages = (data.pages || []).filter((page) => page && typeof page.url === "string");
        usedSearch = {
          id: data.searchId || String(req.params.callId || id),
          query: "",
          sources: [...new Set(pages.map((page) => hostOf(String(page.finalUrl || page.url))).filter(Boolean))],
          hits: [],
          phase: "visit",
          pages: pages.map((page) => ({
            url: String(page.url),
            title: String(page.title || page.url),
            text: String(page.text || ""),
            ...(page.error ? { error: String(page.error) } : {}),
          })),
        };
      }
      if (
        success &&
        (name === "deepRadarStart" || name === "deepRadarAct") &&
        output &&
        typeof output === "object"
      ) {
        const data = output as {
          sessionId?: unknown;
          title?: unknown;
          url?: unknown;
          reportUrl?: unknown;
        };
        if (typeof data.sessionId === "string" && data.sessionId) {
          usedRadar = {
            sessionId: data.sessionId,
            title: typeof data.title === "string" ? data.title : "",
            url: typeof data.url === "string" ? data.url : "",
            reportUrl: typeof data.reportUrl === "string" ? data.reportUrl : "",
          };
        }
      }
    } catch (e) { output = { error: e instanceof Error ? e.message : "工具执行失败" }; }
    result = { contentItems: [{ type: "inputText", text: JSON.stringify(output) }], success };
  } else if (req.method === "item/tool/requestUserInput") result = { answers: answers || {} };
  else if (req.method === "item/permissions/requestApproval") result = { permissions: req.params.permissions, scope: "turn" };
  else result = { decision: "accept" };
  return codexCall("respond", { scope, id, result, usedSkill, usedRule, usedSearch, usedRadar });
}
