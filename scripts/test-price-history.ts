import {
  compactProductPriceCandle,
  groupProductPriceCandleRows,
  parseExclusiveBefore,
  parsePriceChartPoints,
  parsePriceHistoryInterval,
  parsePriceHistoryLimit,
  productPriceChange,
} from "../src/lib/price-history.js";

assertEqual(parsePriceHistoryInterval("1h"), "1h");
assertEqual(parsePriceHistoryInterval("1d"), "1d");
assertEqual(parsePriceHistoryInterval("4h"), null);
assertEqual(parsePriceHistoryLimit("1h", null), 168);
assertEqual(parsePriceHistoryLimit("1d", undefined), 90);
assertEqual(parsePriceHistoryLimit("1h", "720"), 720);
assertEqual(parsePriceHistoryLimit("1h", "721"), null);
assertEqual(parsePriceHistoryLimit("1d", "0"), null);
assertEqual(parsePriceHistoryLimit("1d", "1.5"), null);
assertEqual(parsePriceChartPoints("1h", null), 24);
assertEqual(parsePriceChartPoints("1d", null), 30);
assertEqual(parsePriceChartPoints("1d", "24"), 24);
assertEqual(parsePriceChartPoints("1d", "25"), null);
assertEqual(parseExclusiveBefore("2026-07-20T12:34:56+08:00"), "2026-07-20T04:34:56.000Z");
assertEqual(parseExclusiveBefore("2026-07-20"), null);

const grouped = groupProductPriceCandleRows(["a", "b"], [
  row("a", "2026-07-20T00:00:00.000Z", 10, 12, 9, 11, 2),
  row("a", "2026-07-20T01:00:00.000Z", 11, 13, 10, 12, 3),
  row("a", "2026-07-20T02:00:00.000Z", 12, 14, 11, 13, 4),
  {
    ...row("b", "invalid", 1, 2, 0.5, 1.5, 1),
    period_start: "invalid",
  },
]);

assertEqual(grouped.a.length, 3);
assertEqual(grouped.a[0]?.time, "2026-07-20T00:00:00.000Z");
assertEqual(grouped.b.length, 0);
assertDeepEqual(productPriceChange([]), { change: null, changePercent: null });
assertDeepEqual(productPriceChange(grouped.a.slice(0, 1)), { change: null, changePercent: null });
assertEqual(productPriceChange(grouped.a).change, 1);
assertApprox(productPriceChange(grouped.a).changePercent, 100 / 12);
assertDeepEqual(compactProductPriceCandle(grouped.a[2]!), [
  "2026-07-20T02:00:00.000Z",
  12,
  14,
  11,
  13,
  4,
]);

console.log("price history test passed");

function row(
  productId: string,
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  sampleCount: number,
) {
  return {
    product_id: productId,
    period_start: time,
    open_price: open,
    high_price: high,
    low_price: low,
    close_price: close,
    sample_count: sampleCount,
    eligible_offer_count: 2,
    first_sample_at: time,
    last_sample_at: time,
  };
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}.`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`Expected ${actualText} to equal ${expectedText}.`);
  }
}

function assertApprox(actual: number | null, expected: number) {
  if (actual === null || Math.abs(actual - expected) > 0.000001) {
    throw new Error(`Expected ${JSON.stringify(actual)} to approximately equal ${expected}.`);
  }
}
