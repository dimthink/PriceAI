import {
  OFFER_FILTER_TAG_BY_ID,
  type OfferFilterTagFacet,
  type OfferFilterTagId,
} from "./offer-filter-tags";
import type { ExplorerData, ExplorerProductSummary, RawOffer } from "./types";

export const PRICE_RADAR_SCHEMA_VERSION = "price-radar.v1";
export const PRICE_RADAR_RANKING_POLICY_VERSION = "available-non-shared-first.v1";
export const PRICE_RADAR_TOP_OFFER_LIMIT = 5;
export const PRICE_RADAR_MAX_PRESETS_PER_PRODUCT = 5;
export const PRICE_RADAR_PUBLIC_ORIGIN = "https://data.priceai.cc";
export const PRICE_RADAR_MAX_SNAPSHOT_AGE_MS = 2 * 60 * 60 * 1000;

const PRICE_RADAR_PRESET_PRIORITY: OfferFilterTagId[] = [
  "team_bug",
  "team_official",
  "team_k12",
  "chatgpt_plus_recharge_official_direct",
  "chatgpt_plus_recharge_us_ios",
  "chatgpt_plus_recharge_ph_card",
  "pro_max_official_recharge",
  "pro_max_short_term",
  "pro_max_us_ios",
  "gemini_12_month_link",
  "gemini_12_month_card_binding",
  "gemini_18_month_link",
  "gemini_antigravity_gcp",
  "gemini_phone_required",
  "gemini_appeal_required",
  "telegram_premium_quarter",
  "telegram_premium_half_year",
  "telegram_premium_year",
  "telegram_stars",
  "verification_single",
  "verification_short",
  "verification_long",
  "verification_monthly",
  "duration_trial",
  "duration_month",
  "duration_quarter",
  "duration_half_year",
  "duration_year",
  "account_verified",
  "account_unverified",
  "delivery_recharge",
  "delivery_account",
  "warranty_long",
  "shared_access",
  "web_only_account",
  "domestic_mirror_site",
  "proxy_supported",
];

const presetPriority = new Map(PRICE_RADAR_PRESET_PRIORITY.map((tag, index) => [tag, index]));

export type PriceRadarProductOffersSnapshot = {
  offers: RawOffer[];
  total: number;
  filterFacets: OfferFilterTagFacet[];
  activeFilterTags: OfferFilterTagId[];
  generatedAt: string;
  degraded?: boolean;
};

export type PriceRadarStoredProductSnapshot = {
  cacheKey: string;
  generatedAt: string;
  value: PriceRadarProductOffersSnapshot;
};

export type PriceRadarOffer = {
  id: string;
  source_id: string | null;
  source_name: string;
  source_store_name: string | null;
  title: string;
  price: number;
  currency: string;
  status: RawOffer["status"];
  url: string;
  stock_count: number | null;
  min_order_quantity: number | null;
  captured_at: string | null;
  last_seen_at: string | null;
  verified_at: string | null;
  expires_at: string | null;
  effective_status: RawOffer["effectiveStatus"] | null;
  freshness_status: RawOffer["freshnessStatus"] | null;
};

export type PriceRadarPresetSummary = {
  id: OfferFilterTagId;
  label: string;
  group: string;
  description: string;
  total: number;
  generated_at: string;
  top_offers: PriceRadarOffer[];
};

export type PriceRadarProductSummary = {
  id: string;
  slug: string;
  name: string;
  platform: string;
  product_type: string;
  spec: string;
  summary: string;
  offer_count: number;
  in_stock_count: number;
  lowest_price: number | null;
  lowest_offer: PriceRadarOffer | null;
  latest_seen_at: string | null;
};

export type PriceRadarProductsDocument = PriceRadarEnvelope & {
  products: Array<PriceRadarProductSummary & {
    snapshot_generated_at: string;
    total: number;
    top_offers: PriceRadarOffer[];
    presets: PriceRadarPresetSummary[];
  }>;
};

export type PriceRadarLatestDocument = PriceRadarEnvelope & {
  snapshot_url: string;
  product_count: number;
  resource_count: number;
};

export type PriceRadarEnvelope = {
  schema_version: typeof PRICE_RADAR_SCHEMA_VERSION;
  snapshot_id: string;
  generated_at: string;
  published_at: string;
  stale: boolean;
  ranking_policy_version: typeof PRICE_RADAR_RANKING_POLICY_VERSION;
};

export type PriceRadarObject = {
  key: string;
  value: PriceRadarProductsDocument;
};

