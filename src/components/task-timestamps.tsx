import type { Task } from "@/lib/types";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export function TaskTimestamps({
  task,
  compact = false,
  className,
}: {
  task: Task;
  compact?: boolean;
  className?: string;
}) {
  const rows = [
    { label: "创建", value: task.createdAt },
    { label: "启动", value: task.startedAt },
    { label: "完成", value: task.completedAt },
  ];

  if (compact) {
    return (
      <div
        className={cn("mt-1.5 space-y-0.5 text-[11px] text-muted-foreground", className)}
        suppressHydrationWarning
      >
        <p suppressHydrationWarning>创建 {formatDateTime(task.createdAt)}</p>
        {task.startedAt ? (
          <p suppressHydrationWarning>启动 {formatDateTime(task.startedAt)}</p>
        ) : null}
        {task.completedAt ? (
          <p suppressHydrationWarning>完成 {formatDateTime(task.completedAt)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-3",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.label}>
          <p className="text-muted-foreground">{row.label}时间</p>
          <p className="mt-0.5 font-medium" suppressHydrationWarning>
            {formatDateTime(row.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
