"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  SendHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentToolApprovalCard,
  isAgentToolPart,
} from "@/components/agent-tool-approval";
import { ChatMarkdown } from "@/components/chat-markdown";
import { MemoryNotesStrip } from "@/components/memory-notes-strip";
import { MessageRewindButton } from "@/components/message-rewind-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_PROMPT_MESSAGE_LIMIT } from "@/lib/constants";
import type { StewardMemoryNote, StewardMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

function toUIMessages(messages: StewardMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

function statusLabel(status: string): string | null {
  if (status === "submitted") return "已发送，等待模型推理…";
  if (status === "streaming") return "模型推理中，正在流式回复…";
  return null;
}

export function StewardPanel({
  initialMessages,
  initialNotes,
}: {
  initialMessages: StewardMessage[];
  initialNotes: StewardMemoryNote[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/steward/chat",
      }),
    [],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    clearError,
    stop,
    addToolApprovalResponse,
  } = useChat({
    id: "steward",
    messages: toUIMessages(initialMessages),
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const [rewinding, setRewinding] = useState(false);

  const refreshNotes = useCallback(async () => {
    const res = await fetch("/api/steward/notes");
    if (!res.ok) return;
    const data = (await res.json()) as { notes: StewardMemoryNote[] };
    setNotes(data.notes);
  }, []);

  const onToolApplied = useCallback(
    (affects: "notes" | "tasks" | "projects" | "skills" | "rules") => {
      if (affects === "notes") void refreshNotes();
      else router.refresh();
    },
    [router, refreshNotes],
  );

  const rewindToMessage = useCallback(
    async (index: number) => {
      const target = messages[index];
      if (!target) return;
      const userOrdinal =
        target.role === "user"
          ? messages
              .slice(0, index + 1)
              .filter((m) => m.role === "user").length - 1
          : undefined;
      setRewinding(true);
      clearError();
      stop();
      try {
        const res = await fetch("/api/steward/messages/rewind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: target.id,
            keepCount: index,
            userOrdinal,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "撤回失败");
        }
        const data = (await res.json()) as { messages: StewardMessage[] };
        setMessages(toUIMessages(data.messages));
      } catch (err) {
        console.error(err);
        window.alert(err instanceof Error ? err.message : "撤回失败");
      } finally {
        setRewinding(false);
      }
    },
    [messages, clearError, stop, setMessages],
  );

  const busy = status === "submitted" || status === "streaming" || rewinding;
  const thinkingLabel = statusLabel(status);

  useEffect(() => {
    if (tab !== "chat") return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab, status]);

  useEffect(() => {
    if (tab !== "chat") return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [tab]);

  async function addNote() {
    const res = await fetch("/api/steward/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新笔记", body: "" }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { note: StewardMemoryNote };
    setNotes((prev) => [...prev, data.note]);
  }

  async function saveNote(note: StewardMemoryNote) {
    setSavingNoteId(note.id);
    try {
      const res = await fetch(`/api/steward/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: note.title, body: note.body }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { note: StewardMemoryNote };
      setNotes((prev) => prev.map((n) => (n.id === note.id ? data.note : n)));
    } finally {
      setSavingNoteId(null);
    }
  }

  async function removeNote(noteId: string) {
    const res = await fetch(`/api/steward/notes/${noteId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) return;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  function submitChat(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    clearError();
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Steward · 总管家</p>
          <h1 className="mt-0.5 text-lg font-semibold">跨项目顾问</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            最近 {AGENT_PROMPT_MESSAGE_LIMIT}{" "}
            条对话 + 全局快照；变更需你确认后才会应用
          </p>
        </div>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-border px-6 py-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "chat" ? "secondary" : "ghost"}
          onClick={() => setTab("chat")}
        >
          <MessageSquare />
          对话
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "notes" ? "secondary" : "ghost"}
          onClick={() => setTab("notes")}
        >
          <NotebookPen />
          长期笔记
        </Button>
      </div>

      {tab === "chat" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 space-y-4 overflow-y-auto px-6 py-5 md:px-10">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                聊聊跨项目取舍、收件箱堆积或整体节奏；若提议改笔记/任务，会先给你预览确认。
              </div>
            ) : null}

            {messages.map((message, index) => {
              const isUser = message.role === "user";
              const isLast = index === messages.length - 1;
              const streamingHere =
                !isUser && isLast && status === "streaming";
              const reasoning = message.parts
                .filter(
                  (p): p is { type: "reasoning"; text: string } =>
                    p.type === "reasoning",
                )
                .map((p) => p.text)
                .join("");
              const text = message.parts
                .filter(
                  (p): p is { type: "text"; text: string } => p.type === "text",
                )
                .map((p) => p.text)
                .join("");
              const toolParts = message.parts.filter(isAgentToolPart);

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[min(92%,52rem)] rounded-2xl px-4 py-3 shadow-sm",
                      isUser
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted text-foreground",
                    )}
                  >
                    {!isUser ? (
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                        总管家
                      </p>
                    ) : null}
                    {reasoning ? (
                      <details className="mb-2 rounded-lg bg-background/50 px-2 py-1.5 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">
                          推理过程
                        </summary>
                        <div className="mt-1">
                          <ChatMarkdown
                            content={reasoning}
                            variant="assistant"
                          />
                        </div>
                      </details>
                    ) : null}
                    {text || streamingHere ? (
                      <div className="relative">
                        {text ? (
                          <ChatMarkdown
                            content={text}
                            variant={isUser ? "user" : "assistant"}
                          />
                        ) : null}
                        {streamingHere ? (
                          <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-foreground/70 align-middle" />
                        ) : null}
                      </div>
                    ) : null}
                    {!isUser
                      ? toolParts.map((part) => (
                          <AgentToolApprovalCard
                            key={
                              "toolCallId" in part && part.toolCallId
                                ? part.toolCallId
                                : part.type
                            }
                            part={part}
                            scope="steward"
                            onRespond={addToolApprovalResponse}
                            onApplied={onToolApplied}
                          />
                        ))
                      : null}
                    {toolParts.length === 0 ? (
                      <div className="mt-2 flex justify-end">
                        <MessageRewindButton
                          disabled={busy}
                          onRewind={() => rewindToMessage(index)}
                          tone={isUser ? "onPrimary" : "default"}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {status === "submitted" ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  模型推理中…
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error.message}
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {thinkingLabel ? (
            <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground md:px-10">
              <LoaderCircle className="size-3 animate-spin" />
              <span className="flex-1">{thinkingLabel}</span>
              {busy ? (
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => stop()}
                >
                  停止
                </button>
              ) : null}
            </div>
          ) : null}

          <form
            onSubmit={submitChat}
            className="border-t border-border px-6 py-4 md:px-10"
          >
            <div className="mx-auto flex max-w-6xl items-start gap-3">
              <Textarea
                id="steward-chat-input"
                name="steward-chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="问问全局节奏、该先推哪个项目…"
                className="min-h-28 flex-1 resize-y text-base leading-relaxed md:min-h-32"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitChat();
                  }
                }}
              />
              <Button
                type="submit"
                size="lg"
                className="h-12 shrink-0 px-4"
                disabled={busy || !input.trim()}
                aria-label="发送"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <SendHorizontal />
                )}
                发送
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <MemoryNotesStrip
          notes={notes}
          idPrefix="steward"
          hint="全局约定、周焦点、跨项目约束会随每次对话注入模型。"
          savingNoteId={savingNoteId}
          onAdd={addNote}
          onChange={(id, patch) =>
            setNotes((prev) =>
              prev.map((n) => (n.id === id ? { ...n, ...patch } : n)),
            )
          }
          onSave={(note) => {
            const full = notes.find((n) => n.id === note.id);
            if (full) void saveNote({ ...full, title: note.title, body: note.body });
          }}
          onRemove={removeNote}
        />
      )}
    </div>
  );
}
