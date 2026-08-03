import { notFound } from "next/navigation";
import { getProject, listProjects, listTasks } from "@/lib/db";
import { RoadmapBoard } from "@/components/roadmap-board";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Params) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const projects = listProjects();
  const tasks = listTasks({ projectId: id }).filter((t) =>
    ["now", "next", "later", "done"].includes(t.lane),
  );

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Project
            </p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {project.description ||
              "用 Now / Next / Later 管理节奏，淡化硬性时间线。"}
          </p>
        </div>
      </header>

      <RoadmapBoard
        project={project}
        initialTasks={tasks.filter((t) => t.lane !== "done")}
        historyTasks={tasks.filter((t) => t.lane === "done")}
        projects={projects}
      />
    </div>
  );
}
