"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Lane, Project, Task } from "@/lib/types";
import {
  LANE_LABELS,
  NOW_WIP_LIMIT,
  ROADMAP_LANES,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InboxCapture } from "@/components/inbox-capture";
import { TaskModal } from "@/components/task-modal";
import { HistoryPanel } from "@/components/history-panel";
import { TaskTimestamps } from "@/components/task-timestamps";

type RoadmapLane = (typeof ROADMAP_LANES)[number];

/** ~3 task cards + 2 gaps; overflow scrolls with scrollbar hidden. */
const LANE_TASK_LIST_CLASS =
  "flex h-[calc(3*7.25rem+2*0.5rem)] flex-col gap-2 overflow-y-auto scrollbar-none";

function TaskCard({
  task,
  dragging,
  onOpen,
  onComplete,
  onDelete,
}: {
  task: Task;
  dragging?: boolean;
  onOpen: (task: Task) => void;
  onComplete?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-lg border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md",
        dragging && "opacity-80 shadow-lg",
      )}
    >
      <button type="button" onClick={() => onOpen(task)} className="w-full text-left">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <TaskTimestamps task={task} compact />
        {Object.keys(task.attributes).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(task.attributes)
              .slice(0, 3)
              .map(([k, v]) => (
                <Badge key={k} variant="outline">
                  {k}:{v}
                </Badge>
              ))}
          </div>
        ) : null}
      </button>
      {onComplete || onDelete ? (
        <div className="mt-2 flex justify-end gap-1.5">
          {onComplete ? (
            <Button
              size="xs"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onComplete(task);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              完成
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              size="xs"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              删除
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SortableTaskCard({
  task,
  onOpen,
  onComplete,
  onDelete,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { lane: task.lane } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-40")}
    >
      <TaskCard
        task={task}
        onOpen={onOpen}
        onComplete={onComplete}
        onDelete={onDelete}
      />
    </div>
  );
}

function LaneHeader({
  lane,
  count,
  onAdd,
}: {
  lane: RoadmapLane;
  count: number;
  onAdd: (lane: RoadmapLane) => void;
}) {
  const overLimit = lane === "now" && count >= NOW_WIP_LIMIT;
  return (
    <header className="mb-3 flex items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{LANE_LABELS[lane]}</h2>
        {lane === "now" ? (
          <p className="text-xs text-muted-foreground">
            WIP ≤ {NOW_WIP_LIMIT}，避免多线程内耗
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label={`在 ${LANE_LABELS[lane]} 新建事项`}
          title="新建事项"
          onClick={() => onAdd(lane)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Plus />
        </Button>
        <Badge variant={overLimit ? "default" : "secondary"}>
          {count}
          {lane === "now" ? `/${NOW_WIP_LIMIT}` : ""}
        </Badge>
      </div>
    </header>
  );
}

function StaticLaneColumn({
  lane,
  tasks,
  onOpen,
  onComplete,
  onDelete,
  onAdd,
}: {
  lane: RoadmapLane;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAdd: (lane: RoadmapLane) => void;
}) {
  const overLimit = lane === "now" && tasks.length >= NOW_WIP_LIMIT;
  return (
    <section
      className={cn(
        "flex flex-1 flex-col rounded-xl border bg-muted/30 p-3",
        overLimit && "border-amber-400/60",
      )}
    >
      <LaneHeader lane={lane} count={tasks.length} onAdd={onAdd} />
      <div className={LANE_TASK_LIST_CLASS}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={onOpen}
            onComplete={onComplete}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function LaneColumn({
  lane,
  tasks,
  onOpen,
  onComplete,
  onDelete,
  onAdd,
}: {
  lane: RoadmapLane;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAdd: (lane: RoadmapLane) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  const overLimit = lane === "now" && tasks.length >= NOW_WIP_LIMIT;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex flex-1 flex-col rounded-xl border bg-muted/30 p-3",
        isOver && "ring-2 ring-ring/40",
        overLimit && "border-amber-400/60",
      )}
    >
      <LaneHeader lane={lane} count={tasks.length} onAdd={onAdd} />
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={LANE_TASK_LIST_CLASS}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onOpen={onOpen}
              onComplete={onComplete}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

export function RoadmapBoard({
  project,
  initialTasks,
  historyTasks,
  projects,
}: {
  project: Project;
  initialTasks: Task[];
  historyTasks: Task[];
  projects: Project[];
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [tasks, setTasks] = useState(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureLane, setCaptureLane] = useState<RoadmapLane>("now");

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  function openCreateInLane(lane: RoadmapLane) {
    setCaptureLane(lane);
    setCaptureOpen(true);
  }

  async function completeTask(task: Task) {
    if (!confirm(`将「${task.title}」标记为完成，并移入历史？`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane: "done" }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "完成失败");
      return;
    }
    router.refresh();
  }

  async function deleteTask(task: Task) {
    if (!confirm(`确定删除「${task.title}」？此操作不可恢复。`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "删除失败");
      return;
    }
    router.refresh();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<RoadmapLane, Task[]> = { now: [], next: [], later: [] };
    for (const task of tasks) {
      if (task.lane === "now" || task.lane === "next" || task.lane === "later") {
        map[task.lane].push(task);
      }
    }
    for (const lane of ROADMAP_LANES) {
      map[lane].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [tasks]);

  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    const current = tasks.find((t) => t.id === activeTaskId);
    if (!current) return;

    let targetLane: Lane =
      ROADMAP_LANES.includes(overId as RoadmapLane)
        ? (overId as RoadmapLane)
        : (tasks.find((t) => t.id === overId)?.lane as Lane) || current.lane;

    if (!ROADMAP_LANES.includes(targetLane as RoadmapLane)) {
      targetLane = current.lane;
    }

    const sourceLane = current.lane as RoadmapLane;
    const sourceList = [...grouped[sourceLane]];
    const targetList =
      sourceLane === targetLane ? sourceList : [...grouped[targetLane as RoadmapLane]];

    const oldIndex = sourceList.findIndex((t) => t.id === activeTaskId);
    let newIndex = targetList.findIndex((t) => t.id === overId);
    if (newIndex < 0) newIndex = targetList.length;

    if (
      targetLane === "now" &&
      sourceLane !== "now" &&
      grouped.now.length >= NOW_WIP_LIMIT
    ) {
      alert(`Now 列已达 WIP 上限（${NOW_WIP_LIMIT}）。先完成或移出一项再继续。`);
      return;
    }

    let nextTasks = [...tasks];

    if (sourceLane === targetLane) {
      const ordered = arrayMove(sourceList, oldIndex, newIndex);
      nextTasks = nextTasks.map((t) => {
        const idx = ordered.findIndex((x) => x.id === t.id);
        if (idx >= 0) return { ...t, sortOrder: idx };
        return t;
      });
    } else {
      const moving = { ...current, lane: targetLane, sortOrder: newIndex };
      const without = sourceList.filter((t) => t.id !== activeTaskId);
      const inserted = [...targetList];
      inserted.splice(newIndex, 0, moving);

      nextTasks = nextTasks.map((t) => {
        if (t.id === moving.id) return moving;
        const sIdx = without.findIndex((x) => x.id === t.id);
        if (sIdx >= 0) return { ...t, lane: sourceLane, sortOrder: sIdx };
        const tIdx = inserted.findIndex((x) => x.id === t.id);
        if (tIdx >= 0) return { ...t, lane: targetLane, sortOrder: tIdx };
        return t;
      });
    }

    setTasks(nextTasks);

    const payload = nextTasks
      .filter((t) => ROADMAP_LANES.includes(t.lane as RoadmapLane))
      .map((t) => ({
        id: t.id,
        lane: t.lane,
        sortOrder: t.sortOrder,
        projectId: project.id,
      }));

    const res = await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: payload }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "排序保存失败");
      setTasks(initialTasks);
      return;
    }

    router.refresh();
  }

  function openTask(task: Task) {
    setSelected(task);
    setModalOpen(true);
  }

  return (
    <>
      {mounted ? (
        <DndContext
          id="roadmap-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {ROADMAP_LANES.map((lane) => (
              <LaneColumn
                key={lane}
                lane={lane}
                tasks={grouped[lane]}
                onOpen={openTask}
                onComplete={completeTask}
                onDelete={deleteTask}
                onAdd={openCreateInLane}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <TaskCard task={activeTask} dragging onOpen={() => undefined} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {ROADMAP_LANES.map((lane) => (
            <StaticLaneColumn
              key={lane}
              lane={lane}
              tasks={grouped[lane]}
              onOpen={openTask}
              onComplete={completeTask}
              onDelete={deleteTask}
              onAdd={openCreateInLane}
            />
          ))}
        </div>
      )}

      <HistoryPanel tasks={historyTasks} projects={projects} />

      <TaskModal
        task={selected}
        projects={projects}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      <InboxCapture
        projects={projects}
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        defaultProjectId={project.id}
        defaultLane={captureLane}
      />
    </>
  );
}
