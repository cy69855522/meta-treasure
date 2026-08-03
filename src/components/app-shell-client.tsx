"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { InboxCapture } from "@/components/inbox-capture";

export function AppShellClient({
  projects,
  inboxCount,
  children,
}: {
  projects: Project[];
  inboxCount: number;
  children: React.ReactNode;
}) {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Sidebar
        projects={projects}
        inboxCount={inboxCount}
        onOpenCapture={() => setCaptureOpen(true)}
      >
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      </Sidebar>
      <InboxCapture
        projects={projects}
        open={captureOpen}
        onOpenChange={setCaptureOpen}
      />
    </div>
  );
}
