"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "@/lib/codex-types";

const LOAD_TOP_PX = 48;

type PageResult<T> = {
  messages: T[];
  hasMore: boolean;
};

/**
 * Prefetch older chat history when the user scrolls near the top.
 * Preserves viewport position after prepending.
 */
export function useLoadOlderMessages<T extends { id: string }>(options: {
  enabled?: boolean;
  hasMore: boolean;
  setHasMore: (value: boolean) => void;
  messages: UIMessage[];
  setMessages: (
    updater: (prev: UIMessage[]) => UIMessage[],
  ) => void;
  toUIMessages: (rows: T[]) => UIMessage[];
  fetchOlder: (beforeId: string) => Promise<PageResult<T>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Existing stick-to-bottom scroll handler; composed with load-older. */
  onScrollBase?: () => void;
}) {
  const {
    enabled = true,
    hasMore,
    setHasMore,
    messages,
    setMessages,
    toUIMessages,
    fetchOlder,
    scrollRef,
    onScrollBase,
  } = options;

  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const loadOlder = useCallback(async (opts?: { pinToBottom?: boolean }) => {
    if (!enabled || loadingRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;

    loadingRef.current = true;
    setLoadingOlder(true);

    try {
      const page = await fetchOlder(oldest.id);
      if (page.messages.length === 0) {
        setHasMore(false);
        return;
      }
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      const prevTop = el?.scrollTop ?? 0;
      const older = toUIMessages(page.messages);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !seen.has(m.id));
        return unique.length > 0 ? [...unique, ...prev] : prev;
      });
      setHasMore(page.hasMore);
      requestAnimationFrame(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        if (opts?.pinToBottom) {
          scroller.scrollTop = scroller.scrollHeight;
          return;
        }
        scroller.scrollTop = scroller.scrollHeight - prevHeight + prevTop;
      });
    } catch (err) {
      console.error(err);
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [
    enabled,
    fetchOlder,
    scrollRef,
    setHasMore,
    setMessages,
    toUIMessages,
  ]);

  const onScroll = useCallback(() => {
    onScrollBase?.();
    if (!enabled || loadingRef.current || !hasMoreRef.current) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > LOAD_TOP_PX) return;
    void loadOlder();
  }, [enabled, loadOlder, onScrollBase, scrollRef]);

  // If the first page doesn't fill the viewport, keep pulling older pages
  // until the list can scroll (or history is exhausted). Stay pinned to
  // the newest messages — this is entry fill, not user scrolling up.
  useEffect(() => {
    if (!enabled || !hasMore || loadingOlder) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 8) return;
    void loadOlder({ pinToBottom: true });
  }, [enabled, hasMore, loadingOlder, messages.length, loadOlder, scrollRef]);

  return { loadingOlder, onScroll, loadOlder };
}
