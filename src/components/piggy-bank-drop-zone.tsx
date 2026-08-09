"use client";

import { useDroppable } from "@dnd-kit/core";
import { PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIGGY_BANK_DROP_ID = "__piggy_bank__";

export function PiggyBankDropZone({
  collapsed,
  count,
  onOpen,
}: {
  collapsed: boolean;
  count: number;
  onOpen: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PIGGY_BANK_DROP_ID });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      className={cn(
        "mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-sm transition-colors",
        isOver
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
      title="项目储蓄罐：拖入项目暂存，点击管理"
      aria-label={`项目储蓄罐，${count} 个项目`}
    >
      <PiggyBank className="size-4 shrink-0" />
      {!collapsed ? (
        <>
          <span className="flex-1 truncate text-left">项目储蓄罐</span>
          {count > 0 ? (
            <span className="tabular-nums text-xs">{count}</span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}
