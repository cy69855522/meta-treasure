import "server-only";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { AGENT_PROMPT_MESSAGE_LIMIT, CHAT_HISTORY_PAGE_SIZE } from "./constants";
import type {
  AgentMemoryNote,
  AgentMessage,
  AgentMessageRole,
  ChatMessageSearchHit,
  InvokedRadar,
  InvokedRule,
  InvokedSearch,
  InvokedSkill,
  MessageImage,
  Lane,
  Project,
  ProjectAgent,
  Rule,
  RuleFolder,
  Skill,
  SkillFolder,
  SkillUsageMode,
  LibraryUsageMode,
  StewardMemoryNote,
  StewardMessage,
  Task,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "progress.db");

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sort_order: number;
  in_piggy_bank: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  content: string;
  lane: string;
  sort_order: number;
  attributes: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type ProjectAgentRow = {
  id: string;
  project_id: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
};

type AgentMemoryNoteRow = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type AgentMessageRow = {
  id: string;
  project_id: string;
  role: string;
  content: string;
  skills_json: string;
  rules_json: string;
  searches_json: string;
  radars_json: string;
  images_json: string;
  created_at: string;
};

type SkillFolderRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SkillRow = {
  id: string;
  folder_id: string;
  name: string;
  description: string;
  body: string;
  usage_mode: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

type RuleFolderRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type RuleRow = {
  id: string;
  folder_id: string;
  name: string;
  description: string;
  body: string;
  usage_mode: string;
  created_at: string;
  updated_at: string;
};

type StewardMemoryNoteRow = {
  id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type StewardMessageRow = {
  id: string;
  role: string;
  content: string;
  skills_json: string;
  rules_json: string;
  searches_json: string;
  radars_json: string;
  images_json: string;
  created_at: string;
};

declare global {
  var __progressDb: Database.Database | undefined;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    sortOrder: row.sort_order,
    inPiggyBank: Boolean(row.in_piggy_bank),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row: TaskRow): Task {
  let attributes: Record<string, string> = {};
  try {
    attributes = JSON.parse(row.attributes || "{}") as Record<string, string>;
  } catch {
    attributes = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    lane: row.lane as Lane,
    sortOrder: row.sort_order,
    attributes,
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at,
  };
}

function mapProjectAgent(row: ProjectAgentRow): ProjectAgent {
  return {
    id: row.id,
    projectId: row.project_id,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentMemoryNote(row: AgentMemoryNoteRow): AgentMemoryNote {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentMessage(row: AgentMessageRow): AgentMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    role: row.role as AgentMessageRole,
    content: row.content,
    skills: withSkillDescriptions(parseInvokedSkills(row.skills_json)),
    rules: withRuleDescriptions(parseInvokedRules(row.rules_json)),
    searches: parseInvokedSearches(row.searches_json),
    radars: parseInvokedRadars(row.radars_json),
    images: parseMessageImages(row.images_json),
    createdAt: row.created_at,
  };
}

function mapSkillFolder(row: SkillFolderRow): SkillFolder {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    description: row.description,
    body: row.body,
    usageMode: normalizeLibraryUsageMode(row.usage_mode),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? null,
  };
}

function mapRuleFolder(row: RuleFolderRow): RuleFolder {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRule(row: RuleRow): Rule {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    description: row.description,
    body: row.body,
    usageMode: normalizeLibraryUsageMode(row.usage_mode),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStewardMemoryNote(row: StewardMemoryNoteRow): StewardMemoryNote {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStewardMessage(row: StewardMessageRow): StewardMessage {
  return {
    id: row.id,
    role: row.role as AgentMessageRole,
    content: row.content,
    skills: withSkillDescriptions(parseInvokedSkills(row.skills_json)),
    rules: withRuleDescriptions(parseInvokedRules(row.rules_json)),
    searches: parseInvokedSearches(row.searches_json),
    radars: parseInvokedRadars(row.radars_json),
    images: parseMessageImages(row.images_json),
    createdAt: row.created_at,
  };
}

function parseInvokedSkills(value: string | undefined): InvokedSkill[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (skill): skill is InvokedSkill =>
          typeof skill?.id === "string" &&
          typeof skill?.name === "string" &&
          typeof skill?.command === "string",
      )
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        command: skill.command,
        ...(typeof skill.description === "string" && skill.description
          ? { description: skill.description }
          : {}),
      }));
  } catch {
    return [];
  }
}

function parseInvokedRules(value: string | undefined): InvokedRule[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (rule): rule is InvokedRule =>
          typeof rule?.id === "string" && typeof rule?.name === "string",
      )
      .map((rule) => ({
        id: rule.id,
        name: rule.name,
        ...(typeof rule.description === "string" && rule.description
          ? { description: rule.description }
          : {}),
      }));
  } catch {
    return [];
  }
}

function parseInvokedSearches(value: string | undefined): InvokedSearch[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (search): search is InvokedSearch =>
          typeof search?.id === "string" && typeof search?.query === "string",
      )
      .map((search) => ({
        id: search.id,
        query: search.query,
        sources: Array.isArray(search.sources)
          ? search.sources.filter((source): source is string => typeof source === "string")
          : [],
        hits: Array.isArray(search.hits)
          ? search.hits
              .filter(
                (hit: { id?: unknown; title?: unknown; url?: unknown; source?: unknown }) =>
                  typeof hit?.title === "string" && typeof hit?.url === "string",
              )
              .map(
                (hit: {
                  id?: string;
                  title: string;
                  url: string;
                  source?: string;
                  snippet?: string;
                }, index: number) => ({
                  id: typeof hit.id === "string" ? hit.id : String(index + 1),
                  title: hit.title,
                  url: hit.url,
                  source: typeof hit.source === "string" ? hit.source : "web",
                  ...(typeof hit.snippet === "string" && hit.snippet
                    ? { snippet: hit.snippet }
                    : {}),
                }),
              )
          : [],
        pages: Array.isArray(search.pages)
          ? search.pages
              .filter(
                (page: { url?: unknown; title?: unknown }) =>
                  typeof page?.url === "string" && typeof page?.title === "string",
              )
              .map(
                (page: {
                  url: string;
                  title: string;
                  source?: string;
                  text?: string;
                  error?: string;
                }) => ({
                  url: page.url,
                  title: page.title,
                  text: typeof page.text === "string" ? page.text : "",
                  ...(typeof page.source === "string" ? { source: page.source } : {}),
                  ...(typeof page.error === "string" && page.error
                    ? { error: page.error }
                    : {}),
                }),
              )
          : [],
        ...(typeof search.status === "string" ? { status: search.status as InvokedSearch["status"] } : {}),
        ...(typeof search.phase === "string" ? { phase: search.phase as InvokedSearch["phase"] } : {}),
        ...(typeof search.callId === "string" ? { callId: search.callId } : {}),
        ...(typeof search.error === "string" && search.error
          ? { error: search.error }
          : {}),
        ...(typeof search.at === "number" && Number.isFinite(search.at)
          ? { at: Math.max(0, Math.floor(search.at)) }
          : {}),
      }));
  } catch {
    return [];
  }
}

function parseInvokedRadars(value: string | undefined): InvokedRadar[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (radar): radar is InvokedRadar =>
          typeof radar?.sessionId === "string" && radar.sessionId.length > 0,
      )
      .map((radar) => ({
        sessionId: radar.sessionId,
        title: typeof radar.title === "string" ? radar.title : "",
        url: typeof radar.url === "string" ? radar.url : "",
        reportUrl: typeof radar.reportUrl === "string" ? radar.reportUrl : "",
      }));
  } catch {
    return [];
  }
}

