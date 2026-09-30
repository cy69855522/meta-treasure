import "server-only";
import { tool, type ToolSet } from "@/lib/codex-tool";
import { z } from "zod";
import {
  type ActionDiff,
  type ActionPreview,
  type AgentToolName,
  type AgentToolScope,
  isAgentToolName,
  type FunctionToolCatalogItem,
  type FunctionToolParam,
} from "@/lib/agent-tools-types";
import { webSearchTools } from "@/lib/web-search-tools";
import { webFetchTools } from "@/lib/web-fetch-tools";
import { deepRadarTools } from "@/lib/deep-radar-tools";
import {
  countNowTasks,
  countRulesInFolder,
  countSkillsInFolder,
  createAgentMemoryNote,
  createRule,
  createRuleFolder,
  createSkill,
  createSkillFolder,
  createStewardMemoryNote,
  createTask,
  deleteAgentMemoryNote,
  deleteRule,
  deleteRuleFolder,
  deleteSkill,
  deleteSkillFolder,
  deleteStewardMemoryNote,
  deleteTask,
  getAgentMemoryNote,
  getProject,
  getRule,
  getRuleFolder,
  getSkill,
  getSkillFolder,
  getStewardMemoryNote,
  getTask,
  listActiveProjects,
  reorderProjects,
  setProjectInPiggyBank,
  updateAgentMemoryNote,
  updateRule,
  updateRuleFolder,
  updateSkill,
  updateSkillFolder,
  updateStewardMemoryNote,
  updateTask,
} from "@/lib/db";
import { LANE_LABELS, LANES, NOW_WIP_LIMIT, type Lane } from "@/lib/types";

export type {
  ActionDiff,
  ActionPreview,
  AgentToolName,
  AgentToolScope,
  FunctionToolCatalogItem,
  FunctionToolParam,
} from "@/lib/agent-tools-types";
export { isAgentToolName } from "@/lib/agent-tools-types";

const laneSchema = z.enum(LANES as [Lane, ...Lane[]]);

const TOOL_LABELS: Record<AgentToolName, string> = {
  createMemoryNote: "创建长期笔记",
  updateMemoryNote: "更新长期笔记",
  deleteMemoryNote: "删除长期笔记",
  createTask: "创建任务",
  updateTask: "更新任务",
  completeTask: "完成任务",
  deleteTask: "删除任务",
  reorderProjects: "调整项目顺序",
  moveProjectToPiggyBank: "移入项目储蓄罐",
  restoreProjectFromPiggyBank: "移出项目储蓄罐",
  createSkillFolder: "创建技能目录",
  updateSkillFolder: "重命名技能目录",
  deleteSkillFolder: "删除技能目录",
  createSkill: "创建技能",
  updateSkill: "更新技能",
  deleteSkill: "删除技能",
  createRuleFolder: "创建规则目录",
  updateRuleFolder: "重命名规则目录",
  deleteRuleFolder: "删除规则目录",
  createRule: "创建规则",
  updateRule: "更新规则",
  deleteRule: "删除规则",
};

function clipText(value: string | null | undefined, max = 480): string {
  const v = display(value);
  if (v.length <= max) return v;
  return `${v.slice(0, max)}…`;
}

export function taskContentFromPlainText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "[]";
  return JSON.stringify([
    {
      type: "paragraph",
      content: [{ type: "text", text: trimmed }],
    },
  ]);
}

export function plainTextFromTaskContent(content: string): string {
  try {
    const blocks = JSON.parse(content || "[]") as unknown;
    if (!Array.isArray(blocks)) return content || "";
    const parts: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const obj = node as { type?: string; text?: string; content?: unknown[] };
      if (typeof obj.text === "string") parts.push(obj.text);
      if (Array.isArray(obj.content)) obj.content.forEach(walk);
    };
    blocks.forEach(walk);
    return parts.join("").trim();
  } catch {
    return (content || "").trim();
  }
}

function display(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v || "（空）";
}

function laneLabel(lane: Lane): string {
  return LANE_LABELS[lane] ?? lane;
}

function assertNowWip(projectId: string | null, lane: Lane, excludeTaskId?: string) {
  if (lane !== "now" || !projectId) return;
  let count = countNowTasks(projectId);
  if (excludeTaskId) {
    const existing = getTask(excludeTaskId);
    if (existing?.projectId === projectId && existing.lane === "now") {
      count -= 1;
    }
  }
  if (count >= NOW_WIP_LIMIT) {
    throw new Error(
      `Now 列已达 WIP 上限（${NOW_WIP_LIMIT}）。先完成或移出一项再继续。`,
    );
  }
}

function projectName(projectId: string | null): string {
  if (!projectId) return "收件箱（无项目）";
  return getProject(projectId)?.name ?? projectId;
}

function pushDiff(
  diffs: ActionDiff[],
  field: string,
  before: string | null,
  after: string | null,
) {
  if (before === after) return;
  diffs.push({ field, before, after });
}

type NoteInputCreate = { title?: string; body?: string };
type NoteInputUpdate = { noteId: string; title?: string; body?: string };
type NoteInputDelete = { noteId: string };
type TaskInputCreate = {
  title: string;
  lane?: Lane;
  body?: string;
  projectId?: string | null;
};
type TaskInputUpdate = {
  taskId: string;
  title?: string;
  lane?: Lane;
  body?: string;
  projectId?: string | null;
};
type TaskInputDelete = { taskId: string };
type TaskInputComplete = { taskId: string };

function previewCreateNote(input: NoteInputCreate): ActionPreview {
  const diffs: ActionDiff[] = [];
  pushDiff(diffs, "标题", null, display(input.title));
  pushDiff(diffs, "正文", null, display(input.body));
  return {
    toolName: "createMemoryNote",
    actionLabel: TOOL_LABELS.createMemoryNote,
    summary: `将新增笔记「${display(input.title)}」`,
    diffs,
    risk: "low",
    affects: "notes",
  };
}

