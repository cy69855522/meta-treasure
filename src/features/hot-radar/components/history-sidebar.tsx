"use client";

import Link from "next/link";
import { CalendarDays, History, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { HistoryDay } from "@/features/hot-radar/lib/reddit-db";
import { cn } from "@/lib/utils";

function historyHref(subreddit: string, date?: string) {
  const params = new URLSearchParams({ subreddit, history: "1" });
  if (date) params.set("date", date);
  return `/hot-radar/reddit/hot?${params.toString()}`;
}

export function HistorySidebar({
  days,
  subreddit,
  selectedDate,
  initialOpen,
}: {
  days: HistoryDay[];
  subreddit: string;
  selectedDate?: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(initialOpen));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-muted"
      >
        <History className="size-3.5" />
        历史
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120]">
          <button
            type="button"
            aria-label="关闭历史记录"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="hot-radar-history-title"
            className="absolute inset-y-0 right-0 flex w-[min(24rem,92vw)] flex-col border-l bg-background shadow-2xl"
          >
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
              <div>
                <h2 id="hot-radar-history-title" className="text-sm font-semibold">
                  历史榜单
                </h2>
                <p className="text-xs text-muted-foreground">系统自动保存的每周记录</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭历史记录"
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </header>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="历史日期">
              <Link
                href={historyHref(subreddit)}
                className={cn(
                  "mb-2 flex items-center justify-between rounded-lg border px-3 py-3 text-sm hover:bg-muted",
                  !selectedDate && "border-foreground bg-foreground text-background hover:bg-foreground/90",
                )}
              >
                <span className="font-medium">当前榜单</span>
                <span className="text-xs opacity-70">本周</span>
              </Link>

              {days.length ? (
                <div className="space-y-2">
                  {days.map((day) => (
                    <Link
                      key={day.fetchedOn}
                      href={historyHref(subreddit, day.fetchedOn)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-3 text-sm hover:bg-muted",
                        day.fetchedOn === selectedDate &&
                          "border-foreground bg-foreground text-background hover:bg-foreground/90",
                      )}
                    >
                      <CalendarDays className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{day.fetchedOn}</span>
                        <span className="block text-xs opacity-70">
                          {day.subredditCount} 个社区
                        </span>
                      </span>
                      <span className="text-xs tabular-nums opacity-70">{day.postCount} 条</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  还没有历史记录
                </p>
              )}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