function withSkillDescriptions(skills: InvokedSkill[]): InvokedSkill[] {
  return skills.map((skill) => {
    if (skill.description?.trim()) return skill;
    const full = getSkill(skill.id);
    return full?.description
      ? { ...skill, description: full.description }
      : skill;
  });
}

function withRuleDescriptions(rules: InvokedRule[]): InvokedRule[] {
  return rules.map((rule) => {
    if (rule.description?.trim()) return rule;
    const full = getRule(rule.id);
    return full?.description
      ? { ...rule, description: full.description }
      : rule;
  });
}


function parseMessageImages(value: string | undefined): MessageImage[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((image) => typeof image?.id === "string" && typeof image?.url === "string" && typeof image?.path === "string") : [];
  } catch { return []; }
}

function resolveLaneTimestamps(
  existing: { lane: Lane; startedAt: string | null; completedAt: string | null },
  nextLane: Lane,
  now: string,
): { startedAt: string | null; completedAt: string | null } {
  let startedAt = existing.startedAt;
  let completedAt = existing.completedAt;

  if (nextLane === "now" && existing.lane !== "now" && !startedAt) {
    startedAt = now;
  }
  if (nextLane === "done" && existing.lane !== "done") {
    completedAt = now;
    if (!startedAt) startedAt = now;
  }
  if (nextLane !== "done" && existing.lane === "done") {
    completedAt = null;
  }

  return { startedAt, completedAt };
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#525252',
      sort_order INTEGER NOT NULL DEFAULT 0,
      in_piggy_bank INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '[]',
      lane TEXT NOT NULL DEFAULT 'inbox',
      sort_order INTEGER NOT NULL DEFAULT 0,
      attributes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_lane
      ON tasks(project_id, lane, sort_order);

    CREATE TABLE IF NOT EXISTS project_agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      system_prompt TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_memory_notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_memory_notes_project
      ON agent_memory_notes(project_id, sort_order);

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      skills_json TEXT NOT NULL DEFAULT '[]',
      rules_json TEXT NOT NULL DEFAULT '[]',
      images_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_messages_project
      ON agent_messages(project_id, created_at);

    CREATE TABLE IF NOT EXISTS skill_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      usage_mode TEXT NOT NULL DEFAULT 'on_demand',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (folder_id) REFERENCES skill_folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_skills_folder
      ON skills(folder_id, name);

    CREATE TABLE IF NOT EXISTS rule_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      usage_mode TEXT NOT NULL DEFAULT 'on_demand',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES rule_folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_rules_folder
      ON rules(folder_id, name);

    CREATE TABLE IF NOT EXISTS steward_memory_notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steward_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      skills_json TEXT NOT NULL DEFAULT '[]',
      rules_json TEXT NOT NULL DEFAULT '[]',
      images_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_steward_messages_created
      ON steward_messages(created_at);
  `);

  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{
    name: string;
  }>;
  const taskNames = new Set(taskColumns.map((c) => c.name));
  if (!taskNames.has("started_at")) {
    db.exec("ALTER TABLE tasks ADD COLUMN started_at TEXT");
  }
  if (!taskNames.has("completed_at")) {
    db.exec("ALTER TABLE tasks ADD COLUMN completed_at TEXT");
  }

  const projectColumns = db
    .prepare("PRAGMA table_info(projects)")
    .all() as Array<{ name: string }>;
  const projectNames = new Set(projectColumns.map((c) => c.name));
  if (!projectNames.has("in_piggy_bank")) {
    db.exec(
      "ALTER TABLE projects ADD COLUMN in_piggy_bank INTEGER NOT NULL DEFAULT 0",
    );
  }

  const skillColumns = db.prepare("PRAGMA table_info(skills)").all() as Array<{
    name: string;
  }>;
  if (!skillColumns.some((column) => column.name === "last_used_at")) {
    db.exec("ALTER TABLE skills ADD COLUMN last_used_at TEXT");
  }
  if (!skillColumns.some((column) => column.name === "usage_mode")) {
    db.exec(
      "ALTER TABLE skills ADD COLUMN usage_mode TEXT NOT NULL DEFAULT 'on_demand'",
    );
  }

  const ruleColumns = db.prepare("PRAGMA table_info(rules)").all() as Array<{
    name: string;
  }>;
  if (!ruleColumns.some((column) => column.name === "usage_mode")) {
    db.exec(
      "ALTER TABLE rules ADD COLUMN usage_mode TEXT NOT NULL DEFAULT 'on_demand'",
    );
  }

  const agentMessageColumns = db
    .prepare("PRAGMA table_info(agent_messages)")
    .all() as Array<{ name: string }>;
  if (!agentMessageColumns.some((column) => column.name === "skills_json")) {
    db.exec("ALTER TABLE agent_messages ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!agentMessageColumns.some((column) => column.name === "rules_json")) {
    db.exec("ALTER TABLE agent_messages ADD COLUMN rules_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!agentMessageColumns.some((column) => column.name === "images_json")) db.exec("ALTER TABLE agent_messages ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'");
  if (!agentMessageColumns.some((column) => column.name === "searches_json")) {
    db.exec("ALTER TABLE agent_messages ADD COLUMN searches_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!agentMessageColumns.some((column) => column.name === "radars_json")) {
    db.exec("ALTER TABLE agent_messages ADD COLUMN radars_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (agentMessageColumns.some((column) => column.name === "activities_json")) {
    db.exec("DELETE FROM agent_messages WHERE content = '' AND activities_json <> '[]'");
    db.exec("UPDATE agent_messages SET activities_json = '[]' WHERE activities_json <> '[]'");
  }

  const stewardMessageColumns = db
    .prepare("PRAGMA table_info(steward_messages)")
    .all() as Array<{ name: string }>;
  if (!stewardMessageColumns.some((column) => column.name === "skills_json")) {
    db.exec("ALTER TABLE steward_messages ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!stewardMessageColumns.some((column) => column.name === "rules_json")) {
    db.exec("ALTER TABLE steward_messages ADD COLUMN rules_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!stewardMessageColumns.some((column) => column.name === "images_json")) db.exec("ALTER TABLE steward_messages ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'");
  if (!stewardMessageColumns.some((column) => column.name === "searches_json")) {
    db.exec("ALTER TABLE steward_messages ADD COLUMN searches_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!stewardMessageColumns.some((column) => column.name === "radars_json")) {
    db.exec("ALTER TABLE steward_messages ADD COLUMN radars_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (stewardMessageColumns.some((column) => column.name === "activities_json")) {
    db.exec("DELETE FROM steward_messages WHERE content = '' AND activities_json <> '[]'");
    db.exec("UPDATE steward_messages SET activities_json = '[]' WHERE activities_json <> '[]'");
  }

  // Best-effort backfill for rows created before timestamp columns existed.
  db.exec(`
    UPDATE tasks
    SET started_at = created_at
    WHERE lane IN ('now', 'done') AND started_at IS NULL;

    UPDATE tasks
    SET completed_at = updated_at
    WHERE lane = 'done' AND completed_at IS NULL;
  `);
}

function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM projects").get() as {
    c: number;
  };
  if (count.c > 0) return;

  const now = new Date().toISOString();
  const seeds: Array<Omit<Project, "createdAt" | "updatedAt"> & { id: string }> =
    [
      {
        id: randomUUID(),
        name: "3D Infra",
        slug: "3d-infra",
        description: "主业：3D 生成基础设施",
        color: "#66CCCC",
        sortOrder: 0,
        inPiggyBank: false,
      },
      {
        id: randomUUID(),
        name: "AI 漫剧",
        slug: "ai-comics",
        description: "副业：AI 漫剧创作管线",
        color: "#FF9900",
        sortOrder: 1,
        inPiggyBank: false,
      },
      {
        id: randomUUID(),
        name: "AI 选品带货",
        slug: "ai-products",
        description: "副业：AI 选品与带货实验",
        color: "#CC3399",
        sortOrder: 2,
        inPiggyBank: false,
      },
    ];

  const insert = db.prepare(`
    INSERT INTO projects (id, name, slug, description, color, sort_order, in_piggy_bank, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  for (const p of seeds) {
    insert.run(
      p.id,
      p.name,
      p.slug,
      p.description,
      p.color,
      p.sortOrder,
      now,
      now,
    );
  }

  const sampleTasks = [
    {
      projectId: seeds[0].id,
      title: "梳理 3D 生成服务的推理链路",
      lane: "now" as Lane,
      attributes: { area: "infra", priority: "high" },
    },
    {
      projectId: seeds[1].id,
      title: "写一集漫剧分镜 Prompt 模板",
      lane: "next" as Lane,
      attributes: { episode: "01" },
    },
    {
      projectId: seeds[2].id,
      title: "收集一批可测 ROI 的候选品",
      lane: "later" as Lane,
      attributes: { source: "manual" },
    },
    {
      projectId: null,
      title: "突然冒出来的灵感：做一个跨项目周复盘",
      lane: "inbox" as Lane,
      attributes: {},
    },
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, project_id, title, content, lane, sort_order, attributes,
      created_at, started_at, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sampleTasks.forEach((t, index) => {
    insertTask.run(
      randomUUID(),
      t.projectId,
      t.title,
      "[]",
      t.lane,
      index,
      JSON.stringify(t.attributes),
      now,
      t.lane === "now" ? now : null,
      null,
      now,
    );
  });
}

export function getDb() {
  if (!global.__progressDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    global.__progressDb = new Database(DB_PATH);
  }
  ensureSchema(global.__progressDb);
  seedIfEmpty(global.__progressDb);
  return global.__progressDb;
}

export function listProjects(options?: {
  /** When set, filter by piggy-bank membership. Omit for all projects. */
  inPiggyBank?: boolean;
}): Project[] {
  if (options?.inPiggyBank === undefined) {
    const rows = getDb()
      .prepare(
        "SELECT * FROM projects ORDER BY sort_order ASC, created_at ASC",
      )
      .all() as ProjectRow[];
    return rows.map(mapProject);
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM projects
       WHERE in_piggy_bank = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(options.inPiggyBank ? 1 : 0) as ProjectRow[];
  return rows.map(mapProject);
}

export function listActiveProjects(): Project[] {
  return listProjects({ inPiggyBank: false });
}

export function listPiggyBankProjects(): Project[] {
  return listProjects({ inPiggyBank: true });
}

export function getProject(id: string): Project | null {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  return row ? mapProject(row) : null;
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `project-${Date.now().toString(36)}`;
}

function uniqueSlug(desired: string, excludeId?: string): string {
  let slug = desired;
  let i = 2;
  while (true) {
    const row = getDb()
      .prepare("SELECT id FROM projects WHERE slug = ?")
      .get(slug) as { id: string } | undefined;
    if (!row || row.id === excludeId) return slug;
    slug = `${desired}-${i}`;
    i += 1;
  }
}

export function createProject(input: {
  name: string;
  slug?: string;
  description?: string;
  color?: string;
}): Project {
  const now = new Date().toISOString();
  const id = randomUUID();
  const max = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM projects
       WHERE in_piggy_bank = 0`,
    )
    .get() as { m: number };
  const slug = uniqueSlug(input.slug?.trim() || slugify(input.name));

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, slug, description, color, sort_order, in_piggy_bank, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      id,
      input.name,
      slug,
      input.description ?? "",
      input.color ?? "#66CCCC",
      max.m + 1,
      now,
      now,
    );

  return getProject(id)!;
}

export function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    slug: string;
    description: string;
    color: string;
  }>,
): Project | null {
  const existing = getProject(id);
  if (!existing) return null;

  const name = patch.name?.trim() || existing.name;
  const slug = uniqueSlug(
    patch.slug?.trim() ||
      (patch.name && patch.name.trim() !== existing.name
        ? slugify(name)
        : existing.slug),
    id,
  );

  getDb()
    .prepare(
      `UPDATE projects
       SET name = ?, slug = ?, description = ?, color = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      slug,
      patch.description !== undefined
        ? patch.description
        : existing.description,
      patch.color ?? existing.color,
      new Date().toISOString(),
      id,
    );

  return getProject(id);
}

export function deleteProject(id: string): boolean {
  if (!getProject(id)) return false;
  // Detach tasks then remove project.
  getDb()
    .prepare(
      `UPDATE tasks
       SET project_id = NULL, lane = CASE WHEN lane = 'done' THEN 'done' ELSE 'inbox' END,
           updated_at = ?
       WHERE project_id = ?`,
    )
    .run(new Date().toISOString(), id);
  const result = getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

/**
 * Reorder active (non–piggy-bank) Projects. `orderedIds` must be a complete
 * permutation of every active Project id.
 */
export function reorderProjects(orderedIds: string[]) {
  const active = listActiveProjects();
  const activeIds = active.map((p) => p.id);
  if (orderedIds.length !== activeIds.length) {
    throw new Error(
      `Project Order must list every active project exactly once (expected ${activeIds.length}, got ${orderedIds.length})`,
    );
  }
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) throw new Error(`Duplicate project id: ${id}`);
    seen.add(id);
    const project = getProject(id);
    if (!project) throw new Error(`Project not found: ${id}`);
    if (project.inPiggyBank) {
      throw new Error(`Project is in the piggy bank and cannot be ordered: ${project.name}`);
    }
  }
  for (const id of activeIds) {
    if (!seen.has(id)) {
      throw new Error("Project Order is missing one or more active projects");
    }
  }

  const stmt = getDb().prepare(
    `UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ? AND in_piggy_bank = 0`,
  );
  const now = new Date().toISOString();
  getDb().exec("BEGIN");
  try {
    orderedIds.forEach((id, index) => {
      stmt.run(index, now, id);
    });
    getDb().exec("COMMIT");
  } catch (error) {
    getDb().exec("ROLLBACK");
    throw error;
  }
}

/** Move a Project into or out of the Project Piggy Bank. */
export function setProjectInPiggyBank(
  id: string,
  inPiggyBank: boolean,
): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  if (existing.inPiggyBank === inPiggyBank) return existing;

  const now = new Date().toISOString();
  if (inPiggyBank) {
    getDb()
      .prepare(
        `UPDATE projects SET in_piggy_bank = 1, updated_at = ? WHERE id = ?`,
      )
      .run(now, id);
  } else {
    const max = getDb()
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS m FROM projects
         WHERE in_piggy_bank = 0`,
      )
      .get() as { m: number };
    getDb()
      .prepare(
        `UPDATE projects
         SET in_piggy_bank = 0, sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(max.m + 1, now, id);
  }
  return getProject(id);
}