function previewUpdateNote(
  scope: AgentToolScope,
  projectId: string | undefined,
  input: NoteInputUpdate,
): ActionPreview {
  const note =
    scope === "project"
      ? getAgentMemoryNote(input.noteId)
      : getStewardMemoryNote(input.noteId);

  if (!note) {
    return {
      toolName: "updateMemoryNote",
      actionLabel: TOOL_LABELS.updateMemoryNote,
      summary: `找不到笔记 ${input.noteId}`,
      diffs: [],
      risk: "medium",
      affects: "notes",
    };
  }

  if (
    scope === "project" &&
    projectId &&
    "projectId" in note &&
    note.projectId !== projectId
  ) {
    return {
      toolName: "updateMemoryNote",
      actionLabel: TOOL_LABELS.updateMemoryNote,
      summary: "该笔记不属于当前项目",
      diffs: [],
      risk: "medium",
      affects: "notes",
    };
  }

  const diffs: ActionDiff[] = [];
  if (input.title !== undefined) {
    pushDiff(diffs, "标题", display(note.title), display(input.title));
  }
  if (input.body !== undefined) {
    pushDiff(diffs, "正文", display(note.body), display(input.body));
  }

  return {
    toolName: "updateMemoryNote",
    actionLabel: TOOL_LABELS.updateMemoryNote,
    summary: `将更新笔记「${display(note.title)}」`,
    diffs:
      diffs.length > 0
        ? diffs
        : [{ field: "变更", before: "无字段变更", after: "无字段变更" }],
    risk: "medium",
    affects: "notes",
  };
}

function previewDeleteNote(
  scope: AgentToolScope,
  projectId: string | undefined,
  input: NoteInputDelete,
): ActionPreview {
  const note =
    scope === "project"
      ? getAgentMemoryNote(input.noteId)
      : getStewardMemoryNote(input.noteId);

  if (!note) {
    return {
      toolName: "deleteMemoryNote",
      actionLabel: TOOL_LABELS.deleteMemoryNote,
      summary: `找不到笔记 ${input.noteId}`,
      diffs: [],
      risk: "high",
      affects: "notes",
    };
  }

  if (
    scope === "project" &&
    projectId &&
    "projectId" in note &&
    note.projectId !== projectId
  ) {
    return {
      toolName: "deleteMemoryNote",
      actionLabel: TOOL_LABELS.deleteMemoryNote,
      summary: "该笔记不属于当前项目",
      diffs: [],
      risk: "high",
      affects: "notes",
    };
  }

  return {
    toolName: "deleteMemoryNote",
    actionLabel: TOOL_LABELS.deleteMemoryNote,
    summary: `将删除笔记「${display(note.title)}」`,
    diffs: [
      { field: "标题", before: display(note.title), after: null },
      { field: "正文", before: display(note.body), after: null },
    ],
    risk: "high",
    affects: "notes",
  };
}

function previewCreateTask(
  scope: AgentToolScope,
  fixedProjectId: string | undefined,
  input: TaskInputCreate,
): ActionPreview {
  const lane = input.lane ?? (scope === "project" ? "next" : "inbox");
  const projectId =
    lane === "inbox"
      ? null
      : scope === "project"
        ? (fixedProjectId ?? null)
        : (input.projectId ?? null);

  const diffs: ActionDiff[] = [];
  pushDiff(diffs, "标题", null, display(input.title));
  pushDiff(diffs, "泳道", null, laneLabel(lane));
  pushDiff(diffs, "项目", null, projectName(projectId));
  if (input.body !== undefined) {
    pushDiff(diffs, "描述", null, display(input.body));
  }

  return {
    toolName: "createTask",
    actionLabel: TOOL_LABELS.createTask,
    summary: `将创建任务「${display(input.title)}」→ ${laneLabel(lane)}`,
    diffs,
    risk: "low",
    affects: "tasks",
  };
}

function previewUpdateTask(
  scope: AgentToolScope,
  fixedProjectId: string | undefined,
  input: TaskInputUpdate,
): ActionPreview {
  const task = getTask(input.taskId);
  if (!task) {
    return {
      toolName: "updateTask",
      actionLabel: TOOL_LABELS.updateTask,
      summary: `找不到任务 ${input.taskId}`,
      diffs: [],
      risk: "medium",
      affects: "tasks",
    };
  }

  if (
    scope === "project" &&
    fixedProjectId &&
    task.projectId !== fixedProjectId &&
    task.projectId !== null
  ) {
    return {
      toolName: "updateTask",
      actionLabel: TOOL_LABELS.updateTask,
      summary: "该任务不属于当前项目",
      diffs: [],
      risk: "medium",
      affects: "tasks",
    };
  }

  const nextLane = input.lane ?? task.lane;
  const nextProjectId =
    nextLane === "inbox"
      ? null
      : input.projectId !== undefined
        ? input.projectId
        : scope === "project"
          ? fixedProjectId ?? task.projectId
          : task.projectId;

  const diffs: ActionDiff[] = [];
  if (input.title !== undefined) {
    pushDiff(diffs, "标题", display(task.title), display(input.title));
  }
  if (input.lane !== undefined || nextLane !== task.lane) {
    pushDiff(diffs, "泳道", laneLabel(task.lane), laneLabel(nextLane));
  }
  if (nextProjectId !== task.projectId) {
    pushDiff(
      diffs,
      "项目",
      projectName(task.projectId),
      projectName(nextProjectId),
    );
  }
  if (input.body !== undefined) {
    pushDiff(
      diffs,
      "描述",
      display(plainTextFromTaskContent(task.content)),
      display(input.body),
    );
  }

  return {
    toolName: "updateTask",
    actionLabel: TOOL_LABELS.updateTask,
    summary: `将更新任务「${display(task.title)}」`,
    diffs:
      diffs.length > 0
        ? diffs
        : [{ field: "变更", before: "无字段变更", after: "无字段变更" }],
    risk: "medium",
    affects: "tasks",
  };
}

function previewDeleteTask(
  scope: AgentToolScope,
  fixedProjectId: string | undefined,
  input: TaskInputDelete,
): ActionPreview {
  const task = getTask(input.taskId);
  if (!task) {
    return {
      toolName: "deleteTask",
      actionLabel: TOOL_LABELS.deleteTask,
      summary: `找不到任务 ${input.taskId}`,
      diffs: [],
      risk: "high",
      affects: "tasks",
    };
  }

  if (
    scope === "project" &&
    fixedProjectId &&
    task.projectId !== fixedProjectId &&
    task.projectId !== null
  ) {
    return {
      toolName: "deleteTask",
      actionLabel: TOOL_LABELS.deleteTask,
      summary: "该任务不属于当前项目",
      diffs: [],
      risk: "high",
      affects: "tasks",
    };
  }

  return {
    toolName: "deleteTask",
    actionLabel: TOOL_LABELS.deleteTask,
    summary: `将删除任务「${display(task.title)}」`,
    diffs: [
      { field: "标题", before: display(task.title), after: null },
      { field: "泳道", before: laneLabel(task.lane), after: null },
      {
        field: "描述",
        before: display(plainTextFromTaskContent(task.content)),
        after: null,
      },
    ],
    risk: "high",
    affects: "tasks",
  };
}

