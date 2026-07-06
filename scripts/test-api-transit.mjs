#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { __test } from "./collect-api-transit.mjs";

const transitSourceConfig = JSON.parse(readFileSync(new URL("../config/api-transit-sources.json", import.meta.url), "utf8"));
const configuredRtocSource = transitSourceConfig.find((source) => source.id === "ai-rtoc-cc");
assert.ok(configuredRtocSource, "RTOC AI must stay in API transit public collection sources.");
assert.equal(configuredRtocSource.collectorKind, "new_api_pricing");
assert.equal(configuredRtocSource.monitorUrl, "https://ai.rtoc.cc/pricing");
assert.equal(configuredRtocSource.monitorEndpointUrl, "https://api.rtoc.cc/api/perf-metrics/summary?period=24");
const configuredAiTransitSnapshotSource = transitSourceConfig.find((source) => source.id === "sub-dimension-cc-cd");
assert.ok(configuredAiTransitSnapshotSource, "Sub2API ai-transit snapshot test station must stay in collection sources.");
assert.equal(configuredAiTransitSnapshotSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredAiTransitSnapshotSource.autoPublish, true);

const scheduledPublishedRtocSources = __test.selectSources(
  __test.filterSourcesByPublishedStationIds(transitSourceConfig, new Set(["ai-rtoc-cc"])),
  { post: true },
);
assert.deepEqual(
  scheduledPublishedRtocSources.map((source) => source.id),
  ["ai-rtoc-cc"],
  "RTOC AI must be eligible for the scheduled public pricing and monitoring refresh once published.",
);

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

const staleUnknownAvailabilityOffer = __test.mergeOfferForRefresh(
  {
    id: "new",
    auto_publish: false,
    status: "active",
    created_at: "new",
    availability_source_type: "unknown",
    availability_seven_day_rate: 0.6081,
    availability_seven_day_samples: 148,
    availability_first_checked_at: "2026-06-29T00:00:00.000Z",
    availability_last_checked_at: "2026-07-03T00:00:00.000Z",
    availability_note: "PriceAI API Key 探测：近 7 日 GPT 5.5 90/148 个样本成功。",
  },
  undefined,
  true,
);
assert.equal(staleUnknownAvailabilityOffer.availability_seven_day_rate, null);
assert.equal(staleUnknownAvailabilityOffer.availability_seven_day_samples, 0);
assert.equal(staleUnknownAvailabilityOffer.availability_first_checked_at, null);
assert.equal(staleUnknownAvailabilityOffer.availability_last_checked_at, null);
assert.equal(staleUnknownAvailabilityOffer.availability_note, "价格已抓取，尚未运行 API 可用性检测。");

