"use client";

import { useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

export default function TaskEditorInner({
  initialContent,
  onChange,
}: {
  initialContent: string;
  onChange: (json: string) => void;
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

  return (
    <div className="min-h-[280px] overflow-hidden rounded-lg border bg-background">
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          onChange(JSON.stringify(editor.document));
        }}
      />
    </div>
  );
}
