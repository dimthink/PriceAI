import "server-only";

import type {
  TransitModelFamily,
  TransitModelPrice,
  TransitStation,
} from "@/data/api-transit/types";
import { seedStations } from "@/data/api-transit/stations";
import { getSupabaseServerClient } from "@/lib/supabase";

let cached: TransitStation[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function clearTransitStationsCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function getTransitStations(): Promise<TransitStation[]> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  cached = await readStationsFromSupabase();
  cachedAt = now;
  return cached;
}

export async function getTransitStationBySlug(slug: string): Promise<TransitStation | undefined> {
  const stations = await getTransitStations();
  return stations.find((station) => station.slug === slug);
}

async function readStationsFromSupabase(): Promise<TransitStation[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return seedStations;

  try {
    const [stationsResult, offersResult] = await Promise.all([
      supabase
        .from("api_transit_stations")
        .select(
          [
            "id",
            "slug",
            "name",
            "website_url",
            "status",
            "source_type",
            "commercial_relation",
            "summary",
            "channel_types",
            "account_pools",
            "payment_methods",
            "minimum_top_up",
            "balance_expiry",
            "support_channels",
            "refund_policy",
            "risk_labels",
            "usage_advice",
            "data_status",
            "availability_seven_day_rate",
            "availability_seven_day_samples",
            "availability_last_checked_at",
            "availability_note",
            "feedback_pending_count",
            "feedback_verified_risk_count",
            "feedback_merchant_responded_count",
            "feedback_main_themes",
            "feedback_public_notes",
            "last_updated_at",
            "updated_at",
          ].join(",")
        )
        .eq("published", true)
        .order("last_updated_at", { ascending: false }),
      supabase
        .from("api_transit_offers")
        .select(
          [
            "id",
            "station_id",
            "family",
            "standard_model",
            "group_name",
            "recharge_ratio",
            "model_multiplier",
            "input_price",
            "output_price",
            "cache_read_price",
            "cache_write_price",
            "currency",
            "account_pool",
            "channel_type",
            "price_source",
            "last_verified_at",
            "availability_seven_day_rate",
            "availability_seven_day_samples",
            "availability_last_checked_at",
            "availability_note",
          ].join(",")
        )
        .eq("status", "active")
        .order("standard_model", { ascending: true }),
    ]);

    if (stationsResult.error || offersResult.error) {
      throw stationsResult.error || offersResult.error;
    }

    const stationRows = dbRows(stationsResult.data);
    if (!stationRows.length) return [];

    const offersByStation = new Map<string, DbRow[]>();
    for (const offer of dbRows(offersResult.data)) {
      const stationId = stringValue(offer.station_id);
      if (!stationId) continue;
      offersByStation.set(stationId, [...(offersByStation.get(stationId) || []), offer]);
    }

    return stationRows.map((row) => mapStationRow(row, offersByStation.get(stringValue(row.id)) || []));
  } catch (error) {
    console.warn("Returning no API transit stations because Supabase read failed:", error);
    return [];
  }
}

type DbRow = Record<string, unknown>;

function mapStationRow(row: DbRow, offerRows: DbRow[]): TransitStation {
  const id = stringValue(row.id);
  const updatedAt = timestampValue(row.last_updated_at || row.updated_at);

  return {
    id,
    slug: stringValue(row.slug) || id,
    name: stringValue(row.name) || id,
    websiteUrl: stringValue(row.website_url),
    status: stationStatus(row.status),
    sourceType: sourceType(row.source_type),
    commercialRelation: commercialRelation(row.commercial_relation),
    summary: stringValue(row.summary),
    channelTypes: enumArray(row.channel_types, isTransitChannelType),
    accountPools: enumArray(row.account_pools, isTransitAccountPool),
    paymentMethods: stringArray(row.payment_methods),
    minimumTopUp: nullableString(row.minimum_top_up),
    balanceExpiry: nullableString(row.balance_expiry),
    supportChannels: stringArray(row.support_channels),
    refundPolicy: nullableString(row.refund_policy),
    riskLabels: enumArray(row.risk_labels, isTransitRiskLabel),
    usageAdvice: usageAdvice(row.usage_advice),
    lastUpdatedAt: updatedAt,
    dataStatus: dataStatus(row.data_status),
    availability: {
      sevenDayRate: numberValue(row.availability_seven_day_rate),
      sevenDaySamples: integerValue(row.availability_seven_day_samples) || 0,
      lastCheckedAt: nullableTimestamp(row.availability_last_checked_at),
      note: nullableString(row.availability_note) || undefined,
    },
    prices: offerRows.map(mapOfferRow).filter((price): price is TransitModelPrice => Boolean(price)),
    feedback: {
      pendingCount: integerValue(row.feedback_pending_count) || 0,
      verifiedRiskCount: integerValue(row.feedback_verified_risk_count) || 0,
      merchantRespondedCount: integerValue(row.feedback_merchant_responded_count) || 0,
      mainThemes: stringArray(row.feedback_main_themes),
      publicNotes: nullableString(row.feedback_public_notes),
    },
  };
}

