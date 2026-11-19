import "server-only";
import { buildActionPreview, buildProjectAgentTools, buildStewardTools } from "@/lib/agent-tools";
import {
  codexService,
  type ServiceRequest,
  type ServiceState,
  type ToolResult,
} from "@/lib/codex-service-client";
import type { CodexTool, ToolPresentation, ToolSet } from "@/lib/codex-tool";
import type { CodexRequest, CodexState } from "@/lib/codex-types";
import { syncCodexMessages } from "@/lib/db";

/**
 * Everything that happens to a Codex tool request on the Next.js side.
 *
 * Ownership rules (the reason the old "操作正在执行或已经完成" error cannot recur):
 *  - A request is claimed (leased) in the service before anyone runs it; the
 *    loser of a claim simply does nothing.
 *  - Tools that declare `autoApprove` are run by ONE background pump per scope,
 *    never by GET handlers, and are never shown to the user.
 *  - Everything else waits for a person; answering it twice is harmless.
 */

const g = globalThis as typeof globalThis & {
  __codexPumps?: Map<string, Promise<void>>;
  __codexInflight?: Set<string>;
  __codexSynced?: Map<string, number>;
  __codexTools?: Map<string, ToolSet>;
};
const pumps = (g.__codexPumps ??= new Map());
const inflight = (g.__codexInflight ??= new Set());
const synced = (g.__codexSynced ??= new Map());
const toolCache = (g.__codexTools ??= new Map());

const PUMP_INTERVAL_MS = 300;
const PUMP_MAX_MS = 2 * 60 * 60 * 1000;

export const isBusy = (state: Pick<ServiceState, "status">) =>
  state.status === "submitted" || state.status === "streaming";

export function toolsFor(scope: string): ToolSet {
  let tools = toolCache.get(scope);
  if (!tools) {
    tools = scope === "steward" ? buildStewardTools() : buildProjectAgentTools(scope);
    toolCache.set(scope, tools);
  }
  return tools;
}

const isToolCall = (request: ServiceRequest) => request.method === "item/tool/call";
const toolOf = (scope: string, request: ServiceRequest): CodexTool | undefined =>
  isToolCall(request) ? toolsFor(scope)[String(request.params.tool)] : undefined;

export const isAutoRequest = (scope: string, request: ServiceRequest) =>
  toolOf(scope, request)?.autoApprove === true;

// ---------------------------------------------------------------------------
// Running one tool call

type ToolOutcome = { result: ToolResult; presentation?: ToolPresentation };

const toolResult = (payload: unknown, success: boolean): ToolResult => ({
  contentItems: [{ type: "inputText", text: JSON.stringify(payload) }],
  success,
});

/** Turn a progress presentation into its failed twin so the status bar never keeps spinning. */
function failedPresentation(begin: ToolPresentation | undefined, message: string) {
  return begin?.search
    ? ({ search: { ...begin.search, status: "error", error: message } } satisfies ToolPresentation)
    : undefined;
}

