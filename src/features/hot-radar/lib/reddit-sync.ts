import "server-only";
import { extractPageContent } from "@/features/hot-radar/lib/extract-page";
import { fetchWeekListing } from "@/features/hot-radar/lib/reddit";
import {
  createSync,
  deleteSubredditPostsOn,
  finishSync,
  hasPostsOn,
  insertPosts,
  latestDoneAt,
  latestFetchedOn,
  latestSync,
  postCount,
  postTextStats,
  postsNeedingText,
  recoverInterruptedSyncs,
  savePostText,
  savePostTextError,
  shanghaiDate,
  type StoredPostText,
} from "@/features/hot-radar/lib/reddit-db";
import type { RedditSyncSnapshot } from "@/features/hot-radar/lib/reddit-sync-types";
import { allSubredditNames } from "@/features/hot-radar/lib/subreddits";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ERROR_COOLDOWN_MS = 15 * 60 * 1000;

type LiveSync = {
  booted: boolean;
  running: boolean;
  timer?: ReturnType<typeof setInterval>;
  phase: "boards" | "texts";
  current: string | null;
  index: number;
  total: number;
  waitUntil: number | null;
};

function slot(): LiveSync {
  const globalSlot = globalThis as { __hotRadarReddit?: LiveSync };
  if (!globalSlot.__hotRadarReddit) {
    globalSlot.__hotRadarReddit = {
      booted: false,
      running: false,
      phase: "boards",
      current: null,
      index: 0,
      total: 0,
      waitUntil: null,
    };
  }
  return globalSlot.__hotRadarReddit;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(ms: number): Promise<void> {
  const current = slot();
  const end = Date.now() + ms;
  current.waitUntil = end;
  while (Date.now() < end) {
    await sleep(Math.min(1000, end - Date.now()));
  }
  current.waitUntil = null;
}

async function pullSubreddit(name: string) {
  let failures = 0;
  while (true) {
    const listing = await fetchWeekListing(name);
    if (listing.ok) return { kind: "posts" as const, posts: listing.posts };
    if (listing.rateLimited) {
      await waitFor((listing.retryAfterSec + 2) * 1000);
      continue;
    }
    failures += 1;
    if (failures >= 3) return { kind: "failed" as const, error: listing.error };
    await waitFor(15_000);
  }
}

function dueForAuto(): boolean {
  const lastDone = latestDoneAt();
  if (lastDone != null && Date.now() - lastDone < WEEK_MS) return false;
  const recent = latestSync();
  if (
    recent?.status === "error" &&
    recent.error !== "进程中断" &&
    recent.finished_at != null &&
    Date.now() - recent.finished_at < ERROR_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

function showBoard(names: string[], name: string, fetchedOn: string) {
  const current = slot();
  const stats = postTextStats(fetchedOn);
  current.phase = "boards";
  current.current = name;
  current.index = names.indexOf(name) + 1;
  current.total = names.length + stats.total;
}

async function pullBoards(
  names: string[],
  pending: string[],
  fetchedOn: string,
  syncId: number,
  failed: string[],
): Promise<void> {
  for (let i = 0; i < pending.length; i++) {
    const name = pending[i];
    showBoard(names, name, fetchedOn);
    const result = await pullSubreddit(name);
    if (result.kind === "failed") {
      failed.push(`${name}（${result.error}）`);
      continue;
    }
    deleteSubredditPostsOn(fetchedOn, name);
    insertPosts(syncId, fetchedOn, name, result.posts);
  }
}

async function pullOneText(post: StoredPostText) {
  let failures = 0;
  while (true) {
    const extracted = await extractPageContent(post.url, post.permalink);
    if (extracted.ok) return { kind: "text" as const, text: extracted.text };
    if (extracted.rateLimited) {
      await waitFor((extracted.retryAfterSec + 2) * 1000);
      continue;
    }
    failures += 1;
    if (failures >= 3) return { kind: "failed" as const, error: extracted.error };
    await waitFor(15_000);
  }
}

async function pullTexts(boardCount: number, fetchedOn: string): Promise<void> {
  const posts = postsNeedingText(fetchedOn);
  const seen = new Map<string, { text: string } | { error: string }>();
  for (const post of posts) {
    const stats = postTextStats(fetchedOn);
    const current = slot();
    current.phase = "texts";
    current.current = post.title;
    current.index = boardCount + stats.done + 1;
    current.total = boardCount + stats.total;
    const key = `${post.permalink}\n${post.url}`;
    const cached = seen.get(key);
    if (cached) {
      if ("text" in cached) savePostText(post.id, cached.text);
      else savePostTextError(post.id, cached.error);
      continue;
    }
    const result = await pullOneText(post);
    if (result.kind === "text") {
      savePostText(post.id, result.text);
      seen.set(key, { text: result.text });
    } else {
      savePostTextError(post.id, result.error);
      seen.set(key, { error: result.error });
    }
  }
}

async function run(trigger: "auto" | "backfill") {
  const names = allSubredditNames();
  let syncId: number | null = null;

  try {
    const current = slot();
    const fetchedOn = trigger === "backfill" ? (latestFetchedOn() ?? shanghaiDate()) : shanghaiDate();
    syncId = createSync(fetchedOn);

    current.current = null;
    current.waitUntil = null;

    const failed: string[] = [];
    const pending = names.filter((name) => !hasPostsOn(fetchedOn, name));
    if (pending.length > 0) {
      current.phase = "boards";
      current.index = names.filter((name) => hasPostsOn(fetchedOn, name)).length;
      current.total = names.length + postTextStats(fetchedOn).total;
    }
    await pullBoards(names, pending, fetchedOn, syncId, failed);
    await pullTexts(names.length, fetchedOn);

    finishSync(syncId, failed.length ? "error" : "done", failed.length ? `未拉下：${failed.join("、")}` : null);
  } catch (error) {
    if (syncId != null) {
      const message = error instanceof Error ? error.message : "拉取失败";
      finishSync(syncId, "error", message);
    }
    throw error;
  }
}

function needsTextBackfill(): boolean {
  const day = latestFetchedOn();
  if (!day) return false;
  return postTextStats(day).done < postTextStats(day).total;
}

function begin(trigger: "auto" | "backfill"): boolean {
  const current = slot();
  if (current.running) return false;
  current.running = true;
  current.current = null;
  current.waitUntil = null;
  void run(trigger)
    .catch((error) => {
      console.error("Reddit 榜单拉取失败", error);
    })
    .finally(() => {
      current.running = false;
      current.phase = "boards";
      current.current = null;
      current.waitUntil = null;
    });
  return true;
}

async function tick() {
  if (slot().running) return;
  if (dueForAuto()) {
    begin("auto");
    return;
  }
  if (needsTextBackfill()) begin("backfill");
}

export function startRedditMonitor() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const current = slot();
  if (current.booted) return;
  current.booted = true;
  recoverInterruptedSyncs();
  void tick();
  current.timer = setInterval(() => {
    void tick();
  }, 60_000);
  current.timer.unref?.();
}

export function syncSnapshot(): RedditSyncSnapshot {
  const current = slot();
  const waitSeconds =
    current.waitUntil == null ? null : Math.max(0, Math.ceil((current.waitUntil - Date.now()) / 1000));
  return {
    running: current.running,
    phase: current.phase ?? "boards",
    current: current.current,
    index: current.index,
    total: current.total,
    waitSeconds,
    lastFinishedAt: latestDoneAt(),
    postCount: postCount(),
  };
}
