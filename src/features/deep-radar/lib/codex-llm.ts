import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getCodexModelOptions,
  resolveCodexModel,
} from "@/lib/codex-config";
import { ensureService, serviceRequest } from "@/lib/codex-service-client";
import type { LlmPort } from "@/features/deep-radar/lib/research-nodes";
import type { WorkspaceTurn } from "@/features/deep-radar/lib/research-report-write";
import { getSettings } from "@/features/deep-radar/lib/settings";
import type { MessageImage } from "@/features/deep-radar/lib/research-types";

/**
 * Client idle budget: no HTTP bytes (including keepalive pings) for this long.
 * Must stay above KEEPALIVE_MS on the service (~20s) and below wall-clock safety.
 */
const COMPLETE_IDLE_MS = 960_000;
const WORKSPACE_IDLE_MS = 360_000;
/** Hard wall-clock safety net (progress keepalives should prevent hitting this). */
const COMPLETE_WALL_MS = 10_800_000;
const WORKSPACE_WALL_MS = 10_800_000;

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
  const model = await resolveCodexModel(getSettings().codexModelId);
  const response = await serviceRequest(
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
    { signal, idleMs: COMPLETE_IDLE_MS, wallMs: COMPLETE_WALL_MS },
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
  const model = await resolveCodexModel(getSettings().codexModelId);
  const response = await serviceRequest(
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
    { signal, idleMs: WORKSPACE_IDLE_MS, wallMs: WORKSPACE_WALL_MS },
  );
  const data = (await response.json()) as {
    text?: string;
    threadId?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Codex 工作区请求失败");
  return { text: data.text || "", threadId: data.threadId || turn.threadId || "" };
}

export async function listDeepRadarModels() {
  return getCodexModelOptions();
}

export function createLlmPort(): LlmPort {
  if (process.env.DEEP_RADAR_MOCK_LLM === "1") return mockLlm();
  return {
    complete: (instructions, prompt, signal, images) =>
      completeWithCodex(instructions, prompt, signal, images),
    completeWorkspace: (turn, signal) => completeWorkspaceWithCodex(turn, signal),
  };
}
