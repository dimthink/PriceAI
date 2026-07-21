import type { RawOffer } from "@/lib/types";

export const PRODUCT_OFFER_STOCK_THRESHOLDS = [10, 50, 100] as const;
export const PRODUCT_OFFER_FRESHNESS_MINUTES = [30, 60, 180, 1440] as const;

export type ProductOfferStockThreshold = (typeof PRODUCT_OFFER_STOCK_THRESHOLDS)[number];
export type ProductOfferFreshnessMinutes = (typeof PRODUCT_OFFER_FRESHNESS_MINUTES)[number];

export function parseProductOfferStockThreshold(value: unknown): ProductOfferStockThreshold | null {
  const parsed = numericFilterValue(value);
  return PRODUCT_OFFER_STOCK_THRESHOLDS.find((item) => item === parsed) ?? null;
}

export function parseProductOfferFreshnessMinutes(value: unknown): ProductOfferFreshnessMinutes | null {
  const parsed = numericFilterValue(value);
  return PRODUCT_OFFER_FRESHNESS_MINUTES.find((item) => item === parsed) ?? null;
}

export function productOfferStockFilterLabel(value: ProductOfferStockThreshold): string {
  return `库存 ≥${value}`;
}

export function productOfferFreshnessFilterLabel(value: ProductOfferFreshnessMinutes): string {
  if (value === 30) return "30分钟内更新";
  if (value === 60) return "1小时内更新";
  if (value === 180) return "3小时内更新";
  return "24小时内更新";
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
