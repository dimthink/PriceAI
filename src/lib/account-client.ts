"use client";

import { useEffect, useState } from "react";

export type AccountUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseAccountUser(payload: unknown): AccountUser | null {
  if (!payload || typeof payload !== "object") return null;

  const userPayload = (payload as { user?: unknown }).user;
  if (!userPayload || typeof userPayload !== "object") return null;

  const user = userPayload as Record<string, unknown>;
  const id = user.id;
  if (typeof id !== "string" || !id) return null;

  return {
    id,
    email: nullableString(user.email),
    displayName: nullableString(user.displayName),
    avatarUrl: nullableString(user.avatarUrl),
  };
}

export function useAccountUser() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (!cancelled) setUser(parseAccountUser(payload));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loaded };
}
