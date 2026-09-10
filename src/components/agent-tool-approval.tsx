"use client";

import { Check, LoaderCircle, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ActionAffects,
  ActionPreview,
  AgentToolScope,
} from "@/lib/agent-tools-types";
import { isAgentToolName, toolNameFromPartType } from "@/lib/agent-tools-types";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  createMemoryNote: "创建长期笔记",
  updateMemoryNote: "更新长期笔记",
  deleteMemoryNote: "删除长期笔记",
  createTask: "创建任务",
  updateTask: "更新任务",
  completeTask: "完成任务",
  deleteTask: "删除任务",
  reorderProjects: "调整项目顺序",
  moveProjectToPiggyBank: "移入项目储蓄罐",
  restoreProjectFromPiggyBank: "移出项目储蓄罐",
  createSkillFolder: "创建技能目录",
  updateSkillFolder: "重命名技能目录",
  deleteSkillFolder: "删除技能目录",
  createSkill: "创建技能",
  updateSkill: "更新技能",
  deleteSkill: "删除技能",
  getSkill: "加载技能",
  createRuleFolder: "创建规则目录",
  updateRuleFolder: "重命名规则目录",
  deleteRuleFolder: "删除规则目录",
  createRule: "创建规则",
  updateRule: "更新规则",
  deleteRule: "删除规则",
  getRule: "加载规则",
};

const READ_ONLY_TOOLS = new Set(["getSkill", "getRule"]);

function affectsFromToolName(toolName: string): ActionAffects | null {
  if (READ_ONLY_TOOLS.has(toolName)) return null;
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

function toolDisplayLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

function skillNameFromOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const skill = (output as { skill?: { name?: string } }).skill;
  if (skill?.name?.trim()) return skill.name.trim();
  const rule = (output as { rule?: { name?: string } }).rule;
  if (rule?.name?.trim()) return rule.name.trim();
  return null;
}

/** Any tool UI part from the model (mutating or read-only). */
export function isAgentToolPart(part: { type: string }): boolean {
  if (part.type === "dynamic-tool") return true;
  return part.type.startsWith("tool-");
}

/**
 * Mark every pending tool approval as rejected.
 * Used when the user sends a new message instead of clicking 通过/拒绝 —
 * avoids MissingToolResultsError from incomplete approvals.
 */
export function rejectPendingApprovalsInMessages<
  T extends { role: string; parts: ToolPartLike[] },
>(messages: T[]): T[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (
        !isAgentToolPart(part) ||
        part.state !== "approval-requested" ||
        !part.approval?.id
      ) {
        return part;
      }
      changed = true;
      return {
        ...part,
        state: "approval-responded",
        approval: {
          ...part.approval,
          approved: false,
          reason: "用户发送了新消息，未确认的操作已自动拒绝",
        },
      };
    });
    return changed ? { ...message, parts } : message;
  });
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
  const label = toolDisplayLabel(toolName);
  const readOnly = READ_ONLY_TOOLS.has(toolName);
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const appliedNotified = useRef<string | null>(null);

  useEffect(() => {
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
    const affects = affectsFromToolName(toolName);
    if (!affects) return;
    if (appliedNotified.current === part.toolCallId) return;
    appliedNotified.current = part.toolCallId;
    onApplied(affects);
  }, [part.state, part.toolCallId, toolName, onApplied]);

  const awaiting =
    part.state === "approval-requested" && !part.approval?.isAutomatic;
  const denied = part.state === "output-denied";
  const applied = part.state === "output-available";
  const errored = part.state === "output-error";
  const responded = part.state === "approval-responded";
  const preparing =
    part.state === "input-streaming" || part.state === "input-available";
  const loadedName = skillNameFromOutput(part.output);

  if (preparing) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        <Wrench className="size-3.5 shrink-0" />
        <span>
          正在调用 <span className="font-medium text-foreground">{label}</span>
          …
        </span>
      </div>
    );
  }

  // Compact card for read-only tools (getSkill / getRule)
  if (readOnly) {
    return (
      <div
        className={cn(
          "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
          errored
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : applied
              ? "border-border bg-background/80 text-muted-foreground"
              : "border-border bg-background/70 text-muted-foreground",
        )}
      >
        <Wrench className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p>
            调用了{" "}
            <span className="font-medium text-foreground">{label}</span>
            <span className="ml-1 font-mono text-[10px] opacity-70">
              {toolName}
            </span>
          </p>
          {loadedName ? (
            <p className="mt-0.5 text-foreground/80">
              {toolName === "getRule" ? "规则" : "技能"}：{loadedName}
            </p>
          ) : null}
          {errored ? (
            <p className="mt-0.5">{part.errorText || "执行失败"}</p>
          ) : null}
        </div>
        {applied ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" />
            已加载
          </span>
        ) : null}
      </div>
    );
  }

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
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Wrench className="size-3" />
            {awaiting ? "待确认变更" : "调用工具"}
          </p>
          <p className="mt-0.5 font-medium">
            {preview?.actionLabel ?? label}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {toolName}
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
            : part.approval?.reason?.includes("新消息")
              ? "未确认，已随新消息自动拒绝"
              : "已拒绝，等待顾问回复…"}
        </p>
      ) : null}
    </div>
  );
}
