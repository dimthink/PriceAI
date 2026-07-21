import assert from "node:assert/strict";

import {
  buildPriceRadarBundle,
  createPriceRadarSnapshotId,
  parsePriceRadarProductSnapshotKey,
  priceRadarPresetTagsForProduct,
  PRICE_RADAR_SCHEMA_VERSION,
  PRICE_RADAR_TOP_OFFER_LIMIT,
  type PriceRadarProductOffersSnapshot,
  type PriceRadarStoredProductSnapshot,
} from "../src/lib/price-radar-contract.js";
import type { ExplorerData, ExplorerProductSummary, RawOffer } from "../src/lib/types.js";
import {
  PRICE_RADAR_DEVELOPER_URL,
  PRICE_RADAR_LATEST_URL,
  withPriceRadarMigrationHeaders,
} from "../src/lib/price-radar-migration.js";

const GENERATED_AT = "2026-07-21T12:00:00.000Z";

async function main() {
  const product = explorerProduct();
  const explorer: ExplorerData = {
    configured: true,
    generatedAt: GENERATED_AT,
    offerTotal: 8,
    products: [product],
    sources: [],
  };
  const defaultSnapshot = storedSnapshot(
    "v5-plus-account-state-tags:default:chatgpt-plus:limit:30",
    productOffers([], 8),
  );
  const presetSnapshot = storedSnapshot(
    "v5-plus-account-state-tags:tag:account_verified:chatgpt-plus:limit:30",
    productOffers(["account_verified"], 6),
  );
  const snapshots = [defaultSnapshot, presetSnapshot];

  assert.deepEqual(parsePriceRadarProductSnapshotKey(defaultSnapshot.cacheKey), {
    productKey: "chatgpt-plus",
    tag: null,
  });
  assert.deepEqual(parsePriceRadarProductSnapshotKey(presetSnapshot.cacheKey), {
    productKey: "chatgpt-plus",
    tag: "account_verified",
  });
  assert.equal(parsePriceRadarProductSnapshotKey("invalid"), null);
  assert.deepEqual(priceRadarPresetTagsForProduct(defaultSnapshot.value.filterFacets), [
    "account_verified",
    "delivery_recharge",
    "warranty_long",
    "shared_access",
  ]);

  const snapshotId = await createPriceRadarSnapshotId(explorer, snapshots);
  assert.match(snapshotId, /^20260721120000-[0-9a-f]{12}$/);
  assert.equal(snapshotId, await createPriceRadarSnapshotId(explorer, [...snapshots].reverse()));

  const bundle = buildPriceRadarBundle({
    explorer,
    productSnapshots: snapshots,
    publishedAt: "2026-07-21T12:01:00.000Z",
    snapshotId,
  });
  assert.equal(bundle.latest.schema_version, PRICE_RADAR_SCHEMA_VERSION);
  assert.equal(bundle.latest.product_count, 1);
  assert.equal(bundle.latest.resource_count, 1);
  assert.match(bundle.latest.snapshot_url, /^https:\/\/data\.priceai\.cc\/v1\/snapshots\//);
  assert.equal(bundle.objects.length, 1);
  assert.match(bundle.latest.snapshot_url, /\/v1\/snapshots\/[^/]+\.json$/);

  const productsDocument = bundle.objects[0].value;
  const productDocument = productsDocument.products[0];
  assert.equal(productDocument.lowest_price, 10);
  assert.equal("offerSearchText" in productDocument, false);
  assert.equal(productDocument.top_offers.length, PRICE_RADAR_TOP_OFFER_LIMIT);
  assert.deepEqual(productDocument.presets.map((preset) => preset.id), ["account_verified"]);
  assert.equal(productDocument.presets[0].top_offers.length, PRICE_RADAR_TOP_OFFER_LIMIT);
  assert.equal(productDocument.snapshot_generated_at, GENERATED_AT);
  assert.equal(productDocument.presets[0].generated_at, GENERATED_AT);
  assert.equal("riskFeedback" in productDocument.top_offers[0], false);
  assert.equal("filterTags" in productDocument.top_offers[0], false);

  const fallbackBundle = buildPriceRadarBundle({
    explorer,
    productSnapshots: [defaultSnapshot],
    publishedAt: "2026-07-21T12:01:00.000Z",
    snapshotId,
  });
  assert.deepEqual(fallbackBundle.objects[0].value.products[0].presets, []);

  const staleBundle = buildPriceRadarBundle({
    explorer,
    productSnapshots: snapshots,
    publishedAt: "2026-07-21T15:00:01.000Z",
    snapshotId,
  });
  assert.equal(staleBundle.latest.stale, true);
  assert.deepEqual(staleBundle.objects[0].value.products[0].presets, []);

  assert.throws(() => buildPriceRadarBundle({
    explorer: { ...explorer, degraded: true },
    productSnapshots: snapshots,
    publishedAt: GENERATED_AT,
    snapshotId,
  }), /Healthy configured explorer snapshot/);
  assert.throws(() => buildPriceRadarBundle({
    explorer,
    productSnapshots: [],
    publishedAt: GENERATED_AT,
    snapshotId,
  }), /Missing healthy default product snapshot/);

  const legacyResponse = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
  });
  const migratedResponse = withPriceRadarMigrationHeaders(legacyResponse);
  assert.equal(migratedResponse.status, legacyResponse.status);
  assert.equal(migratedResponse.headers.get("Cache-Control"), legacyResponse.headers.get("Cache-Control"));
  assert.equal(migratedResponse.headers.get("X-PriceAI-Migration"), "price-radar-v1");
  assert.equal(migratedResponse.headers.get("X-PriceAI-Public-Data"), PRICE_RADAR_LATEST_URL);
  assert.match(migratedResponse.headers.get("Link") || "", new RegExp(PRICE_RADAR_DEVELOPER_URL));
  assert.deepEqual(await migratedResponse.json(), { ok: true });

  console.log("price radar contract tests passed");
}

