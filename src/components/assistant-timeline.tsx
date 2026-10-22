"use client";

import { memo, useMemo } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { MessageSearchBar } from "@/components/message-search-tags";
import {
  isSearchMessagePart,
  type UIMessagePart,
} from "@/lib/codex-types";
import { splitMountedPreamble } from "@/lib/chat-preamble";

/**
 * Render assistant content parts in order so interleaved search bars stay
 * inside one bubble (text → search → text), including while streaming.
 */
export const AssistantTimeline = memo(function AssistantTimeline({
  parts,
  mountedNames,
  streaming,
  outerRef,
}: {
  parts: UIMessagePart[];
  mountedNames: string[];
  streaming?: boolean;
  /**
   * Ref to the outer wrapper. Used by the per-message screenshot button
   * to capture the whole timeline (text + reasoning + search bars) as one
   * PNG without the action buttons (which sit outside this wrapper).
   */
  outerRef?: React.Ref<HTMLDivElement>;
}) {
  // Stable derived data: only recompute when parts or dependencies change.
  const { textNodes, reasoningNodes } = useMemo(() => {
    const timeline = parts.filter(
      (part) =>
        part.type === "text" ||
        part.type === "search" ||
        part.type === "reasoning",
    );

    // First text segment may include skill/rule restatement before ---.
    let consumedPreamble = false;

    const textNodesOut: React.ReactNode[] = [];
    const reasoningNodesOut: React.ReactNode[] = [];
    let textCount = 0;

    for (let index = 0; index < timeline.length; index++) {
      const part = timeline[index];
      if (
        part.type === "reasoning" &&
        typeof part.text === "string" &&
        part.text
      ) {
        // Reasoning <details> are intentionally rendered OUTSIDE the
        // screenshot target so the per-message screenshot button omits the
        // collapsible trace. They stay visually attached to the bubble
        // (sibling of the ref'd wrapper) and are gathered at the bottom to
        // avoid interleaving with screenshot content.
        reasoningNodesOut.push(
          <details
            key={`reasoning:${index}`}
            className="mt-2 rounded-lg bg-background/50 px-2 py-1.5 text-xs text-muted-foreground"
          >
            <summary className="cursor-pointer select-none">推理过程</summary>
            <div className="mt-1">
              <ChatMarkdown content={part.text} variant="assistant" />
            </div>
          </details>,
        );
        continue;
      }
      if (isSearchMessagePart(part)) {
        const search = {
          id: part.id,
          query: typeof part.query === "string" ? part.query : "",
          sources: Array.isArray(part.sources)
            ? part.sources.filter(
                (source): source is string => typeof source === "string",
              )
            : [],
          hits: Array.isArray(part.hits) ? part.hits : [],
          pages: Array.isArray(part.pages) ? part.pages : [],
          status: part.status,
          phase: part.phase,
          callId: typeof part.callId === "string" ? part.callId : undefined,
          error: typeof part.error === "string" ? part.error : undefined,
        };
        textNodesOut.push(
          <MessageSearchBar key={`search:${search.id}:${index}`} search={search} />,
        );
        continue;
      }
      if (part.type === "text" && typeof part.text === "string") {
        textCount += 1;
        const isLastText =
          streaming &&
          !timeline.slice(index + 1).some((item) => item.type === "text");
        let content = part.text;
        if (!consumedPreamble && textCount === 1) {
          const split = splitMountedPreamble(part.text, mountedNames, {
            allowPending: Boolean(streaming && isLastText),
          });
          consumedPreamble = Boolean(split.preamble);
          content = split.body;
          // Preamble is shown by MessageLibraryTags above; skip empty body.
        }
        if (!content && !isLastText) continue;
        textNodesOut.push(
          <div key={`text:${index}`} className="relative">
            {content ? (
              <ChatMarkdown
                content={content}
                variant="assistant"
                streaming={Boolean(isLastText)}
              />
            ) : null}
            {isLastText ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[1.05em] w-0.5 animate-pulse bg-foreground/70 align-[-0.1em]"
              />
            ) : null}
          </div>,
        );
      }
    }

    return { textNodes: textNodesOut, reasoningNodes: reasoningNodesOut };
  }, [parts, mountedNames, streaming]);

  if (textNodes.length === 0 && reasoningNodes.length === 0 && streaming) {
    return (
      <span
        aria-hidden
        className="inline-block h-[1.05em] w-0.5 animate-pulse bg-foreground/70 align-[-0.1em]"
      />
    );
  }

  return (
    <>
      <div
        ref={outerRef}
        data-screenshot-exclude="0"
        className="space-y-1"
      >
        {textNodes}
      </div>
      {reasoningNodes}
    </>
  );
});

/** Expose preamble extracted from the first text part for library tags. */
export function firstTextPreamble(
  parts: UIMessagePart[],
  mountedNames: string[],
  streaming?: boolean,
) {
  const firstText = parts.find(
    (part) => part.type === "text" && typeof part.text === "string",
  );
  if (!firstText?.text)
    return { preamble: null as string | null, hasBody: false };
  const { preamble, body } = splitMountedPreamble(
    firstText.text,
    mountedNames,
    {
      allowPending: Boolean(streaming),
    },
  );
  return { preamble, hasBody: Boolean(body.trim()) };
}
