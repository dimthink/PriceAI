import "server-only";

import crypto from "node:crypto";
import { getPublicClientFingerprint, PublicRequestError } from "@/lib/public-request";
import { getSponsorSettingsSummary } from "@/lib/sponsor-settings";
import { isLdxpHost } from "@/lib/ldxp-domain-settings-shared";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  OutboundAnalyticsEntityType,
  OutboundAnalyticsEventType,
  OutboundAnalyticsRollup,
  OutboundAnalyticsSummary,
} from "@/lib/types";

export type RecordOutboundAnalyticsEventInput = {
  eventType: "sponsor_click";
  entityType: "sponsor";
  entityId: string;
  placement?: string | null;
  creativeId?: string | null;
  campaignId?: string | null;
  targetUrl?: string | null;
  pagePath?: string | null;
  referrerPath?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ResolvedOutboundAnalyticsEvent = RecordOutboundAnalyticsEventInput & {
  metadata: Record<string, unknown>;
};

type RollupRow = Record<string, unknown>;
type TotalsRow = Record<string, unknown>;
type EventTotalsRow = Record<string, unknown>;
const WINDOW_DAYS = 30;
const MAX_METADATA_KEYS = 16;
const allowedEventTypes = new Set<OutboundAnalyticsEventType>(["sponsor_click"]);
const allowedEntityTypes = new Set<OutboundAnalyticsEntityType>(["sponsor"]);

export function getEmptyOutboundAnalyticsSummary(message = "尚未加载点击归因数据。"): OutboundAnalyticsSummary {
  const configured = Boolean(getSupabaseServerClient());
  return {
    configured,
    tableReady: false,
    source: configured ? "static" : "unconfigured",
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    message,
    totals: { clicks30d: 0, clicks7d: 0, uniqueSessions30d: 0, uniqueSessions7d: 0 },
    eventTotals: [],
    topEntities: [],
  };
}

export async function recordOutboundAnalyticsEvent(
  input: RecordOutboundAnalyticsEventInput,
  request: Request,
): Promise<{ recorded: boolean; configured: boolean; tableReady: boolean }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { recorded: false, configured: false, tableReady: false };
  if (
    input.eventType !== "sponsor_click" ||
    input.entityType !== "sponsor"
  ) {
    throw new Error("Invalid outbound analytics event type.");
  }
  const entityId = compactText(input.entityId, 200);
  if (!entityId) throw new Error("Missing outbound analytics entity id.");

  const resolved = await resolveKnownOutboundEvent({ ...input, entityId });
  const target = normalizeTargetUrl(resolved.targetUrl || null);
  const userAgent = request.headers.get("user-agent");
  const { error } = await supabase.from("outbound_analytics_events").insert({
    event_type: resolved.eventType,
    entity_type: resolved.entityType,
    entity_id: resolved.entityId,
    placement: compactText(resolved.placement, 160),
    creative_id: compactText(resolved.creativeId, 200),
    campaign_id: compactText(resolved.campaignId, 200),
    target_host: target.host,
    target_url_hash: target.hash,
    page_path: compactPath(resolved.pagePath, 500),
    referrer_path: compactPath(resolved.referrerPath, 500),
    session_id: compactText(resolved.sessionId, 120),
    submitter_ip: dailyFingerprint(getPublicClientFingerprint(request)),
    user_agent_hash: userAgent ? dailyFingerprint(userAgent) : null,
    metadata: compactMetadata(resolved.metadata),
  });
  if (error) {
    if (error.code === "P0001" && error.message === "outbound_rate_limit_exceeded") {
      throw new PublicRequestError("提交过于频繁，请稍后再试。", 429);
    }
    if (isMissingAnalyticsDatabaseError(error.code)) {
      return { recorded: false, configured: true, tableReady: false };
    }
    throw new Error(error.message || "Outbound analytics insert failed.");
  }
  return { recorded: true, configured: true, tableReady: true };
}

