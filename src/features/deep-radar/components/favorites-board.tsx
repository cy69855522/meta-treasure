"use client";

import Link from "next/link";
import { FileText, Star } from "lucide-react";

export type FavoriteCard = {
  sessionId: string;
  title: string;
  snippet: string;
  favoritedAt: string | null;
  updatedAt: string;
  reportUrl: string;
  keywords?: string[];
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function FavoritesBoard({ favorites }: { favorites: FavoriteCard[] }) {
  if (favorites.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-11 shrink-0 items-center border-b border-border px-4 md:px-6">
          <h1 className="text-lg font-semibold tracking-tight">收藏夹</h1>
        </header>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="max-w-sm rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <Star className="mx-auto mb-3 size-8 text-muted-foreground/70" />
            <p className="text-sm font-medium">还没有收藏的研究报告</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              在研究报告气泡标题栏点星标即可收藏，之后会显示在这里。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
        <h1 className="text-lg font-semibold tracking-tight">收藏夹</h1>
        <p className="text-xs text-muted-foreground">{favorites.length} 篇</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto grid w-full max-w-5xl gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((item) => (
            <Link
              key={item.sessionId}
              href={item.reportUrl}
              className="group flex min-h-[9.5rem] flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:border-amber-300/80 hover:bg-amber-50/40 dark:hover:border-amber-500/40 dark:hover:bg-amber-950/20"
            >
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 ring-1 ring-amber-300/60 dark:text-amber-300 dark:ring-amber-500/40">
                  <FileText className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold tracking-tight group-hover:text-amber-900 dark:group-hover:text-amber-100">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    收藏于 {formatWhen(item.favoritedAt) || formatWhen(item.updatedAt)}
                  </p>
                </div>
                <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
              </div>
              <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
                {item.snippet || "（无摘要）"}
              </p>
              {item.keywords?.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {item.keywords.slice(0, 4).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
