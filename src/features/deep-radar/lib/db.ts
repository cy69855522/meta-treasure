import "server-only";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseMessageImages } from "@/features/deep-radar/lib/research-images";
import {
  createInitialState,
  type ChatMessage,
  type NewMessage,
  type ResearchSession,
  type ResearchState,
  type SessionSummary,
} from "@/features/deep-radar/lib/research-types";
import {
  cutIndex,
  restoreAfterCut,
  type CheckpointedMessage,
} from "@/features/deep-radar/lib/research-rewind";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "deep-radar.db");

type SessionRow = {
  id: string;
  title: string;
  phase: string;
  state_json: string;
  created_at: string;
  updated_at: string;
  favorited_at?: string | null;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: string;
  kind: string;
  content: string;
  payload_json: string | null;
  created_at: string;
  state_json?: string | null;
  images_json?: string | null;
};

declare global {
  var __deepRadarDb: Database.Database | undefined;
}

function db(): Database.Database {
  if (!global.__deepRadarDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const instance = new Database(DB_PATH);
    instance.pragma("journal_mode = WAL");
    global.__deepRadarDb = instance;
  }
  migrate(global.__deepRadarDb);
  return global.__deepRadarDb;
}

function migrate(instance: Database.Database) {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      phase TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS messages_session_created
      ON messages(session_id, created_at);
  `);
  const messageCols = instance.prepare(`PRAGMA table_info(messages)`).all() as Array<{
    name: string;
  }>;
  if (!messageCols.some((col) => col.name === "state_json")) {
    instance.exec(`ALTER TABLE messages ADD COLUMN state_json TEXT`);
  }
  if (!messageCols.some((col) => col.name === "images_json")) {
    instance.exec(`ALTER TABLE messages ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'`);
  }
  const sessionCols = instance.prepare(`PRAGMA table_info(sessions)`).all() as Array<{
    name: string;
  }>;
  if (!sessionCols.some((col) => col.name === "progress_auto")) {
    instance.exec(
      `ALTER TABLE sessions ADD COLUMN progress_auto INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!sessionCols.some((col) => col.name === "favorited_at")) {
    instance.exec(`ALTER TABLE sessions ADD COLUMN favorited_at TEXT`);
  }
}

function parseState(raw: string): ResearchState {
  return { ...createInitialState(), ...(JSON.parse(raw) as ResearchState) };
}

function mapSession(row: SessionRow): ResearchSession {
  return {
    id: row.id,
    title: row.title,
    state: parseState(row.state_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favoritedAt: row.favorited_at ?? null,
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  const images = parseMessageImages(row.images_json);
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatMessage["role"],
    kind: row.kind as ChatMessage["kind"],
    content: row.content,
    payload: row.payload_json ? JSON.parse(row.payload_json) : undefined,
    createdAt: row.created_at,
    images: images.length ? images : undefined,
  };
}

export function createSession(title = "新研究"): ResearchSession {
  const now = new Date().toISOString();
  const id = randomUUID();
  const state = createInitialState();
  db()
    .prepare(
      `INSERT INTO sessions (id, title, phase, state_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, title, state.phase, JSON.stringify(state), now, now);
  return { id, title, state, createdAt: now, updatedAt: now };
}

export function listSessions(): SessionSummary[] {
  const rows = db()
    .prepare(
      `SELECT id, title, phase, created_at, updated_at, favorited_at
       FROM sessions ORDER BY updated_at DESC`,
    )
    .all() as Omit<SessionRow, "state_json">[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    phase: row.phase as SessionSummary["phase"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favoritedAt: row.favorited_at ?? null,
  }));
}

/** Favorited sessions that already have a report, newest favorite first. */
export function listFavoriteSessions(): SessionSummary[] {
  const rows = db()
    .prepare(
      `SELECT id, title, phase, created_at, updated_at, favorited_at, state_json
       FROM sessions
       WHERE favorited_at IS NOT NULL
       ORDER BY favorited_at DESC`,
    )
    .all() as SessionRow[];
  return rows
    .filter((row) => {
      const report = parseState(row.state_json).report;
      if (!report) return false;
      if (report.markdown?.trim()) return true;
      if (report.judgment?.trim() || report.actionPath?.trim()) return true;
      return Boolean(report.conclusions?.length);
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      phase: row.phase as SessionSummary["phase"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      favoritedAt: row.favorited_at ?? null,
    }));
}

export function getSession(id: string): ResearchSession | null {
  const row = db()
    .prepare(`SELECT * FROM sessions WHERE id = ?`)
    .get(id) as SessionRow | undefined;
  return row ? mapSession(row) : null;
}