export function listTasks(filters?: {
  projectId?: string | null;
  lane?: Lane;
  inboxOnly?: boolean;
}): Task[] {
  const clauses: string[] = [];
  const params: Array<string | null> = [];

  if (filters?.inboxOnly) {
    clauses.push("lane = 'inbox'");
  } else if (filters?.projectId !== undefined) {
    clauses.push("project_id = ?");
    params.push(filters.projectId);
  }

  if (filters?.lane) {
    clauses.push("lane = ?");
    params.push(filters.lane);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT * FROM tasks ${where} ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(...params) as TaskRow[];
  return rows.map(mapTask);
}

export function getTask(id: string): Task | null {
  const row = getDb()
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(id) as TaskRow | undefined;
  return row ? mapTask(row) : null;
}

export function createTask(input: {
  title: string;
  projectId?: string | null;
  lane?: Lane;
  content?: string;
  attributes?: Record<string, string>;
}): Task {
  const now = new Date().toISOString();
  const id = randomUUID();
  const lane = input.lane ?? "inbox";
  const projectId = input.projectId ?? null;

  const max = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks
       WHERE lane = ? AND ${projectId === null ? "project_id IS NULL" : "project_id = ?"}`,
    )
    .get(...(projectId === null ? [lane] : [lane, projectId])) as { m: number };

  const startedAt = lane === "now" || lane === "done" ? now : null;
  const completedAt = lane === "done" ? now : null;

  getDb()
    .prepare(
      `INSERT INTO tasks (
         id, project_id, title, content, lane, sort_order, attributes,
         created_at, started_at, completed_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      projectId,
      input.title,
      input.content ?? "[]",
      lane,
      max.m + 1,
      JSON.stringify(input.attributes ?? {}),
      now,
      startedAt,
      completedAt,
      now,
    );

  return getTask(id)!;
}

export function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    projectId: string | null;
    lane: Lane;
    content: string;
    attributes: Record<string, string>;
    sortOrder: number;
  }>,
): Task | null {
  const existing = getTask(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextLane = patch.lane ?? existing.lane;
  const stamps = resolveLaneTimestamps(existing, nextLane, now);

  const next = {
    title: patch.title ?? existing.title,
    projectId:
      patch.projectId !== undefined ? patch.projectId : existing.projectId,
    lane: nextLane,
    content: patch.content ?? existing.content,
    attributes: patch.attributes ?? existing.attributes,
    sortOrder:
      patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder,
    startedAt: stamps.startedAt,
    completedAt: stamps.completedAt,
  };

  getDb()
    .prepare(
      `UPDATE tasks
       SET title = ?, project_id = ?, lane = ?, content = ?, attributes = ?,
           sort_order = ?, started_at = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.title,
      next.projectId,
      next.lane,
      next.content,
      JSON.stringify(next.attributes),
      next.sortOrder,
      next.startedAt,
      next.completedAt,
      now,
      id,
    );

  return getTask(id);
}

export function reorderTasks(
  updates: Array<{ id: string; lane: Lane; sortOrder: number; projectId?: string | null }>,
) {
  const withProject = getDb().prepare(
    `UPDATE tasks
     SET lane = ?, sort_order = ?, project_id = ?, started_at = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  );
  const withoutProject = getDb().prepare(
    `UPDATE tasks
     SET lane = ?, sort_order = ?, started_at = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  );
  const now = new Date().toISOString();
  getDb().exec("BEGIN");
  try {
    for (const row of updates) {
      const existing = getTask(row.id);
      if (!existing) continue;
      const stamps = resolveLaneTimestamps(existing, row.lane, now);
      if (row.projectId !== undefined) {
        withProject.run(
          row.lane,
          row.sortOrder,
          row.projectId,
          stamps.startedAt,
          stamps.completedAt,
          now,
          row.id,
        );
      } else {
        withoutProject.run(
          row.lane,
          row.sortOrder,
          stamps.startedAt,
          stamps.completedAt,
          now,
          row.id,
        );
      }
    }
    getDb().exec("COMMIT");
  } catch (error) {
    getDb().exec("ROLLBACK");
    throw error;
  }
}

export function deleteTask(id: string): boolean {
  const result = getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function countNowTasks(projectId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS c FROM tasks WHERE project_id = ? AND lane = 'now'",
    )
    .get(projectId) as { c: number };
  return row.c;
}

export function ensureProjectAgent(projectId: string): ProjectAgent {
  const existing = getDb()
    .prepare("SELECT * FROM project_agents WHERE project_id = ?")
    .get(projectId) as ProjectAgentRow | undefined;
  if (existing) return mapProjectAgent(existing);

  const now = new Date().toISOString();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO project_agents (id, project_id, system_prompt, created_at, updated_at)
       VALUES (?, ?, '', ?, ?)`,
    )
    .run(id, projectId, now, now);

  return mapProjectAgent(
    getDb()
      .prepare("SELECT * FROM project_agents WHERE id = ?")
      .get(id) as ProjectAgentRow,
  );
}

export function getProjectAgent(projectId: string): ProjectAgent | null {
  const row = getDb()
    .prepare("SELECT * FROM project_agents WHERE project_id = ?")
    .get(projectId) as ProjectAgentRow | undefined;
  return row ? mapProjectAgent(row) : null;
}

export function listAgentMemoryNotes(projectId: string): AgentMemoryNote[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM agent_memory_notes
       WHERE project_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(projectId) as AgentMemoryNoteRow[];
  return rows.map(mapAgentMemoryNote);
}

export function getAgentMemoryNote(id: string): AgentMemoryNote | null {
  const row = getDb()
    .prepare("SELECT * FROM agent_memory_notes WHERE id = ?")
    .get(id) as AgentMemoryNoteRow | undefined;
  return row ? mapAgentMemoryNote(row) : null;
}

export function createAgentMemoryNote(input: {
  projectId: string;
  title?: string;
  body?: string;
}): AgentMemoryNote {
  const now = new Date().toISOString();
  const id = randomUUID();
  const max = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m
       FROM agent_memory_notes WHERE project_id = ?`,
    )
    .get(input.projectId) as { m: number };

  getDb()
    .prepare(
      `INSERT INTO agent_memory_notes
         (id, project_id, title, body, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.title ?? "",
      input.body ?? "",
      max.m + 1,
      now,
      now,
    );

  return getAgentMemoryNote(id)!;
}

export function updateAgentMemoryNote(
  id: string,
  patch: Partial<{ title: string; body: string; sortOrder: number }>,
): AgentMemoryNote | null {
  const existing = getAgentMemoryNote(id);
  if (!existing) return null;

  getDb()
    .prepare(
      `UPDATE agent_memory_notes
       SET title = ?, body = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.title !== undefined ? patch.title : existing.title,
      patch.body !== undefined ? patch.body : existing.body,
      patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder,
      new Date().toISOString(),
      id,
    );

  return getAgentMemoryNote(id);
}

export function deleteAgentMemoryNote(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM agent_memory_notes WHERE id = ?")
    .run(id);
  return Number(result.changes) > 0;
}

export function listAgentMessages(
  projectId: string,
  options?: { limit?: number },
): AgentMessage[] {
  const limit = options?.limit;
  if (limit !== undefined) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT * FROM agent_messages
           WHERE project_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         ) AS recent
         ORDER BY created_at ASC`,
      )
      .all(projectId, limit) as AgentMessageRow[];
    return rows.map(mapAgentMessage);
  }

  const rows = getDb()
    .prepare(
      `SELECT * FROM agent_messages
       WHERE project_id = ?
       ORDER BY created_at ASC`,
    )
    .all(projectId) as AgentMessageRow[];
  return rows.map(mapAgentMessage);
}