const preservedTrustedAvailabilityOffer = __test.mergeOfferForRefresh(
  {
    id: "new",
    auto_publish: false,
    status: "active",
    created_at: "new",
    availability_source_type: "unknown",
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_note: "价格已抓取，尚未运行 API 可用性检测。",
  },
  {
    id: "old",
    status: "active",
    created_at: "old",
    availability_source_type: "priceai_probe",
    availability_source_label: "PriceAI 实测",
    availability_seven_day_rate: 0.98,
    availability_seven_day_samples: 50,
    availability_first_checked_at: "2026-07-01T00:00:00.000Z",
    availability_last_checked_at: "2026-07-03T00:00:00.000Z",
    availability_note: "PriceAI API Key 探测：近 7 日 GPT 5.5 49/50 个样本成功。",
  },
  true,
);
assert.equal(preservedTrustedAvailabilityOffer.availability_source_type, "priceai_probe");
assert.equal(preservedTrustedAvailabilityOffer.availability_seven_day_rate, 0.98);
assert.equal(preservedTrustedAvailabilityOffer.availability_seven_day_samples, 50);

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
assert.equal(__test.standardizeModelName("anthropic/claude-sonnet-5"), "Claude Sonnet 5");
assert.equal(__test.standardizeModelName("Claude Sonnet 5"), "Claude Sonnet 5");
assert.equal(__test.standardizeModelName("claude-sonnet-5-0"), "Claude Sonnet 5");
assert.equal(__test.standardizeModelName("anthropic/claude-fable-5"), "Claude Fable 5");
assert.equal(__test.standardizeModelName("Claude Fable 5"), "Claude Fable 5");
assert.equal(__test.standardizeModelName("claude-fable-5-0"), "Claude Fable 5");
assert.equal(__test.standardizeModelName("openai/gpt-image-2"), "GPT Image 2");
assert.equal(__test.standardizeModelName("google/gemini-3-pro-image-preview"), "Nano Banana Pro");
assert.equal(__test.standardizeModelName("google/gemini-3.1-flash-image-preview"), "Nano Banana 2");
assert.equal(__test.standardizeModelName("google/gemini-2.5-flash-image"), "Nano Banana");
assert.equal(__test.standardizeModelName("google/nano-banana-pro"), "Nano Banana Pro");
assert.equal(__test.standardizeModelName("google/nano-banana-2"), "Nano Banana 2");
assert.equal(__test.standardizeModelName("google/nano-banana"), "Nano Banana");
assert.equal(__test.standardizeModelName("google/nano-banana-lite"), "Nano Banana Lite");
assert.equal(__test.standardizeModelName("openai/sora-2-pro"), "Sora 2 Pro");
assert.equal(__test.standardizeModelName("openai/sora-2"), "Sora 2");
assert.equal(__test.standardizeModelName("google/veo-3.1-lite"), "Veo 3.1 Lite");
assert.equal(__test.standardizeModelName("google/veo-3.1"), "Veo 3.1");
assert.equal(__test.standardizeModelName("google/gemini-omni-flash"), "Gemini Omni Flash");
assert.equal(__test.standardizeModelName("volcengine/video-ds-2.0"), "Seedance 2.0");
assert.equal(__test.standardizeModelName("bytedance/seedance-2.0"), "Seedance 2.0");
assert.equal(__test.standardizeModelName("kling/kling-2.5-turbo"), "Kling 2.5 Turbo");
assert.equal(__test.standardizeModelName("claude-3-5-sonnet-20241022"), null);
assert.equal(__test.standardizeModelName("claude-sonnet-4-5-20250929-thinking"), null);
assert.equal(__test.standardizeModelName("gpt-5.4-nano"), null);

const fixedPricePayload = {
  data: [
    {
      model_name: "google/gemini-2.5-flash-image",
      quota_type: 1,
      model_ratio: 0,
      model_price: 0.04,
      enable_groups: ["default"],
    },
    {
      model_name: "openai/sora-2",
      quota_type: 1,
      model_ratio: 0,
      model_price: 0.1,
      enable_groups: ["default"],
    },
    {
      model_name: "openai/gpt-image-2",
      quota_type: 1,
      model_ratio: 0,
      model_price: 0.25,
      enable_groups: ["default"],
    },
  ],
  group_ratio: { default: 1 },
};
const fixedPriceRows = __test.parsePricingPayload(
  {
    id: "fixed-price-new-api",
    slug: "fixed-price-new-api",
    name: "Fixed Price New API",
    websiteUrl: "https://example.test",
    pricingEndpointUrl: "https://example.test/api/pricing",
    collectorKind: "new_api_pricing",
  },
  fixedPricePayload,
  "2026-07-02T00:00:00.000Z",
);
const fixedOffersByModel = new Map(fixedPriceRows.offers.map((offer) => [offer.standard_model, offer]));
assert.equal(fixedOffersByModel.get("Nano Banana").model_multiplier, 0.04);
assert.equal(fixedOffersByModel.get("Nano Banana").image_output_price, 0.04);
assert.equal(fixedOffersByModel.get("Sora 2").model_multiplier, 0.1);
assert.equal(fixedOffersByModel.get("GPT Image 2").model_multiplier, 0.008333);
assert.equal(fixedOffersByModel.get("GPT Image 2").image_output_price, 0.008333);
assert.equal(fixedOffersByModel.get("GPT Image 2").raw_payload.fixed_price, 0.25);