function previewCompleteTask(
  scope: AgentToolScope,
  fixedProjectId: string | undefined,
  input: TaskInputComplete,
): ActionPreview {
  const task = getTask(input.taskId);
  if (!task) {
    return {
      toolName: "completeTask",
      actionLabel: TOOL_LABELS.completeTask,
      summary: `找不到任务 ${input.taskId}`,
      diffs: [],
      risk: "low",
      affects: "tasks",
    };
  }

  if (
    scope === "project" &&
    fixedProjectId &&
    task.projectId !== fixedProjectId &&
    task.projectId !== null
  ) {
    return {
      toolName: "completeTask",
      actionLabel: TOOL_LABELS.completeTask,
      summary: "该任务不属于当前项目",
      diffs: [],
      risk: "low",
      affects: "tasks",
    };
  }

  if (task.lane === "done") {
    return {
      toolName: "completeTask",
      actionLabel: TOOL_LABELS.completeTask,
      summary: `任务「${display(task.title)}」已在 Done，无需再完成`,
      diffs: [
        { field: "泳道", before: laneLabel("done"), after: laneLabel("done") },
      ],
      risk: "low",
      affects: "tasks",
    };
  }

  return {
    toolName: "completeTask",
    actionLabel: TOOL_LABELS.completeTask,
    summary: `将完成任务「${display(task.title)}」并移入历史`,
    diffs: [
      {
        field: "标题",
        before: display(task.title),
        after: display(task.title),
      },
      { field: "泳道", before: laneLabel(task.lane), after: laneLabel("done") },
      {
        field: "项目",
        before: projectName(task.projectId),
        after: projectName(task.projectId),
      },
    ],
    risk: "low",
    affects: "tasks",
  };
}

export function buildActionPreview(input: {
  scope: AgentToolScope;
  projectId?: string;
  toolName: string;
  input: unknown;
}): ActionPreview {
  const { scope, projectId, toolName } = input;
  const raw = (input.input ?? {}) as Record<string, unknown>;

  if (!isAgentToolName(toolName)) {
    return {
      toolName,
      actionLabel: toolName,
      summary: "未知操作",
      diffs: [],
      risk: "medium",
      affects: "tasks",
    };
  }

  switch (toolName) {
    case "createMemoryNote":
      return previewCreateNote(raw as NoteInputCreate);
    case "updateMemoryNote":
      return previewUpdateNote(scope, projectId, raw as NoteInputUpdate);
    case "deleteMemoryNote":
      return previewDeleteNote(scope, projectId, raw as NoteInputDelete);
    case "createTask":
      return previewCreateTask(scope, projectId, raw as TaskInputCreate);
    case "updateTask":
      return previewUpdateTask(scope, projectId, raw as TaskInputUpdate);
    case "completeTask":
      return previewCompleteTask(scope, projectId, raw as TaskInputComplete);
    case "deleteTask":
      return previewDeleteTask(scope, projectId, raw as TaskInputDelete);
    case "reorderProjects":
      return previewReorderProjects(raw as { projectIds?: string[] });
    case "moveProjectToPiggyBank":
      return previewPiggyMove(raw as { projectId?: string }, true);
    case "restoreProjectFromPiggyBank":
      return previewPiggyMove(raw as { projectId?: string }, false);
    case "createSkillFolder":
      return previewCreateLibraryFolder("skill", raw as { name?: string });
    case "updateSkillFolder":
      return previewUpdateLibraryFolder(
        "skill",
        raw as { folderId?: string; name?: string },
      );
    case "deleteSkillFolder":
      return previewDeleteLibraryFolder("skill", raw as { folderId?: string });
    case "createSkill":
      return previewCreateLibraryItem("skill", raw as LibraryItemCreateInput);
    case "updateSkill":
      return previewUpdateLibraryItem("skill", raw as LibraryItemUpdateInput);
    case "deleteSkill":
      return previewDeleteLibraryItem("skill", raw as { skillId?: string });
    case "createRuleFolder":
      return previewCreateLibraryFolder("rule", raw as { name?: string });
    case "updateRuleFolder":
      return previewUpdateLibraryFolder(
        "rule",
        raw as { folderId?: string; name?: string },
      );
    case "deleteRuleFolder":
      return previewDeleteLibraryFolder("rule", raw as { folderId?: string });
    case "createRule":
      return previewCreateLibraryItem("rule", raw as LibraryItemCreateInput);
    case "updateRule":
      return previewUpdateLibraryItem("rule", raw as LibraryItemUpdateInput);
    case "deleteRule":
      return previewDeleteLibraryItem("rule", raw as { ruleId?: string });
  }
}

type LibraryKind = "skill" | "rule";

type LibraryItemCreateInput = {
  folderId?: string;
  name?: string;
  description?: string;
  body?: string;
  usageMode?: string;
};

type LibraryItemUpdateInput = {
  skillId?: string;
  ruleId?: string;
  folderId?: string;
  name?: string;
  description?: string;
  body?: string;
  usageMode?: string;
};

function libraryLabels(kind: LibraryKind) {
  return kind === "skill"
    ? {
        folderNoun: "技能目录",
        itemNoun: "技能",
        affects: "skills" as const,
        createFolder: "createSkillFolder" as const,
        updateFolder: "updateSkillFolder" as const,
        deleteFolder: "deleteSkillFolder" as const,
        createItem: "createSkill" as const,
        updateItem: "updateSkill" as const,
        deleteItem: "deleteSkill" as const,
      }
    : {
        folderNoun: "规则目录",
        itemNoun: "规则",
        affects: "rules" as const,
        createFolder: "createRuleFolder" as const,
        updateFolder: "updateRuleFolder" as const,
        deleteFolder: "deleteRuleFolder" as const,
        createItem: "createRule" as const,
        updateItem: "updateRule" as const,
        deleteItem: "deleteRule" as const,
      };
}