export function countAgentMessages(projectId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM agent_messages WHERE project_id = ?")
    .get(projectId) as { c: number };
  return row.c;
}

/**
 * Newest-first page of Agent Messages (returned oldest→newest).
 * Pass `beforeId` to load messages older than that id.
 */
export function listAgentMessagesPage(
  projectId: string,
  options?: { limit?: number; beforeId?: string },
): { messages: AgentMessage[]; hasMore: boolean } {
  const limit = options?.limit ?? CHAT_HISTORY_PAGE_SIZE;
  const take = limit + 1;
  const beforeId = options?.beforeId?.trim();

  let rows: AgentMessageRow[];
  if (beforeId) {
    rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT m.* FROM agent_messages m
           JOIN agent_messages cursor ON cursor.id = ?
           WHERE m.project_id = ?
             AND cursor.project_id = ?
             AND (
               m.created_at < cursor.created_at
               OR (m.created_at = cursor.created_at AND m.id < cursor.id)
             )
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT ?
         ) AS older
         ORDER BY created_at ASC, id ASC`,
      )
      .all(beforeId, projectId, projectId, take) as AgentMessageRow[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT * FROM agent_messages
           WHERE project_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         ) AS recent
         ORDER BY created_at ASC, id ASC`,
      )
      .all(projectId, take) as AgentMessageRow[];
  }

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(rows.length - limit) : rows;
  return { messages: slice.map(mapAgentMessage), hasMore };
}

