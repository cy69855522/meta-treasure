import "server-only";
import {
  AGENT_PROMPT_MESSAGE_LIMIT,
  STEWARD_DONE_HISTORY_LIMIT,
} from "@/lib/constants";
import {
  listActiveProjects,
  listAgentMemoryNotes,
  listPiggyBankProjects,
  listStewardMemoryNotes,
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

/** Fresh DB snapshot for each turn — Codex may keep stale developerInstructions on resume. */
export function buildStewardTurnSnapshot(): string {
  return [
    "=== 本轮最新工作区快照（每轮发消息前从数据库刷新；优先于历史对话与旧指令） ===",
    "若下文与历史说法冲突，以下方为准。",
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
    "",
    "=== 收藏的研究报告目录（session id + title / 摘要，无正文） ===",
    buildFavoriteReportsCatalogBlock(),
  ].join("\n");
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
    "你是只读代码顾问。可以搜索和读取已绑定项目中的代码文件，用代码事实回答问题。",
    "禁止修改、创建或删除项目代码文件；禁止安装依赖、执行构建或测试、启动服务以及运行会改变项目或系统状态的命令。",
    "用户要求你写代码或执行命令时，说明当前 Agent 仅提供分析与代码阅读，并给出可供用户自行实施的建议。",
    "搜索代码时优先使用 rg 或 rg --files，并限定到相关目录和文件类型。禁止使用 grep -r .、find 扫描整个仓库或读取 .next、node_modules、dist、build、.git 等生成/依赖目录；命令输出应保持聚焦，必要时限制行数。",
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
    "网页搜索（两阶段）：先 webSearch（sources=wechat|baidu|google，可多选）拿到候选链接；再 fetchPages 批量抽取需要的页面正文。不要假装访问未抽取的 URL。",
    "访问网页：用户消息里给出具体网址、或让你看/查某个链接时，直接调用 fetchUrl 读取该网址正文，不要改用 webSearch 搜 site:。读取失败就如实说明失败原因（如被站点拦截、超时），不要凭记忆编造页面内容。",
    "Deep Radar：需要完整深度研究时用 deepRadarStart 传入需求（会新建会话并自动开跑）。气泡底部会显示进度条。需要数字进度时用 deepRadarProgress（与进度条同一接口）；deepRadarStatus 看摘要，deepRadarReport 按 id 读报告，deepRadarFavoriteList 列收藏报告，deepRadarList 列已有会话，deepRadarAct 追加消息或停止。返回的 url / reportUrl 必须原样贴进回复（这是打开 Deep Radar 并定位到该报告的链接，允许包含其中的路径）。研究未完成时不要编造报告内容。进度已完成或失败后不要反复查询。",
    ...SKILL_LOAD_PROMPT_LINES,
    ...RULE_LOAD_PROMPT_LINES,
    ...FAVORITE_REPORT_LOAD_PROMPT_LINES,
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
    "",
    "=== 收藏的研究报告目录（session id + title / 摘要，无正文） ===",
    buildFavoriteReportsCatalogBlock(),
  ].join("\n");
}
