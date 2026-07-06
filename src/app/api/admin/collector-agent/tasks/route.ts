import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminOrCronRequest } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { z } from "zod";

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 20;
const DEFAULT_COOLDOWN_MINUTES = 25;
const FAMILY_HOSTS: Record<string, string[]> = {
  "liandong-shop": ["pay.ldxp.cn", "ldxp.cn"],
  ldxp: ["pay.ldxp.cn", "ldxp.cn"],
};
const ALL_SHOPAPI_FAMILIES = new Set(["all", "*", "shopapi", "shop-api"]);

const querySchema = z.object({
  kind: z.string().optional().default("shopApi"),
  family: z.string().optional().default("pay.ldxp.cn"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  shardCount: z.coerce.number().int().min(1).max(32).optional().default(1),
  shardIndex: z.coerce.number().int().min(0).max(31).optional().default(0),
  staleBefore: z.string().datetime().optional(),
  excludeSourceIds: z.string().optional(),
  worker: z.string().trim().min(1).max(160).optional(),
  lockSeconds: z.coerce.number().int().min(60).max(7200).optional().default(1800),
  includeQueued: z.string().optional().default("1"),
});

export async function GET(request: Request) {
  try {
    await requireAdminOrCronRequest(request);

    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置，无法下发采集任务。");

    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams.entries()));
    if (query.kind !== "shopApi") {
      return Response.json(
        { ok: false, message: "轻量采集节点当前仅支持 shopApi。" },
        { status: 400 },
      );
    }
    if (query.shardIndex >= query.shardCount) {
      return Response.json(
        { ok: false, message: "分片参数无效：shardIndex 必须小于 shardCount。" },
        { status: 400 },
      );
    }

    const hostCandidates = familyHosts(query.family);
    const generatedAt = new Date().toISOString();
    const staleBefore = query.staleBefore ? new Date(query.staleBefore).toISOString() : null;
    const excludedSourceIds = new Set(
      (query.excludeSourceIds || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    const queuedTasks = truthyQueryFlag(query.includeQueued)
      ? await claimQueuedSourceTasks({
          kind: query.kind,
          family: query.family,
          hostCandidates,
          limit: query.limit,
          shardCount: query.shardCount,
          shardIndex: query.shardIndex,
          excludedSourceIds,
          worker: query.worker || `collector-agent:${query.kind}:${query.shardIndex}/${query.shardCount}`,
          lockSeconds: query.lockSeconds,
        })
      : [];
    if (queuedTasks.length) {
      return Response.json({
        ok: true,
        generatedAt,
        kind: query.kind,
        family: query.family,
        limit: query.limit,
        shardCount: query.shardCount,
        shardIndex: query.shardIndex,
        staleBefore,
        source: "collection_jobs",
        tasks: queuedTasks,
      });
    }

    const fetchLimit = Math.max(query.limit * 50 * query.shardCount, query.limit);
    let sourcesQuery = supabase
      .from("sources")
      .select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,last_checked_at,last_success_at")
      .eq("enabled", true)
      .eq("collector_kind", query.kind)
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true })
      .limit(Math.min(fetchLimit, 1000));

    if (staleBefore) {
      sourcesQuery = sourcesQuery.or(`last_checked_at.is.null,last_checked_at.lte.${staleBefore}`);
    }

    const { data: sources, error } = await sourcesQuery;

    if (error) throw error;

    const selectedSources = (sources || [])
      .filter((source) => source.collection_method !== "public_json")
      .filter((source) => !excludedSourceIds.has(String(source.id)))
      .filter((source) => !sourceWithinCooldown(source.last_checked_at, generatedAt))
      .filter((source) => sourceInShard(String(source.id), query.shardCount, query.shardIndex))
      .filter((source) => {
        const sourceUrl = String(source.entry_url || source.base_url || "");
        const baseUrl = String(source.base_url || deriveBaseUrl(sourceUrl) || "");
        if (!hostCandidates) return true;

        const host = normalizeHostname(baseUrl || sourceUrl);
        return hostCandidates.includes(host);
      })
      .slice(0, query.limit);

    await markSourcesDispatched(selectedSources.map((source) => String(source.id)), generatedAt);
    const rawOfferUrlsBySource = await loadRawOfferUrlsBySource(selectedSources.map((source) => String(source.id)));
    const tasks = selectedSources.map((source) => sourceTaskFromRow(source, rawOfferUrlsBySource.get(String(source.id)) || []));

    return Response.json({
      ok: true,
      generatedAt,
      kind: query.kind,
      family: query.family,
      limit: query.limit,
      shardCount: query.shardCount,
      shardIndex: query.shardIndex,
      staleBefore,
      tasks,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : isUnauthorizedError(error) ? 401 : 500;
    logApiError("collector agent tasks", error);
    return Response.json(
      {
        ok: false,
        message: status === 500
          ? "下发采集任务失败。"
          : safeApiErrorMessage(error, "下发采集任务失败。"),
      },
      { status },
    );
  }
}

async function claimQueuedSourceTasks(input: {
  kind: string;
  family: string;
  hostCandidates: string[] | null;
  limit: number;
  shardCount: number;
  shardIndex: number;
  excludedSourceIds: Set<string>;
  worker: string;
  lockSeconds: number;
}): Promise<Array<ReturnType<typeof sourceTaskFromRow> & {
  collectionJobId: string;
  collectionJobRequestedBy: string | null;
  collectionJobCreatedAt: string | null;
}>> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  await reapExpiredCollectionJobs(input.worker);

  const { data: jobs, error: jobsError } = await supabase
    .from("collection_jobs")
    .select("id,source_id,source_name,status,requested_by,created_at,priority,attempts,max_attempts,locked_until")
    .eq("job_type", "source")
    .in("status", ["pending", "running"])
    .not("source_id", "is", null)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(input.limit * 20, 20), 100));
  if (jobsError) throw jobsError;

  const sourceIds = Array.from(new Set((jobs || []).map((job) => String(job.source_id || "")).filter(Boolean)));
  if (!sourceIds.length) return [];

  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,last_checked_at,last_success_at")
    .in("id", sourceIds);
  if (sourcesError) throw sourcesError;

  const sourceById = new Map((sources || []).map((source) => [String(source.id), source]));
  const tasks: Array<ReturnType<typeof sourceTaskFromRow> & {
    collectionJobId: string;
    collectionJobRequestedBy: string | null;
    collectionJobCreatedAt: string | null;
  }> = [];
  const selectedSourceIds = new Set<string>();
  const nowMs = Date.now();

  for (const job of jobs || []) {
    if (tasks.length >= input.limit) break;
    if (!claimableJobCandidate(job, nowMs)) continue;
    const sourceId = String(job.source_id || "");
    if (!sourceId || input.excludedSourceIds.has(sourceId) || selectedSourceIds.has(sourceId)) continue;

    const source = sourceById.get(sourceId);
    if (!source || !source.enabled || source.collection_method === "public_json") continue;
    if (source.collector_kind !== input.kind) continue;
    if (!sourceInShard(sourceId, input.shardCount, input.shardIndex)) continue;

    const sourceUrl = String(source.entry_url || source.base_url || "");
    const baseUrl = String(source.base_url || deriveBaseUrl(sourceUrl) || "");
    if (input.hostCandidates) {
      const host = normalizeHostname(baseUrl || sourceUrl);
      if (!input.hostCandidates.includes(host)) continue;
    }

    const { data: claimed, error: claimError } = await supabase.rpc("claim_collection_job_by_id", {
      p_job_id: String(job.id),
      p_worker: input.worker,
      p_lock_seconds: input.lockSeconds,
    });
    if (claimError) {
      if (isMissingClaimByIdRpcError(claimError)) return tasks;
      throw claimError;
    }
    const claimedJob = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!claimedJob) continue;

    const rawOfferUrlsBySource = await loadRawOfferUrlsBySource([sourceId]);
    tasks.push({
      ...sourceTaskFromRow(source, rawOfferUrlsBySource.get(sourceId) || []),
      collectionJobId: String(job.id),
      collectionJobRequestedBy: job.requested_by ? String(job.requested_by) : null,
      collectionJobCreatedAt: job.created_at ? String(job.created_at) : null,
    });
    selectedSourceIds.add(sourceId);
  }

  await markSourcesDispatched(tasks.map((task) => task.sourceId), new Date().toISOString());
  return tasks;
}

