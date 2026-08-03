"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lane, Project } from "@/lib/types";
import { LANE_LABELS, ROADMAP_LANES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CaptureLane = "inbox" | "now" | "next" | "later";

const CAPTURE_LANES: CaptureLane[] = ["inbox", ...ROADMAP_LANES];

export function InboxCapture({
  projects,
  open,
  onOpenChange,
}: {
  projects: Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [lane, setLane] = useState<CaptureLane>("inbox");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setProjectId("");
    setLane("inbox");
    setSaving(false);
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editing =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable ||
        target?.closest("[contenteditable='true']");

      if (editing) return;

      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        onOpenChange(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  const needsProject = lane !== "inbox";
  const canSubmit =
    Boolean(title.trim()) && (!needsProject || Boolean(projectId));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    if (needsProject && !projectId) {
      alert("放入 Now / Next / Later 前请先选择项目。");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          lane: lane as Lane,
          projectId: projectId || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "创建失败");
      }
      setTitle("");
      setProjectId("");
      setLane("inbox");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  const submitLabel =
    lane === "inbox"
      ? "放入收件箱"
      : `放入 ${lane === "now" ? "Now" : lane === "next" ? "Next" : "Later"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>快速捕捉灵感</DialogTitle>
          <DialogDescription>
            默认放进收件箱；也可直接丢进某个项目的 Now / Next / Later。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder="例如：突发一个漫剧分镜想法…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              放到
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={lane}
                onChange={(e) => setLane(e.target.value as CaptureLane)}
              >
                {CAPTURE_LANES.map((value) => (
                  <option key={value} value={value}>
                    {LANE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              项目{needsProject ? "（必选）" : "（可选）"}
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">
                  {needsProject ? "请选择项目" : "暂不关联项目"}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {needsProject ? (
            <p className="text-xs text-muted-foreground">
              直接放入路线图时必须关联项目；若 Now 已满 3 项会提示失败。
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? "保存中…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
