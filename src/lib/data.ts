import "server-only";

import { ADMIN_MANUAL_HIDE_REASON_PREFIX, listOfferFeedback, listSiteFeedback, listSubmissions } from "./admin";
import { notifyOperationalIssue } from "./alerts";
import { getApiTransitAdminData, getEmptyApiTransitAdminData } from "./api-transit-admin";
import { buildProductGroups, canonicalCatalog, comparePlatformOrder, resolveOfferProduct } from "./catalog";
import { isSupabaseConfigured } from "./env";
import { getApiModelAdminData } from "./api-models-db";
import { normalizeCollectorKind } from "./collector-registry";
import { getOfficialSubscriptionAdminData } from "./official-prices-db";
import {
  buildOfferFilterFacets,
  deriveOfferFilterTags,
  OFFER_FILTER_TAGS,
  offerMatchesFilterTags,
  parseOfferFilterTags,
  type OfferFilterTagFacet,
  type OfferFilterTagId,
} from "./offer-filter-tags";
import { seedRawOffers, seedSources } from "./sample-data";
import { getSupabaseServerClient } from "./supabase";
import type {
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
  ProductGroup,
  RawOffer,
  Source,
  SourceOfferStats,
} from "./types";

const PUBLIC_OFFER_LIMIT = 1200;
const SUPABASE_PAGE_SIZE = 1000;
const PUBLIC_FALLBACK_MAX_ROWS = 5000;
const PUBLIC_DATA_CACHE_TTL_MS = 120_000;
const EXPLORER_DATA_CACHE_TTL_MS = 120_000;
const PRODUCT_OFFERS_CACHE_TTL_MS = 120_000;
const DASHBOARD_DATA_CACHE_TTL_MS = 30_000;
const ADMIN_DATA_CACHE_TTL_MS = 120_000;
const ADMIN_OFFER_SAMPLE_LIMIT = 80;
const RAW_OFFER_PUBLIC_SELECT = [
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
].join(",");

type PublicOfferData = {
  configured: boolean;
  degraded?: boolean;
  message?: string | null;
  generatedAt: string;
  offers: RawOffer[];
  products: CanonicalProduct[];
};

const DATA_UNAVAILABLE_MESSAGE = "真实报价数据暂时不可用，请稍后刷新。";

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

let publicOfferDataCache: { expiresAt: number; value: PublicOfferData } | null = null;
let publicOfferDataPromise: Promise<PublicOfferData> | null = null;
let explorerDataCache: { expiresAt: number; value: ExplorerData } | null = null;
let explorerDataPromise: Promise<ExplorerData> | null = null;
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
};

