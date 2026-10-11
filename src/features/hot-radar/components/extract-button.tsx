"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useState } from "react";

export function ExtractButton({
  title,
  url,
  text,
  error,
}: {
  title: string;
  url: string;
  text: string | null;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ready = Boolean(text || error);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={!ready}
        onClick={() => setOpen(true)}
        aria-label={ready ? `查看 ${title}` : `${title} 的正文还没提取`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
      >
        <FileText className="size-4" />
      </button>
      {open && ready ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="提取结果"
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border bg-background shadow-lg"
          >
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">提取结果</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">{title}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭弹窗"
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm leading-6">
              <p className="mb-3 break-all text-xs text-muted-foreground">{url}</p>
              {text ? <p className="whitespace-pre-wrap">{text}</p> : <p>{error}</p>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
