import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MessageRewindButton({
  disabled,
  onRewind,
  className,
  tone = "default",
  restoreToComposer = true,
}: {
  disabled?: boolean;
  onRewind: () => void | Promise<void>;
  className?: string;
  tone?: "default" | "onPrimary";
  /** 用户消息：收回输入框；助手消息：删后自动重跑流程 */
  restoreToComposer?: boolean;
}) {
  const title = restoreToComposer ? "返回这条提问" : "撤销这条回答并继续流程";
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
            restoreToComposer
              ? "将停止当前推理，删除这条消息及之后的全部对话，并把提问放回输入框。此操作不可撤销，是否继续？"
              : "将停止当前推理，删除这条回答及之后的全部对话，并自动从该节点继续研究流程。此操作不可撤销，是否继续？",
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
