import {
  offerMatchesProductOperationalFilters,
  parseProductOfferFreshnessMinutes,
  parseProductOfferStockThreshold,
  productOfferFreshnessFilterLabel,
  productOfferStockFilterLabel,
} from "../src/lib/product-offer-filters.js";
import type { RawOffer } from "../src/lib/types.js";

const NOW = Date.parse("2026-07-21T06:00:00.000Z");

assertEqual(parseProductOfferStockThreshold("50"), 50);
assertEqual(parseProductOfferStockThreshold(100), null);
assertEqual(parseProductOfferStockThreshold("10"), null);
assertEqual(parseProductOfferStockThreshold("25"), null);
assertEqual(parseProductOfferStockThreshold(""), null);
assertEqual(parseProductOfferFreshnessMinutes("30"), null);
assertEqual(parseProductOfferFreshnessMinutes(60), 60);
assertEqual(parseProductOfferFreshnessMinutes(1440), null);
assertEqual(parseProductOfferFreshnessMinutes("120"), null);
assertEqual(productOfferStockFilterLabel(50), "库存 ≥50");
assertEqual(productOfferFreshnessFilterLabel(60), "1小时内更新");

const freshOffer = offer({ stockCount: 50, verifiedAt: "2026-07-21T05:30:00.000Z" });
assertEqual(offerMatchesProductOperationalFilters(freshOffer, 50, 60, NOW), true);
assertEqual(offerMatchesProductOperationalFilters(offer({ stockCount: 49 }), 50, null, NOW), false);
assertEqual(offerMatchesProductOperationalFilters(freshOffer, null, 60, NOW + 30 * 60_000 + 1), false);
assertEqual(offerMatchesProductOperationalFilters(offer({ stockCount: null }), 50, null, NOW), false);
assertEqual(offerMatchesProductOperationalFilters(offer({ verifiedAt: null, lastSeenAt: null }), null, 60, NOW), false);
assertEqual(offerMatchesProductOperationalFilters(offer({ verifiedAt: null, lastSeenAt: "2026-07-21T05:01:00.000Z" }), null, 60, NOW), true);

console.log("product offer operational filters test passed");

function offer(overrides: Partial<RawOffer>): RawOffer {
  return {
    id: "offer-1",
    sourceName: "测试渠道",
    sourceTitle: "测试商品",
    price: 1,
    currency: "CNY",
    status: "in_stock",
    url: "https://example.com/product",
    tags: [],
    stockCount: 10,
    verifiedAt: "2026-07-21T05:00:00.000Z",
    ...overrides,
  };
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}.`);
  }
}