async function resolveKnownOutboundEvent(
  input: RecordOutboundAnalyticsEventInput & { entityId: string },
): Promise<ResolvedOutboundAnalyticsEvent> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const settings = await getSponsorSettingsSummary();
  for (const [placement, config] of Object.entries(settings.placements)) {
    if (!settings.enabled || !config.enabled) continue;
    const creative = config.creatives.find((item) =>
      item.enabled && item.status === "live" &&
      [item.id, item.campaignId].filter(Boolean).includes(input.entityId),
    );
    if (!creative) continue;
    return {
      ...input,
      entityId: creative.campaignId || creative.id,
      placement,
      creativeId: creative.id,
      campaignId: creative.campaignId || creative.id,
      targetUrl: validatedTargetUrl(input.targetUrl, [creative.targetUrl]),
      metadata: pickMetadata(input.eventType, input.metadata),
    };
  }
  throw new PublicRequestError("赞助活动已不存在或不可归因。", 400);
}

function validatedTargetUrl(preferred: string | null | undefined, candidates: Array<string | null>): string | null {
  const fallback = candidates.find((value): value is string => Boolean(value)) || null;
  const requested = compactText(preferred, 2048);
  if (!requested) return fallback;
  if (requested.startsWith("/") && candidates.includes(requested)) return requested;

  try {
    const requestedUrl = new URL(requested);
    const matchesKnownHost = candidates.some((candidate) => {
      if (!candidate || candidate.startsWith("/")) return false;
      try {
        const candidateUrl = new URL(candidate);
        return candidateUrl.hostname === requestedUrl.hostname ||
          (isLdxpHost(candidateUrl.hostname) && isLdxpHost(requestedUrl.hostname));
      } catch {
        return false;
      }
    });
    return matchesKnownHost ? requested : fallback;
  } catch {
    return fallback;
  }
}

const metadataKeysByEvent: Record<RecordOutboundAnalyticsEventInput["eventType"], ReadonlySet<string>> = {
  sponsor_click: new Set(["placement_id", "sponsor_name", "path"]),
};

function pickMetadata(eventType: RecordOutboundAnalyticsEventInput["eventType"], value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const allowedKeys = metadataKeysByEvent[eventType];
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => allowedKeys.has(key)));
}

export async function getOutboundAnalyticsSummary(): Promise<OutboundAnalyticsSummary> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return getEmptyOutboundAnalyticsSummary("Supabase 未配置，无法读取点击归因数据。");

  const generatedAt = new Date().toISOString();
  const since30d = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [rollupResult, eventTotalsResult, totalsResult] = await Promise.all([
    supabase.rpc("list_outbound_analytics_rollups", { p_since: since30d, p_limit: 200 }),
    supabase.rpc("list_outbound_analytics_event_totals", { p_since: since30d }),
    supabase.rpc("get_outbound_analytics_totals", { p_since: since30d, p_recent_since: since7d }).limit(1),
  ]);
  const error = rollupResult.error || eventTotalsResult.error || totalsResult.error;
  if (error) {
    if (isMissingAnalyticsDatabaseError(error.code)) {
      return getEmptyOutboundAnalyticsSummary("点击归因表或汇总函数尚未迁移。");
    }
    throw error;
  }

  const rollups = ((rollupResult.data || []) as RollupRow[])
    .map(mapRollupRow)
    .filter((row): row is OutboundAnalyticsRollup => Boolean(row));
  const totals = mapTotalsRow(((totalsResult.data || []) as TotalsRow[])[0]);
  return {
    configured: true,
    tableReady: true,
    source: "database",
    generatedAt,
    windowDays: WINDOW_DAYS,
    message: null,
    totals,
    eventTotals: ((eventTotalsResult.data || []) as EventTotalsRow[])
      .map(mapEventTotalsRow)
      .filter((row): row is OutboundAnalyticsSummary["eventTotals"][number] => Boolean(row)),
    topEntities: rollups,
  };
}

