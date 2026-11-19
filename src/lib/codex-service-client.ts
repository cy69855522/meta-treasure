import "server-only";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { request as httpRequest } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import versionFile from "../../scripts/codex-service/version.json";
import type { CodexCatalogModel, CodexState, UIMessage } from "@/lib/codex-types";
import type { ToolPresentation } from "@/lib/codex-tool";

/**
 * The one client of the Codex service (scripts/codex-service.mjs) shared by
 * chat and Deep Radar (ADR-0001). The version comes from the same JSON file
 * the service reads, so the two can never disagree about who is outdated.
 */
export const SERVICE_VERSION: number = versionFile.version;

const stateDir = path.join(
  process.env.XDG_STATE_HOME || path.join(homedir(), ".local/state"),
  "progress-codex",
);
const socketPath = path.join(stateDir, "service.sock");
const DEFAULT_TIMEOUT_MS = 65_000;

export type ServiceRequestOptions = {
  signal?: AbortSignal;
  /** No bytes (including keepalive pings) for this long aborts the call. */
  idleMs?: number;
  /** Hard wall-clock limit. */
  wallMs?: number;
};

export type ServiceResponse = { ok: boolean; json: () => Promise<unknown> };

const formatMs = (ms: number) =>
  ms >= 60_000 ? `${Math.round(ms / 60_000)} 分钟` : `${Math.round(ms / 1000)} 秒`;

async function credentials() {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, "token");
  try {
    await fs.writeFile(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return (await fs.readFile(file, "utf8")).trim();
}

/** One HTTP call over the service socket. Understands plain JSON and NDJSON keepalive streams. */
export async function serviceRequest(
  action: string,
  body: object,
  options: ServiceRequestOptions = {},
): Promise<ServiceResponse> {
  const { signal } = options;
  const idleMs = options.idleMs ?? DEFAULT_TIMEOUT_MS;
  const wallMs = options.wallMs ?? DEFAULT_TIMEOUT_MS;
  const token = await credentials();
  return new Promise<ServiceResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("已停止"));
      return;
    }
    const startedAt = Date.now();
    let lastByteAt = startedAt;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    // Assigned after fail() is defined so cleanup() can clear it.
    // eslint-disable-next-line prefer-const
    let wallTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      clearTimeout(idleTimer);
      clearTimeout(wallTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.destroy(error);
      reject(error);
    };
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () =>
          fail(
            new Error(
              `Codex 服务空闲超时：/${action}（${formatMs(idleMs)} 未收到 keepalive/响应；已运行 ${formatMs(Date.now() - startedAt)}，距上次字节 ${formatMs(Date.now() - lastByteAt)}）`,
            ),
          ),
        idleMs,
      );
    };
    const onAbort = () => fail(new Error("已停止"));

    const req = httpRequest(
      {
        socketPath,
        path: `/${action}`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      },
      (res) => {
        const ndjson = String(res.headers["content-type"] || "").includes("ndjson");
        let responseText = "";
        let lineBuf = "";
        let finalPayload: Record<string, unknown> | undefined;

        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          lastByteAt = Date.now();
          armIdle();
          if (!ndjson) {
            responseText += chunk;
            return;
          }
          lineBuf += chunk;
          let nl = lineBuf.indexOf("\n");
          while (nl >= 0) {
            const line = lineBuf.slice(0, nl).trim();
            lineBuf = lineBuf.slice(nl + 1);
            nl = lineBuf.indexOf("\n");
            if (!line) continue;
            try {
              const row = JSON.parse(line) as { t?: string; error?: string };
              if (row.t === "ping") continue;
              if (row.t === "error") {
                fail(new Error(row.error || "Codex 执行失败"));
                return;
              }
              if (row.t === "ok") finalPayload = row as Record<string, unknown>;
            } catch {
              /* ignore partial/garbage */
            }
          }
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          cleanup();
          if (ndjson) {
            if (!finalPayload) {
              reject(new Error(`Codex 服务无完整响应：/${action}`));
              return;
            }
            resolve({ ok: true, json: async () => finalPayload });
            return;
          }
          resolve({
            ok: res.statusCode === 200,
            json: async () => JSON.parse(responseText || "{}"),
          });
        });
      },
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    req.setTimeout(0);
    armIdle();
    wallTimer = setTimeout(
      () =>
        fail(
          new Error(
            `Codex 服务墙钟超时：/${action}（已运行 ${formatMs(Date.now() - startedAt)}，上限 ${formatMs(wallMs)}）`,
          ),
        ),
      wallMs,
    );
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    req.on("close", cleanup);
    req.end(JSON.stringify(body));
  });
}

