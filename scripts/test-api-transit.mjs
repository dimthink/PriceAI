#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { __test } from "./collect-api-transit.mjs";

const leaseCliSmoke = spawnSync(process.execPath, [fileURLToPath(new URL("./collect-api-transit.mjs", import.meta.url)), "--post", "--source", "__lease_smoke__"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  encoding: "utf8",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
  },
});
const leaseCliOutput = `${leaseCliSmoke.stdout || ""}\n${leaseCliSmoke.stderr || ""}`;
assert.notEqual(leaseCliSmoke.status, 0, "Lease smoke must stop at the intentionally unreachable local Supabase endpoint.");
assert.doesNotMatch(leaseCliOutput, /ReferenceError:\s*env is not defined/, "CLI lease setup must use the initialized runtime environment.");
assert.match(leaseCliOutput, /fetch failed|ECONNREFUSED|bad port/i, "Lease smoke must reach the Supabase client without touching a real project.");

const transitSourceConfig = JSON.parse(readFileSync(new URL("../config/api-transit-sources.json", import.meta.url), "utf8"));
const configuredRtocSource = transitSourceConfig.find((source) => source.id === "ai-rtoc-cc");
assert.ok(configuredRtocSource, "RTOC AI must stay in API transit public collection sources.");
assert.equal(configuredRtocSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredRtocSource.pricingUrl, "https://ai.rtoc.cc/.well-known/ai-transit.json");
assert.equal(configuredRtocSource.pricingEndpointUrl, "https://api.rtoc.cc/api/public/transit/v1/snapshot");
assert.equal(configuredRtocSource.monitorUrl, "https://ai.rtoc.cc/pricing");
assert.equal("monitorEndpointUrl" in configuredRtocSource, false);
const configuredAiTransitSnapshotSource = transitSourceConfig.find((source) => source.id === "sub-dimension-cc-cd");
assert.ok(configuredAiTransitSnapshotSource, "Sub2API ai-transit snapshot test station must stay in collection sources.");
assert.equal(configuredAiTransitSnapshotSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredAiTransitSnapshotSource.autoPublish, true);
const configuredApinodeSource = transitSourceConfig.find((source) => source.id === "apinode-ltd");
assert.ok(configuredApinodeSource, "APINode must stay in API transit public collection sources.");
assert.equal(configuredApinodeSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredApinodeSource.pricingUrl, "https://apinode.ltd/public/transit");
assert.equal(configuredApinodeSource.pricingEndpointUrl, "https://apinode.ltd/api/public/transit/v1/snapshot");
assert.equal(configuredApinodeSource.monitorUrl, "https://apinode.ltd/public/transit?view=monitoring");
assert.equal(configuredApinodeSource.stationSystem, "sub_to_api");
assert.equal(configuredApinodeSource.autoPublish, true);
const configuredCallaiSource = transitSourceConfig.find((source) => source.id === "sub-callai-one");
assert.ok(configuredCallaiSource, "Sub Callai One must stay in API transit public collection sources.");
assert.equal(configuredCallaiSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredCallaiSource.pricingUrl, "https://sub.callai.one/public/transit");
assert.equal(configuredCallaiSource.pricingEndpointUrl, "https://sub.callai.one/api/public/transit/v1/snapshot");
assert.equal(configuredCallaiSource.monitorUrl, "https://sub.callai.one/public/transit?view=monitoring");
assert.equal(configuredCallaiSource.stationSystem, "sub_to_api");
assert.equal(configuredCallaiSource.rechargeRatio, "1:1");
assert.equal(configuredCallaiSource.autoPublish, true);
assert.equal("partnerTokenEnv" in configuredCallaiSource, false);
assert.equal(configuredCallaiSource.groupAliases, undefined);
const configuredAliuapiSource = transitSourceConfig.find((source) => source.id === "aliuapi-top");
assert.ok(configuredAliuapiSource, "A6-API must stay in API transit public collection sources.");
assert.equal(configuredAliuapiSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredAliuapiSource.pricingUrl, "https://aliuapi.top/public/transit");
assert.equal(configuredAliuapiSource.pricingEndpointUrl, "https://aliuapi.top/api/public/transit/v1/snapshot");
assert.equal(configuredAliuapiSource.monitorUrl, "https://aliuapi.top/public/transit?view=monitoring");
assert.equal(configuredAliuapiSource.stationSystem, "sub_to_api");
assert.equal(configuredAliuapiSource.autoPublish, true);
assert.deepEqual(configuredAliuapiSource.groupAliases, {
  Plus: "T0 - GPT Plus",
  Pro: "T1 - GPT Pro",
});
const configuredMfttaiSource = transitSourceConfig.find((source) => source.id === "mfttai-com");
assert.ok(configuredMfttaiSource, "MFAPI must stay in API transit public collection sources.");
assert.equal(configuredMfttaiSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredMfttaiSource.websiteUrl, "https://mfttai.com/register?aff=PRICEAI");
assert.equal(configuredMfttaiSource.pricingUrl, "https://mfttai.com/public/transit");
assert.equal(configuredMfttaiSource.pricingEndpointUrl, "https://mfttai.com/api/public/transit/v1/snapshot");
assert.equal(configuredMfttaiSource.monitorUrl, "https://mfttai.com/public/transit?view=monitoring");
assert.equal(configuredMfttaiSource.stationSystem, "sub_to_api");
assert.equal(configuredMfttaiSource.rechargeRatio, "1:1");
assert.equal(configuredMfttaiSource.autoPublish, true);
const configuredWawazzSource = transitSourceConfig.find((source) => source.id === "wawazz-xyz");
assert.ok(configuredWawazzSource, "WAWA ZZ API must stay in API transit public collection sources.");
assert.equal(configuredWawazzSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredWawazzSource.pricingUrl, "https://wawazz.xyz/public/transit");
assert.equal(configuredWawazzSource.pricingEndpointUrl, "https://wawazz.xyz/api/public/transit/v1/snapshot");
assert.equal(configuredWawazzSource.monitorUrl, "https://wawazz.xyz/public/transit?view=monitoring");
assert.equal(configuredWawazzSource.stationSystem, "sub_to_api");
assert.equal(configuredWawazzSource.rechargeRatio, "1:1");
assert.equal(configuredWawazzSource.autoPublish, true);
assert.equal(configuredWawazzSource.disableGlobalModelAvailabilityFallback, true);
assert.deepEqual(configuredWawazzSource.groupAliases, {
  "cc-kiro-power": "claude-krio-power",
  "cc-max分组": "claude-max-号池-不限制客户端",
  "gpt-plus分组": "gpt-plus",
  "gpt-pro分组": "gpt-pro",
});
assert.equal(configuredWawazzSource.aiTransitGroupModels["gpt-plus"], undefined);
assert.equal(configuredWawazzSource.aiTransitGroupModels["gpt-pro"], undefined);
const configuredMaofeiSource = transitSourceConfig.find((source) => source.id === "999555999-com");
assert.ok(configuredMaofeiSource, "猫肥NekoAPI public snapshot must stay attached to the existing station source.");
assert.ok(
  !transitSourceConfig.some((source) => source.id === "api-999555999-com"),
  "猫肥NekoAPI must not be collected as a duplicate api-999555999-com station.",
);
assert.equal(configuredMaofeiSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredMaofeiSource.websiteUrl, "https://www.999555999.com/");
assert.equal(configuredMaofeiSource.pricingUrl, "https://api.999555999.com/public/transit");
assert.equal(configuredMaofeiSource.pricingEndpointUrl, "https://api.999555999.com/api/public/transit/v1/snapshot");
assert.equal(configuredMaofeiSource.monitorUrl, "https://api.999555999.com/public/transit?view=monitoring");
assert.equal(configuredMaofeiSource.stationSystem, "sub_to_api");
assert.equal(configuredMaofeiSource.rechargeRatio, "1:1");
assert.equal(configuredMaofeiSource.autoPublish, true);
const configuredOnePkapiSource = transitSourceConfig.find((source) => source.id === "api-1pkapi-com");
assert.ok(configuredOnePkapiSource, "皓悦 API must stay saved as an API transit draft source.");
assert.equal(configuredOnePkapiSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredOnePkapiSource.stationSystem, "sub_to_api");
assert.equal(configuredOnePkapiSource.websiteUrl, "https://api.1pkapi.com/");
assert.equal(configuredOnePkapiSource.pricingUrl, "https://api.1pkapi.com/public/transit");
assert.equal(configuredOnePkapiSource.pricingEndpointUrl, "https://api.1pkapi.com/api/public/transit/v1/snapshot");
assert.equal(configuredOnePkapiSource.monitorUrl, "https://api.1pkapi.com/public/transit?view=monitoring");
assert.equal(configuredOnePkapiSource.rechargeRatio, "1:1");
assert.equal(configuredOnePkapiSource.autoPublish, false);
assert.equal(configuredOnePkapiSource.commercialRelation, "none");
assert.equal(configuredOnePkapiSource.operatorType, "unknown");
assert.equal(configuredOnePkapiSource.invoiceSupport, "unknown");
assert.ok(
  configuredOnePkapiSource.adminNote.includes("autoPublish=false"),
  "皓悦 API 后台备注必须明确保持待审核草稿，不自动上前台。",
);
const configuredOnepigSource = transitSourceConfig.find((source) => source.id === "onepig123-com");
assert.ok(configuredOnepigSource, "粉猪模型网关/路由层 must stay saved as an API transit draft source.");
assert.equal(configuredOnepigSource.collectorKind, "ai_transit_snapshot");
assert.equal(configuredOnepigSource.stationSystem, "sub_to_api");
assert.equal(configuredOnepigSource.websiteUrl, "https://onepig123.com/");
assert.equal(configuredOnepigSource.apiBaseUrl, "https://onepig123.com/v1");
assert.equal(configuredOnepigSource.pricingUrl, "https://onepig123.com/public/transit");
assert.equal(configuredOnepigSource.pricingEndpointUrl, "https://onepig123.com/api/public/transit/v1/snapshot");
assert.equal(configuredOnepigSource.monitorUrl, "https://onepig123.com/public/transit?view=monitoring");
assert.equal(configuredOnepigSource.rechargeRatio, "1:1");
assert.equal(configuredOnepigSource.autoPublish, false);
assert.equal(configuredOnepigSource.commercialRelation, "none");
assert.equal(configuredOnepigSource.operatorType, "unknown");
assert.equal(configuredOnepigSource.invoiceSupport, "unknown");
assert.ok(
  configuredOnepigSource.adminNote.includes("autoPublish=false"),
  "粉猪模型网关/路由层后台备注必须明确保持待审核草稿，不自动上前台。",
);
const configuredYujianSource = transitSourceConfig.find((source) => source.id === "yujianwudi-top");
assert.ok(configuredYujianSource, "天机阁 must stay saved as an API transit draft source.");
assert.equal(configuredYujianSource.collectorKind, "new_api_pricing");
assert.equal(configuredYujianSource.stationSystem, "new_api");
assert.equal(configuredYujianSource.pricingUrl, "https://yujianwudi.top/pricing");
assert.equal(configuredYujianSource.pricingEndpointUrl, "https://yujianwudi.top/api/pricing");
assert.equal(configuredYujianSource.monitorEndpointUrl, "https://yujianwudi.top/api/perf-metrics/summary?period=24");
assert.equal(configuredYujianSource.rechargeRatio, "1:1");
assert.equal(configuredYujianSource.autoPublish, false);
assert.equal(configuredYujianSource.commercialRelation, "affiliate");
assert.equal(configuredYujianSource.operatorType, "individual");
assert.equal(configuredYujianSource.invoiceSupport, "supported");
assert.equal(Boolean(configuredYujianSource.monitorUrl), false);
assert.ok(
  configuredYujianSource.adminNote.includes("Pro 号池常规 0.20 倍率"),
  "天机阁后台备注必须保留站长提交的常规 Pro 倍率口径。",
);
const configuredUmapisSource = transitSourceConfig.find((source) => source.id === "umapis-com");
assert.ok(configuredUmapisSource, "悠米AI中转 must stay saved as an API transit draft source.");
assert.equal(configuredUmapisSource.collectorKind, "new_api_pricing");
assert.equal(configuredUmapisSource.stationSystem, "new_api");
assert.equal(configuredUmapisSource.websiteUrl, "https://www.umapis.com/");
assert.equal(configuredUmapisSource.pricingUrl, "https://www.umapis.com/pricing");
assert.equal(configuredUmapisSource.pricingEndpointUrl, "https://www.umapis.com/api/pricing");
assert.equal(configuredUmapisSource.monitorEndpointUrl, "https://www.umapis.com/api/perf-metrics/summary?period=24");
assert.equal(configuredUmapisSource.autoPublish, false);
assert.equal(configuredUmapisSource.commercialRelation, "none");
assert.equal(configuredUmapisSource.operatorType, "unknown");
assert.equal(configuredUmapisSource.invoiceSupport, "unknown");
assert.equal(Boolean(configuredUmapisSource.monitorUrl), false);
assert.ok(
  configuredUmapisSource.adminNote.includes("GPT-Pro 0.15"),
  "悠米AI中转后台备注必须保留公开读取到的 GPT-Pro 分组倍率。",
);
assert.ok(
  configuredUmapisSource.adminNote.includes("充值倍率"),
  "悠米AI中转后台备注必须列出正式上架前需要补充的充值倍率。",
);

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

