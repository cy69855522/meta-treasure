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
  GripVertical,
  Inbox,
  Boxes,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Menu,
  X,
  Settings2,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectsManager } from "@/components/projects-manager";

function SortableProjectItem({
  project,
  collapsed,
  active,
  onNavigate,
}: {
  project: Project;
  collapsed: boolean;
  active: boolean;
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
      </Link>
    </div>
  );
}

function ProjectNav({
  items,
  collapsed,
  pathname,
  inboxCount,
  mounted,
  sensors,
  onDragEnd,
  onNavigate,
  onOpenCapture,
  onOpenManage,
  showCaptureHint,
  dndId,
}: {
  items: Project[];
  collapsed: boolean;
  pathname: string;
  inboxCount: number;
  mounted: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onNavigate?: () => void;
  onOpenCapture: () => void;
  onOpenManage: () => void;
  showCaptureHint: boolean;
  dndId: string;
}) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      {showCaptureHint ? (
        <div className="mb-1 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground">
          <span>
            快捷键 <kbd className="rounded border bg-background px-1">C</kbd>{" "}
            快速捕捉
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={onOpenCapture}
            aria-label="打开快速捕捉"
            title="打开快速捕捉"
          >
            <Plus />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="mb-1 w-full"
          onClick={onOpenCapture}
          aria-label="打开快速捕捉"
          title="打开快速捕捉"
        >
          <Plus />
        </Button>
      )}

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
            <span className="flex-1">收件箱</span>
            {inboxCount > 0 ? (
              <Badge variant="secondary">{inboxCount}</Badge>
            ) : null}
          </>
        ) : null}
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
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
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
      )}
    </nav>
  );
}

export function Sidebar({
  projects,
  inboxCount,
  onOpenCapture,
  children,
}: {
  projects: Project[];
  inboxCount: number;
  onOpenCapture: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const { matches: isDesktop } = useMediaQuery("(min-width: 768px)");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [items, setItems] = useState(projects);
  // Only one DnD tree at a time to avoid hydration / id clashes.
  const enableMobileDnd = mounted && !isDesktop;
  const enableDesktopDnd = mounted && isDesktop;

  useEffect(() => {
    setItems(projects);
  }, [projects]);

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
      alert("项目排序保存失败");
      return;
    }

    router.refresh();
  }

  const mobileNavProps = {
    items,
    pathname,
    inboxCount,
    mounted: enableMobileDnd,
    sensors,
    onDragEnd,
    onOpenCapture,
    onOpenManage: () => setManageOpen(true),
  };

  const desktopNavProps = {
    items,
    pathname,
    inboxCount,
    mounted: enableDesktopDnd,
    sensors,
    onDragEnd,
    onOpenCapture,
    onOpenManage: () => setManageOpen(true),
  };

  return (
    <>
      {/* Mobile top bar: always in document flow so clicks aren't covered */}
      <header className="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="打开侧边栏"
          className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted [&_svg]:pointer-events-none"
        >
          <Menu className="size-5" />
        </button>
        <p className="text-sm font-semibold">Progress</p>
        <button
          type="button"
          onClick={onOpenCapture}
          aria-label="打开快速捕捉"
          className="ml-auto inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted [&_svg]:pointer-events-none"
        >
          <Plus className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        data-mobile-drawer=""
        className={cn(
          "fixed inset-0 z-[100] md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label="关闭侧边栏"
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(18rem,86vw)] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
            <div>
              <p className="text-sm font-semibold tracking-tight">Progress</p>
              <p className="text-xs text-muted-foreground">无压多项目路线图</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭侧边栏"
              className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
            >
              <X className="size-4" />
            </button>
          </div>
          <ProjectNav
            {...mobileNavProps}
            collapsed={false}
            showCaptureHint
            dndId="sidebar-projects-mobile"
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "hidden min-h-0 shrink-0 flex-col self-stretch border-r bg-sidebar text-sidebar-foreground transition-[width] md:flex",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <div className="flex items-center gap-2 border-b px-3 py-3">
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">Progress</p>
                <p className="text-xs text-muted-foreground">无压多项目路线图</p>
              </div>
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
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent [&_svg]:pointer-events-none"
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
            showCaptureHint={!collapsed}
            dndId="sidebar-projects-desktop"
          />
        </aside>

        {children}
      </div>

      <ProjectsManager
        projects={items}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </>
  );
}