function previewCreateLibraryFolder(
  kind: LibraryKind,
  input: { name?: string },
): ActionPreview {
  const labels = libraryLabels(kind);
  const name = display(input.name);
  return {
    toolName: labels.createFolder,
    actionLabel: TOOL_LABELS[labels.createFolder],
    summary: `将新建${labels.folderNoun}「${name}」`,
    diffs: [{ field: "名称", before: null, after: name }],
    risk: "low",
    affects: labels.affects,
  };
}

function previewUpdateLibraryFolder(
  kind: LibraryKind,
  input: { folderId?: string; name?: string },
): ActionPreview {
  const labels = libraryLabels(kind);
  const folder =
    kind === "skill"
      ? input.folderId
        ? getSkillFolder(input.folderId)
        : null
      : input.folderId
        ? getRuleFolder(input.folderId)
        : null;

  if (!folder) {
    return {
      toolName: labels.updateFolder,
      actionLabel: TOOL_LABELS[labels.updateFolder],
      summary: `找不到${labels.folderNoun}`,
      diffs: [],
      risk: "medium",
      affects: labels.affects,
    };
  }

  return {
    toolName: labels.updateFolder,
    actionLabel: TOOL_LABELS[labels.updateFolder],
    summary: `将重命名${labels.folderNoun}「${display(folder.name)}」`,
    diffs: [
      {
        field: "名称",
        before: display(folder.name),
        after: display(input.name ?? folder.name),
      },
    ],
    risk: "low",
    affects: labels.affects,
  };
}

function previewDeleteLibraryFolder(
  kind: LibraryKind,
  input: { folderId?: string },
): ActionPreview {
  const labels = libraryLabels(kind);
  const folder =
    kind === "skill"
      ? input.folderId
        ? getSkillFolder(input.folderId)
        : null
      : input.folderId
        ? getRuleFolder(input.folderId)
        : null;

  if (!folder) {
    return {
      toolName: labels.deleteFolder,
      actionLabel: TOOL_LABELS[labels.deleteFolder],
      summary: `找不到${labels.folderNoun}`,
      diffs: [],
      risk: "high",
      affects: labels.affects,
    };
  }

  const count =
    kind === "skill"
      ? countSkillsInFolder(folder.id)
      : countRulesInFolder(folder.id);

  return {
    toolName: labels.deleteFolder,
    actionLabel: TOOL_LABELS[labels.deleteFolder],
    summary: `将删除${labels.folderNoun}「${display(folder.name)}」及其内 ${count} 个${labels.itemNoun}`,
    diffs: [
      { field: "目录", before: display(folder.name), after: null },
      {
        field: labels.itemNoun,
        before: `${count} 个`,
        after: null,
      },
    ],
    risk: "high",
    affects: labels.affects,
  };
}

function previewCreateLibraryItem(
  kind: LibraryKind,
  input: LibraryItemCreateInput,
): ActionPreview {
  const labels = libraryLabels(kind);
  const folder =
    kind === "skill"
      ? input.folderId
        ? getSkillFolder(input.folderId)
        : null
      : input.folderId
        ? getRuleFolder(input.folderId)
        : null;
  const diffs: ActionDiff[] = [];
  pushDiff(diffs, "目录", null, display(folder?.name ?? input.folderId));
  pushDiff(diffs, "name", null, display(input.name));
  pushDiff(diffs, "description", null, clipText(input.description));
  pushDiff(
    diffs,
    "使用类型",
    null,
    input.usageMode === "required" ? "必须使用" : "按需使用",
  );
  pushDiff(diffs, "正文", null, clipText(input.body));

  return {
    toolName: labels.createItem,
    actionLabel: TOOL_LABELS[labels.createItem],
    summary: folder
      ? `将在「${display(folder.name)}」新建${labels.itemNoun}「${display(input.name)}」`
      : `将新建${labels.itemNoun}「${display(input.name)}」（目录无效）`,
    diffs,
    risk: folder ? "low" : "medium",
    affects: labels.affects,
  };
}

function previewUpdateLibraryItem(
  kind: LibraryKind,
  input: LibraryItemUpdateInput,
): ActionPreview {
  const labels = libraryLabels(kind);
  const item =
    kind === "skill"
      ? input.skillId
        ? getSkill(input.skillId)
        : null
      : input.ruleId
        ? getRule(input.ruleId)
        : null;

  if (!item) {
    return {
      toolName: labels.updateItem,
      actionLabel: TOOL_LABELS[labels.updateItem],
      summary: `找不到${labels.itemNoun}`,
      diffs: [],
      risk: "medium",
      affects: labels.affects,
    };
  }

  const currentFolder =
    kind === "skill"
      ? getSkillFolder(item.folderId)
      : getRuleFolder(item.folderId);
  const nextFolder =
    input.folderId !== undefined
      ? kind === "skill"
        ? getSkillFolder(input.folderId)
        : getRuleFolder(input.folderId)
      : currentFolder;

  const diffs: ActionDiff[] = [];
  if (input.folderId !== undefined) {
    pushDiff(
      diffs,
      "目录",
      display(currentFolder?.name ?? item.folderId),
      display(nextFolder?.name ?? input.folderId),
    );
  }
  if (input.name !== undefined) {
    pushDiff(diffs, "name", display(item.name), display(input.name));
  }
  if (input.description !== undefined) {
    pushDiff(
      diffs,
      "description",
      clipText(item.description),
      clipText(input.description),
    );
  }
  if (input.usageMode !== undefined) {
    const before =
      "usageMode" in item && item.usageMode === "required"
        ? "必须使用"
        : "按需使用";
    const after =
      input.usageMode === "required" ? "必须使用" : "按需使用";
    pushDiff(diffs, "使用类型", before, after);
  }
  if (input.body !== undefined) {
    pushDiff(diffs, "正文", clipText(item.body), clipText(input.body));
  }

  return {
    toolName: labels.updateItem,
    actionLabel: TOOL_LABELS[labels.updateItem],
    summary: `将更新${labels.itemNoun}「${display(item.name)}」`,
    diffs:
      diffs.length > 0
        ? diffs
        : [{ field: "变更", before: "无字段变更", after: "无字段变更" }],
    risk: "medium",
    affects: labels.affects,
  };
}

