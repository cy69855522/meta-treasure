"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank } from "lucide-react";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PiggyBankDialog({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function restore(projectId: string) {
    setBusyId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/piggy-bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inPiggyBank: false }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "移出失败");
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "移出失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,48rem)] min-h-[min(70vh,32rem)] w-[calc(100%-2rem)] max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-4" />
            项目储蓄罐
          </DialogTitle>
          <DialogDescription>
            暂存不做的项目。移出后会出现在侧边栏项目列表末尾。
          </DialogDescription>
        </DialogHeader>

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">储蓄罐是空的。</p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  {project.description ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busyId === project.id}
                  onClick={() => void restore(project.id)}
                >
                  {busyId === project.id ? "移出中…" : "移出"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
