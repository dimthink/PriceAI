import "server-only";

import type {
  TransitAvailabilitySample,
  TransitAvailabilitySourceType,
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
import { withTransitCommercialOfferDisclosure } from "@/lib/api-transit";
import { readPublicApiSnapshot, writePublicApiSnapshot } from "@/lib/public-api-snapshots";
import { getSupabaseServerClient } from "@/lib/supabase";

let cached: TransitStation[] | null = null;
let cachedAt = 0;
const cachedBySlug = new Map<string, { station: TransitStation; cachedAt: number }>();
let hasWarnedMissingEnhancementColumns = false;
let hasWarnedMissingHistoryTable = false;
let hasWarnedSnapshotAvailabilitySamples = false;
const CACHE_TTL_MS = 30_000;
const PUBLIC_TRANSIT_READ_TIMEOUT_MS = 2_500;
const PUBLIC_TRANSIT_BUILD_READ_TIMEOUT_MS = 15_000;
const API_TRANSIT_SNAPSHOT_KEY = "default";
const API_TRANSIT_SNAPSHOT_MAX_STALE_MS = 10 * 60 * 1000;
const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";
const TRANSIT_HISTORY_DAYS = 45;
const TRANSIT_HISTORY_STATION_LIMIT = 320;
const TRANSIT_AVAILABILITY_RECENT_SAMPLE_LIMIT = 60;
const TRANSIT_AVAILABILITY_WINDOW_DAYS = 7;
const TRANSIT_AVAILABILITY_LIST_SAMPLE_LIMIT = 5_000;
const TRANSIT_AVAILABILITY_DETAIL_SAMPLE_LIMIT = 2_000;
const STATION_CORE_BASE_COLUMNS = [
  "id",
  "slug",
  "name",
  "website_url",
  "api_base_url",
  "status",
  "source_type",
  "commercial_relation",
  "station_system",
  "operator_type",
  "invoice_support",
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
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms",
  "availability_note",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url",
  "feedback_pending_count",
  "feedback_verified_risk_count",
  "feedback_merchant_responded_count",
  "feedback_main_themes",
  "feedback_public_notes",
  "last_updated_at",
  "updated_at",
];
const STATION_CORE_COLUMNS = STATION_CORE_BASE_COLUMNS.join(",");
const STATION_OPERATOR_COLUMNS = ["operator_type", "invoice_support"] as const;
const STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED = withoutColumns(
  STATION_CORE_BASE_COLUMNS,
  "availability_first_checked_at"
);
const STATION_CORE_COLUMNS_WITHOUT_LATENCY = withoutColumns(
  STATION_CORE_BASE_COLUMNS,
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms"
);
const STATION_CORE_COLUMNS_WITHOUT_AVAILABILITY_SOURCE = withoutColumns(
  STATION_CORE_BASE_COLUMNS,
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE = withoutColumns(
  STATION_CORE_BASE_COLUMNS,
  "availability_first_checked_at",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const STATION_CORE_COLUMNS_WITHOUT_LATENCY_OR_AVAILABILITY_SOURCE = withoutColumns(
  STATION_CORE_BASE_COLUMNS,
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL = withoutColumns(
  STATION_CORE_BASE_COLUMNS,
  "api_base_url",
  "availability_first_checked_at",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL_OR_STATION_SYSTEM = withoutColumn(
  STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL,
  "station_system"
);
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
const OFFER_BASE_COLUMNS = [
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
  "cache_hit_rate",
  "cache_hit_sample_tokens",
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
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms",
  "availability_note",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url",
];
const OFFER_COLUMNS = OFFER_BASE_COLUMNS.join(",");
const OFFER_COLUMNS_WITHOUT_CACHE_HIT = withoutColumns(OFFER_BASE_COLUMNS, "cache_hit_rate", "cache_hit_sample_tokens");
const OFFER_COLUMNS_WITHOUT_LATENCY = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms"
);
const OFFER_COLUMNS_WITHOUT_LATENCY_OR_CACHE_HIT = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms",
  "cache_hit_rate",
  "cache_hit_sample_tokens"
);
const OFFER_COLUMNS_WITHOUT_LATENCY_OR_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT = withoutColumns(OFFER_BASE_COLUMNS, "image_output_price");
const OFFER_COLUMNS_WITHOUT_FIRST_CHECKED = withoutColumns(OFFER_BASE_COLUMNS, "availability_first_checked_at");
const OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_IMAGE_OUTPUT = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_first_checked_at",
  "image_output_price"
);
const OFFER_COLUMNS_WITHOUT_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const OFFER_COLUMNS_WITHOUT_CACHE_HIT_OR_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "cache_hit_rate",
  "cache_hit_sample_tokens",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const OFFER_COLUMNS_WITHOUT_LATENCY_CACHE_HIT_OR_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_latest_latency_ms",
  "availability_avg_latency_7d_ms",
  "cache_hit_rate",
  "cache_hit_sample_tokens",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT_OR_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "image_output_price",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_first_checked_at",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);
const OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_IMAGE_OUTPUT_OR_AVAILABILITY_SOURCE = withoutColumns(
  OFFER_BASE_COLUMNS,
  "availability_first_checked_at",
  "image_output_price",
  "availability_source_type",
  "availability_source_label",
  "availability_source_url"
);

function withoutColumns(columns: string[], ...excluded: string[]): string {
  const excludedSet = new Set(excluded);
  return columns.filter((column) => !excludedSet.has(column)).join(",");
}

export function clearTransitStationsCache(): void {
  cached = null;
  cachedAt = 0;
  cachedBySlug.clear();
}

export type TransitStationsSnapshotRefreshResult = {
  generatedAt: string;
  snapshotWritten: boolean;
  slugs: string[];
  stationCount: number;
};

export async function refreshTransitStationsSnapshot(): Promise<TransitStationsSnapshotRefreshResult> {
  const generatedAt = new Date().toISOString();
  const stations = await readStationsFromSupabase();

  if (!stations.length) {
    return {
      generatedAt,
      snapshotWritten: false,
      slugs: [],
      stationCount: 0,
    };
  }

  setTransitStationsCache(stations, new Date(generatedAt).getTime());
  const snapshotWritten = await writeTransitStationsSnapshot(stations, generatedAt);

  return {
    generatedAt,
    snapshotWritten,
    slugs: stations.map((station) => station.slug),
    stationCount: stations.length,
  };
}

export async function getTransitStations(): Promise<TransitStation[]> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  const staleMemory = cached && cached.length ? cached : null;
  const snapshot = await readTransitStationsSnapshot();
  if (snapshot?.fresh) {
    const stations = await attachSnapshotAvailabilitySamples(snapshot.stations);
    setTransitStationsCache(stations, now);
    return stations;
  }

  try {
    const stations = await readStationsFromSupabase();
    if (!stations.length && snapshot?.stations.length) {
      console.warn("Using stale API transit stations because Supabase returned an empty published set.");
      setTransitStationsCache(snapshot.stations, now);
      return snapshot.stations;
    }
    setTransitStationsCache(stations, now);
    if (stations.length) await writeTransitStationsSnapshot(stations);
    return stations;
  } catch (error) {
    const fallback = staleMemory || snapshot?.stations || null;
    if (fallback?.length) {
      console.warn("Using cached API transit stations because Supabase read failed:", error);
      setTransitStationsCache(fallback, now);
      return fallback;
    }
    console.warn("Falling back to static API transit stations because Supabase read failed:", error);
    setTransitStationsCache(seedStations, now);
    return seedStations;
  }
}

function setTransitStationsCache(stations: TransitStation[], cachedAtValue = Date.now()): void {
  cached = stations;
  cachedAt = cachedAtValue;
  cachedBySlug.clear();
  for (const station of cached) {
    cachedBySlug.set(station.slug, { station, cachedAt });
  }
}

async function readTransitStationsSnapshot(): Promise<{ stations: TransitStation[]; fresh: boolean } | null> {
  const snapshot = await readPublicApiSnapshot<TransitStation[]>("api_transit", API_TRANSIT_SNAPSHOT_KEY);
  if (!snapshot || !isTransitStationsSnapshot(snapshot.value)) return null;

  const generatedAt = new Date(snapshot.generatedAt).getTime();
  return {
    stations: snapshot.value,
    fresh: Number.isFinite(generatedAt) && Date.now() - generatedAt <= API_TRANSIT_SNAPSHOT_MAX_STALE_MS,
  };
}

async function writeTransitStationsSnapshot(
  stations: TransitStation[],
  generatedAt?: string,
): Promise<boolean> {
  return writePublicApiSnapshot({
    kind: "api_transit",
    key: API_TRANSIT_SNAPSHOT_KEY,
    payload: stations,
    generatedAt,
  });
}

async function attachSnapshotAvailabilitySamples(stations: TransitStation[]): Promise<TransitStation[]> {
  if (!stations.length) return stations;
  const supabase = getSupabaseServerClient();
  if (!supabase) return stations;

  try {
    const sampleRows = await readAvailabilitySampleRows(
      supabase,
      stations.map((station) => station.id),
      availabilityCutoffIso(),
      TRANSIT_AVAILABILITY_LIST_SAMPLE_LIMIT
    );
    return attachAvailabilitySamples(stations, sampleRows);
  } catch (error) {
    if (!hasWarnedSnapshotAvailabilitySamples) {
      hasWarnedSnapshotAvailabilitySamples = true;
      console.warn("Using API transit snapshot without live availability samples:", error);
    }
    return stations;
  }
}

function isTransitStationsSnapshot(value: unknown): value is TransitStation[] {
  return Array.isArray(value) && value.every((station) => {
    if (!station || typeof station !== "object") return false;
    const record = station as Record<string, unknown>;
    return typeof record.slug === "string" && typeof record.name === "string";
  });
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

    const stations = stationRows.map((row) => {
      const id = stringValue(row.id);
      return mapStationRow(
        row,
        offersByStation.get(id) || [],
        enhancementsByStation.get(id)
      );
    });
    const sampleRows = await readAvailabilitySampleRows(
      client,
      stationRows.map((row) => stringValue(row.id)).filter(Boolean),
      availabilityCutoffIso(),
      TRANSIT_AVAILABILITY_LIST_SAMPLE_LIMIT
    );

    return attachAvailabilitySamples(stations, sampleRows);
  } catch (error) {
    console.warn("API transit Supabase read failed:", error);
    throw error;
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
  const attempts = [
    OFFER_COLUMNS,
    OFFER_COLUMNS_WITHOUT_LATENCY,
    OFFER_COLUMNS_WITHOUT_CACHE_HIT,
    OFFER_COLUMNS_WITHOUT_LATENCY_OR_CACHE_HIT,
    OFFER_COLUMNS_WITHOUT_AVAILABILITY_SOURCE,
    OFFER_COLUMNS_WITHOUT_LATENCY_OR_AVAILABILITY_SOURCE,
    OFFER_COLUMNS_WITHOUT_CACHE_HIT_OR_AVAILABILITY_SOURCE,
    OFFER_COLUMNS_WITHOUT_LATENCY_CACHE_HIT_OR_AVAILABILITY_SOURCE,
  ];
  let lastError: unknown = null;
  for (const columns of attempts) {
    try {
      return await queryPublicOfferRows(client, columns === OFFER_COLUMNS ? signal : publicTransitReadSignal(), columns, stationId);
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      lastError = error;
    }
  }
  return readPublicOfferRowsWithoutNewOptionalColumns(client, stationId, lastError);
}

async function readPublicOfferRowsWithoutNewOptionalColumns(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  stationId?: string,
  previousError: unknown = null
): Promise<DbRow[]> {
  const baseAttempts = [
    OFFER_COLUMNS_WITHOUT_FIRST_CHECKED,
    withoutColumnsFromSelect(OFFER_COLUMNS_WITHOUT_FIRST_CHECKED, "cache_hit_rate", "cache_hit_sample_tokens"),
    OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT,
    withoutColumnsFromSelect(OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT, "cache_hit_rate", "cache_hit_sample_tokens"),
    OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_IMAGE_OUTPUT,
    withoutColumnsFromSelect(OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_IMAGE_OUTPUT, "cache_hit_rate", "cache_hit_sample_tokens"),
    OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT_OR_AVAILABILITY_SOURCE,
    withoutColumnsFromSelect(OFFER_COLUMNS_WITHOUT_IMAGE_OUTPUT_OR_AVAILABILITY_SOURCE, "cache_hit_rate", "cache_hit_sample_tokens"),
    OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE,
    withoutColumnsFromSelect(OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE, "cache_hit_rate", "cache_hit_sample_tokens"),
    OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_IMAGE_OUTPUT_OR_AVAILABILITY_SOURCE,
    withoutColumnsFromSelect(OFFER_COLUMNS_WITHOUT_FIRST_CHECKED_IMAGE_OUTPUT_OR_AVAILABILITY_SOURCE, "cache_hit_rate", "cache_hit_sample_tokens"),
  ];
  const attempts = Array.from(new Set(baseAttempts.flatMap((columns) => [
    columns,
    withoutColumnsFromSelect(columns, "availability_latest_latency_ms", "availability_avg_latency_7d_ms"),
  ])));
  let lastError: unknown = previousError;
  for (const columns of attempts) {
    try {
      return await queryPublicOfferRows(client, publicTransitReadSignal(), columns, stationId);
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function queryPublishedStationRows(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  signal: AbortSignal,
  slug?: string
): Promise<DbRow[]> {
  const attempts = Array.from(new Set([
    STATION_CORE_COLUMNS,
    STATION_CORE_COLUMNS_WITHOUT_LATENCY,
    withoutColumnsFromSelect(STATION_CORE_COLUMNS, ...STATION_OPERATOR_COLUMNS),
    withoutColumnsFromSelect(STATION_CORE_COLUMNS_WITHOUT_LATENCY, ...STATION_OPERATOR_COLUMNS),
    withoutColumn(STATION_CORE_COLUMNS, "station_system"),
    withoutColumn(STATION_CORE_COLUMNS_WITHOUT_LATENCY, "station_system"),
    withoutColumnsFromSelect(withoutColumn(STATION_CORE_COLUMNS, "station_system"), ...STATION_OPERATOR_COLUMNS),
    withoutColumnsFromSelect(withoutColumn(STATION_CORE_COLUMNS_WITHOUT_LATENCY, "station_system"), ...STATION_OPERATOR_COLUMNS),
    STATION_CORE_COLUMNS_WITHOUT_AVAILABILITY_SOURCE,
    STATION_CORE_COLUMNS_WITHOUT_LATENCY_OR_AVAILABILITY_SOURCE,
    withoutColumnsFromSelect(STATION_CORE_COLUMNS_WITHOUT_AVAILABILITY_SOURCE, ...STATION_OPERATOR_COLUMNS),
    withoutColumn(STATION_CORE_COLUMNS_WITHOUT_AVAILABILITY_SOURCE, "station_system"),
    withoutColumnsFromSelect(withoutColumn(STATION_CORE_COLUMNS_WITHOUT_AVAILABILITY_SOURCE, "station_system"), ...STATION_OPERATOR_COLUMNS),
    STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED,
    withoutColumnsFromSelect(STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED, ...STATION_OPERATOR_COLUMNS),
    withoutColumn(STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED, "station_system"),
    withoutColumnsFromSelect(withoutColumn(STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED, "station_system"), ...STATION_OPERATOR_COLUMNS),
    STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE,
    withoutColumnsFromSelect(STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE, ...STATION_OPERATOR_COLUMNS),
    withoutColumn(STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE, "station_system"),
    withoutColumnsFromSelect(withoutColumn(STATION_CORE_COLUMNS_WITHOUT_FIRST_CHECKED_OR_AVAILABILITY_SOURCE, "station_system"), ...STATION_OPERATOR_COLUMNS),
    STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL,
    withoutColumnsFromSelect(STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL, ...STATION_OPERATOR_COLUMNS),
    STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL_OR_STATION_SYSTEM,
    withoutColumnsFromSelect(STATION_CORE_COLUMNS_WITHOUT_API_BASE_URL_OR_STATION_SYSTEM, ...STATION_OPERATOR_COLUMNS),
  ]));

  let lastMissingColumnError: unknown = null;
  for (const columns of attempts) {
    try {
      return await queryStationRows(client, columns === STATION_CORE_COLUMNS ? signal : publicTransitReadSignal(), columns, slug);
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      lastMissingColumnError = error;
    }
  }

  throw lastMissingColumnError;
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
    const [historyResult, sampleRows] = await Promise.all([
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
      readAvailabilitySampleRows(
        supabase,
        [station.id],
        availabilityCutoffIso(),
        TRANSIT_AVAILABILITY_DETAIL_SAMPLE_LIMIT
      ),
    ]);
    if (historyResult.error) throw historyResult.error;

    const historyByOffer = new Map<string, TransitMultiplierHistoryPoint[]>();
    for (const row of dbRows(historyResult.data)) {
      const key = historyKey(row);
      if (!key) continue;
      historyByOffer.set(key, [...(historyByOffer.get(key) || []), mapHistoryRow(row)]);
    }
    for (const points of historyByOffer.values()) {
      points.sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
    }

    const availabilitySamples = buildAvailabilitySampleMap(sampleRows, station.id);
    const availabilityWindows = buildAvailabilityWindows(sampleRows, station.id);
    const stationWindow = availabilityWindows.get(`${station.id}|station||`);
    const stationRecentSamples = availabilitySamples.get(`${station.id}|station||`) || [];

    return {
      ...station,
      availability: {
        ...station.availability,
        firstCheckedAt: earliestTimestamp(station.availability.firstCheckedAt, stationWindow?.first),
        lastCheckedAt: station.availability.lastCheckedAt || stationWindow?.last || null,
        recentSamples: stationRecentSamples,
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
          recentSamples:
            availabilitySamples.get(availabilityWindowKey(station.id, "offer", price.standardModel, price.groupName)) || [],
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

async function readAvailabilitySampleRows(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  stationIds: string[],
  since: string,
  limit: number
): Promise<DbRow[]> {
  if (!stationIds.length) return [];
  try {
    const { data, error } = await client
      .from("api_transit_availability_samples")
      .select("station_id,scope,standard_model,group_name,ok,latency_ms,ping_latency_ms,checked_at,source_type,source_label,source_url")
      .in("station_id", stationIds)
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(limit)
      .abortSignal(publicTransitReadSignal());
    if (error) throw error;
    return dbRows(data);
  } catch (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) return [];
    throw error;
  }
}

function attachAvailabilitySamples(stations: TransitStation[], rows: DbRow[]): TransitStation[] {
  if (!stations.length || !rows.length) return stations;
  return stations.map((station) => {
    const stationRows = rows.filter((row) => stringValue(row.station_id) === station.id);
    const availabilitySamples = buildAvailabilitySampleMap(stationRows, station.id);
    const availabilityWindows = buildAvailabilityWindows(stationRows, station.id);
    const stationKey = availabilityWindowKey(station.id, "station", "", "");
    const stationWindow = availabilityWindows.get(stationKey);
    return {
      ...station,
      availability: {
        ...station.availability,
        firstCheckedAt: earliestTimestamp(station.availability.firstCheckedAt, stationWindow?.first),
        lastCheckedAt: latestTimestamp(station.availability.lastCheckedAt, stationWindow?.last),
        recentSamples: availabilitySamples.get(stationKey) || station.availability.recentSamples || [],
      },
      prices: station.prices.map((price) => {
        const key = availabilityWindowKey(station.id, "offer", price.standardModel, price.groupName);
        const window = availabilityWindows.get(key);
        return {
          ...price,
          availability: {
            ...price.availability,
            firstCheckedAt: earliestTimestamp(price.availability.firstCheckedAt, window?.first),
            lastCheckedAt: latestTimestamp(price.availability.lastCheckedAt, window?.last),
            recentSamples: availabilitySamples.get(key) || price.availability.recentSamples || [],
          },
        };
      }),
    };
  });
}

function availabilityCutoffIso(): string {
  return new Date(Date.now() - TRANSIT_AVAILABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
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

function buildAvailabilitySampleMap(rows: DbRow[], stationId: string): Map<string, TransitAvailabilitySample[]> {
  const samplesByScope = new Map<string, TransitAvailabilitySample[]>();

  for (const row of rows) {
    const checkedAt = nullableTimestamp(row.checked_at);
    if (!checkedAt) continue;
    const key = availabilityWindowKey(
      stationId,
      stringValue(row.scope) === "offer" ? "offer" : "station",
      stringValue(row.standard_model),
      stringValue(row.group_name)
    );
    const samples = samplesByScope.get(key) || [];
    samples.push({
      ok: booleanValue(row.ok),
      checkedAt,
      latencyMs: integerValue(row.latency_ms),
      pingLatencyMs: integerValue(row.ping_latency_ms),
      sourceType: availabilitySourceType(row.source_type),
      sourceLabel: nullableString(row.source_label),
      sourceUrl: nullableString(row.source_url),
    });
    samplesByScope.set(key, samples);
  }

  for (const [key, samples] of samplesByScope) {
    const recent = samples
      .sort((left, right) => new Date(right.checkedAt).getTime() - new Date(left.checkedAt).getTime())
      .slice(0, TRANSIT_AVAILABILITY_RECENT_SAMPLE_LIMIT)
      .reverse();
    samplesByScope.set(key, recent);
  }

  return samplesByScope;
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
  const source = availabilitySourceFromRow(row);

  return {
    id,
    slug: stringValue(row.slug) || id,
    name: stringValue(row.name) || id,
    websiteUrl: stringValue(row.website_url),
    apiBaseUrl: nullableString(row.api_base_url),
    logoUrl: nullableString(enhancement.logo_url),
    monitorUrl: nullableString(enhancement.monitor_url),
    collectorKind: nullableString(row.collector_kind),
    status: stationStatus(row.status),
    sourceType: sourceType(row.source_type),
    commercialRelation: commercialRelation(row.commercial_relation),
    stationSystem: stationSystem(row.station_system),
    operatorType: operatorType(row.operator_type),
    invoiceSupport: invoiceSupport(row.invoice_support),
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
      latestLatencyMs: integerValue(row.availability_latest_latency_ms),
      avgLatency7dMs: integerValue(row.availability_avg_latency_7d_ms),
      note: nullableString(row.availability_note) || undefined,
      sourceType: source.type,
      sourceLabel: source.label,
      sourceUrl: source.url,
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
  const source = availabilitySourceFromRow(row, nullableString(row.source_url));

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
      latestLatencyMs: integerValue(row.availability_latest_latency_ms),
      avgLatency7dMs: integerValue(row.availability_avg_latency_7d_ms),
      note: nullableString(row.availability_note) || undefined,
      sourceType: source.type,
      sourceLabel: source.label,
      sourceUrl: source.url,
    },
    cacheUsage: transitCacheUsageFromRow(row),
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

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function transitCacheUsageFromRow(row: DbRow): TransitModelPrice["cacheUsage"] {
  const hitRate = normalizedPercentRate(numberValue(row.cache_hit_rate));
  const sampleTokens = Math.max(0, integerValue(row.cache_hit_sample_tokens) || 0);

  if (hitRate === null && sampleTokens <= 0) return undefined;

  return {
    hitRate,
    sampleTokens,
  };
}

function normalizedPercentRate(value: number | null): number | null {
  if (value === null || value < 0) return null;
  return value > 1 ? Math.min(value / 100, 1) : Math.min(value, 1);
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function timestampValue(value: unknown): string {
  return nullableTimestamp(value) || new Date().toISOString();
}

function availabilitySourceType(value: unknown): TransitAvailabilitySourceType {
  const type = stringValue(value);
  return isTransitAvailabilitySourceType(type) ? type : "unknown";
}

function availabilitySourceFromRow(
  row: DbRow,
  fallbackUrl: string | null = null
): { type: TransitAvailabilitySourceType; label: string | null; url: string | null } {
  const storedType = availabilitySourceType(row.availability_source_type);
  const storedLabel = nullableString(row.availability_source_label);
  const storedUrl = nullableString(row.availability_source_url);

  if (isPublicSiteInfoAvailability(row) && (storedType === "unknown" || storedType === "manual_snapshot")) {
    return {
      type: "public_status",
      label: "公开来源",
      url: storedUrl || fallbackUrl,
    };
  }

  return {
    type: storedType,
    label: storedLabel,
    url: storedUrl,
  };
}

function isPublicSiteInfoAvailability(row: DbRow): boolean {
  const text = [
    row.station_id,
    row.collector_kind,
    row.price_source,
    row.availability_note,
  ].map(stringValue).join(" ");
  return /(?:APINode\s*(?:公开)?\s*site-info|apinode_public_site_info|sub2api_public_site_info)/i.test(text);
}

function isTransitAvailabilitySourceType(value: string): value is TransitAvailabilitySourceType {
  return (
    value === "priceai_probe" ||
    value === "public_status" ||
    value === "public_model_catalog" ||
    value === "partner_api" ||
    value === "merchant_reported" ||
    value === "manual_snapshot" ||
    value === "unknown"
  );
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

function latestTimestamp(...values: Array<string | null | undefined>): string | null {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
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
  })).filter((item) => item.title).map(withTransitCommercialOfferDisclosure);
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

function withoutColumn(columns: string, column: string): string {
  return columns
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item !== column)
    .join(",");
}

function withoutColumnsFromSelect(columns: string, ...excluded: readonly string[]): string {
  return columns
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !excluded.includes(item))
    .join(",");
}

function stationStatus(value: unknown): TransitStation["status"] {
  const text = stringValue(value);
  return text === "active" || text === "limited" || text === "unavailable" || text === "unknown" ? text : "unknown";
}

function stationSystem(value: unknown): TransitStation["stationSystem"] {
  const text = stringValue(value);
  return text === "new_api" || text === "sub_to_api" || text === "custom" ? text : undefined;
}

function operatorType(value: unknown): TransitStation["operatorType"] {
  const text = stringValue(value);
  return text === "company" || text === "individual" ? text : "individual";
}

function invoiceSupport(value: unknown): TransitStation["invoiceSupport"] {
  const text = stringValue(value);
  return text === "supported" || text === "unsupported" || text === "unknown" ? text : "unknown";
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