function previewDeleteLibraryItem(
  kind: LibraryKind,
  input: { skillId?: string; ruleId?: string },
): ActionPreview {
  const labels = libraryLabels(kind);
  const item =
    kind === "skill"
      ? input.skillId
        ? getSkill(input.skillId)
        : null
      : input.ruleId
        ? getRule(input.ruleId)
        : null;

  if (!item) {
    return {
      toolName: labels.deleteItem,
      actionLabel: TOOL_LABELS[labels.deleteItem],
      summary: `找不到${labels.itemNoun}`,
      diffs: [],
      risk: "high",
      affects: labels.affects,
    };
  }

  const folder =
    kind === "skill"
      ? getSkillFolder(item.folderId)
      : getRuleFolder(item.folderId);

  return {
    toolName: labels.deleteItem,
    actionLabel: TOOL_LABELS[labels.deleteItem],
    summary: `将删除${labels.itemNoun}「${display(item.name)}」`,
    diffs: [
      { field: "目录", before: display(folder?.name ?? item.folderId), after: null },
      { field: "name", before: display(item.name), after: null },
      { field: "description", before: clipText(item.description), after: null },
      { field: "正文", before: clipText(item.body), after: null },
    ],
    risk: "high",
    affects: labels.affects,
  };
}

function formatProjectOrderLine(ids: string[]): string {
  return ids
    .map((id, i) => {
      const p = getProject(id);
      return `${i + 1}. ${p?.name ?? id}`;
    })
    .join("\n");
}

function previewReorderProjects(input: {
  projectIds?: string[];
}): ActionPreview {
  const projectIds = input.projectIds ?? [];
  const active = listActiveProjects();
  const before = formatProjectOrderLine(active.map((p) => p.id));
  const after = formatProjectOrderLine(projectIds);
  return {
    toolName: "reorderProjects",
    actionLabel: TOOL_LABELS.reorderProjects,
    summary: "将调整侧边栏活跃项目的显示顺序（不含储蓄罐）",
    diffs: [{ field: "项目顺序", before, after }],
    risk: "medium",
    affects: "projects",
  };
}

function previewPiggyMove(
  input: { projectId?: string },
  intoBank: boolean,
): ActionPreview {
  const project = input.projectId ? getProject(input.projectId) : null;
  const name = project?.name ?? input.projectId ?? "（未知）";
  if (intoBank) {
    return {
      toolName: "moveProjectToPiggyBank",
      actionLabel: TOOL_LABELS.moveProjectToPiggyBank,
      summary: `将「${name}」移入项目储蓄罐（侧边栏隐藏，不参与排序）`,
      diffs: [
        { field: "位置", before: "活跃项目列表", after: "项目储蓄罐" },
        { field: "项目", before: name, after: name },
      ],
      risk: "medium",
      affects: "projects",
    };
  }
  return {
    toolName: "restoreProjectFromPiggyBank",
    actionLabel: TOOL_LABELS.restoreProjectFromPiggyBank,
    summary: `将「${name}」移出储蓄罐，放到活跃项目列表末尾`,
    diffs: [
      { field: "位置", before: "项目储蓄罐", after: "活跃项目列表末尾" },
      { field: "项目", before: name, after: name },
    ],
    risk: "low",
    affects: "projects",
  };
}

function skillReadTools(): ToolSet {
  return {
    getSkill: tool({
      description:
        "按需加载一条 Skill 的完整正文（含 body）。当用户问题与技能库目录中某条 description 相关时先调用再回答；只读，无需用户确认。",
      inputSchema: z.object({
        skillId: z.string().describe("技能 id（来自技能库目录快照）"),
      }),
      execute: async ({ skillId }) => {
        const skill = getSkill(skillId);
        if (!skill) throw new Error("Skill not found");
        const folder = getSkillFolder(skill.folderId);
        return {
          ok: true as const,
          skill,
          folderName: folder?.name ?? null,
        };
      },
    }),
  };
}