async function reapExpiredCollectionJobs(worker: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase.rpc("reap_expired_collection_jobs", {
    p_worker: worker,
    p_limit: 50,
  });
  if (error && !isMissingReapRpcError(error)) throw error;
}

async function markSourcesDispatched(sourceIds: string[], checkedAt: string): Promise<void> {
  if (!sourceIds.length) return;

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("sources")
    .update({
      last_checked_at: checkedAt,
      updated_at: checkedAt,
    })
    .in("id", sourceIds);

  if (error) throw error;
}

async function loadRawOfferUrlsBySource(sourceIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!sourceIds.length) return map;

  const supabase = getSupabaseServerClient();
  if (!supabase) return map;

  const { data, error } = await supabase
    .from("raw_offers")
    .select("source_id,url")
    .in("source_id", sourceIds)
    .eq("hidden", false)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) throw error;

  for (const row of data || []) {
    const sourceId = String(row.source_id || "");
    const url = String(row.url || "");
    if (!sourceId || !url) continue;
    const urls = map.get(sourceId) || [];
    if (urls.length < 20) urls.push(url);
    map.set(sourceId, urls);
  }

  return map;
}

function sourceTaskFromRow(source: {
  id: unknown;
  name?: unknown;
  base_url?: unknown;
  entry_url?: unknown;
  collector_kind?: unknown;
  last_checked_at?: unknown;
  last_success_at?: unknown;
}, rawOfferUrls: string[]) {
  const sourceUrl = String(source.entry_url || source.base_url || "");
  const baseUrl = String(source.base_url || deriveBaseUrl(sourceUrl) || "");
  return {
    sourceId: String(source.id || ""),
    sourceName: String(source.name || source.id),
    sourceUrl,
    baseUrl,
    collectorKind: String(source.collector_kind || ""),
    lastCheckedAt: source.last_checked_at ? String(source.last_checked_at) : null,
    lastSuccessAt: source.last_success_at ? String(source.last_success_at) : null,
    rawOfferUrls,
  };
}