assert.deepEqual(
  __test.dedupeRowsById([
    { id: "sample-1", ok: false },
    { id: "sample-1", ok: true },
    { id: "sample-2", ok: true },
  ]),
  [
    { id: "sample-1", ok: true },
    { id: "sample-2", ok: true },
  ],
);

existingOffers.set("published-new-api|GPT 5.5|priceai-probe", {
  id: "keep-priceai-probe",
  station_id: "published-new-api",
  standard_model: "GPT 5.5",
  group_name: "priceai-probe",
  status: "active",
  availability_source_type: "priceai_probe",
});
assert.deepEqual(__test.findStaleRefreshedOfferIds(existingOffers, keys), ["deactivate", "keep-priceai-probe"]);

assert.equal(
  __test.mergeOfferForRefresh(
    { id: "new", auto_publish: false, status: "needs_review", created_at: "new" },
    { id: "old", status: "active", created_at: "old" },
    true,
  ).status,
  "active",
);

const publicStatusPreferredStation = __test.mergeStationForRefresh(
  {
    id: "published-new-api",
    auto_publish: true,
    collection_status: "success",
    availability_seven_day_rate: 0.8,
    availability_seven_day_samples: 10,
    availability_source_type: "public_status",
    availability_source_label: "公开监测页",
    created_at: "incoming",
  },
  {
    id: "published-new-api",
    published: true,
    availability_seven_day_rate: 0.95,
    availability_seven_day_samples: 50,
    availability_source_type: "priceai_probe",
    availability_source_label: "PriceAI 实测",
    created_at: "existing",
  },
  {},
);
assert.equal(publicStatusPreferredStation.availability_source_type, "public_status");
assert.equal(publicStatusPreferredStation.availability_seven_day_rate, 0.8);
assert.equal(publicStatusPreferredStation.availability_seven_day_samples, 10);

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

