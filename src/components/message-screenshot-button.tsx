"use client";

import { Camera, Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toBlob } from "html-to-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Screenshot a message bubble's DOM to a PNG and write it to the system
 * clipboard. Mirrors `MessageCopyButton` in shape and `tone` handling.
 *
 * Browser support:
 * - Chromium-based and Firefox 127+ accept `ClipboardItem` with image/png
 *   out of the box, so this is the happy path.
 * - Safari (incl. iOS Safari 18+) supports image blobs on the clipboard
 *   but only when the write is triggered by a user gesture (button click
 *   is one) and the document is focused.
 *
 * Any failure (DOM gone, CORS image, missing permission, browser refuses
 * `ClipboardItem`) is surfaced via `window.alert` — same pattern as the
 * rewind / retry buttons. We intentionally do NOT fall back to a download,
 * because the user asked for clipboard-only and asked for a clear error.
 */
export function MessageScreenshotButton({
  targetRef,
  className,
  tone = "default",
  filename = "message.png",
}: {
  /** Ref to the DOM node that should be captured (typically the bubble). */
  targetRef: React.RefObject<HTMLElement | null>;
  className?: string;
  /** On primary (user) bubbles, use inverted muted colors. */
  tone?: "default" | "onPrimary";
  /** Suggested filename used only when a fallback copy is needed. */
  filename?: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "done" && state !== "error") return;
    const timer = window.setTimeout(() => {
      setState("idle");
      setErrorMessage(null);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [state]);

  const handleClick = useCallback(async () => {
    const node = targetRef.current;
    if (!node) {
      setState("error");
      setErrorMessage("消息节点已不在页面上，无法截图");
      window.alert("消息节点已不在页面上，无法截图");
      return;
    }

    if (typeof window.ClipboardItem === "undefined") {
      const msg = "当前浏览器不支持把图片写入剪贴板";
      setState("error");
      setErrorMessage(msg);
      window.alert(msg);
      return;
    }

    if (!navigator.clipboard || typeof navigator.clipboard.write !== "function") {
      const msg = "当前浏览器没有剪贴板写入权限，无法截图";
      setState("error");
      setErrorMessage(msg);
      window.alert(msg);
      return;
    }

    setState("working");
    setErrorMessage(null);

    try {
      const blob = await toBlob(node, {
        cacheBust: true,
        // Inline external images (e.g. message images) so the screenshot
        // renders the same content the user sees in the bubble.
        backgroundColor: getComputedBackgroundColor(node),
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        // Skip elements that are visually the screenshot button itself or
        // the copy/retry/rewind row — we don't want chrome in the picture.
        filter: (el) => {
          if (!(el instanceof HTMLElement)) return true;
          if (el.dataset?.screenshotExclude === "1") return false;
          return true;
        },
      });

      if (!blob) {
        throw new Error("截图生成失败（空结果）");
      }
      if (blob.type !== "image/png") {
        // toBlob should already be image/png, but be explicit.
        throw new Error(`截图类型异常：${blob.type || "未知"}`);
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      setState("done");
      // Touch the filename so it is not flagged as unused by linters when
      // we eventually surface it in a fallback path. Currently unused
      // because the user explicitly asked for clipboard-only behavior.
      void filename;
    } catch (err) {
      const raw =
        err instanceof Error && err.message
          ? err.message
          : typeof err === "string"
            ? err
            : "未知错误";
      setState("error");
      setErrorMessage(raw);
      window.alert(`截图失败：${raw}`);
    }
  }, [targetRef, filename]);

  const Icon =
    state === "done" ? Check : state === "error" ? X : state === "working" ? Camera : Camera;
  const title =
    state === "done"
      ? "已复制截图"
      : state === "error"
        ? (errorMessage ?? "截图失败")
        : "截图并复制到剪贴板";
  const ariaLabel = title;

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      disabled={state === "working"}
      className={cn(
        "shrink-0 opacity-60 hover:opacity-100",
        tone === "onPrimary"
          ? "text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
          : "text-muted-foreground",
        className,
      )}
      title={title}
      aria-label={ariaLabel}
      data-screenshot-exclude="1"
      onClick={() => {
        void handleClick();
      }}
    >
      <Icon
        className={cn(
          state === "working" && "animate-pulse",
        )}
      />
    </Button>
  );
}

function getComputedBackgroundColor(node: HTMLElement): string {
  let el: HTMLElement | null = node;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      return bg;
    }
    el = el.parentElement;
  }
  // Fall back to the page background so transparent gaps render sensibly.
  if (typeof document !== "undefined") {
    return getComputedStyle(document.body).backgroundColor || "#ffffff";
  }
  return "#ffffff";
}
