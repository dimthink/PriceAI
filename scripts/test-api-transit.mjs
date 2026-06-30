#!/usr/bin/env node

import assert from "node:assert/strict";
import { __test } from "./collect-api-transit.mjs";

const existingStations = new Map([
  ["published-new-api", { id: "published-new-api", published: true }],
  ["pending-new-api", { id: "pending-new-api", published: false }],
]);

const stations = [
  { id: "published-new-api", collection_status: "success", auto_publish: false },
  { id: "pending-new-api", collection_status: "success", auto_publish: false },
  { id: "auto-source", collection_status: "success", auto_publish: true },
  { id: "failed-published", collection_status: "failed", auto_publish: false },
];

const refreshIds = __test.collectSuccessfulRefreshStationIds(stations, existingStations, {});
assert.deepEqual([...refreshIds].sort(), ["auto-source", "published-new-api"]);

const publishRefreshIds = __test.collectSuccessfulRefreshStationIds(stations, existingStations, { publish: true });
assert.deepEqual([...publishRefreshIds].sort(), ["auto-source", "pending-new-api", "published-new-api"]);

const offers = [
  { station_id: "published-new-api", standard_model: "Claude Sonnet 4.6", group_name: "fresh" },
  { station_id: "pending-new-api", standard_model: "Claude Sonnet 4.6", group_name: "pending" },
  { station_id: "auto-source", standard_model: "GPT 5.5", group_name: "auto" },
];

const keys = __test.collectRefreshedOfferKeys(offers, refreshIds);
assert.equal(keys.get("published-new-api").has("published-new-api|Claude Sonnet 4.6|fresh"), true);
assert.equal(keys.has("pending-new-api"), false);
assert.equal(keys.get("auto-source").has("auto-source|GPT 5.5|auto"), true);

const existingOffers = new Map([
  [
    "published-new-api|Claude Sonnet 4.6|fresh",
    {
      id: "keep",
      station_id: "published-new-api",
      standard_model: "Claude Sonnet 4.6",
      group_name: "fresh",
      status: "active",
    },
  ],
  [
    "published-new-api|Claude Sonnet 4.6|stale",
    {
      id: "deactivate",
      station_id: "published-new-api",
      standard_model: "Claude Sonnet 4.6",
      group_name: "stale",
      status: "active",
    },
  ],
  [
    "pending-new-api|Claude Sonnet 4.6|old",
    {
      id: "pending-keep",
      station_id: "pending-new-api",
      standard_model: "Claude Sonnet 4.6",
      group_name: "old",
      status: "active",
    },
  ],
]);

assert.deepEqual(__test.findStaleRefreshedOfferIds(existingOffers, keys), ["deactivate"]);

assert.equal(
  __test.mergeOfferForRefresh(
    { id: "new", auto_publish: false, status: "needs_review", created_at: "new" },
    { id: "old", status: "active", created_at: "old" },
    true,
  ).status,
  "active",
);

assert.equal(
  __test.mergeOfferForRefresh(
    { id: "new", auto_publish: false, status: "needs_review", created_at: "new" },
    undefined,
    false,
  ).status,
  "needs_review",
);

const sources = [
  { id: "published-new-api" },
  { id: "pending-new-api" },
  { id: "removed-new-api" },
];
assert.deepEqual(
  __test.filterSourcesByPublishedStationIds(sources, new Set(["published-new-api"])),
  [{ id: "published-new-api" }],
);

assert.equal(__test.shouldRestrictToPublishedStations({ post: true }), true);
assert.equal(__test.shouldRestrictToPublishedStations({ post: true, source: "pending-new-api" }), false);
assert.equal(__test.shouldRestrictToPublishedStations({ post: true, publish: true }), false);
assert.equal(__test.shouldRestrictToPublishedStations({ post: true, dryRun: true }), false);

const zivvParsed = __test.parseZivvModelHubPayload(
  {
    id: "zivv-pro",
    name: "Zivv",
    websiteUrl: "https://zivv.pro/",
    apiBaseUrl: "https://zivv.pro/v1",
    pricingUrl: "https://zivv.pro/model-hub",
    pricingEndpointUrl: "https://zivv.pro/api/models/hub",
    collectorKind: "zivv_model_hub",
    rechargeRatio: "1:1",
  },
  {
    data: [
      {
        id: "gpt-5.4",
        quota_type: 1,
        groups: [
          { name: "Codex Plus【目前不稳定】", input_rate: 0.45, output_rate: 2.7, cache_read_rate: 0.045, cache_write_rate: 0.045 },
          { name: "Codex Pro", input_rate: 0.7, output_rate: 4.2, cache_read_rate: 0.07, cache_write_rate: 0.07 },
        ],
      },
      {
        id: "claude-sonnet-4-6",
        quota_type: 1,
        groups: [
          { name: "Claude MAX", input_rate: 3, output_rate: 15, cache_read_rate: 0.3, cache_write_rate: 3.75 },
        ],
      },
    ],
  },
  "2026-06-30T08:00:00.000Z",
);

__test.applyZivvStatusAvailability(
  { id: "zivv-pro", collectorKind: "zivv_model_hub" },
  zivvParsed,
  {
    services: [
      {
        name: "Codex Pro",
        model: "gpt-5.4",
        current: { ok: true, timestamp: "2026-06-30T08:00:00.000Z" },
        uptime_percent: 99.5,
        history: [
          { timestamp: "2026-06-30T07:55:00.000Z", ok: true, latency_ms: 1200 },
          { timestamp: "2026-06-30T08:00:00.000Z", ok: false, error: "timeout" },
        ],
      },
      {
        name: "Claude MAX",
        model: "claude-sonnet-4-6",
        current: { ok: true, timestamp: "2026-06-30T08:00:00.000Z" },
        uptime_percent: 90,
        history: [
          { timestamp: "2026-06-30T08:00:00.000Z", ok: true, latency_ms: 1800 },
        ],
      },
    ],
  },
  "2026-06-30T08:00:00.000Z",
);

assert.equal(zivvParsed.station.availability_seven_day_samples, 3);
assert.equal(zivvParsed.station.availability_source_type, "public_status");
assert.equal(zivvParsed.station.availability_source_label, "公开监测页");
assert.equal(zivvParsed.availabilitySamples.length, 6);
assert.equal(zivvParsed.availabilitySamples[0].source_type, "public_status");
const codexProOffer = zivvParsed.offers.find((offer) => offer.standard_model === "GPT 5.4" && offer.group_name === "Codex Pro");
assert.equal(codexProOffer.availability_seven_day_samples, 2);
assert.equal(codexProOffer.availability_seven_day_rate, 0.995);
assert.equal(codexProOffer.availability_source_type, "public_status");
const codexPlusOffer = zivvParsed.offers.find((offer) => offer.standard_model === "GPT 5.4" && offer.group_name === "Codex Plus【目前不稳定】");
assert.equal(codexPlusOffer.availability_seven_day_samples, 0);

console.log("api transit collector refresh test passed");
