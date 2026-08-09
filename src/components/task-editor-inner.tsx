"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

function subscribeDark(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getDarkSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerDarkSnapshot() {
  return false;
}

export default function TaskEditorInner({
  initialContent,
  onChange,
  className,
  minHeightClassName = "min-h-[280px]",
}: {
  initialContent: string;
  onChange: (json: string) => void;
  className?: string;
  minHeightClassName?: string;
}) {
  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(initialContent || "[]") as PartialBlock[];
      return Array.isArray(value) && value.length > 0 ? value : undefined;
    } catch {
      return undefined;
    }
  }, [initialContent]);

  const editor = useCreateBlockNote({
    initialContent: parsed,
  });

  const isDark = useSyncExternalStore(
    subscribeDark,
    getDarkSnapshot,
    getServerDarkSnapshot,
  );

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-background ${minHeightClassName} ${className ?? ""}`}
    >
      <BlockNoteView
        editor={editor}
        theme={isDark ? "dark" : "light"}
        onChange={() => {
          onChange(JSON.stringify(editor.document));
        }}
      />
    </div>
  );
}
