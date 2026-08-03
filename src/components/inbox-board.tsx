"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskModal } from "@/components/task-modal";
import { TaskTimestamps } from "@/components/task-timestamps";

export function InboxBoard({
  tasks,
  projects,
}: {
  tasks: Task[];
  projects: Project[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);

  async function moveTo(task: Task, lane: "now" | "next" | "later") {
    if (!task.projectId) {
      alert("请先在任务详情中关联一个项目，再移入路线图。");
      setSelected(task);
      setOpen(true);
      return;
    }
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane, projectId: task.projectId }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "移动失败");
      return;
    }
    router.refresh();
  }

  async function remove(task: Task) {
    if (!confirm(`确定删除「${task.title}」？此操作不可恢复。`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "删除失败");
      return;
    }
    if (selected?.id === task.id) {
      setOpen(false);
      setSelected(null);
    }
    router.refresh();
  }

  return (
    <>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            收件箱是空的。按 <kbd className="rounded border px-1">C</kbd>{" "}
            快速捕捉灵感。
          </div>
        ) : (
          tasks.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => {
                    setSelected(task);
                    setOpen(true);
                  }}
                >
                  <p className="text-sm font-medium">{task.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {project ? (
                      <Badge variant="outline">{project.name}</Badge>
                    ) : (
                      <Badge variant="secondary">未关联项目</Badge>
                    )}
                  </div>
                  <TaskTimestamps task={task} compact />
                </button>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => moveTo(task, "now")}
                  >
                    → Now
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => moveTo(task, "next")}
                  >
                    → Next
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => moveTo(task, "later")}
                  >
                    → Later
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => remove(task)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <TaskModal
        task={selected}
        projects={projects}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
