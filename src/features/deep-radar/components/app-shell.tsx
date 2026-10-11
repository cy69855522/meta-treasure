"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Library,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Radar,
  Settings2,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Sidebar>{children}</Sidebar>
    </div>
  );
}

function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const favoritesActive = pathname.startsWith("/deep-radar/favorites");
  const researchActive = pathname.startsWith("/deep-radar/research");
  const knowledgeActive = pathname.startsWith("/deep-radar/knowledge");
  const settingsActive = pathname.startsWith("/deep-radar/settings");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function nav(compact: boolean) {
    const itemClass = (active: boolean) =>
      cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/70",
        compact && "justify-center px-2",
      );
    return (
      <nav className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <Link
          href="/deep-radar/settings"
          onClick={() => setMobileOpen(false)}
          className={itemClass(settingsActive)}
        >
          <Settings2 className="size-4 shrink-0" />
          {!compact ? <span>设置</span> : null}
        </Link>
        <Link
          href="/deep-radar/favorites"
          onClick={() => setMobileOpen(false)}
          className={itemClass(favoritesActive)}
        >
          <Star className="size-4 shrink-0" />
          {!compact ? <span>收藏夹</span> : null}
        </Link>
        <Link
          href="/deep-radar/research"
          onClick={() => setMobileOpen(false)}
          className={itemClass(researchActive)}
        >
          <Radar className="size-4 shrink-0" />
          {!compact ? <span>Deep Research</span> : null}
        </Link>
        <Link
          href="/deep-radar/knowledge"
          onClick={() => setMobileOpen(false)}
          className={itemClass(knowledgeActive)}
        >
          <Library className="size-4 shrink-0" />
          {!compact ? <span>知识库</span> : null}
        </Link>
      </nav>
    );
  }

  return (
    <>
      <header className="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 md:hidden">
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
          aria-label="打开侧边栏"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </button>
        <p className="text-sm font-semibold">Deep Radar</p>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            aria-label="关闭侧边栏"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(14rem,86vw)] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
              <p className="text-sm font-semibold tracking-tight">Deep Radar</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="关闭侧边栏"
                className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
              >
                <X className="size-4" />
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          className={cn(
            "hidden min-h-0 shrink-0 flex-col self-stretch border-r bg-sidebar text-sidebar-foreground transition-[width] md:flex",
            collapsed ? "w-14" : "w-52",
          )}
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
            {!collapsed ? (
              <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                Deep Radar
              </p>
            ) : (
              <span className="flex-1 text-center text-sm font-semibold">R</span>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
            >
              {collapsed ? (
                <PanelLeft className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </div>
          {nav(collapsed)}
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </>
  );
}
