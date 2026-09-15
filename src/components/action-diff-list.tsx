"use client";

import type { ActionDiff } from "@/lib/agent-tools-types";
import { cn } from "@/lib/utils";

function hasValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Create previews only have "after"; update previews show before → after;
 * delete previews only have "before". Avoids rows of useless「（无）」.
 */
export function ActionDiffList({
  diffs,
  className,
}: {
  diffs: ActionDiff[];
  className?: string;
}) {
  if (diffs.length === 0) return null;

  return (
    <div className={cn("mt-3 space-y-2 rounded-lg bg-muted/50 p-3", className)}>
      {diffs.map((diff) => {
        const before = hasValue(diff.before) ? diff.before : null;
        const after = hasValue(diff.after) ? diff.after : null;
        return (
          <div key={`${diff.field}-${diff.before}-${diff.after}`} className="text-[11px]">
            <p className="font-semibold text-muted-foreground">{diff.field}</p>
            {before && after ? (
              <div className="mt-1 space-y-0.5">
                <p className="whitespace-pre-wrap break-words text-rose-700 line-through decoration-rose-700/40 dark:text-rose-300">
                  {before}
                </p>
                <p className="whitespace-pre-wrap break-words text-emerald-700 dark:text-emerald-300">
                  {after}
                </p>
              </div>
            ) : after ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-emerald-700 dark:text-emerald-300">
                {after}
              </p>
            ) : before ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-rose-700 line-through decoration-rose-700/40 dark:text-rose-300">
                {before}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">（无变更）</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
