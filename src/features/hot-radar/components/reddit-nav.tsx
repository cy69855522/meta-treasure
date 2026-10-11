"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, LayoutDashboard, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    href: "/hot-radar/reddit",
    label: "数据看板",
    icon: LayoutDashboard,
    match: (path: string) => path === "/hot-radar/reddit",
  },
  {
    href: "/hot-radar/reddit/config",
    label: "配置管理",
    icon: Settings2,
    match: (path: string) => path === "/hot-radar/reddit/config",
  },
  {
    href: "/hot-radar/reddit/hot",
    label: "热点追踪",
    icon: Flame,
    match: (path: string) =>
      path === "/hot-radar/reddit/hot" ||
      path.startsWith("/hot-radar/reddit/hot/"),
  },
];

export function RedditNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-11 shrink-0 items-center gap-1 border-b px-3">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-foreground font-medium text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
