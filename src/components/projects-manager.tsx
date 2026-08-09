"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Track color presets (deduped). */
const COLOR_PRESETS = [
  "#66CCCC",
  "#CCFF66",
  "#FF99CC",
  "#FF9999",
  "#FFFFFF",
  "#FFCC99",
  "#FF6666",
  "#FFFF66",
  "#99CC66",
  "#666699",
  "#99CC33",
  "#FF9900",
  "#FFCC00",
  "#FF0033",
  "#FF9966",
  "#CCFF00",
  "#CC3399",
  "#FF6600",
  "#993366",
  "#CCCC33",
  "#666633",
];

export function ProjectsManager({
  projects,
  open,
  onOpenChange,
}: {
  projects: Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState(COLOR_PRESETS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setColor(COLOR_PRESETS[0]);
    setEditingId(null);
  }, [open]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          color,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "创建失败");
      }
      const data = (await res.json()) as { project: Project };
      setName("");
      setDescription("");
      onOpenChange(false);
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description);
    setEditColor(project.color);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
          color: editColor,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "保存失败");
      }
      setEditingId(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(project: Project) {
    if (
      !confirm(
        `确定删除项目「${project.name}」？其下未完成事项会回到收件箱，已完成事项保留在历史中但不关联该项目。`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "删除失败");
      }
      if (pathname === `/projects/${project.id}`) {
        onOpenChange(false);
        router.push("/inbox");
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>管理项目</DialogTitle>
          <DialogDescription>
            新增、重命名或删除项目。删除不会清掉事项，只会解除关联。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
          <section className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">新增项目</p>
            <Input
              placeholder="项目名称，例如：AI 写作"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="简介（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`颜色 ${c}`}
                  className="size-6 rounded-full border border-black/15 ring-offset-2"
                  style={{
                    backgroundColor: c,
                    boxShadow:
                      color === c ? "0 0 0 2px var(--foreground)" : undefined,
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={create}
                disabled={busy || !name.trim()}
              >
                <Plus data-icon="inline-start" />
                添加项目
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">现有项目</p>
            {projects.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                还没有项目
              </p>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg border bg-background p-3"
                >
                  {editingId === project.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="简介（可选）"
                      />
                      <div className="flex flex-wrap gap-2">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`颜色 ${c}`}
                            className="size-6 rounded-full border border-black/15 ring-offset-2"
                            style={{
                              backgroundColor: c,
                              boxShadow:
                                editColor === c
                                  ? "0 0 0 2px var(--foreground)"
                                  : undefined,
                            }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          onClick={saveEdit}
                          disabled={busy || !editName.trim()}
                        >
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1.5 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {project.name}
                          {project.inPiggyBank ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · 储蓄罐
                            </span>
                          ) : null}
                        </p>
                        {project.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {project.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => startEdit(project)}
                          aria-label={`重命名 ${project.name}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="destructive"
                          onClick={() => remove(project)}
                          disabled={busy}
                          aria-label={`删除 ${project.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