export type { ChatMessageSearchHit };

function chatSearchSnippet(content: string, query: string, radius = 56): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "（空消息）";
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const at = lower.indexOf(needle);
  if (at < 0) {
    return text.length <= radius * 2 ? text : `${text.slice(0, radius * 2)}…`;
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/** Keyword search over Agent chat history (newest matches first). */
export function searchAgentMessages(
  projectId: string,
  query: string,
  options?: { limit?: number },
): ChatMessageSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(100, Math.max(1, options?.limit ?? 40));
  const pattern = `%${escapeLike(q)}%`;
  const rows = getDb()
    .prepare(
      `SELECT id, role, content, created_at FROM agent_messages
       WHERE project_id = ?
         AND content LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(projectId, pattern, limit) as Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    role: row.role as AgentMessageRole,
    snippet: chatSearchSnippet(row.content, q),
    createdAt: row.created_at,
  }));
}

/**
 * Messages from `throughId` (inclusive) through newest, oldest→newest.
 * Used to jump from search into a historical bubble.
 */
export function listAgentMessagesThrough(
  projectId: string,
  throughId: string,
): { messages: AgentMessage[]; hasMore: boolean } | null {
  const target = getDb()
    .prepare(
      `SELECT id, created_at FROM agent_messages WHERE id = ? AND project_id = ?`,
    )
    .get(throughId, projectId) as
    | { id: string; created_at: string }
    | undefined;
  if (!target) return null;

  const rows = getDb()
    .prepare(
      `SELECT * FROM agent_messages
       WHERE project_id = ?
         AND (
           created_at > ?
           OR (created_at = ? AND id >= ?)
         )
       ORDER BY created_at ASC, id ASC`,
    )
    .all(
      projectId,
      target.created_at,
      target.created_at,
      target.id,
    ) as AgentMessageRow[];

  const older = getDb()
    .prepare(
      `SELECT 1 AS ok FROM agent_messages
       WHERE project_id = ?
         AND (
           created_at < ?
           OR (created_at = ? AND id < ?)
         )
       LIMIT 1`,
    )
    .get(projectId, target.created_at, target.created_at, target.id) as
    | { ok: number }
    | undefined;

  return {
    messages: rows.map(mapAgentMessage),
    hasMore: Boolean(older),
  };
}

export function createAgentMessage(input: {
  projectId: string;
  role: AgentMessageRole;
  content: string;
}): AgentMessage {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO agent_messages (id, project_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, input.projectId, input.role, input.content, now);

  return mapAgentMessage(
    getDb()
      .prepare("SELECT * FROM agent_messages WHERE id = ?")
      .get(id) as AgentMessageRow,
  );
}

export function getAgentMessage(id: string): AgentMessage | null {
  const row = getDb()
    .prepare("SELECT * FROM agent_messages WHERE id = ?")
    .get(id) as AgentMessageRow | undefined;
  return row ? mapAgentMessage(row) : null;
}

/**
 * Delete from a cut point in the project conversation.
 * Resolve cut point by messageId, then userOrdinal (0-based among user turns),
 * then keepCount (messages retained from the start).
 * When keepMessage is true, the cut message itself is kept and only later ones are deleted.
 */
export function rewindAgentMessages(
  projectId: string,
  input: {
    messageId?: string;
    keepCount: number;
    userOrdinal?: number;
    keepMessage?: boolean;
  },
): { kept: number; deleted: number; messages: AgentMessage[]; hasMore: boolean } {
  const all = listAgentMessages(projectId);
  let startIndex = -1;
  if (input.messageId) {
    const found = all.findIndex((m) => m.id === input.messageId);
    if (found >= 0) startIndex = found;
  }
  if (
    startIndex < 0 &&
    typeof input.userOrdinal === "number" &&
    input.userOrdinal >= 0
  ) {
    const users = all.filter((m) => m.role === "user");
    const target = users[input.userOrdinal];
    if (target) startIndex = all.findIndex((m) => m.id === target.id);
  }
  if (startIndex < 0) {
    startIndex = Math.max(0, Math.min(input.keepCount, all.length));
  }
  if (input.keepMessage && startIndex >= 0) {
    startIndex += 1;
  }

  const toDelete = all.slice(startIndex);
  if (toDelete.length > 0) {
    const del = getDb().prepare("DELETE FROM agent_messages WHERE id = ?");
    getDb().exec("BEGIN");
    try {
      for (const row of toDelete) del.run(row.id);
      getDb().exec("COMMIT");
    } catch (error) {
      getDb().exec("ROLLBACK");
      throw error;
    }
  }

  const page = listAgentMessagesPage(projectId, {
    limit: CHAT_HISTORY_PAGE_SIZE,
  });
  return {
    kept: countAgentMessages(projectId),
    deleted: toDelete.length,
    messages: page.messages,
    hasMore: page.hasMore,
  };
}

export function listRecentAgentMessagesForPrompt(
  projectId: string,
): AgentMessage[] {
  return listAgentMessages(projectId, { limit: AGENT_PROMPT_MESSAGE_LIMIT });
}

export function listSkillFolders(): SkillFolder[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM skill_folders
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all() as SkillFolderRow[];
  return rows.map(mapSkillFolder);
}

export function getSkillFolder(id: string): SkillFolder | null {
  const row = getDb()
    .prepare("SELECT * FROM skill_folders WHERE id = ?")
    .get(id) as SkillFolderRow | undefined;
  return row ? mapSkillFolder(row) : null;
}

export function countSkillsInFolder(folderId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM skills WHERE folder_id = ?")
    .get(folderId) as { c: number };
  return row.c;
}

export function findSkillFolderByName(
  name: string,
  excludeId?: string,
): SkillFolder | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const row = getDb()
    .prepare(
      `SELECT * FROM skill_folders
       WHERE lower(name) = ?
         AND (? IS NULL OR id != ?)
       LIMIT 1`,
    )
    .get(normalized, excludeId ?? null, excludeId ?? null) as
    | SkillFolderRow
    | undefined;
  return row ? mapSkillFolder(row) : null;
}

export function createSkillFolder(input: { name: string }): SkillFolder {
  const name = input.name.trim();
  if (!name) throw new Error("Folder name is required");
  if (findSkillFolderByName(name)) {
    throw new Error("文件夹名称已存在");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM skill_folders")
    .get() as { m: number };

  getDb()
    .prepare(
      `INSERT INTO skill_folders (id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, name, max.m + 1, now, now);

  return getSkillFolder(id)!;
}

export function updateSkillFolder(
  id: string,
  patch: Partial<{ name: string; sortOrder: number }>,
): SkillFolder | null {
  const existing = getSkillFolder(id);
  if (!existing) return null;

  const name =
    patch.name !== undefined ? patch.name.trim() || existing.name : existing.name;

  if (
    patch.name !== undefined &&
    findSkillFolderByName(name, id)
  ) {
    throw new Error("文件夹名称已存在");
  }

  getDb()
    .prepare(
      `UPDATE skill_folders
       SET name = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder,
      new Date().toISOString(),
      id,
    );

  return getSkillFolder(id);
}

export function deleteSkillFolder(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM skill_folders WHERE id = ?")
    .run(id);
  return Number(result.changes) > 0;
}

export function reorderSkillFolders(orderedIds: string[]) {
  const stmt = getDb().prepare(
    `UPDATE skill_folders SET sort_order = ?, updated_at = ? WHERE id = ?`,
  );
  const now = new Date().toISOString();
  getDb().exec("BEGIN");
  try {
    orderedIds.forEach((id, index) => {
      stmt.run(index, now, id);
    });
    getDb().exec("COMMIT");
  } catch (error) {
    getDb().exec("ROLLBACK");
    throw error;
  }
}

export function listSkills(folderId: string): Skill[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM skills
       WHERE folder_id = ?
       ORDER BY name ASC, created_at ASC`,
    )
    .all(folderId) as SkillRow[];
  return rows.map(mapSkill);
}

export function listSkillsByRecentUse(): Skill[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM skills
       ORDER BY last_used_at IS NULL ASC, last_used_at DESC, name ASC`,
    )
    .all() as SkillRow[];
  return rows.map(mapSkill);
}

export function listRequiredSkills(): Skill[] {
  return listSkillsByRecentUse().filter(
    (skill) => skill.usageMode === "required",
  );
}

export function listAllRules(): Rule[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM rules
       ORDER BY name ASC, created_at ASC`,
    )
    .all() as RuleRow[];
  return rows.map(mapRule);
}

