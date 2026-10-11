"use client";

import Link from "next/link";
import { useState } from "react";
import { SUBREDDIT_GROUPS, type SubredditGroup } from "@/features/hot-radar/lib/subreddits";
import { cn } from "@/lib/utils";

function hotHref(subreddit: string, historyDate?: string) {
  if (historyDate) {
    return `/hot-radar/reddit/hot?date=${encodeURIComponent(historyDate)}&subreddit=${encodeURIComponent(subreddit)}&history=1`;
  }
  return `/hot-radar/reddit/hot?subreddit=${encodeURIComponent(subreddit)}`;
}

function groupFor(subreddit: string): SubredditGroup {
  const match = SUBREDDIT_GROUPS.find((group) =>
    group.clusters.some((cluster) =>
      cluster.names.some((name) => name.toLowerCase() === subreddit.toLowerCase()),
    ),
  );
  return match ?? SUBREDDIT_GROUPS[0];
}

export function SubredditBoard({
  subreddit,
  historyDate,
}: {
  subreddit: string;
  historyDate?: string;
}) {
  const [picked, setPicked] = useState<{ title: string; forSubreddit: string } | null>(null);
  const active =
    picked && picked.forSubreddit === subreddit
      ? (SUBREDDIT_GROUPS.find((group) => group.title === picked.title) ?? groupFor(subreddit))
      : groupFor(subreddit);

  return (
    <section className="rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap gap-1.5">
        {SUBREDDIT_GROUPS.map((group) => {
          const selected = group.title === active.title;
          return (
            <button
              key={group.title}
              type="button"
              onClick={() => setPicked({ title: group.title, forSubreddit: subreddit })}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm",
                selected
                  ? "bg-foreground font-medium text-background"
                  : "border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {group.title}
            </button>
          );
        })}
      </div>
      {active.note ? <p className="mt-3 text-xs text-muted-foreground">{active.note}</p> : null}
      <div className="mt-3 flex flex-col gap-3">
        {active.clusters.map((cluster) => (
          <div key={cluster.names.join(",")}>
            <div className="flex flex-wrap gap-1.5">
              {cluster.names.map((name) => {
                const current = name.toLowerCase() === subreddit.toLowerCase();
                return (
                  <Link
                    key={name}
                    href={hotHref(name, historyDate)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
                      current
                        ? "border-foreground bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    r/{name}
                  </Link>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{cluster.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
