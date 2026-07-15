import "server-only";

import crypto from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase";

export type RuntimeLease = {
  acquired: boolean;
  leaseKey: string;
  owner: string;
  expiresAt: string | null;
};

export function createRuntimeLeaseOwner(scope: string): string {
  return `${cleanLeasePart(scope)}:${crypto.randomUUID()}`;
}

export async function claimRuntimeLease(input: {
  leaseKey: string;
  owner: string;
  leaseSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<RuntimeLease> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase.rpc("claim_runtime_lease", {
    p_lease_key: input.leaseKey,
    p_owner: input.owner,
    p_lease_seconds: input.leaseSeconds || 1800,
    p_metadata: input.metadata || {},
  });
  if (error) throw error;

  const row = asRecord(data);
  return {
    acquired: row.acquired === true,
    leaseKey: stringValue(row.leaseKey) || input.leaseKey,
    owner: stringValue(row.owner) || "",
    expiresAt: stringValue(row.expiresAt),
  };
}

export async function releaseRuntimeLease(leaseKey: string, owner: string): Promise<boolean> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase.rpc("release_runtime_lease", {
    p_lease_key: leaseKey,
    p_owner: owner,
  });
  if (error) throw error;
  return data === true;
}

export async function renewRuntimeLease(input: {
  leaseKey: string;
  owner: string;
  leaseSeconds?: number;
}): Promise<RuntimeLease & { renewed: boolean }> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase.rpc("renew_runtime_lease", {
    p_lease_key: input.leaseKey,
    p_owner: input.owner,
    p_lease_seconds: input.leaseSeconds || 1800,
  });
  if (error) throw error;

  const row = asRecord(data);
  return {
    acquired: row.renewed === true,
    renewed: row.renewed === true,
    leaseKey: stringValue(row.leaseKey) || input.leaseKey,
    owner: stringValue(row.owner) || "",
    expiresAt: stringValue(row.expiresAt),
  };
}

function getRequiredSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法取得跨运行租约。");
  return supabase;
}

function cleanLeasePart(value: string): string {
  return value.trim().replace(/[^a-z0-9:_-]+/gi, "-").slice(0, 80) || "runtime";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
