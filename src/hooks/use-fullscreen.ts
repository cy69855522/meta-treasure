"use client";

import { useCallback, useEffect, useState } from "react";

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFullscreen(el: Element) {
  const target = el as Element & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (target.webkitRequestFullscreen) {
    await target.webkitRequestFullscreen();
  }
}

async function exitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

/** Browser Fullscreen API with webkit fallback (iOS Safari often unsupported). */
export function useFullscreen() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(Boolean(getFullscreenElement()));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (getFullscreenElement()) {
        await exitFullscreen();
        return;
      }
      await requestFullscreen(document.documentElement);
    } catch {
      // Unsupported or user gesture / permission blocked — ignore.
    }
  }, []);

  return { active, toggle };
}
