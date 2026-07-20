export const PRICE_HISTORY_INTERVALS = ["1h", "1d"] as const;

export type PriceHistoryInterval = (typeof PRICE_HISTORY_INTERVALS)[number];

export type ProductPriceCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  sampleCount: number;
  eligibleOfferCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
};

export type ProductPriceCurrent = {
  price: number | null;
  eligibleOfferCount: number;
  observedAt: string | null;
  change: number | null;
  changePercent: number | null;
};

export type ProductPriceCandleResponse = {
  productId: string;
  interval: PriceHistoryInterval;
  currency: "CNY";
  generatedAt: string;
  lastObservedAt: string | null;
  current: ProductPriceCurrent;
  candles: ProductPriceCandle[];
};

export type CompactProductPriceCandle = readonly [
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  sampleCount: number,
];

export type ProductPriceChartSummary = {
  productId: string;
  currentPrice: number | null;
  eligibleOfferCount: number;
  change: number | null;
  changePercent: number | null;
  lastObservedAt: string | null;
  candles: CompactProductPriceCandle[];
};

export type ProductPriceChartSummaryResponse = {
  interval: PriceHistoryInterval;
  points: 24 | 30;
  currency: "CNY";
  generatedAt: string;
  products: ProductPriceChartSummary[];
};

export type ProductPriceChange = {
  change: number | null;
  changePercent: number | null;
};

const DEFAULT_LIMITS: Record<PriceHistoryInterval, number> = { "1h": 168, "1d": 90 };
const MAX_LIMITS: Record<PriceHistoryInterval, number> = { "1h": 720, "1d": 365 };

export function parsePriceHistoryInterval(value: string | null | undefined): PriceHistoryInterval | null {
  return PRICE_HISTORY_INTERVALS.find((interval) => interval === value) || null;
}

export function parsePriceHistoryLimit(
  interval: PriceHistoryInterval,
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return DEFAULT_LIMITS[interval];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMITS[interval]) return null;
  return parsed;
}

export function parsePriceChartPoints(
  interval: PriceHistoryInterval,
  value: string | number | null | undefined,
): 24 | 30 | null {
  if (value === null || value === undefined || value === "") return interval === "1h" ? 24 : 30;
  const parsed = typeof value === "number" ? value : Number(value);
  return parsed === 24 || parsed === 30 ? parsed : null;
}

export function parseExclusiveBefore(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function groupProductPriceCandleRows(
  productIds: string[],
  rows: Array<Record<string, unknown>>,
): Record<string, ProductPriceCandle[]> {
  const products = Object.fromEntries(productIds.map((id) => [id, [] as ProductPriceCandle[]]));

  for (const row of rows) {
    const productId = String(row.product_id || "");
    if (!Object.hasOwn(products, productId)) continue;
    const candle = productPriceCandleFromRow(row);
    if (candle) products[productId].push(candle);
  }

  for (const candles of Object.values(products)) {
    candles.sort((left, right) => left.time.localeCompare(right.time));
  }

  return products;
}

export function productPriceCandleFromRow(row: Record<string, unknown>): ProductPriceCandle | null {
  const time = isoDate(row.period_start);
  const firstObservedAt = isoDate(row.first_sample_at);
  const lastObservedAt = isoDate(row.last_sample_at);
  const values = [row.open_price, row.high_price, row.low_price, row.close_price].map(Number);
  if (!time || !firstObservedAt || !lastObservedAt || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  const [open, high, low, close] = values;
  if (high < Math.max(open, close) || low > Math.min(open, close)) return null;

  return {
    time,
    open,
    high,
    low,
    close,
    sampleCount: positiveInteger(row.sample_count),
    eligibleOfferCount: positiveInteger(row.eligible_offer_count),
    firstObservedAt,
    lastObservedAt,
  };
}

export function productPriceChange(candles: ProductPriceCandle[]): ProductPriceChange {
  const previousClose = candles.at(-2)?.close;
  const latestClose = candles.at(-1)?.close;
  if (previousClose === undefined || latestClose === undefined || previousClose <= 0) {
    return { change: null, changePercent: null };
  }

  const change = latestClose - previousClose;
  return {
    change,
    changePercent: (change / previousClose) * 100,
  };
}

export function compactProductPriceCandle(candle: ProductPriceCandle): CompactProductPriceCandle {
  return [candle.time, candle.open, candle.high, candle.low, candle.close, candle.sampleCount];
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
