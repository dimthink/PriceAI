import "server-only";

import crypto from "node:crypto";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";

const WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;
const MAX_FAILURES = 8;

type RateLimitResult = {
  retryAfterSeconds: number;
  failureCount: number;
  persistent: boolean;
};

type LocalFailureState = {
  count: number;
  windowStartedAt: number;
  lockedUntil: number;
};

const localFailures = new Map<string, LocalFailureState>();

export function adminLoginRequestKey(request: Request): string {
  const clientIp = getClientIp(request);
  const secret = getRuntimeEnv("ADMIN_SESSION_SECRET") || getRuntimeEnv("ADMIN_PASSWORD") || "priceai-admin-rate-limit";
  return crypto.createHmac("sha256", secret).update(clientIp).digest("base64url");
}

export async function readAdminLoginRateLimit(keyHash: string): Promise<RateLimitResult> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("read_admin_login_rate_limit", {
        p_key_hash: keyHash,
        p_window_seconds: WINDOW_SECONDS,
      });
      if (error) throw error;
      return normalizeResult(data, true);
    } catch {
      // The database-backed limiter is preferred, but admin recovery must still
      // have a conservative isolate-local fallback during a Supabase incident.
    }
  }
  return readLocalRateLimit(keyHash);
}

export async function recordAdminLoginAttempt(keyHash: string, succeeded: boolean): Promise<RateLimitResult> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("record_admin_login_attempt", {
        p_key_hash: keyHash,
        p_succeeded: succeeded,
        p_window_seconds: WINDOW_SECONDS,
        p_max_failures: MAX_FAILURES,
        p_lock_seconds: LOCK_SECONDS,
      });
      if (error) throw error;
      if (succeeded) localFailures.delete(keyHash);
      return normalizeResult(data, true);
    } catch {
      // Fall through to the local limiter when the migration is not applied yet
      // or Supabase is unavailable.
    }
  }
  return recordLocalAttempt(keyHash, succeeded);
}

function readLocalRateLimit(keyHash: string): RateLimitResult {
  pruneLocalFailures();
  const state = localFailures.get(keyHash);
  if (!state) return { retryAfterSeconds: 0, failureCount: 0, persistent: false };
  const now = Date.now();
  return {
    retryAfterSeconds: state.lockedUntil > now ? Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)) : 0,
    failureCount: state.count,
    persistent: false,
  };
}

function recordLocalAttempt(keyHash: string, succeeded: boolean): RateLimitResult {
  if (succeeded) {
    localFailures.delete(keyHash);
    return { retryAfterSeconds: 0, failureCount: 0, persistent: false };
  }

  const now = Date.now();
  const current = localFailures.get(keyHash);
  const state = current && now - current.windowStartedAt <= WINDOW_SECONDS * 1000
    ? current
    : { count: 0, windowStartedAt: now, lockedUntil: 0 };
  state.count += 1;
  if (state.count >= MAX_FAILURES) state.lockedUntil = now + LOCK_SECONDS * 1000;
  localFailures.set(keyHash, state);
  return readLocalRateLimit(keyHash);
}

function pruneLocalFailures(): void {
  const now = Date.now();
  for (const [key, state] of localFailures) {
    if (now - state.windowStartedAt > WINDOW_SECONDS * 1000 && state.lockedUntil <= now) {
      localFailures.delete(key);
    }
  }
  if (localFailures.size <= 500) return;
  for (const key of localFailures.keys()) {
    localFailures.delete(key);
    if (localFailures.size <= 400) break;
  }
}

function normalizeResult(value: unknown, persistent: boolean): RateLimitResult {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    retryAfterSeconds: boundedInteger(row.retryAfterSeconds, 0, 0, 86400),
    failureCount: boundedInteger(row.failureCount, 0, 0, 1000),
    persistent,
  };
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function getClientIp(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
