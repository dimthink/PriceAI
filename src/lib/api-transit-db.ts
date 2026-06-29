import "server-only";

import type {
  TransitModelFamily,
  TransitMultiplierHistoryPoint,
  TransitModelPrice,
  TransitStation,
} from "@/data/api-transit/types";
import {
  isTransitModelFamily,
  isTransitStandardModel,
} from "@/data/api-transit/types";
import { seedStations } from "@/data/api-transit/stations";
import { getSupabaseServerClient } from "@/lib/supabase";

let cached: TransitStation[] | null = null;
let cachedAt = 0;
const cachedBySlug = new Map<string, { station: TransitStation; cachedAt: number }>();
let hasWarnedMissingEnhancementColumns = false;
let hasWarnedMissingHistoryTable = false;
const CACHE_TTL_MS = 30_000;
const PUBLIC_TRANSIT_READ_TIMEOUT_MS = 2_500;
const PUBLIC_TRANSIT_BUILD_READ_TIMEOUT_MS = 15_000;
const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";
const TRANSIT_HISTORY_DAYS = 45;
const TRANSIT_HISTORY_STATION_LIMIT = 320;
const STATION_CORE_COLUMNS = [
  "id",
  "slug",
  "name",
  "website_url",
  "status",
  "source_type",
  "commercial_relation",
  "summary",
  "collector_kind",
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
  "availability_first_checked_at",
  "availability_last_checked_at",
  "availability_note",
  "feedback_pending_count",
  "feedback_verified_risk_count",
  "feedback_merchant_responded_count",
  "feedback_main_themes",
  "feedback_public_notes",
  "last_updated_at",
  "updated_at",
].join(",");
const STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED = [
  "id",
  "slug",
  "name",
  "website_url",
  "status",
  "source_type",
  "commercial_relation",
  "summary",
  "collector_kind",
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
].join(",");
const STATION_ENHANCEMENT_COLUMNS = [
  "id",
  "logo_url",
  "monitor_url",
  "strengths",
  "cautions",
  "commercial_offers",
  "verification_events",
].join(",");
const STATION_ENHANCEMENT_COLUMNS_WITHOUT_LOGO = [
  "id",
  "monitor_url",
  "strengths",
  "cautions",
  "commercial_offers",
  "verification_events",
].join(",");
const OFFER_COLUMNS = [
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
  "image_output_price",
  "currency",
  "account_pool",
  "channel_type",
  "price_source",
  "last_verified_at",
  "availability_seven_day_rate",
  "availability_seven_day_samples",
  "availability_first_checked_at",
  "availability_last_checked_at",
  "availability_note",
].join(",");
const OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT = [
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
  "availability_first_checked_at",
  "availability_last_checked_at",
  "availability_note",
].join(",");
const OFFER_COLUMNS_WITHOUT_FIRST_CHECKED = [
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
  "image_output_price",
  "currency",
  "account_pool",
  "channel_type",
  "price_source",
  "last_verified_at",
  "availability_seven_day_rate",
  "availability_seven_day_samples",
  "availability_last_checked_at",
  "availability_note",
].join(",");
const OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_IMAGE_OUTPUT = [
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
].join(",");

export function clearTransitStationsCache(): void {
  cached = null;
  cachedAt = 0;
  cachedBySlug.clear();
}

export async function getTransitStations(): Promise<TransitStation[]> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  cached = await readStationsFromSupabase();
  cachedAt = now;
  cachedBySlug.clear();
  for (const station of cached) {
    cachedBySlug.set(station.slug, { station, cachedAt });
  }
  return cached;
}

export async function getTransitStationBySlug(
  slug: string,
  options: { includeHistory?: boolean } = {}
): Promise<TransitStation | undefined> {
  const station = getCachedStationBySlug(slug) ?? await readStationFromSupabaseBySlug(slug);
  if (!station || !options.includeHistory) return station;
  return getTransitStationDetailData(station);
}

export async function getTransitStationDetailData(station: TransitStation): Promise<TransitStation> {
  return enrichStationWithDetailData(station);
}

function getCachedStationBySlug(slug: string): TransitStation | undefined {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached.find((item) => item.slug === slug);
  }
  const entry = cachedBySlug.get(slug);
  if (!entry || now - entry.cachedAt >= CACHE_TTL_MS) return undefined;
  return entry.station;
}

