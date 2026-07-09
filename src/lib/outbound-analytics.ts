import "server-only";

import crypto from "node:crypto";
import {
  getPublicClientFingerprint,
} from "@/lib/public-request";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  OutboundAnalyticsEntityType,
  OutboundAnalyticsEventType,
  OutboundAnalyticsRollup,
  OutboundAnalyticsSummary,
} from "@/lib/types";

export type RecordOutboundAnalyticsEventInput = {
  eventType: OutboundAnalyticsEventType;
  entityType: OutboundAnalyticsEntityType;
  entityId: string;
  offerId?: string | null;
  sourceId?: string | null;
  productId?: string | null;
  stationId?: string | null;
  placement?: string | null;
  creativeId?: string | null;
  campaignId?: string | null;
  targetUrl?: string | null;
  pagePath?: string | null;
  referrerPath?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OutboundAnalyticsRollupRow = {
  event_type?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  offer_id?: unknown;
  source_id?: unknown;
  product_id?: unknown;
  station_id?: unknown;
  placement?: unknown;
  creative_id?: unknown;
  campaign_id?: unknown;
  target_host?: unknown;
  click_count?: unknown;
  unique_session_count?: unknown;
  last_clicked_at?: unknown;
};

type OutboundAnalyticsTotalsRow = {
  clicks_total?: unknown;
  clicks_recent?: unknown;
  unique_sessions_total?: unknown;
  unique_sessions_recent?: unknown;
};

const OUTBOUND_ANALYTICS_WINDOW_DAYS = 30;
const HASH_SECRET_FALLBACK = "priceai-outbound-analytics-v1";
const MAX_METADATA_KEYS = 16;

const allowedEventTypes = new Set<OutboundAnalyticsEventType>([
  "card_offer_click",
  "merchant_shop_click",
  "api_transit_outbound_click",
  "api_transit_coupon_copy",
  "sponsor_click",
]);

const allowedEntityTypes = new Set<OutboundAnalyticsEntityType>([
  "card_offer",
  "merchant",
  "api_transit_station",
  "sponsor",
]);

export function getEmptyOutboundAnalyticsSummary(
  message = "尚未加载点击归因数据。",
): OutboundAnalyticsSummary {
  const configured = Boolean(getSupabaseServerClient());
  return {
    configured,
    tableReady: false,
    source: configured ? "static" : "unconfigured",
    generatedAt: new Date().toISOString(),
    windowDays: OUTBOUND_ANALYTICS_WINDOW_DAYS,
    message,
    totals: {
      clicks30d: 0,
      clicks7d: 0,
      uniqueSessions30d: 0,
      uniqueSessions7d: 0,
    },
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

  if (!allowedEventTypes.has(input.eventType) || !allowedEntityTypes.has(input.entityType)) {
    throw new Error("Invalid outbound analytics event type.");
  }

  const entityId = compactText(input.entityId, 200);
  if (!entityId) throw new Error("Missing outbound analytics entity id.");

  const target = normalizeTargetUrl(input.targetUrl || null);
  const userAgent = request.headers.get("user-agent");
  const { error } = await supabase
    .from("outbound_analytics_events")
    .insert({
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: entityId,
      offer_id: compactText(input.offerId, 200),
      source_id: compactText(input.sourceId, 200),
      product_id: compactText(input.productId, 200),
      station_id: compactText(input.stationId, 200),
      placement: compactText(input.placement, 160),
      creative_id: compactText(input.creativeId, 200),
      campaign_id: compactText(input.campaignId, 200),
      target_host: target.host,
      target_url_hash: target.hash,
      page_path: compactPath(input.pagePath, 500),
      referrer_path: compactPath(input.referrerPath, 500),
      session_id: compactText(input.sessionId, 120),
      submitter_ip: getPublicClientFingerprint(request),
      user_agent_hash: userAgent ? hmacDigest(userAgent) : null,
      metadata: compactMetadata(input.metadata),
    });

  if (error) {
    const message = error.message || "Outbound analytics insert failed.";
    if (isMissingAnalyticsTableError(message)) {
      return { recorded: false, configured: true, tableReady: false };
    }
    throw new Error(message);
  }

  return { recorded: true, configured: true, tableReady: true };
}

export async function getOutboundAnalyticsSummary(): Promise<OutboundAnalyticsSummary> {
  const supabase = getSupabaseServerClient();
  const generatedAt = new Date().toISOString();
  if (!supabase) return getEmptyOutboundAnalyticsSummary("Supabase 未配置，无法读取点击归因数据。");

  const since30d = new Date(Date.now() - OUTBOUND_ANALYTICS_WINDOW_DAYS * 86_400_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [rollupResult, totalsResult] = await Promise.all([
    supabase
      .rpc("list_outbound_analytics_rollups", { p_since: since30d }),
    supabase
      .rpc("get_outbound_analytics_totals", { p_since: since30d, p_recent_since: since7d })
      .limit(1),
  ]);

  if (rollupResult.error) {
    if (isMissingAnalyticsTableError(rollupResult.error.message)) {
      return getEmptyOutboundAnalyticsSummary("点击归因表或汇总函数尚未迁移。");
    }
    throw rollupResult.error;
  }

  if (totalsResult.error) {
    if (isMissingAnalyticsTableError(totalsResult.error.message)) {
      return getEmptyOutboundAnalyticsSummary("点击归因表或总量函数尚未迁移。");
    }
    throw totalsResult.error;
  }

  const rollups = ((rollupResult.data || []) as OutboundAnalyticsRollupRow[])
    .map(mapOutboundAnalyticsRollupRow)
    .filter((row): row is OutboundAnalyticsRollup => Boolean(row));
  const eventTotals = buildEventTotals(rollups);
  const totals = mapOutboundAnalyticsTotalsRow(((totalsResult.data || []) as OutboundAnalyticsTotalsRow[])[0]);

  return {
    configured: true,
    tableReady: true,
    source: "database",
    generatedAt,
    windowDays: OUTBOUND_ANALYTICS_WINDOW_DAYS,
    message: null,
    totals: {
      clicks30d: totals.clicks30d,
      clicks7d: totals.clicks7d,
      uniqueSessions30d: totals.uniqueSessions30d,
      uniqueSessions7d: totals.uniqueSessions7d,
    },
    eventTotals,
    topEntities: rollups,
  };
}

function mapOutboundAnalyticsTotalsRow(row: OutboundAnalyticsTotalsRow | undefined): OutboundAnalyticsSummary["totals"] {
  return {
    clicks30d: numberValue(row?.clicks_total),
    clicks7d: numberValue(row?.clicks_recent),
    uniqueSessions30d: numberValue(row?.unique_sessions_total),
    uniqueSessions7d: numberValue(row?.unique_sessions_recent),
  };
}

function mapOutboundAnalyticsRollupRow(row: OutboundAnalyticsRollupRow): OutboundAnalyticsRollup | null {
  const eventType = stringValue(row.event_type) as OutboundAnalyticsEventType | null;
  const entityType = stringValue(row.entity_type) as OutboundAnalyticsEntityType | null;
  const entityId = stringValue(row.entity_id);
  if (!eventType || !allowedEventTypes.has(eventType)) return null;
  if (!entityType || !allowedEntityTypes.has(entityType)) return null;
  if (!entityId) return null;

  return {
    eventType,
    entityType,
    entityId,
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

function buildEventTotals(rollups: OutboundAnalyticsRollup[]): OutboundAnalyticsSummary["eventTotals"] {
  const totals = new Map<OutboundAnalyticsEventType, {
    clickCount: number;
    uniqueSessionCount: number;
    lastClickedAt: string | null;
  }>();

  for (const rollup of rollups) {
    const current = totals.get(rollup.eventType) || {
      clickCount: 0,
      uniqueSessionCount: 0,
      lastClickedAt: null,
    };
    current.clickCount += rollup.clickCount;
    current.uniqueSessionCount += rollup.uniqueSessionCount;
    if (!current.lastClickedAt || (rollup.lastClickedAt && rollup.lastClickedAt > current.lastClickedAt)) {
      current.lastClickedAt = rollup.lastClickedAt;
    }
    totals.set(rollup.eventType, current);
  }

  return Array.from(totals.entries())
    .map(([eventType, value]) => ({ eventType, ...value }))
    .sort((a, b) => b.clickCount - a.clickCount);
}

function normalizeTargetUrl(value: string | null): { host: string | null; hash: string | null } {
  const trimmed = value?.trim();
  if (!trimmed) return { host: null, hash: null };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { host: null, hash: hmacDigest(trimmed) };
    }
    return {
      host: compactText(url.hostname.replace(/^www\./, ""), 200),
      hash: hmacDigest(url.toString()),
    };
  } catch {
    return { host: null, hash: hmacDigest(trimmed) };
  }
}

function compactMetadata(value: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object") return {};

  const output: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
    const normalizedKey = compactText(key, 80);
    if (!normalizedKey) continue;
    if (typeof raw === "string") {
      const normalizedValue = compactText(raw, 300);
      if (normalizedValue !== null) output[normalizedKey] = normalizedValue;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      output[normalizedKey] = raw;
    } else if (typeof raw === "boolean") {
      output[normalizedKey] = raw;
    }
  }
  return output;
}

function compactPath(value: string | null | undefined, maxLength: number): string | null {
  const text = compactText(value, maxLength);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return compactText(`${url.pathname}${url.search}`, maxLength);
    } catch {
      return null;
    }
  }
  return text.startsWith("/") ? text : null;
}

function compactText(value: string | null | undefined, maxLength: number): string | null {
  const text = value?.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function hmacDigest(value: string): string {
  const secret =
    process.env.OUTBOUND_ANALYTICS_HASH_SECRET ||
    process.env.IP_HASH_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    HASH_SECRET_FALLBACK;
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex")
    .slice(0, 48);
}

function isMissingAnalyticsTableError(message: string): boolean {
  return message.includes("outbound_analytics_events") ||
    message.includes("list_outbound_analytics_rollups") ||
    message.includes("get_outbound_analytics_totals") ||
    message.includes("PGRST202") ||
    message.includes("42P01");
}
