import "server-only";

import { ADMIN_MANUAL_HIDE_REASON_PREFIX, listOfferFeedback, listSiteFeedback, listSubmissions } from "./admin";
import { getAdminPasswordStatus } from "./admin-auth";
import { notifyOperationalIssue } from "./alerts";
import { getApiTransitAdminData, getEmptyApiTransitAdminData } from "./api-transit-admin";
import { allPlatformOptions, buildProductGroups, canonicalCatalog, classifyOffer, comparePlatformOrder, isSharedAccessOffer, isTelegramStarsOffer, publicCatalogProducts, resolveOfferProduct } from "./catalog";
import { isSupabaseConfigured } from "./env";
import { getApiModelAdminData } from "./api-models-db";
import { normalizeCollectorKind } from "./collector-registry";
import { getOfficialSubscriptionAdminData } from "./official-prices-db";
import {
  buildOfferFilterFacets,
  deriveOfferFilterTags,
  filterOfferFilterFacetsForProduct,
  OFFER_FILTER_TAGS,
  offerMatchesFilterTags,
  parseOfferFilterTagsForProduct,
  type OfferFilterTagFacet,
  type OfferFilterTagId,
} from "./offer-filter-tags";
import {
  readPublicApiSnapshot,
  writePublicApiSnapshot,
  type PublicApiSnapshotPayload,
} from "./public-api-snapshots";
import { getFallbackRiskReviewSettingsSummary, getRiskReviewSettingsSummary } from "./risk-review-settings";
import { getFallbackSponsorSettingsSummary, getSponsorSettingsSummary } from "./sponsor-settings";
import { merchantCollectorGroup, merchantCollectorLabel, parseMerchantCollectorFilter } from "./merchant-collectors";
import {
  normalizePublicOfferLimit,
  normalizePublicOfferOffset,
  normalizePublicOfferQuery,
  PUBLIC_OFFER_DEFAULT_LIMIT,
} from "./public-offer-query";
import { PRICE_DATA_CACHE_TTL_MS } from "./public-cache-policy";
import { seedRawOffers, seedSources } from "./sample-data";
import { getSupabaseServerClient } from "./supabase";
import { API_CDK_PLATFORM, API_CDK_PRODUCT_ID, apiCdkPublicVisible, getPublicRiskPrecheck, isPublicCatalogProduct } from "./trust-risk";
import type {
  AdminCollectorStatus,
  AdminSummary,
  CanonicalProduct,
  CollectorHeartbeat,
  CollectorHealthKindSummary,
  CollectorHealthNodeSummary,
  CollectorHealthRunSummary,
  CollectorHealthSource,
  CollectorHealthSummary,
  CollectorNodeInfo,
  CollectionJob,
  CrawlRun,
  DashboardData,
  ExplorerData,
  ExplorerProductSummary,
  MerchantCollectorFilter,
  PublicMerchantSummary,
  PublicOfferSummary,
  PublicRiskFeedback,
  ProductGroup,
  RawOffer,
  Source,
  SourceOfferStats,
} from "./types";
import { publicOfferDedupeKey, stableId } from "./utils";

const SUPABASE_PAGE_SIZE = 1000;
const PUBLIC_FALLBACK_MAX_ROWS = 5000;
const PUBLIC_DATA_CACHE_TTL_MS = PRICE_DATA_CACHE_TTL_MS;
const EXPLORER_DATA_CACHE_TTL_MS = PRICE_DATA_CACHE_TTL_MS;
const PRODUCT_OFFERS_CACHE_TTL_MS = PRICE_DATA_CACHE_TTL_MS;
const PUBLIC_SUPABASE_READ_TIMEOUT_MS = 2_500;
const PUBLIC_SUPABASE_BUILD_READ_TIMEOUT_MS = 15_000;
const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";
const DASHBOARD_DATA_CACHE_TTL_MS = 30_000;
const ADMIN_DATA_CACHE_TTL_MS = 120_000;
const ADMIN_OFFER_SAMPLE_LIMIT = 80;
const EXPLORER_OFFER_SEARCH_TEXT_MAX_LENGTH = 480;
const STALE_PUBLIC_DATA_MESSAGE = "报价服务响应变慢，已先显示最近缓存结果。";
const PRIMARY_COLLECTOR_NODE_IDS = new Set([
  "huoshan2-nonshop",
  "aliyun4-beijing-priceai",
  "aliyun5-chengdu-priceai",
]);
const PUBLIC_EXPLORER_SNAPSHOT_KEY = "default";
const PUBLIC_OFFERS_SNAPSHOT_LIMIT = PUBLIC_OFFER_DEFAULT_LIMIT;
const PUBLIC_OFFERS_SNAPSHOT_OFFSET = 0;
const PUBLIC_PRODUCT_OFFERS_SNAPSHOT_LIMIT = PUBLIC_OFFER_DEFAULT_LIMIT;
const PUBLIC_PRODUCT_OFFERS_SNAPSHOT_OFFSET = 0;
const PUBLIC_PRODUCT_OFFERS_SNAPSHOT_TAGS = OFFER_FILTER_TAGS.map((tag) => tag.id);
const PUBLIC_OFFERS_SNAPSHOT_KEY = `default:limit:${PUBLIC_OFFERS_SNAPSHOT_LIMIT}`;
const PUBLIC_MERCHANTS_SNAPSHOT_KEY = "default:v6:compact";
const PUBLIC_PRODUCT_OFFERS_SNAPSHOT_VERSION = "v2-risk-feedback";
const PUBLIC_LIST_SNAPSHOT_STOCKS = ["available"] as const;
const PUBLIC_LIST_SNAPSHOT_SORTS = ["updated"] as const;
const PUBLIC_MERCHANT_SNAPSHOT_COLLECTORS = ["shopApi", "dujiao", "kami", "other"] as const;
const PUBLIC_MERCHANT_SNAPSHOT_SIGNALS = ["lowest", "warranty", "platform_aftersales", "risk_clear"] as const;
const PUBLIC_HOT_OFFER_PRODUCT_TYPES_BY_PLATFORM: Record<string, string[]> = {
  ChatGPT: ["订阅/会员"],
  Claude: ["成品账号"],
};
const PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND = "refresh_state";
const PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY = "public-prices";
const PUBLIC_API_SNAPSHOT_INCREMENTAL_REFRESH_MIN_INTERVAL_MS = 3 * 60 * 1000;
const PUBLIC_API_SNAPSHOT_GLOBAL_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;
const PUBLIC_API_SNAPSHOT_FULL_REFRESH_MAX_INTERVAL_MS = 60 * 60 * 1000;
const PUBLIC_API_SNAPSHOT_MAX_STALE_MS = PRICE_DATA_CACHE_TTL_MS * 2;
const PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS = 200;
const PUBLIC_API_SNAPSHOT_PRODUCT_REFRESH_BATCH_SIZE = 4;
const PUBLIC_API_SNAPSHOT_SOURCE_PRODUCT_LOOKUP_LIMIT = 1000;
const RAW_OFFER_PUBLIC_SELECT_FIELDS = [
  "id",
  "source_id",
  "source_name",
  "source_store_name",
  "source_title",
  "price",
  "currency",
  "status",
  "url",
  "tags",
  "stock_count",
  "hidden",
  "canonical_product_id",
  "category_slug",
  "captured_at",
  "source_updated_at",
  "last_seen_at",
  "verified_at",
  "expires_at",
  "source_priority",
  "confidence",
  "effective_status",
  "freshness_status",
  "last_failed_at",
  "failure_reason",
];
const RAW_OFFER_PUBLIC_SELECT = RAW_OFFER_PUBLIC_SELECT_FIELDS.join(",");
const RAW_OFFER_CONFIRMATION_SELECT = [
  "raw_offer_id",
  "captured_at",
  "last_seen_at",
  "verified_at",
  "expires_at",
  "source_status",
  "effective_status",
  "freshness_status",
  "source_priority",
  "confidence",
].join(",");
const RAW_OFFER_ADMIN_SELECT = [
  ...RAW_OFFER_PUBLIC_SELECT_FIELDS,
  "listed_price",
  "fee_amount",
  "price_basis",
].join(",");
const PUBLIC_SOURCE_SELECT = "id,name,base_url,entry_url,collection_method,collector_kind,enabled,notes,health_status,last_checked_at,last_success_at,consecutive_failures,last_error,created_at,shop_created_at,updated_at";
const PUBLIC_SOURCE_LEGACY_SELECT = "id,name,base_url,entry_url,collection_method,collector_kind,enabled,notes,health_status,last_checked_at,last_success_at,consecutive_failures,last_error,created_at,updated_at";

type PublicOfferData = {
  configured: boolean;
  degraded?: boolean;
  message?: string | null;
  generatedAt: string;
  offers: RawOffer[];
  products: CanonicalProduct[];
  sources?: Source[];
};

type PublicRiskFeedbackSummary = {
  byOfferId: Map<string, PublicRiskFeedbackAggregate>;
  bySourceId: Map<string, PublicRiskFeedbackAggregate>;
};

type PublicRiskFeedbackReason = NonNullable<PublicRiskFeedback["reasons"]>[number];

type PublicRiskFeedbackAggregate = {
  count: number;
  latestAt: string | null;
  reasons: Set<PublicRiskFeedbackReason>;
  summaries: Set<string>;
  offerSummaries: Set<string>;
  sourceSummaries: Set<string>;
};

const DATA_UNAVAILABLE_MESSAGE = "真实报价数据暂时不可用，请稍后刷新。";

export type PublicProductOffersResult = {
  offers: RawOffer[];
  total: number;
  filterFacets: OfferFilterTagFacet[];
  activeFilterTags: OfferFilterTagId[];
  limited?: boolean;
  generatedAt: string;
  degraded?: boolean;
  message?: string | null;
};

type PublicOffersResult = {
  rows: Array<{
    offer: RawOffer;
    product: CanonicalProduct;
  }>;
  total: number;
  limited?: boolean;
  generatedAt: string;
  degraded?: boolean;
  message?: string | null;
};

export type PublicApiSnapshotRefreshState = {
  dirty: boolean;
  dirtyAt: string | null;
  reason: string | null;
  lastRefreshStartedAt: string | null;
  lastRefreshCompletedAt: string | null;
  lastGlobalRefreshCompletedAt: string | null;
  lastFullRefreshCompletedAt: string | null;
  refreshIntervalSeconds: number;
  globalDirty: boolean;
  fullRefreshRequired: boolean;
  affectedProductIds: string[];
  affectedOfferIds: string[];
  affectedSourceIds: string[];
};

export type PublicApiSnapshotDirtyScope = {
  productIds?: Array<string | null | undefined>;
  offerIds?: Array<string | null | undefined>;
  sourceIds?: Array<string | null | undefined>;
  global?: boolean;
  full?: boolean;
  fullOnProductScopeLimitOnly?: boolean;
  preferProductScope?: boolean;
  resetRefreshScope?: boolean;
};

export type PublicApiSnapshotRefreshResult = {
  mode: "full" | "incremental";
  explorer?: boolean;
  offers?: boolean;
  merchants?: boolean;
  productOffers: Array<{ key: string; ok: boolean }>;
  productIds: string[];
  remainingProductIds?: string[];
};

export type PublicApiSnapshotRefreshDecision =
  | {
      refreshed: true;
      skipped: false;
      reason: "dirty" | "forced" | "missing_state";
      state: PublicApiSnapshotRefreshState;
      result: PublicApiSnapshotRefreshResult;
    }
  | {
      refreshed: false;
      skipped: true;
      reason: "clean" | "cooldown";
      state: PublicApiSnapshotRefreshState;
      retryAfter: string | null;
    };

export type PublicMerchantsResult = {
  rows: PublicMerchantSummary[];
  total: number;
  limited?: boolean;
  limit?: number;
  offset?: number;
  generatedAt: string;
  degraded?: boolean;
  message?: string | null;
};

type PublicOfferPageRow = Record<string, unknown> & {
  total_count?: number | string | null;
  product_id?: string | null;
  product_slug?: string | null;
  product_display_name?: string | null;
  product_platform?: string | null;
  product_type?: string | null;
  product_spec?: string | null;
  product_summary?: string | null;
  product_updated_at?: string | null;
};

type PublicMerchantRow = Record<string, unknown> & {
  total_count?: number | string | null;
};

let publicOfferDataCache: { expiresAt: number; value: PublicOfferData } | null = null;
let publicOfferDataPromise: Promise<PublicOfferData> | null = null;
let publicOffersCache: { expiresAt: number; value: PublicOffersResult } | null = null;
const publicOfferViewCache = new Map<string, { expiresAt: number; value: PublicOffersResult }>();
let explorerDataCache: { expiresAt: number; value: ExplorerData } | null = null;
let explorerDataPromise: Promise<ExplorerData> | null = null;
let publicMerchantsCache: { expiresAt: number; value: PublicMerchantsResult } | null = null;
let publicMerchantsPromise: Promise<PublicMerchantsResult> | null = null;
const publicMerchantViewCache = new Map<string, { expiresAt: number; value: PublicMerchantsResult }>();
let dashboardDataCache: { expiresAt: number; value: DashboardData } | null = null;
let dashboardDataPromise: Promise<DashboardData> | null = null;
let adminSummaryCache: { expiresAt: number; value: AdminSummary } | null = null;
let adminSummaryPromise: Promise<AdminSummary> | null = null;
const productOffersCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof loadPublicProductOffers>> }>();
const productOfferFacetsCache = new Map<string, { expiresAt: number; value: OfferFilterTagFacet[] }>();

type OfferListFilters = {
  platform?: string | null;
  productType?: string | null;
  stock?: string | null;
  query?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: string | null;
  limit?: number;
  offset?: number;
  skipSnapshot?: boolean;
};

type MerchantListFilters = {
  platform?: string | null;
  productType?: string | null;
  stock?: string | null;
  query?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: string | null;
  collector?: string | null;
  signal?: string | null;
  limit?: number;
  offset?: number;
};

export type AdminOfferMaintenanceScope = "visible" | "hidden";

export type AdminOfferMaintenancePage = {
  offers: RawOffer[];
  total: number;
  limit: number;
  offset: number;
  scope: AdminOfferMaintenanceScope;
};

type ProductOfferListFilters = {
  limit?: number;
  offset?: number;
  filterTags?: string[] | null;
  query?: string | string[] | null;
  excludeQuery?: string | string[] | null;
  collector?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};

export function clearPublicDataCache(): void {
  publicOfferDataCache = null;
  publicOfferDataPromise = null;
  publicOffersCache = null;
  publicOfferViewCache.clear();
  explorerDataCache = null;
  explorerDataPromise = null;
  publicMerchantsCache = null;
  publicMerchantsPromise = null;
  publicMerchantViewCache.clear();
  dashboardDataCache = null;
  dashboardDataPromise = null;
  clearAdminDataCache();
  productOffersCache.clear();
  productOfferFacetsCache.clear();
}

export async function markPublicApiSnapshotsDirty(
  reason: string,
  scope: PublicApiSnapshotDirtyScope = {},
): Promise<boolean> {
  const now = new Date().toISOString();
  const current = await readPublicApiSnapshot<PublicApiSnapshotRefreshState>(
    PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND,
    PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY,
  );
  const state = normalizePublicApiSnapshotRefreshState(current?.value);
  const resetRefreshScope = scope.resetRefreshScope === true;
  const nextProductIds = mergePublicSnapshotIds(
    scope.productIds,
    resetRefreshScope ? [] : state.affectedProductIds,
  );
  const preferProductScope = scope.preferProductScope === true && nextProductIds.length > 0;
  const nextOfferIds = preferProductScope
    ? []
    : mergePublicSnapshotIds(resetRefreshScope ? [] : state.affectedOfferIds, scope.offerIds);
  const nextSourceIds = preferProductScope
    ? []
    : mergePublicSnapshotIds(resetRefreshScope ? [] : state.affectedSourceIds, scope.sourceIds);
  const reachedScopeLimit = publicApiSnapshotDirtyScopeReachedLimit({
    productIds: nextProductIds,
    offerIds: nextOfferIds,
    sourceIds: nextSourceIds,
    productScopeOnly: scope.fullOnProductScopeLimitOnly === true,
  });
  const nextGlobalDirty = resetRefreshScope
    ? scope.global !== false
    : state.globalDirty || scope.global !== false;
  const nextFullRefreshRequired = resetRefreshScope
    ? Boolean(scope.full) || reachedScopeLimit
    : state.fullRefreshRequired || Boolean(scope.full) || reachedScopeLimit;

  return writePublicApiSnapshot({
    kind: PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND,
    key: PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY,
    payload: {
      ...state,
      dirty: true,
      dirtyAt: now,
      reason,
      refreshIntervalSeconds: secondsFromMs(PUBLIC_API_SNAPSHOT_INCREMENTAL_REFRESH_MIN_INTERVAL_MS),
      globalDirty: nextGlobalDirty,
      fullRefreshRequired: nextFullRefreshRequired,
      affectedProductIds: nextProductIds,
      affectedOfferIds: nextOfferIds,
      affectedSourceIds: nextSourceIds,
    },
    generatedAt: now,
  });
}

export async function refreshPublicApiSnapshotsIfDue({
  force = false,
  minIntervalMs = PUBLIC_API_SNAPSHOT_INCREMENTAL_REFRESH_MIN_INTERVAL_MS,
  globalIntervalMs = PUBLIC_API_SNAPSHOT_GLOBAL_REFRESH_MIN_INTERVAL_MS,
  fullRefreshMaxIntervalMs = PUBLIC_API_SNAPSHOT_FULL_REFRESH_MAX_INTERVAL_MS,
}: {
  force?: boolean;
  minIntervalMs?: number;
  globalIntervalMs?: number;
  fullRefreshMaxIntervalMs?: number;
} = {}): Promise<PublicApiSnapshotRefreshDecision> {
  const now = new Date();
  const snapshot = await readPublicApiSnapshot<PublicApiSnapshotRefreshState>(
    PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND,
    PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY,
  );
  const state = normalizePublicApiSnapshotRefreshState(snapshot?.value);

  if (!force && !state.dirty && snapshot) {
    const lastFullRefreshTime = timestampMs(state.lastFullRefreshCompletedAt);
    const fullRefreshDue = !lastFullRefreshTime || now.getTime() - lastFullRefreshTime >= fullRefreshMaxIntervalMs;
    if (!fullRefreshDue) {
      return { refreshed: false, skipped: true, reason: "clean", state, retryAfter: null };
    }
  }

  const lastRefreshTime = state.lastRefreshCompletedAt
    ? new Date(state.lastRefreshCompletedAt).getTime()
    : 0;
  const elapsedMs = lastRefreshTime ? now.getTime() - lastRefreshTime : Number.POSITIVE_INFINITY;
  const lastFullRefreshTime = timestampMs(state.lastFullRefreshCompletedAt);
  const hasPendingProductRefresh = state.dirty && state.affectedProductIds.length > 0;
  const fullRefreshDue = !hasPendingProductRefresh &&
    (!lastFullRefreshTime || now.getTime() - lastFullRefreshTime >= fullRefreshMaxIntervalMs);
  const shouldFullRefresh = force || !snapshot || state.fullRefreshRequired || fullRefreshDue;

  if (!shouldFullRefresh && elapsedMs < minIntervalMs) {
    return {
      refreshed: false,
      skipped: true,
      reason: "cooldown",
      state,
      retryAfter: new Date(lastRefreshTime + minIntervalMs).toISOString(),
    };
  }

  const startedAt = new Date().toISOString();
  await writePublicApiSnapshot({
    kind: PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND,
    key: PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY,
    payload: {
      ...state,
      dirty: true,
      lastRefreshStartedAt: startedAt,
      refreshIntervalSeconds: Math.round(minIntervalMs / 1000),
    },
    generatedAt: startedAt,
  });

  const lastGlobalRefreshTime = timestampMs(state.lastGlobalRefreshCompletedAt || state.lastRefreshCompletedAt);
  const globalRefreshDue = !lastGlobalRefreshTime || now.getTime() - lastGlobalRefreshTime >= globalIntervalMs;
  const scope = shouldFullRefresh
    ? { productIds: [], fullRequired: true }
    : await resolvePublicApiSnapshotRefreshScope(state);
  if (!shouldFullRefresh && scope.fullRequired) {
    state.fullRefreshRequired = true;
  }

  const mustRunFullRefresh = shouldFullRefresh || scope.fullRequired;
  const refreshGlobal = mustRunFullRefresh || (state.globalDirty && globalRefreshDue);
  if (!mustRunFullRefresh && !refreshGlobal && !scope.productIds.length) {
    return {
      refreshed: false,
      skipped: true,
      reason: "cooldown",
      state,
      retryAfter: new Date((lastGlobalRefreshTime || now.getTime()) + globalIntervalMs).toISOString(),
    };
  }

  const result = mustRunFullRefresh
    ? await refreshPublicApiSnapshots()
    : await refreshPublicApiSnapshotsForScope({
        productIds: scope.productIds,
        refreshGlobal,
      });
  const completedAt = new Date().toISOString();
  const latestSnapshot = await readPublicApiSnapshot<PublicApiSnapshotRefreshState>(
    PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND,
    PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY,
  );
  const latestState = normalizePublicApiSnapshotRefreshState(latestSnapshot?.value);
  const latestDirtyAtMs = latestState.dirtyAt ? new Date(latestState.dirtyAt).getTime() : 0;
  const startedAtMs = new Date(startedAt).getTime();
  const dirtiedDuringRefresh = latestState.dirty &&
    Number.isFinite(latestDirtyAtMs) &&
    latestDirtyAtMs > startedAtMs;
  const nextState = buildNextPublicApiSnapshotRefreshState({
    completedAt,
    dirtiedDuringRefresh,
    globalRefreshed: mustRunFullRefresh || refreshGlobal,
    fullRefreshAttempted: mustRunFullRefresh,
    latestState,
    minIntervalMs,
    previousState: state,
    processedProductIds: result.productIds,
    remainingProductIds: result.remainingProductIds || [],
    startedAt,
  });

  await writePublicApiSnapshot({
    kind: PUBLIC_API_SNAPSHOT_REFRESH_STATE_KIND,
    key: PUBLIC_API_SNAPSHOT_REFRESH_STATE_KEY,
    payload: nextState,
    generatedAt: completedAt,
  });

  return {
    refreshed: true,
    skipped: false,
    reason: force ? "forced" : snapshot ? "dirty" : "missing_state",
    state: nextState,
    result,
  };
}

