import { copyFile, chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { tool } from "@/lib/codex-tool";

/**
 * End to end across the real seam: the Next.js client, the tool pump and the
 * human-approval path talk over the unix socket to the real
 * scripts/codex-service.mjs, which drives a scripted fake `codex app-server`.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ syncCodexMessages: vi.fn() }));

const catalog = vi.hoisted(() => ({ tools: {} as Record<string, unknown> }));
vi.mock("@/lib/agent-tools", () => ({
  buildStewardTools: () => catalog.tools,
  buildProjectAgentTools: () => catalog.tools,
  buildActionPreview: () => ({ actionLabel: "创建任务", summary: "s", diffs: [], risk: "low" }),
}));

const SCOPE = "00000000-0000-4000-8000-0000000000e2";
let dir = "";
let client: typeof import("@/lib/codex-service-client");
let requests: typeof import("@/lib/codex-requests");

const created: string[] = [];
catalog.tools = {
  webSearch: tool({
    autoApprove: true,
    description: "search",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => ({ searchId: "search-e2e", query, sources: ["baidu"], hits: [{ id: "baidu-1", source: "baidu", title: "T", url: "https://a.test", snippet: "" }] }),
    begin: ({ query }, { callId }) => ({ search: { id: callId, query, status: "searching" as const, phase: "search" as const } }),
    present: (_input, output) => ({ search: { id: output.searchId, query: output.query, hits: output.hits } }),
  }),
  createTask: tool({
    description: "mutating",
    inputSchema: z.object({ title: z.string() }),
    execute: async ({ title }) => {
      created.push(title);
      return { ok: true, title };
    },
  }),
};

const startPayload = (text: string) => ({
  scope: SCOPE, text, images: [], retry: false, tools: [], toolsKey: "k", instructions: "read only",
  libraryKey: "", skills: [], rules: [], modelId: null, model: null, modelProvider: null,
});

async function settled(predicate: (state: Awaited<ReturnType<typeof client.codexService.state>>) => boolean) {
  for (let i = 0; i < 150; i++) {
    const state = await client.codexService.state(SCOPE);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("timed out waiting for the service");
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "codex-e2e-"));
  const fake = path.join(dir, "codex");
  await copyFile(path.resolve("scripts/codex-service/fixtures/fake-codex.cjs"), fake);
  await chmod(fake, 0o700);
  process.env.XDG_STATE_HOME = dir;
  process.env.CODEX_BIN = fake;
  process.env.PROGRESS_CODEX_HOME = path.join(dir, "codex-home");
  process.env.EXPECTED_CODEX_HOME = process.env.PROGRESS_CODEX_HOME;
  // The state directory is read at import time, so import only after the env is set.
  client = await import("@/lib/codex-service-client");
  requests = await import("@/lib/codex-requests");
}, 30_000);

afterAll(async () => {
  try {
    await client.serviceRequest("shutdown", {}, { idleMs: 5_000, wallMs: 5_000 });
  } catch {
    /* already gone */
  }
  // Wait until the socket really stops answering so nothing writes into the directory we delete.
  for (let i = 0; i < 100; i++) {
    try {
      await client.serviceRequest("health", {}, { idleMs: 500, wallMs: 500 });
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await rm(dir, { recursive: true, force: true });
});

describe("codex service over the real socket", () => {
  it("launches a service whose version matches the shared version file", async () => {
    const state = await client.codexService.state(SCOPE);
    expect(state.initialized).toBe(false);
    const health = (await (await client.serviceRequest("health", {})).json()) as { version: number };
    expect(health.version).toBe(client.SERVICE_VERSION);
    await client.codexService.init(SCOPE, []);
  }, 30_000);

  it("runs read-only tools in the background pump and renders one finished search bar", async () => {
    await client.codexService.start(startPayload("search"));
    requests.ensurePump(SCOPE);
    const state = await settled((s) => s.status === "ready" || s.status === "error");
    expect(state.status).toBe("ready");
    const bars = state.messages.at(-1)!.parts.filter((part) => part.type === "search");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ id: "search-e2e", status: "done", hits: [{ id: "baidu-1" }] });
  });

  it("survives the same approval arriving twice (the original 操作正在执行或已经完成 bug)", async () => {
    await client.codexService.start(startPayload("approve"));
    const waiting = await settled((s) => s.requests.length > 0);
    const visible = requests.pendingForUser(SCOPE, waiting);
    expect(visible.map((request) => request.params.tool)).toEqual(["createTask"]);

    // Two tabs / a double click: both must resolve, and the tool must run once.
    const results = await Promise.allSettled([
      requests.answerRequest(SCOPE, String(visible[0].id), true),
      requests.answerRequest(SCOPE, String(visible[0].id), true),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(created).toEqual(["task"]);
    const state = await settled((s) => s.status === "ready" || s.status === "error");
    expect(state.status).toBe("ready");
    expect(state.requests).toHaveLength(0);

    // And a late third answer is a quiet no-op.
    await expect(requests.answerRequest(SCOPE, String(visible[0].id), true)).resolves.toBeUndefined();
    expect(created).toEqual(["task"]);
  });

  it("declining stops the turn instead of leaving it waiting", async () => {
    await client.codexService.start(startPayload("approve"));
    const waiting = await settled((s) => s.requests.length > 0);
    await requests.answerRequest(SCOPE, String(waiting.requests[0].id), false);
    const state = await settled((s) => s.status !== "streaming" && s.status !== "submitted");
    expect(state.requests).toHaveLength(0);
    expect(created).toEqual(["task"]);
  });
});
