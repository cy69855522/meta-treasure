import "server-only";
import {
  STEWARD_HANDOFF_MESSAGE_MAX_CHARS,
  STEWARD_HANDOFF_ROUNDS,
} from "@/lib/constants";
import {
  ensureProjectAgent,
  getProject,
  listAgentMemoryNotes,
  listStewardMessages,
  listTasks,
} from "@/lib/db";
import {
  buildFavoriteReportsCatalogBlock,
  FAVORITE_REPORT_LOAD_PROMPT_LINES,
} from "@/features/deep-radar/lib/service";
import {
  buildSkillsCatalogBlock,
  buildRulesCatalogBlock,
  SKILL_LOAD_PROMPT_LINES,
  RULE_LOAD_PROMPT_LINES,
} from "@/lib/library-catalog";
import { LANE_LABELS, NOW_WIP_LIMIT, type Lane, type Task } from "@/lib/types";

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

/** Fresh board/notes for each turn — Codex may keep stale developerInstructions on resume. */
export function buildProjectAgentTurnSnapshot(projectId: string): string {
  const project = getProject(projectId);
  if (!project) return "";
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

  return [
    "=== 本轮最新项目快照（每轮发消息前从数据库刷新；优先于历史对话与旧指令） ===",
    "若下文与历史说法冲突，以下方为准。",
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
    "=== 技能库目录（folder/skill id + name / description，无正文） ===",
    buildSkillsCatalogBlock(),
    "",
    "=== 规则库目录（folder/rule id + name / description，无正文） ===",
    buildRulesCatalogBlock(),
    "",
    "=== 收藏的研究报告目录（session id + title / 摘要，无正文） ===",
    buildFavoriteReportsCatalogBlock(),
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
    "若要增删改长期笔记、任务、技能库或规则库，必须调用对应 function tool；系统会先让用户预览确认，通过后才会真正落库。",
    "你是只读代码顾问。可以搜索和读取已绑定项目中的代码文件，用代码事实回答问题。",
    "禁止修改、创建或删除项目代码文件；禁止安装依赖、执行构建或测试、启动服务以及运行会改变项目或系统状态的命令。",
    "用户要求你写代码或执行命令时，说明当前 Agent 仅提供分析与代码阅读，并给出可供用户自行实施的建议。",
    "搜索代码时优先使用 rg 或 rg --files，并限定到相关目录和文件类型。禁止使用 grep -r .、find 扫描整个仓库或读取 .next、node_modules、dist、build、.git 等生成/依赖目录；命令输出应保持聚焦，必要时限制行数。",
    "要把任务标为完成时，优先调用 completeTask（移入 Done），不要用 deleteTask。",
    "在用户确认前，不要声称已经改过看板、笔记、技能或规则。",
    "若用户拒绝某次 tool 执行，不要重试同一操作；告知未应用即可。",
    "对用户说话时只用项目名、任务标题、笔记标题、技能/规则名等可读名称；禁止在回复正文中写出 id / UUID / 哈希。",
    "快照里的 id=… / folderId=… 仅供 tool 参数使用（更新/删除时填入）；不要抄进对话。",
    "下方看板与笔记快照在每次用户发消息时都会重新读取，是本项目当前唯一事实来源。",
    "「近期总管家对话」为只读参考，可用来承接用户刚与总管家对齐的方向；若与本项目看板/笔记冲突，以本项目快照为准。",
    "不要根据总管家摘录声称对方已改过本项目看板或笔记。",
    "若历史对话与本次快照冲突，以本次快照为准，不要沿用过时任务/泳道状态。",
    "技能库：getSkill（只读，含正文）/ createSkillFolder / updateSkillFolder / deleteSkillFolder / createSkill / updateSkill / deleteSkill。",
    "规则库：getRule（只读，含正文）/ createRuleFolder / updateRuleFolder / deleteRuleFolder / createRule / updateRule / deleteRule。",
    "网页搜索（两阶段）：先 webSearch（sources=wechat|baidu|google，可多选）拿到候选链接；再 fetchPages 批量抽取需要的页面正文。不要假装访问未抽取的 URL。",
    "访问网页：用户消息里给出具体网址、或让你看/查某个链接时，直接调用 fetchUrl 读取该网址正文，不要改用 webSearch 搜 site:。读取失败就如实说明失败原因（如被站点拦截、超时），不要凭记忆编造页面内容。",
    "Deep Radar：需要完整深度研究时用 deepRadarStart 传入需求（会新建会话并自动开跑）。气泡底部会显示进度条。需要数字进度时用 deepRadarProgress（与进度条同一接口）；deepRadarStatus 看摘要，deepRadarReport 按 id 读报告，deepRadarFavoriteList 列收藏报告，deepRadarList 列已有会话，deepRadarAct 追加消息或停止。返回的 url / reportUrl 必须原样贴进回复（这是打开 Deep Radar 并定位到该报告的链接，允许包含其中的路径）。研究未完成时不要编造报告内容。进度已完成或失败后不要反复查询。",
    ...SKILL_LOAD_PROMPT_LINES,
    ...RULE_LOAD_PROMPT_LINES,
    ...FAVORITE_REPORT_LOAD_PROMPT_LINES,
    "创建或修改 Skill/Rule 时：严格遵循用户指令；用户给出的原文或「复制」请求应尽量原样保留 body，不要套固定 SKILL.md/RULE 模板，也不要擅自大幅改写。",
    "仅当用户明确要求你起草、改写、润色或补充时，才重写正文。删除目录会级联删除其中全部条目。",
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
    "",
    "=== 技能库目录（folder/skill id + name / description，无正文） ===",
    buildSkillsCatalogBlock(),
    "",
    "=== 规则库目录（folder/rule id + name / description，无正文） ===",
    buildRulesCatalogBlock(),
    "",
    "=== 收藏的研究报告目录（session id + title / 摘要，无正文） ===",
    buildFavoriteReportsCatalogBlock(),
    custom ? `\n=== 额外指令 ===\n${custom}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
