import assert from "node:assert/strict";
import {
  buildOfficialPricePlanSummaries,
  type OfficialPriceApp,
  type OfficialPricePlan,
  type OfficialPriceRow,
} from "../src/lib/official-prices";

const apps: OfficialPriceApp[] = [
  {
    slug: "grok",
    displayName: "Grok",
    provider: "xAI",
    appStoreId: "6670324846",
    appStoreSlug: "grok",
    summary: "",
  },
];

const plans: OfficialPricePlan[] = [
  { slug: "supergrok", appSlug: "grok", label: "SuperGrok", billingPeriod: "monthly" },
  { slug: "supergrok-heavy", appSlug: "grok", label: "SuperGrok Heavy", billingPeriod: "monthly" },
];

const rows: OfficialPriceRow[] = [
  row("supergrok", "PH", 90, "available", "2026-07-28T00:00:00.000Z"),
  row("supergrok", "TR", 60, "stale", "2026-07-24T00:00:00.000Z"),
  row("supergrok-heavy", "US", 300, "stale", "2026-07-24T00:00:00.000Z"),
  row("supergrok-heavy", "TR", 250, "stale", "2026-07-23T00:00:00.000Z"),
];

const summaries = buildOfficialPricePlanSummaries({ apps, plans, rows });
const currentSummary = summaries.find((summary) => summary.planSlug === "supergrok");
const historicalSummary = summaries.find((summary) => summary.planSlug === "supergrok-heavy");

assert.equal(currentSummary?.lowestRow?.countryCode, "PH", "available rows must rank ahead of cheaper stale rows");
assert.equal(currentSummary?.lowestRow?.status, "available");
assert.equal(currentSummary?.latestFetchedAt, "2026-07-28T00:00:00.000Z");
assert.equal(historicalSummary?.lowestRow?.countryCode, "TR", "stale rows remain comparable when no current row exists");
assert.equal(historicalSummary?.lowestRow?.status, "stale");
assert.equal(historicalSummary?.latestFetchedAt, "2026-07-24T00:00:00.000Z");

console.log("official price visibility test passed");

function row(
  planSlug: string,
  countryCode: string,
  cnyPrice: number,
  status: OfficialPriceRow["status"],
  lastSuccessAt: string,
): OfficialPriceRow {
  return {
    appSlug: "grok",
    planSlug,
    countryCode,
    countryLabel: countryCode,
    currencyCode: "CNY",
    priceText: `CNY ${cnyPrice}`,
    priceValue: cnyPrice,
    cnyPrice,
    fxRateToCny: 1,
    fxDate: "2026-07-28",
    sourceUrl: "https://apps.apple.com/us/app/grok/id6670324846",
    evidenceSource: "app_store_html",
    fetchedAt: lastSuccessAt,
    lastSuccessAt,
    status,
  };
}