function libraryTools(): ToolSet {
  return {
    ...skillReadTools(),
    createSkillFolder: tool({
      description:
        "在技能库新建文件夹。需用户确认后生效。名称不能与已有技能目录重复。",
      inputSchema: z.object({
        name: z.string().describe("文件夹名称"),
      }),
      execute: async ({ name }) => {
        const folder = createSkillFolder({ name });
        return { ok: true as const, folder };
      },
    }),
    updateSkillFolder: tool({
      description: "重命名技能库文件夹。需用户确认后生效。",
      inputSchema: z.object({
        folderId: z.string().describe("技能目录 id"),
        name: z.string().describe("新名称"),
      }),
      execute: async ({ folderId, name }) => {
        if (!getSkillFolder(folderId)) throw new Error("Skill folder not found");
        const folder = updateSkillFolder(folderId, { name });
        return { ok: true as const, folder };
      },
    }),
    deleteSkillFolder: tool({
      description:
        "删除技能库文件夹；其中的全部技能会一并删除。需用户确认后生效。",
      inputSchema: z.object({
        folderId: z.string().describe("要删除的技能目录 id"),
      }),
      execute: async ({ folderId }) => {
        const existing = getSkillFolder(folderId);
        if (!existing) throw new Error("Skill folder not found");
        const skillCount = countSkillsInFolder(folderId);
        deleteSkillFolder(folderId);
        return {
          ok: true as const,
          deletedFolderId: folderId,
          name: existing.name,
          skillCount,
        };
      },
    }),
    createSkill: tool({
      description:
        "在指定技能目录下新建 Skill。body/description 以用户给出的原文为准，不要擅自套固定 SKILL.md 模板或重写用户要保留的内容。复制时先 getSkill 再原样写入 body。usageMode：required=必须使用（每轮自动注入），on_demand=按需使用（默认）。需用户确认后生效。",
      inputSchema: z.object({
        folderId: z.string().describe("技能目录 id"),
        name: z.string().describe("Skill 名称（按用户指定；可原样保留）"),
        description: z
          .string()
          .optional()
          .describe("何时启用；复制时优先沿用源 description，除非用户另有说明"),
        body: z
          .string()
          .optional()
          .describe("Skill 正文；用户提供或复制来的原文应完整传入，勿擅自大幅改写"),
        usageMode: z
          .enum(["required", "on_demand"])
          .optional()
          .describe("使用类型：required=必须使用，on_demand=按需使用（默认）"),
      }),
      execute: async ({ folderId, name, description, body, usageMode }) => {
        const skill = createSkill({
          folderId,
          name,
          description,
          body,
          usageMode,
        });
        return { ok: true as const, skill };
      },
    }),
    updateSkill: tool({
      description:
        "更新已有 Skill。只改用户要求改的字段；未提到的字段不要动。复制/微调时不要整篇重写。usageMode：required=必须使用，on_demand=按需使用。需用户确认后生效。",
      inputSchema: z.object({
        skillId: z.string().describe("技能 id"),
        folderId: z.string().optional().describe("新目录 id；不传则不变"),
        name: z.string().optional().describe("新 name；不传则不变"),
        description: z.string().optional().describe("新 description；不传则不变"),
        body: z.string().optional().describe("新正文；不传则不变；传入则按用户意图写入"),
        usageMode: z
          .enum(["required", "on_demand"])
          .optional()
          .describe("使用类型；不传则不变"),
      }),
      execute: async ({
        skillId,
        folderId,
        name,
        description,
        body,
        usageMode,
      }) => {
        if (!getSkill(skillId)) throw new Error("Skill not found");
        const skill = updateSkill(skillId, {
          folderId,
          name,
          description,
          body,
          usageMode,
        });
        return { ok: true as const, skill };
      },
    }),
    deleteSkill: tool({
      description: "删除一条 Skill。需用户确认后生效；不可恢复。",
      inputSchema: z.object({
        skillId: z.string().describe("要删除的技能 id"),
      }),
      execute: async ({ skillId }) => {
        const existing = getSkill(skillId);
        if (!existing) throw new Error("Skill not found");
        deleteSkill(skillId);
        return {
          ok: true as const,
          deletedSkillId: skillId,
          name: existing.name,
        };
      },
    }),
    createRuleFolder: tool({
      description:
        "在规则库新建文件夹。需用户确认后生效。名称不能与已有规则目录重复。",
      inputSchema: z.object({
        name: z.string().describe("文件夹名称"),
      }),
      execute: async ({ name }) => {
        const folder = createRuleFolder({ name });
        return { ok: true as const, folder };
      },
    }),
    updateRuleFolder: tool({
      description: "重命名规则库文件夹。需用户确认后生效。",
      inputSchema: z.object({
        folderId: z.string().describe("规则目录 id"),
        name: z.string().describe("新名称"),
      }),
      execute: async ({ folderId, name }) => {
        if (!getRuleFolder(folderId)) throw new Error("Rule folder not found");
        const folder = updateRuleFolder(folderId, { name });
        return { ok: true as const, folder };
      },
    }),
    deleteRuleFolder: tool({
      description:
        "删除规则库文件夹；其中的全部规则会一并删除。需用户确认后生效。",
      inputSchema: z.object({
        folderId: z.string().describe("要删除的规则目录 id"),
      }),
      execute: async ({ folderId }) => {
        const existing = getRuleFolder(folderId);
        if (!existing) throw new Error("Rule folder not found");
        const ruleCount = countRulesInFolder(folderId);
        deleteRuleFolder(folderId);
        return {
          ok: true as const,
          deletedFolderId: folderId,
          name: existing.name,
          ruleCount,
        };
      },
    }),
    createRule: tool({
      description:
        "在指定规则目录下新建 Rule。body/description 以用户给出的原文为准，不要擅自套固定模板或重写用户要保留的内容。复制时先 getRule 再原样写入 body。usageMode：required=必须使用（每轮自动注入），on_demand=按需使用（默认）。需用户确认后生效。",
      inputSchema: z.object({
        folderId: z.string().describe("规则目录 id"),
        name: z.string().describe("Rule 名称（按用户指定；可原样保留）"),
        description: z
          .string()
          .optional()
          .describe("适用场景；复制时优先沿用源 description，除非用户另有说明"),
        body: z
          .string()
          .optional()
          .describe("Rule 正文；用户提供或复制来的原文应完整传入，勿擅自大幅改写"),
        usageMode: z
          .enum(["required", "on_demand"])
          .optional()
          .describe("使用类型：required=必须使用，on_demand=按需使用（默认）"),
      }),
      execute: async ({ folderId, name, description, body, usageMode }) => {
        const rule = createRule({
          folderId,
          name,
          description,
          body,
          usageMode,
        });
        return { ok: true as const, rule };
      },
    }),
    updateRule: tool({
      description:
        "更新已有 Rule。只改用户要求改的字段；未提到的字段不要动。复制/微调时不要整篇重写。usageMode：required=必须使用，on_demand=按需使用。需用户确认后生效。",
      inputSchema: z.object({
        ruleId: z.string().describe("规则 id"),
        folderId: z.string().optional().describe("新目录 id；不传则不变"),
        name: z.string().optional().describe("新 name；不传则不变"),
        description: z.string().optional().describe("新 description；不传则不变"),
        body: z.string().optional().describe("新正文；不传则不变；传入则按用户意图写入"),
        usageMode: z
          .enum(["required", "on_demand"])
          .optional()
          .describe("使用类型；不传则不变"),
      }),
      execute: async ({
        ruleId,
        folderId,
        name,
        description,
        body,
        usageMode,
      }) => {
        if (!getRule(ruleId)) throw new Error("Rule not found");
        const rule = updateRule(ruleId, {
          folderId,
          name,
          description,
          body,
          usageMode,
        });
        return { ok: true as const, rule };
      },
    }),
    deleteRule: tool({
      description: "删除一条 Rule。需用户确认后生效；不可恢复。",
      inputSchema: z.object({
        ruleId: z.string().describe("要删除的规则 id"),
      }),
      execute: async ({ ruleId }) => {
        const existing = getRule(ruleId);
        if (!existing) throw new Error("Rule not found");
        deleteRule(ruleId);
        return {
          ok: true as const,
          deletedRuleId: ruleId,
          name: existing.name,
        };
      },
    }),
    getRule: tool({
      description:
        "读取一条 Rule 的完整内容（含 body）。复制、对照或按原文修改前先调用；只读，无需用户确认。",
      inputSchema: z.object({
        ruleId: z.string().describe("规则 id"),
      }),
      execute: async ({ ruleId }) => {
        const rule = getRule(ruleId);
        if (!rule) throw new Error("Rule not found");
        const folder = getRuleFolder(rule.folderId);
        return {
          ok: true as const,
          rule,
          folderName: folder?.name ?? null,
        };
      },
    }),
  };
}

