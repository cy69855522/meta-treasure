"use client";

import { memo, useRef } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  AgentToolApprovalCard,
  isAgentToolPart,
  rejectPendingApprovalsInMessages,
} from "@/components/agent-tool-approval";
import { type ActionAffects, type AgentToolScope } from "@/lib/agent-tools-types";
import { MessageImages } from "@/components/message-images";
import { MessageLibraryTags } from "@/components/message-skill-tags";
import { MessageCopyButton } from "@/components/message-copy-button";
import { MessageScreenshotButton } from "@/components/message-screenshot-button";
import { MessageRetryButton } from "@/components/message-retry-button";
import { MessageRewindButton } from "@/components/message-rewind-button";
import { ResearchProgressBars } from "@/components/research-progress-bar";
import { AssistantTimeline, firstTextPreamble } from "@/components/assistant-timeline";
import { CHAT_BUBBLE_MAX_CLASS } from "@/lib/constants";
import {
  isImageMessagePart,
  isRuleMessagePart,
  isSkillMessagePart,
  type UIMessage,
  type UIMessagePart,
} from "@/lib/codex-types";
import { cn } from "@/lib/utils";

function shouldRenderToolPart(part: UIMessagePart): boolean {
  const name =
    "toolName" in part && typeof part.toolName === "string"
      ? part.toolName
      : String(part.type).replace(/^tool-/, "");
  return (
    name !== "webSearch" &&
    name !== "fetchPages" &&
    name !== "fetchUrl" &&
    !name.startsWith("deepRadar")
  );
}

/**
 * One chat message bubble. Memoized so parent state changes (streaming status,
 * busy flag) don't cause unnecessary re-renders.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  streamingHere,
  busy,
  scope,
  projectId,
  onToolApprovalResponse,
  onToolApplied,
  onRetry,
  onRewind,
  onReadResearchReport,
  senderLabel,
}: {
  message: UIMessage;
  streamingHere: boolean;
  busy: boolean;
  scope: AgentToolScope;
  /** Required when scope === "project". Ignored otherwise. */
  projectId?: string;
  onToolApprovalResponse: (decision: { id: string; approved: boolean }) => void;
  onToolApplied: (affects: ActionAffects) => void;
  onRetry: () => void;
  onRewind: () => void;
  onReadResearchReport: Parameters<
    typeof ResearchProgressBars
  >[0]["onReadReport"];
  /** Small caption shown above assistant bubbles (e.g. 总管家 / 顾问). */
  senderLabel?: string;
}) {
  const isUser = message.role === "user";
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
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  // Ref to the assistant content (text + search bars). Reasoning <details>
  // are siblings of this wrapper inside AssistantTimeline, so they are
  // intentionally excluded from the screenshot. Only set when the bubble
  // is assistant; the user bubble has no screenshot button.
  const bubbleContentRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
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
        {!isUser && senderLabel ? (
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            {senderLabel}
          </p>
        ) : null}
        {!isUser ? (
          <MessageLibraryTags
            skills={skillParts}
            rules={ruleParts}
            preamble={preamble}
            streamingPreamble={streamingHere && Boolean(preamble)}
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
            outerRef={bubbleContentRef}
          />
        )}
        {!isUser
          ? toolParts
              .filter((part) => shouldRenderToolPart(part))
              .map((part) => (
                <AgentToolApprovalCard
                  key={String(
                    "toolCallId" in part && part.toolCallId
                      ? part.toolCallId
                      : part.type,
                  )}
                  part={part}
                  scope={scope}
                  projectId={projectId}
                  onRespond={onToolApprovalResponse}
                  onApplied={onToolApplied}
                />
              ))
          : null}
        {!isUser ? (
          <ResearchProgressBars
            parts={message.parts}
            disabled={busy}
            onReadReport={onReadResearchReport}
          />
        ) : null}
        {text.trim() || toolParts.length === 0 ? (
          <div className="mt-2 flex justify-start gap-0.5">
            {!isUser ? (
              <MessageScreenshotButton
                targetRef={bubbleContentRef}
                tone="default"
              />
            ) : null}
            <MessageCopyButton
              text={text}
              tone={isUser ? "onPrimary" : "default"}
            />
            {toolParts.length === 0 ? (
              <>
                {isUser ? (
                  <MessageRetryButton
                    disabled={busy}
                    onRetry={onRetry}
                    tone="onPrimary"
                  />
                ) : null}
                <MessageRewindButton
                  disabled={busy}
                  onRewind={onRewind}
                  tone={isUser ? "onPrimary" : "default"}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

// Re-export so call sites that need to keep the old in-map reorder guard
// (rejectPendingApprovalsInMessages) stay in sync.
export { rejectPendingApprovalsInMessages };