export function saveSession(
  id: string,
  state: ResearchState,
  title?: string,
): void {
  const now = new Date().toISOString();
  const current = getSession(id);
  if (!current) throw new Error("研究会话不存在");
  const nextTitle =
    title ??
    (current.title === "新研究" && state.outline?.goal
      ? state.outline.goal.slice(0, 40)
      : current.title);
  db()
    .prepare(
      `UPDATE sessions SET title = ?, phase = ?, state_json = ?, updated_at = ? WHERE id = ?`,
    )
    .run(nextTitle, state.phase, JSON.stringify(state), now, id);
}

export function deleteSession(id: string): boolean {
  const instance = db();
  const tx = instance.transaction(() => {
    instance.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id);
    return instance.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  });
  return tx().changes > 0;
}

export function setProgressAuto(id: string, enabled: boolean): void {
  db()
    .prepare(`UPDATE sessions SET progress_auto = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, id);
}

export function isProgressAuto(id: string): boolean {
  const row = db()
    .prepare(`SELECT progress_auto FROM sessions WHERE id = ?`)
    .get(id) as { progress_auto?: number } | undefined;
  return row?.progress_auto === 1;
}

export function setFavorited(id: string, favorited: boolean): void {
  if (!getSession(id)) throw new Error("研究会话不存在");
  const favoritedAt = favorited ? new Date().toISOString() : null;
  db()
    .prepare(`UPDATE sessions SET favorited_at = ? WHERE id = ?`)
    .run(favoritedAt, id);
}

export function isFavorited(id: string): boolean {
  const row = db()
    .prepare(`SELECT favorited_at FROM sessions WHERE id = ?`)
    .get(id) as { favorited_at?: string | null } | undefined;
  return Boolean(row?.favorited_at);
}

export function listMessages(sessionId: string): ChatMessage[] {
  const rows = db()
    .prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(sessionId) as MessageRow[];
  return rows.map(mapMessage);
}

export function appendMessages(
  sessionId: string,
  messages: NewMessage[],
  state?: ResearchState,
): ChatMessage[] {
  if (messages.length === 0) return [];
  const insert = db().prepare(
    `INSERT INTO messages (id, session_id, role, kind, content, payload_json, created_at, state_json, images_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const saved: ChatMessage[] = [];
  const checkpoint = state ? JSON.stringify(state) : null;
  const tx = db().transaction(() => {
    for (const message of messages) {
      const createdAt = new Date().toISOString();
      const id = randomUUID();
      insert.run(
        id,
        sessionId,
        message.role,
        message.kind,
        message.content,
        message.payload === undefined ? null : JSON.stringify(message.payload),
        createdAt,
        checkpoint,
        JSON.stringify(message.images ?? []),
      );
      saved.push({
        ...message,
        id,
        sessionId,
        createdAt,
      });
    }
  });
  tx();
  return saved;
}

function parseCheckpoint(raw: string | null | undefined): ResearchState | null {
  if (!raw) return null;
  try {
    return parseState(raw);
  } catch {
    return null;
  }
}

export function rewindSession(
  id: string,
  messageId: string,
  keepMessage: boolean,
  resume = keepMessage,
): boolean {
  const session = getSession(id);
  if (!session) return false;
  const rows = db()
    .prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(id) as MessageRow[];
  const checkpointed: CheckpointedMessage[] = rows.map((row) => ({
    ...mapMessage(row),
    checkpoint: parseCheckpoint(row.state_json),
  }));
  const cut = cutIndex(checkpointed, messageId, keepMessage);
  const restored = restoreAfterCut(checkpointed.slice(0, cut), resume);
  const instance = db();
  const tx = instance.transaction(() => {
    if (cut < rows.length) {
      instance
        .prepare(
          `DELETE FROM messages WHERE session_id = ? AND id IN (${rows
            .slice(cut)
            .map(() => "?")
            .join(",")})`,
        )
        .run(id, ...rows.slice(cut).map((row) => row.id));
    }
    const title =
      restored.phase === "idle"
        ? "新研究"
        : restored.outline?.goal?.slice(0, 40) || session.title;
    instance
      .prepare(
        `UPDATE sessions SET title = ?, phase = ?, state_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(title, restored.phase, JSON.stringify(restored), new Date().toISOString(), id);
  });
  tx();
  return true;
}

export function getSessionBundle(id: string) {
  const session = getSession(id);
  if (!session) return null;
  return { session, messages: listMessages(id) };
}
