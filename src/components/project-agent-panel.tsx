"use client";

import { useCodexChat } from "@/hooks/use-codex-chat";
import {
  ChatHistorySearch,
  scrollChatMessageIntoView,
} from "@/components/chat-history-search";
import { CodexControls, CodexSettings } from "@/components/codex-controls";
import {
  isSkillMessagePart,
  isRuleMessagePart,
  isImageMessagePart,
  type UIMessage,
} from "@/lib/codex-types";
import {
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  PanelTop,
  PanelTopClose,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentToolApprovalCard,
  isAgentToolPart,
  rejectPendingApprovalsInMessages,
} from "@/components/agent-tool-approval";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat-composer";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useAgentChrome } from "@/components/agent-chrome";
import { MemoryNotesStrip } from "@/components/memory-notes-strip";
import { MessageCopyButton } from "@/components/message-copy-button";
import { MessageRetryButton } from "@/components/message-retry-button";
import { MessageRewindButton } from "@/components/message-rewind-button";
import { MessageLibraryTags } from "@/components/message-skill-tags";
import {
  AssistantTimeline,
  firstTextPreamble,
} from "@/components/assistant-timeline";
import { MessageImages } from "@/components/message-images";
import { ResearchProgressBars } from "@/components/research-progress-bar";
import { Button } from "@/components/ui/button";
import { useStickToBottomScroll } from "@/hooks/use-stick-to-bottom-scroll";
import { useLoadOlderMessages } from "@/hooks/use-load-older-messages";
import { CHAT_HISTORY_PAGE_SIZE, CHAT_COLUMN_CLASS, CHAT_BUBBLE_MAX_CLASS } from "@/lib/constants";
import { partsFromStoredMessage } from "@/lib/chat-message-parts";
import type { AgentMemoryNote, AgentMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

function toUIMessages(messages: AgentMessage[]): UIMessage[] {
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

type Props = {
  projectId: string;
  projectName: string;
  projectColor: string;
  projectDescription: string;
  initialMessages: AgentMessage[];
  initialHasMore?: boolean;
  initialNotes: AgentMemoryNote[];
  children: React.ReactNode;
};

export function ProjectAgentPanel({
  projectId,
  projectName,
  projectColor,
  projectDescription,
  initialMessages,
  initialNotes,
  children,
}: Props) {
  const router = useRouter();
  const { headerVisible, toggleHeader, setAgentSessionActive } =
    useAgentChrome();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const [notes, setNotes] = useState(initialNotes);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);

  useEffect(() => {
    setAgentSessionActive(open);
    return () => setAgentSessionActive(false);
  }, [open, setAgentSessionActive]);

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
  } = useCodexChat({scope:projectId,initialMessages:toUIMessages(initialMessages)});

  const [rewinding, setRewinding] = useState(false);

  const refreshNotes = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/agent/notes`);
    if (!res.ok) return;
    const data = (await res.json()) as { notes: AgentMemoryNote[] };
    setNotes(data.notes);
  }, [projectId]);

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
        const res = await fetch(
          `/api/projects/${projectId}/agent/messages/rewind`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId: target.id,
              keepCount: index,
              userOrdinal,
            }),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "撤回失败");
        }
        const data = (await res.json()) as {
          messages: AgentMessage[];
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
    [messages, projectId, clearError, stop, setMessages],
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
        const res = await fetch(
          `/api/projects/${projectId}/agent/messages/rewind`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId: target.id,
              keepCount: index + 1,
              userOrdinal,
              keepMessage: true,
            }),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "重试失败");
        }
        const data = (await res.json()) as {
          messages: AgentMessage[];
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
    [messages, projectId, clearError, stop, setMessages, regenerate],
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
    enabled: open && tab === "chat",
    streaming: status === "streaming" || status === "submitted",
    contentKey: `${messages.length}:${status}:${lastAssistantText.length}`,
  });

  const fetchOlderAgentMessages = useCallback(
    async (beforeId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/agent/messages?before=${encodeURIComponent(beforeId)}&limit=${CHAT_HISTORY_PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error("加载更早消息失败");
      return (await res.json()) as {
        messages: AgentMessage[];
        hasMore: boolean;
      };
    },
    [projectId],
  );

  const { loadingOlder, onScroll } = useLoadOlderMessages({
    enabled: open && tab === "chat",
    hasMore: hasMoreHistory,
    setHasMore: setHasMoreHistory,
    messages,
    setMessages,
    toUIMessages,
    fetchOlder: fetchOlderAgentMessages,
    scrollRef,
    onScrollBase: onStickScroll,
  });

  const jumpToMessage = useCallback(
    async (messageId: string) => {
      setTab("chat");
      releaseStick();
      if (!document.getElementById(`msg-${messageId}`)) {
        const res = await fetch(
          `/api/projects/${projectId}/agent/messages/through?id=${encodeURIComponent(messageId)}`,
        );
        const data = (await res.json()) as {
          messages?: AgentMessage[];
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
    [projectId, releaseStick, setMessages],
  );

  useEffect(() => {
    if (!open || tab !== "chat") return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, tab]);

  async function addNote() {
    const res = await fetch(`/api/projects/${projectId}/agent/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新笔记", body: "" }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { note: AgentMemoryNote };
    setNotes((prev) => [...prev, data.note]);
  }

  async function saveNote(note: AgentMemoryNote) {
    setSavingNoteId(note.id);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/agent/notes/${note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: note.title, body: note.body }),
        },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { note: AgentMemoryNote };
      setNotes((prev) => prev.map((n) => (n.id === note.id ? data.note : n)));
    } finally {
      setSavingNoteId(null);
    }
  }

  async function removeNote(noteId: string) {
    const res = await fetch(
      `/api/projects/${projectId}/agent/notes/${noteId}`,
      { method: "DELETE" },
    );
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

  function openChat() {
    setTab("chat");
    setOpen(true);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: projectColor }}
            />
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Project
            </p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {projectName}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {projectDescription ||
              "用 Now / Next / Later 管理节奏，淡化硬性时间线。"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={openChat}
        >
          <MessageSquare />
          项目顾问
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 pt-6 pb-6">
        {children}
      </div>

      {open ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={`${projectName} 项目顾问`}
          className="absolute inset-0 z-20 flex flex-col bg-background"
        >
          <header
            className={cn(
              "shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4",
              headerVisible ? "flex" : "hidden",
            )}
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: projectColor }}
                />
                <p className="text-xs text-muted-foreground">Codex Agent</p>
              </div>
              <h2 className="truncate text-lg font-semibold">{projectName}</h2>
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
                searchUrl={`/api/projects/${projectId}/agent/messages/search`}
                onJumpToMessage={jumpToMessage}
              />
              <CodexSettings
                state={codexState}
                action={codexAction}
                modelOptions={modelOptions}
                onModelChange={setModel}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="关闭顾问"
                title="关闭顾问"
              >
                <X />
              </Button>
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
                    还没有对话。问问进度、想法或迷茫点；若顾问提议改笔记/任务，会先给你预览确认。
                  </div>
                ) : null}

                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isLast = index === messages.length - 1;
                  const streamingHere =
                    !isUser && isLast && status === "streaming";
                  const toolParts = message.parts.filter(isAgentToolPart);
                  const skillParts = message.parts.filter(isSkillMessagePart);
                  const ruleParts = message.parts.filter(isRuleMessagePart);
                  const imageParts = message.parts.filter(isImageMessagePart);
                  const mountedNames = [
                    ...skillParts.flatMap((s) => [s.name, s.command]),
                    ...ruleParts.map((r) => r.name),
                  ];
                  const { preamble } = !isUser
                    ? firstTextPreamble(message.parts, mountedNames, streamingHere)
                    : { preamble: null };
                  const text = message.parts
                    .filter(
                      (p): p is { type: "text"; text: string } =>
                        p.type === "text",
                    )
                    .map((p) => p.text)
                    .join("");
                  return (
                    <div
                      key={message.id}
                      id={`msg-${message.id}`}
                      className={cn(
                        "flex scroll-mt-4 rounded-2xl",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-3 shadow-sm",
                          CHAT_BUBBLE_MAX_CLASS,
                          isUser
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "w-full rounded-bl-md bg-muted text-foreground",
                        )}
                      >
                        {!isUser ? (
                          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                            顾问
                          </p>
                        ) : null}
                        {!isUser ? (
                          <MessageLibraryTags
                            skills={skillParts}
                            rules={ruleParts}
                            preamble={preamble}
                            streamingPreamble={
                              streamingHere && Boolean(preamble)
                            }
                          />
                        ) : null}
                        <MessageImages images={imageParts} />
                        {isUser ? (
                          text || streamingHere ? (
                            <div className="relative">
                              {text ? (
                                <ChatMarkdown
                                  content={text}
                                  variant="user"
                                  streaming={streamingHere}
                                />
                              ) : null}
                              {streamingHere ? (
                                <span
                                  aria-hidden
                                  className="ml-0.5 inline-block h-[1.05em] w-0.5 animate-pulse bg-foreground/70 align-[-0.1em]"
                                />
                              ) : null}
                            </div>
                          ) : null
                        ) : (
                          <AssistantTimeline
                            parts={message.parts}
                            mountedNames={mountedNames}
                            streaming={streamingHere}
                          />
                        )}
                        {!isUser
                          ? toolParts
                              .filter((part) => {
                                const name =
                                  "toolName" in part &&
                                  typeof part.toolName === "string"
                                    ? part.toolName
                                    : String(part.type).replace(/^tool-/, "");
                                return (
                                  name !== "webSearch" &&
                                  name !== "fetchPages" &&
                                  name !== "fetchUrl" &&
                                  !name.startsWith("deepRadar")
                                );
                              })
                              .map((part) => (
                              <AgentToolApprovalCard
                                key={String(
                                  "toolCallId" in part && part.toolCallId
                                    ? part.toolCallId
                                    : part.type,
                                )}
                                part={part}
                                scope="project"
                                projectId={projectId}
                                onRespond={addToolApprovalResponse}
                                onApplied={onToolApplied}
                          />
                        ))
                          : null}
                        {!isUser ? (
                          <ResearchProgressBars
                            parts={message.parts}
                            disabled={busy}
                            onReadReport={(job) => {
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
                                  job.reportUrl
                                    ? `报告链接：${job.reportUrl}`
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(""),
                                images: [],
                              });
                            }}
                          />
                        ) : null}
                        {text.trim() || toolParts.length === 0 ? (
                          <div className="mt-2 flex justify-end gap-0.5">
                            <MessageCopyButton
                              text={text}
                              tone={isUser ? "onPrimary" : "default"}
                            />
                            {toolParts.length === 0 ? (
                              <>
                                {isUser ? (
                                  <MessageRetryButton
                                    disabled={busy}
                                    onRetry={() => retryFromMessage(index)}
                                    tone="onPrimary"
                                  />
                                ) : null}
                                <MessageRewindButton
                                  disabled={busy}
                                  onRewind={() => rewindToMessage(index)}
                                  tone={isUser ? "onPrimary" : "default"}
                                />
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
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
                scope={projectId}
                id="project-agent-chat-input"
                name="project-agent-chat-input"
                placeholder="发送消息…"
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
              idPrefix="project"
              hint="目标、约束、迷茫点会随每次对话注入模型。"
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
        </section>
      ) : null}
    </div>
  );
}
