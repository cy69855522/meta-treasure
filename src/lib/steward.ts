import "server-only";
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { agentToolApproval, buildStewardTools } from "@/lib/agent-tools";
import {
  AGENT_PROMPT_MESSAGE_LIMIT,
  STEWARD_DONE_HISTORY_LIMIT,
} from "@/lib/constants";
import {
  createStewardMessage,
  listActiveProjects,
  listAgentMemoryNotes,
  listPiggyBankProjects,
  listRuleFolders,
  listRules,
  listStewardMemoryNotes,
  listTasks,
} from "@/lib/db";
import {
  buildSkillsCatalogBlock,
  SKILL_LOAD_PROMPT_LINES,
} from "@/lib/library-catalog";
import { createProjectLlm } from "@/lib/project-agent";
import { LANE_LABELS, NOW_WIP_LIMIT, type Lane, type Task } from "@/lib/types";

function formatDoneTask(task: Task): string {
  const start = task.startedAt ?? task.createdAt;
  const end = task.completedAt ?? task.updatedAt;
  return `  - ${task.title} (id=${task.id})（${start.slice(0, 10)} → ${end.slice(0, 10)}）`;
}

function formatProjectSnapshot(
  project: {
    id: string;
    name: string;
    slug: string;
    description: string;
    color: string;
  },
  options?: { parked?: boolean },
): string {
  const tasks = listTasks({ projectId: project.id });
  const byLane = (lane: Lane) =>
    tasks
      .filter((t) => t.lane === lane)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const now = byLane("now");
  const next = byLane("next");
  const later = byLane("later");
  const done = byLane("done")
    .sort((a, b) => {
      const ae = a.completedAt ?? a.updatedAt;
      const be = b.completedAt ?? b.updatedAt;
      return ae.localeCompare(be);
    })
    .slice(-STEWARD_DONE_HISTORY_LIMIT);

  const notes = listAgentMemoryNotes(project.id);
  const notesBlock =
    notes.length === 0
      ? "  （无项目长期笔记）"
      : notes
          .map(
            (n) =>
              `  - ${n.title || "无标题"} (id=${n.id}): ${n.body || "（空）"}`,
          )
          .join("\n");

  const laneLine = (lane: Lane, list: Task[]) => {
    if (list.length === 0) return `  ${LANE_LABELS[lane]}: （空）`;
    return `  ${LANE_LABELS[lane]}:\n${list.map((t) => `    - ${t.title} (id=${t.id})`).join("\n")}`;
  };

  return [
    `### ${project.name}${options?.parked ? "（项目储蓄罐）" : ""}`,
    `projectId=${project.id} · slug: ${project.slug} · color: ${project.color}`,
    `说明: ${project.description || "（无）"}`,
    options?.parked
      ? "状态: 在项目储蓄罐内（侧边栏隐藏，不参与 Project Order）"
      : null,
    `Now WIP: ${now.length}/${NOW_WIP_LIMIT}`,
    laneLine("now", now),
    laneLine("next", next),
    laneLine("later", later),
    done.length === 0
      ? `  最近 Done（最多 ${STEWARD_DONE_HISTORY_LIMIT}）: （空）`
      : `  最近 Done（最多 ${STEWARD_DONE_HISTORY_LIMIT}）:\n${done.map(formatDoneTask).join("\n")}`,
    "  项目长期笔记:",
    notesBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPiggyBankBlock(): string {
  const parked = listPiggyBankProjects();
  if (parked.length === 0) return "（空）";
  return parked
    .map((project) => formatProjectSnapshot(project, { parked: true }))
    .join("\n\n");
}

function buildProjectPortfolioBlock(): string {
  const projects = listActiveProjects();
  if (projects.length === 0) return "（暂无活跃项目；见项目储蓄罐）";

  return projects.map((project) => formatProjectSnapshot(project)).join("\n\n");
}

function buildInboxBlock(): string {
  const inbox = listTasks({ inboxOnly: true }).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  if (inbox.length === 0) return "（收件箱为空）";
  return inbox.map((t) => `- ${t.title} (id=${t.id})`).join("\n");
}

function buildRulesCatalogBlock(): string {
  const folders = listRuleFolders();
  if (folders.length === 0) return "（规则库为空）";

  return folders
    .map((folder) => {
      const rules = listRules(folder.id);
      const header = `### 文件夹：${folder.name} (id=${folder.id})`;
      if (rules.length === 0) {
        return `${header}\n（无规则）`;
      }
      return [
        header,
        ...rules.map(
          (r) =>
            `- ${r.name} (id=${r.id}): ${r.description.trim() || "（无 description）"}`,
        ),
      ].join("\n");
    })
    .join("\n\n");
}

export function buildStewardSystemPrompt(): string {
  const stewardNotes = listStewardMemoryNotes();
  const stewardNotesBlock =
    stewardNotes.length === 0
      ? "（暂无总管家长期笔记）"
      : stewardNotes
          .map(
            (n, i) =>
              `${i + 1}. ${n.title || "无标题"} (id=${n.id})\n${n.body || "（空）"}`,
          )
          .join("\n\n");

  return [
    "你是工作区的总管家（Steward）：跨项目顾问。",
    "你可以综览活跃项目与项目储蓄罐内项目的节奏、收件箱堆积、技能库/规则库目录与各项目长期笔记，帮助用户做取舍、排优先级、化解迷茫。",
    "若要增删改总管家长期笔记、任意任务、技能库或规则库，必须调用对应 function tool；系统会先让用户预览确认，通过后才会真正落库。",
    "要把任务标为完成时，优先调用 completeTask（移入 Done），不要用 deleteTask。",
    "在用户确认前，不要声称已经改过看板、笔记、技能或规则。",
    "若用户拒绝某次 tool 执行，不要重试同一操作；告知未应用即可。",
    "对用户说话时只用项目名、任务标题、笔记标题、技能/规则名等可读名称；禁止在回复正文中写出 id / UUID / 哈希。",
    "快照里的 id=… / projectId=… / folderId=… 仅供 tool 参数使用；创建任务到项目时用 projectId。不要把这些标识抄进对话。",
    "下方「收件箱 / 活跃项目组合 / 项目储蓄罐 / 笔记 / 技能库 / 规则库」在每次用户发消息时都会重新从数据库读取，是当前唯一事实来源。",
    "若历史对话里提到的任务/泳道/项目状态与本次快照不一致，必须以本次快照为准，不要沿用过时说法。",
    "可用 reorderProjects 调整活跃项目顺序（必须完整列出全部活跃 projectId）；用 moveProjectToPiggyBank / restoreProjectFromPiggyBank 移入或移出储蓄罐。",
    "储蓄罐内项目不参与 Project Order，也不出现在侧边栏活跃列表；但其看板与长期笔记仍出现在下方「项目储蓄罐」快照中，可据此讨论是否移出或暂缓。",
    "技能库：getSkill（只读，含正文）/ createSkillFolder / updateSkillFolder / deleteSkillFolder / createSkill / updateSkill / deleteSkill。",
    "规则库：getRule（只读，含正文）/ createRuleFolder / updateRuleFolder / deleteRuleFolder / createRule / updateRule / deleteRule。",
    ...SKILL_LOAD_PROMPT_LINES,
    "规则正文同样不在目录里；复制或按规则办事时先 getRule。",
    "创建或修改 Skill/Rule 时：严格遵循用户指令；用户给出的原文或「复制」请求应尽量原样保留 body，不要套固定 SKILL.md/RULE 模板，也不要擅自大幅改写。",
    "仅当用户明确要求你起草、改写、润色或补充时，才重写正文。删除目录会级联删除其中全部条目。",
    `Now 列 WIP 上限为 ${NOW_WIP_LIMIT}。`,
    `对话注入最近 ${AGENT_PROMPT_MESSAGE_LIMIT} 条消息；每项目 Done 历史最多 ${STEWARD_DONE_HISTORY_LIMIT} 条。`,
    "",
    "=== 总管家长期笔记 ===",
    stewardNotesBlock,
    "",
    "=== 收件箱 ===",
    buildInboxBlock(),
    "",
    "=== 活跃项目组合快照（侧边栏顺序） ===",
    buildProjectPortfolioBlock(),
    "",
    "=== 项目储蓄罐（完整看板 + 笔记；不在侧边栏） ===",
    buildPiggyBankBlock(),
    "",
    "=== 技能库目录（folder/skill id + name / description，无正文） ===",
    buildSkillsCatalogBlock(),
    "",
    "=== 规则库目录（folder/rule id + name / description，无正文） ===",
    buildRulesCatalogBlock(),
  ].join("\n");
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
  return (lastUser.parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
    .trim();
}

export async function streamStewardChat(input: {
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
  /** AI SDK send trigger — regenerate must not re-persist the user turn. */
  trigger?: "submit-message" | "regenerate-message";
}) {
  const last = input.uiMessages.at(-1);
  const isContinuation = last?.role === "assistant";
  const isRegenerate = input.trigger === "regenerate-message";

  if (!isContinuation) {
    const userText = extractLastUserText(input.uiMessages);
    if (!userText) {
      throw new Error("Empty user message");
    }
    if (!isRegenerate) {
      createStewardMessage({ role: "user", content: userText });
    }
  }

  const tools = buildStewardTools();
  const recent = input.uiMessages.slice(-AGENT_PROMPT_MESSAGE_LIMIT);
  const messages = await convertToModelMessages(recent, { tools });

  return streamText({
    model: createProjectLlm(),
    system: buildStewardSystemPrompt(),
    messages,
    tools,
    toolApproval: agentToolApproval(),
    stopWhen: isStepCount(8),
    abortSignal: input.abortSignal,
    onFinish: ({ text }) => {
      if (!text.trim()) return;
      createStewardMessage({ role: "assistant", content: text });
    },
  });
}
