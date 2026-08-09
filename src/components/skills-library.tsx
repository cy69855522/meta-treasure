"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Folder, FolderPlus, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { SkillFolder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FolderItem = SkillFolder & { skillCount: number };

function SortableFolderCard({
  folder,
  onRename,
  onRemove,
}: {
  folder: FolderItem;
  onRename: (folder: FolderItem) => void;
  onRemove: (folder: FolderItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex flex-col rounded-xl border bg-muted/20 p-4 transition hover:border-foreground/20 hover:bg-muted/40",
        isDragging && "z-10 opacity-90 shadow-lg ring-2 ring-ring/30",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-1 inline-flex size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 active:cursor-grabbing"
          aria-label={`拖动排序 ${folder.name}`}
          title="拖动排序"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <Link
          href={`/skills/${folder.id}`}
          className="flex min-w-0 flex-1 items-start gap-3"
        >
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm">
            <Folder className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{folder.name}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {folder.skillCount} 个技能
            </span>
          </span>
        </Link>
      </div>
      <div className="mt-3 flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="重命名"
          onClick={() => onRename(folder)}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="删除"
          onClick={() => onRemove(folder)}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

export function SkillsLibrary({
  initialFolders,
}: {
  initialFolders: FolderItem[];
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [folders, setFolders] = useState(initialFolders);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FolderItem | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  function openCreate() {
    setName("");
    setCreateOpen(true);
  }

  function openRename(folder: FolderItem) {
    setName(folder.name);
    setRenameTarget(folder);
  }

  async function createFolder(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/skill-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "创建失败");
      }
      const data = (await res.json()) as { folder: FolderItem };
      setFolders((prev) => [...prev, data.folder]);
      setCreateOpen(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function renameFolder(event: React.FormEvent) {
    event.preventDefault();
    if (!renameTarget || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/skill-folders/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "重命名失败");
      }
      const data = (await res.json()) as { folder: SkillFolder };
      setFolders((prev) =>
        prev.map((f) =>
          f.id === data.folder.id
            ? { ...data.folder, skillCount: f.skillCount }
            : f,
        ),
      );
      setRenameTarget(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeFolder(folder: FolderItem) {
    if (
      !confirm(
        `删除文件夹「${folder.name}」？其中的 ${folder.skillCount} 个技能也会一并删除。`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/skill-folders/${folder.id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "删除失败");
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    router.refresh();
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = folders.findIndex((f) => f.id === active.id);
    const newIndex = folders.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = folders;
    const next = arrayMove(folders, oldIndex, newIndex);
    setFolders(next);

    const res = await fetch("/api/skill-folders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((f) => f.id) }),
    });

    if (!res.ok) {
      setFolders(previous);
      alert("排序保存失败");
      return;
    }
    router.refresh();
  }

  const folderGrid = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map((folder) =>
        mounted ? (
          <SortableFolderCard
            key={folder.id}
            folder={folder}
            onRename={openRename}
            onRemove={removeFolder}
          />
        ) : (
          <div
            key={folder.id}
            className="group flex flex-col rounded-xl border bg-muted/20 p-4"
          >
            <Link
              href={`/skills/${folder.id}`}
              className="flex min-w-0 flex-1 items-start gap-3"
            >
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm">
                <Folder className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{folder.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {folder.skillCount} 个技能
                </span>
              </span>
            </Link>
          </div>
        ),
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Skills Library
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">技能库</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            用文件夹整理收集到的 Agent Skills；可拖动手柄调整文件夹顺序。
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <FolderPlus />
          新建文件夹
        </Button>
      </header>

      {folders.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          还没有文件夹。先建一个分类，再往里收集技能。
        </div>
      ) : mounted ? (
        <DndContext
          id="skill-folders"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={folders.map((f) => f.id)}
            strategy={rectSortingStrategy}
          >
            {folderGrid}
          </SortableContext>
        </DndContext>
      ) : (
        folderGrid
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription>给一批相关技能起个分类名。</DialogDescription>
          </DialogHeader>
          <form onSubmit={createFolder} className="flex flex-col gap-3">
            <Input
              autoFocus
              placeholder="例如：写作 / 选品 / 代码审查"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "创建中…" : "创建"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重命名文件夹</DialogTitle>
            <DialogDescription>仅改名称，其中的技能不受影响。</DialogDescription>
          </DialogHeader>
          <form onSubmit={renameFolder} className="flex flex-col gap-3">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenameTarget(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
