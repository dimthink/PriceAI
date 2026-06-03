"use client";

type CacheEntry<T> = {
  savedAt: number;
  value: T;
};

export function readSessionCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.savedAt !== "number") return null;
    if (Date.now() - entry.savedAt > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return entry.value;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        value,
      } satisfies CacheEntry<T>),
    );
  } catch {
    // Cache failure should never block the comparison UI.
  }
}
