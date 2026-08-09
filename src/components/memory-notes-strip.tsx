"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type MemoryNoteLike = {
  id: string;
  title: string;
  body: string;
};

export function MemoryNotesStrip({
  notes,
  idPrefix,
  hint,
  savingNoteId,
  onAdd,
  onChange,
  onSave,
  onRemove,
}: {
  notes: MemoryNoteLike[];
  idPrefix: string;
  hint: string;
  savingNoteId: string | null;
  onAdd: () => void;
  onChange: (
    id: string,
    patch: Partial<Pick<MemoryNoteLike, "title" | "body">>,
  ) => void;
  onSave: (note: MemoryNoteLike) => void | Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);
  const prevCount = useRef(notes.length);

  useEffect(() => {
    if (notes.length === 0) {
      setActiveId(null);
      prevCount.current = 0;
      return;
    }
    if (notes.length > prevCount.current) {
      setActiveId(notes[notes.length - 1]!.id);
    } else if (!activeId || !notes.some((n) => n.id === activeId)) {
      setActiveId(notes[0]!.id);
    }
    prevCount.current = notes.length;
  }, [notes, activeId]);

  const active = notes.find((n) => n.id === activeId) ?? null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3 md:px-10">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {hint}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus />
          添加
        </Button>
      </div>

      {notes.length === 0 || !active ? (
        <p className="px-6 text-sm text-muted-foreground md:px-10">
          还没有长期笔记。
        </p>
      ) : (
        <>
          <div className="scrollbar-none shrink-0 overflow-x-auto px-6 md:px-10">
            <div className="flex w-max min-w-full gap-1.5 pb-3">
              {notes.map((note, index) => {
                const selected = note.id === active.id;
                const label = note.title.trim() || `笔记 ${index + 1}`;
                return (
                  <Button
                    key={note.id}
                    type="button"
                    size="sm"
                    variant={selected ? "secondary" : "ghost"}
                    className={cn(
                      "max-w-48 shrink-0 justify-start",
                      selected && "pointer-events-none",
                    )}
                    onClick={() => setActiveId(note.id)}
                    title={label}
                  >
                    <span className="truncate">{label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <article className="mx-6 mb-6 flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-background p-4 md:mx-10">
            <div className="flex shrink-0 items-center gap-2">
              <input
                id={`${idPrefix}-note-title-${active.id}`}
                name={`${idPrefix}-note-title-${active.id}`}
                className="h-9 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
                value={active.title}
                onChange={(e) =>
                  onChange(active.id, { title: e.target.value })
                }
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onRemove(active.id)}
                aria-label="删除笔记"
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              id={`${idPrefix}-note-body-${active.id}`}
              name={`${idPrefix}-note-body-${active.id}`}
              value={active.body}
              className="h-full min-h-0 flex-1 resize-none text-base leading-relaxed"
              onChange={(e) => onChange(active.id, { body: e.target.value })}
            />
            <div className="flex shrink-0 justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={savingNoteId === active.id}
                onClick={() => onSave(active)}
              >
                {savingNoteId === active.id ? "保存中…" : "保存"}
              </Button>
            </div>
          </article>
        </>
      )}
    </div>
  );
}
