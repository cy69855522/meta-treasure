"use client";

import { useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 96;

/**
 * Keep a chat scroller pinned to the bottom while content grows (streaming),
 * without smooth-scroll fighting itself on every token.
 *
 * Entering the chat (enabled rising edge) always re-pins to the bottom.
 */
export function useStickToBottomScroll(options: {
  enabled?: boolean;
  streaming?: boolean;
  /** Bumps when message content / status changes. */
  contentKey: unknown;
}) {
  const enabled = options.enabled ?? true;
  const streaming = options.streaming ?? false;
  const { contentKey } = options;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const programmaticRef = useRef(false);
  const wasEnabledRef = useRef(false);

  const scrollToBottomNow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    programmaticRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
  }, []);

  const onScroll = useCallback(() => {
    if (programmaticRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  /** Call when the user sends a message so we re-pin to bottom. */
  const pinToBottom = useCallback(() => {
    stickRef.current = true;
  }, []);

  // Entering chat: always jump to bottom (instant), then settle after layout.
  useEffect(() => {
    if (!enabled) {
      wasEnabledRef.current = false;
      return;
    }
    if (wasEnabledRef.current) return;
    wasEnabledRef.current = true;
    stickRef.current = true;
    scrollToBottomNow();
    const t0 = window.setTimeout(scrollToBottomNow, 0);
    const t1 = window.setTimeout(scrollToBottomNow, 50);
    const t2 = window.setTimeout(scrollToBottomNow, 200);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [enabled, scrollToBottomNow]);

  // Keep pinned while content/layout grows (markdown, images, prepend fills).
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => {
      if (!stickRef.current) return;
      scrollToBottomNow();
    };

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const child = el.firstElementChild;
    if (child) ro.observe(child);

    sync();
    return () => ro.disconnect();
  }, [enabled, contentKey, scrollToBottomNow]);

  useEffect(() => {
    if (!enabled) return;
    if (!stickRef.current) return;
    scrollToBottomNow();
  }, [enabled, streaming, contentKey, scrollToBottomNow]);

  return { scrollRef, onScroll, pinToBottom };
}