function normalizePublicApiSnapshotRefreshState(value: unknown): PublicApiSnapshotRefreshState {
  if (!value || typeof value !== "object") {
    return {
      dirty: false,
      dirtyAt: null,
      reason: null,
      lastRefreshStartedAt: null,
      lastRefreshCompletedAt: null,
      lastGlobalRefreshCompletedAt: null,
      lastFullRefreshCompletedAt: null,
      refreshIntervalSeconds: secondsFromMs(PUBLIC_API_SNAPSHOT_INCREMENTAL_REFRESH_MIN_INTERVAL_MS),
      globalDirty: false,
      fullRefreshRequired: false,
      affectedProductIds: [],
      affectedOfferIds: [],
      affectedSourceIds: [],
    };
  }

  const record = value as Partial<PublicApiSnapshotRefreshState>;
  return {
    dirty: record.dirty === true,
    dirtyAt: typeof record.dirtyAt === "string" ? record.dirtyAt : null,
    reason: typeof record.reason === "string" ? record.reason : null,
    lastRefreshStartedAt: typeof record.lastRefreshStartedAt === "string" ? record.lastRefreshStartedAt : null,
    lastRefreshCompletedAt: typeof record.lastRefreshCompletedAt === "string" ? record.lastRefreshCompletedAt : null,
    lastGlobalRefreshCompletedAt: typeof record.lastGlobalRefreshCompletedAt === "string" ? record.lastGlobalRefreshCompletedAt : null,
    lastFullRefreshCompletedAt: typeof record.lastFullRefreshCompletedAt === "string" ? record.lastFullRefreshCompletedAt : null,
    refreshIntervalSeconds: Number.isFinite(record.refreshIntervalSeconds)
      ? Number(record.refreshIntervalSeconds)
      : secondsFromMs(PUBLIC_API_SNAPSHOT_INCREMENTAL_REFRESH_MIN_INTERVAL_MS),
    globalDirty: record.globalDirty === true,
    fullRefreshRequired: record.fullRefreshRequired === true,
    affectedProductIds: normalizePublicSnapshotIdList(record.affectedProductIds),
    affectedOfferIds: normalizePublicSnapshotIdList(record.affectedOfferIds),
    affectedSourceIds: normalizePublicSnapshotIdList(record.affectedSourceIds),
  };
}

function secondsFromMs(value: number): number {
  return Math.round(value / 1000);
}

function normalizePublicSnapshotIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )).slice(0, PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS);
}

function mergePublicSnapshotIds(
  current: Array<string | null | undefined> | null | undefined,
  next: Array<string | null | undefined> | null | undefined,
): string[] {
  return normalizePublicSnapshotIdList([...(current || []), ...(next || [])]);
}

function publicApiSnapshotDirtyScopeReachedLimit({
  productIds,
  offerIds,
  sourceIds,
  productScopeOnly,
}: {
  productIds: string[];
  offerIds: string[];
  sourceIds: string[];
  productScopeOnly: boolean;
}): boolean {
  if (productIds.length >= PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS) return true;
  if (productScopeOnly) return false;

  return offerIds.length >= PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS ||
    sourceIds.length >= PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS;
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function isMissingRawOfferConfirmationsTableError(error: unknown): boolean {
  const maybe = error as { code?: string; message?: string } | null;
  return maybe?.code === "42P01" || /raw_offer_confirmations/i.test(String(maybe?.message || ""));
}

async function resolvePublicApiSnapshotRefreshScope(
  state: PublicApiSnapshotRefreshState,
): Promise<{ productIds: string[]; fullRequired: boolean }> {
  const productIds = normalizePublicSnapshotIdList(state.affectedProductIds);
  const offerIds = normalizePublicSnapshotIdList(state.affectedOfferIds);
  const sourceIds = normalizePublicSnapshotIdList(state.affectedSourceIds);
  const scopeTooLarge =
    productIds.length >= PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS ||
    offerIds.length >= PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS ||
    sourceIds.length >= PUBLIC_API_SNAPSHOT_MAX_AFFECTED_ITEMS;
  if (scopeTooLarge) return { productIds, fullRequired: true };

  const resolved = await resolvePublicSnapshotProductIds({ offerIds, sourceIds });
  return {
    productIds: mergePublicSnapshotIds(productIds, resolved.productIds),
    fullRequired: resolved.fullRequired,
  };
}

async function resolvePublicSnapshotProductIds({
  offerIds,
  sourceIds,
}: {
  offerIds: string[];
  sourceIds: string[];
}): Promise<{ productIds: string[]; fullRequired: boolean }> {
  if (!offerIds.length && !sourceIds.length) return { productIds: [], fullRequired: false };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { productIds: [], fullRequired: true };

  const productIds = new Set<string>();
  let fullRequired = false;

  for (const ids of chunks(offerIds, 100)) {
    const { data, error } = await supabase
      .from("raw_offers")
      .select("canonical_product_id,source_title,tags,price")
      .in("id", ids)
      .abortSignal(publicSupabaseReadSignal());
    if (error) {
      console.warn("Public snapshot offer scope lookup failed:", error.message);
      fullRequired = true;
      continue;
    }
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const productId = productIdFromRawOfferScopeRow(row);
      if (productId) productIds.add(productId);
    }
  }

  for (const ids of chunks(sourceIds, 20)) {
    const { data, error, count } = await supabase
      .from("raw_offers")
      .select("canonical_product_id,source_title,tags,price", { count: "exact" })
      .in("source_id", ids)
      .limit(PUBLIC_API_SNAPSHOT_SOURCE_PRODUCT_LOOKUP_LIMIT)
      .abortSignal(publicSupabaseReadSignal());
    if (error) {
      console.warn("Public snapshot source scope lookup failed:", error.message);
      fullRequired = true;
      continue;
    }
    if ((count || 0) >= PUBLIC_API_SNAPSHOT_SOURCE_PRODUCT_LOOKUP_LIMIT) {
      fullRequired = true;
    }
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const productId = productIdFromRawOfferScopeRow(row);
      if (productId) productIds.add(productId);
    }
  }

  return {
    productIds: normalizePublicSnapshotIdList([...productIds]),
    fullRequired,
  };
}

function productIdFromRawOfferScopeRow(row: Record<string, unknown>): string | null {
  if (typeof row.canonical_product_id === "string" && row.canonical_product_id.trim()) {
    return row.canonical_product_id.trim();
  }
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  return classifyOffer(String(row.source_title || ""), {
    tags,
    price: typeof row.price === "number" ? row.price : null,
  }).id;
}

function buildNextPublicApiSnapshotRefreshState({
  completedAt,
  dirtiedDuringRefresh,
  fullRefreshAttempted,
  globalRefreshed,
  latestState,
  minIntervalMs,
  previousState,
  processedProductIds,
  remainingProductIds,
  startedAt,
}: {
  completedAt: string;
  dirtiedDuringRefresh: boolean;
  fullRefreshAttempted: boolean;
  globalRefreshed: boolean;
  latestState: PublicApiSnapshotRefreshState;
  minIntervalMs: number;
  previousState: PublicApiSnapshotRefreshState;
  processedProductIds: string[];
  remainingProductIds: string[];
  startedAt: string;
}): PublicApiSnapshotRefreshState {
  if (dirtiedDuringRefresh) {
    const affectedProductIds = normalizePublicSnapshotIdList([
      ...remainingProductIds,
      ...latestState.affectedProductIds,
    ]);
    return {
      ...latestState,
      dirty: latestState.dirty || affectedProductIds.length > 0,
      dirtyAt: latestState.dirtyAt || (affectedProductIds.length ? completedAt : null),
      lastRefreshStartedAt: startedAt,
      lastRefreshCompletedAt: completedAt,
      lastGlobalRefreshCompletedAt: globalRefreshed ? completedAt : latestState.lastGlobalRefreshCompletedAt,
      lastFullRefreshCompletedAt: fullRefreshAttempted ? completedAt : latestState.lastFullRefreshCompletedAt,
      refreshIntervalSeconds: secondsFromMs(minIntervalMs),
      fullRefreshRequired: fullRefreshAttempted ? false : latestState.fullRefreshRequired,
      affectedProductIds,
    };
  }

  const processed = new Set(processedProductIds);
  const affectedProductIds = fullRefreshAttempted
    ? remainingProductIds
    : previousState.fullRefreshRequired
      ? previousState.affectedProductIds
      : previousState.affectedProductIds.filter((id) => !processed.has(id));
  const globalDirty = !globalRefreshed && previousState.globalDirty;
  const fullRefreshRequired = fullRefreshAttempted
    ? false
    : previousState.fullRefreshRequired;
  const dirty = affectedProductIds.length > 0 || globalDirty || fullRefreshRequired;

  return {
    dirty,
    dirtyAt: dirty ? previousState.dirtyAt || completedAt : null,
    reason: dirty ? previousState.reason : null,
    lastRefreshStartedAt: startedAt,
    lastRefreshCompletedAt: completedAt,
    lastGlobalRefreshCompletedAt: globalRefreshed ? completedAt : previousState.lastGlobalRefreshCompletedAt,
    lastFullRefreshCompletedAt: fullRefreshAttempted ? completedAt : previousState.lastFullRefreshCompletedAt,
    refreshIntervalSeconds: secondsFromMs(minIntervalMs),
    globalDirty,
    fullRefreshRequired,
    affectedProductIds,
    affectedOfferIds: [],
    affectedSourceIds: [],
  };
}

function publicSnapshotProductBatch<T>(items: T[]): { batch: T[]; remaining: T[] } {
  return {
    batch: items.slice(0, PUBLIC_API_SNAPSHOT_PRODUCT_REFRESH_BATCH_SIZE),
    remaining: items.slice(PUBLIC_API_SNAPSHOT_PRODUCT_REFRESH_BATCH_SIZE),
  };
}

function comparePublicSnapshotProductRefreshPriority(
  a: ExplorerProductSummary,
  b: ExplorerProductSummary,
): number {
  const inStockDelta = b.inStockCount - a.inStockCount;
  if (inStockDelta) return inStockDelta;

  const offerDelta = b.offerCount - a.offerCount;
  if (offerDelta) return offerDelta;

  const latestDelta = timestampMs(b.latestSeenAt || b.updatedAt) - timestampMs(a.latestSeenAt || a.updatedAt);
  if (latestDelta) return latestDelta;

  const platformDelta = comparePlatformOrder(a.platform, b.platform);
  if (platformDelta) return platformDelta;

  return a.id.localeCompare(b.id);
}

export async function refreshPublicApiSnapshots(): Promise<PublicApiSnapshotRefreshResult> {
  const explorerData = await buildExplorerData({ skipSnapshot: true });
  const explorer = !explorerData.degraded && await writePublicApiSnapshot({
    kind: "explorer",
    key: PUBLIC_EXPLORER_SNAPSHOT_KEY,
    payload: explorerData,
    generatedAt: explorerData.generatedAt,
  });

  const offersData = await loadPublicOffers({
    limit: PUBLIC_OFFERS_SNAPSHOT_LIMIT,
    offset: PUBLIC_OFFERS_SNAPSHOT_OFFSET,
    skipSnapshot: true,
  });
  const offers = !offersData.degraded && await writePublicApiSnapshot({
    kind: "offers",
    key: PUBLIC_OFFERS_SNAPSHOT_KEY,
    payload: offersData,
    generatedAt: offersData.generatedAt,
  });

  const merchantsData = await buildPublicMerchants({ skipSnapshot: true });
  const merchants = !merchantsData.degraded && await writePublicApiSnapshot({
    kind: "merchants",
    key: PUBLIC_MERCHANTS_SNAPSHOT_KEY,
    payload: merchantsData,
    generatedAt: merchantsData.generatedAt,
  });

  const productRefs = explorerData.products
    .sort(comparePublicSnapshotProductRefreshPriority)
    .map((product) => ({ id: product.id, slug: product.slug }));
  const { batch: productBatch, remaining: remainingProducts } = publicSnapshotProductBatch(productRefs);
  const productOffers = await refreshPublicProductOfferSnapshots(productBatch);

  clearPublicDataCache();
  return {
    mode: "full",
    explorer,
    offers,
    merchants,
    productOffers,
    productIds: productBatch.map((product) => product.id),
    remainingProductIds: remainingProducts.map((product) => product.id),
  };
}

async function refreshPublicApiSnapshotsForScope({
  productIds,
  refreshGlobal,
}: {
  productIds: string[];
  refreshGlobal: boolean;
}): Promise<PublicApiSnapshotRefreshResult> {
  let explorer: boolean | undefined;
  let offers: boolean | undefined;
  let merchants: boolean | undefined;
  let explorerProducts: Array<{ id: string; slug?: string | null }> = [];

  if (refreshGlobal) {
    const explorerData = await buildExplorerData({ skipSnapshot: true });
    explorer = !explorerData.degraded && await writePublicApiSnapshot({
      kind: "explorer",
      key: PUBLIC_EXPLORER_SNAPSHOT_KEY,
      payload: explorerData,
      generatedAt: explorerData.generatedAt,
    });
    explorerProducts = explorerData.products.map((product) => ({ id: product.id, slug: product.slug }));

    const offersData = await loadPublicOffers({
      limit: PUBLIC_OFFERS_SNAPSHOT_LIMIT,
      offset: PUBLIC_OFFERS_SNAPSHOT_OFFSET,
      skipSnapshot: true,
    });
    offers = !offersData.degraded && await writePublicApiSnapshot({
      kind: "offers",
      key: PUBLIC_OFFERS_SNAPSHOT_KEY,
      payload: offersData,
      generatedAt: offersData.generatedAt,
    });

    const merchantsData = await buildPublicMerchants({ skipSnapshot: true });
    merchants = !merchantsData.degraded && await writePublicApiSnapshot({
      kind: "merchants",
      key: PUBLIC_MERCHANTS_SNAPSHOT_KEY,
      payload: merchantsData,
      generatedAt: merchantsData.generatedAt,
    });
  }

  const productRefs = await resolvePublicSnapshotProductRefs(productIds, explorerProducts);
  const { batch: productBatch, remaining: remainingProducts } = publicSnapshotProductBatch(productRefs);
  const productOffers = await refreshPublicProductOfferSnapshots(productBatch);

  clearPublicDataCache();
  return {
    mode: "incremental",
    explorer,
    offers,
    merchants,
    productOffers,
    productIds: productBatch.map((product) => product.id),
    remainingProductIds: remainingProducts.map((product) => product.id),
  };
}

async function refreshPublicProductOfferSnapshots(
  products: Array<{ id: string; slug?: string | null }>,
): Promise<Array<{ key: string; ok: boolean }>> {
  const productOffers: Array<{ key: string; ok: boolean }> = [];
  for (const product of products) {
    const defaultValue = await loadPublicProductOffers(product.id, {
      limit: PUBLIC_PRODUCT_OFFERS_SNAPSHOT_LIMIT,
      offset: PUBLIC_PRODUCT_OFFERS_SNAPSHOT_OFFSET,
      filterTags: [],
      filterProductId: product.id,
      query: "",
      excludeQuery: "",
      collector: "all",
      minPrice: null,
      maxPrice: null,
      skipSnapshot: true,
    });
    const defaultKey = publicProductOffersSnapshotKey(product.id);
    let defaultOk = !defaultValue.degraded && await writePublicApiSnapshot({
      kind: "product_offers",
      key: defaultKey,
      payload: defaultValue,
      generatedAt: defaultValue.generatedAt,
    });
    if (product.slug && product.slug !== product.id) {
      defaultOk = defaultOk && await writePublicApiSnapshot({
        kind: "product_offers",
        key: publicProductOffersSnapshotKey(product.slug),
        payload: defaultValue,
        generatedAt: defaultValue.generatedAt,
      });
    }
    productOffers.push({ key: defaultKey, ok: defaultOk });
  }
  return productOffers;
}

async function resolvePublicSnapshotProductRefs(
  ids: string[],
  knownProducts: Array<{ id: string; slug?: string | null }> = [],
): Promise<Array<{ id: string; slug?: string | null }>> {
  const normalizedIds = normalizePublicSnapshotIdList(ids);
  if (!normalizedIds.length) return [];

  const products = knownProducts.length
    ? knownProducts
    : await listActiveCanonicalProducts()
        .then((value) => value.length ? value : canonicalCatalog)
        .catch(() => canonicalCatalog);
  const byIdOrSlug = new Map<string, { id: string; slug?: string | null }>();
  for (const product of products) {
    byIdOrSlug.set(product.id, { id: product.id, slug: product.slug });
    if (product.slug) byIdOrSlug.set(product.slug, { id: product.id, slug: product.slug });
  }

  const output = new Map<string, { id: string; slug?: string | null }>();
  for (const id of normalizedIds) {
    const product = byIdOrSlug.get(id) || { id };
    output.set(product.id, product);
  }
  return [...output.values()];
}

export function clearAdminDataCache(): void {
  adminSummaryCache = null;
  adminSummaryPromise = null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = Date.now();
  if (dashboardDataCache && dashboardDataCache.expiresAt > now) {
    return dashboardDataCache.value;
  }

  if (dashboardDataPromise) return dashboardDataPromise;

  dashboardDataPromise = readDashboardData()
    .then((value) => {
      const publicValue = filterPublicDashboardData(value);
      dashboardDataCache = {
        expiresAt: Date.now() + DASHBOARD_DATA_CACHE_TTL_MS,
        value: publicValue,
      };
      return publicValue;
    })
    .finally(() => {
      dashboardDataPromise = null;
    });

  return dashboardDataPromise;
}

async function readDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return buildDashboard(seedRawOffers, seedSources, canonicalCatalog, false);
  }

  try {
    const [sourcesResult, offerRows, productsResult] = await Promise.all([
      supabase.from("sources").select("*").order("name"),
      listVisibleRawOfferRows(),
      supabase.from("canonical_products").select("*").eq("is_active", true),
    ]);

    if (sourcesResult.error || productsResult.error) {
      throw sourcesResult.error || productsResult.error;
    }

    const sources = (sourcesResult.data || []).map(mapSource);
    const offers = attachKnownSourceCollectorKinds(offerRows.map(mapRawOffer), sourceMetaMap(sources));
    const products = (productsResult.data || []).map(mapCanonicalProduct);

    return buildDashboard(offers, sources, products.length ? products : canonicalCatalog, true);
  } catch (error) {
    console.error("Supabase dashboard read failed:", error);
    await notifyOperationalIssue({
      event: "dashboard-data-degraded",
      title: "PriceAI 后台数据读取失败，已进入降级状态",
      severity: "critical",
      details: { message: errorMessage(error) },
    });
    return buildDashboard([], [], canonicalCatalog, isSupabaseConfigured(), {
      degraded: true,
      message: DATA_UNAVAILABLE_MESSAGE,
    });
  }
}

async function listVisibleRawOfferRows(): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const rows: Record<string, unknown>[] = [];

  for (let from = 0; from < PUBLIC_FALLBACK_MAX_ROWS; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE, PUBLIC_FALLBACK_MAX_ROWS) - 1;
    const { data, error } = await supabase
      .from("raw_offers")
      .select(RAW_OFFER_PUBLIC_SELECT)
      .eq("hidden", false)
      .order("captured_at", { ascending: false })
      .range(from, to)
      .abortSignal(publicSupabaseReadSignal());

    if (error) throw error;

    const batch = (data || []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
  }

  return overlayRawOfferConfirmations(rows);
}

async function overlayRawOfferConfirmations(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !rows.length) return rows;

  const byId = new Map(rows.map((row) => [String(row.id), row]));
  for (const idChunk of chunks(Array.from(byId.keys()), 500)) {
    const { data, error } = await supabase
      .from("raw_offer_confirmations")
      .select(RAW_OFFER_CONFIRMATION_SELECT)
      .in("raw_offer_id", idChunk)
      .abortSignal(publicSupabaseReadSignal());

    if (error) {
      if (isMissingRawOfferConfirmationsTableError(error)) return rows;
      throw error;
    }

    const confirmations = (data || []) as unknown as Array<Record<string, unknown>>;
    for (const confirmation of confirmations) {
      const row = byId.get(String(confirmation.raw_offer_id || ""));
      if (!row) continue;
      row.captured_at = confirmation.captured_at || row.captured_at;
      row.last_seen_at = confirmation.last_seen_at || row.last_seen_at;
      row.verified_at = confirmation.verified_at || row.verified_at;
      row.expires_at = confirmation.expires_at || row.expires_at;
      row.source_status = confirmation.source_status || row.source_status;
      row.effective_status = confirmation.effective_status || row.effective_status;
      row.freshness_status = confirmation.freshness_status || row.freshness_status;
      row.source_priority = confirmation.source_priority ?? row.source_priority;
      row.confidence = confirmation.confidence ?? row.confidence;
    }
  }

  return rows;
}

