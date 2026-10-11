"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PanelLeft, PanelLeftClose, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionSummary } from "@/features/deep-radar/lib/research-types";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "deep-radar.session-sidebar-collapsed";

function useDesktopLayout() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export async function deleteResearchSession(id: string) {
  const res = await fetch(`/api/deep-radar/research/${id}`, { method: "DELETE" });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    nextId?: string | null;
  };
  if (!res.ok) throw new Error(data.error || "删除失败");
  return data.nextId ?? null;
}

export function SessionList({
  sessions,
  activeId,
}: {
  sessions: SessionSummary[];
  activeId?: string;
}) {
  const router = useRouter();
  const desktop = useDesktopLayout();
  const [collapsed, setCollapsed] = useState(false);
  const rail = collapsed && desktop;

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function create() {
    const res = await fetch("/api/deep-radar/research", { method: "POST" });
    const data = (await res.json()) as {
      session?: { id: string };
      error?: string;
    };
    if (!res.ok || !data.session) {
      window.alert(data.error || "无法新建研究");
      return;
    }
    router.push(`/deep-radar/research/${data.session.id}`);
    router.refresh();
  }

  async function remove(session: SessionSummary) {
    if (
      !window.confirm(
        `删除整条研究会话「${session.title}」？对话、纲要、材料和报告都会去掉，且不能恢复。`,
      )
    ) {
      return;
    }
    try {
      const nextId = await deleteResearchSession(session.id);
      if (activeId === session.id) {
        router.push(nextId ? `/deep-radar/research/${nextId}` : "/deep-radar/research");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除失败");
    }
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col self-stretch border-r bg-sidebar text-sidebar-foreground transition-[width]",
        rail ? "w-14" : "w-full flex-1 md:w-52 md:flex-none",
      )}
    >
      <div
        className={cn(
          "flex h-11 shrink-0 items-center border-b border-border",
          rail ? "justify-center px-2" : "gap-1 px-3",
        )}
      >
        {rail ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="展开研究会话侧边栏"
            className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
          >
            <PanelLeft className="size-4" />
          </button>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
              研究会话
            </p>
            <button
              type="button"
              onClick={() => void create()}
              aria-label="新建研究"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="折叠研究会话侧边栏"
              className="hidden size-7 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent md:inline-flex [&_svg]:pointer-events-none"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          rail ? null : (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              还没有研究。新建一条，从你想查的问题开始。
            </p>
          )
        ) : rail ? (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => void create()}
              aria-label="新建研究"
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [&_svg]:pointer-events-none"
            >
              <Plus className="size-4" />
            </button>
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/deep-radar/research/${session.id}`}
                title={session.title}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg text-xs font-medium",
                  activeId === session.id
                    ? "bg-sky-100 text-sky-900 ring-1 ring-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-500/40"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                {sessionInitial(session.title)}
              </Link>
            ))}
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "mb-1 flex items-start rounded-lg hover:bg-sidebar-accent/70",
                activeId === session.id &&
                  "bg-sky-50 ring-1 ring-inset ring-sky-300 dark:bg-sky-500/15 dark:ring-sky-500/40",
              )}
            >
              <Link
                href={`/deep-radar/research/${session.id}`}
                className="min-w-0 flex-1 px-2.5 py-2 text-sm"
              >
                <span className="block truncate">{session.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {phaseShort(session.phase)}
                </span>
              </Link>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mt-1.5 mr-1 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`删除 ${session.title}`}
                onClick={() => void remove(session)}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function sessionInitial(title: string) {
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "研";
}

function phaseShort(phase: SessionSummary["phase"]) {
  switch (phase) {
    case "grilling":
      return "追问中";
    case "outline_pending":
    case "supplement_pending":
      return "待批纲要";
    case "looping":
      return "循环中";
    case "paused":
      return "已冻结";
    case "reporting":
      return "写报告";
    case "ready":
      return "已完成";
    default:
      return "新研究";
  }
}