export function listRequiredRules(): Rule[] {
  return listAllRules().filter((rule) => rule.usageMode === "required");
}

export function markSkillsUsed(ids: string[]): void {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  const update = getDb().prepare("UPDATE skills SET last_used_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  const transaction = getDb().transaction((skillIds: string[]) => {
    for (const id of skillIds) update.run(now, id);
  });
  transaction(uniqueIds);
}

export function getSkill(id: string): Skill | null {
  const row = getDb()
    .prepare("SELECT * FROM skills WHERE id = ?")
    .get(id) as SkillRow | undefined;
  return row ? mapSkill(row) : null;
}

function normalizeSkillName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function normalizeLibraryUsageMode(value: unknown): LibraryUsageMode {
  return value === "required" ? "required" : "on_demand";
}

/** @deprecated Prefer normalizeLibraryUsageMode */
export function normalizeSkillUsageMode(value: unknown): SkillUsageMode {
  return normalizeLibraryUsageMode(value);
}

export function createSkill(input: {
  folderId: string;
  name: string;
  description?: string;
  body?: string;
  usageMode?: LibraryUsageMode;
}): Skill {
  if (!getSkillFolder(input.folderId)) {
    throw new Error("Folder not found");
  }

  const name = normalizeSkillName(input.name) || `skill-${Date.now().toString(36)}`;
  const usageMode = normalizeLibraryUsageMode(input.usageMode);
  const now = new Date().toISOString();
  const id = randomUUID();

  getDb()
    .prepare(
      `INSERT INTO skills (id, folder_id, name, description, body, usage_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.folderId,
      name,
      input.description?.trim() ?? "",
      input.body ?? "",
      usageMode,
      now,
      now,
    );

  return getSkill(id)!;
}

export function updateSkill(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    body: string;
    folderId: string;
    usageMode: LibraryUsageMode;
  }>,
): Skill | null {
  const existing = getSkill(id);
  if (!existing) return null;

  if (patch.folderId && !getSkillFolder(patch.folderId)) {
    throw new Error("Folder not found");
  }

  const name =
    patch.name !== undefined
      ? normalizeSkillName(patch.name) || existing.name
      : existing.name;
  const usageMode =
    patch.usageMode !== undefined
      ? normalizeLibraryUsageMode(patch.usageMode)
      : existing.usageMode;

  getDb()
    .prepare(
      `UPDATE skills
       SET folder_id = ?, name = ?, description = ?, body = ?, usage_mode = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.folderId ?? existing.folderId,
      name,
      patch.description !== undefined
        ? patch.description.trim()
        : existing.description,
      patch.body !== undefined ? patch.body : existing.body,
      usageMode,
      new Date().toISOString(),
      id,
    );

  return getSkill(id);
}

