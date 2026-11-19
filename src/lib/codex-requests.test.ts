import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { tool } from "@/lib/codex-tool";

vi.mock("server-only", () => ({}));

const service = vi.hoisted(() => ({
  state: vi.fn(),
  claim: vi.fn(),
  respond: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/lib/codex-service-client", () => ({ codexService: service }));

const catalog = vi.hoisted(() => ({ tools: {} as Record<string, unknown> }));
vi.mock("@/lib/agent-tools", () => ({
  buildStewardTools: () => catalog.tools,
  buildProjectAgentTools: () => catalog.tools,
  buildActionPreview: () => ({ actionLabel: "创建任务", summary: "s", diffs: [], risk: "low" }),
}));
const sync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ syncCodexMessages: sync }));

import { answerRequest, ensurePump, pendingForUser, prepareToolCall } from "@/lib/codex-requests";

const searchTool = tool({
  autoApprove: true,
  description: "search",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ ok: true, query }),
  begin: ({ query }, { callId }) => ({ search: { id: callId, query, status: "searching" } }),
  present: (_input, output) => ({ search: { id: "search-1", query: output.query } }),
});
const brokenTool = tool({
  autoApprove: true,
  description: "broken",
  inputSchema: z.object({ query: z.string() }),
  execute: async () => {
    throw new Error("boom");
  },
  begin: ({ query }, { callId }) => ({ search: { id: callId, query, status: "searching" } }),
});
const createTask = tool({
  description: "mutating",
  inputSchema: z.object({ title: z.string() }),
  execute: async ({ title }) => ({ ok: true, title }),
});

type Req = { id: number; method: string; params: Record<string, unknown>; claimed: boolean };
const call = (id: number, name: string, args: Record<string, unknown> = {}, claimed = false): Req => ({
  id,
  method: "item/tool/call",
  params: { tool: name, callId: `call-${id}`, arguments: args },
  claimed,
});
const stateOf = (requests: Req[], status = "streaming") => ({
  scope: "steward", rev: 1, initialized: true, messages: [], requests, status,
});
const store = globalThis as unknown as Record<string, Map<string, unknown> | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  catalog.tools = { webSearch: searchTool, broken: brokenTool, createTask };
  store.__codexTools?.clear();
  store.__codexSynced?.clear();
  service.claim.mockResolvedValue({ claimed: true });
  service.respond.mockResolvedValue(stateOf([], "ready"));
  service.stop.mockResolvedValue(stateOf([], "ready"));
});

describe("prepareToolCall", () => {
  it("runs the tool and presents the result", async () => {
    const prepared = prepareToolCall(searchTool, call(1, "webSearch", { query: "q" }));
    expect(prepared.begin?.search).toMatchObject({ id: "call-1", status: "searching" });
    const outcome = await prepared.run();
    expect(outcome.result.success).toBe(true);
    expect(outcome.presentation?.search?.id).toBe("search-1");
  });

  it("turns a throwing tool into a failed result and closes its progress bar", async () => {
    const outcome = await prepareToolCall(brokenTool, call(2, "broken", { query: "q" })).run();
    expect(outcome.result.success).toBe(false);
    expect(outcome.result.contentItems[0].text).toContain("boom");
    expect(outcome.presentation?.search).toMatchObject({ id: "call-2", status: "error", error: "boom" });
  });

  it("answers unknown tools instead of leaving the turn stuck", async () => {
    const outcome = await prepareToolCall(undefined, call(3, "nope")).run();
    expect(outcome.result.success).toBe(false);
    expect(outcome.result.contentItems[0].text).toContain("未知项目工具");
  });

  it("answers invalid arguments instead of throwing", async () => {
    const outcome = await prepareToolCall(searchTool, call(4, "webSearch", { query: 5 })).run();
    expect(outcome.result.success).toBe(false);
  });
});

describe("pendingForUser", () => {
  it("hides auto-approved tools and requests somebody already holds", () => {
    const requests = [
      call(1, "webSearch", { query: "q" }),
      call(2, "createTask", { title: "t" }),
      call(3, "createTask", { title: "t" }, true),
    ];
    const visible = pendingForUser("steward", stateOf(requests) as never);
    expect(visible.map((request) => request.id)).toEqual([2]);
    expect(visible[0].preview?.actionLabel).toBe("创建任务");
  });
});

describe("answerRequest", () => {
  it("approving a tool claims, runs and answers it exactly once", async () => {
    service.state.mockResolvedValue(stateOf([call(7, "createTask", { title: "t" })]));
    await answerRequest("steward", "7", true);
    expect(service.claim).toHaveBeenCalledTimes(1);
    expect(service.respond).toHaveBeenCalledTimes(1);
    expect(service.respond.mock.calls[0][2]).toMatchObject({ success: true });
  });

  it("does not run or throw when someone else already owns the request", async () => {
    service.state.mockResolvedValue(stateOf([call(7, "createTask", { title: "t" })]));
    service.claim.mockResolvedValue({ claimed: false });
    await expect(answerRequest("steward", "7", true)).resolves.toBeUndefined();
    expect(service.respond).not.toHaveBeenCalled();
  });

  it("treats a vanished request as already answered", async () => {
    service.state.mockResolvedValue(stateOf([]));
    await expect(answerRequest("steward", "7", true)).resolves.toBeUndefined();
    await expect(answerRequest("steward", "7", false)).resolves.toBeUndefined();
    expect(service.claim).not.toHaveBeenCalled();
    expect(service.stop).not.toHaveBeenCalled();
  });

  it("declining answers every pending request and stops the turn", async () => {
    service.state.mockResolvedValue(
      stateOf([call(7, "createTask", { title: "t" }), call(8, "createTask", { title: "u" })]),
    );
    await answerRequest("steward", "7", false);
    expect(service.respond.mock.calls.map((args) => args[1])).toEqual([7, 8]);
    expect(service.respond.mock.calls[0][2]).toMatchObject({ success: false });
    expect(service.stop).toHaveBeenCalledTimes(1);
  });
});

describe("ensurePump", () => {
  it("runs auto-approved tools without any client and mirrors the finished chat", async () => {
    service.state
      .mockResolvedValueOnce(stateOf([call(1, "webSearch", { query: "q" })]))
      .mockResolvedValue(stateOf([], "ready"));
    ensurePump("steward");
    ensurePump("steward"); // a second caller must not start a second pump
    await store.__codexPumps?.get("steward");
    expect(service.claim).toHaveBeenCalledTimes(1);
    expect(service.claim.mock.calls[0][2]).toMatchObject({ search: { status: "searching" } });
    expect(service.respond).toHaveBeenCalledTimes(1);
    expect(service.respond.mock.calls[0][3]).toMatchObject({ search: { id: "search-1" } });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("leaves human-approval tools alone", async () => {
    service.state
      .mockResolvedValueOnce(stateOf([call(2, "createTask", { title: "t" })]))
      .mockResolvedValue(stateOf([], "ready"));
    ensurePump("steward");
    await store.__codexPumps?.get("steward");
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("does not run a tool whose lease another worker holds", async () => {
    service.state
      .mockResolvedValueOnce(stateOf([call(3, "webSearch", { query: "q" }, true)]))
      .mockResolvedValue(stateOf([], "ready"));
    ensurePump("steward");
    await store.__codexPumps?.get("steward");
    expect(service.claim).not.toHaveBeenCalled();
  });
});