function mapOfferRow(row: DbRow): TransitModelPrice | null {
  const family = modelFamily(row.family);
  const standardModel = standardModelValue(row.standard_model);
  if (!family || !standardModel) return null;

  return {
    family,
    standardModel,
    groupName: stringValue(row.group_name) || "默认分组",
    rechargeRatio: nullableString(row.recharge_ratio),
    modelMultiplier: numberValue(row.model_multiplier),
    inputPrice: numberValue(row.input_price),
    outputPrice: numberValue(row.output_price),
    cacheReadPrice: numberValue(row.cache_read_price),
    cacheWritePrice: numberValue(row.cache_write_price),
    currency: "CNY",
    accountPool: accountPool(row.account_pool),
    channelType: channelType(row.channel_type),
    priceSource: stringValue(row.price_source) || "公开价格页",
    lastVerifiedAt: timestampValue(row.last_verified_at),
    availability: {
      sevenDayRate: numberValue(row.availability_seven_day_rate),
      sevenDaySamples: integerValue(row.availability_seven_day_samples) || 0,
      lastCheckedAt: nullableTimestamp(row.availability_last_checked_at),
      note: nullableString(row.availability_note) || undefined,
    },
  };
}

function dbRows(value: unknown): DbRow[] {
  return Array.isArray(value) ? value.filter((item): item is DbRow => Boolean(item && typeof item === "object")) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text ? text : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function timestampValue(value: unknown): string {
  return nullableTimestamp(value) || new Date().toISOString();
}

function nullableTimestamp(value: unknown): string | null {
  const text = nullableString(value);
  if (!text) return null;
  return text;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringValue(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,，\n|｜]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function enumArray<T extends string>(value: unknown, guard: (value: string) => value is T): T[] {
  return stringArray(value).filter(guard);
}

function stationStatus(value: unknown): TransitStation["status"] {
  const text = stringValue(value);
  return text === "active" || text === "limited" || text === "unavailable" || text === "unknown" ? text : "unknown";
}

function sourceType(value: unknown): TransitStation["sourceType"] {
  const text = stringValue(value);
  return text === "manual_collected" || text === "user_submitted" || text === "merchant_submitted" ? text : "manual_collected";
}

function commercialRelation(value: unknown): TransitStation["commercialRelation"] {
  const text = stringValue(value);
  return text === "none" || text === "listed" || text === "partner" || text === "affiliate" || text === "sponsored" || text === "unknown" ? text : "unknown";
}

function usageAdvice(value: unknown): TransitStation["usageAdvice"] {
  const text = stringValue(value);
  return text === "try_small" || text === "cautious" || text === "not_recommended" || text === "pending" ? text : "pending";
}

function dataStatus(value: unknown): TransitStation["dataStatus"] {
  const text = stringValue(value);
  return text === "sample" || text === "pending_review" || text === "verified" ? text : "pending_review";
}

function modelFamily(value: unknown): TransitModelFamily | null {
  const text = stringValue(value);
  return text === "claude" || text === "gpt" ? text : null;
}

function standardModelValue(value: unknown): TransitModelPrice["standardModel"] | null {
  const text = stringValue(value);
  if (
    text === "Claude Sonnet 4.6" ||
    text === "Claude Opus 4.6" ||
    text === "Claude Opus 4.7" ||
    text === "Claude Opus 4.8" ||
    text === "GPT 5.5" ||
    text === "GPT 5.4"
  ) {
    return text;
  }
  return null;
}

function accountPool(value: unknown): TransitModelPrice["accountPool"] {
  const text = stringValue(value);
  return isTransitAccountPool(text) ? text : "undisclosed";
}

function channelType(value: unknown): TransitModelPrice["channelType"] {
  const text = stringValue(value);
  return isTransitChannelType(text) ? text : "undisclosed";
}

function isTransitChannelType(value: string): value is TransitModelPrice["channelType"] {
  return [
    "official_api",
    "cloud",
    "first_party_pool",
    "first_party_wholesale",
    "reseller",
    "mixed",
    "undisclosed",
  ].includes(value);
}

function isTransitAccountPool(value: string): value is TransitModelPrice["accountPool"] {
  return [
    "pro",
    "plus",
    "max",
    "team",
    "enterprise",
    "official_api",
    "mixed",
    "undisclosed",
  ].includes(value);
}

function isTransitRiskLabel(value: string): value is TransitStation["riskLabels"][number] {
  return [
    "sample_data",
    "insufficient_samples",
    "mixed_pool",
    "reseller",
    "undisclosed_upstream",
    "pending_feedback",
  ].includes(value);
}