const preservedRicherAvailabilityOffer = __test.mergeOfferForRefresh(
  {
    id: "new",
    auto_publish: true,
    status: "active",
    created_at: "new",
    cache_hit_rate: 0,
    cache_hit_sample_tokens: 0,
    availability_source_type: "public_model_catalog",
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_note: "ai-transit 公开快照已返回价格；该模型暂无公开监测样本，非 PriceAI API Key 实测。",
  },
  {
    id: "old",
    status: "active",
    created_at: "old",
    cache_hit_rate: 0.42,
    cache_hit_sample_tokens: 2000,
    availability_source_type: "public_status",
    availability_source_label: "公开监测页",
    availability_seven_day_rate: 0.75,
    availability_seven_day_samples: 8,
    availability_first_checked_at: "2026-07-01T00:00:00.000Z",
    availability_last_checked_at: "2026-07-03T00:00:00.000Z",
    availability_note: "旧公开监测样本。",
  },
  true,
);
assert.equal(preservedRicherAvailabilityOffer.availability_source_type, "public_status");
assert.equal(preservedRicherAvailabilityOffer.availability_seven_day_rate, 0.75);
assert.equal(preservedRicherAvailabilityOffer.cache_hit_rate, 0.42);
assert.equal(preservedRicherAvailabilityOffer.cache_hit_sample_tokens, 2000);

const incomingPublicStatusBeatsEmptyProbeOffer = __test.mergeOfferForRefresh(
  {
    id: "new",
    auto_publish: true,
    status: "active",
    created_at: "new",
    availability_source_type: "public_status",
    availability_source_label: "公开监测页",
    availability_seven_day_rate: 1,
    availability_seven_day_samples: 1,
    availability_last_checked_at: "2026-07-07T09:38:10.000Z",
    availability_note: "ai-transit 公开监测样本。",
  },
  {
    id: "old",
    status: "active",
    created_at: "old",
    availability_source_type: "priceai_probe",
    availability_source_label: "PriceAI 实测",
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_note: "暂无 PriceAI API Key 可用性探测样本。",
  },
  true,
);
assert.equal(incomingPublicStatusBeatsEmptyProbeOffer.availability_source_type, "public_status");
assert.equal(incomingPublicStatusBeatsEmptyProbeOffer.availability_seven_day_samples, 1);

const refreshedAiTransitStation = __test.mergeStationForRefresh(
  {
    id: "aliuapi-top",
    name: "A6-API",
    auto_publish: true,
    published: true,
    collection_status: "success",
    collector_kind: "ai_transit_snapshot",
    summary: "A6-API 使用 Sub2API 系统，公开 ai-transit.v1 快照可读取模型价格和缓存命中率。",
    created_at: "new",
  },
  {
    id: "aliuapi-top",
    published: false,
    summary: "登录和分组接口启用 Turnstile，需要人工通过校验后才能采集分组倍率。",
    created_at: "old",
  },
  {},
);
assert.match(refreshedAiTransitStation.summary, /公开 ai-transit\.v1 快照/);

const preservedManualStationSummary = __test.mergeStationForRefresh(
  {
    id: "manual-summary",
    auto_publish: true,
    published: true,
    collection_status: "success",
    collector_kind: "ai_transit_snapshot",
    summary: "公开快照简介。",
    created_at: "new",
  },
  {
    id: "manual-summary",
    published: true,
    summary: "站长已补充人工说明，保留该说明。",
    created_at: "old",
  },
  {},
);
assert.equal(preservedManualStationSummary.summary, "站长已补充人工说明，保留该说明。");

const preservedManualStationLabels = __test.mergeStationForRefresh(
  {
    id: "manual-labels",
    auto_publish: true,
    published: true,
    collection_status: "success",
    channel_types: ["first_party_pool", "reverse_engineered"],
    account_pools: ["plus", "kiro"],
    risk_labels: ["insufficient_samples", "third_party_aggregate"],
    created_at: "new",
  },
  {
    id: "manual-labels",
    published: true,
    channel_types: [],
    account_pools: [],
    risk_labels: [],
    created_at: "old",
  },
  {},
);
assert.deepEqual(preservedManualStationLabels.channel_types, []);
assert.deepEqual(preservedManualStationLabels.account_pools, []);
assert.deepEqual(preservedManualStationLabels.risk_labels, []);

const preservedNonEmptyManualStationLabels = __test.mergeStationForRefresh(
  {
    id: "manual-non-empty-labels",
    auto_publish: true,
    published: true,
    collection_status: "success",
    channel_types: ["first_party_pool", "reverse_engineered"],
    account_pools: ["plus", "kiro"],
    risk_labels: ["insufficient_samples", "third_party_aggregate"],
    created_at: "new",
  },
  {
    id: "manual-non-empty-labels",
    published: true,
    channel_types: ["official_api"],
    account_pools: ["official_api"],
    risk_labels: ["reseller"],
    created_at: "old",
  },
  {},
);
assert.deepEqual(preservedNonEmptyManualStationLabels.channel_types, ["official_api"]);
assert.deepEqual(preservedNonEmptyManualStationLabels.account_pools, ["official_api"]);
assert.deepEqual(preservedNonEmptyManualStationLabels.risk_labels, ["reseller"]);