const rtocSource = configuredRtocSource;
const rtocParsed = __test.parsePricingPayload(
  rtocSource,
  {
    data: [
      {
        model_name: "gpt-5.5",
        model_ratio: 2.5,
        completion_ratio: 6,
        enable_groups: ["GPT", "GPT Pro"],
      },
      {
        model_name: "claude-sonnet-4-6",
        model_ratio: 1.5,
        completion_ratio: 5,
        enable_groups: ["Claude"],
      },
    ],
    group_ratio: {
      GPT: 0.06,
      "GPT Pro": 0.2,
      Claude: 1.32,
    },
  },
  "2026-07-02T14:00:00.000Z",
);
__test.applyNewApiPerformanceSummaryAvailability(
  rtocSource,
  rtocParsed,
  {
    data: {
      models: [
        {
          model_name: "gpt-5.5",
          success_rate: 97.61,
          avg_latency_ms: 17522,
          avg_tps: 38.64,
          recent_success_rates: [99.83, 100, 100],
        },
        {
          model_name: "claude-sonnet-4-6",
          success_rate: 97.27,
          avg_latency_ms: 8438,
          avg_tps: 64.94,
          recent_success_rates: [100, 100, 50],
        },
      ],
    },
  },
  "2026-07-02T14:00:00.000Z",
);
const rtocGptOffer = rtocParsed.offers.find((offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "GPT");
assert.equal(rtocGptOffer.availability_seven_day_rate, 0.9761);
assert.equal(rtocGptOffer.availability_seven_day_samples, 3);
assert.equal(rtocGptOffer.availability_source_type, "public_status");
assert.equal(rtocGptOffer.availability_source_url, "https://ai.rtoc.cc/pricing");
assert.match(rtocGptOffer.availability_note, /performance summary 近 24 小时/);
assert.equal(rtocParsed.station.availability_seven_day_rate, 0.9744);
assert.equal(rtocParsed.station.availability_seven_day_samples, 6);
assert.match(rtocParsed.station.availability_note, /2 个标准模型/);

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

const aiTransitSnapshot = __test.parsePricingPayload(
  configuredAiTransitSnapshotSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-05T08:40:00.000Z",
    station: {
      name: "Sub2API",
      homepage_url: "https://sub.dimension.cc.cd/home",
      price_url: "https://sub.dimension.cc.cd/public/transit",
      monitor_url: "https://sub.dimension.cc.cd/public/transit?view=monitoring",
      system_type: "sub2api",
    },
    billing: {
      currency: "CNY",
      credit_currency: "USD",
      recharge_ratio: "1 CNY = 1 USD balance",
      recharge_multiplier: 1,
      minimum_top_up: 1,
    },
    groups: [
      {
        name: "gpt free号池",
        platform: "openai",
        rate_multiplier: 0.1,
        cache_usage: {
          total: {
            input_tokens: 1_000,
            cache_creation_tokens: 200,
            cache_read_tokens: 8_800,
            cache_hit_rate: 88,
          },
        },
        models: [
          {
            standard_model: "gpt-5.5",
            raw_model: "gpt-5.5",
            platform: "openai",
            billing_mode: "token",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.00003,
              cache_read_usd_per_token: 0.0000005,
            },
          },
        ],
      },
      {
        name: "image",
        platform: "openai",
        rate_multiplier: 1,
        models: [
          {
            standard_model: "gpt-image-2",
            raw_model: "gpt-image-2",
            platform: "openai",
            billing_mode: "per_request",
            price: {
              image_output_usd_per_token: 0.00003,
            },
          },
        ],
      },
    ],
    monitoring: [
      {
        name: "gpt free号池",
        provider: "openai",
        primary_model: "gpt-5.5",
        primary_status: "operational",
        availability_7d: 96.5,
        latest_latency_ms: 1985,
        last_checked_at: "2026-07-05T08:35:59.000Z",
        timeline: [
          { status: "operational", latency_ms: 1985, checked_at: "2026-07-05T08:35:59.000Z" },
          { status: "error", latency_ms: 24, checked_at: "2026-07-05T08:25:59.000Z" },
        ],
      },
    ],
  },
  "2026-07-05T08:40:00.000Z",
);
assert.equal(aiTransitSnapshot.station.collector_kind, "ai_transit_snapshot");
assert.equal(aiTransitSnapshot.station.published, true);
assert.equal(aiTransitSnapshot.offers.length, 2);
const aiTransitGpt = aiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5");
assert.equal(aiTransitGpt.recharge_ratio, "1:1");
assert.equal(aiTransitGpt.model_multiplier, 0.1);
assert.equal(aiTransitGpt.input_price, 0.1);
assert.equal(aiTransitGpt.output_price, 0.1);
assert.equal(aiTransitGpt.cache_read_price, 0.1);
assert.equal(aiTransitGpt.cache_hit_rate, 0.88);
assert.equal(aiTransitGpt.cache_hit_sample_tokens, 10000);
assert.equal(aiTransitGpt.availability_seven_day_rate, 0.965);
assert.equal(aiTransitGpt.availability_seven_day_samples, 2);
assert.equal(aiTransitGpt.availability_latest_latency_ms, 1985);
assert.equal(aiTransitGpt.availability_avg_latency_7d_ms, 1005);
assert.equal(aiTransitGpt.availability_source_type, "public_status");
const aiTransitImage = aiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT Image 2");
assert.equal(aiTransitImage.family, "image");
assert.equal(aiTransitImage.image_output_price, 0.000001);
assert.equal(aiTransitSnapshot.availabilitySamples.length, 4);
assert.equal(aiTransitSnapshot.station.availability_seven_day_rate, 0.965);
assert.equal(aiTransitSnapshot.station.availability_seven_day_samples, 2);
assert.equal(aiTransitSnapshot.station.availability_latest_latency_ms, 1985);
assert.equal(aiTransitSnapshot.station.availability_avg_latency_7d_ms, 1005);

