import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminOrCronPassword } from "@/lib/env";
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
});

export async function GET(request: Request) {
  try {
    requireAdminOrCronPassword(getAdminPasswordFromRequest(request));

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
    const tasks = selectedSources.map((source) => {
      const sourceUrl = String(source.entry_url || source.base_url || "");
      const baseUrl = String(source.base_url || deriveBaseUrl(sourceUrl) || "");
      return {
        sourceId: String(source.id),
        sourceName: String(source.name || source.id),
        sourceUrl,
        baseUrl,
        collectorKind: query.kind,
        lastCheckedAt: source.last_checked_at ? String(source.last_checked_at) : null,
        lastSuccessAt: source.last_success_at ? String(source.last_success_at) : null,
        rawOfferUrls: rawOfferUrlsBySource.get(String(source.id)) || [],
      };
    });

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
