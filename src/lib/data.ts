import "server-only";

import { ADMIN_MANUAL_HIDE_REASON_PREFIX, listSubmissions } from "./admin";
import { buildProductGroups, canonicalCatalog, resolveOfferProduct } from "./catalog";
import { isSupabaseConfigured } from "./env";
import { seedRawOffers, seedSources } from "./sample-data";
import { getSupabaseServerClient } from "./supabase";
import type {
  AdminSummary,
  CanonicalProduct,
  CrawlRun,
  DashboardData,
  ExplorerData,
  ExplorerProductSummary,
  RawOffer,
  Source,
  SourceOfferStats,
} from "./types";

const PUBLIC_OFFER_LIMIT = 1200;
const SUPABASE_PAGE_SIZE = 1000;
const PUBLIC_DATA_CACHE_TTL_MS = 10_000;
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
  generatedAt: string;
  offers: RawOffer[];
  products: CanonicalProduct[];
};

let publicOfferDataCache: { expiresAt: number; value: PublicOfferData } | null = null;
let publicOfferDataPromise: Promise<PublicOfferData> | null = null;

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

type ProductOfferListFilters = {
  limit?: number;
  offset?: number;
};

export async function getDashboardData(): Promise<DashboardData> {
  return readDashboardData();
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
    console.warn("Falling back to seed data because Supabase read failed:", error);
    return buildDashboard(seedRawOffers, seedSources, canonicalCatalog, isSupabaseConfigured());
  }
}

async function listVisibleRawOfferRows(): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
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
    console.warn("Falling back to seed public offers because Supabase read failed:", error);
    return {
      configured: isSupabaseConfigured(),
      generatedAt: new Date().toISOString(),
      offers: seedRawOffers.filter((offer) => !offer.hidden),
      products: canonicalCatalog,
    };
  }
}

export async function getExplorerData(): Promise<ExplorerData> {
  const publicData = await readPublicOfferData();
  const products = buildProductGroups(publicData.offers, publicData.products);

  return {
    generatedAt: publicData.generatedAt,
    configured: publicData.configured,
    products: products.map(toExplorerProductSummary),
    sources: [],
    offerTotal: publicData.offers.length,
  };
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const dashboard = await getDashboardData();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      ...dashboard,
      crawlRuns: [],
      pendingSubmissions: [],
      sourceOfferStats: [],
      hiddenRawOffers: [],
    };
  }

  const [{ data, error }, pendingSubmissions, sourceOfferStats, hiddenRawOffers] = await Promise.all([
    supabase
      .from("crawl_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30),
    listSubmissions("pending").catch(() => []),
    listSourceOfferStats().catch(() => []),
    listAdminHiddenRawOfferRows().then((rows) => rows.map(mapRawOffer)).catch(() => []),
  ]);

  if (error) {
    return {
      ...dashboard,
      crawlRuns: [],
      pendingSubmissions,
      sourceOfferStats,
      hiddenRawOffers,
    };
  }

  return {
    ...dashboard,
    crawlRuns: (data || []).map(mapCrawlRun),
    pendingSubmissions,
    sourceOfferStats,
    hiddenRawOffers,
  };
}

async function listSourceOfferStats(): Promise<SourceOfferStats[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

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

async function listAdminHiddenRawOfferRows(): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("raw_offers")
      .select("*")
      .eq("hidden", true)
      .ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
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
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      const products = await listActiveCanonicalProducts();
      const product =
        products.find((item) => item.id === id || item.slug === id) ||
        canonicalCatalog.find((item) => item.id === id || item.slug === id);

      if (!product) return null;

      const { data: offerRows, error: offerError } = await supabase
        .from("raw_offers")
        .select(RAW_OFFER_PUBLIC_SELECT)
        .eq("hidden", false)
        .eq("canonical_product_id", product.id)
        .order("price", { ascending: true, nullsFirst: false })
        .limit(PUBLIC_OFFER_LIMIT);
      if (offerError) throw offerError;

      const offers = ((offerRows || []) as unknown as Record<string, unknown>[])
        .map(mapRawOffer)
        .filter((offer) => resolveOfferProduct(offer, products.length ? products : canonicalCatalog).id === product.id);
      const [group] = buildProductGroups(offers, [product]);

      if (group) return toExplorerProductSummary(group);
    } catch (error) {
      console.warn("Falling back to cached product summary because Supabase read failed:", error);
    }
  }

  const product = await getPublicProductGroup(id);
  return product ? toExplorerProductSummary(product) : null;
}

