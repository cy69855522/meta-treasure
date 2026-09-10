"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import { AgentChromeProvider } from "@/components/agent-chrome";
import { Sidebar } from "@/components/sidebar";
import { InboxCapture } from "@/components/inbox-capture";

export function AppShellClient({
  projects,
  piggyBankProjects,
  allProjects,
  inboxCount,
  children,
}: {
  projects: Project[];
  piggyBankProjects: Project[];
  allProjects: Project[];
  inboxCount: number;
  children: React.ReactNode;
}) {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <AgentChromeProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <Sidebar
          projects={projects}
          piggyBankProjects={piggyBankProjects}
          allProjects={allProjects}
          inboxCount={inboxCount}
          onOpenCapture={() => setCaptureOpen(true)}
        >
          <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
        </Sidebar>
        <InboxCapture
          projects={allProjects}
          open={captureOpen}
          onOpenChange={setCaptureOpen}
        />
      </div>
    </AgentChromeProvider>
  );
}
