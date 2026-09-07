export const PRICE_DATA_EDGE_SECONDS = 300;
export const PRICE_DATA_STALE_SECONDS = 1800;
export const PRICE_DATA_DEGRADED_EDGE_SECONDS = 60;
export const PRICE_DATA_CACHE_TTL_MS = PRICE_DATA_EDGE_SECONDS * 1000;
export const HOT_PRODUCT_PRICE_DATA_EDGE_SECONDS = 60;
export const HOT_PRODUCT_PRICE_DATA_STALE_SECONDS = 300;
export const HOT_PRODUCT_PRICE_DATA_CACHE_TTL_MS = HOT_PRODUCT_PRICE_DATA_EDGE_SECONDS * 1000;

const HOT_PRODUCT_PRICE_DATA_IDS = new Set(["chatgpt-plus", "chatgpt-team-business"]);

export function isHotPriceProduct(productId: string): boolean {
  return HOT_PRODUCT_PRICE_DATA_IDS.has(String(productId || "").trim().toLowerCase());
}

export function priceDataEdgeSecondsForProduct(productId: string): number {
  return isHotPriceProduct(productId) ? HOT_PRODUCT_PRICE_DATA_EDGE_SECONDS : PRICE_DATA_EDGE_SECONDS;
}

export function priceDataStaleSecondsForProduct(productId: string): number {
  return isHotPriceProduct(productId) ? HOT_PRODUCT_PRICE_DATA_STALE_SECONDS : PRICE_DATA_STALE_SECONDS;
}

export function priceDataCacheTtlMsForProduct(productId: string): number {
  return isHotPriceProduct(productId) ? HOT_PRODUCT_PRICE_DATA_CACHE_TTL_MS : PRICE_DATA_CACHE_TTL_MS;
}