const launchState = globalThis as typeof globalThis & { __codexServiceLaunching?: Promise<void> };
const HEALTH = { idleMs: 15_000, wallMs: 15_000 };

/** Make sure a service of the current version is listening, starting or replacing it if needed. */
export async function ensureService(): Promise<void> {
  try {
    const response = await serviceRequest("health", {}, HEALTH);
    const health = (await response.json()) as { error?: string; version?: number };
    if (response.ok && health.version === SERVICE_VERSION) return;
    if (response.ok) {
      // A genuinely older/newer service. This is the only reason to stop a running one.
      const shutdown = await serviceRequest("shutdown", {}, HEALTH);
      if (!shutdown.ok) throw new Error("Codex 本机服务版本不一致，请重启开发服务器");
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fs.unlink(socketPath).catch(() => undefined);
      throw Object.assign(new Error("正在更新 Codex 本机服务"), { code: "ECONNREFUSED" });
    }
    throw new Error(health.error || "Codex 服务不可用，请重启执行服务");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code || "";
    if (!["ENOENT", "ECONNREFUSED"].includes(code)) throw error;
    if (code === "ECONNREFUSED") await fs.unlink(socketPath).catch(() => undefined);
  }
  // Dev-mode route bundles each load this module, so the in-flight launch lives on globalThis.
  launchState.__codexServiceLaunching ||= (async () => {
    await credentials();
    const proc = spawn(process.execPath, [path.join(process.cwd(), "scripts/codex-service.mjs")], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
    let launchError: Error | undefined;
    proc.on("error", (e) => {
      launchError = e;
    });
    proc.unref();
    for (let i = 0; i < 80; i++) {
      if (launchError) throw launchError;
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        if ((await serviceRequest("health", {}, { idleMs: 5_000, wallMs: 5_000 })).ok) return;
      } catch {
        /* starting */
      }
    }
    throw new Error("无法启动本机 Codex CLI，请在终端确认 codex 可运行并已登录。");
  })().finally(() => {
    launchState.__codexServiceLaunching = undefined;
  });
  await launchState.__codexServiceLaunching;
}

async function call<T>(action: string, body: object, options?: ServiceRequestOptions): Promise<T> {
  await ensureService();
  const response = await serviceRequest(action, body, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Codex 请求失败");
  return data;
}

// ---------------------------------------------------------------------------
// Typed commands: the whole interface of the service, one function each.

export type ServiceRequest = {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
  /** Someone holds the lease on this request and is running it. */
  claimed: boolean;
};

export type ServiceState = Omit<CodexState, "requests" | "messages"> & {
  initialized: boolean;
  messages: UIMessage[];
  requests: ServiceRequest[];
};

export type ToolResult = {
  contentItems: Array<{ type: "inputText"; text: string }>;
  success: boolean;
};

export type StartPayload = {
  scope: string;
  text: string;
  images: unknown[];
  retry: boolean;
  tools: Array<{ type: "function"; name: string; description: string; inputSchema: unknown }>;
  toolsKey: string;
  instructions: string;
  turnLibraryPrefix?: string;
  libraryKey: string;
  skills: Array<{ id: string; name: string; command: string; description?: string }>;
  rules: Array<{ id: string; name: string; description?: string }>;
  modelId: string | null;
  model: string | null;
  modelProvider: string | null;
};

export const codexService = {
  state: (scope: string) => call<ServiceState>("state", { scope }),
  init: (scope: string, messages: UIMessage[]) => call<ServiceState>("init", { scope, messages }),
  start: (payload: StartPayload) => call<ServiceState>("start", payload),
  stop: (scope: string) => call<ServiceState>("stop", { scope }),
  rewind: (scope: string, messageId: string, keepMessage: boolean) =>
    call<ServiceState>("rewind", { scope, messageId, keepMessage }),
  setDirectory: (scope: string, cwd: string) => call<ServiceState>("directory", { scope, cwd }),
  setModel: (
    scope: string,
    model: { modelId: string | null; model: string | null; modelProvider: string | null },
  ) => call<ServiceState>("model", { scope, ...model }),
  /** Take the lease on a tool request. `claimed: false` means someone else already has it. */
  claim: (scope: string, id: string | number, presentation?: ToolPresentation) =>
    call<{ claimed: boolean }>("claim", { scope, id, presentation }),
  /** Answer a request. A request that is gone is a no-op, not an error. */
  respond: (scope: string, id: string | number, result: unknown, presentation?: ToolPresentation) =>
    call<ServiceState>("respond", { scope, id, result, presentation }),
  models: async () => (await call<{ models?: CodexCatalogModel[] }>("models", {})).models || [],
};
