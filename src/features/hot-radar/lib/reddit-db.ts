import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { RedditPost } from "@/features/hot-radar/lib/reddit";

const DB_PATH = path.join(process.cwd(), "data", "hot-radar.sqlite");

let database: Database.Database | null = null;

function db(): Database.Database {
  if (database) return database;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const opened = new Database(DB_PATH);
  opened.pragma("journal_mode = WAL");
  opened.exec(`
    CREATE TABLE IF NOT EXISTS reddit_syncs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      fetched_on TEXT NOT NULL,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS reddit_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_id INTEGER NOT NULL,
      fetched_on TEXT NOT NULL,
      subreddit TEXT NOT NULL,
      rank INTEGER NOT NULL,
      post_id TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      permalink TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      thumbnail TEXT,
      score INTEGER,
      comment_count INTEGER,
      flair TEXT,
      nsfw INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS reddit_posts_subreddit_day
      ON reddit_posts (subreddit, fetched_on, rank);
  `);
  database = opened;
  ensurePostTextColumns();
  return opened;
}

function ensurePostTextColumns() {
  const columns = db().prepare(`PRAGMA table_info(reddit_posts)`).all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("body")) db().exec(`ALTER TABLE reddit_posts ADD COLUMN body TEXT`);
  if (!names.has("extract_error")) db().exec(`ALTER TABLE reddit_posts ADD COLUMN extract_error TEXT`);
}

function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function recoverInterruptedSyncs() {
  db()
    .prepare(
      `UPDATE reddit_syncs
       SET status = 'error', finished_at = COALESCE(finished_at, ?), error = COALESCE(error, '进程中断')
       WHERE status = 'running'`,
    )
    .run(Date.now());
}

export function latestDoneAt(): number | null {
  const row = one<{ finished_at: number }>(
    `SELECT finished_at FROM reddit_syncs
     WHERE status = 'done' AND finished_at IS NOT NULL
     ORDER BY finished_at DESC LIMIT 1`,
  );
  return row?.finished_at ?? null;
}

export function latestSync(): { status: string; finished_at: number | null; error: string | null } | null {
  return (
    one<{ status: string; finished_at: number | null; error: string | null }>(
      `SELECT status, finished_at, error FROM reddit_syncs ORDER BY id DESC LIMIT 1`,
    ) ?? null
  );
}

export function postCount(): number {
  const row = one<{ n: number }>(`SELECT COUNT(*) AS n FROM reddit_posts`);
  return row?.n ?? 0;
}

export function hasPostsOn(fetchedOn: string, subreddit: string): boolean {
  const row = one<{ n: number }>(
    `SELECT 1 AS n FROM reddit_posts WHERE fetched_on = ? AND lower(subreddit) = lower(?) LIMIT 1`,
    fetchedOn,
    subreddit,
  );
  return Boolean(row);
}

export function deleteSubredditPostsOn(fetchedOn: string, subreddit: string) {
  db()
    .prepare(`DELETE FROM reddit_posts WHERE fetched_on = ? AND lower(subreddit) = lower(?)`)
    .run(fetchedOn, subreddit);
}

export function createSync(fetchedOn: string): number {
  const info = db()
    .prepare(
      `INSERT INTO reddit_syncs (started_at, trigger, status, fetched_on) VALUES (?, ?, 'running', ?)`,
    )
    .run(Date.now(), "auto", fetchedOn);
  return Number(info.lastInsertRowid);
}

export function finishSync(id: number, status: "done" | "error", error: string | null) {
  db()
    .prepare(`UPDATE reddit_syncs SET status = ?, finished_at = ?, error = ? WHERE id = ?`)
    .run(status, Date.now(), error, id);
}