const failedRefreshPreservesPublishedStationState = __test.mergeStationForRefresh(
  {
    id: "wawazz-xyz",
    status: "unknown",
    auto_publish: false,
    published: false,
    collection_status: "failed",
    collection_error: "HTTP 502",
    data_status: "pending_review",
    admin_note: "自动抓取未识别到 MVP 模型，待人工确认。",
    created_at: "new",
  },
  {
    id: "wawazz-xyz",
    status: "active",
    published: true,
    data_status: "verified",
    admin_note: "上一轮成功采集。",
    created_at: "old",
  },
  {},
);
assert.equal(failedRefreshPreservesPublishedStationState.status, "active");
assert.equal(failedRefreshPreservesPublishedStationState.published, true);
assert.equal(failedRefreshPreservesPublishedStationState.data_status, "verified");
assert.equal(failedRefreshPreservesPublishedStationState.collection_status, "failed");
assert.equal(failedRefreshPreservesPublishedStationState.collection_error, "HTTP 502");
assert.equal(failedRefreshPreservesPublishedStationState.admin_note, "上一轮成功采集。");

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
const customAdminNoteParsedStation = __test.parsePricingPayload(
  {
    id: "custom-admin-note",
    name: "Custom Admin Note",
    websiteUrl: "https://example.com/",
    apiBaseUrl: "https://example.com/v1",
    pricingUrl: "https://example.com/pricing",
    pricingEndpointUrl: "https://example.com/api/pricing",
    collectorKind: "new_api_pricing",
    adminNote: "保留来源配置中的人工备注。",
  },
  {
    data: [
      {
        model_name: "gpt-5.5",
        model_ratio: 1,
        completion_ratio: 2,
        enable_groups: ["pro"],
      },
    ],
    group_ratio: { pro: 0.2 },
  },
  "2026-07-12T05:23:00.000Z",
).station;
assert.equal(customAdminNoteParsedStation.admin_note, "保留来源配置中的人工备注。");
assert.equal(customAdminNoteParsedStation.published, false);
assert.equal(__test.standardizeModelName("anthropic/claude-sonnet-5"), "Claude Sonnet 5");
assert.equal(__test.standardizeModelName("Claude Sonnet 5"), "Claude Sonnet 5");
assert.equal(__test.standardizeModelName("claude-sonnet-5-0"), "Claude Sonnet 5");
assert.equal(__test.standardizeModelName("anthropic/claude-fable-5"), "Claude Fable 5");
assert.equal(__test.standardizeModelName("Claude Fable 5"), "Claude Fable 5");
assert.equal(__test.standardizeModelName("claude-fable-5-0"), "Claude Fable 5");
assert.equal(__test.standardizeModelName("claude-haiku-4-5-20251001"), "Claude Haiku 4.5");
assert.equal(__test.standardizeModelName("claude-opus-4-5-20251101"), "Claude Opus 4.5");
assert.equal(__test.standardizeModelName("claude-sonnet-4-5-20250929-thinking"), "Claude Sonnet 4.5");
assert.equal(__test.standardizeModelName("openai/gpt-image-2"), "GPT Image 2");
assert.equal(__test.standardizeModelName("google/gemini-3-pro-image-preview"), "Nano Banana Pro");
assert.equal(__test.standardizeModelName("google/gemini-3.1-flash-lite-image"), "Nano Banana Lite");
assert.equal(__test.standardizeModelName("google/gemini-3.1-flash-image-preview"), "Nano Banana 2");
assert.equal(__test.standardizeModelName("google/gemini-2.5-flash-image"), "Nano Banana");
assert.equal(__test.standardizeModelName("google/nano-banana-pro"), "Nano Banana Pro");
assert.equal(__test.standardizeModelName("google/nano-banana-2"), "Nano Banana 2");
assert.equal(__test.standardizeModelName("google/nano-banana"), "Nano Banana");
assert.equal(__test.standardizeModelName("google/nano-banana-lite"), "Nano Banana Lite");
assert.equal(__test.standardizeModelName("openai/sora-2-pro"), "Sora 2 Pro");
assert.equal(__test.standardizeModelName("openai/sora-2"), "Sora 2");
assert.equal(__test.standardizeModelName("codex-auto-review"), "Codex Compact");
assert.equal(__test.standardizeModelName("grok-4.20-multi-agent-xhigh"), "Grok 4.20");
assert.equal(__test.standardizeModelName("grok-4.3-medium"), "Grok 4.3");
assert.equal(__test.standardizeModelName("grok-build-console"), "Grok Build");
assert.equal(__test.standardizeModelName("xai/grok-4.5-latest"), "Grok 4.5");
assert.equal(__test.standardizeModelName("xai/composer-2.5"), "Composer 2.5");
assert.equal(__test.standardizeModelName("xai/grok-composer-2.5-fast"), "Composer 2.5");
assert.equal(__test.standardizeModelName("xai/grok-imagine"), "Grok Image");
assert.equal(__test.standardizeModelName("xai/grok-imagine-edit"), "Grok Image");
assert.equal(__test.standardizeModelName("xai/grok-imagine-image"), "Grok Image");
assert.equal(__test.standardizeModelName("xai/grok-imagine-image-quality"), "Grok Image");
assert.equal(__test.standardizeModelName("xai/grok-imagine-video-1.5-preview"), "Grok Video");
assert.equal(__test.standardizeModelName("google/veo-3.1-lite"), "Veo 3.1 Lite");
assert.equal(__test.standardizeModelName("google/veo-3.1"), "Veo 3.1");
assert.equal(__test.standardizeModelName("google/gemini-omni-flash"), "Gemini Omni Flash");
assert.equal(__test.standardizeModelName("volcengine/video-ds-2.0"), "Seedance 2.0");
assert.equal(__test.standardizeModelName("bytedance/seedance-2.0"), "Seedance 2.0");
assert.equal(__test.standardizeModelName("kling/kling-2.5-turbo"), "Kling 2.5 Turbo");
assert.equal(__test.standardizeModelName("claude-3-5-sonnet-20241022"), null);
assert.equal(__test.standardizeModelName("openai/gpt-5.6"), "GPT 5.6 Sol");
assert.equal(__test.standardizeModelName("openai/gpt-5.6-sol"), "GPT 5.6 Sol");
assert.equal(__test.standardizeModelName("openai/gpt-5.6-terra"), "GPT 5.6 Terra");
assert.equal(__test.standardizeModelName("openai/gpt-5.6-luna"), "GPT 5.6 Luna");
assert.equal(__test.standardizeModelName("openai/gpt-5.6-mini"), null);
assert.equal(__test.standardizeModelName("gpt-5.4-mini"), "GPT 5.4 Mini");
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
    {
      model_name: "xai/grok-imagine-image",
      quota_type: 1,
      model_ratio: 0,
      model_price: 0.03,
      enable_groups: ["default"],
    },
    {
      model_name: "xai/grok-imagine-video",
      quota_type: 1,
      model_ratio: 0,
      model_price: 0.12,
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
assert.equal(fixedOffersByModel.get("Grok Image").family, "grok");
assert.equal(fixedOffersByModel.get("Grok Image").model_multiplier, 0.03);
assert.equal(fixedOffersByModel.get("Grok Video").family, "grok");
assert.equal(fixedOffersByModel.get("Grok Video").model_multiplier, 0.12);

const legacyNewApiPerformanceSource = {
  ...configuredRtocSource,
  collectorKind: "new_api_pricing",
  pricingUrl: "https://ai.rtoc.cc/pricing",
  pricingEndpointUrl: "https://api.rtoc.cc/api/pricing",
  monitorUrl: "https://ai.rtoc.cc/pricing",
  monitorEndpointUrl: "https://api.rtoc.cc/api/perf-metrics/summary?period=24",
};
const legacyNewApiParsed = __test.parsePricingPayload(
  legacyNewApiPerformanceSource,
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
  legacyNewApiPerformanceSource,
  legacyNewApiParsed,
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
const legacyNewApiGptOffer = legacyNewApiParsed.offers.find((offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "GPT");
assert.equal(legacyNewApiGptOffer.availability_seven_day_rate, 0.9761);
assert.equal(legacyNewApiGptOffer.availability_seven_day_samples, 3);
assert.equal(legacyNewApiGptOffer.availability_source_type, "public_status");
assert.equal(legacyNewApiGptOffer.availability_source_url, "https://ai.rtoc.cc/pricing");
assert.match(legacyNewApiGptOffer.availability_note, /performance summary 近 24 小时/);
assert.equal(legacyNewApiParsed.station.availability_seven_day_rate, 0.9744);
assert.equal(legacyNewApiParsed.station.availability_seven_day_samples, 6);
assert.match(legacyNewApiParsed.station.availability_note, /2 个标准模型/);

const rtocSnapshotParsed = __test.parsePricingPayload(
  configuredRtocSource,
  {
    schema_version: "ai-transit.v1",
    system: "new_api",
    generated_at: "2026-07-14T04:31:44Z",
    billing: {
      recharge_ratio: "1:1",
      minimum_top_up: 10,
    },
    groups: [
      {
        name: "GPT",
        platform: "openai",
        rate_multiplier: 0.03,
        cache_usage: {
          last_7d: {
            input_tokens: 1000,
            cache_creation_tokens: 500,
            cache_read_tokens: 8500,
            cache_hit_rate: 85,
          },
        },
        models: [
          {
            standard_model: "codex-auto-review",
            raw_model: "codex-auto-review",
            price: {
              input_usd_per_token: 0.000001,
              output_usd_per_token: 0.000006,
            },
          },
          {
            standard_model: "gpt-5.6-luna",
            raw_model: "gpt-5.6-luna",
            price: {
              input_usd_per_token: 0.000001,
              output_usd_per_token: 0.000006,
              cache_read_usd_per_token: 0.0000001,
              cache_write_usd_per_token: 0.00000125,
            },
          },
        ],
      },
      {
        name: "Kiro",
        platform: "anthropic",
        rate_multiplier: 0.22,
        models: [
          {
            standard_model: "claude-haiku-4-5-20251001",
            raw_model: "claude-haiku-4-5-20251001",
            price: {
              input_usd_per_token: 0.000001,
              output_usd_per_token: 0.000005,
              cache_read_usd_per_token: 0.0000001,
              cache_write_usd_per_token: 0.00000125,
            },
          },
        ],
      },
      {
        name: "claude",
        platform: "anthropic",
        rate_multiplier: 0.8,
        models: [
          {
            standard_model: "claude-sonnet-4-5-20250929",
            raw_model: "claude-sonnet-4-5-20250929",
            price: {
              input_usd_per_token: 0.000003,
              output_usd_per_token: 0.000015,
              cache_read_usd_per_token: 0.0000003,
              cache_write_usd_per_token: 0.00000375,
            },
          },
          {
            standard_model: "claude-opus-4-5-20251101",
            raw_model: "claude-opus-4-5-20251101",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.000025,
              cache_read_usd_per_token: 0.0000005,
              cache_write_usd_per_token: 0.00000625,
            },
          },
        ],
      },
      {
        name: "生图",
        platform: "google",
        rate_multiplier: 1,
        models: [
          {
            standard_model: "gemini-3.1-flash-lite-image",
            raw_model: "gemini-3.1-flash-lite-image",
            price: {
              image_output_usd_per_token: 0.03,
            },
          },
        ],
      },
      {
        name: "福利分组",
        platform: "xai",
        rate_multiplier: 0.1,
        models: [
          {
            standard_model: "grok-4.20-multi-agent-xhigh",
            raw_model: "grok-4.20-multi-agent-xhigh",
            price: {
              input_usd_per_token: null,
              output_usd_per_token: null,
              cache_read_usd_per_token: null,
              cache_write_usd_per_token: null,
            },
          },
          {
            standard_model: "grok-4.3-medium",
            raw_model: "grok-4.3-medium",
            price: {
              input_usd_per_token: null,
              output_usd_per_token: null,
              cache_read_usd_per_token: null,
              cache_write_usd_per_token: null,
            },
          },
          {
            standard_model: "grok-build-console",
            raw_model: "grok-build-console",
            price: {
              input_usd_per_token: null,
              output_usd_per_token: null,
              cache_read_usd_per_token: null,
              cache_write_usd_per_token: null,
            },
          },
        ],
      },
    ],
    monitoring: [
      {
        name: "GPT",
        primary_model: "gpt-5.6-luna",
        primary_status: "operational",
        availability_7d: 98.86,
        sample_count_7d: 270717,
        latest_latency_ms: 14789,
        avg_latency_7d_ms: 23298,
        last_checked_at: "2026-07-14T04:31:44Z",
      },
      {
        name: "福利分组",
        primary_model: "grok-4.20-multi-agent-xhigh",
        primary_status: "degraded",
        availability_7d: 93.5,
        sample_count_7d: 35141,
        latest_latency_ms: 5020,
        avg_latency_7d_ms: 8510,
        last_checked_at: "2026-07-14T04:31:44Z",
      },
    ],
  },
  "2026-07-14T04:35:00.000Z",
);
assert.equal(rtocSnapshotParsed.station.collector_kind, "ai_transit_snapshot");
assert.equal(rtocSnapshotParsed.station.station_system, "new_api");
assert.equal(rtocSnapshotParsed.station.pricing_endpoint_url, "https://api.rtoc.cc/api/public/transit/v1/snapshot");
assert.equal(rtocSnapshotParsed.station.availability_seven_day_samples, 60);
assert.equal(rtocSnapshotParsed.offers.length, 9);
assert.ok(rtocSnapshotParsed.offers.some((offer) => offer.standard_model === "Codex Compact" && offer.group_name === "GPT"));
assert.ok(rtocSnapshotParsed.offers.some((offer) => offer.standard_model === "Claude Haiku 4.5" && offer.group_name === "Kiro"));
assert.ok(rtocSnapshotParsed.offers.some((offer) => offer.standard_model === "Claude Sonnet 4.5" && offer.group_name === "claude"));
assert.ok(rtocSnapshotParsed.offers.some((offer) => offer.standard_model === "Claude Opus 4.5" && offer.group_name === "claude"));
assert.ok(rtocSnapshotParsed.offers.some((offer) => offer.standard_model === "Nano Banana Lite" && offer.group_name === "生图"));
assert.ok(rtocSnapshotParsed.offers.some((offer) => offer.standard_model === "Grok 4.20" && offer.group_name === "福利分组" && offer.cache_read_price === null));
const rtocLunaOffer = rtocSnapshotParsed.offers.find((offer) => offer.standard_model === "GPT 5.6 Luna" && offer.group_name === "GPT");
assert.equal(rtocLunaOffer.cache_read_price, 0.03);
assert.equal(rtocLunaOffer.cache_write_price, 0.03);
assert.equal(rtocLunaOffer.cache_hit_rate, 0.85);
assert.equal(rtocLunaOffer.availability_seven_day_samples, 60);

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
        sample_count_7d: 42,
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
assert.equal(aiTransitGpt.raw_payload.group.rate_multiplier, 0.1);
assert.equal(aiTransitGpt.input_price, 0.1);
assert.equal(aiTransitGpt.output_price, 0.1);
assert.equal(aiTransitGpt.cache_read_price, 0.1);
assert.equal(aiTransitGpt.cache_hit_rate, 0.88);
assert.equal(aiTransitGpt.cache_hit_sample_tokens, 10000);
assert.equal(aiTransitGpt.availability_seven_day_rate, 0.965);
assert.equal(aiTransitGpt.availability_seven_day_samples, 42);
assert.equal(aiTransitGpt.availability_latest_latency_ms, 1985);
assert.equal(aiTransitGpt.availability_avg_latency_7d_ms, 1005);
assert.equal(aiTransitGpt.availability_source_type, "public_status");
const aiTransitImage = aiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT Image 2");
assert.equal(aiTransitImage.family, "image");
assert.equal(aiTransitImage.image_output_price, 1);
assert.equal(aiTransitSnapshot.availabilitySamples.length, 4);
assert.equal(aiTransitSnapshot.station.availability_seven_day_rate, 0.965);
assert.equal(aiTransitSnapshot.station.availability_seven_day_samples, 42);
assert.equal(aiTransitSnapshot.station.availability_latest_latency_ms, 1985);
assert.equal(aiTransitSnapshot.station.availability_avg_latency_7d_ms, 1005);

const longAiTransitTimeline = Array.from({ length: 63 }, (_, index) => ({
  status: index === 40 ? "error" : "operational",
  latency_ms: 1000 + index,
  checked_at: new Date(Date.UTC(2026, 6, 5, 7, index, 0)).toISOString(),
}));
const longAiTransitSnapshot = __test.parsePricingPayload(
  configuredAiTransitSnapshotSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-05T09:00:00.000Z",
    billing: {
      recharge_ratio: "1 CNY = 1 USD balance",
    },
    groups: [
      {
        name: "gpt free号池",
        platform: "openai",
        rate_multiplier: 0.1,
        models: [
          {
            standard_model: "gpt-5.5",
            raw_model: "gpt-5.5",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.00003,
            },
          },
        ],
      },
    ],
    monitoring: [
      {
        name: "gpt free号池",
        primary_model: "gpt-5.5",
        primary_status: "operational",
        availability_7d: 98.3333,
        latest_latency_ms: 1062,
        last_checked_at: "2026-07-05T08:02:00.000Z",
        timeline: longAiTransitTimeline,
      },
    ],
  },
  "2026-07-05T09:00:00.000Z",
);
const longAiTransitStationSamples = longAiTransitSnapshot.availabilitySamples.filter((sample) => sample.scope === "station");
const longAiTransitOffer = longAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5");
assert.equal(longAiTransitSnapshot.availabilitySamples.length, 120);
assert.equal(longAiTransitStationSamples.length, 60);
assert.equal(longAiTransitStationSamples[0].checked_at, longAiTransitTimeline[3].checked_at);
assert.equal(longAiTransitStationSamples.at(-1).checked_at, longAiTransitTimeline.at(-1).checked_at);
assert.equal(longAiTransitOffer.availability_seven_day_samples, 60);
assert.equal(longAiTransitSnapshot.station.availability_seven_day_samples, 60);