async function readStationsFromSupabase(): Promise<TransitStation[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return seedStations;
  const client = supabase;
  const signal = publicTransitReadSignal();

  try {
    const [stationsResult, offerRows] = await Promise.all([
      queryPublishedStationRows(supabase, signal),
      readPublicOfferRows(supabase, signal),
    ]);

    const stationRows = stationsResult;
    if (!stationRows.length) return [];
    const enhancementRows = await readStationEnhancementRows();
    const enhancementsByStation = new Map<string, DbRow>();
    for (const row of enhancementRows) {
      const id = stringValue(row.id);
      if (id) enhancementsByStation.set(id, row);
    }

    const offersByStation = new Map<string, DbRow[]>();
    for (const offer of offerRows) {
      const stationId = stringValue(offer.station_id);
      if (!stationId) continue;
      offersByStation.set(stationId, [...(offersByStation.get(stationId) || []), offer]);
    }

    return stationRows.map((row) => {
      const id = stringValue(row.id);
      return mapStationRow(
        row,
        offersByStation.get(id) || [],
        enhancementsByStation.get(id)
      );
    });
  } catch (error) {
    console.warn("Returning no API transit stations because Supabase read failed:", error);
    return [];
  }

  async function readStationEnhancementRows(): Promise<DbRow[]> {
    try {
      const { data, error } = await client
        .from("api_transit_stations")
        .select(STATION_ENHANCEMENT_COLUMNS)
        .eq("published", true)
        .abortSignal(signal);
      if (error) throw error;
      return dbRows(data);
    } catch (error) {
      if (isMissingColumnError(error)) {
        return readStationEnhancementRowsWithoutLogo();
      }
      if (!isMissingColumnError(error) && !hasWarnedMissingEnhancementColumns) {
        hasWarnedMissingEnhancementColumns = true;
        console.warn("API transit station enhancement columns are unavailable:", error);
      }
      return [];
    }
  }

  async function readStationEnhancementRowsWithoutLogo(): Promise<DbRow[]> {
    try {
      const { data, error } = await client
        .from("api_transit_stations")
        .select(STATION_ENHANCEMENT_COLUMNS_WITHOUT_LOGO)
        .eq("published", true)
        .abortSignal(signal);
      if (error) throw error;
      return dbRows(data);
    } catch (fallbackError) {
      if (!hasWarnedMissingEnhancementColumns) {
        hasWarnedMissingEnhancementColumns = true;
        console.warn("API transit station enhancement columns are unavailable:", fallbackError);
      }
      return [];
    }
  }

}

async function readStationFromSupabaseBySlug(slug: string): Promise<TransitStation | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return seedStations.find((station) => station.slug === slug);

  try {
    const stationRow = (await queryPublishedStationRows(supabase, publicTransitReadSignal(), slug))[0];
    if (!stationRow) return undefined;

    const stationId = stringValue(stationRow.id);
    if (!stationId) return undefined;

    const signal = publicTransitReadSignal();
    const [offerRows, enhancementRow] = await Promise.all([
      readPublicOfferRows(supabase, signal, stationId),
      readStationEnhancementRow(supabase, stationId, signal),
    ]);

    const station = mapStationRow(stationRow, offerRows, enhancementRow);
    cachedBySlug.set(station.slug, { station, cachedAt: Date.now() });
    return station;
  } catch (error) {
    console.warn("Returning no API transit station because Supabase detail read failed:", error);
    return undefined;
  }
}

async function readPublicOfferRows(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  signal: AbortSignal,
  stationId?: string
): Promise<DbRow[]> {
  try {
    return await queryPublicOfferRows(client, signal, OFFER_COLUMNS, stationId);
  } catch (error) {
    if (isMissingColumnError(error)) {
      try {
        return await queryPublicOfferRows(client, publicTransitReadSignal(), OFFER_COLUMNS_WITHOUT_FIRST_CHECKED, stationId);
      } catch (withoutFirstCheckedError) {
        if (!isMissingColumnError(withoutFirstCheckedError)) throw withoutFirstCheckedError;
        try {
          return await queryPublicOfferRows(client, publicTransitReadSignal(), OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT, stationId);
        } catch (withoutImageOutputError) {
          if (isMissingColumnError(withoutImageOutputError)) {
            return queryPublicOfferRows(client, publicTransitReadSignal(), OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_IMAGE_OUTPUT, stationId);
          }
          throw withoutImageOutputError;
        }
      }
    }
    throw error;
  }
}

async function queryPublishedStationRows(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  signal: AbortSignal,
  slug?: string
): Promise<DbRow[]> {
  try {
    return await queryStationRows(client, signal, STATION_CORE_COLUMNS, slug);
  } catch (error) {
    if (isMissingColumnError(error)) {
      return queryStationRows(client, publicTransitReadSignal(), STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED, slug);
    }
    throw error;
  }
}

