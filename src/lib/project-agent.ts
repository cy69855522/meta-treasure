import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import {
  agentToolApproval,
  buildProjectAgentTools,
} from "@/lib/agent-tools";
import {
  AGENT_PROMPT_MESSAGE_LIMIT,
  STEWARD_HANDOFF_MESSAGE_MAX_CHARS,
  STEWARD_HANDOFF_ROUNDS,
} from "@/lib/constants";
import {
  createAgentMessage,
  ensureProjectAgent,
  getProject,
  listAgentMemoryNotes,
  listStewardMessages,
  listTasks,
} from "@/lib/db";
import { LANE_LABELS, NOW_WIP_LIMIT, type Lane, type Task } from "@/lib/types";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function createProjectLlm() {
  const openai = createOpenAI({
    apiKey: requireEnv("BBOLUO_API_KEY"),
    baseURL: requireEnv("BBOLUO_BASE_URL"),
    name: "bboluo",
  });
  // Use Chat Completions — many OpenAI-compatible gateways do not support /responses.
  const modelId = process.env.BBOLUO_MODEL?.trim() || "[L]gemini-2.5-flash";
  return openai.chat(modelId);
}

function formatLaneTasks(
  lane: Extract<Lane, "now" | "next" | "later" | "done">,
  tasks: Task[],
): string {
  const label = LANE_LABELS[lane];
  if (tasks.length === 0) return `- ${label}: （空）`;
  return `- ${label}:\n${tasks.map((t) => `  - ${t.title} (id=${t.id})`).join("\n")}`;
}

export function buildBoardSnapshot(projectId: string): string {
  const tasks = listTasks({ projectId });
  const byLane = (lane: Lane) =>
    tasks
      .filter((t) => t.lane === lane)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const nowTasks = byLane("now");
  const doneTasks = byLane("done").slice(-8);

  return [
    `Now WIP：${nowTasks.length}/${NOW_WIP_LIMIT}`,
    formatLaneTasks("now", nowTasks),
    formatLaneTasks("next", byLane("next")),
    formatLaneTasks("later", byLane("later")),
    formatLaneTasks("done", doneTasks),
  ].join("\n");
}

function clipHandoffText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "（空）";
  if (trimmed.length <= STEWARD_HANDOFF_MESSAGE_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, STEWARD_HANDOFF_MESSAGE_MAX_CHARS)}…`;
}

/** Recent Steward dialogue for Project Agent context (read-only handoff). */
export function buildStewardRecentDialogueBlock(): string {
  const messages = listStewardMessages({
    limit: STEWARD_HANDOFF_ROUNDS * 2,
  });
  if (messages.length === 0) return "（暂无总管家对话）";

  return messages
    .map((m) => {
      const who = m.role === "user" ? "用户" : "总管家";
      return `${who}：${clipHandoffText(m.content)}`;
    })
    .join("\n\n");
}

export function buildProjectAgentSystemPrompt(projectId: string): string {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");

  const agent = ensureProjectAgent(projectId);
  const notes = listAgentMemoryNotes(projectId);
  const notesBlock =
    notes.length === 0
      ? "（暂无长期笔记）"
      : notes
          .map(
            (n, i) =>
              `${i + 1}. ${n.title || "无标题"} (id=${n.id})\n${n.body || "（空）"}`,
          )
          .join("\n\n");

  const custom = agent.systemPrompt.trim();

  return [
    "你是该项目的顾问（Project Agent）。",
    "你可以分析进度、讨论想法、在用户迷茫时给方向。",
    "若要增删改长期笔记或任务，必须调用对应 function tool；系统会先让用户预览确认，通过后才会真正落库。",
    "在用户确认前，不要声称已经改过看板或笔记。",
    "若用户拒绝某次 tool 执行，不要重试同一操作；告知未应用即可。",
    "对用户说话时只用项目名、任务标题、笔记标题等可读名称；禁止在回复正文中写出 id / UUID / 哈希。",
    "快照里的 id=… 仅供 tool 参数使用（更新/删除时填入）；不要抄进对话。",
    "下方看板与笔记快照在每次用户发消息时都会重新读取，是本项目当前唯一事实来源。",
    "「近期总管家对话」为只读参考，可用来承接用户刚与总管家对齐的方向；若与本项目看板/笔记冲突，以本项目快照为准。",
    "不要根据总管家摘录声称对方已改过本项目看板或笔记。",
    "若历史对话与本次快照冲突，以本次快照为准，不要沿用过时任务/泳道状态。",
    `Now 列 WIP 上限为 ${NOW_WIP_LIMIT}。`,
    "",
    `项目名称：${project.name}`,
    `项目说明：${project.description || "（无）"}`,
    "",
    "=== 长期笔记 ===",
    notesBlock,
    "",
    "=== 当前看板快照 ===",
    buildBoardSnapshot(projectId),
    "",
    `=== 近期总管家对话（最近 ${STEWARD_HANDOFF_ROUNDS} 轮，只读参考） ===`,
    buildStewardRecentDialogueBlock(),
    custom ? `\n=== 额外指令 ===\n${custom}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractLastUserText(
  messages: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
    content?: string;
  }>,
): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  if (typeof lastUser.content === "string" && lastUser.content.trim()) {
    return lastUser.content.trim();
  }
  const text = (lastUser.parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
    .trim();
  return text;
}

export async function streamProjectAgentChat(input: {
  projectId: string;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
}) {
  const project = getProject(input.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  ensureProjectAgent(input.projectId);

  const last = input.uiMessages.at(-1);
  const isContinuation = last?.role === "assistant";

  if (!isContinuation) {
    const userText = extractLastUserText(input.uiMessages);
    if (!userText) {
      throw new Error("Empty user message");
    }
    createAgentMessage({
      projectId: input.projectId,
      role: "user",
      content: userText,
    });
  }

  const tools = buildProjectAgentTools(input.projectId);
  const recent = input.uiMessages.slice(-AGENT_PROMPT_MESSAGE_LIMIT);
  const messages = await convertToModelMessages(recent, { tools });

  return streamText({
    model: createProjectLlm(),
    system: buildProjectAgentSystemPrompt(input.projectId),
    messages,
    tools,
    toolApproval: agentToolApproval(),
    stopWhen: isStepCount(8),
    abortSignal: input.abortSignal,
    onFinish: ({ text }) => {
      if (!text.trim()) return;
      createAgentMessage({
        projectId: input.projectId,
        role: "assistant",
        content: text,
      });
    },
  });
}
