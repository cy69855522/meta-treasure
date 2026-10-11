import "server-only";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import {
  getCodexModelOptions,
  resolveCodexModel,
} from "@/lib/codex-config";
import type { CodexCatalogModel } from "@/lib/codex-types";
import type { LlmPort } from "@/features/deep-radar/lib/research-nodes";
import type { WorkspaceTurn } from "@/features/deep-radar/lib/research-report-write";
import { getSettings } from "@/features/deep-radar/lib/settings";
import type { MessageImage } from "@/features/deep-radar/lib/research-types";

const stateDir = path.join(
  process.env.XDG_STATE_HOME || path.join(homedir(), ".local/state"),
  "progress-codex",
);
const serviceVersion = 31;
/**
 * Client idle budget: no HTTP bytes (including keepalive pings) for this long.
 * Must stay above KEEPALIVE_MS on the service (~20s) and below wall-clock safety.
 */
const COMPLETE_IDLE_MS = 960_000;
const WORKSPACE_IDLE_MS = 360_000;
/** Hard wall-clock safety net (progress keepalives should prevent hitting this). */
const COMPLETE_WALL_MS = 10_800_000;
const WORKSPACE_WALL_MS = 10_800_000;
let launching: Promise<void> | undefined;

function formatMs(ms: number) {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} 分钟`;
  return `${Math.round(ms / 1000)} 秒`;
}

async function credentials() {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, "token");
  try {
    await fs.writeFile(file, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return (await fs.readFile(file, "utf8")).trim();
}

async function request(
  action: string,
  body: object,
  signal?: AbortSignal,
  timeouts: { idleMs?: number; wallMs?: number } = {},
) {
  const idleMs = timeouts.idleMs ?? COMPLETE_IDLE_MS;
  const wallMs = timeouts.wallMs ?? COMPLETE_WALL_MS;
  const token = await credentials();
  return new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
    (resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("已停止"));
        return;
      }
      const startedAt = Date.now();
      let lastByteAt = startedAt;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      // Assigned after fail() is defined so the closure can clear it.
      // eslint-disable-next-line prefer-const
      let wallTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        clearTimeout(wallTimer);
        req.destroy(error);
        reject(error);
      };

      const armIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(
            new Error(
              `Codex 服务空闲超时：/${action}（${formatMs(idleMs)} 未收到 keepalive/响应；已运行 ${formatMs(Date.now() - startedAt)}，距上次字节 ${formatMs(Date.now() - lastByteAt)}）`,
            ),
          );
        }, idleMs);
      };

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
          const contentType = String(res.headers["content-type"] || "");
          const ndjson = contentType.includes("ndjson");
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
                const row = JSON.parse(line) as {
                  t?: string;
                  error?: string;
                  text?: string;
                  threadId?: string;
                };
                if (row.t === "ping") continue;
                if (row.t === "error") {
                  fail(new Error(row.error || "Codex 执行失败"));
                  return;
                }
                if (row.t === "ok") {
                  finalPayload = row as Record<string, unknown>;
                }
              } catch {
                /* ignore partial/garbage */
              }
            }
          });
          res.on("end", () => {
            if (settled) return;
            settled = true;
            clearTimeout(idleTimer);
            clearTimeout(wallTimer);
            signal?.removeEventListener("abort", onAbort);
            if (ndjson) {
              if (!finalPayload) {
                reject(new Error(`Codex 服务无完整响应：/${action}`));
                return;
              }
              resolve({
                ok: true,
                json: async () => finalPayload,
              });
              return;
            }
            resolve({
              ok: res.statusCode === 200,
              json: async () => JSON.parse(responseText || "{}"),
            });
          });
        },
      );
      const onAbort = () => {
        fail(new Error("已停止"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      req.setTimeout(0);
      armIdle();
      wallTimer = setTimeout(() => {
        fail(
          new Error(
            `Codex 服务墙钟超时：/${action}（已运行 ${formatMs(Date.now() - startedAt)}，上限 ${formatMs(wallMs)}）`,
          ),
        );
      }, wallMs);
      req.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        clearTimeout(wallTimer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
      req.on("close", () => {
        clearTimeout(idleTimer);
        clearTimeout(wallTimer);
        signal?.removeEventListener("abort", onAbort);
      });
      req.end(JSON.stringify(body));
    },
  );
}

async function ensureService() {
  try {
    const r = await request("health", {}, undefined, {
      idleMs: 15_000,
      wallMs: 15_000,
    });
    const health = (await r.json()) as { error?: string; version?: number };
    if (r.ok && health.version === serviceVersion) return;
    if (r.ok) {
      await request("shutdown", {}, undefined, { idleMs: 15_000, wallMs: 15_000 });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fs.unlink(path.join(stateDir, "service.sock")).catch(() => undefined);
      throw Object.assign(new Error("正在更新 Codex 本机服务"), {
        code: "ECONNREFUSED",
      });
    }
    throw new Error(health.error || "Codex 服务不可用");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code || "";
    if (!["ENOENT", "ECONNREFUSED"].includes(code)) throw error;
    if (code === "ECONNREFUSED") {
      await fs.unlink(path.join(stateDir, "service.sock")).catch(() => undefined);
    }
  }
  launching ||= (async () => {
    await credentials();
    const proc = spawn(
      process.execPath,
      [path.join(process.cwd(), "scripts/codex-service.mjs")],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
      },
    );
    let launchError: Error | undefined;
    proc.on("error", (e) => {
      launchError = e;
    });
    proc.unref();
    for (let i = 0; i < 80; i++) {
      if (launchError) throw launchError;
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        if (
          (
            await request("health", {}, undefined, {
              idleMs: 5_000,
              wallMs: 5_000,
            })
          ).ok
        )
          return;
      } catch {
        /* starting */
      }
    }
    throw new Error("无法启动本机 Codex CLI，请确认已登录 codex。");
  })().finally(() => {
    launching = undefined;
  });
  await launching;
}

export function mockLlm(): LlmPort {
  return {
    async complete(instructions) {
      if (instructions.includes("访谈官")) {
        return JSON.stringify({
          done: true,
          question: null,
        });
      }
      if (instructions.includes("纲要")) {
        return JSON.stringify({
          goal: "澄清用户提出的研究问题，并核对公开材料里能不能站住。",
          objectives: [
            "核对核心事实、出处和主要争议分别是什么。",
          ],
          exclusions: [],
        });
      }
      if (instructions.includes("搜索词")) {
        return JSON.stringify({
          queryZh: "相关研究 综述",
          queryEn: "related research survey",
          targetQuestion: "公开材料如何综述这个问题？",
        });
      }
      if (instructions.includes("筛选")) {
        return JSON.stringify({
          reviews: [],
          cited: [],
        });
      }
      if (instructions.includes("探索器")) {
        return JSON.stringify({ tool: "done" });
      }
      if (instructions.includes("书记员")) {
        return JSON.stringify({
          summary: "本轮材料有限。",
          analysis: "需要更多一手来源，资料尚未满足大纲要求。",
          shouldStop: true,
        });
      }
      if (instructions.includes("撰写策划") || instructions.includes("撰写计划")) {
        return JSON.stringify({
          title: "研究报告撰写计划",
          markdown:
            "## 结构\n1. 结论与证据\n2. 判断与分歧\n3. 下一步\n",
          keywords: ["一手来源"],
        });
      }
      return JSON.stringify({
        tool: "answer",
        text: "目前只能基于已抓取材料回答。若要继续搜，请说明新的角度。",
      });
    },
    async completeWorkspace(turn) {
      const markdown = `# 研究报告