async function queryStationRows(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  signal: AbortSignal,
  columns: string,
  slug?: string
): Promise<DbRow[]> {
  let query = client
    .from("api_transit_stations")
    .select(columns)
    .eq("published", true)
    .order("last_updated_at", { ascending: false })
    .abortSignal(signal);
  if (slug) query = query.eq("slug", slug).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  return dbRows(data);
}

async function queryPublicOfferRows(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  signal: AbortSignal,
  columns: string,
  stationId?: string
): Promise<DbRow[]> {
  let query = client
    .from("api_transit_offers")
    .select(columns)
    .eq("status", "active")
    .order("standard_model", { ascending: true })
    .abortSignal(signal);

  if (stationId) query = query.eq("station_id", stationId);
  const { data, error } = await query;
  if (error) throw error;
  return dbRows(data);
}

async function readStationEnhancementRow(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  stationId: string,
  signal: AbortSignal
): Promise<DbRow | undefined> {
  try {
    const { data, error } = await client
      .from("api_transit_stations")
      .select(STATION_ENHANCEMENT_COLUMNS)
      .eq("id", stationId)
      .limit(1)
      .abortSignal(signal);
    if (error) throw error;
    return dbRows(data)[0];
  } catch (error) {
    if (isMissingColumnError(error)) {
      return readStationEnhancementRowWithoutLogo(client, stationId, signal);
    }
    if (!hasWarnedMissingEnhancementColumns) {
      hasWarnedMissingEnhancementColumns = true;
      console.warn("API transit station enhancement columns are unavailable:", error);
    }
    return undefined;
  }
}

async function readStationEnhancementRowWithoutLogo(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  stationId: string,
  signal: AbortSignal
): Promise<DbRow | undefined> {
  try {
    const { data, error } = await client
      .from("api_transit_stations")
      .select(STATION_ENHANCEMENT_COLUMNS_WITHOUT_LOGO)
      .eq("id", stationId)
      .limit(1)
      .abortSignal(signal);
    if (error) throw error;
    return dbRows(data)[0];
  } catch (fallbackError) {
    if (!hasWarnedMissingEnhancementColumns) {
      hasWarnedMissingEnhancementColumns = true;
      console.warn("API transit station enhancement columns are unavailable:", fallbackError);
    }
    return undefined;
  }
}

async function enrichStationWithDetailData(station: TransitStation): Promise<TransitStation> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !station.prices.length) return station;

  const cutoff = new Date(Date.now() - TRANSIT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [historyResult, samplesResult] = await Promise.all([
      supabase
        .from("api_transit_multiplier_history")
        .select(
          [
            "station_id",
            "family",
            "standard_model",
            "group_name",
            "recharge_ratio",
            "recharge_coefficient",
            "model_multiplier",
            "combined_rate",
            "price_source",
            "observed_at",
          ].join(",")
        )
        .eq("station_id", station.id)
        .gte("observed_at", cutoff)
        .order("observed_at", { ascending: false })
        .limit(TRANSIT_HISTORY_STATION_LIMIT)
        .abortSignal(publicTransitReadSignal()),
      supabase
        .from("api_transit_availability_samples")
        .select("scope,standard_model,group_name,checked_at")
        .eq("station_id", station.id)
        .gte("checked_at", cutoff)
        .order("checked_at", { ascending: true })
        .limit(1200)
        .abortSignal(publicTransitReadSignal()),
    ]);
    if (historyResult.error) throw historyResult.error;
    if (samplesResult.error && !isMissingTableError(samplesResult.error)) throw samplesResult.error;

    const historyByOffer = new Map<string, TransitMultiplierHistoryPoint[]>();
    for (const row of dbRows(historyResult.data)) {
      const key = historyKey(row);
      if (!key) continue;
      historyByOffer.set(key, [...(historyByOffer.get(key) || []), mapHistoryRow(row)]);
    }
    for (const points of historyByOffer.values()) {
      points.sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
    }

    const availabilityWindows = buildAvailabilityWindows(dbRows(samplesResult.data), station.id);
    const stationWindow = availabilityWindows.get(`${station.id}|station||`);

    return {
      ...station,
      availability: {
        ...station.availability,
        firstCheckedAt: earliestTimestamp(station.availability.firstCheckedAt, stationWindow?.first),
        lastCheckedAt: station.availability.lastCheckedAt || stationWindow?.last || null,
      },
      prices: station.prices.map((price) => ({
        ...price,
        availability: {
          ...price.availability,
          firstCheckedAt: earliestTimestamp(
            price.availability.firstCheckedAt,
            availabilityWindows.get(availabilityWindowKey(station.id, "offer", price.standardModel, price.groupName))?.first
          ),
          lastCheckedAt:
            price.availability.lastCheckedAt ||
            availabilityWindows.get(availabilityWindowKey(station.id, "offer", price.standardModel, price.groupName))?.last ||
            null,
        },
        history: historyByOffer.get(historyKey({
          station_id: station.id,
          family: price.family,
          standard_model: price.standardModel,
          group_name: price.groupName,
        })) || [],
      })),
    };
  } catch (error) {
    if (!isMissingTableError(error) && !isMissingColumnError(error) && !hasWarnedMissingHistoryTable) {
      hasWarnedMissingHistoryTable = true;
      console.warn("API transit multiplier history is unavailable:", error);
    }
    return station;
  }
}

