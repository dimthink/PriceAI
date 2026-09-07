import type { RawOffer } from "@/lib/types";

export const PRODUCT_OFFER_QUICK_STOCK_THRESHOLD = 50 as const;
export const PRODUCT_OFFER_QUICK_FRESHNESS_MINUTES = 60 as const;

export type ProductOfferStockThreshold = typeof PRODUCT_OFFER_QUICK_STOCK_THRESHOLD;
export type ProductOfferFreshnessMinutes = typeof PRODUCT_OFFER_QUICK_FRESHNESS_MINUTES;

export function parseProductOfferStockThreshold(value: unknown): ProductOfferStockThreshold | null {
  const parsed = numericFilterValue(value);
  return parsed === PRODUCT_OFFER_QUICK_STOCK_THRESHOLD ? parsed : null;
}

export function parseProductOfferFreshnessMinutes(value: unknown): ProductOfferFreshnessMinutes | null {
  const parsed = numericFilterValue(value);
  return parsed === PRODUCT_OFFER_QUICK_FRESHNESS_MINUTES ? parsed : null;
}

export function productOfferStockFilterLabel(value: ProductOfferStockThreshold): string {
  return `库存 ≥${value}`;
}

export function productOfferFreshnessFilterLabel(value: ProductOfferFreshnessMinutes): string {
  return value === PRODUCT_OFFER_QUICK_FRESHNESS_MINUTES ? "1小时内更新" : "更新时间";
}

export function offerMatchesProductOperationalFilters(
  offer: RawOffer,
  minStock: ProductOfferStockThreshold | null,
  freshWithinMinutes: ProductOfferFreshnessMinutes | null,
  nowMs = Date.now(),
): boolean {
  if (minStock !== null) {
    if (typeof offer.stockCount !== "number" || !Number.isFinite(offer.stockCount) || offer.stockCount < minStock) return false;
  }

  if (freshWithinMinutes !== null) {
    const timestamp = productOfferPublicTimestamp(offer);
    const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
    if (!Number.isFinite(timestampMs) || timestampMs < nowMs - freshWithinMinutes * 60_000) return false;
  }

  return true;
}

export function productOfferPublicTimestamp(offer: RawOffer): string | null | undefined {
  return offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt;
}

function numericFilterValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
