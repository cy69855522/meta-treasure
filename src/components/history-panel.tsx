"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Task } from "@/lib/types";
import { durationLabel, formatDateShort, formatDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskModal } from "@/components/task-modal";

const LABEL_WIDTH = 220;

function ganttRange(tasks: Task[]) {
  const points = tasks.flatMap((t) => {
    const start = t.startedAt ?? t.createdAt;
    const end = t.completedAt ?? t.updatedAt;
    return [new Date(start).getTime(), new Date(end).getTime()];
  });
  let min = Math.min(...points);
  let max = Math.max(...points);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const now = Date.now();
    return { min: now - 86400000, max: now };
  }
  if (min === max) {
    min -= 60 * 60 * 1000;
    max += 60 * 60 * 1000;
  }
  const pad = Math.max((max - min) * 0.06, 30 * 60 * 1000);
  return { min: min - pad, max: max + pad };
}

function buildTicks(min: number, max: number, count = 6) {
  const span = max - min;
  return Array.from({ length: count }, (_, i) => {
    const t = min + (span * i) / (count - 1);
    return { t, label: formatDateShort(new Date(t).toISOString()) };
  });
}

export function HistoryPanel({
  tasks,
  projects,
}: {
  tasks: Task[];
  projects: Project[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const aEnd = a.completedAt ?? a.updatedAt;
        const bEnd = b.completedAt ?? b.updatedAt;
        return bEnd.localeCompare(aEnd);
      }),
    [tasks],
  );

  const { min, max } = useMemo(() => ganttRange(sorted), [sorted]);
  const ticks = useMemo(() => buildTicks(min, max), [min, max]);
  const span = max - min;

  async function restore(task: Task) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane: "later" }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "恢复失败");
      return;
    }
    router.refresh();
  }

  async function remove(task: Task) {
    if (!confirm(`确定永久删除「${task.title}」？`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "删除失败");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <section className="mt-4 rounded-xl border bg-muted/20 p-4">
        <header className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">历史 · 甘特图</h2>
            <p className="text-xs text-muted-foreground">
              条形从启动（进入 Now）到完成；若无启动时间则从创建时间起算。
            </p>
          </div>
          <Badge variant="secondary">{sorted.length}</Badge>
        </header>

        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            还没有已完成事项
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <div className="min-w-[720px]">
              <div
                className="grid border-b bg-muted/40 text-[11px] text-muted-foreground"
                style={{
                  gridTemplateColumns: `${LABEL_WIDTH}px 1fr`,
                }}
              >
                <div className="px-3 py-2 font-medium">事项</div>
                <div className="relative h-9">
                  {ticks.map((tick) => (
                    <div
                      key={tick.t}
                      className="absolute top-0 bottom-0 border-l border-border/70"
                      style={{
                        left: `${((tick.t - min) / span) * 100}%`,
                      }}
                    >
                      <span
                        className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap px-1"
                        suppressHydrationWarning
                      >
                        {tick.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {sorted.map((task) => {
                const project = projects.find((p) => p.id === task.projectId);
                const startIso = task.startedAt ?? task.createdAt;
                const endIso = task.completedAt ?? task.updatedAt;
                const start = new Date(startIso).getTime();
                const end = new Date(endIso).getTime();
                const left = ((start - min) / span) * 100;
                const width = Math.max(((end - start) / span) * 100, 1.2);
                const createLeft =
                  ((new Date(task.createdAt).getTime() - min) / span) * 100;

                return (
                  <div
                    key={task.id}
                    className="grid border-b last:border-b-0"
                    style={{
                      gridTemplateColumns: `${LABEL_WIDTH}px 1fr`,
                    }}
                  >
                    <div className="flex flex-col justify-center gap-1 border-r px-3 py-3">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-medium hover:underline"
                        onClick={() => {
                          setSelected(task);
                          setOpen(true);
                        }}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        {project?.name ?? "未关联项目"} ·{" "}
                        <span suppressHydrationWarning>
                          {durationLabel(startIso, endIso)}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => restore(task)}
                        >
                          恢复
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() => remove(task)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>

                    <div className="relative h-[72px]">
                      {ticks.map((tick) => (
                        <div
                          key={`${task.id}-${tick.t}`}
                          className="pointer-events-none absolute inset-y-0 border-l border-border/50"
                          style={{
                            left: `${((tick.t - min) / span) * 100}%`,
                          }}
                        />
                      ))}

                      <div
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground/70"
                        style={{ left: `${createLeft}%` }}
                        title={`创建 ${formatDateTime(task.createdAt)}`}
                      />

                      <button
                        type="button"
                        className="absolute top-1/2 h-7 -translate-y-1/2 rounded-md px-2 text-left text-[11px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 48,
                          backgroundColor: project?.color ?? "#525252",
                        }}
                        title={`启动 ${formatDateTime(startIso)} → 完成 ${formatDateTime(endIso)}`}
                        onClick={() => {
                          setSelected(task);
                          setOpen(true);
                        }}
                      >
                        <span className="block truncate" suppressHydrationWarning>
                          {formatDateShort(startIso)} → {formatDateShort(endIso)}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-muted-foreground/70" />
                创建时间
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-8 rounded-sm bg-foreground/70" />
                启动 → 完成
              </span>
            </div>
          </div>
        )}
      </section>

      <TaskModal
        task={selected}
        projects={projects}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
