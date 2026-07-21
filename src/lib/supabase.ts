import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_PRICE_CACHE_ONLY_MODE } from "@/lib/public-price-emergency";
import { getRuntimeEnv } from "@/lib/runtime-env";

const SUPABASE_DB_TIMEOUT_MS = 8_000;
const SUPABASE_CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";

let serverClient: SupabaseClient | null = null;
let supabaseUnavailableUntil = 0;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (PUBLIC_PRICE_CACHE_ONLY_MODE && process.env.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE) {
    return null;
  }

  const url = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) return null;

  if (!serverClient) {
    serverClient = createClient(url, key, {
      db: {
        timeout: SUPABASE_DB_TIMEOUT_MS,
      },
      global: {
        fetch: supabaseFetchWithCircuitBreaker,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}

async function supabaseFetchWithCircuitBreaker(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  if (supabaseUnavailableUntil > now) {
    throw abortLikeError("Supabase temporarily unavailable; circuit breaker is open.");
  }

  try {
    const response = await fetch(input, init);
    if (response.status === 520 || response.status === 522 || response.status === 524) {
      openSupabaseCircuitBreaker();
    }
    return response;
  } catch (error) {
    if (isTransportFailure(error)) openSupabaseCircuitBreaker();
    throw error;
  }
}

function openSupabaseCircuitBreaker(): void {
  supabaseUnavailableUntil = Date.now() + SUPABASE_CIRCUIT_BREAKER_COOLDOWN_MS;
}

function isTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { message?: unknown; name?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";

  if (name === "AbortError" || name === "TimeoutError") return false;

  return (
    name === "TypeError" ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("econnreset")
  );
}

function abortLikeError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