const aiTransitGroupRateSnapshot = __test.parsePricingPayload(
  configuredApinodeSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-10T16:53:18.000Z",
    station: {
      name: "APINode",
      homepage_url: "https://apinode.ltd/home",
      price_url: "https://apinode.ltd/public/transit",
      monitor_url: "https://apinode.ltd/public/transit?view=monitoring",
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
        name: "Plus-经济通道",
        platform: "openai",
        rate_multiplier: 0.19,
        models: [
          {
            standard_model: "gpt-5.6-sol",
            raw_model: "gpt-5.6-sol",
            platform: "openai",
            billing_mode: "token",
            price: {
              input_usd_per_token: 0.0000025,
              output_usd_per_token: 0.000015,
              cache_write_usd_per_token: 0.000003125,
              cache_read_usd_per_token: 0.00000025,
            },
          },
        ],
      },
    ],
  },
  "2026-07-10T16:54:00.000Z",
);
const aiTransitGroupRateGpt = aiTransitGroupRateSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.6 Sol");
assert.equal(aiTransitGroupRateGpt.model_multiplier, 0.19);
assert.equal(aiTransitGroupRateGpt.input_price, 0.19);
assert.equal(aiTransitGroupRateGpt.output_price, 0.19);
assert.equal(aiTransitGroupRateGpt.raw_payload.group.rate_multiplier, 0.19);
assert.equal(aiTransitGroupRateGpt.raw_payload.multiplier_basis, "ai_transit_group_rate_multiplier");