function buildAvailabilityWindows(rows: DbRow[], stationId: string): Map<string, { first: string; last: string }> {
  const windows = new Map<string, { first: string; last: string }>();

  for (const row of rows) {
    const checkedAt = nullableTimestamp(row.checked_at);
    if (!checkedAt) continue;
    const key = availabilityWindowKey(
      stationId,
      stringValue(row.scope) === "offer" ? "offer" : "station",
      stringValue(row.standard_model),
      stringValue(row.group_name)
    );
    const existing = windows.get(key);
    if (!existing) {
      windows.set(key, { first: checkedAt, last: checkedAt });
      continue;
    }
    if (new Date(checkedAt).getTime() < new Date(existing.first).getTime()) existing.first = checkedAt;
    if (new Date(checkedAt).getTime() > new Date(existing.last).getTime()) existing.last = checkedAt;
  }

  return windows;
}

function availabilityWindowKey(
  stationId: string,
  scope: "station" | "offer",
  standardModel: string,
  groupName: string
): string {
  return [stationId, scope, standardModel || "", groupName || ""].join("|");
}

type DbRow = Record<string, unknown>;

function publicTransitReadSignal(): AbortSignal {
  return AbortSignal.timeout(publicTransitReadTimeoutMs());
}

function publicTransitReadTimeoutMs(): number {
  return process.env.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE
    ? PUBLIC_TRANSIT_BUILD_READ_TIMEOUT_MS
    : PUBLIC_TRANSIT_READ_TIMEOUT_MS;
}

function mapStationRow(
  row: DbRow,
  offerRows: DbRow[],
  enhancementRow?: DbRow,
  historyByOffer: Map<string, TransitMultiplierHistoryPoint[]> = new Map()
): TransitStation {
  const id = stringValue(row.id);
  const updatedAt = timestampValue(row.last_updated_at || row.updated_at);
  const enhancement = enhancementRow || {};

  return {
    id,
    slug: stringValue(row.slug) || id,
    name: stringValue(row.name) || id,
    websiteUrl: stringValue(row.website_url),
    logoUrl: nullableString(enhancement.logo_url),
    monitorUrl: nullableString(enhancement.monitor_url),
    collectorKind: nullableString(row.collector_kind),
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
      firstCheckedAt: nullableTimestamp(row.availability_first_checked_at),
      lastCheckedAt: nullableTimestamp(row.availability_last_checked_at),
      note: nullableString(row.availability_note) || undefined,
    },
    prices: offerRows.map((offer) => mapOfferRow(offer, historyByOffer)).filter((price): price is TransitModelPrice => Boolean(price)),
    feedback: {
      pendingCount: integerValue(row.feedback_pending_count) || 0,
      verifiedRiskCount: integerValue(row.feedback_verified_risk_count) || 0,
      merchantRespondedCount: integerValue(row.feedback_merchant_responded_count) || 0,
      mainThemes: stringArray(row.feedback_main_themes),
      publicNotes: nullableString(row.feedback_public_notes),
    },
    strengths: stringArray(enhancement.strengths),
    cautions: stringArray(enhancement.cautions),
    commercialOffers: commercialOffers(enhancement.commercial_offers),
    verificationEvents: verificationEvents(enhancement.verification_events),
  };
}

