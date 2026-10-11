"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { displayCiteLabel, resolveReportLink } from "@/features/deep-radar/lib/cite-links";
import { SOURCE_TITLE } from "@/features/deep-radar/lib/settings-types";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";
import { cn } from "@/lib/utils";

type Listener = (link: ResearchLink | null) => void;

let current: ResearchLink | null = null;
const listeners = new Set<Listener>();

function emit(link: ResearchLink | null) {
  current = link;
  flushSync(() => {
    for (const listener of listeners) listener(current);
  });
}

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

export const citeChipClassName = cn(
  "relative -top-[0.18em] mx-0.5 inline-flex h-[1.4em] max-w-[5.75rem] items-center truncate align-middle rounded-[2px] px-1.5 text-[0.8em] font-medium leading-none no-underline",
  "bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-300",
  "hover:bg-sky-100 hover:ring-sky-300 hover:no-underline",
  "active:bg-sky-100",
  "dark:bg-sky-500/15 dark:text-sky-100 dark:ring-sky-500/40",
  "dark:hover:bg-sky-500/25 dark:active:bg-sky-500/25",
);

export function CiteTag({
  href,
  catalog,
  children,
}: {
  href: string;
  catalog: ResearchLink[];
  children: ReactNode;
}) {
  const link = resolveReportLink(href, catalog);
  const label = displayCiteLabel(nodeText(children), link);

  return (
    <button
      type="button"
      title={link.title}
      className={citeChipClassName}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        emit(link);
      }}
    >
      {label}
    </button>
  );
}

CiteTag.displayName = "CiteTag";

export function CiteDialogHost() {
  const [link, setLink] = useState<ResearchLink | null>(current);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const listener: Listener = (next) => setLink(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!link) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") emit(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [link]);

  if (!mounted || !link) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onClick={() => emit(null)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={link.title}
        className="max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-lg overflow-auto rounded-2xl border border-sky-200/70 bg-white/95 p-4 text-card-foreground shadow-[0_18px_50px_rgba(15,23,42,0.18)] dark:border-sky-500/25 dark:bg-zinc-900/95"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm font-medium leading-snug break-words">
              {link.title}
            </p>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="shrink-0"
              aria-label="关闭"
              onClick={() => emit(null)}
            >
              <X />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100"
            >
              {SOURCE_TITLE[link.source] ?? link.source}
            </Badge>
            {link.author ? (
              <span className="text-xs text-muted-foreground">{link.author}</span>
            ) : null}
            {link.publishedAt ? (
              <span className="text-xs text-muted-foreground">
                {link.publishedAt}
              </span>
            ) : null}
          </div>
          {link.reason ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {link.reason}
            </p>
          ) : null}
          {link.snippet ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {link.snippet}
            </p>
          ) : null}
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary underline"
          >
            打开原文
            <ExternalLink className="size-3.5" />
          </a>
      </div>
    </div>,
    document.body,
  );
}
