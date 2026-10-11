"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ChatMessageSearchHit } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  searchUrl: string;
  onJumpToMessage: (messageId: string) => Promise<void> | void;
  className?: string;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function ChatHistorySearch({
  searchUrl,
  onJumpToMessage,
  className,
}: Props) {
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChatMessageSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [jumpingId, setJumpingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearched(false);
      setError(null);
      setSearching(false);
      return;
    }

    let alive = true;
    setSearching(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL(searchUrl, window.location.origin);
        url.searchParams.set("q", q);
        const res = await fetch(url.pathname + url.search, { cache: "no-store" });
        const data = (await res.json()) as {
          hits?: ChatMessageSearchHit[];
          error?: string;
        };
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || "搜索失败");
        setHits(data.hits ?? []);
        setSearched(true);
      } catch (cause) {
        if (!alive) return;
        setHits([]);
        setSearched(true);
        setError(cause instanceof Error ? cause.message : "搜索失败");
      } finally {
        if (alive) setSearching(false);
      }
    }, 220);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, query, searchUrl]);

  async function jump(hit: ChatMessageSearchHit) {
    setJumpingId(hit.id);
    setError(null);
    try {
      await onJumpToMessage(hit.id);
      setOpen(false);
      setQuery("");
      setHits([]);
      setSearched(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "定位失败");
    } finally {
      setJumpingId(null);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        aria-label="搜索历史对话"
        title="搜索历史对话"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Search className="size-3.5" />
        搜索
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="关闭搜索"
            className="fixed inset-0 z-[60] cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-label="搜索历史对话"
            className="absolute right-0 top-full z-[61] mt-1.5 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入关键词搜索历史对话…"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {query ? (
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label="清空"
                  onClick={() => setQuery("")}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="max-h-72 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  搜索中…
                </div>
              ) : error ? (
                <p className="px-3 py-4 text-xs text-destructive">{error}</p>
              ) : !query.trim() ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  输入关键词，匹配当前 Agent 的全部历史消息。
                </p>
              ) : searched && hits.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  没有找到包含「{query.trim()}」的消息。
                </p>
              ) : (
                <ul className="divide-y">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        disabled={jumpingId === hit.id}
                        onClick={() => void jump(hit)}
                        className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:opacity-60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {hit.role === "user" ? "你" : "顾问"}
                            {jumpingId === hit.id ? " · 定位中…" : ""}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatWhen(hit.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-3 text-xs leading-relaxed text-foreground">
                          {hit.snippet}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Scroll to a chat bubble and briefly highlight it. */
export async function scrollChatMessageIntoView(messageId: string) {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) throw new Error("未找到该消息，可能已被撤回");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-amber-400/80", "ring-offset-2", "ring-offset-background");
  window.setTimeout(() => {
    el.classList.remove(
      "ring-2",
      "ring-amber-400/80",
      "ring-offset-2",
      "ring-offset-background",
    );
  }, 1800);
}