function mapOfferRow(
  row: DbRow,
  historyByOffer: Map<string, TransitMultiplierHistoryPoint[]> = new Map()
): TransitModelPrice | null {
  const family = modelFamily(row.family);
  const standardModel = standardModelValue(row.standard_model);
  if (!family || !standardModel) return null;
  const groupName = stringValue(row.group_name) || "默认分组";

  return {
    family,
    standardModel,
    groupName,
    rechargeRatio: nullableString(row.recharge_ratio),
    modelMultiplier: numberValue(row.model_multiplier),
    inputPrice: numberValue(row.input_price),
    outputPrice: numberValue(row.output_price),
    cacheReadPrice: numberValue(row.cache_read_price),
    cacheWritePrice: numberValue(row.cache_write_price),
    imageOutputPrice: numberValue(row.image_output_price),
    currency: "CNY",
    accountPool: accountPool(row.account_pool),
    channelType: channelType(row.channel_type),
    priceSource: stringValue(row.price_source) || "公开价格页",
    lastVerifiedAt: timestampValue(row.last_verified_at),
    availability: {
      sevenDayRate: numberValue(row.availability_seven_day_rate),
      sevenDaySamples: integerValue(row.availability_seven_day_samples) || 0,
      firstCheckedAt: nullableTimestamp(row.availability_first_checked_at),
      lastCheckedAt: nullableTimestamp(row.availability_last_checked_at),
      note: nullableString(row.availability_note) || undefined,
    },
    history: historyByOffer.get(historyKey({
      station_id: row.station_id,
      family,
      standard_model: standardModel,
      group_name: groupName,
    })) || [],
  };
}

function dbRows(value: unknown): DbRow[] {
  return Array.isArray(value) ? value.filter((item): item is DbRow => Boolean(item && typeof item === "object")) : [];
}

function isMissingColumnError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: unknown }).code === "42703" || (error as { code?: unknown }).code === "PGRST204")
  );
}

function isMissingTableError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "42P01"
  );
}

function historyKey(row: DbRow): string {
  const stationId = stringValue(row.station_id);
  const family = stringValue(row.family);
  const standardModel = stringValue(row.standard_model);
  const groupName = stringValue(row.group_name);
  if (!stationId || !family || !standardModel || !groupName) return "";
  return [stationId, family, standardModel, groupName].join("|");
}

function mapHistoryRow(row: DbRow): TransitMultiplierHistoryPoint {
  return {
    observedAt: timestampValue(row.observed_at),
    rechargeRatio: nullableString(row.recharge_ratio),
    rechargeCoefficient: numberValue(row.recharge_coefficient),
    modelMultiplier: numberValue(row.model_multiplier),
    combinedRate: numberValue(row.combined_rate),
    priceSource: nullableString(row.price_source),
  };
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

function earliestTimestamp(...values: Array<string | null | undefined>): string | null {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0) ?? null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringValue(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,，\n|｜]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function objectArray(value: unknown): DbRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DbRow => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function commercialOffers(value: unknown): NonNullable<TransitStation["commercialOffers"]> {
  return objectArray(value).map((item, index) => ({
    id: nullableString(item.id) || `offer-${index}`,
    type: commercialOfferType(item.type),
    title: stringValue(item.title) || "可用优惠",
    listLabel: nullableString(item.listLabel || item.list_label),
    description: nullableString(item.description),
    code: nullableString(item.code),
    url: nullableString(item.url),
    validUntil: nullableString(item.validUntil || item.valid_until),
    disclosure: nullableString(item.disclosure),
    enabled: item.enabled === undefined ? true : Boolean(item.enabled),
  })).filter((item) => item.title);
}

function verificationEvents(value: unknown): NonNullable<TransitStation["verificationEvents"]> {
  return objectArray(value).map((item, index) => ({
    id: nullableString(item.id) || `event-${index}`,
    source: verificationEventSource(item.source),
    status: verificationEventStatus(item.status),
    title: stringValue(item.title) || "核验记录",
    description: nullableString(item.description),
    happenedAt: timestampValue(item.happenedAt || item.happened_at),
  })).filter((item) => item.title);
}

function commercialOfferType(value: unknown): NonNullable<TransitStation["commercialOffers"]>[number]["type"] {
  return value === "affiliate" || value === "sponsored" || value === "coupon" ? value : "coupon";
}

function verificationEventSource(value: unknown): NonNullable<TransitStation["verificationEvents"]>[number]["source"] {
  return value === "official" || value === "user" || value === "merchant" || value === "priceai" ? value : "priceai";
}

function verificationEventStatus(value: unknown): NonNullable<TransitStation["verificationEvents"]>[number]["status"] {
  return value === "warning" || value === "failed" || value === "info" || value === "success" ? value : "info";
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
  return isTransitModelFamily(text) ? text : null;
}

function standardModelValue(value: unknown): TransitModelPrice["standardModel"] | null {
  const text = stringValue(value);
  return isTransitStandardModel(text) ? text : null;
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
    "reverse_engineered",
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
    "kiro",
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
    "third_party_aggregate",
    "pending_feedback",
  ].includes(value);
}
