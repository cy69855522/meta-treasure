"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MessageRewindButton({
  disabled,
  onRewind,
  className,
  tone = "default",
}: {
  disabled?: boolean;
  onRewind: () => void | Promise<void>;
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
      title="撤回到此消息发出前"
      aria-label="撤回到此消息发出前"
      onClick={() => {
        if (
          !window.confirm(
            "将删除这条消息及之后的全部对话，恢复到发出前的状态。此操作不可撤销，是否继续？",
          )
        ) {
          return;
        }
        void onRewind();
      }}
    >
      <Undo2 />
    </Button>
  );
}
