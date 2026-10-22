"use client";

import { useCodexChat } from "@/hooks/use-codex-chat";
import {
  ChatHistorySearch,
  scrollChatMessageIntoView,
} from "@/components/chat-history-search";
import { CodexControls, CodexSettings } from "@/components/codex-controls";
import { type UIMessage } from "@/lib/codex-types";
import {
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  PanelTop,
  PanelTopClose,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { rejectPendingApprovalsInMessages } from "@/components/agent-tool-approval";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat-composer";
import { useAgentChrome } from "@/components/agent-chrome";
import { MemoryNotesStrip } from "@/components/memory-notes-strip";
import { MessageBubble } from "@/components/message-bubble";
import { Button } from "@/components/ui/button";
import { useStickToBottomScroll } from "@/hooks/use-stick-to-bottom-scroll";
import { useLoadOlderMessages } from "@/hooks/use-load-older-messages";
import { CHAT_HISTORY_PAGE_SIZE, CHAT_COLUMN_CLASS, CHAT_BUBBLE_MAX_CLASS } from "@/lib/constants";
import { partsFromStoredMessage } from "@/lib/chat-message-parts";
import type { StewardMemoryNote, StewardMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

function toUIMessages(messages: StewardMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: partsFromStoredMessage(m),
  }));
}

function uiMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
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
  initialHasMore?: boolean;
  initialNotes: StewardMemoryNote[];
}) {
  const router = useRouter();
  const { headerVisible, toggleHeader, setAgentSessionActive } =
    useAgentChrome();
  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const [notes, setNotes] = useState(initialNotes);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);

  useEffect(() => {
    setAgentSessionActive(true);
    return () => setAgentSessionActive(false);
  }, [setAgentSessionActive]);

  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    status,
    error,
    clearError,
    stop,
    addToolApprovalResponse,
    codexState,
    codexAction,
    modelOptions,
    setModel,
  } = useCodexChat({scope:"steward",initialMessages:toUIMessages(initialMessages)});

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

  const previousStatus = useRef(status);
  useEffect(() => {
    if (["submitted", "streaming"].includes(previousStatus.current) && !["submitted", "streaming"].includes(status)) {
      void refreshNotes();
    }
    previousStatus.current = status;
  }, [status, refreshNotes]);

  const rewindToMessage = useCallback(
    async (index: number) => {
      const target = messages[index];
      if (!target) return;
      const restoreText =
        target.role === "user" ? uiMessageText(target) : "";
      const userOrdinal =
        target.role === "user"
          ? messages
              .slice(0, index + 1)
              .filter((m) => m.role === "user").length - 1
          : undefined;
      setRewinding(true);
      clearError();
      await stop();
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
        const data = (await res.json()) as {
          messages: StewardMessage[];
          hasMore?: boolean;
        };
        setMessages(toUIMessages(data.messages));
        setHasMoreHistory(Boolean(data.hasMore));
        if (restoreText) composerRef.current?.appendDraft(restoreText);
      } catch (err) {
        console.error(err);
        window.alert(err instanceof Error ? err.message : "撤回失败");
      } finally {
        setRewinding(false);
      }
    },
    [messages, clearError, stop, setMessages],
  );

  const retryFromMessage = useCallback(
    async (index: number) => {
      const target = messages[index];
      if (!target || target.role !== "user") return;
      const userOrdinal =
        messages.slice(0, index + 1).filter((m) => m.role === "user").length -
        1;
      setRewinding(true);
      clearError();
      await stop();
      try {
        const res = await fetch("/api/steward/messages/rewind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: target.id,
            keepCount: index + 1,
            userOrdinal,
            keepMessage: true,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "重试失败");
        }
        const data = (await res.json()) as {
          messages: StewardMessage[];
          hasMore?: boolean;
        };
        const next = toUIMessages(data.messages);
        setMessages(rejectPendingApprovalsInMessages(next));
        setHasMoreHistory(Boolean(data.hasMore));
        await regenerate({ messageId: target.id });
      } catch (err) {
        console.error(err);
        window.alert(err instanceof Error ? err.message : "重试失败");
      } finally {
        setRewinding(false);
      }
    },
    [messages, clearError, stop, setMessages, regenerate],
  );

  const busy = status === "submitted" || status === "streaming" || rewinding;
  const thinkingLabel = statusLabel(status);
  const lastAssistantText =
    [...messages].reverse().find((m) => m.role === "assistant")?.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";
  const {
    scrollRef,
    onScroll: onStickScroll,
    pinToBottom,
    releaseStick,
  } = useStickToBottomScroll({
    enabled: tab === "chat",
    streaming: status === "streaming" || status === "submitted",
    contentKey: `${messages.length}:${status}:${lastAssistantText.length}`,
  });

  const fetchOlderStewardMessages = useCallback(
    async (beforeId: string) => {
      const res = await fetch(
        `/api/steward/messages?before=${encodeURIComponent(beforeId)}&limit=${CHAT_HISTORY_PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error("加载更早消息失败");
      return (await res.json()) as {
        messages: StewardMessage[];
        hasMore: boolean;
      };
    },
    [],
  );

  const { loadingOlder, onScroll } = useLoadOlderMessages({
    enabled: tab === "chat",
    hasMore: hasMoreHistory,
    setHasMore: setHasMoreHistory,
    messages,
    setMessages,
    toUIMessages,
    fetchOlder: fetchOlderStewardMessages,
    scrollRef,
    onScrollBase: onStickScroll,
  });

  const jumpToMessage = useCallback(
    async (messageId: string) => {
      setTab("chat");
      releaseStick();
      if (!document.getElementById(`msg-${messageId}`)) {
        const res = await fetch(
          `/api/steward/messages/through?id=${encodeURIComponent(messageId)}`,
        );
        const data = (await res.json()) as {
          messages?: StewardMessage[];
          hasMore?: boolean;
          error?: string;
        };
        if (!res.ok || !data.messages) {
          throw new Error(data.error || "无法加载该消息");
        }
        setMessages(toUIMessages(data.messages));
        setHasMoreHistory(Boolean(data.hasMore));
        for (let i = 0; i < 40; i += 1) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          if (document.getElementById(`msg-${messageId}`)) break;
        }
      }
      await scrollChatMessageIntoView(messageId);
    },
    [releaseStick, setMessages],
  );

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

  function submitChat(message: { text: string; images: import("@/lib/types").MessageImage[] }) {
    if ((!message.text && !message.images.length) || busy) return;
    clearError();
    pinToBottom();
    // Sending a new turn without clicking 拒绝 must deny pending tools,
    // otherwise convertToModelMessages throws MissingToolResultsError.
    setMessages((prev) => rejectPendingApprovalsInMessages(prev));
    void sendMessage(message);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header
        className={cn(
          "shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4",
          headerVisible ? "flex" : "hidden",
        )}
      >
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Steward · 总管家</p>
          <h1 className="mt-0.5 text-lg font-semibold">跨项目顾问</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Codex · 保留会话上下文；权限请求在对话中确认
          </p>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-6">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={toggleHeader}
          aria-label={headerVisible ? "隐藏标题栏" : "展开标题栏"}
          aria-pressed={headerVisible}
          title={headerVisible ? "隐藏标题栏" : "展开标题栏"}
        >
          {headerVisible ? <PanelTopClose /> : <PanelTop />}
        </Button>
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
        <div className="ml-auto flex items-center gap-1">
          <ChatHistorySearch
            searchUrl="/api/steward/messages/search"
            onJumpToMessage={jumpToMessage}
          />
          <CodexSettings
            state={codexState}
            action={codexAction}
            modelOptions={modelOptions}
            onModelChange={setModel}
          />
        </div>
      </div>

      {tab === "chat" ? (
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div
            ref={scrollRef}
            onScroll={onScroll}
            className={cn(
              "min-h-0 w-full flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6",
              CHAT_COLUMN_CLASS,
            )}
            >
            {loadingOlder ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                加载更早消息…
              </div>
            ) : hasMoreHistory ? (
              <p className="text-center text-xs text-muted-foreground">
                上滑加载更早消息
              </p>
            ) : messages.length > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                已到最早消息
              </p>
            ) : null}

            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                聊聊跨项目取舍、收件箱堆积或整体节奏；若提议改笔记/任务，会先给你预览确认。
              </div>
            ) : null}

            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              const streamingHere =
                message.role !== "user" && isLast && status === "streaming";
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streamingHere={streamingHere}
                  busy={busy}
                  scope="steward"
                  senderLabel="总管家"
                  onToolApprovalResponse={addToolApprovalResponse}
                  onToolApplied={onToolApplied}
                  onRetry={() => retryFromMessage(index)}
                  onRewind={() => rewindToMessage(index)}
                  onReadResearchReport={(job) => {
                    if (busy) return;
                    clearError();
                    pinToBottom();
                    setMessages((prev) =>
                      rejectPendingApprovalsInMessages(prev),
                    );
                    void sendMessage({
                      text: [
                        `请用 deepRadarReport 读取研究会话 ${job.sessionId} 的报告正文，`,
                        "提炼关键结论与可行动建议，然后基于这份报告继续和我对话。",
                        job.reportUrl ? `报告链接：${job.reportUrl}` : "",
                      ]
                        .filter(Boolean)
                        .join(""),
                      images: [],
                    });
                  }}
                />
              );
            })}

            {status === "submitted" ? (
              <div className="flex justify-start">
                <div
                  className={cn(
                    "flex w-full items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm text-muted-foreground",
                    CHAT_BUBBLE_MAX_CLASS,
                  )}
                >
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
            </div>

            {thinkingLabel ? (
              <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:px-6">
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

          <ChatComposer
            ref={composerRef}
            scope="steward"
            id="steward-chat-input"
            name="steward-chat-input"
            placeholder="问问全局节奏、该先推哪个项目…"
            disabled={busy}
            textareaRef={inputRef}
            onSubmit={submitChat}
            />
          </div>
          <CodexControls state={codexState} action={codexAction} onApplied={onToolApplied} />
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