const callaiAiTransitSnapshot = __test.parsePricingPayload(
  configuredCallaiSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-07T09:20:00.000Z",
    billing: {
      recharge_ratio: "1 USD balance per 1 CNY",
      recharge_multiplier: 1,
    },
    disclosure: {
      upstream_type: "mixed",
      account_pool_type: "mixed",
    },
    groups: [
      {
        name: "claude-kiro",
        platform: "anthropic",
        rate_multiplier: 0.3,
        cache_usage: {
          last_24h: {
            input_tokens: 6_353_524,
            cache_creation_tokens: 36_899_982,
            cache_read_tokens: 508_098_145,
            cache_hit_rate: 92.15500562634573,
          },
          last_7d: {
            input_tokens: 212_504_843,
            cache_creation_tokens: 406_339_026,
            cache_read_tokens: 2_545_453_770,
            cache_hit_rate: 80.44293111454678,
          },
          total: {
            input_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cache_hit_rate: 0,
          },
        },
        models: [
          {
            standard_model: "claude-opus-4-8",
            raw_model: "claude-opus-4-8",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.000025,
              cache_read_usd_per_token: 0.0000005,
              cache_write_usd_per_token: 0.00000625,
            },
          },
        ],
      },
      {
        name: "gpt",
        platform: "openai",
        rate_multiplier: 0.1,
        cache_usage: {
          last_24h: {
            input_tokens: 550_673_960,
            cache_creation_tokens: 0,
            cache_read_tokens: 4_635_624_448,
            cache_hit_rate: 89.38213892300197,
          },
          last_7d: {
            input_tokens: 2_441_272_235,
            cache_creation_tokens: 0,
            cache_read_tokens: 22_916_770_246,
            cache_hit_rate: 90.37278907932593,
          },
          total: {
            input_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cache_hit_rate: 0,
          },
        },
        models: [
          {
            standard_model: "gpt-5.5",
            raw_model: "gpt-5.5",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.00003,
              cache_read_usd_per_token: 0.0000005,
            },
          },
        ],
      },
    ],
    monitoring: [
      {
        name: "claude-kiro",
        primary_model: "claude-opus-4-8",
        primary_status: "operational",
        availability_7d: 81.18615491421204,
        latest_latency_ms: 1414,
        last_checked_at: "2026-07-07T09:19:11.000Z",
        timeline: [
          { status: "operational", latency_ms: 1414, checked_at: "2026-07-07T09:19:11.000Z" },
        ],
      },
      {
        name: "gpt",
        primary_model: "gpt-5.5",
        primary_status: "operational",
        availability_7d: 98.78012496280869,
        latest_latency_ms: 1311,
        last_checked_at: "2026-07-07T09:19:11.000Z",
        timeline: [
          { status: "operational", latency_ms: 1311, checked_at: "2026-07-07T09:19:11.000Z" },
        ],
      },
    ],
  },
  "2026-07-07T09:20:00.000Z",
);
const callaiClaudeOffer = callaiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "Claude Opus 4.8");
assert.equal(callaiClaudeOffer.group_name, "claude-kiro");
assert.equal(callaiClaudeOffer.account_pool, "kiro");
assert.equal(callaiClaudeOffer.channel_type, "mixed");
assert.equal(callaiClaudeOffer.cache_hit_rate, 0.804429);
assert.equal(callaiClaudeOffer.cache_hit_sample_tokens, 3_164_297_639);
assert.equal(callaiClaudeOffer.availability_seven_day_rate, 0.811862);
assert.equal(callaiClaudeOffer.availability_seven_day_samples, 1);
assert.equal(callaiClaudeOffer.availability_latest_latency_ms, 1414);
const callaiGptOffer = callaiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5");
assert.equal(callaiGptOffer.group_name, "gpt");
assert.equal(callaiGptOffer.account_pool, "mixed");
assert.equal(callaiGptOffer.channel_type, "mixed");
assert.equal(callaiGptOffer.cache_hit_rate, 0.903728);
assert.equal(callaiGptOffer.cache_hit_sample_tokens, 25_358_042_481);
assert.equal(callaiGptOffer.availability_seven_day_rate, 0.987801);
assert.equal(callaiGptOffer.availability_seven_day_samples, 1);
assert.equal(callaiGptOffer.availability_latest_latency_ms, 1311);
assert.equal(callaiAiTransitSnapshot.station.availability_seven_day_rate, 0.899832);
assert.equal(callaiAiTransitSnapshot.station.availability_seven_day_samples, 2);

const aliuapiAiTransitSnapshot = __test.parsePricingPayload(
  configuredAliuapiSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-07T12:11:25.000Z",
    station: {
      name: "A6-API",
      homepage_url: "https://aliuapi.top/home",
      price_url: "https://aliuapi.top/public/transit",
      monitor_url: "https://aliuapi.top/public/transit?view=monitoring",
      system_type: "sub2api",
    },
    billing: {
      recharge_ratio: "1 CNY = 1 USD balance",
      recharge_multiplier: 1,
      minimum_top_up: 1,
    },
    groups: [
      {
        name: "T0 - GPT Plus",
        platform: "openai",
        rate_multiplier: 0.05,
        cache_usage: {
          total: {
            input_tokens: 25_816_238,
            cache_creation_tokens: 0,
            cache_read_tokens: 242_969_088,
            cache_hit_rate: 90.39522045931928,
          },
        },
        models: [
          {
            standard_model: "gpt-5.4",
            raw_model: "gpt-5.4",
            price: {
              input_usd_per_token: 0.0000025,
              output_usd_per_token: 0.000015,
              cache_read_usd_per_token: 0.00000025,
            },
          },
          {
            standard_model: "gpt-5.5",
            raw_model: "gpt-5.5",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.00003,
              cache_read_usd_per_token: 0.0000005,
            },
          },
        ],
      },
      {
        name: "T1 - GPT Pro",
        platform: "openai",
        rate_multiplier: 0.12,
        cache_usage: {
          total: {
            input_tokens: 3_455_029,
            cache_creation_tokens: 0,
            cache_read_tokens: 38_039_424,
            cache_hit_rate: 91.67351597573777,
          },
        },
        models: [
          {
            standard_model: "gpt-5.4-mini",
            raw_model: "gpt-5.4-mini",
            price: {
              input_usd_per_token: 0.00000075,
              output_usd_per_token: 0.0000045,
              cache_read_usd_per_token: 0.000000075,
            },
          },
          {
            standard_model: "gpt-5.5",
            raw_model: "gpt-5.5",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.00003,
              cache_read_usd_per_token: 0.0000005,
            },
          },
        ],
      },
    ],
    monitoring: [
      {
        name: "Plus",
        primary_model: "gpt-5.4",
        primary_status: "operational",
        availability_7d: 96.44970414201184,
        latest_latency_ms: 1320,
        last_checked_at: "2026-07-07T12:11:18.000Z",
        timeline: [
          { status: "operational", latency_ms: 1320, checked_at: "2026-07-07T12:11:18.000Z" },
        ],
      },
      {
        name: "Pro",
        primary_model: "gpt-5.4-mini",
        primary_status: "operational",
        availability_7d: 100,
        latest_latency_ms: 988,
        last_checked_at: "2026-07-07T12:11:18.000Z",
        timeline: [
          { status: "operational", latency_ms: 988, checked_at: "2026-07-07T12:11:18.000Z" },
        ],
      },
    ],
  },
  "2026-07-07T12:11:25.000Z",
);
assert.equal(aliuapiAiTransitSnapshot.station.published, true);
assert.equal(aliuapiAiTransitSnapshot.station.availability_source_type, "public_status");
assert.equal(aliuapiAiTransitSnapshot.station.minimum_top_up, 1);
const aliuapiPlusGpt54 = aliuapiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.4" && offer.group_name === "T0 - GPT Plus");
assert.equal(aliuapiPlusGpt54.model_multiplier, 0.05);
assert.equal(aliuapiPlusGpt54.cache_hit_rate, 0.903952);
assert.equal(aliuapiPlusGpt54.cache_hit_sample_tokens, 268785326);
assert.equal(aliuapiPlusGpt54.availability_seven_day_samples, 1);
assert.equal(aliuapiPlusGpt54.availability_source_type, "public_status");
const aliuapiProGpt55 = aliuapiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "T1 - GPT Pro");
assert.equal(aliuapiProGpt55.model_multiplier, 0.12);
assert.equal(aliuapiProGpt55.cache_hit_rate, 0.916735);
assert.equal(aliuapiProGpt55.cache_hit_sample_tokens, 41494453);
const aliuapiProGpt54Mini = aliuapiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.4 Mini" && offer.group_name === "T1 - GPT Pro");
assert.equal(aliuapiProGpt54Mini.model_multiplier, 0.12);
assert.equal(aliuapiProGpt54Mini.availability_seven_day_samples, 1);
assert.equal(aliuapiProGpt54Mini.availability_source_type, "public_status");

