"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

const NEAR_BOTTOM_PX = 96;

/**
 * Keep a chat scroller pinned to the bottom while content grows (streaming),
 * without smooth-scroll fighting itself on every token.
 *
 * Uses useSyncExternalStore so the content snapshot is stable — it only
 * changes when the DOM actually has new content, not on every React render.
 * The ResizeObserver lives on the scroll container only and is never
 * re-created during a streaming session.
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
  const lastHeightRef = useRef<number | null>(null);

  // Stable content snapshot — only changes when the DOM node actually
  // changes, not on every React re-render. This is the key perf fix: the
  // ResizeObserver does NOT re-create during streaming.
  const snapshotRef = useRef(0);
  const subscribe = useCallback(
    (notify: () => void) => {
      const el = scrollRef.current;
      if (!el) return () => {};
      const ro = new ResizeObserver(() => {
        snapshotRef.current++;
        notify();
      });
      ro.observe(el);
      return () => ro.disconnect();
    },
    [],
  );
  const getSnapshot = useCallback(() => snapshotRef.current, []);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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

  /** Release bottom stick so programmatic scroll-to-message is not overridden. */
  const releaseStick = useCallback(() => {
    stickRef.current = false;
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

  // Sibling UI toggled by React (status bar) resizes the viewport within the
  // same commit; correct before paint instead of waiting for ResizeObserver.
  useLayoutEffect(() => {
    if (!enabled) {
      lastHeightRef.current = null;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const height = el.clientHeight;
    const prev = lastHeightRef.current;
    lastHeightRef.current = height;
    if (prev === null || prev === height) return;
    if (stickRef.current) {
      scrollToBottomNow();
      return;
    }
    programmaticRef.current = true;
    el.scrollTop += prev - height;
    requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
  });

  // Re-pin while content grows (markdown, images, prepend fills).
  // NOTE: the ResizeObserver is now on the scroll container only (see subscribe),
  // so this effect runs when the container size changes — which is exactly
  // when we want to re-pin to bottom. We no longer observe firstElementChild.
  useEffect(() => {
    if (!enabled) return;
    if (!stickRef.current) return;
    scrollToBottomNow();
  }, [enabled, contentKey, scrollToBottomNow]);

  // Keep pinned while streaming (every new token bumps contentKey).
  useEffect(() => {
    if (!enabled) return;
    if (!stickRef.current) return;
    scrollToBottomNow();
  }, [enabled, streaming, scrollToBottomNow]);

  return { scrollRef, onScroll, pinToBottom, releaseStick };
}
