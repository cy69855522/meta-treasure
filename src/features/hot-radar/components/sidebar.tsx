"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, PanelLeft, PanelLeftClose, X } from "lucide-react";
import { cn } from "@/lib/utils";

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14.5 3.2a1.35 1.35 0 1 0-.1-2.7 1.35 1.35 0 0 0 .1 2.7ZM20.8 12.1a2.15 2.15 0 0 0-3.62-1.58 10.6 10.6 0 0 0-5.05-1.48l.86-4.05 2.8.62a1.55 1.55 0 1 0 .16-1.05l-3.2-.7a.6.6 0 0 0-.7.45l-1 4.7a10.7 10.7 0 0 0-5.15 1.52 2.15 2.15 0 1 0-2.35 3.5 3.6 3.6 0 0 0-.05.78c0 3.35 3.85 6.07 8.6 6.07s8.6-2.72 8.6-6.07c0-.27-.02-.53-.06-.78a2.15 2.15 0 0 0 .26-3.93Zm-12.95.95a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Zm7.15 4.2c-.85.85-2.2.95-3 .95s-2.15-.1-3-.95a.5.5 0 0 1 .7-.7c.55.55 1.4.7 2.3.7s1.75-.15 2.3-.7a.5.5 0 1 1 .7.7Zm-.25-1.5a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Z" />
    </svg>
  );
}

function NavLinks({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const items = [
    {
      href: "/hot-radar/reddit",
      label: "Reddit",
      icon: <RedditIcon className="size-4 shrink-0" />,
      active:
        pathname === "/hot-radar/reddit" ||
        pathname.startsWith("/hot-radar/reddit/"),
    },
  ];

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
            item.active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/70",
            collapsed && "justify-center",
          )}
        >
          {item.icon}
          {collapsed ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const mobileOpen = openPath === pathname;

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpenPath(pathname)}
          aria-label="打开侧边栏"
          className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
        <p className="text-sm font-semibold">Hot Radar</p>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            aria-label="关闭侧边栏"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpenPath(null)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(14rem,86vw)] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
              <p className="text-sm font-semibold tracking-tight">Hot Radar</p>
              <button
                type="button"
                onClick={() => setOpenPath(null)}
                aria-label="关闭侧边栏"
                className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-sidebar-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavLinks pathname={pathname} collapsed={false} onNavigate={() => setOpenPath(null)} />
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
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
            {collapsed ? (
              <span className="flex-1 text-center text-sm font-semibold">H</span>
            ) : (
              <p className="min-w-0 flex-1 text-sm font-semibold tracking-tight">Hot Radar</p>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent"
            >
              {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>
          <NavLinks pathname={pathname} collapsed={collapsed} />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}