export function clearPublicDataCache(): void {
  publicOfferDataCache = null;
  publicOfferDataPromise = null;
  explorerDataCache = null;
  explorerDataPromise = null;
  dashboardDataCache = null;
  dashboardDataPromise = null;
  clearAdminDataCache();
  productOffersCache.clear();
  productOfferFacetsCache.clear();
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
      dashboardDataCache = {
        expiresAt: Date.now() + DASHBOARD_DATA_CACHE_TTL_MS,
        value,
      };
      return value;
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
    const offers = offerRows.map(mapRawOffer);
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
      .range(from, to);

    if (error) throw error;

    const batch = (data || []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
}

async function readPublicOfferData(): Promise<PublicOfferData> {
  const now = Date.now();
  if (publicOfferDataCache && publicOfferDataCache.expiresAt > now) {
    return publicOfferDataCache.value;
  }

  if (publicOfferDataPromise) return publicOfferDataPromise;

  publicOfferDataPromise = loadPublicOfferData()
    .then((value) => {
      publicOfferDataCache = {
        expiresAt: Date.now() + PUBLIC_DATA_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      publicOfferDataPromise = null;
    });

  return publicOfferDataPromise;
}

async function loadPublicOfferData(): Promise<PublicOfferData> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      configured: false,
      degraded: false,
      generatedAt: new Date().toISOString(),
      offers: seedRawOffers.filter((offer) => !offer.hidden),
      products: canonicalCatalog,
    };
  }

  try {
    const [offerRows, products] = await Promise.all([
      listVisibleRawOfferRows(),
      listActiveCanonicalProducts(),
    ]);

    return {
      configured: true,
      generatedAt: new Date().toISOString(),
      offers: offerRows.map(mapRawOffer),
      products: products.length ? products : canonicalCatalog,
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
  if (explorerDataCache && explorerDataCache.expiresAt > now) {
    return explorerDataCache.value;
  }

  if (explorerDataPromise) return explorerDataPromise;

  explorerDataPromise = buildExplorerData()
    .then((value) => {
      explorerDataCache = {
        expiresAt: Date.now() + EXPLORER_DATA_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      explorerDataPromise = null;
    });

  return explorerDataPromise;
}

async function buildExplorerData(): Promise<ExplorerData> {
  const rpcData = await getExplorerDataFromDatabase();
  if (rpcData) return rpcData;

  const publicData = await readPublicOfferData();
  const products = buildProductGroups(publicData.offers, publicData.products);

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

  const { data, error } = await supabase.rpc("list_public_product_summaries");
  if (error) {
    console.error("Product summary RPC failed:", error.message);
    return null;
  }

  const rows = ((data || []) as unknown as Record<string, unknown>[]);
  return {
    generatedAt: new Date().toISOString(),
    configured: true,
    degraded: false,
    message: null,
    products: rows.map(mapPublicProductSummaryRow),
    sources: [],
    offerTotal: rows.reduce((sum, row) => sum + Number(row.offer_count || 0), 0),
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
    .select(RAW_OFFER_PUBLIC_SELECT, { count: "exact" });

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

async function readAdminSummary(): Promise<AdminSummary> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const dashboard = await getDashboardData();
    const adminDashboard = toAdminDashboardData(dashboard, dashboard.rawOffers.length);
    const [officialPrices, apiModels, apiTransit] = await Promise.all([
      getOfficialSubscriptionAdminData(),
      getApiModelAdminData(),
      getApiTransitAdminData({ isAuthenticated: true }),
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
  };
}

function toAdminDashboardData(dashboard: DashboardData, rawOfferTotal: number): DashboardData {
  return {
    ...dashboard,
    products: dashboard.products.map(stripProductOffersForAdmin),
    rawOffers: dashboard.rawOffers.slice(0, Math.min(rawOfferTotal, ADMIN_OFFER_SAMPLE_LIMIT)),
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
  const downNodes = nodeSummaries.filter((node) => node.health === "down").length;
  const staleNodes = nodeSummaries.filter((node) => node.health === "stale").length;
  const onlineNodes = nodeSummaries.filter((node) => node.health === "online" || node.health === "quiet").length;
  const overallStatus =
    criticalSources > 0 || downNodes > 0
      ? "critical"
      : staleSources > 0 || staleNodes > 0 || agingSources > 0
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
    });
  }

  for (const run of recentRuns) {
    if (map.has(run.node.id)) continue;
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
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const riskOrder = { down: 4, stale: 3, quiet: 2, unknown: 1, online: 0 };
    const riskDiff = riskOrder[b.health] - riskOrder[a.health];
    if (riskDiff) return riskDiff;
    return (b.ageMinutes ?? 999999) - (a.ageMinutes ?? 999999);
  });
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
  if (!rpcError) {
    return ((rpcData || []) as Array<Record<string, unknown>>).map((row) => ({
      sourceId: String(row.source_id || ""),
      visibleCount: Number(row.visible_count || 0),
      hiddenCount: Number(row.hidden_count || 0),
      manuallyHiddenCount: Number(row.manually_hidden_count || 0),
      totalCount: Number(row.total_count || 0),
    })).filter((row) => row.sourceId);
  }
  console.warn("Falling back to raw source offer stats because RPC failed:", rpcError.message);

  const rows: Array<Pick<RawOffer, "sourceId" | "hidden" | "failureReason">> = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("raw_offers")
      .select("source_id,hidden,failure_reason")
      .range(from, to);

    if (error) throw error;

    rows.push(
      ...(data || []).map((row) => ({
        sourceId: row.source_id ? String(row.source_id) : null,
        hidden: Boolean(row.hidden),
        failureReason: row.failure_reason ? String(row.failure_reason) : null,
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
      .select(RAW_OFFER_PUBLIC_SELECT)
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
      .select(RAW_OFFER_PUBLIC_SELECT)
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
      .select(RAW_OFFER_PUBLIC_SELECT)
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
  const summary = await getPublicProductSummaryFromDatabase(id);
  if (summary) return summary;

  const explorerData = await getExplorerData();
  const product = explorerData.products.find((item) => item.id === id || item.slug === id);
  if (product) return product;

  const catalogProduct = canonicalCatalog.find((item) => item.id === id || item.slug === id);
  return catalogProduct ? toExplorerProductSummary(makeEmptyProductGroup(catalogProduct)) : null;
}

async function getPublicProductSummaryFromDatabase(id: string): Promise<ExplorerProductSummary | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_public_product_summary", {
    p_product_key: id,
  });

  if (error) {
    console.warn("Falling back to explorer product summary because RPC failed:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : null;
  if (!row) return null;

  return mapPublicProductSummaryRow(row);
}

export async function listPublicProductOffers(id: string, filters: ProductOfferListFilters = {}) {
  const limit = Math.min(Math.max(filters.limit || 80, 1), PUBLIC_OFFER_LIMIT);
  const offset = Math.max(filters.offset || 0, 0);
  const filterTags = parseOfferFilterTags(filters.filterTags || []);
  const query = normalizeProductOfferQuery(filters.query);
  const excludeQuery = normalizeProductOfferQuery(filters.excludeQuery, 160);
  const cacheKey = `${id}:${limit}:${offset}:${filterTags.join(",") || "all"}:${query || "none"}:${excludeQuery || "none"}:offer-filter-v3`;
  const now = Date.now();
  const cached = productOffersCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loadPublicProductOffers(id, { limit, offset, filterTags, query, excludeQuery });
  productOffersCache.set(cacheKey, {
    expiresAt: Date.now() + PRODUCT_OFFERS_CACHE_TTL_MS,
    value,
  });

  if (productOffersCache.size > 120) {
    const expiredAt = Date.now();
    for (const [key, entry] of productOffersCache) {
      if (entry.expiresAt <= expiredAt || productOffersCache.size > 120) {
        productOffersCache.delete(key);
      }
    }
  }

  return value;
}

async function loadPublicProductOffers(
  id: string,
  filters: Required<Pick<ProductOfferListFilters, "limit" | "offset">> & {
    filterTags: OfferFilterTagId[];
    query: string;
    excludeQuery: string;
  },
) {
  const rpcData = await getPublicProductOffersFromDatabase(id, filters);
  if (rpcData) return rpcData;

  const { limit, offset, filterTags, query, excludeQuery } = filters;
  const excludeTerms = parseProductOfferKeywords(excludeQuery);
  const publicData = await readPublicOfferData();
  const products = publicData.products.length ? publicData.products : canonicalCatalog;
  const product =
    products.find((item) => item.id === id || item.slug === id) ||
    canonicalCatalog.find((item) => item.id === id || item.slug === id);

  if (!product) {
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

  const productOffers = publicData.offers
    .filter((offer) => resolveOfferProduct(offer, products).id === product.id)
    .sort(comparePublicOffers);
  const offers = productOffers
    .filter((offer) => offerMatchesFilterTags(offer, filterTags))
    .filter((offer) => offerMatchesProductOfferQuery(offer, query))
    .filter((offer) => offerMatchesProductOfferExcludeQuery(offer, excludeTerms));
  const total = offers.length;
  const page = offers.slice(offset, offset + limit);

  return {
    offers: page,
    total,
    filterFacets: buildOfferFilterFacets(productOffers),
    activeFilterTags: filterTags,
    limited: total > offset + limit,
    generatedAt: publicData.generatedAt,
    degraded: publicData.degraded,
    message: publicData.message,
  };
}

async function getPublicProductOffersFromDatabase(
  id: string,
  filters: Required<Pick<ProductOfferListFilters, "limit" | "offset">> & {
    filterTags: OfferFilterTagId[];
    query: string;
    excludeQuery: string;
  },
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const filterFacetsPromise = getPublicProductOfferFilterFacetsFromDatabase(id);
  const hasServerFilters = filters.filterTags.length > 0 || filters.query.length > 0 || filters.excludeQuery.length > 0;
  const rpcName = hasServerFilters
    ? "list_public_product_offers_page_v2"
    : "list_public_product_offers_page";
  const params = hasServerFilters
    ? {
        p_product_id: id,
        p_filter_tags: filters.filterTags,
        p_query: filters.query || null,
        p_exclude_query: filters.excludeQuery || null,
        p_limit: filters.limit,
        p_offset: filters.offset,
      }
    : {
        p_product_id: id,
        p_limit: filters.limit,
        p_offset: filters.offset,
      };
  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    console.error("Product offers RPC failed:", error.message);
    return null;
  }

  const filterFacets = await filterFacetsPromise ?? [];
  const rows = ((data || []) as unknown as Record<string, unknown>[]);
  const offers = rows.map(mapRawOffer);
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

async function getPublicProductOfferFilterFacetsFromDatabase(id: string): Promise<OfferFilterTagFacet[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const cacheKey = `facets:${id}`;
  const now = Date.now();
  const cached = productOfferFacetsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data, error } = await supabase.rpc("list_public_product_offer_filter_facets", {
    p_product_id: id,
  });

  if (error) {
    console.warn("Product offer filter facet RPC failed:", error.message);
    return null;
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const counts = new Map(rows.map((row) => [String(row.tag_id), Number(row.offer_count || 0)]));

  const facets = buildOfferFilterFacetsFromCounts(counts);
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
  const rpcData = await listPublicOffersFromDatabase(filters);
  if (rpcData) return rpcData;

  const publicData = await readPublicOfferData();
  const productGroups = buildProductGroups(publicData.offers, publicData.products).map(toExplorerProductSummary);
  const normalizedQuery = (filters.query || "").trim().toLowerCase();
  const limit = Math.min(Math.max(filters.limit || 80, 1), PUBLIC_OFFER_LIMIT);
  const offset = Math.max(filters.offset || 0, 0);

  let rows = publicData.offers
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

  const limit = Math.min(Math.max(filters.limit || 80, 1), PUBLIC_OFFER_LIMIT);
  const offset = Math.max(filters.offset || 0, 0);
  const { data, error } = await supabase.rpc("list_public_offers_page", {
    p_query: filters.query || null,
    p_platform: filters.platform || null,
    p_product_type: filters.productType || null,
    p_stock: filters.stock || null,
    p_sort: filters.sort || null,
    p_min_price: filters.minPrice ?? null,
    p_max_price: filters.maxPrice ?? null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("Public offers RPC failed:", error.message);
    return null;
  }

  const rows = ((data || []) as unknown as PublicOfferPageRow[]);
  const total = rows.length ? Number(rows[0].total_count || rows.length) : 0;

  return {
    rows: rows.map((row) => ({
      offer: compactPublicOffer(mapRawOffer(row)),
      product: compactPublicProduct(mapPublicOfferProductRow(row)),
    })),
    total,
    limited: total > offset + limit,
    generatedAt: new Date().toISOString(),
    degraded: false,
    message: null,
  };
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

function mapPublicOfferProductRow(row: PublicOfferPageRow): ExplorerProductSummary {
  return {
    id: String(row.product_id || row.canonical_product_id || "other-product"),
    slug: String(row.product_slug || row.product_id || row.canonical_product_id || "other-product"),
    displayName: String(row.product_display_name || row.product_slug || row.product_id || "其他商品"),
    platform: String(row.product_platform || row.category_slug || "其他"),
    productType: String(row.product_type || "其他"),
    spec: String(row.product_spec || ""),
    summary: String(row.product_summary || ""),
    aliases: [],
    updatedAt: row.product_updated_at ? String(row.product_updated_at) : null,
    offerCount: Number(row.total_count || 0),
    inStockCount: 0,
    outOfStockCount: 0,
    lowestPrice: null,
    lowestPriceLabel: "",
    lowestPriceTone: "muted",
    lowestOffer: null,
    latestSeenAt: null,
    anomalyFlags: [],
    offerSearchText: "",
  };
}

async function listActiveCanonicalProducts(): Promise<CanonicalProduct[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("canonical_products")
    .select("*")
    .eq("is_active", true);

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
    lowestOffer: product.lowestOffer,
    latestSeenAt: product.latestSeenAt,
    anomalyFlags: product.anomalyFlags,
    offerSearchText: buildOfferSearchText(product.offers),
  };
}

function mapPublicProductSummaryRow(row: Record<string, unknown>): ExplorerProductSummary {
  const lowestOffer = row.lowest_offer && typeof row.lowest_offer === "object"
    ? mapRawOffer(row.lowest_offer as Record<string, unknown>)
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
    latestSeenAt: row.latest_seen_at ? String(row.latest_seen_at) : null,
    anomalyFlags: [
      ...(hasOutOfStock ? ["缺货"] : []),
      ...(!inStockCount && outOfStockCount ? ["全部缺货"] : []),
    ],
    offerSearchText: "",
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

  return Array.from(parts).join(" ").slice(0, 1000);
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
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function normalizeSourceCollectorKind(value: unknown): Source["collectorKind"] {
  return normalizeCollectorKind(value);
}

export function mapRawOffer(row: Record<string, unknown>): RawOffer {
  const sourceTitle = String(row.source_title || "");
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  const filterTags =
    Array.isArray(row.filter_tags)
      ? row.filter_tags.map(String)
      : Array.isArray(row.public_filter_tags)
        ? row.public_filter_tags.map(String)
        : deriveOfferFilterTags({ sourceTitle, tags });

  return {
    id: String(row.id),
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: String(row.source_name || ""),
    sourceStoreName: row.source_store_name ? String(row.source_store_name) : null,
    sourceTitle,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    currency: String(row.currency || "CNY"),
    status: String(row.status || "unknown") as RawOffer["status"],
    url: String(row.url || ""),
    tags,
    filterTags,
    stockCount: row.stock_count === null || row.stock_count === undefined ? null : Number(row.stock_count),
    hidden: Boolean(row.hidden),
    canonicalProductId: row.canonical_product_id ? String(row.canonical_product_id) : null,
    categorySlug: row.category_slug ? String(row.category_slug) : null,
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
