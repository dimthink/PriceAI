import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeEnv } from "@/lib/runtime-env";

const SNAPSHOT_READ_TIMEOUT_MS = 2_500;
const SNAPSHOT_WRITE_TIMEOUT_MS = 15_000;
const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";
export const PUBLIC_API_SNAPSHOT_SCHEMA_VERSION = 1;

let snapshotClient: SupabaseClient | null = null;

export type PublicApiSnapshotKind =
  | "explorer"
  | "offers"
  | "product_offers"
  | "merchants"
  | "refresh_state"
  | "api_transit";

export type PublicApiSnapshotPayload<T> = {
  generatedAt: string;
  value: T;
};

type PublicApiSnapshotRow = {
  payload?: unknown;
  generated_at?: string | null;
  schema_version?: number | string | null;
};

export async function readPublicApiSnapshot<T>(
  kind: PublicApiSnapshotKind,
  key: string,
): Promise<PublicApiSnapshotPayload<T> | null> {
  if (isProductionBuildPhase()) return null;

  const supabase = getPublicApiSnapshotClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_api_snapshots")
    .select("payload,generated_at,schema_version")
    .eq("kind", kind)
    .eq("cache_key", key)
    .eq("schema_version", PUBLIC_API_SNAPSHOT_SCHEMA_VERSION)
    .abortSignal(AbortSignal.timeout(SNAPSHOT_READ_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    if (!isMissingSnapshotTableError(error.message)) {
      console.warn("Public API snapshot read failed:", error.message);
    }
    return null;
  }

  const row = data as PublicApiSnapshotRow | null;
  const payload = row?.payload;
  if (!payload || typeof payload !== "object") return null;

  return {
    generatedAt: row?.generated_at ? String(row.generated_at) : new Date().toISOString(),
    value: payload as T,
  };
}

export async function writePublicApiSnapshot<T>({
  kind,
  key,
  payload,
  generatedAt = new Date().toISOString(),
}: {
  kind: PublicApiSnapshotKind;
  key: string;
  payload: T;
  generatedAt?: string;
}): Promise<boolean> {
  if (isProductionBuildPhase()) return false;

  const supabase = getPublicApiSnapshotClient();
  if (!supabase) return false;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("public_api_snapshots")
    .upsert({
      kind,
      cache_key: key,
      schema_version: PUBLIC_API_SNAPSHOT_SCHEMA_VERSION,
      payload,
      generated_at: generatedAt,
      updated_at: now,
    })
    .abortSignal(AbortSignal.timeout(SNAPSHOT_WRITE_TIMEOUT_MS));

  if (error) {
    if (!isMissingSnapshotTableError(error.message)) {
      console.warn("Public API snapshot write failed:", error.message);
    }
    return false;
  }

  return true;
}

function isProductionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE;
}

function getPublicApiSnapshotClient(): SupabaseClient | null {
  const url = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) return null;

  if (!snapshotClient) {
    snapshotClient = createClient(url, key, {
      db: {
        timeout: SNAPSHOT_READ_TIMEOUT_MS,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return snapshotClient;
}

function isMissingSnapshotTableError(message: string): boolean {
  return /public_api_snapshots|schema cache/i.test(message);
}