async function readPublicOfferData(): Promise<PublicOfferData> {
  const now = Date.now();
  if (publicOfferDataCache && publicOfferDataCache.expiresAt > now) {
    return publicOfferDataCache.value;
  }

  if (publicOfferDataPromise) return publicOfferDataPromise;

  const staleValue = publicOfferDataCache?.value || null;
  publicOfferDataPromise = loadPublicOfferData()
    .then((value) => {
      const nextValue = preferStalePublicOfferData(staleValue, value);
      if (!nextValue.degraded) {
        publicOfferDataCache = {
          expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
          value: nextValue,
        };
      }
      return nextValue;
    })
    .finally(() => {
      publicOfferDataPromise = null;
    });

  return publicOfferDataPromise;
}

async function loadPublicOfferData(): Promise<PublicOfferData> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const products = publicCatalogProducts(canonicalCatalog);
    return {
      configured: false,
      degraded: false,
      generatedAt: new Date().toISOString(),
      offers: seedRawOffers.filter((offer) => !offer.hidden && isPublicOfferForProducts(offer, products)),
      products,
    };
  }

  try {
    const [offerRows, products, riskFeedback, sources] = await Promise.all([
      listVisibleRawOfferRows(),
      listActiveCanonicalProducts(),
      listPublicRiskFeedbackSummary(),
      listPublicSourcesForOffers(),
    ]);

    const publicProducts = publicCatalogProducts(products.length ? products : canonicalCatalog);
    const mappedOffers = attachKnownSourceCollectorKinds(offerRows.map(mapRawOffer), sourceMetaMap(sources));
    const offers = attachPublicRiskFeedback(
      mappedOffers.filter((offer) => isPublicOfferForProducts(offer, publicProducts)),
      riskFeedback,
    );
    return {
      configured: true,
      generatedAt: new Date().toISOString(),
      offers,
      products: publicProducts,
      sources,
    };
  } catch (error) {
    console.error("Supabase public offer read failed:", error);
    await notifyOperationalIssue({
      event: "public-offers-degraded",
      title: "PriceAI 公开报价读取失败，前台已显示降级提示",
      severity: "critical",
      details: { message: errorMessage(error) },
    });
    return {
      configured: isSupabaseConfigured(),
      degraded: true,
      message: DATA_UNAVAILABLE_MESSAGE,
      generatedAt: new Date().toISOString(),
      offers: [],
      products: canonicalCatalog,
    };
  }
}

export async function getExplorerData(): Promise<ExplorerData> {
  const now = Date.now();
  if (explorerDataCache && explorerDataCache.expiresAt > now && isReusableGeneratedValue(explorerDataCache.value)) {
    return explorerDataCache.value;
  }

  if (explorerDataPromise) return explorerDataPromise;

  const staleValue = explorerDataCache?.value || null;
  explorerDataPromise = buildExplorerData()
    .then((value) => {
      const nextValue = preferStaleExplorerData(staleValue, value);
      if (!nextValue.degraded) {
        explorerDataCache = {
          expiresAt: Date.now() + EXPLORER_DATA_CACHE_TTL_MS,
          value: nextValue,
        };
      }
      return nextValue;
    })
    .finally(() => {
      explorerDataPromise = null;
    });

  return explorerDataPromise;
}

async function buildExplorerData(options: { skipSnapshot?: boolean } = {}): Promise<ExplorerData> {
  let staleSnapshotValue: ExplorerData | null = null;
  if (!options.skipSnapshot) {
    const snapshot = await readPublicApiSnapshot<ExplorerData>("explorer", PUBLIC_EXPLORER_SNAPSHOT_KEY);
    if (snapshot && isExplorerDataSnapshot(snapshot.value)) {
      const value = sanitizeExplorerDataForPublicCatalog(hydrateGeneratedAt(snapshot));
      if (isPublicApiSnapshotFresh(snapshot)) return value;
      staleSnapshotValue = value;
    }
  }

  const value = await buildExplorerDataFromSource();
  const publicValue = sanitizeExplorerDataForPublicCatalog(value);
  const nextValue = staleSnapshotValue ? preferStaleExplorerData(staleSnapshotValue, publicValue) : publicValue;
  if (!options.skipSnapshot && !value.degraded) {
    await writePublicApiSnapshot({
      kind: "explorer",
      key: PUBLIC_EXPLORER_SNAPSHOT_KEY,
      payload: publicValue,
      generatedAt: publicValue.generatedAt,
    });
  }

  return nextValue;
}

async function buildExplorerDataFromSource(): Promise<ExplorerData> {
  const rpcData = await getExplorerDataFromDatabase();
  if (rpcData) return rpcData;

  const publicData = await readPublicOfferData();
  const products = buildProductGroups(dedupePublicOffers(publicData.offers), publicData.products);

  return {
    generatedAt: publicData.generatedAt,
    configured: publicData.configured,
    degraded: publicData.degraded,
    message: publicData.message,
    products: products.map(toExplorerProductSummary),
    sources: [],
    offerTotal: publicData.offers.length,
  };
}

async function getExplorerDataFromDatabase(): Promise<ExplorerData | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("list_public_product_summaries")
    .abortSignal(publicSupabaseReadSignal());
  if (error) {
    console.error("Product summary RPC failed:", error.message);
    return null;
  }

  const products = ((data || []) as unknown as Record<string, unknown>[])
    .map(mapPublicProductSummaryRow)
    .filter((product) => isPublicCatalogProduct(product));
  return {
    generatedAt: new Date().toISOString(),
    configured: true,
    degraded: false,
    message: null,
    products,
    sources: [],
    offerTotal: products.reduce((sum, product) => sum + product.offerCount, 0),
  };
}

export function getEmptyAdminSummary(isAuthenticated = false): AdminSummary {
  return {
    generatedAt: new Date().toISOString(),
    configured: isSupabaseConfigured(),
    products: [],
    sources: [],
    rawOffers: [],
    loadErrors: [],
    rawOfferTotal: 0,
    hiddenRawOfferTotal: 0,
    isAuthenticated,
    crawlRuns: [],
    collectionJobs: [],
    collectorHealth: emptyCollectorHealthSummary(new Date().toISOString()),
    officialPrices: {
      configured: isSupabaseConfigured(),
      tableReady: false,
      source: "static",
      generatedAt: new Date().toISOString(),
      message: "尚未加载官方地区价后台数据。",
      apps: [],
      plans: [],
      regions: [],
      currentPrices: [],
      collectRuns: [],
      unmatchedItems: [],
    },
    apiModels: {
      configured: isSupabaseConfigured(),
      tableReady: false,
      source: "static",
      generatedAt: new Date().toISOString(),
      message: "尚未加载 API 模型后台数据。",
      models: [],
      providers: [],
      plans: [],
      offers: [],
      collectRuns: [],
      providerCandidates: [],
      providerSubmissions: [],
    },
    apiTransit: getEmptyApiTransitAdminData(isAuthenticated),
    pendingSubmissions: [],
    pendingOfferFeedback: [],
    pendingSiteFeedback: [],
    sourceOfferStats: [],
    hiddenRawOffers: [],
    feedbackRawOffers: [],
    riskReviewSettings: getFallbackRiskReviewSettingsSummary("尚未加载风险预审配置。"),
    sponsorSettings: getFallbackSponsorSettingsSummary("尚未加载赞助位配置。"),
    passwordStatus: {
      configured: false,
      tableReady: false,
      source: "unconfigured",
      minLength: 12,
      updatedAt: null,
      message: "尚未加载后台密码状态。",
    },
  };
}

