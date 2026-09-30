"use client";

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
export function AssistantTimeline({
  parts,
  mountedNames,
  streaming,
}: {
  parts: UIMessagePart[];
  mountedNames: string[];
  streaming?: boolean;
}) {
  const timeline = parts.filter(
    (part) =>
      part.type === "text" ||
      part.type === "search" ||
      part.type === "reasoning",
  );

  // First text segment may include skill/rule restatement before ---.
  let consumedPreamble = false;

  const nodes: React.ReactNode[] = [];
  let textCount = 0;
  for (let index = 0; index < timeline.length; index++) {
    const part = timeline[index];
    if (part.type === "reasoning" && typeof part.text === "string" && part.text) {
      nodes.push(
        <details
          key={`reasoning:${index}`}
          className="mb-2 rounded-lg bg-background/50 px-2 py-1.5 text-xs text-muted-foreground"
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
          ? part.sources.filter((source): source is string => typeof source === "string")
          : [],
        hits: Array.isArray(part.hits) ? part.hits : [],
        pages: Array.isArray(part.pages) ? part.pages : [],
        status: part.status,
        phase: part.phase,
        callId: typeof part.callId === "string" ? part.callId : undefined,
        error: typeof part.error === "string" ? part.error : undefined,
      };
      nodes.push(
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
      nodes.push(
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

  if (nodes.length === 0 && streaming) {
    return (
      <span
        aria-hidden
        className="inline-block h-[1.05em] w-0.5 animate-pulse bg-foreground/70 align-[-0.1em]"
      />
    );
  }

  return <div className="space-y-1">{nodes}</div>;
}

/** Expose preamble extracted from the first text part for library tags. */
export function firstTextPreamble(
  parts: UIMessagePart[],
  mountedNames: string[],
  streaming?: boolean,
) {
  const firstText = parts.find(
    (part) => part.type === "text" && typeof part.text === "string",
  );
  if (!firstText?.text) return { preamble: null as string | null, hasBody: false };
  const { preamble, body } = splitMountedPreamble(firstText.text, mountedNames, {
    allowPending: Boolean(streaming),
  });
  return { preamble, hasBody: Boolean(body.trim()) };
}
