"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HistorySidebar } from "@/features/hot-radar/components/history-sidebar";
import type { HistoryDay } from "@/features/hot-radar/lib/reddit-db";
import type { RedditSyncSnapshot } from "@/features/hot-radar/lib/reddit-sync-types";

function formatUpdated(at: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function idleStatus(updatedAt: number): string {
  const nextAt = updatedAt + REFRESH_AFTER_MS;
  const updated = `更新于 ${formatUpdated(updatedAt)}`;
  if (nextAt <= Date.now()) return `${updated}，预计很快自动刷新`;
  return `${updated}，预计 ${formatUpdated(nextAt)} 自动刷新`;
}

function statusText(snapshot: RedditSyncSnapshot): string {
  if (snapshot.running) {
    const progress = snapshot.total > 0 ? `${snapshot.index}/${snapshot.total}` : "";
    const wait =
      snapshot.waitSeconds != null && snapshot.waitSeconds > 0
        ? `限流等待 ${snapshot.waitSeconds} 秒`
        : "";
    const subject =
      snapshot.phase === "texts"
        ? snapshot.current
          ? snapshot.current.slice(0, 24)
          : "准备中"
        : snapshot.current
          ? `r/${snapshot.current}`
          : "准备中";
    const action = snapshot.phase === "texts" ? "正在提取正文" : "正在拉取";
    return [action, progress, subject, wait].filter(Boolean).join(" · ");
  }
  if (snapshot.lastFinishedAt) return idleStatus(snapshot.lastFinishedAt);
  return "尚未更新";
}

export function RedditToolbar({
  initial,
  subreddit,
  historyDays,
  historyDate,
  historyOpen,
}: {
  initial: RedditSyncSnapshot;
  subreddit: string;
  historyDays: HistoryDay[];
  historyDate?: string;
  historyOpen?: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);

  useEffect(() => {
    let stopped = false;
    let seenPosts = initial.postCount;
    let seenUpdated = initial.lastFinishedAt;
    let seenIndex = initial.index;

    async function poll() {
      try {
        const response = await fetch("/api/hot-radar/reddit/sync");
        if (!response.ok || stopped) return;
        const next = (await response.json()) as RedditSyncSnapshot;
        if (stopped) return;
        setSnapshot(next);
        const textsAdvanced = next.phase === "texts" && next.index !== seenIndex;
        if (next.postCount !== seenPosts || next.lastFinishedAt !== seenUpdated || textsAdvanced) {
          seenPosts = next.postCount;
          seenUpdated = next.lastFinishedAt;
          seenIndex = next.index;
          router.refresh();
        }
      } catch {
        // 下一轮再试。
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [initial.index, initial.lastFinishedAt, initial.postCount, router]);

  const percent =
    snapshot.running && snapshot.total > 0
      ? Math.min(100, Math.round((snapshot.index / snapshot.total) * 100))
      : 0;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">热点追踪</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            r/{subreddit} · {historyDate ? `${historyDate} 历史周榜` : "本周最热"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{statusText(snapshot)}</p>
          <HistorySidebar
            days={historyDays}
            subreddit={subreddit}
            selectedDate={historyDate}
            initialOpen={historyOpen}
          />
        </div>
      </div>
      {snapshot.running ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={snapshot.total}
          aria-valuenow={snapshot.index}
          aria-label={snapshot.phase === "texts" ? "正文提取进度" : "榜单拉取进度"}
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </header>
  );
}
