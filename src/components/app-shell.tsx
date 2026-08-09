import {
  listActiveProjects,
  listPiggyBankProjects,
  listProjects,
  listTasks,
} from "@/lib/db";
import { AppShellClient } from "@/components/app-shell-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const projects = listActiveProjects();
  const piggyBankProjects = listPiggyBankProjects();
  const allProjects = listProjects();
  const inboxCount = listTasks({ inboxOnly: true }).length;

  return (
    <AppShellClient
      projects={projects}
      piggyBankProjects={piggyBankProjects}
      allProjects={allProjects}
      inboxCount={inboxCount}
    >
      {children}
    </AppShellClient>
  );
}