function claimableJobCandidate(job: {
  status?: unknown;
  locked_until?: unknown;
  attempts?: unknown;
  max_attempts?: unknown;
}, nowMs: number): boolean {
  const status = String(job.status || "pending");
  if (status === "pending") return true;
  if (status !== "running") return false;

  const lockedUntil = new Date(String(job.locked_until || "")).getTime();
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.max_attempts || 1);
  return Number.isFinite(lockedUntil) && lockedUntil < nowMs && attempts < maxAttempts;
}

function isMissingClaimByIdRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const text = [
    candidate.code,
    candidate.message,
    candidate.details,
    candidate.hint,
  ]
    .map((value) => String(value || ""))
    .join(" ");

  return /claim_collection_job_by_id|function/i.test(text) && /PGRST202|not find|not found|missing|does not exist/i.test(text);
}

function isMissingReapRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const text = [
    candidate.code,
    candidate.message,
    candidate.details,
    candidate.hint,
  ]
    .map((value) => String(value || ""))
    .join(" ");

  return /reap_expired_collection_jobs|function/i.test(text) && /PGRST202|not find|not found|missing|does not exist/i.test(text);
}

function sourceWithinCooldown(value: unknown, nowIso: string): boolean {
  if (!value) return false;

  const checkedAt = new Date(String(value)).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(checkedAt) || !Number.isFinite(now)) return false;

  return now - checkedAt < DEFAULT_COOLDOWN_MINUTES * 60 * 1000;
}

function sourceInShard(sourceId: string, shardCount: number, shardIndex: number): boolean {
  if (shardCount <= 1) return true;
  return positiveHash(sourceId) % shardCount === shardIndex;
}

function positiveHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && /未授权|无权|unauthorized/i.test(error.message);
}

function familyHosts(value: string): string[] | null {
  const normalized = value.trim().toLowerCase();
  if (ALL_SHOPAPI_FAMILIES.has(normalized)) return null;
  if (FAMILY_HOSTS[normalized]) return FAMILY_HOSTS[normalized];

  return normalized
    .split(",")
    .map((item) => normalizeHostname(item))
    .filter(Boolean);
}

function deriveBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function normalizeHostname(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function truthyQueryFlag(value: string | undefined): boolean {
  if (value === undefined) return true;
  return /^(1|true|yes|on)$/i.test(value.trim());
}
