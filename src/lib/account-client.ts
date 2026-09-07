"use client";

import { useEffect, useState } from "react";
import {
  ACCOUNT_AUTH_HINT_COOKIE,
  ACCOUNT_AUTH_HINT_MAX_AGE_SECONDS,
  type AccountAuthHint,
} from "@/lib/account-auth-hint";

const ACCOUNT_SYNC_KEY = "priceai:account-sync:v1";
const ACCOUNT_REQUEST_TTL_MS = 5_000;
let accountRequest: { startedAt: number; expiresAt: number; promise: Promise<AccountUser | null> } | null = null;

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

    const load = (force = false) => {
      void fetchAccountUser(force).then((nextUser) => {
        if (cancelled) return;
        setUser(nextUser);
        setLoaded(true);
        broadcastAccountSignature(nextUser);
      });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACCOUNT_SYNC_KEY) load(true);
    };
    const handleFocus = () => load(true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load(true);
    };

    load();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { user, loaded };
}

export function notifyAccountChanged(user: AccountUser | null = null): void {
  accountRequest = null;
  writeAccountAuthHint(user ? "authenticated" : "anonymous");
  broadcastAccountSignature(user, true);
}

function fetchAccountUser(force: boolean): Promise<AccountUser | null> {
  const now = Date.now();
  if (readAccountAuthHint() === "anonymous") return Promise.resolve(null);
  if (accountRequest && accountRequest.expiresAt > now && (!force || now - accountRequest.startedAt < 1_000)) {
    return accountRequest.promise;
  }

  const promise = fetch("/api/account/me", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const user = parseAccountUser(await response.json());
      writeAccountAuthHint(user ? "authenticated" : "anonymous");
      return user;
    })
    .catch(() => null);
  accountRequest = { startedAt: now, expiresAt: now + ACCOUNT_REQUEST_TTL_MS, promise };
  return promise;
}

function readAccountAuthHint(): AccountAuthHint | null {
  const prefix = `${ACCOUNT_AUTH_HINT_COOKIE}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  const value = cookie?.slice(prefix.length);
  return value === "authenticated" || value === "anonymous" ? value : null;
}

function writeAccountAuthHint(value: AccountAuthHint): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCOUNT_AUTH_HINT_COOKIE}=${value}; Path=/; Max-Age=${ACCOUNT_AUTH_HINT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function broadcastAccountSignature(user: AccountUser | null, force = false): void {
  try {
    const signature = user?.id || "anonymous";
    if (!force && window.localStorage.getItem(ACCOUNT_SYNC_KEY) === signature) return;
    window.localStorage.setItem(ACCOUNT_SYNC_KEY, force ? `${signature}:${Date.now()}` : signature);
  } catch {
    // Cross-tab synchronization is best-effort.
  }
}