function stewardProjectTools(): ToolSet {
  return {
    reorderProjects: tool({
      description:
        "调整侧边栏活跃项目的完整显示顺序。必须包含当前全部非储蓄罐项目的 projectId，每个恰好一次。储蓄罐内项目不能出现在列表中。需用户确认后生效。",
      inputSchema: z.object({
        projectIds: z
          .array(z.string())
          .min(1)
          .describe("活跃项目 id 的新顺序（完整列表）"),
      }),
      execute: async ({ projectIds }) => {
        reorderProjects(projectIds);
        return {
          ok: true as const,
          projectIds,
          names: projectIds.map((id) => getProject(id)?.name ?? id),
        };
      },
    }),
    moveProjectToPiggyBank: tool({
      description:
        "将一个活跃项目移入项目储蓄罐：侧边栏不再展示，且不参与 Project Order。需用户确认后生效。",
      inputSchema: z.object({
        projectId: z.string().describe("要移入储蓄罐的项目 id"),
      }),
      execute: async ({ projectId }) => {
        const existing = getProject(projectId);
        if (!existing) throw new Error("Project not found");
        if (existing.inPiggyBank) {
          throw new Error("Project is already in the piggy bank");
        }
        const project = setProjectInPiggyBank(projectId, true);
        return { ok: true as const, project };
      },
    }),
    restoreProjectFromPiggyBank: tool({
      description:
        "将项目从储蓄罐移出，放到活跃项目列表末尾。需用户确认后生效。",
      inputSchema: z.object({
        projectId: z.string().describe("要移出储蓄罐的项目 id"),
      }),
      execute: async ({ projectId }) => {
        const existing = getProject(projectId);
        if (!existing) throw new Error("Project not found");
        if (!existing.inPiggyBank) {
          throw new Error("Project is not in the piggy bank");
        }
        const project = setProjectInPiggyBank(projectId, false);
        return { ok: true as const, project };
      },
    }),
  };
}

function noteTools(scope: AgentToolScope, projectId?: string) {
  return {
    createMemoryNote: tool({
      description:
        "创建一条长期记忆笔记。变更需用户在对话中确认后才会生效。",
      inputSchema: z.object({
        title: z.string().optional().describe("笔记标题"),
        body: z.string().optional().describe("笔记正文"),
      }),
      execute: async ({ title, body }) => {
        if (scope === "project") {
          if (!projectId) throw new Error("Missing projectId");
          const note = createAgentMemoryNote({
            projectId,
            title: title ?? "",
            body: body ?? "",
          });
          return { ok: true as const, note };
        }
        const note = createStewardMemoryNote({
          title: title ?? "",
          body: body ?? "",
        });
        return { ok: true as const, note };
      },
    }),
    updateMemoryNote: tool({
      description:
        "更新一条已有长期记忆笔记（需 noteId）。变更需用户确认后生效。",
      inputSchema: z.object({
        noteId: z.string().describe("笔记 id"),
        title: z.string().optional().describe("新标题；不传则保持不变"),
        body: z.string().optional().describe("新正文；不传则保持不变"),
      }),
      execute: async ({ noteId, title, body }) => {
        if (scope === "project") {
          if (!projectId) throw new Error("Missing projectId");
          const existing = getAgentMemoryNote(noteId);
          if (!existing || existing.projectId !== projectId) {
            throw new Error("Note not found in this project");
          }
          const note = updateAgentMemoryNote(noteId, { title, body });
          return { ok: true as const, note };
        }
        const existing = getStewardMemoryNote(noteId);
        if (!existing) throw new Error("Note not found");
        const note = updateStewardMemoryNote(noteId, { title, body });
        return { ok: true as const, note };
      },
    }),
    deleteMemoryNote: tool({
      description: "删除一条长期记忆笔记（需 noteId）。需用户确认后生效。",
      inputSchema: z.object({
        noteId: z.string().describe("要删除的笔记 id"),
      }),
      execute: async ({ noteId }) => {
        if (scope === "project") {
          if (!projectId) throw new Error("Missing projectId");
          const existing = getAgentMemoryNote(noteId);
          if (!existing || existing.projectId !== projectId) {
            throw new Error("Note not found in this project");
          }
          deleteAgentMemoryNote(noteId);
          return { ok: true as const, deletedNoteId: noteId };
        }
        const existing = getStewardMemoryNote(noteId);
        if (!existing) throw new Error("Note not found");
        deleteStewardMemoryNote(noteId);
        return { ok: true as const, deletedNoteId: noteId };
      },
    }),
  };
}

/** Empty strings represent omitted project selection in existing tool contracts. */
function normalizeProjectId(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "inbox") return null;
  return trimmed;
}

