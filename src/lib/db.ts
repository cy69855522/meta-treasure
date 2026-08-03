import "server-only";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import type { Lane, Project, Task } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "progress.db");

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sort_order: number;
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

declare global {
  // eslint-disable-next-line no-var
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
  `);

  const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("started_at")) {
    db.exec("ALTER TABLE tasks ADD COLUMN started_at TEXT");
  }
  if (!names.has("completed_at")) {
    db.exec("ALTER TABLE tasks ADD COLUMN completed_at TEXT");
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
      },
      {
        id: randomUUID(),
        name: "AI 漫剧",
        slug: "ai-comics",
        description: "副业：AI 漫剧创作管线",
        color: "#FF9900",
        sortOrder: 1,
      },
      {
        id: randomUUID(),
        name: "AI 选品带货",
        slug: "ai-products",
        description: "副业：AI 选品与带货实验",
        color: "#CC3399",
        sortOrder: 2,
      },
    ];

  const insert = db.prepare(`
    INSERT INTO projects (id, name, slug, description, color, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM projects ORDER BY sort_order ASC, created_at ASC",
    )
    .all() as ProjectRow[];
  return rows.map(mapProject);
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
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM projects")
    .get() as { m: number };
  const slug = uniqueSlug(input.slug?.trim() || slugify(input.name));

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, slug, description, color, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

export function reorderProjects(orderedIds: string[]) {
  const stmt = getDb().prepare(
    `UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?`,
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