const mfttaiAiTransitSnapshot = __test.parsePricingPayload(
  configuredMfttaiSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-08T00:35:00.000Z",
    station: {
      name: "MFAPI",
      homepage_url: "https://mfttai.com/home",
      price_url: "https://mfttai.com/public/transit",
      monitor_url: "https://mfttai.com/public/transit?view=monitoring",
      support_url: "VX：lyw2465885900",
      system_type: "sub2api",
    },
    billing: {
      recharge_ratio: "1 CNY = 1 USD balance",
      recharge_multiplier: 1,
      minimum_top_up: 1,
    },
    groups: [
      {
        name: "Kiro",
        platform: "anthropic",
        rate_multiplier: 0.2,
        cache_usage: {
          last_7d: {
            input_tokens: 636_300_000,
            cache_creation_tokens: 1_907_100_000,
            cache_read_tokens: 637_200_000,
            cache_hit_rate: 79.48679152473383,
          },
        },
        models: [
          {
            standard_model: "claude-opus-4-8",
            raw_model: "claude-opus-4-8",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.000025,
              cache_read_usd_per_token: 0.0000005,
              cache_write_usd_per_token: 0.00000625,
            },
          },
        ],
      },
      {
        name: "GPT",
        platform: "openai",
        rate_multiplier: 0.3,
        cache_usage: {
          last_7d: {
            input_tokens: 3_249_918_852,
            cache_creation_tokens: 0,
            cache_read_tokens: 36_521_068_824,
            cache_hit_rate: 91.84133357579094,
          },
        },
        models: [
          {
            standard_model: "gpt-5.5",
            raw_model: "gpt-5.5",
            price: {
              input_usd_per_token: 0.000005,
              output_usd_per_token: 0.00003,
              cache_read_usd_per_token: 0.0000005,
              cache_write_usd_per_token: 0.0000005,
            },
          },
        ],
      },
    ],
    monitoring: [
      {
        name: "Kiro",
        primary_model: "claude-opus-4-8",
        primary_status: "operational",
        availability_7d: 97.83251231527093,
        latest_latency_ms: 1953,
        last_checked_at: "2026-07-08T00:34:41.000Z",
        models: [
          {
            model: "claude-opus-4-8",
            latest_status: "operational",
            availability_7d: 97.83251231527093,
            latest_latency_ms: 1953,
          },
        ],
        timeline: [
          { status: "operational", latency_ms: 1953, checked_at: "2026-07-08T00:34:41.000Z" },
        ],
      },
      {
        name: "GPT&Image",
        primary_model: "gpt-5.5",
        primary_status: "operational",
        availability_7d: 99.90138067061145,
        latest_latency_ms: 2106,
        last_checked_at: "2026-07-08T00:34:41.000Z",
        models: [
          {
            model: "gpt-5.5",
            latest_status: "operational",
            availability_7d: 99.90138067061145,
            latest_latency_ms: 2106,
          },
        ],
        timeline: [
          { status: "operational", latency_ms: 2106, checked_at: "2026-07-08T00:34:41.000Z" },
        ],
      },
    ],
  },
  "2026-07-08T00:35:00.000Z",
);
assert.equal(mfttaiAiTransitSnapshot.station.published, true);
assert.equal(mfttaiAiTransitSnapshot.station.minimum_top_up, 1);
assert.equal(mfttaiAiTransitSnapshot.station.availability_source_type, "public_status");
const mfttaiKiroClaude = mfttaiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "Claude Opus 4.8" && offer.group_name === "Kiro");
assert.equal(mfttaiKiroClaude.model_multiplier, 0.2);
assert.equal(mfttaiKiroClaude.cache_hit_rate, 0.794868);
assert.equal(mfttaiKiroClaude.cache_hit_sample_tokens, 3_180_600_000);
assert.equal(mfttaiKiroClaude.availability_seven_day_rate, 0.978325);
assert.equal(mfttaiKiroClaude.availability_latest_latency_ms, 1953);
const mfttaiGpt55 = mfttaiAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "GPT");
assert.equal(mfttaiGpt55.model_multiplier, 0.3);
assert.equal(mfttaiGpt55.cache_hit_rate, 0.918413);
assert.equal(mfttaiGpt55.cache_hit_sample_tokens, 39_770_987_676);
assert.equal(mfttaiGpt55.availability_seven_day_rate, 0.999014);
assert.equal(mfttaiGpt55.availability_seven_day_samples, 1);
assert.equal(mfttaiGpt55.availability_latest_latency_ms, 2106);

