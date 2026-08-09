"use client";

import dynamic from "next/dynamic";

const TaskEditorInner = dynamic(() => import("./task-editor-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[280px] items-center justify-center rounded-lg border text-sm text-muted-foreground">
      编辑器加载中…
    </div>
  ),
});

export function TaskEditor({
  content,
  onChange,
  editorKey,
  className,
  minHeightClassName = "min-h-[280px]",
}: {
  content: string;
  onChange: (json: string) => void;
  editorKey: string;
  className?: string;
  minHeightClassName?: string;
}) {
  return (
    <TaskEditorInner
      key={editorKey}
      initialContent={content}
      onChange={onChange}
      className={className}
      minHeightClassName={minHeightClassName}
    />
  );
}