function mapRollupRow(row: RollupRow): OutboundAnalyticsRollup | null {
  const eventType = stringValue(row.event_type) as OutboundAnalyticsEventType | null;
  const entityType = stringValue(row.entity_type) as OutboundAnalyticsEntityType | null;
  const entityId = stringValue(row.entity_id);
  if (!eventType || !allowedEventTypes.has(eventType) || !entityType || !allowedEntityTypes.has(entityType) || !entityId) return null;
  return {
    eventType, entityType, entityId,
    offerId: stringValue(row.offer_id),
    sourceId: stringValue(row.source_id),
    productId: stringValue(row.product_id),
    stationId: stringValue(row.station_id),
    placement: stringValue(row.placement),
    creativeId: stringValue(row.creative_id),
    campaignId: stringValue(row.campaign_id),
    targetHost: stringValue(row.target_host),
    clickCount: numberValue(row.click_count),
    uniqueSessionCount: numberValue(row.unique_session_count),
    lastClickedAt: stringValue(row.last_clicked_at),
  };
}

function mapTotalsRow(row: TotalsRow | undefined): OutboundAnalyticsSummary["totals"] {
  return {
    clicks30d: numberValue(row?.clicks_total),
    clicks7d: numberValue(row?.clicks_recent),
    uniqueSessions30d: numberValue(row?.unique_sessions_total),
    uniqueSessions7d: numberValue(row?.unique_sessions_recent),
  };
}

function mapEventTotalsRow(row: EventTotalsRow): OutboundAnalyticsSummary["eventTotals"][number] | null {
  const eventType = stringValue(row.event_type) as OutboundAnalyticsEventType | null;
  if (!eventType || !allowedEventTypes.has(eventType)) return null;
  return {
    eventType,
    clickCount: numberValue(row.event_count),
    uniqueSessionCount: numberValue(row.unique_session_count),
    lastClickedAt: stringValue(row.last_occurred_at),
  };
}

function normalizeTargetUrl(value: string | null): { host: string | null; hash: string | null } {
  const trimmed = value?.trim();
  if (!trimmed) return { host: null, hash: null };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { host: null, hash: hmacDigest(trimmed) };
    return { host: compactText(url.hostname.replace(/^www\./, ""), 200), hash: hmacDigest(url.toString()) };
  } catch {
    return { host: null, hash: hmacDigest(trimmed) };
  }
}

function compactMetadata(value: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value || {}).slice(0, MAX_METADATA_KEYS)) {
    const normalizedKey = compactText(key, 80);
    if (!normalizedKey) continue;
    if (typeof raw === "string") {
      const text = compactText(raw, 300);
      if (text !== null) output[normalizedKey] = text;
    } else if (typeof raw === "number" && Number.isFinite(raw)) output[normalizedKey] = raw;
    else if (typeof raw === "boolean") output[normalizedKey] = raw;
  }
  return output;
}

function compactPath(value: string | null | undefined, maxLength: number): string | null {
  const text = compactText(value, maxLength);
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return text.startsWith("/") ? text : null;
  try {
    const url = new URL(text);
    return compactText(`${url.pathname}${url.search}`, maxLength);
  } catch {
    return null;
  }
}

function compactText(value: string | null | undefined, maxLength: number): string | null {
  const text = value?.trim();
  return text ? text.slice(0, maxLength) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function hmacDigest(value: string): string {
  const secret = process.env.OUTBOUND_ANALYTICS_HASH_SECRET || process.env.IP_HASH_SECRET || process.env.ADMIN_SESSION_SECRET || "priceai-outbound-analytics-v1";
  return crypto.createHmac("sha256", secret).update(value).digest("hex").slice(0, 48);
}

function dailyFingerprint(value: string): string {
  return hmacDigest(`${new Date().toISOString().slice(0, 10)}:${value}`);
}

function isMissingAnalyticsDatabaseError(code: string | undefined): boolean {
  return code === "42P01" || code === "42883" || code === "PGRST202";
}