const onehopSource = {
  id: "onehop-ai",
  name: "OneHop",
  websiteUrl: "https://onehop.ai/",
  apiBaseUrl: "https://api.onehop.ai/v1",
  pricingUrl: "https://onehop.ai/platform/models",
  pricingEndpointUrl: "https://api.onehop.ai/public/models?locale=zh-Hans&limit=100",
  collectorKind: "onehop_public_models",
  rechargeRatio: "6.8:1",
};
const onehop = __test.parseOneHopPublicModelsPayload(
  onehopSource,
  {
    data: {
      items: [
        {
          fullSlug: "zhipu/glm-5.2",
          displayName: "GLM-5.2",
          provider: "zhipu",
          source: "Official",
          inputPricePer1m: "0.70000000",
          outputPricePer1m: "2.20000000",
          officialInputPricePer1m: "1.40000000",
          officialOutputPricePer1m: "4.40000000",
          available: true,
        },
        {
          fullSlug: "deepseek/deepseek-v4-flash",
          displayName: "DeepSeek V4 Flash",
          provider: "deepseek",
          source: "Official",
          inputPricePer1m: "0.11200000",
          outputPricePer1m: "0.22400000",
          officialInputPricePer1m: "0.14000000",
          officialOutputPricePer1m: "0.28000000",
          available: true,
        },
      ],
    },
  },
  "2026-07-02T07:30:00.000Z",
);
const onehopGlm = onehop.offers.find((offer) => offer.standard_model === "GLM-5.2");
assert.equal(onehopGlm.model_multiplier, 0.0875);
assert.equal(onehopGlm.input_price, 0.0875);
assert.equal(onehopGlm.output_price, 0.078571);
const onehopDeepSeek = onehop.offers.find((offer) => offer.standard_model === "DeepSeek V4 Flash");
assert.equal(onehopDeepSeek.model_multiplier, 0.112);
assert.equal(onehopDeepSeek.output_price, 0.112);

const stationRefresh = __test.mergeStationForRefresh(
  { id: "apinode-ltd", station_system: "sub_to_api", published: true, data_status: "verified" },
  { id: "apinode-ltd", station_system: "custom", published: true },
  {},
);
assert.equal(stationRefresh.station_system, "custom");

const stationRefreshFromUnknown = __test.mergeStationForRefresh(
  { id: "wawazz-xyz", station_system: "sub_to_api", operator_type: "individual", invoice_support: "supported" },
  { id: "wawazz-xyz", station_system: "unknown", operator_type: "unknown", invoice_support: "unknown", published: true },
  {},
);
assert.equal(stationRefreshFromUnknown.station_system, "sub_to_api");
assert.equal(stationRefreshFromUnknown.operator_type, "individual");
assert.equal(stationRefreshFromUnknown.invoice_support, "supported");

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