export function insertPosts(syncId: number, fetchedOn: string, subreddit: string, posts: RedditPost[]) {
  const insert = db().prepare(
    `INSERT INTO reddit_posts (
      sync_id, fetched_on, subreddit, rank, post_id, title, author, permalink, url,
      created_at, thumbnail, score, comment_count, flair, nsfw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const connection = db();
  connection.exec("BEGIN");
  try {
    posts.forEach((post, index) => {
      insert.run(
        syncId,
        fetchedOn,
        subreddit,
        index + 1,
        post.id,
        post.title,
        post.author,
        post.permalink,
        post.url,
        post.createdAt,
        post.thumbnail,
        post.score,
        post.comments,
        post.flair,
        post.nsfw ? 1 : 0,
      );
    });
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

type PostRow = {
  post_id: string;
  title: string;
  author: string;
  subreddit: string;
  permalink: string;
  url: string;
  created_at: number;
  thumbnail: string | null;
  score: number | null;
  comment_count: number | null;
  flair: string | null;
  nsfw: number;
  body: string | null;
  extract_error: string | null;
};

export type ListedRedditPost = RedditPost & {
  body: string | null;
  extractError: string | null;
};

export function latestFetchedOn(): string | null {
  const row = one<{ day: string | null }>(`SELECT MAX(fetched_on) AS day FROM reddit_posts`);
  return row?.day ?? null;
}

export function postTextStats(fetchedOn: string): { total: number; done: number } {
  const row = one<{ total: number; done: number | null }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN body IS NOT NULL OR extract_error IS NOT NULL THEN 1 ELSE 0 END) AS done
     FROM reddit_posts WHERE fetched_on = ?`,
    fetchedOn,
  );
  return { total: row?.total ?? 0, done: Number(row?.done ?? 0) };
}

export type StoredPostText = {
  id: number;
  title: string;
  url: string;
  permalink: string;
};

export function postsNeedingText(fetchedOn: string): StoredPostText[] {
  return db()
    .prepare(
      `SELECT id, title, url, permalink FROM reddit_posts
       WHERE fetched_on = ? AND body IS NULL AND extract_error IS NULL
       ORDER BY id ASC`,
    )
    .all(fetchedOn) as unknown as StoredPostText[];
}

export function savePostText(id: number, body: string) {
  db().prepare(`UPDATE reddit_posts SET body = ?, extract_error = NULL WHERE id = ?`).run(body, id);
}

export function savePostTextError(id: number, error: string) {
  db().prepare(`UPDATE reddit_posts SET extract_error = ? WHERE id = ? AND body IS NULL`).run(error, id);
}

export function postsForSubreddit(subreddit: string): ListedRedditPost[] {
  const rows = db()
    .prepare(
      `SELECT post_id, title, author, subreddit, permalink, url, created_at, thumbnail, score, comment_count, flair, nsfw, body, extract_error
       FROM reddit_posts
       WHERE lower(subreddit) = lower(?)
         AND fetched_on = (
           SELECT MAX(fetched_on) FROM reddit_posts WHERE lower(subreddit) = lower(?)
         )
       ORDER BY rank ASC`,
    )
    .all(subreddit, subreddit) as unknown as PostRow[];
  return mapPostRows(rows);
}

export type HistoryDay = {
  fetchedOn: string;
  postCount: number;
  subredditCount: number;
};

export function listHistoryDays(): HistoryDay[] {
  const rows = db()
    .prepare(
      `SELECT fetched_on, COUNT(*) AS post_count,
              COUNT(DISTINCT lower(subreddit)) AS subreddit_count
       FROM reddit_posts
       GROUP BY fetched_on
       ORDER BY fetched_on DESC`,
    )
    .all() as Array<{
    fetched_on: string;
    post_count: number;
    subreddit_count: number;
  }>;
  return rows.map((row) => ({
    fetchedOn: row.fetched_on,
    postCount: row.post_count,
    subredditCount: row.subreddit_count,
  }));
}

export function postsForSubredditAt(
  subreddit: string,
  fetchedOn: string,
): ListedRedditPost[] {
  const rows = db()
    .prepare(
      `SELECT post_id, title, author, subreddit, permalink, url, created_at,
              thumbnail, score, comment_count, flair, nsfw, body, extract_error
       FROM reddit_posts
       WHERE lower(subreddit) = lower(?) AND fetched_on = ?
       ORDER BY rank ASC`,
    )
    .all(subreddit, fetchedOn) as unknown as PostRow[];
  return mapPostRows(rows);
}

function mapPostRows(rows: PostRow[]): ListedRedditPost[] {
  return rows.map((row) => ({
    id: row.post_id,
    title: row.title,
    author: row.author,
    subreddit: row.subreddit,
    permalink: row.permalink,
    url: row.url,
    createdAt: row.created_at,
    thumbnail: row.thumbnail,
    score: row.score,
    comments: row.comment_count,
    flair: row.flair,
    nsfw: row.nsfw === 1,
    body: row.body,
    extractError: row.extract_error,
  }));
}