export function deleteSkill(id: string): boolean {
  const result = getDb().prepare("DELETE FROM skills WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

/** Assemble Cursor-style SKILL.md text from a Skill record. */
export function formatSkillMarkdown(skill: Skill): string {
  const description = skill.description.trim() || "No description provided.";
  return `---
name: ${skill.name}
description: >-
  ${description.replace(/\n/g, "\n  ")}
usage_mode: ${skill.usageMode}
---

${skill.body.trim()}\n`;
}

export function listRuleFolders(): RuleFolder[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM rule_folders
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all() as RuleFolderRow[];
  return rows.map(mapRuleFolder);
}

export function getRuleFolder(id: string): RuleFolder | null {
  const row = getDb()
    .prepare("SELECT * FROM rule_folders WHERE id = ?")
    .get(id) as RuleFolderRow | undefined;
  return row ? mapRuleFolder(row) : null;
}

export function countRulesInFolder(folderId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM rules WHERE folder_id = ?")
    .get(folderId) as { c: number };
  return row.c;
}

export function findRuleFolderByName(
  name: string,
  excludeId?: string,
): RuleFolder | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const row = getDb()
    .prepare(
      `SELECT * FROM rule_folders
       WHERE lower(name) = ?
         AND (? IS NULL OR id != ?)
       LIMIT 1`,
    )
    .get(normalized, excludeId ?? null, excludeId ?? null) as
    | RuleFolderRow
    | undefined;
  return row ? mapRuleFolder(row) : null;
}

export function createRuleFolder(input: { name: string }): RuleFolder {
  const name = input.name.trim();
  if (!name) throw new Error("Folder name is required");
  if (findRuleFolderByName(name)) {
    throw new Error("文件夹名称已存在");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM rule_folders")
    .get() as { m: number };

  getDb()
    .prepare(
      `INSERT INTO rule_folders (id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, name, max.m + 1, now, now);

  return getRuleFolder(id)!;
}

export function updateRuleFolder(
  id: string,
  patch: Partial<{ name: string; sortOrder: number }>,
): RuleFolder | null {
  const existing = getRuleFolder(id);
  if (!existing) return null;

  const name =
    patch.name !== undefined ? patch.name.trim() || existing.name : existing.name;

  if (patch.name !== undefined && findRuleFolderByName(name, id)) {
    throw new Error("文件夹名称已存在");
  }

  getDb()
    .prepare(
      `UPDATE rule_folders
       SET name = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder,
      new Date().toISOString(),
      id,
    );

  return getRuleFolder(id);
}

export function deleteRuleFolder(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM rule_folders WHERE id = ?")
    .run(id);
  return Number(result.changes) > 0;
}

export function reorderRuleFolders(orderedIds: string[]) {
  const stmt = getDb().prepare(
    `UPDATE rule_folders SET sort_order = ?, updated_at = ? WHERE id = ?`,
  );
  const now = new Date().toISOString();
  getDb().exec("BEGIN");
  try {
    orderedIds.forEach((id, index) => {
      stmt.run(index, now, id);
    });
    getDb().exec("COMMIT");
  } catch (error) {
    getDb().exec("ROLLBACK");
    throw error;
  }
}

export function listRules(folderId: string): Rule[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM rules
       WHERE folder_id = ?
       ORDER BY name ASC, created_at ASC`,
    )
    .all(folderId) as RuleRow[];
  return rows.map(mapRule);
}

export function getRule(id: string): Rule | null {
  const row = getDb()
    .prepare("SELECT * FROM rules WHERE id = ?")
    .get(id) as RuleRow | undefined;
  return row ? mapRule(row) : null;
}

function normalizeRuleName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function createRule(input: {
  folderId: string;
  name: string;
  description?: string;
  body?: string;
  usageMode?: LibraryUsageMode;
}): Rule {
  if (!getRuleFolder(input.folderId)) {
    throw new Error("Folder not found");
  }

  const name =
    normalizeRuleName(input.name) || `rule-${Date.now().toString(36)}`;
  const usageMode = normalizeLibraryUsageMode(input.usageMode);
  const now = new Date().toISOString();
  const id = randomUUID();

  getDb()
    .prepare(
      `INSERT INTO rules (id, folder_id, name, description, body, usage_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.folderId,
      name,
      input.description?.trim() ?? "",
      input.body ?? "",
      usageMode,
      now,
      now,
    );

  return getRule(id)!;
}

export function updateRule(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    body: string;
    folderId: string;
    usageMode: LibraryUsageMode;
  }>,
): Rule | null {
  const existing = getRule(id);
  if (!existing) return null;

  if (patch.folderId && !getRuleFolder(patch.folderId)) {
    throw new Error("Folder not found");
  }

  const name =
    patch.name !== undefined
      ? normalizeRuleName(patch.name) || existing.name
      : existing.name;
  const usageMode =
    patch.usageMode !== undefined
      ? normalizeLibraryUsageMode(patch.usageMode)
      : existing.usageMode;

  getDb()
    .prepare(
      `UPDATE rules
       SET folder_id = ?, name = ?, description = ?, body = ?, usage_mode = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.folderId ?? existing.folderId,
      name,
      patch.description !== undefined
        ? patch.description.trim()
        : existing.description,
      patch.body !== undefined ? patch.body : existing.body,
      usageMode,
      new Date().toISOString(),
      id,
    );

  return getRule(id);
}

export function deleteRule(id: string): boolean {
  const result = getDb().prepare("DELETE FROM rules WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

/** Assemble Cursor-rule style markdown from a Rule record. */
export function formatRuleMarkdown(rule: Rule): string {
  const description = rule.description.trim() || "No description provided.";
  return `---
name: ${rule.name}
description: >-
  ${description.replace(/\n/g, "\n  ")}
usage_mode: ${rule.usageMode}
---

${rule.body.trim()}\n`;
}

export function listStewardMemoryNotes(): StewardMemoryNote[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM steward_memory_notes
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all() as StewardMemoryNoteRow[];
  return rows.map(mapStewardMemoryNote);
}

export function getStewardMemoryNote(id: string): StewardMemoryNote | null {
  const row = getDb()
    .prepare("SELECT * FROM steward_memory_notes WHERE id = ?")
    .get(id) as StewardMemoryNoteRow | undefined;
  return row ? mapStewardMemoryNote(row) : null;
}

export function createStewardMemoryNote(input: {
  title?: string;
  body?: string;
}): StewardMemoryNote {
  const now = new Date().toISOString();
  const id = randomUUID();
  const max = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM steward_memory_notes`,
    )
    .get() as { m: number };

  getDb()
    .prepare(
      `INSERT INTO steward_memory_notes
         (id, title, body, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.title ?? "", input.body ?? "", max.m + 1, now, now);

  return getStewardMemoryNote(id)!;
}

export function updateStewardMemoryNote(
  id: string,
  patch: Partial<{ title: string; body: string; sortOrder: number }>,
): StewardMemoryNote | null {
  const existing = getStewardMemoryNote(id);
  if (!existing) return null;

  getDb()
    .prepare(
      `UPDATE steward_memory_notes
       SET title = ?, body = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.title !== undefined ? patch.title : existing.title,
      patch.body !== undefined ? patch.body : existing.body,
      patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder,
      new Date().toISOString(),
      id,
    );

  return getStewardMemoryNote(id);
}

export function deleteStewardMemoryNote(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM steward_memory_notes WHERE id = ?")
    .run(id);
  return Number(result.changes) > 0;
}

export function listStewardMessages(options?: {
  limit?: number;
}): StewardMessage[] {
  const limit = options?.limit;
  if (limit !== undefined) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT * FROM steward_messages
           ORDER BY created_at DESC
           LIMIT ?
         ) AS recent
         ORDER BY created_at ASC`,
      )
      .all(limit) as StewardMessageRow[];
    return rows.map(mapStewardMessage);
  }

  const rows = getDb()
    .prepare(`SELECT * FROM steward_messages ORDER BY created_at ASC`)
    .all() as StewardMessageRow[];
  return rows.map(mapStewardMessage);
}

export function countStewardMessages(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM steward_messages")
    .get() as { c: number };
  return row.c;
}

/**
 * Newest-first page of Steward Messages (returned oldest→newest).
 * Pass `beforeId` to load messages older than that id.
 */
export function listStewardMessagesPage(options?: {
  limit?: number;
  beforeId?: string;
}): { messages: StewardMessage[]; hasMore: boolean } {
  const limit = options?.limit ?? CHAT_HISTORY_PAGE_SIZE;
  const take = limit + 1;
  const beforeId = options?.beforeId?.trim();

  let rows: StewardMessageRow[];
  if (beforeId) {
    rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT m.* FROM steward_messages m
           JOIN steward_messages cursor ON cursor.id = ?
           WHERE (
             m.created_at < cursor.created_at
             OR (m.created_at = cursor.created_at AND m.id < cursor.id)
           )
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT ?
         ) AS older
         ORDER BY created_at ASC, id ASC`,
      )
      .all(beforeId, take) as StewardMessageRow[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT * FROM steward_messages
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         ) AS recent
         ORDER BY created_at ASC, id ASC`,
      )
      .all(take) as StewardMessageRow[];
  }

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(rows.length - limit) : rows;
  return { messages: slice.map(mapStewardMessage), hasMore };
}

/** Keyword search over Steward chat history (newest matches first). */
export function searchStewardMessages(
  query: string,
  options?: { limit?: number },
): ChatMessageSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(100, Math.max(1, options?.limit ?? 40));
  const pattern = `%${escapeLike(q)}%`;
  const rows = getDb()
    .prepare(
      `SELECT id, role, content, created_at FROM steward_messages
       WHERE content LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(pattern, limit) as Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    role: row.role as AgentMessageRole,
    snippet: chatSearchSnippet(row.content, q),
    createdAt: row.created_at,
  }));
}

/**
 * Messages from `throughId` (inclusive) through newest, oldest→newest.
 * Used to jump from search into a historical bubble.
 */
export function listStewardMessagesThrough(
  throughId: string,
): { messages: StewardMessage[]; hasMore: boolean } | null {
  const target = getDb()
    .prepare(`SELECT id, created_at FROM steward_messages WHERE id = ?`)
    .get(throughId) as { id: string; created_at: string } | undefined;
  if (!target) return null;

  const rows = getDb()
    .prepare(
      `SELECT * FROM steward_messages
       WHERE (
         created_at > ?
         OR (created_at = ? AND id >= ?)
       )
       ORDER BY created_at ASC, id ASC`,
    )
    .all(target.created_at, target.created_at, target.id) as StewardMessageRow[];

  const older = getDb()
    .prepare(
      `SELECT 1 AS ok FROM steward_messages
       WHERE (
         created_at < ?
         OR (created_at = ? AND id < ?)
       )
       LIMIT 1`,
    )
    .get(target.created_at, target.created_at, target.id) as
    | { ok: number }
    | undefined;

  return {
    messages: rows.map(mapStewardMessage),
    hasMore: Boolean(older),
  };
}

export function createStewardMessage(input: {
  role: AgentMessageRole;
  content: string;
}): StewardMessage {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO steward_messages (id, role, content, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, input.role, input.content, now);

  return mapStewardMessage(
    getDb()
      .prepare("SELECT * FROM steward_messages WHERE id = ?")
      .get(id) as StewardMessageRow,
  );
}

export function getStewardMessage(id: string): StewardMessage | null {
  const row = getDb()
    .prepare("SELECT * FROM steward_messages WHERE id = ?")
    .get(id) as StewardMessageRow | undefined;
  return row ? mapStewardMessage(row) : null;
}