export type PriceRadarBundle = {
  latest: PriceRadarLatestDocument;
  objects: PriceRadarObject[];
};

type ParsedProductSnapshotKey = {
  productKey: string;
  tag: OfferFilterTagId | null;
};

export function priceRadarPresetTagsForProduct(
  facets: OfferFilterTagFacet[],
): OfferFilterTagId[] {
  return facets
    .filter((facet) => Number.isFinite(facet.count) && facet.count > 0 && presetPriority.has(facet.id))
    .sort((left, right) => {
      const priorityDelta = (presetPriority.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (presetPriority.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      return priorityDelta || right.count - left.count || left.id.localeCompare(right.id);
    })
    .slice(0, PRICE_RADAR_MAX_PRESETS_PER_PRODUCT)
    .map((facet) => facet.id);
}

export function parsePriceRadarProductSnapshotKey(cacheKey: string): ParsedProductSnapshotKey | null {
  const tagged = cacheKey.match(/^[^:]+:tag:([^:]+):([^:]+):limit:\d+$/);
  if (tagged && OFFER_FILTER_TAG_BY_ID.has(tagged[1] as OfferFilterTagId)) {
    return { productKey: tagged[2], tag: tagged[1] as OfferFilterTagId };
  }

  const defaultSnapshot = cacheKey.match(/^[^:]+:default:([^:]+):limit:\d+$/);
  return defaultSnapshot ? { productKey: defaultSnapshot[1], tag: null } : null;
}

export async function createPriceRadarSnapshotId(
  explorer: ExplorerData,
  snapshots: PriceRadarStoredProductSnapshot[],
): Promise<string> {
  const indexedSnapshots = indexProductSnapshots(snapshots);
  const publicSnapshotSeeds = new Set<string>();
  for (const product of explorer.products) {
    const defaultSnapshot = indexedSnapshots.get(snapshotIndexKey(product.id, null)) ||
      indexedSnapshots.get(snapshotIndexKey(product.slug, null)) || null;
    if (!defaultSnapshot) continue;
    publicSnapshotSeeds.add(`${defaultSnapshot.cacheKey}:${defaultSnapshot.generatedAt}`);
    for (const tag of priceRadarPresetTagsForProduct(defaultSnapshot.value.filterFacets)) {
      const presetSnapshot = indexedSnapshots.get(snapshotIndexKey(product.id, tag)) ||
        indexedSnapshots.get(snapshotIndexKey(product.slug, tag)) || null;
      if (presetSnapshot) publicSnapshotSeeds.add(`${presetSnapshot.cacheKey}:${presetSnapshot.generatedAt}`);
    }
  }
  const seed = [explorer.generatedAt, ...publicSnapshotSeeds].sort().join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const hash = Array.from(new Uint8Array(digest).slice(0, 6))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const timestamp = new Date(explorer.generatedAt).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${timestamp}-${hash}`;
}

export function buildPriceRadarBundle({
  explorer,
  productSnapshots,
  publishedAt,
  snapshotId,
}: {
  explorer: ExplorerData;
  productSnapshots: PriceRadarStoredProductSnapshot[];
  publishedAt: string;
  snapshotId: string;
}): PriceRadarBundle {
  if (explorer.degraded || explorer.configured === false || explorer.products.length === 0) {
    throw new Error("Healthy configured explorer snapshot is required for price radar publishing.");
  }

  const snapshots = indexProductSnapshots(productSnapshots);
  const generatedAt = explorer.generatedAt;
  const products: PriceRadarProductsDocument["products"] = [];
  let stale = false;
  const publishedAtMs = timestampMs(publishedAt);

  for (const product of explorer.products) {
    const defaultSnapshot = snapshots.get(snapshotIndexKey(product.id, null)) ||
      snapshots.get(snapshotIndexKey(product.slug, null)) || null;
    if (!defaultSnapshot) {
      throw new Error(`Missing healthy default product snapshot for ${product.id}.`);
    }
    if (snapshotIsStale(defaultSnapshot.generatedAt, publishedAtMs)) stale = true;
    const summary = toPriceRadarProductSummary(product);

    const presetSummaries: PriceRadarPresetSummary[] = [];
    for (const tag of priceRadarPresetTagsForProduct(defaultSnapshot?.value.filterFacets || [])) {
      const presetSnapshot = snapshots.get(snapshotIndexKey(product.id, tag)) ||
        snapshots.get(snapshotIndexKey(product.slug, tag)) || null;
      if (!presetSnapshot) continue;
      if (snapshotIsStale(presetSnapshot.generatedAt, publishedAtMs)) continue;
      const definition = OFFER_FILTER_TAG_BY_ID.get(tag);
      if (!definition) continue;
      const presetSummary: PriceRadarPresetSummary = {
        ...definition,
        total: presetSnapshot.value.total,
        generated_at: presetSnapshot.generatedAt,
        top_offers: topOffers(presetSnapshot.value.offers),
      };
      presetSummaries.push(presetSummary);
    }

    products.push({
      ...summary,
      snapshot_generated_at: defaultSnapshot.generatedAt,
      total: defaultSnapshot.value.total,
      top_offers: topOffers(defaultSnapshot.value.offers),
      presets: presetSummaries,
    });
  }

  const snapshotKey = `v1/snapshots/${snapshotId}.json`;
  const envelope: PriceRadarEnvelope = {
    schema_version: PRICE_RADAR_SCHEMA_VERSION,
    snapshot_id: snapshotId,
    generated_at: generatedAt,
    published_at: publishedAt,
    stale,
    ranking_policy_version: PRICE_RADAR_RANKING_POLICY_VERSION,
  };
  const objects: PriceRadarObject[] = [{
    key: snapshotKey,
    value: {
      ...envelope,
      products,
    },
  }];

  return {
    objects,
    latest: {
      ...envelope,
      snapshot_url: publicUrl(snapshotKey),
      product_count: products.length,
      resource_count: objects.length,
    },
  };
}

function indexProductSnapshots(snapshots: PriceRadarStoredProductSnapshot[]) {
  const output = new Map<string, PriceRadarStoredProductSnapshot>();
  for (const snapshot of snapshots) {
    const parsed = parsePriceRadarProductSnapshotKey(snapshot.cacheKey);
    if (!parsed || snapshot.value.degraded || !Array.isArray(snapshot.value.offers)) continue;
    const key = snapshotIndexKey(parsed.productKey, parsed.tag);
    const current = output.get(key);
    if (!current || timestampMs(snapshot.generatedAt) > timestampMs(current.generatedAt)) output.set(key, snapshot);
  }
  return output;
}

function snapshotIndexKey(productKey: string, tag: OfferFilterTagId | null): string {
  return `${productKey}:${tag || "default"}`;
}

function toPriceRadarProductSummary(
  product: ExplorerProductSummary,
): PriceRadarProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    name: product.displayName,
    platform: product.platform,
    product_type: product.productType,
    spec: product.spec,
    summary: product.summary,
    offer_count: product.offerCount,
    in_stock_count: product.inStockCount,
    lowest_price: finitePrice(product.lowestPrice),
    lowest_offer: toPriceRadarOffer(product.lowestOffer),
    latest_seen_at: product.latestSeenAt || null,
  };
}

function topOffers(offers: RawOffer[]): PriceRadarOffer[] {
  return offers
    .map(toPriceRadarOffer)
    .filter((offer): offer is PriceRadarOffer => Boolean(offer))
    .slice(0, PRICE_RADAR_TOP_OFFER_LIMIT);
}

function toPriceRadarOffer(offer: Partial<RawOffer> | null | undefined): PriceRadarOffer | null {
  const price = finitePrice(offer?.price);
  if (!offer?.id || !offer.sourceName || !offer.sourceTitle || !offer.currency || !offer.status || !offer.url || price === null) {
    return null;
  }
  return {
    id: offer.id,
    source_id: offer.sourceId || null,
    source_name: offer.sourceName,
    source_store_name: offer.sourceStoreName || null,
    title: offer.sourceTitle,
    price,
    currency: offer.currency,
    status: offer.status,
    url: offer.url,
    stock_count: finiteNumber(offer.stockCount),
    min_order_quantity: finiteNumber(offer.minOrderQuantity),
    captured_at: offer.capturedAt || null,
    last_seen_at: offer.lastSeenAt || null,
    verified_at: offer.verifiedAt || null,
    expires_at: offer.expiresAt || null,
    effective_status: offer.effectiveStatus || null,
    freshness_status: offer.freshnessStatus || null,
  };
}

function publicUrl(key: string): string {
  return `${PRICE_RADAR_PUBLIC_ORIGIN}/${key}`;
}

function finitePrice(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotIsStale(generatedAt: string, publishedAtMs: number): boolean {
  const generatedAtMs = timestampMs(generatedAt);
  return generatedAtMs === 0 || publishedAtMs - generatedAtMs > PRICE_RADAR_MAX_SNAPSHOT_AGE_MS;
}
