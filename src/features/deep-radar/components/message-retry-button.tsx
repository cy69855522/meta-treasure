import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MessageRetryButton({
  disabled,
  onRetry,
  className,
  tone = "default",
  keepMessage = true,
}: {
  disabled?: boolean;
  onRetry: () => void | Promise<void>;
  className?: string;
  tone?: "default" | "onPrimary";
  keepMessage?: boolean;
}) {
  const title = keepMessage ? "重新回答此问题" : "重新生成这条回答";
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
      title={title}
      aria-label={title}
      onClick={() => {
        if (
          !window.confirm(
            keepMessage
              ? "将删除此消息之后的全部对话，并让研究节点重新回答。此操作不可撤销，是否继续？"
              : "将删除这条回答及之后的全部对话，并重新生成。若仍在研究流程中会接着往下跑。此操作不可撤销，是否继续？",
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
