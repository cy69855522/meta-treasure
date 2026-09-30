"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LoaderCircle,
  GripVertical,
  Inbox,
  Boxes,
  PanelLeftClose,
  PanelLeft,
  PanelTop,
  PanelTopClose,
  Maximize2,
  Minimize2,
  Menu,
  X,
  Settings2,
  Library,
  ScrollText,
  SlidersHorizontal,
  Crown,
  Wrench,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useAgentChrome } from "@/components/agent-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PiggyBankDialog } from "@/components/piggy-bank-dialog";
import {
  PIGGY_BANK_DROP_ID,
  PiggyBankDropZone,
} from "@/components/piggy-bank-drop-zone";
import { ProjectsManager } from "@/components/projects-manager";

function AgentBusyMark({ busy }: { busy: boolean }) {
  if (!busy) return null;
  return (
    <LoaderCircle
      className="size-3.5 shrink-0 animate-spin text-muted-foreground"
      aria-label="对话进行中"
    />
  );
}

function SortableProjectItem({
  project,
  collapsed,
  active,
  busy,
  onNavigate,
}: {
  project: Project;
  collapsed: boolean;
  active: boolean;
  busy: boolean;
  onNavigate?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const href = `/projects/${project.id}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1 rounded-lg transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/70",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      {!collapsed ? (
        <button
          type="button"
          className="inline-flex size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 active:cursor-grabbing"
          aria-label={`拖动排序 ${project.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : null}
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 py-2 text-sm",
          collapsed ? "justify-center px-2.5" : "pr-2.5",
        )}
        title={project.description}
      >
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        {!collapsed ? (
          <span className="flex-1 truncate">{project.name}</span>
        ) : (
          <Boxes className="sr-only" />
        )}
        <AgentBusyMark busy={busy} />
      </Link>
    </div>
  );
}