export async function getAdminSummary(options: { isAuthenticated?: boolean } = {}): Promise<AdminSummary> {
  const now = Date.now();
  if (adminSummaryCache && adminSummaryCache.expiresAt > now) {
    return {
      ...adminSummaryCache.value,
      isAuthenticated: Boolean(options.isAuthenticated),
    };
  }

  if (adminSummaryPromise) {
    const value = await adminSummaryPromise;
    return {
      ...value,
      isAuthenticated: Boolean(options.isAuthenticated),
    };
  }

  adminSummaryPromise = readAdminSummary()
    .then((value) => {
      adminSummaryCache = {
        expiresAt: Date.now() + ADMIN_DATA_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      adminSummaryPromise = null;
    });

  const value = await adminSummaryPromise;
  return {
    ...value,
    isAuthenticated: Boolean(options.isAuthenticated),
  };
}

export async function listAdminOfferMaintenancePage(options: {
  scope: AdminOfferMaintenanceScope;
  query?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminOfferMaintenancePage> {
  const supabase = getSupabaseServerClient();
  const limit = Math.min(Math.max(options.limit || ADMIN_OFFER_SAMPLE_LIMIT, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  if (!supabase) {
    const offers = options.scope === "visible"
      ? seedRawOffers.filter((offer) => !offer.hidden)
      : seedRawOffers.filter((offer) => offer.hidden);
    const matched = filterAdminOfferMaintenanceRows(offers, options.query || "");
    return {
      offers: matched.slice(offset, offset + limit),
      total: matched.length,
      limit,
      offset,
      scope: options.scope,
    };
  }

  let query = supabase
    .from("raw_offers")
    .select(RAW_OFFER_ADMIN_SELECT, { count: "exact" });

  if (options.scope === "hidden") {
    query = query
      .eq("hidden", true)
      .ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`)
      .order("updated_at", { ascending: false });
  } else {
    query = query
      .eq("hidden", false)
      .order("captured_at", { ascending: false });
  }

  const search = toAdminOfferSearchPattern(options.query || "");
  if (search) {
    query = query.or(
      [
        `source_title.ilike.${search}`,
        `source_name.ilike.${search}`,
        `source_store_name.ilike.${search}`,
        `url.ilike.${search}`,
        `failure_reason.ilike.${search}`,
        `source_id.ilike.${search}`,
        `canonical_product_id.ilike.${search}`,
        `category_slug.ilike.${search}`,
      ].join(","),
    );
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  return {
    offers: ((data || []) as unknown as Record<string, unknown>[]).map(mapRawOffer),
    total: count || 0,
    limit,
    offset,
    scope: options.scope,
  };
}

export async function getAdminCollectorStatus(): Promise<AdminCollectorStatus> {
  const generatedAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      generatedAt,
      crawlRuns: [],
      collectorHealth: emptyCollectorHealthSummary(generatedAt),
      latestCrawlAt: null,
      latestSuccessfulCrawlAt: null,
      latestCrawlStatus: null,
    };
  }

  const [sourcesResult, crawlRunsResult, heartbeatsResult] = await Promise.all([
    supabase.from("sources").select(PUBLIC_SOURCE_SELECT).order("name"),
    supabase
      .from("crawl_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(120),
    supabase
      .from("collector_heartbeats")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(50),
  ]);

  if (sourcesResult.error) throw sourcesResult.error;
  if (crawlRunsResult.error) throw crawlRunsResult.error;
  if (heartbeatsResult.error) throw heartbeatsResult.error;

  const sources = (sourcesResult.data || []).map(mapSource);
  const crawlRuns = (crawlRunsResult.data || []).map(mapCrawlRun);
  const heartbeats = (heartbeatsResult.data || []).map(mapCollectorHeartbeat);
  const latestCrawl = latestRunByTime(crawlRuns);
  const latestSuccessfulCrawl = latestRunByTime(
    crawlRuns.filter((run) => run.status === "success" || run.status === "partial"),
  );

  return {
    generatedAt,
    crawlRuns,
    collectorHealth: buildCollectorHealthSummary({
      generatedAt,
      sources,
      crawlRuns,
      heartbeats,
    }),
    latestCrawlAt: latestCrawl ? crawlRunObservedAt(latestCrawl) : null,
    latestSuccessfulCrawlAt: latestSuccessfulCrawl ? crawlRunObservedAt(latestSuccessfulCrawl) : null,
    latestCrawlStatus: latestCrawl?.status || null,
  };
}

async function readAdminSummary(): Promise<AdminSummary> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const dashboard = await getDashboardData();
    const adminDashboard = toAdminDashboardData(dashboard, dashboard.rawOffers.length);
    const [officialPrices, apiModels, apiTransit, passwordStatus] = await Promise.all([
      getOfficialSubscriptionAdminData(),
      getApiModelAdminData(),
      getApiTransitAdminData({ isAuthenticated: true }),
      getAdminPasswordStatus(),
    ]);
    return {
      ...adminDashboard,
      rawOfferTotal: dashboard.rawOffers.length,
      hiddenRawOfferTotal: 0,
      isAuthenticated: false,
      loadErrors: [],
      crawlRuns: [],
      collectionJobs: [],
      collectorHealth: emptyCollectorHealthSummary(new Date().toISOString()),
      officialPrices,
      apiModels,
      apiTransit,
      pendingSubmissions: [],
      pendingOfferFeedback: [],
      pendingSiteFeedback: [],
      sourceOfferStats: [],
      hiddenRawOffers: [],
      feedbackRawOffers: [],
      riskReviewSettings: getFallbackRiskReviewSettingsSummary(),
      sponsorSettings: getFallbackSponsorSettingsSummary(),
      passwordStatus,
    };
  }

  const loadErrors: AdminSummary["loadErrors"] = [];
  const [
    sourcesResult,
    productsResult,
    visibleOfferData,
    { data, error },
    collectionJobs,
    collectorHeartbeats,
    pendingSubmissions,
    pendingOfferFeedback,
    pendingSiteFeedback,
    sourceOfferStats,
    hiddenOfferData,
    officialPrices,
    apiModels,
    apiTransit,
    riskReviewSettings,
    sponsorSettings,
    passwordStatus,
  ] = await Promise.all([
    supabase.from("sources").select("*").order("name"),
    supabase.from("canonical_products").select("*").eq("is_active", true),
    adminLoad("visible-offers", "可见报价", listAdminVisibleRawOffers(), { rows: [], total: 0 }, loadErrors),
    supabase
      .from("crawl_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(120),
    adminLoad("collection-jobs", "采集任务", listCollectionJobs(), [], loadErrors),
    adminLoad("collector-heartbeats", "采集节点心跳", listCollectorHeartbeats(), [], loadErrors),
    adminLoad("pending-submissions", "待审核渠道", listSubmissions("pending"), [], loadErrors),
    adminLoad("offer-feedback", "报价反馈", listOfferFeedback("pending"), [], loadErrors),
    adminLoad("site-feedback", "站点反馈", listSiteFeedback("pending"), [], loadErrors),
    adminLoad("source-offer-stats", "渠道报价统计", listSourceOfferStats(), [], loadErrors),
    adminLoad("hidden-offers", "手动下架报价", listAdminHiddenRawOffers(), { rows: [], total: 0 }, loadErrors),
    adminLoad("official-prices", "官方地区价", getOfficialSubscriptionAdminData(), {
      configured: isSupabaseConfigured(),
      tableReady: false,
      source: "static" as const,
      generatedAt: new Date().toISOString(),
      message: "读取官方地区价后台数据失败。",
      apps: [],
      plans: [],
      regions: [],
      currentPrices: [],
      collectRuns: [],
      unmatchedItems: [],
    }, loadErrors),
    adminLoad("api-models", "API 模型", getApiModelAdminData(), {
      configured: isSupabaseConfigured(),
      tableReady: false,
      source: "static" as const,
      generatedAt: new Date().toISOString(),
      message: "读取 API 模型后台数据失败。",
      models: [],
      providers: [],
      plans: [],
      offers: [],
      collectRuns: [],
      providerCandidates: [],
      providerSubmissions: [],
    }, loadErrors),
    adminLoad("api-transit", "中转 API", getApiTransitAdminData({ isAuthenticated: true }), getEmptyApiTransitAdminData(true, "读取中转 API 后台数据失败。"), loadErrors),
    adminLoad("risk-review-settings", "风险预审配置", getRiskReviewSettingsSummary(), getFallbackRiskReviewSettingsSummary(), loadErrors),
    adminLoad("sponsor-settings", "赞助位配置", getSponsorSettingsSummary(), getFallbackSponsorSettingsSummary(), loadErrors),
    adminLoad("admin-password", "后台密码状态", getAdminPasswordStatus(), {
      configured: false,
      tableReady: false,
      source: "unconfigured" as const,
      minLength: 12,
      updatedAt: null,
      message: "读取后台密码状态失败。",
    }, loadErrors),
  ]);

  if (sourcesResult.error) recordAdminLoadError(loadErrors, "sources", "渠道源", sourcesResult.error);
  if (productsResult.error) recordAdminLoadError(loadErrors, "canonical-products", "标准商品", productsResult.error);
  if (error) recordAdminLoadError(loadErrors, "crawl-runs", "采集日志", error);

  const sources = sourcesResult.error ? [] : (sourcesResult.data || []).map(mapSource);
  const feedbackRawOffers = await listRawOffersByIds(
    pendingOfferFeedback
      .map((item) => item.offerId)
      .filter((id): id is string => Boolean(id)),
  ).catch((error) => {
    recordAdminLoadError(loadErrors, "feedback-offers", "反馈关联报价", error);
    return [];
  });
  const canonicalProducts = productsResult.error
    ? canonicalCatalog
    : (productsResult.data || []).map(mapCanonicalProduct);
  const products = (canonicalProducts.length ? canonicalProducts : canonicalCatalog)
    .map(makeEmptyProductGroup);
  const crawlRuns = error ? [] : (data || []).map(mapCrawlRun);
  const generatedAt = new Date().toISOString();
  const collectorHealth = buildCollectorHealthSummary({
    generatedAt,
    sources,
    crawlRuns,
    heartbeats: collectorHeartbeats,
  });
  const baseDashboard: DashboardData = {
    generatedAt,
    configured: isSupabaseConfigured(),
    products,
    sources,
    rawOffers: visibleOfferData.rows,
  };

  if (error) {
    return {
      ...baseDashboard,
      rawOfferTotal: visibleOfferData.total,
      hiddenRawOfferTotal: hiddenOfferData.total,
      isAuthenticated: false,
      loadErrors,
      crawlRuns: [],
      collectionJobs,
      collectorHealth,
      officialPrices,
      apiModels,
      apiTransit,
      pendingSubmissions,
      pendingOfferFeedback,
      pendingSiteFeedback,
      sourceOfferStats,
      hiddenRawOffers: hiddenOfferData.rows,
      feedbackRawOffers,
      riskReviewSettings,
      sponsorSettings,
      passwordStatus,
    };
  }

  return {
    ...baseDashboard,
    rawOfferTotal: visibleOfferData.total,
    hiddenRawOfferTotal: hiddenOfferData.total,
    isAuthenticated: false,
    loadErrors,
    crawlRuns,
    collectionJobs,
    collectorHealth,
    officialPrices,
    apiModels,
    apiTransit,
    pendingSubmissions,
    pendingOfferFeedback,
    pendingSiteFeedback,
    sourceOfferStats,
    hiddenRawOffers: hiddenOfferData.rows,
    feedbackRawOffers,
    riskReviewSettings,
    sponsorSettings,
    passwordStatus,
  };
}

function toAdminDashboardData(dashboard: DashboardData, rawOfferTotal: number): DashboardData {
  return {
    ...dashboard,
    products: dashboard.products.map(stripProductOffersForAdmin),
    rawOffers: dashboard.rawOffers.slice(0, Math.min(rawOfferTotal, ADMIN_OFFER_SAMPLE_LIMIT)),
  };
}

function filterPublicDashboardData(dashboard: DashboardData): DashboardData {
  const products = dashboard.products.filter((product) => isPublicCatalogProduct(product));
  const productIds = new Set(products.map((product) => product.id));
  return {
    ...dashboard,
    products,
    rawOffers: dashboard.rawOffers.filter((offer) => {
      const productId = offer.canonicalProductId || resolveOfferProduct(offer, products).id;
      return productIds.has(productId);
    }),
  };
}

function toAdminOfferSearchPattern(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  return `%${normalized.replace(/[%,()]/g, " ").replace(/\s+/g, "%")}%`;
}

async function adminLoad<T>(
  key: string,
  label: string,
  promise: Promise<T>,
  fallback: T,
  loadErrors: AdminSummary["loadErrors"],
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    recordAdminLoadError(loadErrors, key, label, error);
    return fallback;
  }
}

function recordAdminLoadError(
  loadErrors: AdminSummary["loadErrors"],
  key: string,
  label: string,
  error: unknown,
): void {
  console.error(`Admin summary module failed: ${key}`, error);
  if (loadErrors.some((item) => item.key === key)) return;
  loadErrors.push({
    key,
    label,
    message: errorMessage(error),
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record.message || record.details || record.hint || record.code;
    if (typeof message === "string" && message.trim()) return message;
    try {
      return JSON.stringify(record);
    } catch {
      return String(error);
    }
  }
  return String(error || "未知错误");
}

function publicSupabaseReadSignal(): AbortSignal {
  return AbortSignal.timeout(publicSupabaseReadTimeoutMs());
}

function publicSupabaseReadTimeoutMs(): number {
  return process.env.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE
    ? PUBLIC_SUPABASE_BUILD_READ_TIMEOUT_MS
    : PUBLIC_SUPABASE_READ_TIMEOUT_MS;
}

function preferStalePublicOfferData(staleValue: PublicOfferData | null, value: PublicOfferData): PublicOfferData {
  if (!value.degraded || !staleValue?.offers.length) return value;

  return {
    ...staleValue,
    degraded: true,
    message: STALE_PUBLIC_DATA_MESSAGE,
  };
}

function preferStaleExplorerData(staleValue: ExplorerData | null, value: ExplorerData): ExplorerData {
  if (!value.degraded || !staleValue?.products.length || !staleValue.offerTotal) return value;

  return {
    ...staleValue,
    degraded: true,
    message: STALE_PUBLIC_DATA_MESSAGE,
  };
}

function preferStaleProductOffers<T extends {
  offers: RawOffer[];
  total: number;
  degraded?: boolean;
  message?: string | null;
}>(staleValue: T | null, value: T): T {
  if (!value.degraded || value.offers.length || !staleValue?.offers.length) return value;

  return {
    ...staleValue,
    degraded: true,
    message: STALE_PUBLIC_DATA_MESSAGE,
  };
}

function preferStalePublicOffers(staleValue: PublicOffersResult | null, value: PublicOffersResult): PublicOffersResult {
  if (!value.degraded || value.rows.length || !staleValue?.rows.length) return value;

  return {
    ...staleValue,
    degraded: true,
    message: STALE_PUBLIC_DATA_MESSAGE,
  };
}

function preferStalePublicMerchants(staleValue: PublicMerchantsResult | null, value: PublicMerchantsResult): PublicMerchantsResult {
  if (!value.degraded || value.rows.length || !staleValue?.rows.length) return value;

  return {
    ...staleValue,
    degraded: true,
    message: STALE_PUBLIC_DATA_MESSAGE,
  };
}

function hydrateGeneratedAt<T extends { generatedAt: string }>(snapshot: PublicApiSnapshotPayload<T>): T {
  return {
    ...snapshot.value,
    generatedAt: snapshot.generatedAt || snapshot.value.generatedAt,
  };
}

function isPublicApiSnapshotFresh<T extends { generatedAt: string }>(snapshot: PublicApiSnapshotPayload<T>): boolean {
  return isGeneratedAtFresh(snapshot.generatedAt || snapshot.value.generatedAt);
}

function isReusableGeneratedValue(value: { degraded?: boolean; generatedAt?: string | null }): boolean {
  return value.degraded !== true && isGeneratedAtFresh(value.generatedAt);
}

function isGeneratedAtFresh(value: string | null | undefined): boolean {
  const generatedAt = timestampMs(value);
  return generatedAt > 0 && Date.now() - generatedAt <= PUBLIC_API_SNAPSHOT_MAX_STALE_MS;
}

function isExplorerDataSnapshot(value: unknown): value is ExplorerData {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ExplorerData>;
  return typeof record.generatedAt === "string" &&
    typeof record.configured === "boolean" &&
    Array.isArray(record.products) &&
    Array.isArray(record.sources) &&
    typeof record.offerTotal === "number";
}

function isProductOffersSnapshot(value: unknown): value is PublicProductOffersResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PublicProductOffersResult>;
  return typeof record.generatedAt === "string" &&
    Array.isArray(record.offers) &&
    typeof record.total === "number" &&
    Array.isArray(record.filterFacets) &&
    Array.isArray(record.activeFilterTags);
}

function isPublicOffersSnapshot(value: unknown): value is PublicOffersResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PublicOffersResult>;
  return typeof record.generatedAt === "string" &&
    Array.isArray(record.rows) &&
    typeof record.total === "number";
}

function isPublicMerchantsSnapshot(value: unknown): value is PublicMerchantsResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PublicMerchantsResult>;
  return typeof record.generatedAt === "string" &&
    Array.isArray(record.rows) &&
    typeof record.total === "number";
}

function publicOfferListSnapshotKeyForRequest(filters: OfferListFilters): string | null {
  if (
    filters.limit !== PUBLIC_OFFERS_SNAPSHOT_LIMIT ||
    filters.offset !== PUBLIC_OFFERS_SNAPSHOT_OFFSET ||
    filters.query ||
    filters.minPrice != null ||
    filters.maxPrice != null
  ) {
    return null;
  }

  const platform = normalizePublicSnapshotPlatform(filters.platform);
  const productType = normalizePublicSnapshotProductType(filters.productType);
  const stock = normalizePublicSnapshotStock(filters.stock);
  const sort = normalizePublicSnapshotSort(filters.sort);

  if (!platform && !productType && !stock && !sort) return PUBLIC_OFFERS_SNAPSHOT_KEY;
  if (!isAllowedOfferListSnapshotView({ platform, productType, stock, sort })) return null;

  return publicListViewSnapshotKey("offers", {
    platform,
    productType,
    stock,
    sort,
    limit: PUBLIC_OFFERS_SNAPSHOT_LIMIT,
  });
}

function publicMerchantListSnapshotKeyForRequest(filters: MerchantListFilters): string | null {
  if (
    normalizePublicOfferLimit(filters.limit) !== PUBLIC_OFFERS_SNAPSHOT_LIMIT ||
    normalizePublicOfferOffset(filters.offset) !== PUBLIC_OFFERS_SNAPSHOT_OFFSET ||
    filters.query ||
    filters.productType ||
    filters.minPrice != null ||
    filters.maxPrice != null ||
    filters.sort
  ) {
    return null;
  }

  const platform = normalizePublicSnapshotPlatform(filters.platform);
  const stock = normalizePublicSnapshotMerchantStock(filters.stock);
  const collector = normalizePublicSnapshotMerchantCollector(filters.collector);
  const signal = normalizePublicSnapshotMerchantSignal(filters.signal);

  if (!isAllowedMerchantListSnapshotView({ platform, stock, collector, signal })) return null;

  return publicListViewSnapshotKey("merchants", {
    platform,
    stock,
    collector,
    signal,
    limit: PUBLIC_OFFERS_SNAPSHOT_LIMIT,
  });
}

function publicProductOffersSnapshotKeyForRequest(
  id: string,
  filters: {
    limit: number;
    offset: number;
    filterTags: OfferFilterTagId[];
    query: string;
    excludeQuery: string;
    collector: MerchantCollectorFilter;
    minPrice: number | null;
    maxPrice: number | null;
  },
): string | null {
  if (
    filters.limit !== PUBLIC_PRODUCT_OFFERS_SNAPSHOT_LIMIT ||
    filters.offset !== PUBLIC_PRODUCT_OFFERS_SNAPSHOT_OFFSET ||
    filters.query ||
    filters.excludeQuery ||
    filters.collector !== "all" ||
    filters.minPrice !== null ||
    filters.maxPrice !== null
  ) {
    return null;
  }

  if (filters.filterTags.length === 0) return publicProductOffersSnapshotKey(id);
  if (
    filters.filterTags.length === 1 &&
    PUBLIC_PRODUCT_OFFERS_SNAPSHOT_TAGS.includes(filters.filterTags[0])
  ) {
    return publicProductOffersSnapshotKey(id, filters.filterTags);
  }

  return null;
}

function isPublicProductKeyVisible(id: string | null | undefined): boolean {
  const productKey = String(id || "").trim();
  if (!productKey) return true;

  const catalogProduct = canonicalCatalog.find((product) => product.id === productKey || product.slug === productKey);
  if (catalogProduct) return isPublicCatalogProduct(catalogProduct);

  return productKey !== API_CDK_PRODUCT_ID || apiCdkPublicVisible();
}

function isPublicOfferPageRowProductVisible(row: PublicOfferPageRow): boolean {
  return isPublicCatalogProduct({
    id: row.product_id || row.canonical_product_id ? String(row.product_id || row.canonical_product_id) : null,
    platform: row.product_platform ? String(row.product_platform) : null,
  });
}

function sanitizeExplorerDataForPublicCatalog(value: ExplorerData): ExplorerData {
  const products = value.products.filter((product) => isPublicCatalogProduct(product));
  if (products.length === value.products.length) return value;

  return {
    ...value,
    products,
    offerTotal: products.reduce((sum, product) => sum + product.offerCount, 0),
  };
}

function sanitizePublicOffersResultForPublicCatalog(value: PublicOffersResult): PublicOffersResult {
  const rows = value.rows.filter((row) => isPublicCatalogProduct(row.product));
  if (rows.length === value.rows.length) return value;

  return {
    ...value,
    rows,
    total: rows.length,
    limited: false,
  };
}

function isAllowedOfferListSnapshotView({
  platform,
  productType,
  stock,
  sort,
}: {
  platform: string | null;
  productType: string | null;
  stock: string | null;
  sort: string | null;
}): boolean {
  if (productType) {
    return Boolean(
      platform &&
      !stock &&
      !sort &&
      PUBLIC_HOT_OFFER_PRODUCT_TYPES_BY_PLATFORM[platform]?.includes(productType),
    );
  }

  if (stock && sort) return false;
  if (stock && !PUBLIC_LIST_SNAPSHOT_STOCKS.includes(stock as typeof PUBLIC_LIST_SNAPSHOT_STOCKS[number])) return false;
  if (sort && !PUBLIC_LIST_SNAPSHOT_SORTS.includes(sort as typeof PUBLIC_LIST_SNAPSHOT_SORTS[number])) return false;

  return Boolean(platform || stock || sort);
}

function isAllowedMerchantListSnapshotView({
  platform,
  stock,
  collector,
  signal,
}: {
  platform: string | null;
  stock: string | null;
  collector: string | null;
  signal: string | null;
}): boolean {
  if (collector && signal) return false;
  if (stock && (collector || signal)) return false;
  return Boolean(platform || stock || collector || signal);
}

function normalizePublicSnapshotPlatform(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  if (!normalized || normalized === "全部") return null;
  return publicSnapshotPlatforms().includes(normalized) ? normalized : null;
}

function normalizePublicSnapshotProductType(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  return normalized && normalized !== "全部" ? normalized : null;
}

function normalizePublicSnapshotStock(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  if (!normalized || normalized === "all") return null;
  return PUBLIC_LIST_SNAPSHOT_STOCKS.includes(normalized as typeof PUBLIC_LIST_SNAPSHOT_STOCKS[number])
    ? normalized
    : null;
}

function normalizePublicSnapshotMerchantStock(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  if (!normalized || normalized === "all") return null;
  return normalized === "available" ? normalized : null;
}

function normalizePublicSnapshotSort(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  if (!normalized || normalized === "available_price") return null;
  return PUBLIC_LIST_SNAPSHOT_SORTS.includes(normalized as typeof PUBLIC_LIST_SNAPSHOT_SORTS[number])
    ? normalized
    : null;
}

function normalizePublicSnapshotMerchantCollector(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  if (!normalized || normalized === "all") return null;
  return PUBLIC_MERCHANT_SNAPSHOT_COLLECTORS.includes(normalized as typeof PUBLIC_MERCHANT_SNAPSHOT_COLLECTORS[number])
    ? normalized
    : null;
}

function normalizePublicSnapshotMerchantSignal(value: string | null | undefined): string | null {
  const normalized = normalizePublicSnapshotText(value);
  if (!normalized || normalized === "all") return null;
  return PUBLIC_MERCHANT_SNAPSHOT_SIGNALS.includes(normalized as typeof PUBLIC_MERCHANT_SNAPSHOT_SIGNALS[number])
    ? normalized
    : null;
}

function normalizePublicSnapshotText(value: string | null | undefined): string {
  return String(value || "").trim();
}

function publicSnapshotPlatforms(): string[] {
  return allPlatformOptions.filter((platform) => platform !== API_CDK_PLATFORM || apiCdkPublicVisible());
}

function publicListViewSnapshotKey(
  scope: "offers" | "merchants",
  filters: {
    platform?: string | null;
    productType?: string | null;
    stock?: string | null;
    sort?: string | null;
    collector?: string | null;
    signal?: string | null;
    limit: number;
  },
): string {
  const parts = [`scope:${scope}`, `limit:${filters.limit}`];
  for (const key of ["platform", "productType", "stock", "sort", "collector", "signal"] as const) {
    const value = filters[key];
    if (value) parts.push(`${key}:${encodePublicSnapshotKeyPart(value)}`);
  }
  return `view:v1:${parts.join("|")}`;
}

function encodePublicSnapshotKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function isDefaultOfferListSnapshotKey(key: string | null): boolean {
  return key === PUBLIC_OFFERS_SNAPSHOT_KEY;
}

function publicProductOffersSnapshotKey(id: string, filterTags: OfferFilterTagId[] = []): string {
  if (filterTags.length === 1) {
    return `${PUBLIC_PRODUCT_OFFERS_SNAPSHOT_VERSION}:tag:${filterTags[0]}:${id}:limit:${PUBLIC_PRODUCT_OFFERS_SNAPSHOT_LIMIT}`;
  }
  return `${PUBLIC_PRODUCT_OFFERS_SNAPSHOT_VERSION}:default:${id}:limit:${PUBLIC_PRODUCT_OFFERS_SNAPSHOT_LIMIT}`;
}

function filterAdminOfferMaintenanceRows(offers: RawOffer[], query: string): RawOffer[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return offers;

  return offers.filter((offer) =>
    [
      offer.sourceTitle,
      offer.sourceName,
      offer.sourceStoreName || "",
      offer.url,
      offer.failureReason || "",
      offer.sourceId || "",
      offer.storedCanonicalProductId || "",
      offer.canonicalProductId || "",
      offer.storedCategorySlug || "",
      offer.categorySlug || "",
      offer.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function stripProductOffersForAdmin(product: ProductGroup): ProductGroup {
  return {
    ...product,
    offers: [],
    lowestOffer: null,
    warrantyLowestOffer: null,
  };
}

function makeEmptyProductGroup(product: CanonicalProduct): ProductGroup {
  return {
    ...product,
    offers: [],
    offerCount: 0,
    inStockCount: 0,
    outOfStockCount: 0,
    lowestPrice: null,
    lowestPriceLabel: "暂无价格",
    lowestPriceTone: "muted",
    lowestOffer: null,
    warrantyLowestPrice: null,
    warrantyLowestOffer: null,
    warrantyOfferCount: 0,
    latestSeenAt: null,
    anomalyFlags: [],
  };
}

async function listCollectionJobs(): Promise<CollectionJob[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("collection_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data || []).map(mapCollectionJob);
}

async function listCollectorHeartbeats(): Promise<CollectorHeartbeat[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("collector_heartbeats")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []).map(mapCollectorHeartbeat);
}

function buildCollectorHealthSummary(input: {
  generatedAt: string;
  sources: Source[];
  crawlRuns: CrawlRun[];
  heartbeats: CollectorHeartbeat[];
}): CollectorHealthSummary {
  const generatedMs = new Date(input.generatedAt).getTime();
  const enabledSources = input.sources.filter((source) => source.enabled);
  const healthSources = input.sources
    .map((source) => sourceHealthFor(source, generatedMs))
    .sort(compareHealthSources);
  const enabledHealthSources = healthSources.filter((source) => source.enabled);
  const kindSummaries = buildCollectorKindSummaries(enabledHealthSources, generatedMs);
  const recentRuns = input.crawlRuns.map((run) => runSummaryFor(run, generatedMs));
  const recentFailures = recentRuns
    .filter((run) => run.status === "failed" || run.failureCount > 0)
    .slice(0, 20);
  const nodeSummaries = buildCollectorNodeSummaries(input.heartbeats, recentRuns, generatedMs);
  const latestSuccessAt = latestIso(enabledHealthSources.map((source) => source.lastSuccessAt || null));
  const latestAgeMinutes = latestSuccessAt ? minutesSince(latestSuccessAt, generatedMs) : null;
  const freshSources = enabledHealthSources.filter((source) => source.status === "fresh").length;
  const agingSources = enabledHealthSources.filter((source) => source.status === "aging").length;
  const staleSources = enabledHealthSources.filter((source) => source.status === "stale").length;
  const criticalSources = enabledHealthSources.filter((source) => source.status === "critical" || source.status === "never").length;
  const failedSources = enabledHealthSources.filter((source) => Number(source.consecutiveFailures || 0) > 0 || source.lastError).length;
  const writebackFailures = nodeSummaries.filter((node) => node.failureKind === "writeback").length;
  const taskFetchFailures = nodeSummaries.filter((node) => node.failureKind === "task_fetch").length;
  const nodeFailures = nodeSummaries.filter((node) => node.failureKind === "node").length;
  const recentlyCheckedSources = enabledHealthSources.filter((source) => !source.isAttemptStale).length;
  const staleCheckSources = enabledHealthSources.filter((source) => source.isAttemptStale).length;
  const downNodes = nodeSummaries.filter((node) => node.health === "down").length;
  const staleNodes = nodeSummaries.filter((node) => node.health === "stale").length;
  const onlineNodes = nodeSummaries.filter((node) => node.health === "online" || node.health === "quiet").length;
  const overallStatus =
    failedSources > 0 || downNodes > 0
      ? "critical"
      : criticalSources > 0 || staleSources > 0 || staleNodes > 0 || agingSources > 0
        ? "warning"
        : "healthy";

  return {
    generatedAt: input.generatedAt,
    overall: {
      status: overallStatus,
      tone: overallStatus === "healthy" ? "success" : overallStatus === "warning" ? "warn" : "danger",
      label: overallStatus === "healthy" ? "采集正常" : overallStatus === "warning" ? "部分渠道待刷新" : "存在采集异常",
      totalSources: input.sources.length,
      enabledSources: enabledSources.length,
      freshSources,
      agingSources,
      staleSources,
      criticalSources,
      failedSources,
      writebackFailures,
      taskFetchFailures,
      nodeFailures,
      recentlyCheckedSources,
      staleCheckSources,
      latestSuccessAt,
      latestAgeMinutes,
      onlineNodes,
      staleNodes,
      downNodes,
    },
    kindSummaries,
    nodeSummaries,
    sources: healthSources,
    staleSources: enabledHealthSources
      .filter((source) => source.status !== "fresh")
      .slice(0, 80),
    recentFailures,
    recentRuns: recentRuns.slice(0, 30),
    heartbeats: input.heartbeats,
  };
}

function emptyCollectorHealthSummary(generatedAt: string): CollectorHealthSummary {
  return {
    generatedAt,
    overall: {
      status: "warning",
      tone: "warn",
      label: "暂无采集健康数据",
      totalSources: 0,
      enabledSources: 0,
      freshSources: 0,
      agingSources: 0,
      staleSources: 0,
      criticalSources: 0,
      failedSources: 0,
      writebackFailures: 0,
      taskFetchFailures: 0,
      nodeFailures: 0,
      recentlyCheckedSources: 0,
      staleCheckSources: 0,
      latestSuccessAt: null,
      latestAgeMinutes: null,
      onlineNodes: 0,
      staleNodes: 0,
      downNodes: 0,
    },
    kindSummaries: [],
    nodeSummaries: [],
    sources: [],
    staleSources: [],
    recentFailures: [],
    recentRuns: [],
    heartbeats: [],
  };
}

function sourceHealthFor(source: Source, nowMs: number): CollectorHealthSource {
  const ageMinutes = source.lastSuccessAt ? minutesSince(source.lastSuccessAt, nowMs) : null;
  const checkAgeMinutes = source.lastCheckedAt ? minutesSince(source.lastCheckedAt, nowMs) : null;
  const status: CollectorHealthSource["status"] = !source.enabled
    ? "disabled"
    : ageMinutes === null
      ? "never"
      : ageMinutes <= 45
        ? "fresh"
        : ageMinutes <= 90
          ? "aging"
          : ageMinutes <= 180
            ? "stale"
            : "critical";
  return {
    id: source.id,
    name: source.name,
    host: sourceHost(source),
    collectorKind: source.collectorKind || source.collectionMethod || "unknown",
    enabled: source.enabled,
    status,
    tone: healthSourceTone(status),
    ageMinutes,
    lastSuccessAt: source.lastSuccessAt || null,
    lastCheckedAt: source.lastCheckedAt || null,
    consecutiveFailures: source.consecutiveFailures ?? null,
    lastError: source.lastError || null,
    checkAgeMinutes,
    isAttemptStale: source.enabled && (checkAgeMinutes === null || checkAgeMinutes > 90),
  };
}

function buildCollectorKindSummaries(
  sources: CollectorHealthSource[],
  nowMs: number,
): CollectorHealthKindSummary[] {
  const map = new Map<string, CollectorHealthKindSummary>();
  for (const source of sources) {
    const kind = source.collectorKind || "unknown";
    const current = map.get(kind) || {
      kind,
      label: kind,
      total: 0,
      fresh: 0,
      aging: 0,
      stale: 0,
      critical: 0,
      never: 0,
      failed: 0,
      recentAttempts: 0,
      staleAttempts: 0,
      latestSuccessAt: null,
      latestAgeMinutes: null,
    };
    current.total++;
    if (source.status === "fresh") current.fresh++;
    if (source.status === "aging") current.aging++;
    if (source.status === "stale") current.stale++;
    if (source.status === "critical") current.critical++;
    if (source.status === "never") current.never++;
    if (source.lastError || Number(source.consecutiveFailures || 0) > 0) current.failed++;
    if (source.isAttemptStale) current.staleAttempts++;
    else current.recentAttempts++;
    if (source.lastSuccessAt && (!current.latestSuccessAt || source.lastSuccessAt > current.latestSuccessAt)) {
      current.latestSuccessAt = source.lastSuccessAt;
      current.latestAgeMinutes = minutesSince(source.lastSuccessAt, nowMs);
    }
    map.set(kind, current);
  }

  return Array.from(map.values()).sort((a, b) => {
    const leftRisk = a.critical + a.never + a.stale;
    const rightRisk = b.critical + b.never + b.stale;
    if (leftRisk !== rightRisk) return rightRisk - leftRisk;
    return b.total - a.total;
  });
}

function buildCollectorNodeSummaries(
  heartbeats: CollectorHeartbeat[],
  recentRuns: CollectorHealthRunSummary[],
  nowMs: number,
): CollectorHealthNodeSummary[] {
  const map = new Map<string, CollectorHealthNodeSummary>();

  for (const heartbeat of heartbeats) {
    if (!isPrimaryCollectorNode(heartbeat.node.id)) continue;
    const ageMinutes = minutesSince(heartbeat.lastSeenAt, nowMs);
    const health = nodeHealthFor(ageMinutes, heartbeat.status);
    map.set(heartbeat.node.id, {
      node: heartbeat.node,
      scope: heartbeat.scope || null,
      status: heartbeat.status,
      health,
      tone: nodeHealthTone(health, heartbeat.status),
      lastSeenAt: heartbeat.lastSeenAt,
      lastRunAt: heartbeat.finishedAt || heartbeat.startedAt || heartbeat.lastSeenAt,
      ageMinutes,
      successCount: heartbeat.successCount,
      failureCount: heartbeat.failureCount,
      skippedCount: heartbeat.skippedCount,
      offerCount: heartbeat.offerCount,
      message: heartbeat.message || null,
      failureKind: collectorFailureKind(heartbeat.message, heartbeat.details),
    });
  }

  for (const run of recentRuns) {
    if (map.has(run.node.id)) continue;
    if (!isPrimaryCollectorNode(run.node.id)) continue;
    const ageMinutes = run.finishedAt ? minutesSince(run.finishedAt, nowMs) : null;
    const health = nodeHealthFor(ageMinutes, run.status === "failed" ? "failed" : "unknown");
    map.set(run.node.id, {
      node: run.node,
      scope: run.collector || null,
      status: run.status === "failed" ? "failed" : "unknown",
      health,
      tone: nodeHealthTone(health, run.status === "failed" ? "failed" : "unknown"),
      lastSeenAt: run.finishedAt || null,
      lastRunAt: run.finishedAt || null,
      ageMinutes,
      successCount: run.successCount,
      failureCount: run.failureCount,
      skippedCount: 0,
      offerCount: run.successCount,
      message: run.message || null,
      failureKind: collectorFailureKind(run.message, null),
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const riskOrder = { down: 4, stale: 3, quiet: 2, unknown: 1, online: 0 };
    const riskDiff = riskOrder[b.health] - riskOrder[a.health];
    if (riskDiff) return riskDiff;
    return (b.ageMinutes ?? 999999) - (a.ageMinutes ?? 999999);
  });
}

function collectorFailureKind(
  message: string | null | undefined,
  details: Record<string, unknown> | null | undefined,
): CollectorHealthNodeSummary["failureKind"] {
  const text = `${message || ""} ${stringFromRecord(details, "phase") || ""}`.toLowerCase();
  if (!text.trim()) return "unknown";
  if (
    text.includes("记录采集结果失败") ||
    text.includes("crawl-log") ||
    text.includes("upload failed") ||
    text.includes("final-flush")
  ) {
    return "writeback";
  }
  if (text.includes("task request failed") || text.includes("etimedout") || text.includes("fetch failed")) {
    return "task_fetch";
  }
  if (text.includes("edge collector found no offers") || text.includes("http 403") || text.includes("http 500") || text.includes("风控")) {
    return "source";
  }
  return "node";
}

function isPrimaryCollectorNode(nodeId: string): boolean {
  return PRIMARY_COLLECTOR_NODE_IDS.has(nodeId);
}

function runSummaryFor(run: CrawlRun, nowMs: number): CollectorHealthRunSummary {
  const node = collectorNodeFromRunDetails(run.details);
  const finishedAt = run.finishedAt || run.startedAt;
  return {
    id: run.id,
    sourceId: run.sourceId || null,
    sourceName: run.sourceName || null,
    status: run.status,
    collector: stringFromRecord(run.details, "collector"),
    node,
    finishedAt,
    ageMinutes: finishedAt ? minutesSince(finishedAt, nowMs) : null,
    successCount: run.successCount,
    failureCount: run.failureCount,
    message: run.message || null,
  };
}

function crawlRunObservedAt(run: CrawlRun): string {
  return run.finishedAt || run.startedAt;
}

function latestRunByTime(runs: CrawlRun[]): CrawlRun | null {
  return runs.reduce<CrawlRun | null>((latest, run) => {
    if (!latest) return run;
    return crawlRunObservedAt(run) > crawlRunObservedAt(latest) ? run : latest;
  }, null);
}

function mapCollectorHeartbeat(row: Record<string, unknown>): CollectorHeartbeat {
  return {
    node: {
      id: String(row.node_id || "unknown-node"),
      name: String(row.node_name || row.node_id || "未知节点"),
      type: row.node_type ? String(row.node_type) : null,
      runtime: row.runtime ? String(row.runtime) : null,
      region: row.region ? String(row.region) : null,
    },
    scope: row.scope ? String(row.scope) : null,
    status: String(row.status || "unknown") as CollectorHeartbeat["status"],
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    lastSeenAt: String(row.last_seen_at || row.updated_at || new Date().toISOString()),
    successCount: Number(row.success_count || 0),
    failureCount: Number(row.failure_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    offerCount: Number(row.offer_count || 0),
    message: row.message ? String(row.message) : null,
    details:
      row.details && typeof row.details === "object"
        ? (row.details as Record<string, unknown>)
        : null,
  };
}

function collectorNodeFromRunDetails(details: Record<string, unknown> | null | undefined): CollectorNodeInfo {
  const rawNode = details?.collectorNode;
  if (rawNode && typeof rawNode === "object") {
    const node = rawNode as Record<string, unknown>;
    const id = node.id ? String(node.id) : "unknown-node";
    return {
      id,
      name: node.name ? String(node.name) : id,
      type: node.type ? String(node.type) : null,
      runtime: node.runtime ? String(node.runtime) : null,
      region: node.region ? String(node.region) : null,
    };
  }
  return {
    id: "legacy-collector",
    name: "历史采集记录",
    type: "unknown",
    runtime: "legacy",
    region: null,
  };
}

function sourceHost(source: Source): string {
  const raw = source.baseUrl || source.entryUrl || "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

function minutesSince(value: string, nowMs: number): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 999999;
  return Math.max(0, Math.round((nowMs - timestamp) / 60_000));
}

function latestIso(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) || null;
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) || null;
}

function compareHealthSources(left: CollectorHealthSource, right: CollectorHealthSource): number {
  const statusOrder: Record<CollectorHealthSource["status"], number> = {
    never: 5,
    critical: 4,
    stale: 3,
    aging: 2,
    fresh: 1,
    disabled: 0,
  };
  const statusDiff = statusOrder[right.status] - statusOrder[left.status];
  if (statusDiff) return statusDiff;
  return (right.ageMinutes ?? 999999) - (left.ageMinutes ?? 999999);
}

function healthSourceTone(status: CollectorHealthSource["status"]): CollectorHealthSource["tone"] {
  if (status === "fresh") return "success";
  if (status === "aging") return "info";
  if (status === "stale") return "warn";
  if (status === "critical" || status === "never") return "danger";
  return "muted";
}

function nodeHealthFor(
  ageMinutes: number | null,
  status: CollectorHeartbeat["status"],
): CollectorHealthNodeSummary["health"] {
  if (ageMinutes === null) return "unknown";
  if (status === "running" && ageMinutes <= 90) return "online";
  if (ageMinutes <= 45) return status === "failed" ? "quiet" : "online";
  if (ageMinutes <= 90) return "stale";
  return "down";
}

function nodeHealthTone(
  health: CollectorHealthNodeSummary["health"],
  status: CollectorHeartbeat["status"],
): CollectorHealthNodeSummary["tone"] {
  if (health === "online" && status !== "failed") return "success";
  if (health === "quiet") return "warn";
  if (health === "stale") return "warn";
  if (health === "down") return "danger";
  return "muted";
}

function stringFromRecord(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value ? value : null;
}

async function listSourceOfferStats(): Promise<SourceOfferStats[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: rpcData, error: rpcError } = await supabase.rpc("list_source_offer_stats");
  let fallbackReason = rpcError?.message || "";
  if (!rpcError) {
    const rows = (rpcData || []) as Array<Record<string, unknown>>;
    if (rows.length === 0 || rows.every((row) => Object.prototype.hasOwnProperty.call(row, "collector_failure_count"))) {
      return rows.map((row) => ({
        sourceId: String(row.source_id || ""),
        visibleCount: Number(row.visible_count || 0),
        hiddenCount: Number(row.hidden_count || 0),
        manuallyHiddenCount: Number(row.manually_hidden_count || 0),
        collectorFailureCount: Number(row.collector_failure_count || 0),
        totalCount: Number(row.total_count || 0),
      })).filter((row) => row.sourceId);
    }
    fallbackReason = "RPC response is missing collector_failure_count";
  }
  console.warn("Falling back to raw source offer stats:", fallbackReason);

  const rows: Array<Pick<RawOffer, "sourceId" | "hidden" | "failureReason" | "lastFailedAt">> = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("raw_offers")
      .select("source_id,hidden,failure_reason,last_failed_at")
      .range(from, to);

    if (error) throw error;

    rows.push(
      ...(data || []).map((row) => ({
        sourceId: row.source_id ? String(row.source_id) : null,
        hidden: Boolean(row.hidden),
        failureReason: row.failure_reason ? String(row.failure_reason) : null,
        lastFailedAt: row.last_failed_at ? String(row.last_failed_at) : null,
      })),
    );
    if (!data || data.length < SUPABASE_PAGE_SIZE) break;
  }

  const map = new Map<string, SourceOfferStats>();
  for (const row of rows) {
    if (!row.sourceId) continue;
    const current = map.get(row.sourceId) || {
      sourceId: row.sourceId,
      visibleCount: 0,
      hiddenCount: 0,
      manuallyHiddenCount: 0,
      collectorFailureCount: 0,
      totalCount: 0,
    };

    current.totalCount++;
    if (row.hidden) {
      current.hiddenCount++;
      if (row.failureReason?.startsWith(ADMIN_MANUAL_HIDE_REASON_PREFIX)) {
        current.manuallyHiddenCount++;
      }
    } else {
      current.visibleCount++;
    }
    if (row.lastFailedAt && !row.failureReason?.startsWith(ADMIN_MANUAL_HIDE_REASON_PREFIX)) {
      current.collectorFailureCount++;
    }

    map.set(row.sourceId, current);
  }

  return Array.from(map.values());
}

async function listAdminVisibleRawOffers(): Promise<{ rows: RawOffer[]; total: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { rows: [], total: 0 };

  const [rowsResult, countResult] = await Promise.all([
    supabase
      .from("raw_offers")
      .select(RAW_OFFER_ADMIN_SELECT)
      .eq("hidden", false)
      .order("captured_at", { ascending: false })
      .limit(ADMIN_OFFER_SAMPLE_LIMIT),
    supabase
      .from("raw_offers")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false),
  ]);

  if (rowsResult.error) throw rowsResult.error;
  if (countResult.error) throw countResult.error;

  return {
    rows: ((rowsResult.data || []) as unknown as Record<string, unknown>[]).map(mapRawOffer),
    total: countResult.count || rowsResult.data?.length || 0,
  };
}

export async function listRawOffersByIds(ids: string[]): Promise<RawOffer[]> {
  const supabase = getSupabaseServerClient();
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (!supabase || !uniqueIds.length) return [];

  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const chunk = uniqueIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from("raw_offers")
      .select(RAW_OFFER_ADMIN_SELECT)
      .in("id", chunk);
    if (error) throw error;
    rows.push(...((data || []) as unknown as Record<string, unknown>[]));
  }

  return rows.map(mapRawOffer);
}

async function listAdminHiddenRawOffers(): Promise<{ rows: RawOffer[]; total: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { rows: [], total: 0 };

  const [rowsResult, countResult] = await Promise.all([
    supabase
      .from("raw_offers")
      .select(RAW_OFFER_ADMIN_SELECT)
      .eq("hidden", true)
      .ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .limit(ADMIN_OFFER_SAMPLE_LIMIT),
    supabase
      .from("raw_offers")
      .select("id", { count: "exact", head: true })
      .eq("hidden", true)
      .ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`),
  ]);

  if (rowsResult.error) throw rowsResult.error;
  if (countResult.error) throw countResult.error;

  return {
    rows: ((rowsResult.data || []) as unknown as Record<string, unknown>[]).map(mapRawOffer),
    total: countResult.count || rowsResult.data?.length || 0,
  };
}

export async function getProductGroup(id: string) {
  const dashboard = await getDashboardData();
  return dashboard.products.find((product) => product.id === id || product.slug === id) || null;
}

export async function getPublicProductGroup(id: string) {
  const dashboard = await readDashboardData();
  return dashboard.products.find((product) => product.id === id || product.slug === id) || null;
}

export async function getPublicProductSummary(id: string) {
  const explorerData = await getExplorerData();
  const product = explorerData.products.find((item) => item.id === id || item.slug === id);
  if (product) return product;

  const summary = await getPublicProductSummaryFromDatabase(id);
  if (summary) return summary;

  const catalogProduct = canonicalCatalog.find((item) => item.id === id || item.slug === id);
  if (catalogProduct && !isPublicCatalogProduct(catalogProduct)) return null;
  return catalogProduct ? toExplorerProductSummary(makeEmptyProductGroup(catalogProduct)) : null;
}

async function getPublicProductSummaryFromDatabase(id: string): Promise<ExplorerProductSummary | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("get_public_product_summary", {
      p_product_key: id,
    })
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.warn("Falling back to explorer product summary because RPC failed:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : null;
  if (!row) return null;

  const product = mapPublicProductSummaryRow(row);
  return isPublicCatalogProduct(product) ? product : null;
}

export async function listPublicProductOffers(id: string, filters: ProductOfferListFilters = {}) {
  const filterProductId = resolvePublicProductFilterId(id);
  const limit = normalizePublicOfferLimit(filters.limit);
  const offset = normalizePublicOfferOffset(filters.offset);
  const filterTags = parseOfferFilterTagsForProduct(filterProductId, filters.filterTags || []);
  const query = normalizeProductOfferQuery(filters.query);
  const excludeQuery = normalizeProductOfferQuery(filters.excludeQuery, 160);
  const collector = parseMerchantCollectorFilter(filters.collector);
  const minPrice = normalizeProductOfferPriceFilter(filters.minPrice);
  const maxPrice = normalizeProductOfferPriceFilter(filters.maxPrice);
  const cacheKey = `${id}:${limit}:${offset}:${filterTags.join(",") || "all"}:${query || "none"}:${excludeQuery || "none"}:${collector}:${minPrice ?? "none"}:${maxPrice ?? "none"}:offer-filter-v6-source-price`;
  const now = Date.now();
  const cached = productOffersCache.get(cacheKey);

  if (cached && cached.expiresAt > now && isReusableGeneratedValue(cached.value)) {
    return sanitizePublicProductOffersResultForProduct(filterProductId, cached.value);
  }

  const staleValue = cached?.value || null;
  const value = await loadPublicProductOffers(id, { limit, offset, filterTags, filterProductId, query, excludeQuery, collector, minPrice, maxPrice });
  const nextValue = sanitizePublicProductOffersResultForProduct(filterProductId, preferStaleProductOffers(staleValue, value));
  if (!nextValue.degraded) {
    productOffersCache.set(cacheKey, {
      expiresAt: Date.now() + PRODUCT_OFFERS_CACHE_TTL_MS,
      value: nextValue,
    });
  }

  if (productOffersCache.size > 120) {
    const expiredAt = Date.now();
    for (const [key, entry] of productOffersCache) {
      if (entry.expiresAt <= expiredAt || productOffersCache.size > 120) {
        productOffersCache.delete(key);
      }
    }
  }

  return nextValue;
}

async function loadPublicProductOffers(
  id: string,
  filters: Required<Pick<ProductOfferListFilters, "limit" | "offset">> & {
    filterTags: OfferFilterTagId[];
    filterProductId: string;
    query: string;
    excludeQuery: string;
    collector: MerchantCollectorFilter;
    minPrice: number | null;
    maxPrice: number | null;
    skipSnapshot?: boolean;
  },
) : Promise<PublicProductOffersResult> {
  const snapshotKey = publicProductOffersSnapshotKeyForRequest(id, filters);
  let staleSnapshotValue: PublicProductOffersResult | null = null;
  if (snapshotKey && !filters.skipSnapshot) {
    const snapshot = await readPublicApiSnapshot<PublicProductOffersResult>(
      "product_offers",
      snapshotKey,
    );
    if (snapshot && isProductOffersSnapshot(snapshot.value)) {
      const value = sanitizePublicProductOffersResultForProduct(filters.filterProductId, hydrateGeneratedAt(snapshot));
      if (isPublicApiSnapshotFresh(snapshot)) return value;
      staleSnapshotValue = value;
    }
  }

  const rpcData = await getPublicProductOffersFromDatabase(id, filters);
  if (rpcData) {
    if (snapshotKey && !filters.skipSnapshot && !rpcData.degraded) {
      await writePublicApiSnapshot({
        kind: "product_offers",
        key: snapshotKey,
        payload: rpcData,
        generatedAt: rpcData.generatedAt,
      });
    }
    return staleSnapshotValue ? preferStaleProductOffers(staleSnapshotValue, rpcData) : rpcData;
  }

  const { limit, offset, filterTags, query, excludeQuery, collector, minPrice, maxPrice } = filters;
  const excludeTerms = parseProductOfferKeywords(excludeQuery);
  const publicData = await readPublicOfferData();
  const products = publicData.products.length ? publicData.products : canonicalCatalog;
  const product =
    products.find((item) => item.id === id || item.slug === id) ||
    canonicalCatalog.find((item) => item.id === id || item.slug === id);

  if (!product || !isPublicCatalogProduct(product)) {
    return {
      offers: [],
      total: 0,
      filterFacets: [],
      activeFilterTags: filterTags,
      generatedAt: publicData.generatedAt,
      degraded: publicData.degraded,
      message: publicData.message,
    };
  }

  const productOffers = dedupePublicOffers(publicData.offers
    .filter((offer) => resolveOfferProduct(offer, products).id === product.id)
    .sort(comparePublicOffers));
  const offerPool = shouldExcludeDefaultTelegramStars(product.id, filterTags)
    ? productOffers.filter((offer) => !isTelegramStarsOffer(offer))
    : productOffers;
  const offers = offerPool
    .filter((offer) => offerMatchesFilterTags(offer, filterTags))
    .filter((offer) => offerMatchesProductOfferQuery(offer, query))
    .filter((offer) => offerMatchesProductOfferExcludeQuery(offer, excludeTerms))
    .filter((offer) => offerMatchesProductOfferCollector(offer, collector))
    .filter((offer) => offerMatchesProductOfferPriceRange(offer, minPrice, maxPrice));
  const total = offers.length;
  const page = offers.slice(offset, offset + limit);

  const fallbackValue = {
    offers: page,
    total,
    filterFacets: filterOfferFilterFacetsForProduct(product.id, buildOfferFilterFacets(productOffers)),
    activeFilterTags: filterTags,
    limited: total > offset + limit,
    generatedAt: publicData.generatedAt,
    degraded: publicData.degraded,
    message: publicData.message,
  };

  if (snapshotKey && !filters.skipSnapshot && !fallbackValue.degraded) {
    await writePublicApiSnapshot({
      kind: "product_offers",
      key: snapshotKey,
      payload: fallbackValue,
      generatedAt: fallbackValue.generatedAt,
    });
  }

  return staleSnapshotValue ? preferStaleProductOffers(staleSnapshotValue, fallbackValue) : fallbackValue;
}

async function getPublicProductOffersFromDatabase(
  id: string,
  filters: Required<Pick<ProductOfferListFilters, "limit" | "offset">> & {
    filterTags: OfferFilterTagId[];
    filterProductId: string;
    query: string;
    excludeQuery: string;
    collector: MerchantCollectorFilter;
    minPrice: number | null;
    maxPrice: number | null;
  },
): Promise<PublicProductOffersResult | null> {
  if (!isPublicProductKeyVisible(id) || !isPublicProductKeyVisible(filters.filterProductId)) {
    return {
      offers: [],
      total: 0,
      filterFacets: [],
      activeFilterTags: filters.filterTags,
      limited: false,
      generatedAt: new Date().toISOString(),
      degraded: false,
      message: null,
    };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const filterFacetsPromise = getPublicProductOfferFilterFacetsFromDatabase(id, filters.filterProductId);
  const hasServerFilters =
    filters.filterTags.length > 0 ||
    filters.query.length > 0 ||
    filters.excludeQuery.length > 0 ||
    filters.collector !== "all" ||
    filters.minPrice !== null ||
    filters.maxPrice !== null;
  const rpcName = hasServerFilters
    ? "list_public_product_offers_page_v2"
    : "list_public_product_offers_page";
  const params = hasServerFilters
    ? {
        p_product_id: id,
        p_filter_tags: filters.filterTags,
        p_query: filters.query || null,
        p_exclude_query: filters.excludeQuery || null,
        p_collector: filters.collector === "all" ? null : filters.collector,
        p_min_price: filters.minPrice,
        p_max_price: filters.maxPrice,
        p_limit: filters.limit,
        p_offset: filters.offset,
      }
    : {
        p_product_id: id,
        p_limit: filters.limit,
        p_offset: filters.offset,
      };
  const { data, error } = await supabase
    .rpc(rpcName, params)
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.error("Product offers RPC failed:", error.message);
    return null;
  }

  const filterFacets = filterOfferFilterFacetsForProduct(filters.filterProductId, (await filterFacetsPromise.catch((error: unknown) => {
    console.warn("Product offer filter facet RPC failed independently:", errorMessage(error));
    return null;
  })) ?? []);
  const rows = ((data || []) as unknown as Record<string, unknown>[]);
  const offers = await attachPublicRiskFeedbackForOffers(
    await attachSourceCollectorKinds(rows.map(mapRawOffer)),
  );
  const total = rows.length ? Number(rows[0].total_count || rows.length) : 0;

  return {
    offers,
    total,
    filterFacets,
    activeFilterTags: filters.filterTags,
    limited: total > filters.offset + filters.limit,
    generatedAt: new Date().toISOString(),
    degraded: false,
    message: null,
  };
}

async function getPublicProductOfferFilterFacetsFromDatabase(id: string, filterProductId = resolvePublicProductFilterId(id)): Promise<OfferFilterTagFacet[] | null> {
  if (!isPublicProductKeyVisible(id) || !isPublicProductKeyVisible(filterProductId)) return [];

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const cacheKey = `facets:${id}:${filterProductId}`;
  const now = Date.now();
  const cached = productOfferFacetsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data, error } = await supabase
    .rpc("list_public_product_offer_filter_facets", {
      p_product_id: id,
    })
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.warn("Product offer filter facet RPC failed:", error.message);
    return null;
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const counts = new Map(rows.map((row) => [String(row.tag_id), Number(row.offer_count || 0)]));

  const facets = filterOfferFilterFacetsForProduct(filterProductId, buildOfferFilterFacetsFromCounts(counts));
  productOfferFacetsCache.set(cacheKey, {
    expiresAt: Date.now() + PRODUCT_OFFERS_CACHE_TTL_MS,
    value: facets,
  });
  if (productOfferFacetsCache.size > 120) {
    const expiredAt = Date.now();
    for (const [key, entry] of productOfferFacetsCache) {
      if (entry.expiresAt <= expiredAt || productOfferFacetsCache.size > 120) {
        productOfferFacetsCache.delete(key);
      }
    }
  }

  return facets;
}

function resolvePublicProductFilterId(id: string): string {
  return canonicalCatalog.find((product) => product.id === id || product.slug === id)?.id ?? id;
}

function sanitizePublicProductOffersResultForProduct(
  productId: string,
  result: PublicProductOffersResult,
): PublicProductOffersResult {
  if (!isPublicProductKeyVisible(productId)) {
    return {
      ...result,
      offers: [],
      total: 0,
      limited: false,
      filterFacets: [],
      activeFilterTags: [],
    };
  }

  const filterFacets = filterOfferFilterFacetsForProduct(productId, result.filterFacets);
  const activeFilterTags = parseOfferFilterTagsForProduct(productId, result.activeFilterTags);
  const offers = result.offers.filter((offer) => (offer.canonicalProductId || offer.storedCanonicalProductId) === productId);
  const removedOfferCount = result.offers.length - offers.length;
  const total = removedOfferCount > 0 ? Math.max(0, result.total - removedOfferCount) : result.total;

  return {
    ...result,
    offers,
    total,
    limited: total > offers.length ? result.limited : false,
    filterFacets,
    activeFilterTags,
  };
}

function buildOfferFilterFacetsFromCounts(counts: Map<string, number>): OfferFilterTagFacet[] {
  return OFFER_FILTER_TAGS
    .map((definition) => ({
      ...definition,
      count: counts.get(definition.id) || 0,
    }))
    .filter((item) => item.count > 0);
}

function normalizeProductOfferQuery(value: string | string[] | null | undefined, limit = 80): string {
  const input = Array.isArray(value) ? value[0] : value;
  return String(input || "").trim().slice(0, limit);
}

function normalizeProductOfferPriceFilter(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function offerMatchesProductOfferQuery(offer: RawOffer, query: string): boolean {
  if (!query) return true;

  const haystack = buildProductOfferSearchHaystack(offer);

  return haystack.includes(query.toLowerCase());
}

function offerMatchesProductOfferExcludeQuery(offer: RawOffer, excludeTerms: string[]): boolean {
  if (!excludeTerms.length) return true;

  const haystack = buildProductOfferSearchHaystack(offer);
  return excludeTerms.every((term) => !haystack.includes(term.toLowerCase()));
}

function offerMatchesProductOfferCollector(offer: RawOffer, collector: MerchantCollectorFilter): boolean {
  if (collector === "all") return true;
  return merchantCollectorGroup(offer.collectorKind) === collector;
}

function offerMatchesProductOfferPriceRange(offer: RawOffer, minPrice: number | null, maxPrice: number | null): boolean {
  if (minPrice === null && maxPrice === null) return true;
  if (typeof offer.price !== "number" || !Number.isFinite(offer.price)) return false;
  if (minPrice !== null && offer.price < minPrice) return false;
  if (maxPrice !== null && offer.price > maxPrice) return false;
  return true;
}

function parseProductOfferKeywords(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function buildProductOfferSearchHaystack(offer: RawOffer): string {
  return [
    offer.sourceTitle,
    offer.sourceName,
    offer.sourceStoreName || "",
    offer.url,
    offer.tags.join(" "),
  ].join(" ").toLowerCase();
}

export async function listPublicOffers(filters: OfferListFilters = {}) {
  const normalizedFilters = {
    ...filters,
    query: normalizePublicOfferQuery(filters.query),
    limit: normalizePublicOfferLimit(filters.limit),
    offset: normalizePublicOfferOffset(filters.offset),
  };
  const snapshotKey = publicOfferListSnapshotKeyForRequest(normalizedFilters);
  const snapshotEligible = Boolean(snapshotKey);
  const now = Date.now();
  const cachedEntry = snapshotKey
    ? isDefaultOfferListSnapshotKey(snapshotKey)
      ? publicOffersCache
      : publicOfferViewCache.get(snapshotKey) || null
    : null;
  if (
    snapshotEligible &&
    cachedEntry &&
    cachedEntry.expiresAt > now &&
    isReusableGeneratedValue(cachedEntry.value)
  ) {
    return sanitizePublicOffersResultForPublicCatalog(cachedEntry.value);
  }

  let staleSnapshotValue = snapshotEligible ? cachedEntry?.value || null : null;
  if (snapshotKey && !normalizedFilters.skipSnapshot) {
    const snapshot = await readPublicApiSnapshot<PublicOffersResult>("offers", snapshotKey);
    if (snapshot && isPublicOffersSnapshot(snapshot.value)) {
      const value = sanitizePublicOffersResultForPublicCatalog(hydrateGeneratedAt(snapshot));
      if (!isPublicApiSnapshotFresh(snapshot)) {
        staleSnapshotValue = value;
      } else {
        const entry = {
          expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
          value,
        };
        if (isDefaultOfferListSnapshotKey(snapshotKey)) {
          publicOffersCache = entry;
        } else {
          publicOfferViewCache.set(snapshotKey, entry);
        }
        return value;
      }
    }
  }

  const value = await loadPublicOffers(normalizedFilters);
  const publicValue = sanitizePublicOffersResultForPublicCatalog(value);
  const nextValue = snapshotEligible
    ? sanitizePublicOffersResultForPublicCatalog(preferStalePublicOffers(staleSnapshotValue, publicValue))
    : publicValue;
  if (snapshotKey && !normalizedFilters.skipSnapshot && !value.degraded) {
    await writePublicApiSnapshot({
      kind: "offers",
      key: snapshotKey,
      payload: publicValue,
      generatedAt: publicValue.generatedAt,
    });
  }

  if (snapshotKey && !nextValue.degraded) {
    const entry = {
      expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
      value: nextValue,
    };
    if (isDefaultOfferListSnapshotKey(snapshotKey)) {
      publicOffersCache = entry;
    } else {
      publicOfferViewCache.set(snapshotKey, entry);
    }
  }

  return nextValue;
}

export async function listPublicMerchants(filters: MerchantListFilters = {}): Promise<PublicMerchantsResult> {
  const normalizedFilters = {
    ...filters,
    limit: normalizePublicOfferLimit(filters.limit),
    offset: normalizePublicOfferOffset(filters.offset),
    query: normalizePublicOfferQuery(filters.query),
  };
  const snapshotKey = publicMerchantListSnapshotKeyForRequest(normalizedFilters);
  if (snapshotKey) {
    const now = Date.now();
    const cached = publicMerchantViewCache.get(snapshotKey);
    if (cached && cached.expiresAt > now && isReusableGeneratedValue(cached.value)) {
      return cached.value;
    }

    let staleSnapshotValue = cached?.value || null;
    const snapshot = await readPublicApiSnapshot<PublicMerchantsResult>("merchants", snapshotKey);
    if (snapshot && isPublicMerchantsSnapshot(snapshot.value)) {
      const value = hydrateGeneratedAt(snapshot);
      if (isPublicApiSnapshotFresh(snapshot)) {
        publicMerchantViewCache.set(snapshotKey, {
          expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
          value,
        });
        return value;
      }
      staleSnapshotValue = value;
    }

    const catalog = await loadPublicMerchantCatalog();
    const value = paginatePublicMerchants(catalog, normalizedFilters);
    const nextValue = preferStalePublicMerchants(staleSnapshotValue, value);
    if (!value.degraded) {
      await writePublicApiSnapshot({
        kind: "merchants",
        key: snapshotKey,
        payload: value,
        generatedAt: value.generatedAt,
      });
    }
    if (!nextValue.degraded) {
      publicMerchantViewCache.set(snapshotKey, {
        expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
        value: nextValue,
      });
    }
    return nextValue;
  }

  const catalog = await loadPublicMerchantCatalog();
  return paginatePublicMerchants(catalog, normalizedFilters);
}

async function loadPublicMerchantCatalog(): Promise<PublicMerchantsResult> {
  const now = Date.now();
  if (
    publicMerchantsCache &&
    publicMerchantsCache.expiresAt > now &&
    isReusableGeneratedValue(publicMerchantsCache.value)
  ) {
    return publicMerchantsCache.value;
  }

  if (publicMerchantsPromise) return publicMerchantsPromise;

  const staleValue = publicMerchantsCache?.value || null;
  publicMerchantsPromise = buildPublicMerchants()
    .then((value) => {
      const nextValue = preferStalePublicMerchants(staleValue, value);
      if (!nextValue.degraded) {
        publicMerchantsCache = {
          expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
          value: nextValue,
        };
      }
      return nextValue;
    })
    .finally(() => {
      publicMerchantsPromise = null;
    });

  return publicMerchantsPromise;
}

async function buildPublicMerchants(options: { skipSnapshot?: boolean } = {}): Promise<PublicMerchantsResult> {
  let staleSnapshotValue: PublicMerchantsResult | null = null;
  if (!options.skipSnapshot) {
    const snapshot = await readPublicApiSnapshot<PublicMerchantsResult>("merchants", PUBLIC_MERCHANTS_SNAPSHOT_KEY);
    if (snapshot && isPublicMerchantsSnapshot(snapshot.value)) {
      const value = hydrateGeneratedAt(snapshot);
      if (isPublicApiSnapshotFresh(snapshot)) return value;
      staleSnapshotValue = value;
    }
  }

  const rpcData = await listPublicMerchantsFromDatabase();
  if (rpcData) {
    const compactRpcData = compactPublicMerchantsResult(rpcData);
    if (!options.skipSnapshot && !rpcData.degraded) {
      await writePublicApiSnapshot({
        kind: "merchants",
        key: PUBLIC_MERCHANTS_SNAPSHOT_KEY,
        payload: compactRpcData,
        generatedAt: compactRpcData.generatedAt,
      });
    }
    return staleSnapshotValue ? preferStalePublicMerchants(staleSnapshotValue, compactRpcData) : compactRpcData;
  }

  const publicData = await readPublicOfferData();
  const productGroups = buildProductGroups(publicData.offers, publicData.products).map(toExplorerProductSummary);
  const sources = publicData.sources || await listPublicSourcesForOffers(publicData.offers);
  const rows = buildPublicMerchantSummaries({
    offers: dedupePublicOffers(publicData.offers).filter((offer) => !offer.hidden),
    products: productGroups,
    sources,
    generatedAt: publicData.generatedAt,
  });
  const value = compactPublicMerchantsResult({
    rows,
    total: rows.length,
    generatedAt: publicData.generatedAt,
    degraded: publicData.degraded,
    message: publicData.message,
  });

  if (!options.skipSnapshot && !value.degraded) {
    await writePublicApiSnapshot({
      kind: "merchants",
      key: PUBLIC_MERCHANTS_SNAPSHOT_KEY,
      payload: value,
      generatedAt: value.generatedAt,
    });
  }

  return staleSnapshotValue ? preferStalePublicMerchants(staleSnapshotValue, value) : value;
}

function paginatePublicMerchants(value: PublicMerchantsResult, filters: MerchantListFilters): PublicMerchantsResult {
  const limit = normalizePublicOfferLimit(filters.limit);
  const offset = normalizePublicOfferOffset(filters.offset);
  const rows = filterAndSortPublicMerchants(value.rows, filters);

  return {
    ...value,
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    limited: rows.length > offset + limit,
    limit,
    offset,
  };
}

function filterAndSortPublicMerchants(
  merchants: PublicMerchantSummary[],
  filters: MerchantListFilters,
): PublicMerchantSummary[] {
  const merchantQuery = parsePublicMerchantQuery(filters.query || "");
  const min = filters.minPrice ?? null;
  const max = filters.maxPrice ?? null;

  return merchants
    .filter((merchant) => {
      const representativePrice = merchant.representativePrice ?? null;
      const haystack = [
        merchant.name,
        merchant.sourceName,
        merchant.host || "",
        merchant.entryUrl,
        merchant.shopUrl || "",
        merchant.collectorLabel,
        merchant.representativeProduct || "",
        merchant.representativeOfferTitle || "",
        ...merchant.platforms,
        ...merchant.productTypes,
      ].join(" ").toLowerCase();

      if (!publicMerchantMatchesQuery(merchant, merchantQuery, haystack)) return false;
      if (filters.platform && filters.platform !== "全部" && !merchant.platforms.includes(filters.platform)) return false;
      if (filters.productType && filters.productType !== "全部" && !merchant.productTypes.includes(filters.productType)) return false;
      if (filters.stock === "available" && merchant.inStockCount === 0) return false;
      if (filters.stock === "out_of_stock" && merchant.outOfStockCount === 0) return false;
      if (filters.collector && filters.collector !== "all" && merchant.collectorGroup !== filters.collector) return false;
      if (filters.signal === "lowest" && merchant.lowestHitCount === 0) return false;
      if (filters.signal === "warranty" && merchant.warrantyLowestHitCount === 0) return false;
      if (filters.signal === "platform_aftersales" && !merchant.hasPlatformAftersalesMechanism) return false;
      if (filters.signal === "risk_clear" && merchant.riskFeedbackCount > 0) return false;
      if ((min !== null || max !== null) && representativePrice === null) return false;
      if (min !== null && representativePrice !== null && representativePrice < min) return false;
      if (max !== null && representativePrice !== null && representativePrice > max) return false;

      return true;
    })
    .sort((a, b) => comparePublicMerchantsBySort(a, b, filters.sort || "available_price"));
}

type PublicMerchantSearchQuery = {
  normalized: string;
  isUrl: boolean;
  terms: string[];
};

function parsePublicMerchantQuery(query: string): PublicMerchantSearchQuery {
  const normalized = normalizePublicOfferQuery(query).toLowerCase();
  if (!normalized) return { normalized, isUrl: false, terms: [] };

  if (!looksLikePublicMerchantUrlQuery(normalized)) {
    const terms = new Set([normalized]);
    for (const part of normalized.split(/[\s/]+/)) {
      if (part) terms.add(part);
    }
    return { normalized, isUrl: false, terms: Array.from(terms).filter(Boolean) };
  }

  try {
    const url = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    const origin = url.origin.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    const terms = new Set([`${origin}${path}`, path]);
    const shopMatch = url.pathname.match(/\/shop\/([^/?#]+)/i);
    const itemMatch = url.pathname.match(/\/item\/([^/?#]+)/i);
    if (shopMatch?.[1]) terms.add(shopMatch[1].toLowerCase());
    if (itemMatch?.[1]) terms.add(itemMatch[1].toLowerCase());
    return { normalized, isUrl: true, terms: Array.from(terms).filter(Boolean) };
  } catch {
    return { normalized, isUrl: false, terms: Array.from(new Set([normalized])).filter(Boolean) };
  }
}

function looksLikePublicMerchantUrlQuery(value: string): boolean {
  if (value.includes("://")) return true;
  if (/\/(?:shop|item)\//i.test(value)) return true;
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$)/i.test(value);
}

function publicMerchantMatchesQuery(
  merchant: PublicMerchantSummary,
  query: PublicMerchantSearchQuery,
  haystack: string,
): boolean {
  if (!query.normalized) return true;

  if (!query.isUrl) {
    return query.terms.some((term) => haystack.includes(term));
  }

  const urlTargets = [
    merchant.entryUrl,
    merchant.shopUrl || "",
  ].flatMap(publicMerchantUrlSearchValues);

  return query.terms.some((term) => urlTargets.some((target) => target.includes(term)));
}

function publicMerchantUrlSearchValues(value: string): string[] {
  const raw = value.trim().toLowerCase();
  if (!raw) return [];

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    const values = new Set([`${url.origin.toLowerCase()}${path}`, path]);
    const tokenMatch = path.match(/\/(?:shop|item)\/([^/?#]+)/i);
    if (tokenMatch?.[1]) values.add(tokenMatch[1].toLowerCase());
    return Array.from(values).filter(Boolean);
  } catch {
    return [raw];
  }
}

function comparePublicMerchantsBySort(a: PublicMerchantSummary, b: PublicMerchantSummary, sort: string): number {
  if (sort === "updated") {
    const updatedDelta = (b.latestSeenAt || "").localeCompare(a.latestSeenAt || "");
    if (updatedDelta !== 0) return updatedDelta;
  }

  if (sort === "channels") {
    const coverageDelta = b.productCount - a.productCount;
    if (coverageDelta !== 0) return coverageDelta;
  }

  if (sort === "price") {
    const priceDelta = (a.representativePrice ?? Number.MAX_SAFE_INTEGER) - (b.representativePrice ?? Number.MAX_SAFE_INTEGER);
    if (priceDelta !== 0) return priceDelta;
  }

  return comparePublicMerchants(a, b);
}

async function loadPublicOffers(filters: OfferListFilters & { skipSnapshot?: boolean } = {}): Promise<PublicOffersResult> {
  const rpcData = await listPublicOffersFromDatabase(filters);
  if (rpcData) return rpcData;

  const publicData = await readPublicOfferData();
  const productGroups = buildProductGroups(publicData.offers, publicData.products).map(toExplorerProductSummary);
  const normalizedQuery = (filters.query || "").trim().toLowerCase();
  const limit = normalizePublicOfferLimit(filters.limit);
  const offset = normalizePublicOfferOffset(filters.offset);

  let rows = dedupePublicOffers(publicData.offers)
    .filter((offer) => !offer.hidden)
    .map((offer) => {
      const product = resolveExplorerProduct(offer, productGroups);
      return { offer, product };
    })
    .filter(({ offer, product }) => {
      const haystack = [
        offer.sourceTitle,
        offer.sourceName,
        offer.sourceStoreName || "",
        product.displayName,
        product.platform,
        product.productType,
        product.spec,
      ]
        .join(" ")
        .toLowerCase();

      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
      if (filters.platform && filters.platform !== "全部" && product.platform !== filters.platform) return false;
      if (filters.productType && filters.productType !== "全部" && product.productType !== filters.productType) return false;
      if (filters.stock === "available" && !isOfferAvailableForPublicList(offer)) return false;
      if (filters.stock === "out_of_stock" && isOfferAvailableForPublicList(offer)) return false;
      if (offer.price === null && (filters.minPrice != null || filters.maxPrice != null)) return false;
      if (offer.price !== null && filters.minPrice !== null && filters.minPrice !== undefined && offer.price < filters.minPrice) return false;
      if (offer.price !== null && filters.maxPrice !== null && filters.maxPrice !== undefined && offer.price > filters.maxPrice) return false;

      return true;
    });

  rows = rows.sort((a, b) => {
    const platformDelta = comparePlatformOrder(a.product.platform, b.product.platform);
    if (platformDelta !== 0) return platformDelta;

    if (filters.sort === "updated") {
      const updatedDelta = (offerTimestamp(b.offer) || "").localeCompare(offerTimestamp(a.offer) || "");
      if (updatedDelta !== 0) return updatedDelta;
      return comparePublicOfferFallback(a.offer, b.offer);
    }

    if (filters.sort === "channels") {
      const sourceDelta = sourceLabel(a.offer).localeCompare(sourceLabel(b.offer), "zh-CN");
      if (sourceDelta !== 0) return sourceDelta;
      return comparePublicOfferFallback(a.offer, b.offer);
    }

    if (filters.sort === "price") {
      const priceDelta = (a.offer.price ?? Number.MAX_SAFE_INTEGER) - (b.offer.price ?? Number.MAX_SAFE_INTEGER);
      if (priceDelta !== 0) return priceDelta;
      return comparePublicOfferFallback(a.offer, b.offer);
    }

    const offerDelta = comparePublicOffers(a.offer, b.offer);
    if (offerDelta !== 0) return offerDelta;

    return comparePublicOfferFallback(a.offer, b.offer);
  });

  return {
    rows: rows.slice(offset, offset + limit).map(compactPublicOfferRow),
    total: rows.length,
    limited: rows.length > offset + limit,
    generatedAt: publicData.generatedAt,
    degraded: publicData.degraded,
    message: publicData.message,
  };
}

async function listPublicOffersFromDatabase(filters: OfferListFilters = {}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const limit = normalizePublicOfferLimit(filters.limit);
  const offset = normalizePublicOfferOffset(filters.offset);
  const { data, error } = await supabase
    .rpc("list_public_offers_page", {
      p_query: filters.query || null,
      p_platform: filters.platform || null,
      p_product_type: filters.productType || null,
      p_stock: filters.stock || null,
      p_sort: filters.sort || null,
      p_min_price: filters.minPrice ?? null,
      p_max_price: filters.maxPrice ?? null,
      p_limit: limit,
      p_offset: offset,
    })
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.error("Public offers RPC failed:", error.message);
    return null;
  }

  const allRows = ((data || []) as unknown as PublicOfferPageRow[]);
  const rows = allRows.filter(isPublicOfferPageRowProductVisible);
  const total = rows.length === allRows.length
    ? rows.length ? Number(rows[0].total_count || rows.length) : 0
    : rows.length;
  const offers = await attachPublicRiskFeedbackForOffers(
    await attachSourceCollectorKinds(rows.map((row) => mapRawOffer(row))),
  );
  const products = publicCatalogProducts(canonicalCatalog)
    .map(makeEmptyProductGroup)
    .map(toExplorerProductSummary);

  return {
    rows: rows.map((row, index) => {
      const offer = offers[index] || mapRawOffer(row);
      return {
        offer: compactPublicOffer(offer),
        product: compactPublicProduct(resolveExplorerProduct(offer, products)),
      };
    }),
    total,
    limited: total > offset + limit,
    generatedAt: new Date().toISOString(),
    degraded: false,
    message: null,
  };
}

async function listPublicMerchantsFromDatabase(): Promise<PublicMerchantsResult | null> {
  if (!apiCdkPublicVisible()) return null;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("list_public_merchant_summaries")
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.error("Public merchant summaries RPC failed:", error.message);
    return null;
  }

  const rows = ((data || []) as unknown as PublicMerchantRow[]).map(mapPublicMerchantSummaryRow);
  const total = rows.length ? Number(((data || []) as PublicMerchantRow[])[0]?.total_count || rows.length) : 0;

  return {
    rows,
    total,
    generatedAt: new Date().toISOString(),
    degraded: false,
    message: null,
  };
}

async function listPublicSourcesForOffers(offers?: RawOffer[]): Promise<Source[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const sourceIds = offers
    ? Array.from(new Set(
        offers
          .map((offer) => offer.sourceId)
          .filter((id): id is string => Boolean(id)),
      ))
    : [];

  const rows: Record<string, unknown>[] = [];
  const batches = sourceIds.length ? chunks(sourceIds, 100) : [[]];
  for (const ids of batches) {
    const { data, error } = await selectPublicSourceRows(ids, false);
    if (error) {
      if (isMissingColumnError(error, "shop_created_at")) {
        const fallback = await selectPublicSourceRows(ids, true);
        if (!fallback.error) {
          rows.push(...((fallback.data || []) as Record<string, unknown>[]));
          continue;
        }
      }
      console.warn("Public source lookup failed:", error.message);
      return rows.map(mapSource);
    }

    rows.push(...((data || []) as Record<string, unknown>[]));
  }

  return rows.map(mapSource);
}

async function selectPublicSourceRows(sourceIds: string[], legacy: boolean) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { data: [], error: null };

  let query = supabase
    .from("sources")
    .select(legacy ? PUBLIC_SOURCE_LEGACY_SELECT : PUBLIC_SOURCE_SELECT)
    .abortSignal(publicSupabaseReadSignal());

  if (sourceIds.length) {
    query = query.in("id", sourceIds);
  } else {
    query = query.eq("enabled", true);
  }

  return query;
}

function isMissingColumnError(error: { code?: string | null; message?: string | null }, column: string): boolean {
  return error.code === "42703" || Boolean(error.message?.includes(column) && error.message.includes("does not exist"));
}

function buildPublicMerchantSummaries({
  offers,
  products,
  sources,
  generatedAt,
}: {
  offers: RawOffer[];
  products: ExplorerProductSummary[];
  sources: Source[];
  generatedAt: string;
}): PublicMerchantSummary[] {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const lowestHitOfferIds = new Set(products.map((product) => product.lowestOffer?.id).filter((id): id is string => Boolean(id)));
  const warrantyLowestHitOfferIds = new Set(products.map((product) => product.warrantyLowestOffer?.id).filter((id): id is string => Boolean(id)));
  const groups = new Map<string, {
    summary: PublicMerchantSummary;
    productIds: Set<string>;
    platforms: Set<string>;
    productTypes: Set<string>;
  }>();

  for (const offer of offers) {
    const product = resolveExplorerProduct(offer, products);
    if (!product) continue;

    const source = offer.sourceId ? sourcesById.get(offer.sourceId) || null : null;
    const groupKey = publicMerchantGroupKey(offer);
    const existing = groups.get(groupKey);
    const collectorKind = offer.collectorKind || source?.collectorKind || null;
    const collectorGroup = merchantCollectorGroup(collectorKind);
    const timestamp = offerTimestamp(offer) || null;
    const available = isOfferAvailableForPublicList(offer);
    const merchantEntryUrl = source?.entryUrl || offer.url;
    const merchantShopUrl = inferMerchantShopUrl({
      sourceId: offer.sourceId,
      sourceName: offer.sourceName || source?.name,
      entryUrl: merchantEntryUrl,
      host: source ? sourceHost(source) : offerHost(offer.url),
    });

    const current = existing || {
      summary: {
        id: stableId("merchant", groupKey),
        sourceId: offer.sourceId || null,
        name: sourceLabel(offer),
        storeName: offer.sourceStoreName || null,
        sourceName: offer.sourceName || source?.name || sourceLabel(offer),
        entryUrl: merchantEntryUrl,
        shopUrl: merchantShopUrl,
        host: source ? sourceHost(source) : offerHost(offer.url),
        collectorKind,
        collectorGroup,
        collectorLabel: merchantCollectorLabel(collectorGroup),
        healthStatus: source?.healthStatus || null,
        lastSuccessAt: source?.lastSuccessAt || null,
        consecutiveFailures: source?.consecutiveFailures ?? null,
        productCount: 0,
        offerCount: 0,
        inStockCount: 0,
        outOfStockCount: 0,
        platformCount: 0,
        platforms: [],
        productTypes: [],
        lowestHitCount: 0,
        warrantyLowestHitCount: 0,
        riskFeedbackCount: 0,
        latestSeenAt: null,
        observationStartedAt: timestamp,
        includedAt: source?.createdAt || null,
        shopCreatedAt: source?.shopCreatedAt || null,
        representativeProduct: product.displayName,
        representativeOfferTitle: offer.sourceTitle,
        representativePrice: offer.price,
        representativeCurrency: offer.currency,
        hasPlatformAftersalesMechanism: collectorGroup === "shopApi",
      },
      productIds: new Set<string>(),
      platforms: new Set<string>(),
      productTypes: new Set<string>(),
    };

    current.summary.offerCount += 1;
    current.summary.inStockCount += available ? 1 : 0;
    current.summary.outOfStockCount += available ? 0 : 1;
    current.summary.latestSeenAt = latestIso([current.summary.latestSeenAt, timestamp]);
    current.summary.observationStartedAt = earliestIso([current.summary.observationStartedAt, timestamp]);
    current.summary.includedAt = earliestIso([current.summary.includedAt || null, source?.createdAt || null]);
    current.summary.shopCreatedAt = earliestIso([current.summary.shopCreatedAt || null, source?.shopCreatedAt || null]);
    current.summary.riskFeedbackCount = Math.max(
      current.summary.riskFeedbackCount,
      offer.riskFeedback?.sourceCount || 0,
    );
    if (lowestHitOfferIds.has(offer.id)) current.summary.lowestHitCount += 1;
    if (warrantyLowestHitOfferIds.has(offer.id)) current.summary.warrantyLowestHitCount += 1;
    if (!current.summary.representativePrice && offer.price !== null) {
      current.summary.representativeProduct = product.displayName;
      current.summary.representativeOfferTitle = offer.sourceTitle;
      current.summary.representativePrice = offer.price;
      current.summary.representativeCurrency = offer.currency;
    }

    current.productIds.add(product.id);
    current.platforms.add(product.platform);
    current.productTypes.add(product.productType);
    current.summary.productCount = current.productIds.size;
    current.summary.platformCount = current.platforms.size;
    current.summary.platforms = Array.from(current.platforms).sort(comparePlatformOrder);
    current.summary.productTypes = Array.from(current.productTypes).sort((a, b) => a.localeCompare(b, "zh-CN"));

    groups.set(groupKey, current);
  }

  return Array.from(groups.values())
    .map(({ summary }) => ({
      ...summary,
      observationStartedAt: summary.observationStartedAt || generatedAt,
    }))
    .sort(comparePublicMerchants);
}

function mapPublicMerchantSummaryRow(row: PublicMerchantRow): PublicMerchantSummary {
  const collectorKind = normalizeSourceCollectorKind(row.collector_kind);
  const collectorGroup = merchantCollectorGroup(collectorKind);
  const platforms = arrayFromRow(row.platforms);
  const productTypes = arrayFromRow(row.product_types);

  return {
    id: String(row.id || stableId("merchant", row.source_id ? String(row.source_id) : String(row.name || ""))),
    sourceId: row.source_id ? String(row.source_id) : null,
    name: String(row.name || row.source_name || "未记录商家"),
    storeName: row.store_name ? String(row.store_name) : null,
    sourceName: String(row.source_name || row.name || "未记录渠道"),
    entryUrl: String(row.entry_url || ""),
    shopUrl: inferMerchantShopUrl({
      sourceId: row.source_id ? String(row.source_id) : null,
      sourceName: row.source_name ? String(row.source_name) : null,
      entryUrl: row.shop_url ? String(row.shop_url) : row.entry_url ? String(row.entry_url) : null,
      host: row.host ? String(row.host) : null,
    }),
    host: row.host ? String(row.host) : null,
    collectorKind,
    collectorGroup,
    collectorLabel: merchantCollectorLabel(collectorGroup),
    healthStatus: row.health_status ? String(row.health_status) as Source["healthStatus"] : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    consecutiveFailures:
      row.consecutive_failures === null || row.consecutive_failures === undefined
        ? null
        : Number(row.consecutive_failures),
    productCount: Number(row.product_count || 0),
    offerCount: Number(row.offer_count || 0),
    inStockCount: Number(row.in_stock_count || 0),
    outOfStockCount: Number(row.out_of_stock_count || 0),
    platformCount: Number(row.platform_count || platforms.length),
    platforms,
    productTypes,
    lowestHitCount: Number(row.lowest_hit_count || 0),
    warrantyLowestHitCount: Number(row.warranty_lowest_hit_count || 0),
    riskFeedbackCount: Number(row.risk_feedback_count || 0),
    latestSeenAt: row.latest_seen_at ? String(row.latest_seen_at) : null,
    observationStartedAt: row.observation_started_at ? String(row.observation_started_at) : null,
    includedAt: row.included_at ? String(row.included_at) : null,
    shopCreatedAt: row.shop_created_at ? String(row.shop_created_at) : null,
    representativeProduct: row.representative_product ? String(row.representative_product) : null,
    representativeOfferTitle: row.representative_offer_title ? String(row.representative_offer_title) : null,
    representativePrice:
      row.representative_price === null || row.representative_price === undefined
        ? null
        : Number(row.representative_price),
    representativeCurrency: row.representative_currency ? String(row.representative_currency) : "CNY",
    hasPlatformAftersalesMechanism: Boolean(row.has_platform_aftersales_mechanism),
  };
}

function isPublicOfferForProducts(offer: RawOffer, products: CanonicalProduct[]): boolean {
  const product = resolveOfferProduct(offer, products);
  return isPublicCatalogProduct(product);
}

async function listPublicRiskFeedbackSummary(): Promise<PublicRiskFeedbackSummary> {
  const empty = emptyPublicRiskFeedbackSummary();
  const supabase = getSupabaseServerClient();
  if (!supabase) return empty;

  const { data, error } = await supabase
    .from("offer_feedback")
    .select("id,offer_id,source_id,ai_review_result,created_at")
    .not("ai_review_result", "is", null)
    .neq("status", "ignored")
    .order("created_at", { ascending: false })
    .limit(1000)
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.warn("Public risk feedback read failed:", error.message);
    return empty;
  }

  return buildPublicRiskFeedbackSummaryFromRows((data || []) as Array<Record<string, unknown>>);
}

async function listPublicRiskFeedbackSummaryForOffers(offers: RawOffer[]): Promise<PublicRiskFeedbackSummary> {
  const empty = emptyPublicRiskFeedbackSummary();
  const supabase = getSupabaseServerClient();
  if (!supabase || !offers.length) return empty;

  const offerIds = uniqueStrings(offers.map((offer) => offer.id));
  const sourceIds = uniqueStrings(offers.map((offer) => offer.sourceId || null));
  if (!offerIds.length && !sourceIds.length) return empty;

  const rowBatches: Array<Array<Record<string, unknown>>> = [];

  if (offerIds.length) {
    const { data, error } = await supabase
      .from("offer_feedback")
      .select("id,offer_id,source_id,ai_review_result,created_at")
      .not("ai_review_result", "is", null)
      .neq("status", "ignored")
      .in("offer_id", offerIds)
      .order("created_at", { ascending: false })
      .limit(1000)
      .abortSignal(publicSupabaseReadSignal());

    if (error) {
      console.warn("Public offer risk feedback read failed:", error.message);
    } else {
      rowBatches.push((data || []) as Array<Record<string, unknown>>);
    }
  }

  if (sourceIds.length) {
    const { data, error } = await supabase
      .from("offer_feedback")
      .select("id,offer_id,source_id,ai_review_result,created_at")
      .not("ai_review_result", "is", null)
      .neq("status", "ignored")
      .in("source_id", sourceIds)
      .order("created_at", { ascending: false })
      .limit(1000)
      .abortSignal(publicSupabaseReadSignal());

    if (error) {
      console.warn("Public source risk feedback read failed:", error.message);
    } else {
      rowBatches.push((data || []) as Array<Record<string, unknown>>);
    }
  }

  return buildPublicRiskFeedbackSummaryFromRows(dedupePublicRiskFeedbackRows(rowBatches.flat()));
}

async function attachPublicRiskFeedbackForOffers(offers: RawOffer[]): Promise<RawOffer[]> {
  if (!offers.length) return offers;

  return attachPublicRiskFeedback(offers, await listPublicRiskFeedbackSummaryForOffers(offers));
}

function emptyPublicRiskFeedbackSummary(): PublicRiskFeedbackSummary {
  return {
    byOfferId: new Map<string, PublicRiskFeedbackAggregate>(),
    bySourceId: new Map<string, PublicRiskFeedbackAggregate>(),
  };
}

function buildPublicRiskFeedbackSummaryFromRows(rows: Array<Record<string, unknown>>): PublicRiskFeedbackSummary {
  const summary = emptyPublicRiskFeedbackSummary();

  for (const row of rows) {
    const offerId = typeof row.offer_id === "string" ? row.offer_id : null;
    const sourceId = typeof row.source_id === "string" ? row.source_id : null;
    const createdAt = typeof row.created_at === "string" ? row.created_at : null;
    const precheck = getPublicRiskPrecheck(row.ai_review_result);
    if (!precheck) continue;

    if (offerId) {
      addPublicRiskFeedbackAggregate(summary.byOfferId, offerId, precheck.riskCategory, createdAt, {
        summary: precheck.offerPublicSummary || precheck.publicSummary,
        offerSummary: precheck.offerPublicSummary || precheck.publicSummary,
      });
    }
    if (sourceId && precheck.sourceCanShowPublicly) {
      addPublicRiskFeedbackAggregate(summary.bySourceId, sourceId, precheck.riskCategory, createdAt, {
        summary: precheck.sourcePublicSummary || precheck.publicSummary,
        sourceSummary: precheck.sourcePublicSummary || precheck.publicSummary,
      });
    }
  }

  return summary;
}

function dedupePublicRiskFeedbackRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function attachPublicRiskFeedback(offers: RawOffer[], summary: PublicRiskFeedbackSummary): RawOffer[] {
  if (!summary.byOfferId.size && !summary.bySourceId.size) return offers;

  return offers.map((offer) => {
    const offerFeedback = summary.byOfferId.get(offer.id) || null;
    const sourceFeedback = offer.sourceId ? summary.bySourceId.get(offer.sourceId) || null : null;
    if (!offerFeedback && !sourceFeedback) return offer;

    return {
      ...offer,
      riskFeedback: {
        count: (offerFeedback?.count || 0) + (sourceFeedback?.count || 0),
        offerCount: offerFeedback?.count || 0,
        sourceCount: sourceFeedback?.count || 0,
        scope: offerFeedback && sourceFeedback ? "mixed" : offerFeedback ? "offer" : "source",
        latestAt: latestIso([offerFeedback?.latestAt, sourceFeedback?.latestAt]),
        reasons: Array.from(new Set([
          ...(offerFeedback ? Array.from(offerFeedback.reasons) : []),
          ...(sourceFeedback ? Array.from(sourceFeedback.reasons) : []),
        ])),
        summaries: Array.from(new Set([
          ...(offerFeedback ? Array.from(offerFeedback.summaries) : []),
          ...(sourceFeedback ? Array.from(sourceFeedback.summaries) : []),
        ])).slice(0, 3),
        offerSummaries: Array.from(offerFeedback?.offerSummaries || []).slice(0, 3),
        sourceSummaries: Array.from(sourceFeedback?.sourceSummaries || []).slice(0, 3),
        status: "user_report_pending_verification",
      },
    };
  });
}

async function attachSourceCollectorKinds(offers: RawOffer[]): Promise<RawOffer[]> {
  if (!offers.length || offers.every((offer) => offer.collectorKind && offer.sourceIncludedAt !== undefined && offer.sourceShopCreatedAt !== undefined)) return offers;

  const supabase = getSupabaseServerClient();
  if (!supabase) return offers;

  const sourceIds = Array.from(new Set(
    offers
      .filter((offer) => (!offer.collectorKind || offer.sourceIncludedAt === undefined || offer.sourceShopCreatedAt === undefined) && offer.sourceId)
      .map((offer) => String(offer.sourceId)),
  ));
  if (!sourceIds.length) return offers;

  const { data, error } = await supabase
    .from("sources")
    .select("id,collector_kind,created_at,shop_created_at")
    .in("id", sourceIds)
    .abortSignal(publicSupabaseReadSignal());

  if (error) {
    console.warn("Source collector kind lookup failed:", error.message);
    return offers;
  }

  return attachKnownSourceCollectorKinds(
    offers,
    new Map(
      ((data || []) as Array<Record<string, unknown>>).map((row) => [
        String(row.id),
        {
          collectorKind: normalizeSourceCollectorKind(row.collector_kind),
          includedAt: row.created_at ? String(row.created_at) : null,
          shopCreatedAt: row.shop_created_at ? String(row.shop_created_at) : null,
        },
      ]),
    ),
  );
}

function attachKnownSourceCollectorKinds(
  offers: RawOffer[],
  sourceMetaBySourceId: Map<string, { collectorKind: Source["collectorKind"]; includedAt: string | null; shopCreatedAt: string | null }>,
): RawOffer[] {
  if (!sourceMetaBySourceId.size) return offers;

  return offers.map((offer) => {
    if (!offer.sourceId) return offer;
    const sourceMeta = sourceMetaBySourceId.get(offer.sourceId);
    if (!sourceMeta) return offer;

    return {
      ...offer,
      collectorKind: offer.collectorKind || sourceMeta.collectorKind,
      sourceIncludedAt: offer.sourceIncludedAt ?? sourceMeta.includedAt,
      sourceShopCreatedAt: offer.sourceShopCreatedAt ?? sourceMeta.shopCreatedAt,
    };
  });
}

function sourceMetaMap(sources: Array<Pick<Source, "id" | "collectorKind" | "createdAt" | "shopCreatedAt">>): Map<string, { collectorKind: Source["collectorKind"]; includedAt: string | null; shopCreatedAt: string | null }> {
  return new Map(sources.map((source) => [
    source.id,
    {
      collectorKind: source.collectorKind || null,
      includedAt: source.createdAt || null,
      shopCreatedAt: source.shopCreatedAt || null,
    },
  ]));
}

function addPublicRiskFeedbackAggregate(
  map: Map<string, PublicRiskFeedbackAggregate>,
  key: string,
  reason: PublicRiskFeedbackReason,
  createdAt: string | null,
  input: {
    summary: string;
    offerSummary?: string;
    sourceSummary?: string;
  },
) {
  const current = map.get(key);
  if (!current) {
    map.set(key, {
      count: 1,
      latestAt: createdAt,
      reasons: new Set([reason]),
      summaries: new Set(input.summary ? [input.summary] : []),
      offerSummaries: new Set(input.offerSummary ? [input.offerSummary] : []),
      sourceSummaries: new Set(input.sourceSummary ? [input.sourceSummary] : []),
    });
    return;
  }

  current.count += 1;
  current.latestAt = latestIso([current.latestAt, createdAt]);
  current.reasons.add(reason);
  if (input.summary) current.summaries.add(input.summary);
  if (input.offerSummary) current.offerSummaries.add(input.offerSummary);
  if (input.sourceSummary) current.sourceSummaries.add(input.sourceSummary);
}

function compactPublicOfferRow(row: { offer: RawOffer; product: ExplorerProductSummary }) {
  return {
    offer: compactPublicOffer(row.offer),
    product: compactPublicProduct(row.product),
  };
}

function compactPublicOffer(offer: RawOffer): RawOffer {
  return {
    id: offer.id,
    sourceId: offer.sourceId,
    sourceName: offer.sourceName,
    sourceStoreName: offer.sourceStoreName,
    sourceIncludedAt: offer.sourceIncludedAt,
    sourceShopCreatedAt: offer.sourceShopCreatedAt,
    collectorKind: offer.collectorKind,
    sourceTitle: offer.sourceTitle,
    price: offer.price,
    currency: offer.currency,
    status: offer.status,
    url: offer.url,
    tags: [],
    filterTags: offer.filterTags,
    stockCount: offer.stockCount,
    capturedAt: offer.capturedAt,
    sourceUpdatedAt: offer.sourceUpdatedAt,
    lastSeenAt: offer.lastSeenAt,
    verifiedAt: offer.verifiedAt,
    expiresAt: offer.expiresAt,
    effectiveStatus: offer.effectiveStatus,
    freshnessStatus: offer.freshnessStatus,
    riskFeedback: offer.riskFeedback,
  };
}

function compactPublicMerchant(merchant: PublicMerchantSummary): PublicMerchantSummary {
  return {
    id: merchant.id,
    name: merchant.name,
    sourceName: merchant.sourceName,
    entryUrl: merchant.entryUrl,
    shopUrl: merchant.shopUrl,
    host: merchant.host,
    collectorGroup: merchant.collectorGroup,
    collectorLabel: merchant.collectorLabel,
    productCount: merchant.productCount,
    offerCount: merchant.offerCount,
    inStockCount: merchant.inStockCount,
    outOfStockCount: merchant.outOfStockCount,
    platformCount: merchant.platformCount,
    platforms: merchant.platforms,
    productTypes: merchant.productTypes,
    lowestHitCount: merchant.lowestHitCount,
    warrantyLowestHitCount: merchant.warrantyLowestHitCount,
    riskFeedbackCount: merchant.riskFeedbackCount,
    latestSeenAt: merchant.latestSeenAt,
    observationStartedAt: merchant.observationStartedAt,
    includedAt: merchant.includedAt,
    shopCreatedAt: merchant.shopCreatedAt,
    representativeProduct: merchant.representativeProduct,
    representativeOfferTitle: merchant.representativeOfferTitle,
    representativePrice: merchant.representativePrice,
    hasPlatformAftersalesMechanism: merchant.hasPlatformAftersalesMechanism,
  };
}

function compactPublicMerchantsResult(value: PublicMerchantsResult): PublicMerchantsResult {
  return {
    ...value,
    rows: value.rows.map(compactPublicMerchant),
  };
}

function compactPublicProduct(product: ExplorerProductSummary): CanonicalProduct {
  return {
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    platform: product.platform,
    productType: product.productType,
    spec: product.spec,
    summary: product.summary,
    aliases: [],
    updatedAt: product.updatedAt,
  };
}

async function listActiveCanonicalProducts(): Promise<CanonicalProduct[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("canonical_products")
    .select("*")
    .eq("is_active", true)
    .abortSignal(publicSupabaseReadSignal());

  if (error) throw error;

  return (data || []).map(mapCanonicalProduct);
}

function buildDashboard(
  offers: RawOffer[],
  sources: Source[],
  products: CanonicalProduct[],
  configured: boolean,
  options: Pick<DashboardData, "degraded" | "message"> = {},
): DashboardData {
  return {
    generatedAt: new Date().toISOString(),
    configured,
    degraded: options.degraded,
    message: options.message,
    products: buildProductGroups(offers, products),
    sources,
    rawOffers: offers,
  };
}

function toExplorerProductSummary(product: DashboardData["products"][number]): ExplorerProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    platform: product.platform,
    productType: product.productType,
    spec: product.spec,
    summary: product.summary,
    aliases: product.aliases,
    updatedAt: product.updatedAt,
    offerCount: product.offerCount,
    inStockCount: product.inStockCount,
    outOfStockCount: product.outOfStockCount,
    lowestPrice: product.lowestPrice,
    lowestPriceLabel: product.lowestPriceLabel,
    lowestPriceTone: product.lowestPriceTone,
    lowestOffer: compactExplorerOffer(product.lowestOffer),
    warrantyLowestPrice: product.warrantyLowestPrice,
    warrantyLowestOffer: compactExplorerOffer(product.warrantyLowestOffer),
    warrantyOfferCount: product.warrantyOfferCount,
    latestSeenAt: product.latestSeenAt,
    anomalyFlags: product.anomalyFlags,
    offerSearchText: buildOfferSearchText(product.offers),
  };
}

function mapPublicProductSummaryRow(row: Record<string, unknown>): ExplorerProductSummary {
  const lowestOffer = row.lowest_offer && typeof row.lowest_offer === "object"
    ? mapPublicOfferSummary(row.lowest_offer as Record<string, unknown>)
    : null;
  const warrantyLowestOffer = row.warranty_lowest_offer && typeof row.warranty_lowest_offer === "object"
    ? mapPublicOfferSummary(row.warranty_lowest_offer as Record<string, unknown>)
    : null;
  const inStockCount = Number(row.in_stock_count || 0);
  const outOfStockCount = Number(row.out_of_stock_count || 0);
  const hasOutOfStock = Boolean(row.has_out_of_stock);

  return {
    id: String(row.id),
    slug: String(row.slug || row.id),
    displayName: String(row.display_name || row.slug || row.id),
    platform: String(row.platform || "其他"),
    productType: String(row.product_type || "其他"),
    spec: String(row.spec || ""),
    summary: String(row.summary || ""),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    offerCount: Number(row.offer_count || 0),
    inStockCount,
    outOfStockCount,
    lowestPrice: row.lowest_price === null || row.lowest_price === undefined ? null : Number(row.lowest_price),
    lowestPriceLabel: lowestOffer ? "有货" : "暂无有货价",
    lowestPriceTone: lowestOffer ? "good" : "muted",
    lowestOffer,
    warrantyLowestPrice:
      row.warranty_lowest_price === null || row.warranty_lowest_price === undefined
        ? null
        : Number(row.warranty_lowest_price),
    warrantyLowestOffer,
    warrantyOfferCount: Number(row.warranty_offer_count || 0),
    latestSeenAt: row.latest_seen_at ? String(row.latest_seen_at) : null,
    anomalyFlags: [
      ...(hasOutOfStock ? ["缺货"] : []),
      ...(!inStockCount && outOfStockCount ? ["全部缺货"] : []),
    ],
    offerSearchText: toExplorerOfferSearchText(row.offer_search_text),
  };
}

function buildOfferSearchText(offers: RawOffer[]): string {
  const parts = new Set<string>();

  for (const offer of offers) {
    if (parts.size >= 10) break;
    [offer.sourceTitle, offer.sourceName, offer.sourceStoreName || ""]
      .filter(Boolean)
      .forEach((value) => parts.add(value));
  }

  return toExplorerOfferSearchText(Array.from(parts).join(" "));
}

function toExplorerOfferSearchText(value: unknown): string {
  return truncateJsonSafeString(value, EXPLORER_OFFER_SEARCH_TEXT_MAX_LENGTH);
}

function truncateJsonSafeString(value: unknown, maxLength: number): string {
  const text = String(value || "");
  let output = "";

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) continue;

    let char = text.charAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) continue;
      char = text.slice(index, index + 2);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    if (output.length + char.length > maxLength) break;
    output += char;
  }

  return output;
}

function compactExplorerOffer(offer: RawOffer | null): PublicOfferSummary | null {
  if (!offer) return null;

  return {
    id: offer.id,
    sourceId: offer.sourceId,
    sourceName: offer.sourceName,
    sourceStoreName: offer.sourceStoreName,
    collectorKind: offer.collectorKind,
    sourceTitle: offer.sourceTitle,
    price: offer.price,
    currency: offer.currency,
    status: offer.status,
    url: offer.url,
  };
}

function mapPublicOfferSummary(row: Record<string, unknown>): PublicOfferSummary {
  return {
    id: String(row.id),
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: String(row.source_name || ""),
    sourceStoreName: row.source_store_name ? String(row.source_store_name) : null,
    collectorKind: normalizeSourceCollectorKind(row.collector_kind),
    sourceTitle: String(row.source_title || ""),
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    currency: String(row.currency || "CNY"),
    status: String(row.status || "unknown") as RawOffer["status"],
    url: String(row.url || ""),
  };
}

function resolveExplorerProduct(
  offer: RawOffer,
  products: ExplorerProductSummary[],
): ExplorerProductSummary {
  const classified = resolveOfferProduct(offer, products);
  return products.find((item) => item.id === classified.id) || products.find((item) => item.id === "other-product") || products[0];
}

function isOfferAvailableForPublicList(offer: RawOffer): boolean {
  if (offer.status === "out_of_stock") return false;
  if (typeof offer.price !== "number" || !Number.isFinite(offer.price)) return false;
  if (!offer.url) return false;
  if (offer.effectiveStatus && ["unavailable", "stale", "failed"].includes(offer.effectiveStatus)) return false;
  if (offer.freshnessStatus && ["expired", "failed"].includes(offer.freshnessStatus)) return false;
  if (offer.expiresAt) {
    const timestamp = new Date(offer.expiresAt).getTime();
    if (Number.isFinite(timestamp) && timestamp <= Date.now()) return false;
  }

  return true;
}

function comparePublicOffers(a: RawOffer, b: RawOffer): number {
  const availableDelta = Number(isOfferAvailableForPublicList(b)) - Number(isOfferAvailableForPublicList(a));
  if (availableDelta !== 0) return availableDelta;

  const sharedAccessDelta = Number(isSharedAccessOffer(a)) - Number(isSharedAccessOffer(b));
  if (isOfferAvailableForPublicList(a) && isOfferAvailableForPublicList(b) && sharedAccessDelta !== 0) return sharedAccessDelta;

  const telegramStarsDelta = Number(isTelegramStarsOffer(a)) - Number(isTelegramStarsOffer(b));
  if (isOfferAvailableForPublicList(a) && isOfferAvailableForPublicList(b) && telegramStarsDelta !== 0) return telegramStarsDelta;

  const priceDelta = (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
  if (priceDelta !== 0) return priceDelta;

  const timestampDelta = compareText(offerTimestamp(b) || "", offerTimestamp(a) || "");
  if (timestampDelta !== 0) return timestampDelta;

  const sourceDelta = compareText(sourceLabel(a), sourceLabel(b));
  if (sourceDelta !== 0) return sourceDelta;

  const titleDelta = compareText(a.sourceTitle, b.sourceTitle);
  if (titleDelta !== 0) return titleDelta;

  const urlDelta = compareText(a.url, b.url);
  if (urlDelta !== 0) return urlDelta;

  return compareText(a.id, b.id);
}

function shouldExcludeDefaultTelegramStars(productId: string, filterTags: OfferFilterTagId[]): boolean {
  return productId === "telegram-premium" && !filterTags.includes("telegram_stars");
}

function comparePublicOfferFallback(a: RawOffer, b: RawOffer): number {
  const sourceDelta = compareText(sourceLabel(a), sourceLabel(b));
  if (sourceDelta !== 0) return sourceDelta;

  const titleDelta = compareText(a.sourceTitle, b.sourceTitle);
  if (titleDelta !== 0) return titleDelta;

  return compareText(a.id, b.id);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function offerTimestamp(offer: RawOffer): string | null | undefined {
  return offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt;
}

function sourceLabel(offer: RawOffer): string {
  return offer.sourceStoreName || offer.sourceName || "未记录渠道";
}

function publicMerchantGroupKey(offer: RawOffer): string {
  if (offer.sourceId) return `source:${offer.sourceId}`;
  return `fallback:${offer.collectorKind || "unknown"}:${sourceLabel(offer)}:${offerHost(offer.url) || offer.sourceName}`;
}

function comparePublicMerchants(a: PublicMerchantSummary, b: PublicMerchantSummary): number {
  const availableDelta = b.inStockCount - a.inStockCount;
  if (availableDelta !== 0) return availableDelta;

  const warrantyDelta = b.warrantyLowestHitCount - a.warrantyLowestHitCount;
  if (warrantyDelta !== 0) return warrantyDelta;

  const lowestDelta = b.lowestHitCount - a.lowestHitCount;
  if (lowestDelta !== 0) return lowestDelta;

  const aftersalesDelta = Number(b.hasPlatformAftersalesMechanism) - Number(a.hasPlatformAftersalesMechanism);
  if (aftersalesDelta !== 0) return aftersalesDelta;

  const latestDelta = (b.latestSeenAt || "").localeCompare(a.latestSeenAt || "");
  if (latestDelta !== 0) return latestDelta;

  const coverageDelta = b.productCount - a.productCount;
  if (coverageDelta !== 0) return coverageDelta;

  const riskDelta = a.riskFeedbackCount - b.riskFeedbackCount;
  if (riskDelta !== 0) return riskDelta;

  return a.name.localeCompare(b.name, "zh-CN");
}

function arrayFromRow(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function offerHost(value: string | null | undefined): string | null {
  const raw = String(value || "");
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "") || null;
  }
}

function inferShopUrlFromOfferUrl(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return url.origin;
    if (/^\/shop\/[^/]+$/i.test(path)) return `${url.origin}${path}`;
    return null;
  } catch {
    return null;
  }
}

function inferMerchantShopUrl({
  sourceId,
  sourceName,
  entryUrl,
  host,
}: {
  sourceId?: string | null;
  sourceName?: string | null;
  entryUrl?: string | null;
  host?: string | null;
}): string | null {
  const explicit = inferShopUrlFromOfferUrl(entryUrl);
  if (explicit) return explicit;

  const parsedHost = offerHost(entryUrl) || host;
  if (parsedHost !== "pay.ldxp.cn" && parsedHost !== "ldxp.cn") return null;

  const idMatch = String(sourceId || "").match(/^ldxp-([^/]+)$/i);
  const nameMatch = String(sourceName || "").match(/LDXP\s*\/\s*([^/\s]+)/i);
  const token = (idMatch?.[1] || nameMatch?.[1] || "").trim();
  if (!token || token === "cn") return null;

  return `https://pay.ldxp.cn/shop/${encodeURIComponent(token)}`;
}

function dedupePublicOffers(offers: RawOffer[]): RawOffer[] {
  const selected = new Map<string, RawOffer>();

  for (const offer of offers) {
    const key = publicOfferDedupeKey(offer);
    const existing = selected.get(key);
    if (!existing || comparePublicOfferKeepPriority(offer, existing) < 0) {
      selected.set(key, offer);
    }
  }

  return Array.from(selected.values());
}

function comparePublicOfferKeepPriority(a: RawOffer, b: RawOffer): number {
  const availableDelta = Number(isOfferAvailableForPublicList(b)) - Number(isOfferAvailableForPublicList(a));
  if (availableDelta !== 0) return availableDelta;

  const priorityDelta = (b.sourcePriority ?? 0) - (a.sourcePriority ?? 0);
  if (priorityDelta !== 0) return priorityDelta;

  const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
  if (confidenceDelta !== 0) return confidenceDelta;

  const timestampDelta = compareText(offerTimestamp(b) || "", offerTimestamp(a) || "");
  if (timestampDelta !== 0) return timestampDelta;

  const sourceDelta = compareText(sourceLabel(a), sourceLabel(b));
  if (sourceDelta !== 0) return sourceDelta;

  const titleDelta = compareText(a.sourceTitle, b.sourceTitle);
  if (titleDelta !== 0) return titleDelta;

  const urlDelta = compareText(a.url, b.url);
  if (urlDelta !== 0) return urlDelta;

  return compareText(a.id, b.id);
}

export function mapSource(row: Record<string, unknown>): Source {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    baseUrl: row.base_url ? String(row.base_url) : null,
    entryUrl: String(row.entry_url || row.base_url || ""),
    collectionMethod: String(row.collection_method || "manual") as Source["collectionMethod"],
    collectorKind: normalizeSourceCollectorKind(row.collector_kind),
    enabled: Boolean(row.enabled),
    notes: row.notes ? String(row.notes) : null,
    healthStatus: row.health_status ? String(row.health_status) as Source["healthStatus"] : null,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    consecutiveFailures:
      row.consecutive_failures === null || row.consecutive_failures === undefined
        ? null
        : Number(row.consecutive_failures),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    shopCreatedAt: row.shop_created_at ? String(row.shop_created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function normalizeSourceCollectorKind(value: unknown): Source["collectorKind"] {
  return normalizeCollectorKind(value);
}

export function mapRawOffer(row: Record<string, unknown>): RawOffer {
  const sourceTitle = String(row.source_title || "");
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  const storedCanonicalProductId = row.canonical_product_id ? String(row.canonical_product_id) : null;
  const storedCategorySlug = row.category_slug ? String(row.category_slug) : null;
  const classified = classifyOffer(sourceTitle, {
    tags,
    categorySlug: storedCategorySlug,
    price,
  });
  const filterTags = deriveOfferFilterTags({ sourceTitle, tags });

  return {
    id: String(row.id),
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: String(row.source_name || ""),
    sourceStoreName: row.source_store_name ? String(row.source_store_name) : null,
    collectorKind: normalizeSourceCollectorKind(row.collector_kind),
    sourceTitle,
    price,
    listedPrice: row.listed_price === null || row.listed_price === undefined ? null : Number(row.listed_price),
    feeAmount: row.fee_amount === null || row.fee_amount === undefined ? null : Number(row.fee_amount),
    priceBasis: row.price_basis ? String(row.price_basis) as RawOffer["priceBasis"] : null,
    currency: String(row.currency || "CNY"),
    status: String(row.status || "unknown") as RawOffer["status"],
    url: String(row.url || ""),
    tags,
    filterTags,
    stockCount: row.stock_count === null || row.stock_count === undefined ? null : Number(row.stock_count),
    hidden: Boolean(row.hidden),
    canonicalProductId: classified.id,
    categorySlug: classified.platform,
    storedCanonicalProductId,
    storedCategorySlug,
    capturedAt: row.captured_at ? String(row.captured_at) : null,
    sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    sourcePriority:
      row.source_priority === null || row.source_priority === undefined
        ? null
        : Number(row.source_priority),
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    effectiveStatus: row.effective_status ? String(row.effective_status) as RawOffer["effectiveStatus"] : null,
    freshnessStatus: row.freshness_status ? String(row.freshness_status) as RawOffer["freshnessStatus"] : null,
    lastFailedAt: row.last_failed_at ? String(row.last_failed_at) : null,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
  };
}

export function mapCanonicalProduct(row: Record<string, unknown>): CanonicalProduct {
  return {
    id: String(row.id),
    slug: String(row.slug || row.id),
    displayName: String(row.display_name || row.slug || row.id),
    platform: String(row.platform || "其他"),
    productType: String(row.product_type || "其他"),
    spec: String(row.spec || ""),
    summary: String(row.summary || ""),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapCrawlRun(row: Record<string, unknown>): CrawlRun {
  return {
    id: String(row.id),
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    mode: String(row.mode || "manual") as CrawlRun["mode"],
    status: String(row.status || "failed") as CrawlRun["status"],
    startedAt: String(row.started_at || new Date().toISOString()),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    successCount: Number(row.success_count || 0),
    failureCount: Number(row.failure_count || 0),
    message: row.message ? String(row.message) : null,
    details:
      row.details && typeof row.details === "object"
        ? (row.details as Record<string, unknown>)
        : null,
  };
}

function mapCollectionJob(row: Record<string, unknown>): CollectionJob {
  return {
    id: String(row.id),
    jobType: String(row.job_type || "source") as CollectionJob["jobType"],
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    status: String(row.status || "pending") as CollectionJob["status"],
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    lockedBy: row.locked_by ? String(row.locked_by) : null,
    lockedUntil: row.locked_until ? String(row.locked_until) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    result:
      row.result && typeof row.result === "object"
        ? (row.result as Record<string, unknown>)
        : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}
