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

const apinodePayload = {
  code: 0,
  message: "success",
  data: {
    generated_at: "2026-06-30T07:11:17Z",
    groups: [
      {
        id: 15,
        name: "image2 渠道",
        platform: "openai",
        rate_multiplier: 0.1,
        allow_image_generation: true,
        image_rate_multiplier: 1,
      },
      {
        id: 11,
        name: "Plus-经济通道",
        platform: "openai",
        rate_multiplier: 0.3,
        allow_image_generation: true,
        image_rate_multiplier: 1,
      },
      {
        id: 12,
        name: "Team/Plus-标准通道",
        platform: "openai",
        rate_multiplier: 0.5,
        allow_image_generation: true,
        image_rate_multiplier: 1,
      },
      {
        id: 13,
        name: "Team/Plus/Pro-稳定通道",
        platform: "openai",
        rate_multiplier: 0.65,
        allow_image_generation: true,
        image_rate_multiplier: 1,
      },
    ],
    model_availability: [
      {
        id: 8,
        name: "Plus/Team渠道监控-GPT5.4",
        provider: "openai",
        group_name: "",
        models: [
          {
            model: "gpt-5.4",
            latest_status: "operational",
            availability_7d: 98.10397553516819,
            availability_15d: 98.10397553516819,
            availability_30d: 98.10397553516819,
          },
        ],
      },
      {
        id: 2,
        name: "Plus/Team渠道监控-GPT5.5",
        provider: "openai",
        group_name: "OpenAI",
        models: [
          {
            model: "gpt-5.5",
            latest_status: "operational",
            availability_7d: 97.64936336924583,
            availability_15d: 97.11141678129299,
            availability_30d: 98.24443848834093,
          },
        ],
      },
    ],
    recharge: {
      payment_enabled: true,
      balance_disabled: false,
      balance_recharge_multiplier: 1,
    },
  },
};
const apinodeSource = {
  id: "apinode-ltd",
  name: "APINode",
  websiteUrl: "https://apinode.ltd/",
  apiBaseUrl: "https://apinode.ltd/v1",
  pricingEndpointUrl: "https://apinode.ltd/api/v1/public/site-info",
  collectorKind: "sub2api_public_site_info",
  stationSystem: "sub_to_api",
  autoPublish: true,
};
const apinode = __test.parseApinodePublicSiteInfoPayload(apinodeSource, apinodePayload, "2026-06-30T07:12:00Z");
assert.equal(apinode.offers.length, 7);
assert.equal(apinode.station.collector_kind, "sub2api_public_site_info");
assert.equal(apinode.station.station_system, "sub_to_api");
assert.equal(apinode.station.availability_seven_day_samples, 2);
assert.equal(apinode.station.availability_seven_day_rate, 0.978767);
assert.equal(apinode.offers.some((offer) => offer.standard_model === "GPT 5.4" && offer.group_name === "image2 渠道"), false);
assert.equal(apinode.offers.some((offer) => offer.standard_model === "GPT Image 2" && offer.group_name === "image2 渠道"), true);
const apinodeGpt55Economy = apinode.offers.find(
  (offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "Plus-经济通道",
);
assert.equal(apinodeGpt55Economy.model_multiplier, 0.3);
assert.equal(apinodeGpt55Economy.availability_seven_day_rate, 0.976494);
assert.match(apinodeGpt55Economy.availability_note, /非 PriceAI API Key 实测/);

const stationRefresh = __test.mergeStationForRefresh(
  { id: "apinode-ltd", station_system: "sub_to_api", published: true, data_status: "verified" },
  { id: "apinode-ltd", station_system: "custom", published: true },
  {},
);
assert.equal(stationRefresh.station_system, "custom");

console.log("api transit collector refresh test passed");
