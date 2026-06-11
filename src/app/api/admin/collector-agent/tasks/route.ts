import { getAdminPasswordFromRequest } from "@/lib/admin";
import { requireAdminOrCronPassword } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { z } from "zod";

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 20;
const FAMILY_HOSTS: Record<string, string[]> = {
  "liandong-shop": ["pay.ldxp.cn", "ldxp.cn"],
  ldxp: ["pay.ldxp.cn", "ldxp.cn"],
};

const querySchema = z.object({
  kind: z.string().optional().default("shopApi"),
  family: z.string().optional().default("pay.ldxp.cn"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
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

    const hostCandidates = familyHosts(query.family);
    const { data: sources, error } = await supabase
      .from("sources")
      .select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,last_checked_at,last_success_at")
      .eq("enabled", true)
      .eq("collector_kind", query.kind)
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true })
      .limit(Math.max(query.limit * 8, query.limit));

    if (error) throw error;

    const selectedSources = (sources || [])
      .filter((source) => source.collection_method !== "public_json")
      .filter((source) => {
        const sourceUrl = String(source.entry_url || source.base_url || "");
        const baseUrl = String(source.base_url || deriveBaseUrl(sourceUrl) || "");
        const host = normalizeHostname(baseUrl || sourceUrl);
        return hostCandidates.includes(host);
      })
      .slice(0, query.limit);

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
      generatedAt: new Date().toISOString(),
      kind: query.kind,
      family: query.family,
      limit: query.limit,
      tasks,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "下发采集任务失败。" },
      { status },
    );
  }
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

function familyHosts(value: string): string[] {
  const normalized = value.trim().toLowerCase();
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