const wawazzAiTransitSnapshot = __test.parsePricingPayload(
  configuredWawazzSource,
  {
    schema_version: "ai-transit.v1",
    system: "sub2api",
    generated_at: "2026-07-08T06:40:41.000Z",
    station: {
      name: "WAWA ZZ API",
      homepage_url: "https://wawazz.xyz/home",
      price_url: "https://wawazz.xyz/public/transit",
      monitor_url: "https://wawazz.xyz/public/transit?view=monitoring",
      support_url: "qq群：1073408363",
      system_type: "sub2api",
    },
    billing: {
      recharge_ratio: "1 CNY = 1 USD balance",
      recharge_multiplier: 1,
      minimum_top_up: 1,
    },
    disclosure: {
      upstream_type: "mixed",
      account_pool_type: "mixed",
    },
    groups: [
      {
        name: "claude-krio",
        platform: "anthropic",
        rate_multiplier: 0.3,
        cache_usage: {
          last_7d: {
            input_tokens: 6_440_345,
            cache_creation_tokens: 892_460,
            cache_read_tokens: 56_418_415,
            cache_hit_rate: 88.49778090521248,
          },
        },
        models: [],
      },
      {
        name: "claude-krio-power",
        platform: "anthropic",
        rate_multiplier: 0.4,
        cache_usage: {
          last_7d: {
            input_tokens: 2_000_000,
            cache_creation_tokens: 3_000_000,
            cache_read_tokens: 20_000_000,
            cache_hit_rate: 80,
          },
        },
        models: [],
      },
      {
        name: "claude-max-号池-不限制客户端",
        platform: "anthropic",
        rate_multiplier: 1.3,
        cache_usage: {
          last_7d: {
            input_tokens: 1_234_567,
            cache_creation_tokens: 2_345_678,
            cache_read_tokens: 6_364_371,
            cache_hit_rate: 86.0591822772783,
          },
        },
        models: [],
      },
      {
        name: "gpt-plus",
        platform: "openai",
        rate_multiplier: 0.07,
        cache_usage: {
          last_7d: {
            input_tokens: 1_226_680_734,
            cache_creation_tokens: 0,
            cache_read_tokens: 10_000_000_000,
            cache_hit_rate: 90.07147044251201,
          },
        },
        models: [
          {
            standard_model: "gpt-5.4",
            raw_model: "gpt-5.4",
            price: {
              input_usd_per_token: 0.0000025,
              output_usd_per_token: 0.000015,
              cache_read_usd_per_token: 0.00000025,
            },
          },
          {
            standard_model: "gpt-5.4-mini",
            raw_model: "gpt-5.4-mini",
            price: {
              input_usd_per_token: 0.00000075,
              output_usd_per_token: 0.0000045,
              cache_read_usd_per_token: 0.000000075,
            },
          },
        ],
      },
      {
        name: "gpt-pro",
        platform: "openai",
        rate_multiplier: 0.16,
        cache_usage: {
          last_7d: {
            input_tokens: 847_267_933,
            cache_creation_tokens: 0,
            cache_read_tokens: 6_495_000_000,
            cache_hit_rate: 88.46070447535655,
          },
        },
        models: [],
      },
    ],
    monitoring: [
      {
        name: "gpt-plus分组",
        primary_model: "gpt-5.5",
        primary_status: "operational",
        availability_7d: 88.08622675662333,
        latest_latency_ms: 1909,
        last_checked_at: "2026-07-08T06:40:12.000Z",
        models: [
          {
            model: "gpt-5.5",
            latest_status: "operational",
            availability_7d: 88.08622675662333,
            latest_latency_ms: 1909,
          },
        ],
        timeline: [
          { status: "operational", latency_ms: 1909, checked_at: "2026-07-08T06:40:12.000Z" },
        ],
      },
      {
        name: "cc-max分组",
        primary_model: "claude-sonnet-4-6",
        primary_status: "operational",
        availability_7d: 98.16362223085892,
        latest_latency_ms: 1547,
        last_checked_at: "2026-07-08T06:40:12.000Z",
        models: [
          {
            model: "claude-sonnet-4-6",
            latest_status: "operational",
            availability_7d: 98.16362223085892,
            latest_latency_ms: 1547,
          },
        ],
        timeline: [
          { status: "operational", latency_ms: 1547, checked_at: "2026-07-08T06:40:12.000Z" },
        ],
      },
      {
        name: "gpt-pro分组",
        primary_model: "gpt-5.4-mini",
        primary_status: "operational",
        availability_7d: 98.92397425583266,
        latest_latency_ms: 1542,
        last_checked_at: "2026-07-08T06:40:12.000Z",
        models: [
          {
            model: "gpt-5.4-mini",
            latest_status: "operational",
            availability_7d: 98.92397425583266,
            latest_latency_ms: 1542,
          },
        ],
        timeline: [
          { status: "operational", latency_ms: 1542, checked_at: "2026-07-08T06:40:12.000Z" },
        ],
      },
    ],
    completeness: {
      warnings: ["no public model pricing found"],
    },
  },
  "2026-07-08T06:40:41.000Z",
);
assert.equal(wawazzAiTransitSnapshot.modelCount, 5);
assert.equal(wawazzAiTransitSnapshot.offers.length, 5);
assert.equal(wawazzAiTransitSnapshot.station.collection_status, "success");
assert.equal(wawazzAiTransitSnapshot.station.published, true);
const wawazzPlusGpt55 = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "gpt-plus");
assert.equal(wawazzPlusGpt55, undefined);
const wawazzPlusGpt54 = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.4" && offer.group_name === "gpt-plus");
assert.equal(wawazzPlusGpt54.model_multiplier, 0.07);
assert.equal(wawazzPlusGpt54.account_pool, "plus");
assert.equal(wawazzPlusGpt54.channel_type, "mixed");
assert.equal(wawazzPlusGpt54.cache_hit_rate, 0.900715);
assert.equal(wawazzPlusGpt54.availability_seven_day_rate, 0.880862);
assert.equal(wawazzPlusGpt54.availability_seven_day_samples, 1);
assert.match(wawazzPlusGpt54.availability_note, /同分组监测/);
const wawazzClaudeMaxOpus = wawazzAiTransitSnapshot.offers.find(
  (offer) => offer.standard_model === "Claude Opus 4.8" && offer.group_name === "claude-max-号池-不限制客户端"
);
assert.equal(wawazzClaudeMaxOpus.availability_seven_day_rate, 0.981636);
assert.equal(wawazzClaudeMaxOpus.availability_seven_day_samples, 1);
assert.match(wawazzClaudeMaxOpus.availability_note, /同分组监测/);
const wawazzProGpt55 = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.5" && offer.group_name === "gpt-pro");
assert.equal(wawazzProGpt55, undefined);
const wawazzProGpt54Mini = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "GPT 5.4 Mini" && offer.group_name === "gpt-pro");
assert.equal(wawazzProGpt54Mini, undefined);
const wawazzKrioClaude = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "Claude Opus 4.8" && offer.group_name === "claude-krio");
assert.equal(wawazzKrioClaude.model_multiplier, 0.3);
assert.equal(wawazzKrioClaude.account_pool, "kiro");
assert.equal(wawazzKrioClaude.channel_type, "mixed");
assert.equal(wawazzKrioClaude.cache_hit_rate, 0.884978);
assert.equal(wawazzKrioClaude.cache_hit_sample_tokens, 63_751_220);
const wawazzKrioPowerClaude = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "Claude Opus 4.8" && offer.group_name === "claude-krio-power");
assert.equal(wawazzKrioPowerClaude.model_multiplier, 0.4);
assert.equal(wawazzKrioPowerClaude.account_pool, "kiro");
assert.equal(wawazzKrioPowerClaude.channel_type, "mixed");
const wawazzMaxClaude = wawazzAiTransitSnapshot.offers.find((offer) => offer.standard_model === "Claude Opus 4.8" && offer.group_name === "claude-max-号池-不限制客户端");
assert.equal(wawazzMaxClaude.model_multiplier, 1.3);
assert.equal(wawazzMaxClaude.account_pool, "max");
assert.equal(wawazzMaxClaude.channel_type, "mixed");
assert.equal(wawazzMaxClaude.cache_hit_rate, 0.860592);

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

const stationRefreshPrefersPublicStatusEvidence = __test.mergeStationForRefresh(
  {
    id: "sub-callai-one",
    availability_source_type: "public_status",
    availability_seven_day_rate: 0,
    availability_seven_day_samples: 3,
    availability_note: "ai-transit 公开快照监测汇总。",
  },
  {
    id: "sub-callai-one",
    availability_source_type: "priceai_probe",
    availability_source_label: "PriceAI 实测",
    availability_seven_day_rate: 0.992,
    availability_seven_day_samples: 250,
    availability_note: "PriceAI API Key 探测：近 7 日 站点 248/250 个样本成功。",
    published: true,
  },
  {},
);
assert.equal(stationRefreshPrefersPublicStatusEvidence.availability_source_type, "public_status");
assert.equal(stationRefreshPrefersPublicStatusEvidence.availability_seven_day_samples, 3);

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
