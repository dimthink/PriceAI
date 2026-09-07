import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { trackOutboundEvent, withPriceAiUtm } from "../src/lib/outbound-analytics-client.js";

const tracked = withPriceAiUtm("https://example.com/buy?sku=plus&utm_source=old", {
  medium: "card_offer",
  campaign: "priceai_card_shop",
  content: "offer-1",
});
const trackedUrl = new URL(tracked);

assert.equal(trackedUrl.searchParams.get("sku"), "plus");
assert.equal(trackedUrl.searchParams.get("utm_source"), "old");
assert.equal(trackedUrl.searchParams.get("utm_medium"), "card_offer");
assert.equal(trackedUrl.searchParams.get("utm_campaign"), "priceai_card_shop");
assert.equal(trackedUrl.searchParams.get("utm_content"), "offer-1");
assert.equal(withPriceAiUtm("/commercial#slots", { medium: "sponsor", campaign: "home" }), "/commercial#slots");
assert.equal(withPriceAiUtm("mailto:test@example.com", { medium: "merchant_shop", campaign: "merchant" }), "mailto:test@example.com");
const signedUrl = "https://example.com/buy?signature=abc123&expires=123456";
assert.equal(withPriceAiUtm(signedUrl, { medium: "card_offer", campaign: "merchant" }), signedUrl);
assert.doesNotThrow(() => trackOutboundEvent({
  eventType: "sponsor_click",
  entityType: "sponsor",
  entityId: "campaign-1",
}));

const route = readFileSync("src/app/api/outbound-events/route.ts", "utf8");
assert.match(route, /eventType: z\.literal\("sponsor_click"\)/);
assert.match(route, /entityType: z\.literal\("sponsor"\)/);

const firstPartyConsumers = [
  "src/components/ProductOffersPanel.tsx",
  "src/components/PriceExplorer.tsx",
  "src/components/TransitStationDetail.tsx",
];
for (const file of firstPartyConsumers) {
  assert.doesNotMatch(readFileSync(file, "utf8"), /trackOutboundEvent/);
}
assert.match(readFileSync("src/components/SponsoredPlacementPreview.tsx", "utf8"), /trackOutboundEvent/);

const migration = readFileSync(
  "supabase/migrations/20260729220000_outbound_analytics_events.sql",
  "utf8",
);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /p_batch_size integer default 5000/);
assert.match(migration, /limit greatest\(1, least\(coalesce\(p_limit, 200\), 500\)\)/);
assert.match(migration, /list_outbound_analytics_event_totals/);
assert.match(migration, /grant insert on table public\.outbound_analytics_events to service_role/);
assert.doesNotMatch(migration, /grant all on table public\.outbound_analytics_events/);
assert.doesNotMatch(migration, /random\(\)/);

const sponsorOnlyMigration = readFileSync(
  "supabase/migrations/20260729233000_sponsor_only_outbound_analytics.sql",
  "utf8",
);
assert.equal((sponsorOnlyMigration.match(/events\.event_type = 'sponsor_click'/g) || []).length, 3);

console.log("outbound analytics tests passed");