/** Validate the arguments and describe the call; `run()` executes it and never throws. */
export function prepareToolCall(tool: CodexTool | undefined, request: ServiceRequest) {
  const callId = String(request.params.callId ?? request.id);
  let input: unknown;
  let begin: ToolPresentation | undefined;
  let problem: string | undefined;
  if (!tool?.execute) {
    problem = "未知项目工具";
  } else {
    try {
      input = tool.inputSchema.parse(request.params.arguments);
      begin = (tool.begin as ((i: unknown, c: { callId: string }) => ToolPresentation | undefined) | undefined)?.(input, { callId });
    } catch (error) {
      problem = error instanceof Error ? error.message : "工具参数无效";
    }
  }
  return {
    begin,
    async run(): Promise<ToolOutcome> {
      if (problem || !tool?.execute) {
        return { result: toolResult({ error: problem }, false) };
      }
      try {
        const output = await (
          tool.execute as unknown as (
            value: unknown,
            options: { toolCallId: string; messages: unknown[]; context?: unknown },
          ) => unknown | Promise<unknown>
        )(input, { toolCallId: callId, messages: [], context: undefined });
        const present = tool.present as
          | ((i: unknown, o: unknown, c: { callId: string }) => ToolPresentation | undefined)
          | undefined;
        return { result: toolResult(output, true), presentation: present?.(input, output, { callId }) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "工具执行失败";
        return { result: toolResult({ error: message }, false), presentation: failedPresentation(begin, message) };
      }
    },
  };
}

/** Claim, run and answer a tool call. Silently does nothing if someone else owns it. */
async function runToolRequest(scope: string, request: ServiceRequest) {
  const call = prepareToolCall(toolOf(scope, request), request);
  const { claimed } = await codexService.claim(scope, request.id, call.begin);
  if (!claimed) return;
  const outcome = await call.run();
  await codexService.respond(scope, request.id, outcome.result, outcome.presentation);
}

// ---------------------------------------------------------------------------
// Auto-approved tools: one pump per scope, independent of any browser.

export function syncMessagesOnce(scope: string, state: ServiceState) {
  if (isBusy(state) || synced.get(scope) === state.rev) return;
  syncCodexMessages(scope, state.messages);
  synced.set(scope, state.rev);
}

async function pump(scope: string) {
  const running = new Set<Promise<void>>();
  const deadline = Date.now() + PUMP_MAX_MS;
  try {
    while (Date.now() < deadline) {
      const state = await codexService.state(scope);
      for (const request of state.requests) {
        const key = `${scope}:${request.id}`;
        if (request.claimed || inflight.has(key) || !isAutoRequest(scope, request)) continue;
        inflight.add(key);
        const job: Promise<void> = runToolRequest(scope, request)
          .catch((error) => console.error(`[codex] ${scope} 工具 ${String(request.params.tool)} 失败:`, error))
          .finally(() => {
            inflight.delete(key);
            running.delete(job);
          });
        running.add(job);
      }
      if (!isBusy(state) && running.size === 0) {
        syncMessagesOnce(scope, state);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, PUMP_INTERVAL_MS));
    }
  } catch (error) {
    // Service unreachable: the next GET revives the pump.
    console.error(`[codex] ${scope} 后台处理已停止:`, error);
  }
}

/** Idempotent. Call whenever a turn starts or a client notices a busy session. */
export function ensurePump(scope: string) {
  if (pumps.has(scope)) return;
  pumps.set(scope, pump(scope).finally(() => pumps.delete(scope)));
}

// ---------------------------------------------------------------------------
// Requests that need a person

/** What the person is asked to decide: no leased request, no auto-approved tool. */
export function pendingForUser(scope: string, state: ServiceState): CodexRequest[] {
  return state.requests
    .filter((request) => !request.claimed && !isAutoRequest(scope, request))
    .map(({ id, method, params }): CodexRequest => {
      let preview: CodexRequest["preview"];
      if (method === "item/tool/call") {
        try {
          preview = buildActionPreview({
            scope: scope === "steward" ? "steward" : "project",
            projectId: scope === "steward" ? undefined : scope,
            toolName: String(params.tool),
            input: params.arguments,
          });
        } catch {
          preview = undefined;
        }
      }
      return { id, method, params, ...(preview ? { preview } : {}) };
    });
}

const declineResult = (request: ServiceRequest) =>
  isToolCall(request)
    ? toolResult({ error: "用户拒绝了操作；本轮已停止，等待用户新消息" }, false)
    : request.method === "item/tool/requestUserInput"
      ? { answers: {} }
      : { decision: "decline" };

async function declineEverything(scope: string, state: ServiceState) {
  for (const request of state.requests) {
    try {
      await codexService.respond(scope, request.id, declineResult(request));
    } catch {
      /* request may already be gone after an interrupt race */
    }
  }
  try {
    await codexService.stop(scope);
  } catch {
    /* turn may already be idle */
  }
}

/**
 * The user's answer to a pending request. Idempotent: a request that is gone
 * (answered on another device, turn ended) or already running is not an error.
 */
export async function answerRequest(
  scope: string,
  id: string,
  approved: boolean,
  answers?: Record<string, { answers: string[] }>,
) {
  const state = await codexService.state(scope);
  const request = state.requests.find((item) => String(item.id) === String(id));
  if (!request) return;
  if (!approved) return declineEverything(scope, state);
  if (isToolCall(request)) return runToolRequest(scope, request);
  await codexService.respond(scope, request.id, { answers: answers || {} });
}

/** Wire format of the client-visible state. */
export const toClientState = (scope: string, state: ServiceState): CodexState => ({
  ...state,
  requests: pendingForUser(scope, state),
});