export async function listPublicProductOffers(id: string, filters: ProductOfferListFilters = {}) {
  const supabase = getSupabaseServerClient();
  const limit = Math.min(Math.max(filters.limit || 80, 1), PUBLIC_OFFER_LIMIT);
  const offset = Math.max(filters.offset || 0, 0);

  if (supabase) {
    try {
      const products = await listActiveCanonicalProducts();
      const product =
        products.find((item) => item.id === id || item.slug === id) ||
        canonicalCatalog.find((item) => item.id === id || item.slug === id);

      if (!product) {
        return {
          offers: [],
          total: 0,
          generatedAt: new Date().toISOString(),
        };
      }

      const { data: offerRows, error: offerError, count } = await supabase
        .from("raw_offers")
        .select(RAW_OFFER_PUBLIC_SELECT, { count: "exact" })
        .eq("hidden", false)
        .eq("canonical_product_id", product.id)
        .order("status", { ascending: true })
        .order("price", { ascending: true, nullsFirst: false })
        .order("verified_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      if (offerError) throw offerError;

      const offers = ((offerRows || []) as unknown as Record<string, unknown>[])
        .map(mapRawOffer)
        .filter((offer) => resolveOfferProduct(offer, products.length ? products : canonicalCatalog).id === product.id)
        .sort(comparePublicOffers);

      return {
        offers,
        total: count ?? offset + offers.length,
        limited: (count ?? 0) > offset + limit,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("Falling back to cached product offers because Supabase read failed:", error);
    }
  }

  const product = await getPublicProductGroup(id);
  const offers = (product?.offers ?? []).filter(
    (offer) => product && resolveOfferProduct(offer, canonicalCatalog).id === product.id,
  );
  const total = offers.length;
  const page = offers.slice(offset, offset + limit);

  return {
    offers: page,
    total,
    limited: total > offset + limit,
    generatedAt: new Date().toISOString(),
  };
}

export async function listPublicOffers(filters: OfferListFilters = {}) {
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
    if (filters.sort === "updated") {
      return (offerTimestamp(b.offer) || "").localeCompare(offerTimestamp(a.offer) || "");
    }

    if (filters.sort === "channels") {
      return sourceLabel(a.offer).localeCompare(sourceLabel(b.offer), "zh-CN");
    }

    if (filters.sort === "price") {
      return (a.offer.price ?? Number.MAX_SAFE_INTEGER) - (b.offer.price ?? Number.MAX_SAFE_INTEGER);
    }

    return comparePublicOffers(a.offer, b.offer);
  });

  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    limited: rows.length > offset + limit,
    generatedAt: publicData.generatedAt,
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
): DashboardData {
  return {
    generatedAt: new Date().toISOString(),
    configured,
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

function buildOfferSearchText(offers: RawOffer[]): string {
  const parts = new Set<string>();

  for (const offer of offers) {
    if (parts.size >= 24) break;
    [offer.sourceTitle, offer.sourceName, offer.sourceStoreName || ""]
      .filter(Boolean)
      .forEach((value) => parts.add(value));
  }

  return Array.from(parts).join(" ").slice(0, 3000);
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

  return (offerTimestamp(b) || "").localeCompare(offerTimestamp(a) || "");
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
    collectorKind: normalizeCollectorKind(row.collector_kind),
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

function normalizeCollectorKind(value: unknown): Source["collectorKind"] {
  if (
    value === "auto" ||
    value === "kami" ||
    value === "dujiao" ||
    value === "shopApi" ||
    value === "xiaoheiwan" ||
    value === "opensoraHtml" ||
    value === "makerichHtml" ||
    value === "beibeiHtml" ||
    value === "ikunloveApi" ||
    value === "getgptApi" ||
    value === "genericHtml" ||
    value === "browser" ||
    value === "unsupported"
  ) {
    return value;
  }
  return null;
}

export function mapRawOffer(row: Record<string, unknown>): RawOffer {
  return {
    id: String(row.id),
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: String(row.source_name || ""),
    sourceStoreName: row.source_store_name ? String(row.source_store_name) : null,
    sourceTitle: String(row.source_title || ""),
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    currency: String(row.currency || "CNY"),
    status: String(row.status || "unknown") as RawOffer["status"],
    url: String(row.url || ""),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
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