现有材料只能给出==初步判断==。

根据 [现有材料](https://example.com/a)，证据仍不足，谨慎采信。下一步补读高赞原帖并交叉验证公开材料。
`;
      await fs.writeFile(path.join(turn.cwd, "report.md"), markdown, "utf8");
      await fs.writeFile(path.join(turn.cwd, "STATUS.md"), "DONE\n", "utf8");
      return { text: "ok", threadId: turn.threadId || "mock-thread" };
    },
  };
}

export async function completeWithCodex(
  instructions: string,
  prompt: string,
  signal?: AbortSignal,
  images?: MessageImage[],
): Promise<string> {
  await ensureService();
  const catalog = await listCodexCatalog().catch(() => [] as CodexCatalogModel[]);
  const model = await resolveCodexModel(getSettings().codexModelId, catalog);
  const response = await request(
    "complete",
    {
      instructions,
      text: prompt,
      model: model.model,
      modelProvider: model.provider,
      images: (images ?? [])
        .filter((image) => typeof image.path === "string")
        .slice(0, 9)
        .map((image) => ({ path: image.path })),
    },
    signal,
    { idleMs: COMPLETE_IDLE_MS, wallMs: COMPLETE_WALL_MS },
  );
  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) throw new Error(data.error || "Codex 请求失败");
  return data.text || "";
}

export async function completeWorkspaceWithCodex(
  turn: WorkspaceTurn,
  signal?: AbortSignal,
): Promise<{ text: string; threadId: string }> {
  await ensureService();
  const catalog = await listCodexCatalog().catch(() => [] as CodexCatalogModel[]);
  const model = await resolveCodexModel(getSettings().codexModelId, catalog);
  const response = await request(
    "workspace",
    {
      instructions: turn.instructions,
      text: turn.text,
      cwd: turn.cwd,
      threadId: turn.threadId,
      model: model.model,
      modelProvider: model.provider,
      images: (turn.images ?? [])
        .filter((image) => typeof image.path === "string")
        .slice(0, 9)
        .map((image) => ({ path: image.path })),
    },
    signal,
    { idleMs: WORKSPACE_IDLE_MS, wallMs: WORKSPACE_WALL_MS },
  );
  const data = (await response.json()) as {
    text?: string;
    threadId?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Codex 工作区请求失败");
  return { text: data.text || "", threadId: data.threadId || turn.threadId || "" };
}

export async function listCodexCatalog(): Promise<CodexCatalogModel[]> {
  await ensureService();
  const response = await request("models", {});
  const data = (await response.json()) as {
    models?: CodexCatalogModel[];
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "无法读取 Codex 模型");
  return data.models || [];
}

export async function listDeepRadarModels() {
  try {
    return await getCodexModelOptions(await listCodexCatalog());
  } catch {
    return getCodexModelOptions([]);
  }
}

export function createLlmPort(): LlmPort {
  if (process.env.DEEP_RADAR_MOCK_LLM === "1") return mockLlm();
  return {
    complete: (instructions, prompt, signal, images) =>
      completeWithCodex(instructions, prompt, signal, images),
    completeWorkspace: (turn, signal) => completeWorkspaceWithCodex(turn, signal),
  };
}