/**
 * Delete from a cut point in the Steward conversation.
 * Resolve cut point by messageId, then userOrdinal, then keepCount.
 * When keepMessage is true, the cut message itself is kept and only later ones are deleted.
 */
export function rewindStewardMessages(input: {
  messageId?: string;
  keepCount: number;
  userOrdinal?: number;
  keepMessage?: boolean;
}): { kept: number; deleted: number; messages: StewardMessage[]; hasMore: boolean } {
  const all = listStewardMessages();
  let startIndex = -1;
  if (input.messageId) {
    const found = all.findIndex((m) => m.id === input.messageId);
    if (found >= 0) startIndex = found;
  }
  if (
    startIndex < 0 &&
    typeof input.userOrdinal === "number" &&
    input.userOrdinal >= 0
  ) {
    const users = all.filter((m) => m.role === "user");
    const target = users[input.userOrdinal];
    if (target) startIndex = all.findIndex((m) => m.id === target.id);
  }
  if (startIndex < 0) {
    startIndex = Math.max(0, Math.min(input.keepCount, all.length));
  }
  if (input.keepMessage && startIndex >= 0) {
    startIndex += 1;
  }

  const toDelete = all.slice(startIndex);
  if (toDelete.length > 0) {
    const del = getDb().prepare("DELETE FROM steward_messages WHERE id = ?");
    getDb().exec("BEGIN");
    try {
      for (const row of toDelete) del.run(row.id);
      getDb().exec("COMMIT");
    } catch (error) {
      getDb().exec("ROLLBACK");
      throw error;
    }
  }

  const page = listStewardMessagesPage({ limit: CHAT_HISTORY_PAGE_SIZE });
  return {
    kept: countStewardMessages(),
    deleted: toDelete.length,
    messages: page.messages,
    hasMore: page.hasMore,
  };
}

export function listRecentStewardMessagesForPrompt(): StewardMessage[] {
  return listStewardMessages({ limit: AGENT_PROMPT_MESSAGE_LIMIT });
}

/** Mirror the Codex conversation for existing history pages and cross-agent context. */
export function syncCodexMessages(scope: string, messages: Array<{id:string;role:string;parts:Array<{type:string;text?:string;id?:unknown;name?:unknown;command?:unknown;query?:unknown;sources?:unknown;hits?:unknown;pages?:unknown;url?:unknown;path?:unknown;mimeType?:unknown;description?:unknown;status?:unknown;phase?:unknown;callId?:unknown;error?:unknown;sessionId?:unknown;title?:unknown;reportUrl?:unknown}>}>) {
  const rows = messages.filter(m => m.role === "user" || m.role === "assistant").map(m => {
    let textLen = 0;
    const orderedSearches: InvokedSearch[] = [];
    for (const p of m.parts) {
      if (p.type === "text") {
        textLen += typeof p.text === "string" ? p.text.length : 0;
        continue;
      }
      if (p.type !== "search" || typeof p.id !== "string") continue;
      orderedSearches.push({
        id: p.id,
        query: typeof p.query === "string" ? p.query : "",
        sources: Array.isArray(p.sources)
          ? p.sources.filter((source): source is string => typeof source === "string")
          : [],
        hits: Array.isArray(p.hits) ? (p.hits as InvokedSearch["hits"]) : [],
        pages: Array.isArray(p.pages) ? (p.pages as InvokedSearch["pages"]) : [],
        at: textLen,
        ...(typeof p.status === "string" ? { status: p.status as InvokedSearch["status"] } : {}),
        ...(typeof p.phase === "string" ? { phase: p.phase as InvokedSearch["phase"] } : {}),
        ...(typeof p.callId === "string" ? { callId: p.callId } : {}),
        ...(typeof p.error === "string" && p.error ? { error: p.error } : {}),
      });
    }
    return {
    id: m.id,
    role: m.role,
    content: m.parts.filter(p=>p.type === "text").map(p=>p.text || "").join(""),
    skills: m.parts.filter((p): p is typeof p & InvokedSkill =>
      p.type === "skill" && typeof p.id === "string" && typeof p.name === "string" && typeof p.command === "string"
    ).map(p => ({
      id: p.id,
      name: p.name,
      command: p.command,
      ...(typeof p.description === "string" && p.description
        ? { description: p.description }
        : {}),
    })),
    rules: m.parts.filter((p): p is typeof p & InvokedRule =>
      p.type === "rule" && typeof p.id === "string" && typeof p.name === "string"
    ).map(p => ({
      id: p.id,
      name: p.name,
      ...(typeof p.description === "string" && p.description
        ? { description: p.description }
        : {}),
    })),
    searches: parseInvokedSearches(JSON.stringify(orderedSearches)),
    radars: m.parts.filter((p): p is typeof p & InvokedRadar => p.type === "radar" && typeof p.sessionId === "string" && p.sessionId.length > 0).map(p => ({
      sessionId: p.sessionId,
      title: typeof p.title === "string" ? p.title : "",
      url: typeof p.url === "string" ? p.url : "",
      reportUrl: typeof p.reportUrl === "string" ? p.reportUrl : "",
    })),
    images: m.parts.filter((p): p is typeof p & MessageImage => p.type === "image" && typeof p.id === "string" && typeof p.url === "string" && typeof p.path === "string" && typeof p.name === "string" && typeof p.mimeType === "string").map(p => ({ id: p.id, name: p.name, url: p.url, path: p.path, mimeType: p.mimeType })),
  };
  });
  const old = scope === "steward" ? listStewardMessages() : listAgentMessages(scope);
  if (old.length === rows.length && rows.every((m,i)=>m.id===old[i].id && m.content===old[i].content && JSON.stringify(m.skills)===JSON.stringify(old[i].skills) && JSON.stringify(m.rules)===JSON.stringify(old[i].rules) && JSON.stringify(m.searches)===JSON.stringify(old[i].searches) && JSON.stringify(m.radars)===JSON.stringify(old[i].radars) && JSON.stringify(m.images)===JSON.stringify(old[i].images))) return;
  const table = scope === "steward" ? "steward_messages" : "agent_messages";
  const db = getDb();
  db.transaction(()=>{
    const keep = new Set(rows.map(m=>m.id));
    const remove = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    for(const m of old) if(!keep.has(m.id)) remove.run(m.id);
    let time = old.length ? Date.parse(old[old.length-1].createdAt) : Date.now();
    const known = new Map(old.map(m=>[m.id,m.createdAt]));
    for(const m of rows) {
      const created = known.get(m.id) || new Date(time=Math.max(Date.now(),time+1)).toISOString();
      const skillsJson = JSON.stringify(m.skills);
      const rulesJson = JSON.stringify(m.rules);
      const searchesJson = JSON.stringify(m.searches);
      const radarsJson = JSON.stringify(m.radars);
      const imagesJson = JSON.stringify(m.images);
      if(scope === "steward") db.prepare("INSERT INTO steward_messages (id,role,content,skills_json,rules_json,searches_json,radars_json,images_json,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, skills_json=excluded.skills_json, rules_json=excluded.rules_json, searches_json=excluded.searches_json, radars_json=excluded.radars_json, images_json=excluded.images_json").run(m.id,m.role,m.content,skillsJson,rulesJson,searchesJson,radarsJson,imagesJson,created);
      else db.prepare("INSERT INTO agent_messages (id,project_id,role,content,skills_json,rules_json,searches_json,radars_json,images_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, skills_json=excluded.skills_json, rules_json=excluded.rules_json, searches_json=excluded.searches_json, radars_json=excluded.radars_json, images_json=excluded.images_json").run(m.id,scope,m.role,m.content,skillsJson,rulesJson,searchesJson,radarsJson,imagesJson,created);
    }
  })();
}
