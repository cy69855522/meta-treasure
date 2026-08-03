import { listProjects, listTasks } from "@/lib/db";
import { AppShellClient } from "@/components/app-shell-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const projects = listProjects();
  const inboxCount = listTasks({ inboxOnly: true }).length;

  return (
    <AppShellClient projects={projects} inboxCount={inboxCount}>
      {children}
    </AppShellClient>
  );
}
