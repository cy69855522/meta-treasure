import { notFound } from "next/navigation";
import {
  ensureProjectAgent,
  getProject,
  listAgentMemoryNotes,
  listAgentMessagesPage,
  listProjects,
  listTasks,
} from "@/lib/db";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { ProjectAgentPanel } from "@/components/project-agent-panel";
import { RoadmapBoard } from "@/components/roadmap-board";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Params) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  ensureProjectAgent(id);
  const projects = listProjects();
  const tasks = listTasks({ projectId: id }).filter((t) =>
    ["now", "next", "later", "done"].includes(t.lane),
  );
  const historyPage = listAgentMessagesPage(id, {
    limit: CHAT_HISTORY_PAGE_SIZE,
  });
  const agentNotes = listAgentMemoryNotes(id);

  return (
    <ProjectAgentPanel
      projectId={project.id}
      projectName={project.name}
      projectColor={project.color}
      projectDescription={project.description}
      initialMessages={historyPage.messages}
      initialHasMore={historyPage.hasMore}
      initialNotes={agentNotes}
    >
      <RoadmapBoard
        project={project}
        initialTasks={tasks.filter((t) => t.lane !== "done")}
        historyTasks={tasks.filter((t) => t.lane === "done")}
        projects={projects}
      />
    </ProjectAgentPanel>
  );
}
