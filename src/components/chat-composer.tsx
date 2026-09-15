"use client";

import { ImagePlus, LoaderCircle, SendHorizontal, Sparkles, X } from "lucide-react";
import Image from "next/image";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { activeSkillCommand } from "@/lib/skill-commands";
import { cn } from "@/lib/utils";
import type { MessageImage } from "@/lib/types";

type SkillOption = {
  id: string;
  name: string;
  command: string;
  description: string;
  folderName: string;
  lastUsedAt: string | null;
};

type Props = {
  id: string;
  name: string;
  placeholder: string;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  scope: string;
  onSubmit: (message: { text: string; images: MessageImage[] }) => void;
};

export type ChatComposerHandle = {
  /** Append text into the draft box (with a blank line if draft already has content). */
  appendDraft: (text: string) => void;
};

/**
 * Owns draft text locally so keystrokes do not re-render the message list
 * (and re-parse every ChatMarkdown) in the parent chat panel.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, Props>(
  function ChatComposer(
    {
      id,
      name,
      placeholder,
      disabled = false,
      textareaRef,
      scope,
      onSubmit,
    },
    ref,
  ) {
    const [input, setInput] = useState("");
    const [cursor, setCursor] = useState(0);
    const [skills, setSkills] = useState<SkillOption[]>([]);
    const [skillMenuOpen, setSkillMenuOpen] = useState(false);
    const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
    const [loadingSkills, setLoadingSkills] = useState(false);
    const [images, setImages] = useState<MessageImage[]>([]);
    const [uploading, setUploading] = useState(false);
    const [imageError, setImageError] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({
      appendDraft(text: string) {
        const trimmed = text.trim();
        if (!trimmed) return;
        let nextValue = trimmed;
        setInput((prev) => {
          const base = prev.trimEnd();
          nextValue = base ? `${base}\n\n${trimmed}` : trimmed;
          return nextValue;
        });
        window.setTimeout(() => {
          const node = internalTextareaRef.current;
          if (!node) return;
          node.focus();
          const end = nextValue.length;
          node.setSelectionRange(end, end);
          setCursor(end);
        }, 0);
      },
    }));

    const loadSkills = useCallback(async () => {
      setLoadingSkills(true);
      try {
        const response = await fetch("/api/skills", { cache: "no-store" });
        const data = (await response.json()) as { skills?: SkillOption[] };
        if (response.ok) setSkills(data.skills || []);
      } finally {
        setLoadingSkills(false);
      }
    }, []);

    const slashCommand = useMemo(
      () => activeSkillCommand(input, cursor),
      [input, cursor],
    );
    const matchingSkills = useMemo(() => {
      const query = slashCommand?.query.toLocaleLowerCase() || "";
      if (!query) return skills;
      return skills.filter((skill) =>
        `${skill.command} ${skill.name} ${skill.description}`
          .toLocaleLowerCase()
          .includes(query),
      );
    }, [skills, slashCommand?.query]);

    function completeSkill(skill: SkillOption) {
      if (!slashCommand) return;
      const insertion = `/${skill.command} `;
      const nextInput =
        input.slice(0, slashCommand.slash) + insertion + input.slice(cursor);
      const nextCursor = slashCommand.slash + insertion.length;
      setInput(nextInput);
      setCursor(nextCursor);
      setSkillMenuOpen(false);
      requestAnimationFrame(() => {
        internalTextareaRef.current?.focus();
        internalTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    }

    function submit(e?: React.FormEvent) {
      e?.preventDefault();
      const text = input.trim();
      if ((!text && !images.length) || disabled || uploading) return;
      onSubmit({ text, images });
      setInput("");
      setImages([]);
      setCursor(0);
      setSkillMenuOpen(false);
    }

    async function upload(files: File[]) {
      const available = 9 - images.length;
      if (!available) {
        setImageError("每条消息最多 9 张图片");
        return;
      }
      const selected = files
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, available);
      if (!selected.length) return;
      if (files.length > available) setImageError("每条消息最多 9 张图片");
      else setImageError("");
      const body = new FormData();
      selected.forEach((file) => body.append("images", file));
      setUploading(true);
      try {
        const response = await fetch(`/api/codex/${scope}/images`, {
          method: "POST",
          body,
        });
        const data = (await response.json()) as {
          images?: MessageImage[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "图片上传失败");
        setImages((current) =>
          [...current, ...(data.images || [])].slice(0, 9),
        );
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "图片上传失败");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }

    return (
      <form
        onSubmit={submit}
        className="border-t border-border px-6 py-4 md:px-10"
      >
        {images.length ? (
          <div className="mx-auto mb-2 flex max-w-6xl flex-wrap gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
              >
                <Image
                  src={image.url}
                  alt={image.name}
                  fill
                  sizes="64px"
                  unoptimized
                  className="object-cover"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    setImages((current) =>
                      current.filter((item) => item.id !== image.id),
                    )
                  }
                  aria-label={`移除 ${image.name}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {imageError ? (
          <p className="mx-auto mb-2 max-w-6xl text-xs text-destructive">
            {imageError}
          </p>
        ) : null}
        <div className="relative mx-auto flex max-w-6xl items-start gap-3">
          {skillMenuOpen && slashCommand ? (
            <div
              className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
              role="listbox"
              aria-label="选择技能"
            >
              <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" />
                <span className="flex-1">选择本轮要使用的技能</span>
                <span>↑↓ 选择 · Enter 补全</span>
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5">
                {loadingSkills && skills.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    加载技能…
                  </div>
                ) : matchingSkills.length ? (
                  matchingSkills.map((skill, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === selectedSkillIndex}
                      key={skill.id}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left",
                        index === selectedSkillIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted",
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        completeSkill(skill);
                      }}
                      onMouseEnter={() => setSelectedSkillIndex(index)}
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-primary">
                        /{skill.command}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {skill.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {skill.folderName}
                          {skill.description ? ` · ${skill.description}` : ""}
                        </span>
                      </span>
                      {skill.lastUsedAt ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          最近使用
                        </span>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    没有匹配的技能
                  </p>
                )}
              </div>
            </div>
          ) : null}
          <Textarea
            id={id}
            name={name}
            ref={(node) => {
              internalTextareaRef.current = node;
              if (textareaRef) textareaRef.current = node;
            }}
            value={input}
            onChange={(e) => {
              const nextCursor =
                e.target.selectionStart ?? e.target.value.length;
              const command = activeSkillCommand(e.target.value, nextCursor);
              setInput(e.target.value);
              setCursor(nextCursor);
              setSelectedSkillIndex(0);
              setSkillMenuOpen(Boolean(command));
              if (command && !skillMenuOpen) void loadSkills();
            }}
            onClick={(e) =>
              setCursor(e.currentTarget.selectionStart ?? input.length)
            }
            onSelect={(e) =>
              setCursor(e.currentTarget.selectionStart ?? input.length)
            }
            placeholder={placeholder}
            className="min-h-28 flex-1 resize-y text-base leading-relaxed md:min-h-32"
            disabled={disabled}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.items)
                .filter(
                  (item) =>
                    item.kind === "file" && item.type.startsWith("image/"),
                )
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file));
              if (files.length) void upload(files);
            }}
            onKeyDown={(e) => {
              if (skillMenuOpen && slashCommand) {
                if (e.key === "ArrowDown" && matchingSkills.length) {
                  e.preventDefault();
                  setSelectedSkillIndex(
                    (index) => (index + 1) % matchingSkills.length,
                  );
                  return;
                }
                if (e.key === "ArrowUp" && matchingSkills.length) {
                  e.preventDefault();
                  setSelectedSkillIndex(
                    (index) =>
                      (index - 1 + matchingSkills.length) %
                      matchingSkills.length,
                  );
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && matchingSkills.length) {
                  e.preventDefault();
                  completeSkill(
                    matchingSkills[
                      Math.min(selectedSkillIndex, matchingSkills.length - 1)
                    ],
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSkillMenuOpen(false);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex shrink-0 flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) =>
                void upload(Array.from(event.target.files || []))
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading || images.length >= 9}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus />
              {uploading ? "上传中" : `图片 ${images.length}/9`}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={disabled || uploading || (!input.trim() && !images.length)}
            >
              <SendHorizontal />
              发送
            </Button>
          </div>
        </div>
      </form>
    );
  },
);
