"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MessageRetryButton({
  disabled,
  onRetry,
  className,
  tone = "default",
}: {
  disabled?: boolean;
  onRetry: () => void | Promise<void>;
  className?: string;
  /** On primary (user) bubbles, use inverted muted colors. */
  tone?: "default" | "onPrimary";
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className={cn(
        "shrink-0 opacity-60 hover:opacity-100",
        tone === "onPrimary"
          ? "text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
          : "text-muted-foreground",
        className,
      )}
      disabled={disabled}
      title="重新回答此问题"
      aria-label="重新回答此问题"
      onClick={() => {
        if (
          !window.confirm(
            "将删除此消息之后的全部对话，并让 Agent 重新回答。此操作不可撤销，是否继续？",
          )
        ) {
          return;
        }
        void onRetry();
      }}
    >
      <RotateCw />
    </Button>
  );
}
