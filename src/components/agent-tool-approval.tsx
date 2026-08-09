"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ActionAffects,
  ActionPreview,
  AgentToolScope,
} from "@/lib/agent-tools-types";
import { isAgentToolName, toolNameFromPartType } from "@/lib/agent-tools-types";
import { cn } from "@/lib/utils";

function affectsFromToolName(toolName: string): ActionAffects {
  if (
    toolName === "createMemoryNote" ||
    toolName === "updateMemoryNote" ||
    toolName === "deleteMemoryNote"
  ) {
    return "notes";
  }
  if (
    toolName === "reorderProjects" ||
    toolName === "moveProjectToPiggyBank" ||
    toolName === "restoreProjectFromPiggyBank"
  ) {
    return "projects";
  }
  if (
    toolName === "createSkillFolder" ||
    toolName === "updateSkillFolder" ||
    toolName === "deleteSkillFolder" ||
    toolName === "createSkill" ||
    toolName === "updateSkill" ||
    toolName === "deleteSkill"
  ) {
    return "skills";
  }
  if (
    toolName === "createRuleFolder" ||
    toolName === "updateRuleFolder" ||
    toolName === "deleteRuleFolder" ||
    toolName === "createRule" ||
    toolName === "updateRule" ||
    toolName === "deleteRule"
  ) {
    return "rules";
  }
  return "tasks";
}

type ToolPartLike = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
    isAutomatic?: boolean;
  };
};

function resolveToolName(part: ToolPartLike): string | null {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") {
    return part.toolName;
  }
  return toolNameFromPartType(part.type);
}

function formatCell(value: string | null): string {
  if (value === null) return "—";
  return value;
}

export function isAgentToolPart(part: { type: string }): boolean {
  if (part.type === "dynamic-tool") return true;
  const name = toolNameFromPartType(part.type);
  return name !== null && isAgentToolName(name);
}

export function AgentToolApprovalCard({
  part,
  scope,
  projectId,
  onRespond,
  onApplied,
}: {
  part: ToolPartLike;
  scope: AgentToolScope;
  projectId?: string;
  onRespond: (decision: { id: string; approved: boolean }) => void;
  onApplied?: (affects: ActionAffects) => void;
}) {
  const toolName = resolveToolName(part) ?? "unknown";
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const appliedNotified = useRef<string | null>(null);

  useEffect(() => {
    // Only snapshot before apply — after execute, DB already matches "after".
    if (part.state !== "approval-requested") return;
    if (!isAgentToolName(toolName)) return;

    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);

    fetch("/api/agent-tools/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        projectId,
        toolName,
        input: part.input ?? {},
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "预览加载失败");
        }
        return res.json() as Promise<{ preview: ActionPreview }>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data.preview);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreviewError(
            err instanceof Error ? err.message : "预览加载失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, projectId, toolName, part.state, part.input]);

  useEffect(() => {
    if (part.state !== "output-available" || !onApplied || !part.toolCallId) {
      return;
    }
    if (appliedNotified.current === part.toolCallId) return;
    appliedNotified.current = part.toolCallId;
    onApplied(affectsFromToolName(toolName));
  }, [part.state, part.toolCallId, toolName, onApplied]);

  if (
    part.state === "input-streaming" ||
    part.state === "input-available"
  ) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
        正在准备变更预览…
      </div>
    );
  }

  const awaiting =
    part.state === "approval-requested" && !part.approval?.isAutomatic;
  const denied = part.state === "output-denied";
  const applied = part.state === "output-available";
  const errored = part.state === "output-error";
  const responded = part.state === "approval-responded";

  return (
    <div
      className={cn(
        "mt-3 space-y-3 rounded-xl border px-3 py-3 text-sm",
        denied
          ? "border-destructive/40 bg-destructive/5"
          : applied
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border bg-background/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            待确认变更
          </p>
          <p className="mt-0.5 font-medium">
            {preview?.actionLabel ?? toolName}
          </p>
          {preview?.summary ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {preview.summary}
            </p>
          ) : null}
        </div>
        {applied ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" />
            已应用
          </span>
        ) : null}
        {denied ? (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <X className="size-3.5" />
            已拒绝
          </span>
        ) : null}
      </div>

      {loadingPreview ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          加载前后对比…
        </div>
      ) : null}

      {previewError ? (
        <p className="text-xs text-destructive">{previewError}</p>
      ) : null}

      {preview && preview.diffs.length > 0 ? (
        <ul className="space-y-2">
          {preview.diffs.map((diff) => (
            <li
              key={`${diff.field}-${diff.before}-${diff.after}`}
              className="rounded-lg bg-muted/60 px-2.5 py-2"
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                {diff.field}
              </p>
              <div className="mt-1 grid gap-1 text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                <p className="whitespace-pre-wrap break-words text-muted-foreground line-through decoration-muted-foreground/50">
                  {formatCell(diff.before)}
                </p>
                <span className="hidden text-muted-foreground sm:inline">
                  →
                </span>
                <p className="whitespace-pre-wrap break-words font-medium">
                  {formatCell(diff.after)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {errored ? (
        <p className="text-xs text-destructive">
          执行失败：{part.errorText || "未知错误"}
        </p>
      ) : null}

      {awaiting && part.approval?.id ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onRespond({ id: part.approval!.id, approved: true })
            }
          >
            通过并应用
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onRespond({ id: part.approval!.id, approved: false })
            }
          >
            拒绝
          </Button>
        </div>
      ) : null}

      {responded ? (
        <p className="text-xs text-muted-foreground">
          {part.approval?.approved
            ? "已确认，正在应用…"
            : "已拒绝，等待顾问回复…"}
        </p>
      ) : null}
    </div>
  );
}