function taskTools(scope: AgentToolScope, fixedProjectId?: string) {
  return {
    createTask: tool({
      description:
        scope === "project"
          ? "在当前项目创建任务（或 lane=inbox 放入收件箱）。需用户确认后生效。Now 列有 WIP 上限。"
          : "创建任务：可指定 projectId，或 lane=inbox 进收件箱。需用户确认后生效。Now 列有 WIP 上限。",
      inputSchema: z.object({
        title: z.string().describe("任务标题"),
        lane: laneSchema
          .optional()
          .describe("泳道；项目顾问默认 next；总管家默认 inbox"),
        body: z.string().optional().describe("任务描述（纯文本）"),
        projectId: z
          .string()
          .optional()
          .describe(
            scope === "steward"
              ? "目标项目 id；收件箱传空字符串"
              : "项目顾问勿传，由系统固定",
          ),
      }),
      execute: async ({ title, lane: laneIn, body, projectId: projectIdIn }) => {
        if (!title.trim()) throw new Error("title is required");
        const lane =
          laneIn ?? (scope === "project" ? ("next" as Lane) : ("inbox" as Lane));
        const normalized = normalizeProjectId(projectIdIn);
        const projectId =
          lane === "inbox"
            ? null
            : scope === "project"
              ? (fixedProjectId ?? null)
              : (normalized ?? null);

        if (lane !== "inbox" && !projectId) {
          throw new Error("非收件箱任务必须指定 projectId");
        }
        if (projectId && !getProject(projectId)) {
          throw new Error("Project not found");
        }

        assertNowWip(projectId, lane);

        const task = createTask({
          title: title.trim(),
          projectId,
          lane,
          content: body !== undefined ? taskContentFromPlainText(body) : "[]",
        });
        return { ok: true as const, task };
      },
    }),
    updateTask: tool({
      description:
        "更新任务的标题、泳道、描述或所属项目。需用户确认后生效。Now 列有 WIP 上限。",
      inputSchema: z.object({
        taskId: z.string().describe("任务 id"),
        title: z.string().optional().describe("新标题"),
        lane: laneSchema.optional().describe("新泳道"),
        body: z.string().optional().describe("新描述（纯文本）；不传则不变"),
        projectId: z
          .string()
          .optional()
          .describe("新所属项目 id；收件箱传空字符串；不传则保持不变"),
      }),
      execute: async ({ taskId, title, lane, body, projectId: projectIdIn }) => {
        const existing = getTask(taskId);
        if (!existing) throw new Error("Task not found");

        if (
          scope === "project" &&
          fixedProjectId &&
          existing.projectId !== fixedProjectId &&
          existing.projectId !== null
        ) {
          throw new Error("Task not in this project");
        }

        const nextLane = lane ?? existing.lane;
        const normalized = normalizeProjectId(projectIdIn);
        let nextProjectId =
          normalized !== undefined ? normalized : existing.projectId;

        if (nextLane === "inbox") {
          nextProjectId = null;
        } else if (scope === "project") {
          nextProjectId = fixedProjectId ?? nextProjectId;
        }

        if (nextLane !== "inbox" && !nextProjectId) {
          throw new Error("非收件箱任务必须指定 projectId");
        }
        if (nextProjectId && !getProject(nextProjectId)) {
          throw new Error("Project not found");
        }

        assertNowWip(nextProjectId, nextLane, taskId);

        const task = updateTask(taskId, {
          title: title?.trim(),
          lane: nextLane,
          projectId: nextProjectId,
          content:
            body !== undefined ? taskContentFromPlainText(body) : undefined,
        });
        return { ok: true as const, task };
      },
    }),
    completeTask: tool({
      description:
        "将任务标记为完成并移入 Done 历史。只需 taskId；比 updateTask 更直接。需用户确认后生效。已是 Done 则视为成功。",
      inputSchema: z.object({
        taskId: z.string().describe("要完成的任务 id（来自看板快照）"),
      }),
      execute: async ({ taskId }) => {
        const existing = getTask(taskId);
        if (!existing) throw new Error("Task not found");
        if (
          scope === "project" &&
          fixedProjectId &&
          existing.projectId !== fixedProjectId &&
          existing.projectId !== null
        ) {
          throw new Error("Task not in this project");
        }
        if (existing.lane === "done") {
          return { ok: true as const, alreadyDone: true as const, task: existing };
        }
        const task = updateTask(taskId, { lane: "done" });
        if (!task) throw new Error("Failed to complete task");
        return { ok: true as const, alreadyDone: false as const, task };
      },
    }),
    deleteTask: tool({
      description: "删除任务。需用户确认后生效；不可恢复。",
      inputSchema: z.object({
        taskId: z.string().describe("要删除的任务 id"),
      }),
      execute: async ({ taskId }) => {
        const existing = getTask(taskId);
        if (!existing) throw new Error("Task not found");
        if (
          scope === "project" &&
          fixedProjectId &&
          existing.projectId !== fixedProjectId &&
          existing.projectId !== null
        ) {
          throw new Error("Task not in this project");
        }
        deleteTask(taskId);
        return {
          ok: true as const,
          deletedTaskId: taskId,
          title: existing.title,
        };
      },
    }),
  };
}

export function buildProjectAgentTools(projectId: string): ToolSet {
  return {
    ...noteTools("project", projectId),
    ...taskTools("project", projectId),
    ...libraryTools(),
    ...webSearchTools(),
    ...webFetchTools(),
    ...deepRadarTools(),
  };
}

export function buildStewardTools(): ToolSet {
  return {
    ...noteTools("steward"),
    ...taskTools("steward"),
    ...stewardProjectTools(),
    ...libraryTools(),
    ...webSearchTools(),
    ...webFetchTools(),
    ...deepRadarTools(),
  };
}

function schemaType(prop: Record<string, unknown>): string {
  if (Array.isArray(prop.enum) && prop.enum.length) {
    return prop.enum.map((item) => String(item)).join(" | ");
  }
  if (prop.type === "array") {
    const items =
      prop.items && typeof prop.items === "object"
        ? schemaType(prop.items as Record<string, unknown>)
        : "any";
    return `${items}[]`;
  }
  if (typeof prop.type === "string") return prop.type;
  if (Array.isArray(prop.anyOf)) return "union";
  return "any";
}

function parametersFromSchema(schema: unknown): FunctionToolParam[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const required = new Set(record.required || []);
  return Object.entries(record.properties || {}).map(([name, prop]) => ({
    name,
    type: schemaType(prop),
    description: typeof prop.description === "string" ? prop.description : "",
    required: required.has(name),
  }));
}

/** Live catalog of function tools currently registered on Steward and Project Agent. */
export function listFunctionToolCatalog(): FunctionToolCatalogItem[] {
  const groups = [
    { audience: "steward" as const, tools: buildStewardTools() },
    { audience: "project" as const, tools: buildProjectAgentTools("catalog") },
  ];
  const merged = new Map<string, FunctionToolCatalogItem>();
  for (const group of groups) {
    for (const [name, entry] of Object.entries(group.tools)) {
      const existing = merged.get(name);
      if (existing) {
        if (!existing.audiences.includes(group.audience)) {
          existing.audiences.push(group.audience);
        }
        continue;
      }
      let parameters: FunctionToolParam[] = [];
      try {
        parameters = parametersFromSchema(
          z.toJSONSchema(entry.inputSchema as z.ZodType),
        );
      } catch {
        parameters = [];
      }
      merged.set(name, {
        name,
        description: entry.description || "",
        audiences: [group.audience],
        parameters,
      });
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
