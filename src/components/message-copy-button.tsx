"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MessageCopyButton({
  text,
  className,
  tone = "default",
}: {
  text: string;
  className?: string;
  /** On primary (user) bubbles, use inverted muted colors. */
  tone?: "default" | "onPrimary";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!text.trim()) return null;

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
      title={copied ? "已复制" : "复制内容"}
      aria-label={copied ? "已复制" : "复制内容"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => {
            /* ignore clipboard denial */
          },
        );
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
