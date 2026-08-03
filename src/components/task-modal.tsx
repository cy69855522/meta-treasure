"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { Lane, Project, Task } from "@/lib/types";
import { LANE_LABELS, ROADMAP_LANES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskEditor } from "@/components/task-editor";
import { AttributesDialog } from "@/components/attributes-dialog";
import { TaskTimestamps } from "@/components/task-timestamps";

export function TaskModal({
  task,
  projects,
  open,
  onOpenChange,
}: {
  task: Task | null;
  projects: Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [lane, setLane] = useState<Lane>("later");
  const [projectId, setProjectId] = useState<string>("");
  const [content, setContent] = useState("[]");
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [attrsOpen, setAttrsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setLane(task.lane);
    setProjectId(task.projectId ?? "");
    setContent(task.content || "[]");
    setAttributes(task.attributes || {});
    setAttrsOpen(false);
  }, [task]);

  if (!task) return null;

  async function persist(patch: {
    title?: string;
    lane?: Lane;
    projectId?: string | null;
    content?: string;
    attributes?: Record<string, string>;
  }) {
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error || "操作失败");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await persist({
        title,
        lane,
        projectId: projectId || null,
        content,
        attributes,
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    if (!confirm(`将「${title || task!.title}」标记为完成，并移入历史？`)) {
      return;
    }
    setSaving(true);
    try {
      await persist({
        title,
        projectId: projectId || null,
        content,
        attributes,
        lane: "done",
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "完成失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`确定删除「${title || task!.title}」？此操作不可恢复。`)) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task!.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "删除失败");
      }
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除失败");
    } finally {
      setSaving(false);
    }
  }

  const attrCount = Object.keys(attributes).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>任务详情</DialogTitle>
            <DialogDescription>
              块级编辑器可写 Prompt、链接、代码与笔记。自定义属性请通过按钮单独打开。
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />

            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={lane}
                onChange={(e) => setLane(e.target.value as Lane)}
              >
                <option value="inbox">{LANE_LABELS.inbox}</option>
                {ROADMAP_LANES.map((l) => (
                  <option key={l} value={l}>
                    {LANE_LABELS[l]}
                  </option>
                ))}
                <option value="done">{LANE_LABELS.done}</option>
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">未关联项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <TaskTimestamps task={task} />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAttrsOpen(true)}
              >
                <SlidersHorizontal data-icon="inline-start" />
                自定义属性
                {attrCount > 0 ? (
                  <Badge variant="secondary" className="ml-1">
                    {attrCount}
                  </Badge>
                ) : null}
              </Button>
              {attrCount > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(attributes)
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <Badge key={k} variant="outline">
                        {k}:{v}
                      </Badge>
                    ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  未设置属性
                </span>
              )}
            </div>

            <TaskEditor
              editorKey={task.id}
              content={content}
              onChange={setContent}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {lane !== "done" ? (
                  <Button
                    variant="secondary"
                    onClick={complete}
                    disabled={saving}
                  >
                    完成
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  onClick={remove}
                  disabled={saving}
                >
                  删除
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button onClick={save} disabled={saving || !title.trim()}>
                  {saving ? "保存中…" : "保存"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AttributesDialog
        open={attrsOpen}
        onOpenChange={setAttrsOpen}
        attributes={attributes}
        onSave={setAttributes}
      />
    </>
  );
}
