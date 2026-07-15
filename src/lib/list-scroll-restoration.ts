"use client";

import { useEffect } from "react";

const STORAGE_PREFIX = "priceai:list-scroll:";
const RESTORE_TTL_MS = 30 * 60 * 1000;
const MAX_RESTORE_FRAMES = 90;

type StoredScrollPosition = {
  savedAt: number;
  scrollY: number;
};

export function saveCurrentListScrollPosition(): void {
  if (typeof window === "undefined") return;

  const position: StoredScrollPosition = {
    savedAt: Date.now(),
    scrollY: Math.max(0, Math.round(window.scrollY)),
  };

  try {
    window.sessionStorage.setItem(storageKey(window.location.href), JSON.stringify(position));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

export function useListScrollRestoration(): void {
  useEffect(() => {
    let stored: StoredScrollPosition | null = null;
    const key = storageKey(window.location.href);

    try {
      const raw = window.sessionStorage.getItem(key);
      window.sessionStorage.removeItem(key);
      stored = raw ? parseStoredPosition(raw) : null;
    } catch {
      return;
    }

    if (!stored || Date.now() - stored.savedAt > RESTORE_TTL_MS || stored.scrollY <= 0) return;

    let cancelled = false;
    let frame = 0;
    const targetY = stored.scrollY;

    const restore = () => {
      if (cancelled) return;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScrollY >= targetY || frame >= MAX_RESTORE_FRAMES) {
        window.scrollTo({ top: Math.min(targetY, maxScrollY), behavior: "auto" });
        return;
      }

      frame += 1;
      window.requestAnimationFrame(restore);
    };

    window.requestAnimationFrame(restore);
    return () => {
      cancelled = true;
    };
  }, []);
}

function storageKey(href: string): string {
  const url = new URL(href);
  return `${STORAGE_PREFIX}${url.pathname}${url.search}`;
}

function parseStoredPosition(raw: string): StoredScrollPosition | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredScrollPosition>;
    if (!Number.isFinite(value.savedAt) || !Number.isFinite(value.scrollY)) return null;
    return { savedAt: Number(value.savedAt), scrollY: Number(value.scrollY) };
  } catch {
    return null;
  }
}
