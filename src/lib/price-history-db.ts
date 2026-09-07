import "server-only";

import { publicCatalogProducts } from "./catalog";
import {
  compactProductPriceCandle,
  groupProductPriceCandleRows,
  productPriceChange,
  type PriceHistoryInterval,
  type ProductPriceCandleResponse,
  type ProductPriceChartSummaryResponse,
  type ProductPriceCurrent,
} from "./price-history";
import { getSupabaseServerClient } from "./supabase";

type CurrentPriceRow = {
  product_id?: unknown;
  current_price?: unknown;
  eligible_offer_count?: unknown;
  quoted_at?: unknown;
};

export function resolvePriceHistoryProduct(productKey: string) {
  return publicCatalogProducts().find((product) => product.id === productKey || product.slug === productKey) || null;
}

export async function getProductPriceCandles(input: {
  productId: string;
  interval: PriceHistoryInterval;
  limit: number;
  before?: string;
}): Promise<ProductPriceCandleResponse> {
  const generatedAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (!supabase) return emptyCandleResponse(input.productId, input.interval, generatedAt);

  const [candlesResult, latestCandlesResult, currentResult] = await Promise.all([
    supabase.rpc("list_public_product_price_candles", {
      p_product_ids: [input.productId],
      p_interval: input.interval,
      p_limit_per_product: input.limit,
      p_before: input.before || null,
    }),
    supabase.rpc("list_public_product_price_candles", {
      p_product_ids: [input.productId],
      p_interval: input.interval,
      p_limit_per_product: 2,
      p_before: null,
    }),
    supabase.rpc("list_product_price_current", { p_product_ids: [input.productId] }),
  ]);
  if (candlesResult.error) throw candlesResult.error;
  if (latestCandlesResult.error) throw latestCandlesResult.error;
  if (currentResult.error) throw currentResult.error;

  const candles = groupProductPriceCandleRows(
    [input.productId],
    (candlesResult.data || []) as Array<Record<string, unknown>>,
  )[input.productId] || [];
  const latestCandles = groupProductPriceCandleRows(
    [input.productId],
    (latestCandlesResult.data || []) as Array<Record<string, unknown>>,
  )[input.productId] || [];
  const change = productPriceChange(latestCandles);
  const currentRow = ((currentResult.data || []) as CurrentPriceRow[])[0];

  return {
    productId: input.productId,
    interval: input.interval,
    currency: "CNY",
    generatedAt,
    lastObservedAt: latestCandles.at(-1)?.lastObservedAt || null,
    current: currentPriceFromRow(currentRow, change),
    candles,
  };
}

export async function getProductPriceChartSummaries(input: {
  interval: PriceHistoryInterval;
  points: 24 | 30;
  platform?: string | null;
  productType?: string | null;
}): Promise<ProductPriceChartSummaryResponse> {
  const generatedAt = new Date().toISOString();
  const products = publicCatalogProducts().filter((product) =>
    (!input.platform || product.platform === input.platform) &&
    (!input.productType || product.productType === input.productType)
  );
  const productIds = products.map((product) => product.id);
  const supabase = getSupabaseServerClient();
  if (!supabase || !productIds.length) {
    return emptySummaryResponse(input.interval, input.points, generatedAt, productIds);
  }

  const [candlesResult, currentResult] = await Promise.all([
    supabase.rpc("list_public_product_price_candles", {
      p_product_ids: productIds,
      p_interval: input.interval,
      p_limit_per_product: input.points,
      p_before: null,
    }),
    supabase.rpc("list_product_price_current", { p_product_ids: productIds }),
  ]);
  if (candlesResult.error) throw candlesResult.error;
  if (currentResult.error) throw currentResult.error;

  const candlesByProduct = groupProductPriceCandleRows(
    productIds,
    (candlesResult.data || []) as Array<Record<string, unknown>>,
  );
  const currentByProduct = new Map(
    ((currentResult.data || []) as CurrentPriceRow[]).map((row) => [String(row.product_id || ""), row]),
  );

  return {
    interval: input.interval,
    points: input.points,
    currency: "CNY",
    generatedAt,
    products: productIds.map((productId) => {
      const candles = candlesByProduct[productId] || [];
      const change = productPriceChange(candles);
      const current = currentPriceFromRow(currentByProduct.get(productId), change);
      return {
        productId,
        currentPrice: current.price,
        eligibleOfferCount: current.eligibleOfferCount,
        change: current.change,
        changePercent: current.changePercent,
        lastObservedAt: candles.at(-1)?.lastObservedAt || null,
        candles: candles.map(compactProductPriceCandle),
      };
    }),
  };
}

export async function recordProductPriceSamples(observedAt = new Date().toISOString()) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");
  const { data, error } = await supabase.rpc("record_product_price_samples", {
    p_product_ids: null,
    p_observed_at: observedAt,
  });
  if (error) throw error;
  return data;
}

export async function pruneProductPriceHistory(input: { batchSize: number; dryRun: boolean }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");
  const { data, error } = await supabase.rpc("prune_product_price_history", {
    p_batch_size: input.batchSize,
    p_dry_run: input.dryRun,
  });
  if (error) throw error;
  return data;
}

function currentPriceFromRow(
  row: CurrentPriceRow | undefined,
  change: Pick<ProductPriceCurrent, "change" | "changePercent">,
): ProductPriceCurrent {
  const price = Number(row?.current_price);
  const eligibleOfferCount = Number(row?.eligible_offer_count);
  const observedAt = isoDate(row?.quoted_at);
  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    eligibleOfferCount: Number.isInteger(eligibleOfferCount) && eligibleOfferCount > 0 ? eligibleOfferCount : 0,
    observedAt,
    ...change,
  };
}

function emptyCandleResponse(
  productId: string,
  interval: PriceHistoryInterval,
  generatedAt: string,
): ProductPriceCandleResponse {
  return {
    productId,
    interval,
    currency: "CNY",
    generatedAt,
    lastObservedAt: null,
    current: { price: null, eligibleOfferCount: 0, observedAt: null, change: null, changePercent: null },
    candles: [],
  };
}

function emptySummaryResponse(
  interval: PriceHistoryInterval,
  points: 24 | 30,
  generatedAt: string,
  productIds: string[],
): ProductPriceChartSummaryResponse {
  return {
    interval,
    points,
    currency: "CNY",
    generatedAt,
    products: productIds.map((productId) => ({
      productId,
      currentPrice: null,
      eligibleOfferCount: 0,
      change: null,
      changePercent: null,
      lastObservedAt: null,
      candles: [],
    })),
  };
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