function ProjectNav({
  items,
  piggyCount,
  collapsed,
  pathname,
  inboxCount,
  busyScopes,
  mounted,
  sensors,
  onDragEnd,
  onNavigate,
  onOpenManage,
  onOpenPiggyBank,
  dndId,
}: {
  items: Project[];
  piggyCount: number;
  collapsed: boolean;
  pathname: string;
  inboxCount: number;
  busyScopes: ReadonlySet<string>;
  mounted: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onNavigate?: () => void;
  onOpenManage: () => void;
  onOpenPiggyBank: () => void;
  dndId: string;
}) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      <Link
        href="/steward"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          pathname === "/steward"
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <Crown className="size-4 shrink-0" />
        {!collapsed ? <span className="flex-1">总管家</span> : null}
        <AgentBusyMark busy={busyScopes.has("steward")} />
      </Link>

      <Link
        href="/inbox"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          pathname === "/inbox"
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <Inbox className="size-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="flex-1 truncate">收件箱</span>
            {inboxCount > 0 ? (
              <Badge variant="secondary">{inboxCount}</Badge>
            ) : null}
          </>
        ) : null}
      </Link>

      <Link
        href="/skills"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          pathname === "/skills" || pathname.startsWith("/skills/")
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <Library className="size-4 shrink-0" />
        {!collapsed ? <span className="flex-1 truncate">技能库</span> : null}
      </Link>

      <Link
        href="/rules"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          pathname === "/rules" || pathname.startsWith("/rules/")
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <ScrollText className="size-4 shrink-0" />
        {!collapsed ? <span className="flex-1 truncate">规则库</span> : null}
      </Link>

      <Link
        href="/toolbox"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          pathname === "/toolbox" || pathname.startsWith("/toolbox/")
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <Wrench className="size-4 shrink-0" />
        {!collapsed ? <span className="flex-1">工具箱</span> : null}
      </Link>

      <Link
        href="/settings"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          pathname === "/settings"
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <SlidersHorizontal className="size-4 shrink-0" />
        {!collapsed ? <span className="flex-1">配置项</span> : null}
      </Link>

      {!collapsed ? (
        <div className="mt-3 mb-1 flex items-center justify-between gap-1 px-2.5">
          <p className="text-xs font-medium text-muted-foreground">
            项目 · 可拖动排序
          </p>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onOpenManage}
            aria-label="管理项目"
            title="管理项目"
          >
            <Settings2 />
          </Button>
        </div>
      ) : (
        <div className="my-2 flex flex-col items-center gap-1 border-t pt-2">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onOpenManage}
            aria-label="管理项目"
            title="管理项目"
          >
            <Settings2 />
          </Button>
        </div>
      )}

      {mounted ? (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1">
              {items.map((project) => (
                <SortableProjectItem
                  key={project.id}
                  project={project}
                  collapsed={collapsed}
                  active={pathname === `/projects/${project.id}`}
                  busy={busyScopes.has(project.id)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </SortableContext>
          <PiggyBankDropZone
            collapsed={collapsed}
            count={piggyCount}
            onOpen={onOpenPiggyBank}
          />
        </DndContext>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {items.map((project) => {
              const href = `/projects/${project.id}`;
              const active = pathname === href;
              return (
                <Link
                  key={project.id}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/70",
                  )}
                  title={project.description}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {!collapsed ? (
                    <span className="flex-1 truncate">{project.name}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          <PiggyBankDropZone
            collapsed={collapsed}
            count={piggyCount}
            onOpen={onOpenPiggyBank}
          />
        </>
      )}
    </nav>
  );
}

export function Sidebar({
  projects,
  piggyBankProjects,
  allProjects,
  inboxCount,
  children,
}: {
  projects: Project[];
  piggyBankProjects: Project[];
  allProjects: Project[];
  inboxCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const { matches: isDesktop } = useMediaQuery("(min-width: 768px)");
  const { headerVisible, toggleHeader, agentSessionActive } = useAgentChrome();
  const { active: fullscreenActive, toggle: toggleFullscreen } = useFullscreen();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [piggyOpen, setPiggyOpen] = useState(false);
  const [items, setItems] = useState(projects);
  const [busyScopes, setBusyScopes] = useState<ReadonlySet<string>>(() => new Set());
  // Only one DnD tree at a time to avoid hydration / id clashes.
  const enableMobileDnd = mounted && !isDesktop;
  const enableDesktopDnd = mounted && isDesktop;

  useEffect(() => {
    setItems(projects);
  }, [projects]);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/api/agents/activity", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { busy?: string[] };
        if (!alive) return;
        setBusyScopes(new Set(data.busy || []));
      } catch {
        /* Sidebar indicator is best-effort. */
      }
    };
    void pull();
    const timer = window.setInterval(pull, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (over.id === PIGGY_BANK_DROP_ID) {
      const projectId = String(active.id);
      const prev = items;
      setItems((list) => list.filter((p) => p.id !== projectId));
      const res = await fetch(`/api/projects/${projectId}/piggy-bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inPiggyBank: true }),
      });
      if (!res.ok) {
        setItems(prev);
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        alert(data?.error || "移入储蓄罐失败");
        return;
      }
      router.refresh();
      return;
    }

    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);

    const res = await fetch("/api/projects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((p) => p.id) }),
    });

    if (!res.ok) {
      setItems(projects);
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      alert(data?.error || "项目排序保存失败");
      return;
    }

    router.refresh();
  }

  const mobileNavProps = {
    items,
    piggyCount: piggyBankProjects.length,
    pathname,
    inboxCount,
    busyScopes,
    mounted: enableMobileDnd,
    sensors,
    onDragEnd,
    onOpenManage: () => setManageOpen(true),
    onOpenPiggyBank: () => setPiggyOpen(true),
  };

  const desktopNavProps = {
    items,
    piggyCount: piggyBankProjects.length,
    pathname,
    inboxCount,
    busyScopes,
    mounted: enableDesktopDnd,
    sensors,
    onDragEnd,
    onOpenManage: () => setManageOpen(true),
    onOpenPiggyBank: () => setPiggyOpen(true),
  };

  return (
    <>
      {/* Mobile top bar: always in document flow so clicks aren't covered */}
      <header className="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="打开侧边栏"
          className="inline-flex size-10 touch-manipulation items-center justify-center rounded-lg hover:bg-muted [&_svg]:pointer-events-none"
        >
          <Menu className="size-5" />
        </button>
        <p className="text-sm font-semibold">Progress</p>
        {agentSessionActive ? (
          <button
            type="button"
            onClick={toggleHeader}
            aria-label={headerVisible ? "隐藏顾问标题栏" : "显示顾问标题栏"}
            aria-pressed={headerVisible}
            title={headerVisible ? "隐藏顾问标题栏" : "显示顾问标题栏"}
            className="ml-auto inline-flex size-10 touch-manipulation items-center justify-center rounded-lg hover:bg-muted [&_svg]:pointer-events-none"
          >
            {headerVisible ? (
              <PanelTopClose className="size-5" />
            ) : (
              <PanelTop className="size-5" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreenActive ? "退出全屏" : "全屏"}
          aria-pressed={fullscreenActive}
          title={fullscreenActive ? "退出全屏" : "全屏"}
          className={cn(
            "inline-flex size-10 touch-manipulation items-center justify-center rounded-lg hover:bg-muted [&_svg]:pointer-events-none",
            !agentSessionActive && "ml-auto",
          )}
        >
          {fullscreenActive ? (
            <Minimize2 className="size-5" />
          ) : (
            <Maximize2 className="size-5" />
          )}
        </button>
      </header>

      {/* Mobile drawer: unmount when closed — a closed `fixed inset-0` layer
          still steals taps on some mobile browsers despite pointer-events-none. */}
      {mobileOpen ? (
        <div data-mobile-drawer="" className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            aria-label="关闭侧边栏"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(14rem,86vw)] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
              <p className="text-sm font-semibold tracking-tight">Progress</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="关闭侧边栏"
                className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
              >
                <X className="size-4" />
              </button>
            </div>
            <ProjectNav
              {...mobileNavProps}
              collapsed={false}
              dndId="sidebar-projects-mobile"
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "hidden min-h-0 shrink-0 flex-col self-stretch border-r bg-sidebar text-sidebar-foreground transition-[width] md:flex",
            collapsed ? "w-14" : "w-52",
          )}
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
            {!collapsed ? (
              <p className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
                Progress
              </p>
            ) : (
              <span className="flex-1 text-center text-sm font-semibold">P</span>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCollapsed((v) => !v);
              }}
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
          <ProjectNav
            {...desktopNavProps}
            collapsed={collapsed}
            dndId="sidebar-projects-desktop"
          />
        </aside>

        {children}
      </div>

      <ProjectsManager
        projects={allProjects}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />

      <PiggyBankDialog
        open={piggyOpen}
        onOpenChange={setPiggyOpen}
        projects={piggyBankProjects}
      />

    </>
  );
}