void main();

function storedSnapshot(cacheKey: string, value: PriceRadarProductOffersSnapshot): PriceRadarStoredProductSnapshot {
  return { cacheKey, generatedAt: GENERATED_AT, value };
}

function productOffers(activeFilterTags: PriceRadarProductOffersSnapshot["activeFilterTags"], total: number): PriceRadarProductOffersSnapshot {
  return {
    activeFilterTags,
    filterFacets: [
      facet("shared_access", 10),
      facet("delivery_recharge", 20),
      facet("account_verified", 6),
      facet("warranty_long", 4),
    ],
    generatedAt: GENERATED_AT,
    offers: Array.from({ length: 8 }, (_, index) => offer(index + 1)),
    total,
  };
}

function explorerProduct(): ExplorerProductSummary {
  return {
    id: "chatgpt-plus",
    slug: "chatgpt-plus",
    displayName: "ChatGPT Plus",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Plus",
    summary: "ChatGPT Plus 报价。",
    aliases: [],
    offerCount: 8,
    inStockCount: 8,
    outOfStockCount: 0,
    lowestPrice: 10,
    lowestPriceLabel: "有货",
    lowestPriceTone: "good",
    lowestOffer: offer(1),
    warrantyLowestPrice: null,
    warrantyLowestOffer: null,
    warrantyOfferCount: 0,
    latestSeenAt: GENERATED_AT,
    anomalyFlags: [],
    offerSearchText: "must not leak",
  };
}

function offer(index: number): RawOffer {
  return {
    id: `offer-${index}`,
    sourceId: `source-${index}`,
    sourceName: `渠道 ${index}`,
    sourceStoreName: `店铺 ${index}`,
    sourceTitle: `ChatGPT Plus 报价 ${index}`,
    price: index * 10,
    currency: "CNY",
    status: "in_stock",
    url: `https://example.com/offers/${index}`,
    tags: [],
    filterTags: ["account_verified"],
    stockCount: index,
    verifiedAt: GENERATED_AT,
    effectiveStatus: "available",
    freshnessStatus: "fresh",
    riskFeedback: { count: 1, scope: "offer", latestAt: GENERATED_AT },
  };
}

function facet(id: PriceRadarProductOffersSnapshot["filterFacets"][number]["id"], count: number) {
  const labels: Record<string, [string, string, string]> = {
    shared_access: ["拼车/团购", "access", "共享报价"],
    delivery_recharge: ["充值", "access", "充值报价"],
    account_verified: ["已接码成品号", "access", "已接码报价"],
    warranty_long: ["长期质保", "warranty", "长期质保报价"],
  };
  const [label, group, description] = labels[id];
  return { id, label, group: group as "access" | "warranty", description, count };
}
