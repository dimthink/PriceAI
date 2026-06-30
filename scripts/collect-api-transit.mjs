#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "./safe-fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "config", "api-transit-sources.json");
const envPath = path.join(repoRoot, ".env.local");
const defaultOutPath = path.join(repoRoot, "data", "api-transit", "latest-public-pricing.json");

const userAgent = "Mozilla/5.0 PriceAI/1.0 APITransitCollector";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RECHARGE_RATIO = "1:1";
const NEW_API_USD_UNIT_PRICE_FACTOR = 2;
const CALLAI_PARTNER_STATUS_COLLECTORS = new Set([
  "callai_partner_status",
  "sub2api_partner_status",
  "subway_api_partner_status",
]);
const ONEHOP_PUBLIC_MODEL_COLLECTORS = new Set(["onehop_public_models"]);
const APINODE_PUBLIC_SITE_INFO_COLLECTORS = new Set(["apinode_public_site_info", "sub2api_public_site_info"]);
const ZIVV_MODEL_HUB_COLLECTORS = new Set(["zivv_model_hub"]);
const SOURCE_SKIPPED = Symbol("source_skipped");
const AVAILABILITY_SOURCES = {
  publicStatus: {
    type: "public_status",
    label: "公开监测页",
  },
  publicModelCatalog: {
    type: "public_model_catalog",
    label: "公开模型页",
  },
  partnerApi: {
    type: "partner_api",
    label: "站长接口",
  },
  unknown: {
    type: "unknown",
    label: null,
  },
};
const officialTransitPrices = {
  "Claude Sonnet 4.6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, imageOutput: null },
  "Claude Opus 4.6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, imageOutput: null },
  "Claude Opus 4.7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, imageOutput: null },
  "Claude Opus 4.8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, imageOutput: null },
  "GPT 5.5": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0.5, imageOutput: null },
  "GPT 5.4": { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0.25, imageOutput: null },
  "Gemini 3.5 Flash": { input: 1.5, output: 9, cacheRead: null, cacheWrite: null, imageOutput: null },
  "Gemini 3.1 Pro": { input: 2, output: 12, cacheRead: null, cacheWrite: null, imageOutput: null },
  "GLM-5.2": { input: 8, output: 28, cacheRead: 2, cacheWrite: null, imageOutput: null },
  "GLM-5.1": { input: 6, output: 24, cacheRead: 1.3, cacheWrite: null, imageOutput: null },
  "DeepSeek V4 Flash": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: null, imageOutput: null },
  "DeepSeek V4 Pro": { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: null, imageOutput: null },
  "GPT Image 2": { input: 5, output: null, cacheRead: 1.25, cacheWrite: null, imageOutput: 30 },
};
const modelFamilyByStandard = {
  "Claude Sonnet 4.6": "claude",
  "Claude Opus 4.6": "claude",
  "Claude Opus 4.7": "claude",
  "Claude Opus 4.8": "claude",
  "GPT 5.5": "gpt",
  "GPT 5.4": "gpt",
  "Gemini 3.5 Flash": "gemini",
  "Gemini 3.1 Pro": "gemini",
  "GLM-5.2": "glm",
  "GLM-5.1": "glm",
  "DeepSeek V4 Flash": "deepseek",
  "DeepSeek V4 Pro": "deepseek",
  "GPT Image 2": "image",
};

if (isCli()) {
  const args = normalizeOptions(parseArgs(process.argv.slice(2)));

  try {
    const result = await collectApiTransitPrices(args);
    printSummary(result);

    if (args.dryRun) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const outPath = path.resolve(repoRoot, args.out || defaultOutPath);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      console.log(`Snapshot written to ${path.relative(repoRoot, outPath)}`);
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function collectApiTransitPrices(options = {}) {
  options = normalizeOptions(options);

  const selectedSources = selectSources(await loadCollectionSources(options), options);
  const startedAt = new Date().toISOString();
  const stations = [];
  const offers = [];
  const runs = [];
  const availabilitySamples = [];

  for (const source of selectedSources) {
    const runStartedAt = new Date().toISOString();
    try {
      const payload = await fetchPricingJson(source, options);
      const parsed = parsePricingPayload(source, payload, runStartedAt);
      let availabilityPayload = null;
      let availabilityError = null;
      try {
        availabilityPayload = await fetchAvailabilityPayload(source, options);
        applyAvailabilityPayloadToParsedRows(source, parsed, availabilityPayload, runStartedAt);
      } catch (error) {
        availabilityError = errorMessage(error);
      }
      const runId = stableId("api-transit-run", source.id, runStartedAt);
      stations.push(parsed.station);
      offers.push(...parsed.offers);
      runs.push({
        id: runId,
        station_id: source.id,
        run_type: "public_pricing",
        status: parsed.offers.length ? "success" : "partial",
        model_count: parsed.modelCount,
        offer_count: parsed.offers.length,
        error_message: parsed.offers.length ? null : parsed.collectionError || "未识别到已支持的标准模型。",
        source_url: source.pricingEndpointUrl,
        started_at: runStartedAt,
        finished_at: new Date().toISOString(),
        raw_snapshot: compactSnapshot(availabilityPayload ? {
          pricing: payload,
          availability: availabilityPayload,
        } : payload),
        logs: {
          collectorKind: source.collectorKind,
          selectedModels: parsed.offers.map((offer) => offer.raw_model_name),
          availabilitySourceUrl: source.monitorEndpointUrl || null,
          availabilitySamples: parsed.availabilitySamples?.length || 0,
          availabilityError,
        },
      });
      availabilitySamples.push(
        ...(parsed.availabilitySamples || []).map((sample) => ({
          ...sample,
          run_id: runId,
        })),
      );
    } catch (error) {
      if (error?.code === SOURCE_SKIPPED) {
        runs.push({
          id: stableId("api-transit-run", source.id, runStartedAt),
          station_id: null,
          run_type: "public_pricing",
          status: "partial",
          model_count: 0,
          offer_count: 0,
          error_message: error.message,
          source_url: source.pricingEndpointUrl,
          started_at: runStartedAt,
          finished_at: new Date().toISOString(),
          raw_snapshot: {},
          logs: {
            collectorKind: source.collectorKind,
            skipped: true,
            reason: error.reason || "source_skipped",
          },
        });
        continue;
      }

      stations.push(buildStationRow(source, runStartedAt, { status: "failed", error: errorMessage(error) }));
      runs.push({
        id: stableId("api-transit-run", source.id, runStartedAt),
        station_id: source.id,
        run_type: "public_pricing",
        status: "failed",
        model_count: 0,
        offer_count: 0,
        error_message: errorMessage(error),
        source_url: source.pricingEndpointUrl,
        started_at: runStartedAt,
        finished_at: new Date().toISOString(),
        raw_snapshot: {},
        logs: { collectorKind: source.collectorKind },
      });
    }
  }

  const result = {
    dryRun: Boolean(options.dryRun),
    post: Boolean(options.post || options.db),
    publish: Boolean(options.publish),
    source: "api_transit_public_pricing",
    generatedAt: new Date().toISOString(),
    startedAt,
    counts: {
      sources: selectedSources.length,
      stations: stations.length,
      offers: offers.length,
      runs: runs.length,
      availabilitySamples: availabilitySamples.length,
    },
    stations,
    offers,
    runs,
    availabilitySamples,
  };

  if (options.post || options.db) {
    result.database = await postRows({ stations, offers, runs, availabilitySamples }, options);
  }

  return result;
}

async function fetchPricingJson(source, options) {
  if (isCallaiPartnerStatusSource(source)) {
    return fetchCallaiPartnerStatus(source, options);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  try {
    const response = await safeFetch(source.pricingEndpointUrl, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": userAgent,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("公开价格接口没有返回 JSON。");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCallaiPartnerStatus(source, options) {
  const token = source.partnerToken || envValue(source.partnerTokenEnv, options);
  if (!token) {
    throw skippedSource(
      `缺少 ${source.partnerTokenEnv || "partnerToken"}，已跳过 ${source.name} partner API 采集。`,
      "missing_partner_token",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  try {
    const response = await safeFetch(source.pricingEndpointUrl, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${token}`,
        "user-agent": userAgent,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("partner API 没有返回 JSON。");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAvailabilityPayload(source, options) {
  if (!source.monitorEndpointUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  try {
    const response = await safeFetch(source.monitorEndpointUrl, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": userAgent,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("公开监测接口没有返回 JSON。");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function applyAvailabilityPayloadToParsedRows(source, parsed, payload, collectedAt) {
  if (!payload) return;
  if (isZivvModelHubSource(source)) {
    applyZivvStatusAvailability(source, parsed, payload, collectedAt);
  }
}

function parsePricingPayload(source, payload, collectedAt) {
  if (isCallaiPartnerStatusSource(source)) {
    return parseCallaiPartnerStatusPayload(source, payload, collectedAt);
  }
  if (isOneHopPublicModelsSource(source)) {
    return parseOneHopPublicModelsPayload(source, payload, collectedAt);
  }
  if (isApinodePublicSiteInfoSource(source)) {
    return parseApinodePublicSiteInfoPayload(source, payload, collectedAt);
  }
  if (isZivvModelHubSource(source)) {
    return parseZivvModelHubPayload(source, payload, collectedAt);
  }

  const items = normalizePricingItems(payload);
  const groupRatios = normalizeGroupRatios(payload);
  const selected = [];

  for (const item of items) {
    const standard = standardizeModelName(item.model_name || item.name || "");
    if (!standard) continue;

    const groups = normalizeItemGroups(item, groupRatios);
    for (const group of groups) {
      const offer = buildOfferRow(source, item, group, standard, collectedAt);
      if (offer) selected.push(offer);
    }
  }

  const deduped = dedupeBestOffers(selected);
  return {
    modelCount: items.length,
    collectionError: null,
    station: buildStationRow(source, collectedAt, {
      status: deduped.length ? "success" : "partial",
      offerCount: deduped.length,
    }),
    offers: deduped,
  };
}

function parseOneHopPublicModelsPayload(source, payload, collectedAt) {
  const items = normalizeOneHopPublicModels(payload);
  const selected = [];

  for (const item of items) {
    const standard = standardizeModelName(
      [
        item?.fullSlug,
        item?.modelSlug,
        item?.upstreamModelId,
        item?.displayName,
      ].filter(Boolean).join(" "),
    );
    if (!standard) continue;

    const offer = buildOneHopPublicModelOfferRow(source, item, standard, collectedAt);
    if (offer) selected.push(offer);
  }

  const deduped = dedupeBestOffers(selected);
  return {
    modelCount: items.length,
    collectionError: null,
    station: buildStationRow(source, collectedAt, {
      status: deduped.length ? "success" : "partial",
      offerCount: deduped.length,
      availability: summarizeOneHopStationAvailability(deduped, collectedAt),
    }),
    offers: deduped,
  };
}

function parseApinodePublicSiteInfoPayload(source, payload, collectedAt) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const generatedAt = stringOrNull(data.generated_at) || collectedAt;
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const availabilityByStandard = apinodeAvailabilityByStandard(data.model_availability, generatedAt);
  const rechargeRatio = rechargeRatioFromBilling(data.recharge) || source.rechargeRatio || DEFAULT_RECHARGE_RATIO;
  const offers = [];

  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const platform = String(group.platform || "").toLowerCase();
    if (platform && platform !== "openai") continue;

    const groupName = stringOrNull(group.name) || `group-${group.id || "default"}`;
    const groupText = `${groupName} ${group.platform || ""}`;
    if (isApinodeImageGroup(group)) {
      const imageMultiplier = numberValue(group.image_rate_multiplier);
      if (imageMultiplier !== null && imageMultiplier > 0) {
        offers.push(
          buildApinodePublicSiteInfoOfferRow({
            source,
            group,
            standard: "GPT Image 2",
            rawModelName: "gpt-image-2",
            multiplier: imageMultiplier,
            rechargeRatio,
            availability: availabilityByStandard.get("GPT Image 2"),
            generatedAt,
            collectedAt,
          }),
        );
      }
      continue;
    }

    const multiplier = numberValue(group.rate_multiplier);
    if (multiplier === null || multiplier <= 0) continue;

    for (const standard of ["GPT 5.4", "GPT 5.5"]) {
      offers.push(
        buildApinodePublicSiteInfoOfferRow({
          source,
          group: { ...group, inferred_group_text: groupText },
          standard,
          rawModelName: standard === "GPT 5.4" ? "gpt-5.4" : "gpt-5.5",
          multiplier,
          rechargeRatio,
          availability: availabilityByStandard.get(standard),
          generatedAt,
          collectedAt,
        }),
      );
    }
  }

  const deduped = dedupeBestOffers(offers.filter(Boolean));
  const collectionError = deduped.length ? null : "APINode site-info 未返回可识别 OpenAI 分组倍率。";
  return {
    modelCount: availabilityByStandard.size,
    collectionError,
    station: buildStationRow(source, collectedAt, {
      status: deduped.length ? "success" : "partial",
      offerCount: deduped.length,
      meta: { generated_at: generatedAt },
      collectionError,
      availability: summarizeApinodePublicAvailability(availabilityByStandard, generatedAt),
    }),
    offers: deduped,
  };
}

function parseCallaiPartnerStatusPayload(source, payload, collectedAt) {
  const sections = Array.isArray(payload?.pricing_sections) ? payload.pricing_sections : [];
  const entries = sections.flatMap((section) => {
    const sectionEntries = Array.isArray(section?.entries) ? section.entries : [];
    return sectionEntries.map((entry) => ({ section, entry }));
  });
  const monitoringByKey = new Map(
    (Array.isArray(payload?.monitoring?.latest) ? payload.monitoring.latest : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => [String(item.key || ""), item]),
  );
  const offers = [];

  for (const { section, entry } of entries) {
    const groups = Array.isArray(entry?.groups) ? entry.groups : [];
    const models = Array.isArray(entry?.models) ? entry.models : [];

    for (const model of models) {
      const standard = standardizeModelName(model?.base_model || model?.model || model?.label || "");
      if (!standard) continue;

      for (const group of groups) {
        const offer = buildCallaiPartnerOfferRow({
          source,
          payload,
          section,
          entry,
          group,
          model,
          standard,
          monitoring: monitoringByKey.get(`${section?.key || ""}.${entry?.key || ""}`) || null,
          collectedAt,
        });
        if (offer) offers.push(offer);
      }
    }
  }

  const deduped = dedupeBestOffers(offers);
  const collectionError =
    payload?.meta?.stale === true ? "partner API 快照标记为 stale，已保留价格但需关注刷新状态。" : null;

  return {
    modelCount: entries.reduce((total, { entry }) => total + (Array.isArray(entry?.models) ? entry.models.length : 0), 0),
    collectionError,
    station: buildStationRow(source, collectedAt, {
      status: deduped.length ? (collectionError ? "partial" : "success") : "partial",
      offerCount: deduped.length,
      site: payload?.site,
      meta: payload?.meta,
      collectionError,
      availability: summarizeCallaiPartnerAvailability(payload?.monitoring?.latest, collectedAt),
    }),
    offers: deduped,
  };
}

function isCallaiPartnerStatusSource(source) {
  return CALLAI_PARTNER_STATUS_COLLECTORS.has(source.collectorKind);
}

function isOneHopPublicModelsSource(source) {
  return ONEHOP_PUBLIC_MODEL_COLLECTORS.has(source.collectorKind);
}

function isApinodePublicSiteInfoSource(source) {
  return APINODE_PUBLIC_SITE_INFO_COLLECTORS.has(source.collectorKind);
}

function isZivvModelHubSource(source) {
  return ZIVV_MODEL_HUB_COLLECTORS.has(source.collectorKind);
}

function normalizeOneHopPublicModels(payload) {
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function parseZivvModelHubPayload(source, payload, collectedAt) {
  const items = normalizeZivvModelHubItems(payload);
  const selected = [];
  const skippedFixedPriceModels = [];

  for (const item of items) {
    const rawName = [item?.id, item?.name, item?.model].filter(Boolean).join(" ");
    const standard = standardizeModelName(rawName);
    if (!standard) continue;

    if (Number(item?.quota_type) === 2) {
      skippedFixedPriceModels.push(String(item?.id || standard));
      continue;
    }

    const groups = normalizeZivvGroups(item);
    for (const group of groups) {
      const offer = buildZivvModelHubOfferRow(source, item, group, standard, collectedAt);
      if (offer) selected.push(offer);
    }
  }

  const deduped = dedupeBestOffers(selected);
  const collectionError = skippedFixedPriceModels.length
    ? `跳过 ${skippedFixedPriceModels.length} 个固定按次计费模型：${skippedFixedPriceModels.join(", ")}。`
    : null;

  return {
    modelCount: items.length,
    collectionError,
    station: buildStationRow(source, collectedAt, {
      status: deduped.length ? "success" : "partial",
      offerCount: deduped.length,
      collectionError,
      availability: {
        rate: null,
        samples: 0,
        firstCheckedAt: null,
        lastCheckedAt: null,
        note: "Zivv 公开模型广场价格已抓取；状态页公开存在，但尚未接入 PriceAI API Key 可用性检测。",
        ...availabilitySourceFields(source, AVAILABILITY_SOURCES.publicStatus),
      },
    }),
    offers: deduped,
  };
}

function normalizeZivvModelHubItems(payload) {
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.models)) return payload.models;
  if (Array.isArray(payload)) return payload;
  return [];
}

function normalizeZivvGroups(item) {
  const groups = Array.isArray(item?.groups) && item.groups.length ? item.groups : [null];
  return groups.map((group) => {
    const raw = group && typeof group === "object" ? group : {};
    const key = stringOrNull(raw.id) || stringOrNull(raw.name) || "default";
    const name = stringOrNull(raw.name) || "default";
    return {
      key,
      name,
      description: stringOrNull(raw.description),
      multiplier: numberValue(raw.multiplier),
      inputRate: numberValue(raw.input_rate ?? item?.input_rate),
      outputRate: numberValue(raw.output_rate ?? item?.output_rate),
      cacheReadRate: numberValue(raw.cache_read_rate ?? item?.cache_read_rate),
      cacheWriteRate: numberValue(raw.cache_write_rate ?? item?.cache_write_rate),
    };
  });
}

function buildZivvModelHubOfferRow(source, item, group, standard, collectedAt) {
  const family = familyForStandardModel(standard);
  const official = officialTransitPrices[standard];
  if (!official) return null;

  const unitPricesUsd = {
    input: group.inputRate,
    output: group.outputRate,
    cacheRead: group.cacheReadRate,
    cacheWrite: group.cacheWriteRate,
    imageOutput: null,
    fixedPrice: numberValue(item?.fixed_price),
    quotaType: numberValue(item?.quota_type),
  };
  const input = unitRatioValue(unitPricesUsd.input, official.input);
  const output = unitRatioValue(unitPricesUsd.output, official.output);
  const cacheRead = unitRatioValue(unitPricesUsd.cacheRead, official.cacheRead);
  const cacheWrite = unitRatioValue(unitPricesUsd.cacheWrite, official.cacheWrite);
  if (input === null && output === null && cacheRead === null && cacheWrite === null) return null;

  const groupName = group.name || group.key || "default";
  const sourceText = [item?.id, item?.provider, groupName, group.description].filter(Boolean).join(" ");
  const autoPublish = shouldAutoPublishSource(source);

  return {
    id: stableId("api-transit-offer", source.id, standard, groupName),
    station_id: source.id,
    family,
    standard_model: standard,
    raw_model_name: String(item?.id || item?.name || standard),
    group_name: groupName,
    recharge_ratio: source.rechargeRatio || DEFAULT_RECHARGE_RATIO,
    model_multiplier: round(input ?? output ?? cacheRead ?? cacheWrite, 6),
    input_price: input === null ? null : round(input, 6),
    output_price: output === null ? null : round(output, 6),
    cache_read_price: cacheRead === null ? null : round(cacheRead, 6),
    cache_write_price: cacheWrite === null ? null : round(cacheWrite, 6),
    image_output_price: null,
    currency: "CNY",
    account_pool: inferAccountPool(sourceText),
    channel_type: inferChannelType(sourceText),
    price_source: "Zivv 公开模型广场",
    source_url: source.pricingUrl || source.pricingEndpointUrl,
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_first_checked_at: null,
    availability_last_checked_at: null,
    availability_note: "价格已抓取，尚未运行 API 可用性检测。",
    ...availabilitySourceFields(source, AVAILABILITY_SOURCES.unknown),
    last_verified_at: collectedAt,
    status: autoPublish ? "active" : "needs_review",
    auto_publish: autoPublish,
    raw_payload: {
      collector_kind: source.collectorKind,
      provider: stringOrNull(item?.provider),
      model: compactZivvModelPayload(item),
      group: {
        id: group.key,
        name: groupName,
        description: group.description,
        multiplier: group.multiplier,
      },
      unit_prices_usd: unitPricesUsd,
      multiplier_basis: "zivv_public_usd_per_million",
    },
    created_at: collectedAt,
  };
}

function compactZivvModelPayload(item) {
  if (!item || typeof item !== "object") return item || null;
  return {
    id: stringOrNull(item.id),
    provider: stringOrNull(item.provider),
    quota_type: numberValue(item.quota_type),
    input_rate: numberValue(item.input_rate),
    output_rate: numberValue(item.output_rate),
    cache_read_rate: numberValue(item.cache_read_rate),
    cache_write_rate: numberValue(item.cache_write_rate),
    fixed_price: numberValue(item.fixed_price),
    context_window: stringOrNull(item.context_window),
    capabilities: Array.isArray(item.capabilities) ? item.capabilities.map(stringOrNull).filter(Boolean) : [],
    features: Array.isArray(item.features) ? item.features.map(stringOrNull).filter(Boolean) : [],
  };
}

function applyZivvStatusAvailability(source, parsed, payload, collectedAt) {
  const services = normalizeZivvStatusServices(payload)
    .map((service) => normalizeZivvStatusService(service))
    .filter(Boolean);
  if (!services.length) return;

  const samples = [];
  const offerAvailabilityByKey = new Map();
  const activeOfferKeys = new Set((parsed.offers || []).map((offer) => offerKey(offer)));
  for (const service of services) {
    for (const point of service.history) {
      samples.push(buildAvailabilitySampleRow({
        stationId: source.id,
        scope: "station",
        standardModel: service.standardModel,
        groupName: service.groupName,
        ok: point.ok,
        checkedAt: point.checkedAt,
        index: point.index,
        source,
        availabilitySource: AVAILABILITY_SOURCES.publicStatus,
      }));
    }

    if (!service.standardModel || !service.groupName) continue;
    const key = offerKey({
      station_id: source.id,
      standard_model: service.standardModel,
      group_name: service.groupName,
    });
    if (!activeOfferKeys.has(key)) continue;
    const availability = {
      ...availabilityFromZivvStatusService(service, collectedAt),
      ...availabilitySourceFields(source, AVAILABILITY_SOURCES.publicStatus),
    };
    offerAvailabilityByKey.set(key, availability);
    for (const point of service.history) {
      samples.push(buildAvailabilitySampleRow({
        stationId: source.id,
        scope: "offer",
        standardModel: service.standardModel,
        groupName: service.groupName,
        ok: point.ok,
        checkedAt: point.checkedAt,
        index: point.index,
        source,
        availabilitySource: AVAILABILITY_SOURCES.publicStatus,
      }));
    }
  }

  parsed.availabilitySamples = samples;

  for (const offer of parsed.offers || []) {
    const availability = offerAvailabilityByKey.get(offerKey(offer));
    if (!availability) continue;
    applyAvailabilityToOffer(offer, availability);
  }

  const stationAvailability = summarizeZivvStatusAvailability(services, collectedAt);
  if (parsed.station && stationAvailability.samples) {
    Object.assign(parsed.station, {
      availability_seven_day_rate: stationAvailability.rate,
      availability_seven_day_samples: stationAvailability.samples,
      availability_first_checked_at: stationAvailability.firstCheckedAt,
      availability_last_checked_at: stationAvailability.lastCheckedAt,
      availability_note: stationAvailability.note,
      ...availabilitySourceFields(source, AVAILABILITY_SOURCES.publicStatus),
    });
  }
}

function normalizeZivvStatusServices(payload) {
  if (Array.isArray(payload?.services)) return payload.services;
  if (Array.isArray(payload?.data?.services)) return payload.data.services;
  return [];
}

function normalizeZivvStatusService(service) {
  if (!service || typeof service !== "object") return null;
  const standardModel = standardizeZivvStatusModel(service?.model);
  const groupName = zivvStatusGroupName(service);
  const history = normalizeZivvStatusHistory(service);
  if (!history.length) return null;
  return {
    name: stringOrNull(service.name),
    model: stringOrNull(service.model),
    type: stringOrNull(service.type),
    standardModel,
    groupName,
    uptimePercent: numberValue(service.uptime_percent),
    checkedAt: stringOrNull(service?.current?.timestamp),
    currentOk: typeof service?.current?.ok === "boolean" ? service.current.ok : null,
    history,
  };
}

function standardizeZivvStatusModel(model) {
  const standard = standardizeModelName(model);
  if (standard) return standard;
  const value = String(model || "").toLowerCase();
  if (value.includes("gemini-3-flash")) return "Gemini 3.5 Flash";
  return null;
}

function zivvStatusGroupName(service) {
  const name = String(service?.name || "").toLowerCase();
  if (name.includes("gemini anti")) return "Gemini Anti";
  if (name.includes("gemini cli")) return "Gemini CLI";
  if (name.includes("antigravity") || name.includes("anti")) return "Claude Anti【目前不稳定】";
  if (name.includes("claude max")) return "Claude MAX";
  if (name.includes("codex plus")) return "Codex Plus【目前不稳定】";
  if (name.includes("codex pro")) return "Codex Pro";
  return stringOrNull(service?.name);
}

function normalizeZivvStatusHistory(service) {
  const history = Array.isArray(service?.history) ? service.history : [];
  return history
    .map((point, index) => ({
      ok: typeof point?.ok === "boolean" ? point.ok : null,
      checkedAt: stringOrNull(point?.timestamp),
      latencyMs: numberValue(point?.latency_ms),
      error: stringOrNull(point?.error),
      statusCode: numberValue(point?.status_code),
      index,
    }))
    .filter((point) => typeof point.ok === "boolean" && point.checkedAt);
}

function availabilityFromZivvStatusService(service, collectedAt) {
  const window = sampleWindowFromPoints(service.history);
  const success = service.history.filter((point) => point.ok).length;
  const rateFromHistory = service.history.length ? success / service.history.length : null;
  const displayRate = numberValue(service.uptimePercent);
  const rate = displayRate === null ? rateFromHistory : displayRate / 100;
  const currentText = service.currentOk === null ? "" : `；当前${service.currentOk ? "正常" : "异常"}`;
  return {
    rate: rate === null ? null : round(rate, 6),
    samples: service.history.length,
    success,
    firstCheckedAt: window.first,
    lastCheckedAt: window.last || service.checkedAt || collectedAt,
    note: `Zivv 公开状态页 7 日服务监测：${service.name || service.groupName || "未命名服务"}，页面 uptime ${displayRate === null ? "未公开" : `${round(displayRate, 2)}%`}，历史点 ${service.history.length} 个${currentText}。`,
    ...availabilitySourceFields(null, AVAILABILITY_SOURCES.publicStatus),
  };
}

function summarizeZivvStatusAvailability(services, collectedAt) {
  const valid = services.filter((service) => service.history.length);
  const samples = valid.reduce((total, service) => total + service.history.length, 0);
  const success = valid.reduce((total, service) => total + service.history.filter((point) => point.ok).length, 0);
  const weightedRate = samples
    ? valid.reduce((total, service) => {
        const availability = availabilityFromZivvStatusService(service, collectedAt);
        return total + (availability.rate ?? 0) * availability.samples;
      }, 0) / samples
    : null;
  const window = sampleWindowFromPoints(valid.flatMap((service) => service.history));
  return {
    rate: weightedRate === null ? null : round(weightedRate, 6),
    samples,
    success,
    firstCheckedAt: window.first,
    lastCheckedAt: window.last || collectedAt,
    note: `Zivv 公开状态页 7 日汇总：${valid.length} 个服务、${samples} 个历史点，按服务页面 uptime 加权汇总；非 PriceAI API Key 实测。`,
    ...availabilitySourceFields(null, AVAILABILITY_SOURCES.publicStatus),
  };
}

function sampleWindowFromPoints(points) {
  const times = (points || []).map((point) => stringOrNull(point?.checkedAt)).filter(Boolean).sort();
  return {
    first: times[0] || null,
    last: times.at(-1) || null,
  };
}

function applyAvailabilityToOffer(offer, availability) {
  offer.availability_seven_day_rate = availability.rate;
  offer.availability_seven_day_samples = availability.samples;
  offer.availability_first_checked_at = availability.firstCheckedAt;
  offer.availability_last_checked_at = availability.lastCheckedAt;
  offer.availability_note = availability.note;
  offer.availability_source_type = availability.availability_source_type || offer.availability_source_type || "unknown";
  offer.availability_source_label = availability.availability_source_label ?? offer.availability_source_label ?? null;
  offer.availability_source_url = availability.availability_source_url ?? offer.availability_source_url ?? null;
  offer.last_verified_at = availability.lastCheckedAt || offer.last_verified_at;
}

function buildAvailabilitySampleRow(input) {
  const stationId = stringOrNull(input.stationId);
  const checkedAt = stringOrNull(input.checkedAt) || new Date().toISOString();
  const standardModel = stringOrNull(input.standardModel) || null;
  const groupName = stringOrNull(input.groupName) || null;
  const scope = input.scope === "offer" ? "offer" : "station";

  return {
    id: stableId(
      "api-transit-availability-sample",
      stationId,
      scope,
      standardModel || "station",
      groupName || "default",
      String(input.index || 0),
    ),
    run_id: null,
    station_id: stationId,
    scope,
    standard_model: standardModel,
    group_name: groupName,
    ok: Boolean(input.ok),
    checked_at: checkedAt,
    source_type: input.availabilitySource?.type || "unknown",
    source_label: input.availabilitySource?.label || null,
    source_url: availabilitySourceUrl(input.source, input.availabilitySource),
  };
}

function availabilitySourceFields(source, availabilitySource) {
  const sourceType = availabilitySource?.availability_source_type || availabilitySource?.type || "unknown";
  const sourceLabel = availabilitySource?.availability_source_label ?? availabilitySource?.label ?? null;
  const sourceUrl = availabilitySource?.availability_source_url ?? availabilitySourceUrl(source, availabilitySource);
  return {
    availability_source_type: sourceType,
    availability_source_label: sourceLabel,
    availability_source_url: sourceUrl,
  };
}

function availabilitySourceUrl(source, availabilitySource) {
  if (!source) return null;
  const type = availabilitySource?.sourceType || availabilitySource?.type || "unknown";
  if (type === "public_status") return source.monitorUrl || source.monitorEndpointUrl || source.pricingEndpointUrl || source.pricingUrl || null;
  if (type === "public_model_catalog") return source.pricingUrl || source.pricingEndpointUrl || null;
  if (type === "partner_api") return source.pricingEndpointUrl || source.pricingUrl || null;
  return null;
}

function normalizeSourceGroupName(source, groupName) {
  const name = stringOrNull(groupName) || "default";
  const aliases = source.groupAliases && typeof source.groupAliases === "object" ? source.groupAliases : {};
  return stringOrNull(aliases[name]) || name;
}

function normalizePricingItems(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.models)) return payload.models;
  const modelInfo = payload?.data?.model_info || payload?.model_info;
  if (Array.isArray(modelInfo)) return modelInfo;
  if (modelInfo && typeof modelInfo === "object") return Object.values(modelInfo);
  return [];
}

function normalizeGroupRatios(payload) {
  const raw = payload?.group_ratio || payload?.data?.group_info || payload?.group_info || {};
  const groups = new Map();
  if (!raw || typeof raw !== "object") return groups;

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number") {
      groups.set(key, { name: key, ratio: value, description: null });
    } else if (value && typeof value === "object") {
      groups.set(key, {
        name: String(value.DisplayName || value.display_name || key),
        ratio: numberValue(value.GroupRatio ?? value.group_ratio ?? value.ratio),
        description: value.Description || value.description || null,
      });
    }
  }
  return groups;
}

function normalizeItemGroups(item, groupRatios) {
  if (item.price_info && typeof item.price_info === "object") {
    const groups = [];
    for (const [groupName, groupPayload] of Object.entries(item.price_info)) {
      const defaultPayload = groupPayload?.default && typeof groupPayload.default === "object" ? groupPayload.default : groupPayload;
      const meta = groupRatios.get(groupName) || { name: groupName, ratio: null, description: null };
      groups.push({
        key: groupName,
        name: meta.name || groupName,
        groupRatio: meta.ratio,
        description: meta.description,
        modelRatio: numberValue(defaultPayload?.model_ratio),
        completionRatio: numberValue(defaultPayload?.model_completion_ratio ?? defaultPayload?.completion_ratio),
        cacheRatio: numberValue(defaultPayload?.model_cache_ratio ?? defaultPayload?.cache_ratio),
        createCacheRatio: numberValue(defaultPayload?.model_create_cache_ratio ?? defaultPayload?.create_cache_ratio),
      });
    }
    return groups;
  }

  const enableGroups = Array.isArray(item.enable_groups) && item.enable_groups.length ? item.enable_groups : ["default"];
  return enableGroups.map((groupName) => {
    const meta = groupRatios.get(groupName) || { name: groupName, ratio: null, description: null };
    return {
      key: groupName,
      name: meta.name || groupName,
      groupRatio: meta.ratio,
      description: meta.description,
      modelRatio: numberValue(item.model_ratio),
      completionRatio: numberValue(item.completion_ratio),
      cacheRatio: numberValue(item.cache_ratio),
      createCacheRatio: numberValue(item.create_cache_ratio),
    };
  });
}

function buildOneHopPublicModelOfferRow(source, item, standard, collectedAt) {
  const family = familyForStandardModel(standard);
  const official = officialPriceFromOneHopModel(item, standard);
  if (!official) return null;

  const unitPricesUsd = {
    input: numberValue(item?.inputPricePer1m),
    output: numberValue(item?.outputPricePer1m),
    cacheRead: null,
    cacheWrite: null,
    imageOutput: numberValue(item?.imageOutputPricePer1m),
    priorityInput: numberValue(item?.priorityInputPricePer1m),
    priorityOutput: numberValue(item?.priorityOutputPricePer1m),
    officialInput: numberValue(item?.officialInputPricePer1m),
    officialOutput: numberValue(item?.officialOutputPricePer1m),
    officialImageOutput: numberValue(item?.officialImageOutputPricePer1m),
    officialPriorityInput: numberValue(item?.officialPriorityInputPricePer1m),
    officialPriorityOutput: numberValue(item?.officialPriorityOutputPricePer1m),
  };
  const input = unitRatioValue(unitPricesUsd.input, official.input);
  const output = unitRatioValue(unitPricesUsd.output, official.output);
  const imageOutput = unitRatioValue(unitPricesUsd.imageOutput, official.imageOutput);
  if (input === null && output === null && imageOutput === null) return null;

  const groupName = oneHopGroupName(item);
  const sourceText = [item?.source, item?.fullSlug, item?.provider].filter(Boolean).join(" ");
  const availability = oneHopAvailabilityFromDisplayMetrics(item?.displayMetrics, collectedAt);
  const autoPublish = shouldAutoPublishSource(source);

  return {
    id: stableId("api-transit-offer", source.id, standard, groupName),
    station_id: source.id,
    family,
    standard_model: standard,
    raw_model_name: String(item?.fullSlug || item?.upstreamModelId || item?.displayName || standard),
    group_name: groupName,
    recharge_ratio: source.rechargeRatio || DEFAULT_RECHARGE_RATIO,
    model_multiplier: round(input ?? output ?? imageOutput, 6),
    input_price: input === null ? null : round(input, 6),
    output_price: output === null ? null : round(output, 6),
    cache_read_price: null,
    cache_write_price: null,
    image_output_price: imageOutput === null ? null : round(imageOutput, 6),
    currency: "CNY",
    account_pool: inferAccountPool(sourceText),
    channel_type: inferOneHopChannelType(item),
    price_source: "OneHop 公开模型目录",
    source_url: source.pricingUrl || source.pricingEndpointUrl,
    availability_seven_day_rate: availability.rate,
    availability_seven_day_samples: availability.samples,
    availability_first_checked_at: availability.firstCheckedAt ?? null,
    availability_last_checked_at: availability.lastCheckedAt,
    availability_note: availability.note,
    ...availabilitySourceFields(source, AVAILABILITY_SOURCES.publicModelCatalog),
    last_verified_at: availability.lastCheckedAt || collectedAt,
    status: autoPublish ? "active" : "needs_review",
    auto_publish: autoPublish,
    raw_payload: {
      collector_kind: source.collectorKind,
      model: compactOneHopModelPayload(item),
      unit_prices_usd: unitPricesUsd,
      supported_protocols: Array.isArray(item?.supportedProtocolList) ? item.supportedProtocolList : [],
      capabilities: Array.isArray(item?.capabilities) ? item.capabilities : [],
      multiplier_basis: "onehop_public_usd_per_million",
    },
    created_at: collectedAt,
  };
}

function buildApinodePublicSiteInfoOfferRow({
  source,
  group,
  standard,
  rawModelName,
  multiplier,
  rechargeRatio,
  availability,
  generatedAt,
  collectedAt,
}) {
  const family = familyForStandardModel(standard);
  const roundedMultiplier = round(multiplier, 6);
  const groupName = stringOrNull(group?.name) || `group-${group?.id || "default"}`;
  const accountPool = inferAccountPool(`${groupName} ${group?.inferred_group_text || ""}`);
  const channelType = inferChannelType(groupName);
  const isImage = family === "image";
  const autoPublish = shouldAutoPublishSource(source);

  return {
    id: stableId("api-transit-offer", source.id, standard, groupName),
    station_id: source.id,
    family,
    standard_model: standard,
    raw_model_name: rawModelName,
    group_name: groupName,
    recharge_ratio: rechargeRatio,
    model_multiplier: roundedMultiplier,
    input_price: isImage ? null : roundedMultiplier,
    output_price: isImage ? null : roundedMultiplier,
    cache_read_price: null,
    cache_write_price: null,
    image_output_price: isImage ? roundedMultiplier : null,
    currency: "CNY",
    account_pool: accountPool,
    channel_type: channelType,
    price_source: "APINode 公开 site-info",
    source_url: source.pricingEndpointUrl,
    availability_seven_day_rate: availability?.rate ?? null,
    availability_seven_day_samples: availability?.samples ?? 0,
    availability_first_checked_at: availability?.firstCheckedAt ?? null,
    availability_last_checked_at: availability?.lastCheckedAt ?? generatedAt,
    availability_note: apinodeAvailabilityNote(standard, availability),
    ...availabilitySourceFields(source, AVAILABILITY_SOURCES.publicStatus),
    last_verified_at: availability?.lastCheckedAt || generatedAt || collectedAt,
    status: autoPublish ? "active" : "needs_review",
    auto_publish: autoPublish,
    raw_payload: {
      collector_kind: source.collectorKind,
      snapshot_generated_at: generatedAt,
      group,
      availability: availability?.raw || null,
      recharge_ratio: rechargeRatio,
      multiplier_basis: isImage ? "apinode_image_rate_multiplier" : "apinode_rate_multiplier",
    },
    created_at: collectedAt,
  };
}

function familyForStandardModel(standard) {
  return modelFamilyByStandard[standard] || "gpt";
}

function officialPriceFromOneHopModel(item, standard) {
  const fallback = officialTransitPrices[standard];
  if (!item || typeof item !== "object") return fallback || null;

  const official = {
    input: numberValue(item.officialInputPricePer1m) ?? fallback?.input ?? null,
    output: numberValue(item.officialOutputPricePer1m) ?? fallback?.output ?? null,
    cacheRead: fallback?.cacheRead ?? null,
    cacheWrite: fallback?.cacheWrite ?? null,
    imageOutput: numberValue(item.officialImageOutputPricePer1m) ?? fallback?.imageOutput ?? null,
  };

  return Object.values(official).some((value) => value !== null) ? official : null;
}

function compactOneHopModelPayload(item) {
  if (!item || typeof item !== "object") return item || null;
  return {
    fullSlug: stringOrNull(item.fullSlug),
    displayName: stringOrNull(item.displayName),
    provider: stringOrNull(item.provider),
    source: stringOrNull(item.source),
    family: stringOrNull(item.family),
    available: item.available === undefined ? null : Boolean(item.available),
    contextWindow: numberValue(item.contextWindow),
    upstreamModelId: stringOrNull(item.upstreamModelId),
    aliases: Array.isArray(item.aliases) ? item.aliases.map(stringOrNull).filter(Boolean) : [],
    inputModalities: Array.isArray(item.inputModalities) ? item.inputModalities.map(stringOrNull).filter(Boolean) : [],
    outputModalities: Array.isArray(item.outputModalities) ? item.outputModalities.map(stringOrNull).filter(Boolean) : [],
    maxOutputTokens: numberValue(item.maxOutputTokens),
    summary: stringOrNull(item.summary),
    displayMetrics: {
      usageTokens: numberValue(item?.displayMetrics?.usageTokens),
      successRate: numberValue(item?.displayMetrics?.successRate),
      uptime14d: Array.isArray(item?.displayMetrics?.uptime14d) ? item.displayMetrics.uptime14d : [],
    },
  };
}

function oneHopGroupName(item) {
  const source = stringOrNull(item?.source);
  if (source && source.toLowerCase() === "official") return "Official";
  if (source && source.toLowerCase() === "kiro") return "Kiro";
  return source || "OneHop";
}

function inferOneHopChannelType(item) {
  const source = String(item?.source || "").toLowerCase();
  const slug = String(item?.fullSlug || "").toLowerCase();
  if (source === "official") return "official_api";
  if (source === "kiro" || slug.includes("kiro")) return "reverse_engineered";
  return "undisclosed";
}

function oneHopAvailabilityFromDisplayMetrics(displayMetrics, collectedAt) {
  const uptime14d = Array.isArray(displayMetrics?.uptime14d) ? displayMetrics.uptime14d : [];
  const samples = uptime14d
    .map((point) => ({
      day: stringOrNull(point?.day),
      rate: numberValue(point?.rate),
    }))
    .filter((point) => point.day && point.rate !== null);
  const successRate = numberValue(displayMetrics?.successRate);
  const usageTokens = numberValue(displayMetrics?.usageTokens);
  const sampleDays = samples.map((point) => point.day).sort();
  const earliestDay = sampleDays.at(0);
  const latestDay = sampleDays.at(-1);

  if (!samples.length) {
    return {
      rate: successRate,
      samples: successRate === null ? 0 : 1,
      firstCheckedAt: successRate === null ? null : collectedAt,
      lastCheckedAt: collectedAt,
      note: "OneHop 公开模型目录未返回 14 日 uptime；保留页面 successRate 作为商家公开参考。",
      ...availabilitySourceFields(null, AVAILABILITY_SOURCES.publicModelCatalog),
    };
  }

  const average = samples.reduce((total, point) => total + point.rate, 0) / samples.length;
  const usageNote = usageTokens === null ? "" : `；页面展示使用量 ${Math.round(usageTokens).toLocaleString("en-US")} tokens`;
  return {
    rate: round(average, 6),
    samples: samples.length,
    firstCheckedAt: earliestDay ? `${earliestDay}T00:00:00.000Z` : null,
    lastCheckedAt: latestDay ? `${latestDay}T00:00:00.000Z` : collectedAt,
    note: `OneHop 公开模型目录 uptime14d，按日可用率样本，非 PriceAI API Key 实测${usageNote}。`,
    ...availabilitySourceFields(null, AVAILABILITY_SOURCES.publicModelCatalog),
  };
}

function summarizeOneHopStationAvailability(offers, collectedAt) {
  const rates = offers
    .map((offer) => numberValue(offer.availability_seven_day_rate))
    .filter((value) => value !== null);
  const samples = offers.reduce((total, offer) => total + (numberValue(offer.availability_seven_day_samples) || 0), 0);
  const lastCheckedAt = offers
    .map((offer) => stringOrNull(offer.availability_last_checked_at))
    .filter(Boolean)
    .sort()
    .at(-1);
  const firstCheckedAt = offers
    .map((offer) => stringOrNull(offer.availability_first_checked_at))
    .filter(Boolean)
    .sort()
    .at(0);

  return {
    rate: rates.length ? round(rates.reduce((total, rate) => total + rate, 0) / rates.length, 6) : null,
    samples,
    firstCheckedAt: firstCheckedAt || null,
    lastCheckedAt: lastCheckedAt || collectedAt,
    note: "OneHop 公开模型目录汇总 uptime14d；这些是商家页面公开样本，仍需 PriceAI 测试 Key 复核。",
    ...availabilitySourceFields(null, AVAILABILITY_SOURCES.publicModelCatalog),
  };
}

function apinodeAvailabilityByStandard(modelAvailability, generatedAt) {
  const output = new Map();
  const entries = Array.isArray(modelAvailability) ? modelAvailability : [];
  for (const entry of entries) {
    const models = Array.isArray(entry?.models) ? entry.models : [];
    for (const model of models) {
      const standard = standardizeModelName([model?.model, model?.name, entry?.name].filter(Boolean).join(" "));
      if (!standard) continue;
      const sevenDay = numberValue(model?.availability_7d);
      const fifteenDay = numberValue(model?.availability_15d);
      const thirtyDay = numberValue(model?.availability_30d);
      output.set(standard, {
        standard,
        status: stringOrNull(model?.latest_status) || "unknown",
        rate: percentValueToRate(sevenDay),
        samples: sevenDay === null ? 0 : 1,
        firstCheckedAt: generatedAt,
        lastCheckedAt: generatedAt,
        sevenDay,
        fifteenDay,
        thirtyDay,
        raw: {
          monitor: {
            id: numberValue(entry?.id),
            name: stringOrNull(entry?.name),
            provider: stringOrNull(entry?.provider),
            group_name: stringOrNull(entry?.group_name),
          },
          model,
        },
      });
    }
  }
  return output;
}

function summarizeApinodePublicAvailability(availabilityByStandard, generatedAt) {
  const samples = Array.from(availabilityByStandard.values()).filter((item) => item.rate !== null);
  if (!samples.length) {
    return {
      rate: null,
      samples: 0,
      firstCheckedAt: null,
      lastCheckedAt: generatedAt,
      note: "APINode site-info 暂未返回可识别模型可用率；非 PriceAI API Key 实测。",
      ...AVAILABILITY_SOURCES.publicStatus,
    };
  }

  return {
    rate: round(samples.reduce((total, item) => total + item.rate, 0) / samples.length, 6),
    samples: samples.length,
    firstCheckedAt: samples.map((item) => item.firstCheckedAt).filter(Boolean).sort().at(0) || generatedAt,
    lastCheckedAt: samples.map((item) => item.lastCheckedAt).filter(Boolean).sort().at(-1) || generatedAt,
    note: "APINode 公开 site-info 模型可用率汇总；接口未返回样本明细，非 PriceAI API Key 实测。",
    ...AVAILABILITY_SOURCES.publicStatus,
  };
}

function apinodeAvailabilityNote(standard, availability) {
  if (!availability) return `APINode site-info 未返回 ${standard} 公开可用率；非 PriceAI API Key 实测。`;
  const windows = [
    ["7 日", availability.sevenDay],
    ["15 日", availability.fifteenDay],
    ["30 日", availability.thirtyDay],
  ]
    .filter(([, value]) => value !== null)
    .map(([label, value]) => `${label} ${formatPercentValue(value)}`);
  const status = availability.status ? `最新状态 ${availability.status}` : "最新状态未知";
  return `APINode 公开 site-info 监测：${status}${windows.length ? `，${windows.join("，")}` : ""}；接口未返回样本明细，非 PriceAI API Key 实测。`;
}

function isApinodeImageGroup(group) {
  const name = String(group?.name || "").toLowerCase();
  return Boolean(group?.allow_image_generation) && (name.includes("image") || name.includes("图像") || name.includes("生图"));
}

function percentValueToRate(value) {
  const number = numberValue(value);
  if (number === null) return null;
  return round(number > 1 ? number / 100 : number, 6);
}

function formatPercentValue(value) {
  const number = numberValue(value);
  if (number === null) return "未知";
  return `${round(number > 1 ? number : number * 100, 2).toFixed(2)}%`;
}

function buildCallaiPartnerOfferRow({
  source,
  payload,
  section,
  entry,
  group,
  model,
  standard,
  monitoring,
  collectedAt,
}) {
  const family = familyForStandardModel(standard);
  const groupMultiplier = numberValue(group?.rate_multiplier);
  if (groupMultiplier === null || groupMultiplier <= 0) return null;
  if (shouldAutoPublishSource(source) && payload?.meta?.stale === true) return null;

  const basePrice = normalizePartnerBasePrice(model?.base_price);
  const official = officialTransitPrices[standard];
  const splitMultipliers = getPartnerSplitMultipliers(basePrice, official, groupMultiplier);
  if (!splitMultipliers || splitMultipliers.model === null || splitMultipliers.model <= 0) return null;

  const rawGroupName = stringOrNull(group?.name) || stringOrNull(entry?.name) || stringOrNull(entry?.key) || "default";
  const groupKey = normalizeSourceGroupName(source, rawGroupName);
  const checkedAt = stringOrNull(monitoring?.checked_at) || collectedAt;
  const availability = callaiAvailabilityFromMonitoring(monitoring, payload?.meta, collectedAt);
  const autoPublish = shouldAutoPublishSource(source) && payload?.meta?.stale !== true;

  return {
    id: stableId("api-transit-offer", source.id, standard, groupKey),
    station_id: source.id,
    family,
    standard_model: standard,
    raw_model_name: String(model?.model || model?.base_model || model?.label || standard),
    group_name: groupKey,
    recharge_ratio: source.rechargeRatio || rechargeRatioFromBilling(payload?.billing) || DEFAULT_RECHARGE_RATIO,
    model_multiplier: round(splitMultipliers.model, 6),
    input_price: splitMultipliers.input === null ? null : round(splitMultipliers.input, 6),
    output_price: splitMultipliers.output === null ? null : round(splitMultipliers.output, 6),
    cache_read_price: splitMultipliers.cacheRead === null ? null : round(splitMultipliers.cacheRead, 6),
    cache_write_price: splitMultipliers.cacheWrite === null ? null : round(splitMultipliers.cacheWrite, 6),
    image_output_price: splitMultipliers.imageOutput === null ? null : round(splitMultipliers.imageOutput, 6),
    currency: "CNY",
    account_pool: inferAccountPool(`${entry?.key || ""} ${entry?.name || ""} ${group?.name || ""}`),
    channel_type: inferChannelType(`${entry?.platform || ""} ${group?.platform || ""} ${entry?.name || ""}`),
    price_source: "站长 partner API",
    source_url: source.pricingEndpointUrl,
    availability_seven_day_rate: availability.rate,
    availability_seven_day_samples: availability.samples,
    availability_first_checked_at: availability.firstCheckedAt ?? null,
    availability_last_checked_at: checkedAt,
    availability_note: availability.note,
    ...availabilitySourceFields(source, AVAILABILITY_SOURCES.partnerApi),
    last_verified_at: checkedAt,
    status: autoPublish ? "active" : "needs_review",
    auto_publish: autoPublish,
    raw_payload: {
      collector_kind: source.collectorKind,
      schema_version: stringOrNull(payload?.meta?.schema_version),
      cache_ttl_seconds: numberValue(payload?.meta?.cache_ttl_seconds),
      snapshot_generated_at: stringOrNull(payload?.meta?.generated_at || payload?.site?.generated_at),
      stale: payload?.meta?.stale === true,
      section: {
        key: stringOrNull(section?.key),
        name: stringOrNull(section?.name),
      },
      entry,
      group,
      raw_group_name: rawGroupName,
      model,
      monitoring,
      billing: payload?.billing || null,
      base_price: basePrice,
      unit_prices_usd: splitMultipliers.unitPricesUsd || null,
      multiplier_basis: splitMultipliers.basis,
    },
    created_at: collectedAt,
  };
}

function getPartnerSplitMultipliers(basePrice, official, groupMultiplier) {
  if (!basePrice || !official) {
    return {
      model: groupMultiplier,
      input: groupMultiplier,
      output: groupMultiplier,
      cacheRead: null,
      cacheWrite: null,
      imageOutput: null,
      unitPricesUsd: null,
      basis: "partner_rate_multiplier",
    };
  }

  const input = partnerRateValue(basePrice.input, official.input, groupMultiplier);
  const output = partnerRateValue(basePrice.output, official.output, groupMultiplier);
  const cacheRead = partnerRateValue(basePrice.cacheRead, official.cacheRead, groupMultiplier);
  const cacheWrite = partnerRateValue(basePrice.cacheWrite, official.cacheWrite, groupMultiplier);
  const imageOutput = partnerRateValue(basePrice.imageOutput, official.imageOutput, groupMultiplier);
  return {
    model: input ?? output ?? cacheRead ?? cacheWrite ?? imageOutput ?? groupMultiplier,
    input,
    output,
    cacheRead,
    cacheWrite,
    imageOutput,
    unitPricesUsd: {
      input: priceWithMultiplier(basePrice.input, groupMultiplier),
      output: priceWithMultiplier(basePrice.output, groupMultiplier),
      cacheRead: priceWithMultiplier(basePrice.cacheRead, groupMultiplier),
      cacheWrite: priceWithMultiplier(basePrice.cacheWrite, groupMultiplier),
      imageOutput: priceWithMultiplier(basePrice.imageOutput, groupMultiplier),
      currency: basePrice.currency,
      unit: basePrice.unit,
    },
    basis: "partner_base_price_multiplier",
  };
}

function partnerRateValue(value, officialValue, groupMultiplier) {
  if (value === null || officialValue === null || officialValue <= 0) return null;
  return (value * groupMultiplier) / officialValue;
}

function priceWithMultiplier(value, multiplier) {
  return value === null ? null : round(value * multiplier, 6);
}

function normalizePartnerBasePrice(value) {
  if (!value || typeof value !== "object") return null;
  return {
    input: numberValue(value.input),
    output: numberValue(value.output),
    cacheRead: numberValue(value.cache_read ?? value.cacheRead),
    cacheWrite: numberValue(value.cache_write ?? value.cacheWrite),
    imageOutput: numberValue(value.image_output ?? value.imageOutput),
    perRequest: numberValue(value.per_request ?? value.perRequest),
    unit: stringOrNull(value.unit),
    currency: stringOrNull(value.currency),
    source: stringOrNull(value.source),
  };
}

function callaiAvailabilityFromMonitoring(monitoring, meta, collectedAt) {
  if (!monitoring || typeof monitoring !== "object") {
    return {
      rate: null,
      samples: 0,
      firstCheckedAt: null,
      lastCheckedAt: null,
      note: "partner API 未返回该分组最近监测结果。",
      ...availabilitySourceFields(null, AVAILABILITY_SOURCES.partnerApi),
    };
  }

  const status = String(monitoring.status || "unknown");
  const checkedAt = stringOrNull(monitoring.checked_at) || collectedAt;
  const staleNote = meta?.stale === true ? "；快照已标记 stale" : "";
  if (status === "operational") {
    return {
      rate: null,
      samples: 0,
      firstCheckedAt: checkedAt,
      lastCheckedAt: checkedAt,
      note: `partner API 最近一次监测正常，非 7 日可用率${staleNote}。`,
      ...availabilitySourceFields(null, AVAILABILITY_SOURCES.partnerApi),
    };
  }
  if (status === "degraded") {
    return {
      rate: null,
      samples: 0,
      firstCheckedAt: checkedAt,
      lastCheckedAt: checkedAt,
      note: `partner API 最近一次监测异常或性能下降，非 7 日可用率${staleNote}。`,
      ...availabilitySourceFields(null, AVAILABILITY_SOURCES.partnerApi),
    };
  }

  return {
    rate: null,
    samples: 0,
    firstCheckedAt: checkedAt,
    lastCheckedAt: checkedAt,
    note: `partner API 最近监测状态为 ${status}，检查时间 ${checkedAt}${staleNote}。`,
    ...availabilitySourceFields(null, AVAILABILITY_SOURCES.partnerApi),
  };
}

function summarizeCallaiPartnerAvailability(latest, collectedAt) {
  const samples = Array.isArray(latest) ? latest.filter((item) => item && typeof item === "object") : [];
  if (!samples.length) {
    return {
      rate: null,
      samples: 0,
      firstCheckedAt: null,
      lastCheckedAt: null,
      note: "partner API 暂无最近监测结果。",
      ...availabilitySourceFields(null, AVAILABILITY_SOURCES.partnerApi),
    };
  }

  const checkedTimes = samples.map((item) => stringOrNull(item.checked_at)).filter(Boolean).sort();
  return {
    rate: null,
    samples: 0,
    firstCheckedAt: checkedTimes[0] || null,
    lastCheckedAt: checkedTimes.at(-1) || collectedAt,
    note: "partner API 最近一次监测汇总，非 7 日可用率。",
    ...availabilitySourceFields(null, AVAILABILITY_SOURCES.partnerApi),
  };
}

function buildStationRow(source, collectedAt, collection = {}) {
  const status = collection.status === "failed" ? "failed" : collection.status === "success" ? "success" : "partial";
  const availability = collection.availability || {};
  const autoPublish = shouldAutoPublishSource(source) && status === "success";
  return {
    id: source.id,
    slug: source.slug || source.id,
    name: source.name,
    website_url: source.websiteUrl,
    api_base_url: source.apiBaseUrl || null,
    pricing_url: source.pricingUrl || source.pricingEndpointUrl,
    monitor_url: source.monitorUrl || null,
    status: status === "failed" ? "unknown" : "active",
    source_type: "manual_collected",
    commercial_relation: source.commercialRelation || "none",
    station_system: source.stationSystem || source.station_system || null,
    operator_type: source.operatorType || source.operator_type || "unknown",
    invoice_support: source.invoiceSupport || source.invoice_support || "unknown",
    summary: source.summary || "公开价格接口可读取，已进入 PriceAI API 中转站自动价格采集池；稳定性和扣费检测仍需测试 Key 或人工样本补充。",
    channel_types: source.channelTypes || ["undisclosed"],
    account_pools: source.accountPools || ["undisclosed"],
    payment_methods: source.paymentMethods || [],
    minimum_top_up: source.minimumTopUp || null,
    balance_expiry: source.balanceExpiry || null,
    support_channels: source.supportChannels || [],
    refund_policy: source.refundPolicy || null,
    risk_labels: source.riskLabels || (status === "success" ? ["insufficient_samples"] : ["insufficient_samples", "pending_feedback"]),
    usage_advice: status === "success" ? "try_small" : "pending",
    data_status: autoPublish ? "verified" : "pending_review",
    availability_seven_day_rate: availability.rate ?? null,
    availability_seven_day_samples: availability.samples ?? 0,
    availability_first_checked_at: availability.firstCheckedAt ?? null,
    availability_last_checked_at: availability.lastCheckedAt ?? null,
    availability_note: availability.note || "已抓取公开价格，尚未接入 API Key 可用性检测。",
    ...availabilitySourceFields(source, availability),
    feedback_pending_count: 0,
    feedback_verified_risk_count: 0,
    feedback_merchant_responded_count: 0,
    feedback_main_themes: [],
    feedback_public_notes: collection.error || null,
    strengths: source.strengths || [],
    cautions: source.cautions || [],
    commercial_offers: source.commercialOffers || [],
    verification_events: source.verificationEvents || [],
    collector_kind: source.collectorKind || "new_api_pricing",
    pricing_endpoint_url: source.pricingEndpointUrl,
    collection_status: status,
    collection_error: collection.error || collection.collectionError || null,
    last_collected_at: collectedAt,
    last_updated_at: stringOrNull(collection?.meta?.generated_at || collection?.site?.generated_at) || collectedAt,
    published: autoPublish,
    auto_publish: autoPublish,
    admin_note: collection.offerCount
      ? autoPublish
        ? `自动抓取到 ${collection.offerCount} 条 API 中转价格，已按来源快照发布。`
        : `自动抓取到 ${collection.offerCount} 条 MVP 模型价格，待人工审核。`
      : "自动抓取未识别到 MVP 模型，待人工确认。",
    created_at: collectedAt,
  };
}

function buildOfferRow(source, item, group, standard, collectedAt) {
  const family = familyForStandardModel(standard);
  const groupMultiplier = group.groupRatio ?? 1;
  const splitMultipliers = getSplitMultipliers(item, group, standard, groupMultiplier);
  if (!splitMultipliers || splitMultipliers.model === null || splitMultipliers.model <= 0) return null;

  return {
    id: stableId("api-transit-offer", source.id, standard, group.key),
    station_id: source.id,
    family,
    standard_model: standard,
    raw_model_name: String(item.model_name || item.name || ""),
    group_name: group.name || group.key || "default",
    recharge_ratio: source.rechargeRatio || DEFAULT_RECHARGE_RATIO,
    model_multiplier: round(splitMultipliers.model, 6),
    input_price: splitMultipliers.input === null ? null : round(splitMultipliers.input, 6),
    output_price: splitMultipliers.output === null ? null : round(splitMultipliers.output, 6),
    cache_read_price: splitMultipliers.cacheRead === null ? null : round(splitMultipliers.cacheRead, 6),
    cache_write_price: splitMultipliers.cacheWrite === null ? null : round(splitMultipliers.cacheWrite, 6),
    image_output_price: splitMultipliers.imageOutput === null ? null : round(splitMultipliers.imageOutput, 6),
    currency: "CNY",
    account_pool: inferAccountPool(`${group.name} ${item.model_name || ""}`),
    channel_type: inferChannelType(`${group.name} ${group.description || ""}`),
    price_source: "公开 /api/pricing",
    source_url: source.pricingEndpointUrl,
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_first_checked_at: null,
    availability_last_checked_at: null,
    availability_note: "价格已抓取，尚未运行 API 可用性检测。",
    ...availabilitySourceFields(source, AVAILABILITY_SOURCES.unknown),
    last_verified_at: collectedAt,
    status: shouldAutoPublishSource(source) ? "active" : "needs_review",
    auto_publish: shouldAutoPublishSource(source),
    raw_payload: {
      model: item,
      group,
      unit_prices_usd: splitMultipliers.unitPricesUsd || null,
      multiplier_basis: splitMultipliers.basis || "unknown",
    },
    created_at: collectedAt,
  };
}

function getSplitMultipliers(item, group, standard, groupMultiplier) {
  const official = officialTransitPrices[standard];
  const billing = parseBillingExpression(item?.billing_expr);
  if (billing && official) {
    const input = ratioValue(billing.input, official.input, groupMultiplier);
    const output = ratioValue(billing.output, official.output, groupMultiplier);
    const cacheRead = ratioValue(billing.cacheRead, official.cacheRead, groupMultiplier);
    const cacheWrite = ratioValue(billing.cacheWrite, official.cacheWrite, groupMultiplier);
    const imageOutput = ratioValue(billing.imageOutput, official.imageOutput, groupMultiplier);
    return {
      model: input ?? output ?? cacheRead ?? cacheWrite ?? imageOutput,
      input,
      output,
      cacheRead,
      cacheWrite,
      imageOutput,
    };
  }

  const modelRatio = group.modelRatio;
  if (modelRatio === null || modelRatio <= 0) return null;

  const unitPricesUsd = getNewApiUnitPricesUsd(group, groupMultiplier);
  if (official && unitPricesUsd.input !== null) {
    const input = unitRatioValue(unitPricesUsd.input, official.input);
    const output = unitRatioValue(unitPricesUsd.output, official.output);
    const cacheRead = unitRatioValue(unitPricesUsd.cacheRead, official.cacheRead);
    const cacheWrite = unitRatioValue(unitPricesUsd.cacheWrite, official.cacheWrite);
    const imageOutput = unitRatioValue(unitPricesUsd.imageOutput, official.imageOutput);
    return {
      model: input ?? output ?? cacheRead ?? cacheWrite ?? imageOutput,
      input,
      output,
      cacheRead,
      cacheWrite,
      imageOutput,
      unitPricesUsd,
      basis: "new_api_usd_per_million",
    };
  }

  const input = modelRatio * groupMultiplier;
  return {
    model: input,
    input,
    output: group.completionRatio === null ? null : input * group.completionRatio,
    cacheRead: group.cacheRatio === null ? null : input * group.cacheRatio,
    cacheWrite: group.createCacheRatio === null ? null : input * group.createCacheRatio,
    imageOutput: null,
    unitPricesUsd: null,
    basis: "legacy_multiplier",
  };
}

function ratioValue(value, officialValue, groupMultiplier) {
  if (value === null || officialValue === null || officialValue <= 0) return null;
  return (value * groupMultiplier) / officialValue;
}

function unitRatioValue(value, officialValue) {
  if (value === null || officialValue === null || officialValue <= 0) return null;
  return value / officialValue;
}

function getNewApiUnitPricesUsd(group, groupMultiplier) {
  const input = group.modelRatio * NEW_API_USD_UNIT_PRICE_FACTOR * groupMultiplier;
  return {
    input,
    output: group.completionRatio === null ? null : input * group.completionRatio,
    cacheRead: group.cacheRatio === null ? null : input * group.cacheRatio,
    cacheWrite: group.createCacheRatio === null ? null : input * group.createCacheRatio,
    imageOutput: null,
  };
}

function parseBillingExpression(value) {
  const text = String(value || "");
  if (!text) return null;

  const parsed = {
    input: extractBillingTerm(text, "p"),
    output: extractBillingTerm(text, "c"),
    cacheRead: extractBillingTerm(text, "cr"),
    cacheWrite: extractBillingTerm(text, "cc"),
    cacheWriteOneHour: extractBillingTerm(text, "cc1h"),
    imageOutput: extractBillingTerm(text, "image") ?? extractBillingTerm(text, "img") ?? extractBillingTerm(text, "io"),
  };

  return Object.values(parsed).some((item) => item !== null) ? parsed : null;
}

function extractBillingTerm(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}\\s*\\*\\s*(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function dedupeBestOffers(offers) {
  const byKey = new Map();
  for (const offer of offers) {
    const key = `${offer.station_id}|${offer.standard_model}|${offer.group_name}`;
    const existing = byKey.get(key);
    if (!existing || nullableSortValue(offer.model_multiplier) < nullableSortValue(existing.model_multiplier)) {
      byKey.set(key, offer);
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.station_id.localeCompare(b.station_id) ||
    a.standard_model.localeCompare(b.standard_model) ||
    nullableSortValue(a.model_multiplier) - nullableSortValue(b.model_multiplier)
  );
}

function standardizeModelName(name) {
  const value = String(name || "").toLowerCase();
  if (!value) return null;

  if (value.includes("gpt-image-2") || value.includes("gpt image 2") || value.includes("gpt_image_2")) {
    return "GPT Image 2";
  }

  if (value.includes("claude") && value.includes("sonnet")) {
    if (matchesVersion(value, "4.6") || value.includes("4-6")) return "Claude Sonnet 4.6";
    return null;
  }
  if (value.includes("claude") && value.includes("opus")) {
    if (matchesVersion(value, "4.8") || value.includes("4-8")) return "Claude Opus 4.8";
    if (matchesVersion(value, "4.7") || value.includes("4-7")) return "Claude Opus 4.7";
    if (matchesVersion(value, "4.6") || value.includes("4-6")) return "Claude Opus 4.6";
    return null;
  }

  if (value.includes("gpt") || value.includes("codex") || value.includes("openai")) {
    if (matchesVersion(value, "5.5") || value.includes("5-5")) return "GPT 5.5";
    if (/\bgpt[-._ ]?5[-._ ]?4[-._ ]?mini\b/.test(value)) return null;
    if (matchesVersion(value, "5.4") || value.includes("5-4")) return "GPT 5.4";
  }

  if (value.includes("gemini")) {
    if (value.includes("3.5") || value.includes("3-5")) {
      if (value.includes("flash")) return "Gemini 3.5 Flash";
    }
    if (value.includes("3.1") || value.includes("3-1")) {
      if (value.includes("pro")) return "Gemini 3.1 Pro";
    }
  }

  if (value.includes("glm") || value.includes("zhipu")) {
    if (value.includes("5.2") || value.includes("5-2")) return "GLM-5.2";
    if (value.includes("5.1") || value.includes("5-1")) return "GLM-5.1";
  }

  if (value.includes("deepseek")) {
    if (value.includes("v4") || value.includes("deepseek-v4")) {
      if (value.includes("flash")) return "DeepSeek V4 Flash";
      if (value.includes("pro")) return "DeepSeek V4 Pro";
    }
  }

  return null;
}

function matchesVersion(value, version) {
  const escaped = version.replace(".", "[.-]");
  return new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`).test(value);
}

function inferAccountPool(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("official") || value.includes("官方") || value.includes("官转") || value.includes("官key")) return "official_api";
  if (value.includes("kiro")) return "kiro";
  if (value.includes("max")) return "max";
  if (value.includes("team")) return "team";
  if (value.includes("plus")) return "plus";
  if (value.includes("pro")) return "pro";
  if (value.includes("mixed") || value.includes("混")) return "mixed";
  return "undisclosed";
}

function inferChannelType(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("official") || value.includes("官方") || value.includes("官转") || value.includes("官key")) return "official_api";
  if (value.includes("kiro")) return "reverse_engineered";
  if (value.includes("anti") || value.includes("反重力") || value.includes("逆向")) return "reverse_engineered";
  if (value.includes("自有") || value.includes("号池")) return "first_party_pool";
  if (value.includes("aws") || value.includes("azure") || value.includes("vertex") || value.includes("云")) return "cloud";
  if (value.includes("混")) return "mixed";
  if (value.includes("分销") || value.includes("reseller")) return "reseller";
  return "undisclosed";
}

async function postRows(rows, options) {
  const plan = {
    dryRun: Boolean(options.dryRun),
    stations: rows.stations.length,
    offers: rows.offers.length,
    runs: rows.runs.length,
    availabilitySamples: rows.availabilitySamples?.length || 0,
    publish: Boolean(options.publish),
  };

  if (options.dryRun) {
    return {
      ...plan,
      skipped: true,
      message: "--dry-run --post 只验证将要写入的 API 中转数据，不连接 Supabase。",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");

  const autoPublishStationIds = collectSuccessfulAutoPublishStationIds(rows.stations);
  const existingStations = await readExistingStations(supabase, rows.stations.map((station) => station.id));
  const refreshStationIds = collectSuccessfulRefreshStationIds(rows.stations, existingStations, options);
  const refreshedOfferKeys = collectRefreshedOfferKeys(rows.offers, refreshStationIds);
  const stations = rows.stations.map((station) => mergeStationForRefresh(station, existingStations.get(station.id), options));
  const existingOffers = await readExistingOffers(supabase, rows.offers);
  const offers = rows.offers.map((offer) =>
    mergeOfferForRefresh(offer, existingOffers.get(offerKey(offer)), refreshStationIds.has(offer.station_id)),
  );
  const staleOfferIds = findStaleRefreshedOfferIds(existingOffers, refreshedOfferKeys);

  await upsertRows(supabase, "api_transit_stations", stations, { onConflict: "id" });
  const offerWriteResult = await upsertOfferRows(supabase, offers);
  await deactivateOffersById(supabase, staleOfferIds);
  await upsertRows(supabase, "api_transit_detection_runs", rows.runs, { onConflict: "id" });
  await upsertRows(supabase, "api_transit_availability_samples", rows.availabilitySamples || [], { onConflict: "id" });

  return {
    ...plan,
    compatibility: offerWriteResult.compatibility,
    deactivatedOffers: staleOfferIds.length,
    skipped: false,
    message: postRowsMessage(options, refreshedOfferKeys, autoPublishStationIds),
  };
}

function collectSuccessfulAutoPublishStationIds(stations) {
  return new Set(
    stations
      .filter((station) => station.auto_publish === true && station.collection_status === "success")
      .map((station) => station.id),
  );
}

function collectSuccessfulRefreshStationIds(stations, existingStations, options) {
  const stationIds = new Set();
  for (const station of stations) {
    if (station.collection_status !== "success") continue;
    const existing = existingStations.get(station.id);
    if (options.publish || station.auto_publish === true || existing?.published === true) {
      stationIds.add(station.id);
    }
  }
  return stationIds;
}

function collectRefreshedOfferKeys(offers, stationIds) {
  const byStation = new Map();
  for (const offer of offers) {
    if (!stationIds.has(offer.station_id)) continue;
    const stationId = String(offer.station_id || "");
    if (!stationId) continue;
    if (!byStation.has(stationId)) byStation.set(stationId, new Set());
    byStation.get(stationId).add(offerKey(offer));
  }
  return byStation;
}

function findStaleRefreshedOfferIds(existingOffers, refreshedOfferKeys) {
  const ids = [];
  for (const existing of existingOffers.values()) {
    const currentKeys = refreshedOfferKeys.get(existing.station_id);
    if (!currentKeys || existing.status !== "active") continue;
    if (!currentKeys.has(offerKey(existing))) ids.push(existing.id);
  }
  return ids;
}

async function deactivateOffersById(supabase, offerIds) {
  for (const chunk of chunks(offerIds, 300)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from("api_transit_offers").update({ status: "inactive" }).in("id", chunk);
    if (error) {
      error.table = "api_transit_offers";
      throw error;
    }
  }
}

async function upsertOfferRows(supabase, offers) {
  const attempts = [
    { rows: offers, compatibility: null },
    {
      rows: removeFieldsFromRows(offers, ["availability_first_checked_at"]),
      compatibility: "api_transit_offers.availability_first_checked_at column missing; wrote offers without first-check window.",
    },
    {
      rows: removeFieldsFromRows(offers, ["image_output_price"]),
      compatibility: "api_transit_offers.image_output_price column missing; wrote offers without image output split.",
    },
    {
      rows: removeFieldsFromRows(offers, ["availability_first_checked_at", "image_output_price"]),
      compatibility: "api_transit_offers optional columns missing; wrote offers without first-check window and image output split.",
    },
    {
      rows: removeAvailabilitySourceFields(offers),
      compatibility: "api_transit_offers availability source columns missing; wrote offers without source labels.",
    },
    {
      rows: removeFieldsFromRows(removeAvailabilitySourceFields(offers), ["availability_first_checked_at", "image_output_price"]),
      compatibility: "api_transit_offers optional columns missing; wrote offers without first-check window, image output split, or source labels.",
    },
  ];

  let lastMissingColumnError = null;
  for (const attempt of attempts) {
    try {
      await upsertRows(supabase, "api_transit_offers", attempt.rows, { onConflict: "station_id,standard_model,group_name" });
      return { compatibility: attempt.compatibility };
    } catch (error) {
      if (
        !isMissingColumnError(error, "availability_first_checked_at") &&
        !isMissingColumnError(error, "image_output_price") &&
        !isAvailabilitySourceColumnError(error)
      ) {
        throw error;
      }
      lastMissingColumnError = error;
    }
  }

  throw lastMissingColumnError;
}

function postRowsMessage(options, refreshedOfferKeys, autoPublishStationIds) {
  if (options.publish) return "API 中转公开价格已写入并发布。";
  if (autoPublishStationIds.size) return "API 中转公开价格已写入；自动发布来源已按最新快照同步。";
  if (refreshedOfferKeys.size) return "API 中转公开价格已写入；已发布来源已按最新快照同步。";
  return "API 中转公开价格已写入待审核队列。";
}

async function readExistingOffers(supabase, offers) {
  const stationIds = uniqueText(offers.map((offer) => offer.station_id)).filter(Boolean);
  const byId = new Map();
  for (const chunk of chunks(stationIds, 100)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("api_transit_offers")
      .select("id,station_id,standard_model,group_name,status,created_at,availability_first_checked_at")
      .in("station_id", chunk);
    if (error) {
      if (isMissingColumnError(error, "availability_first_checked_at")) {
        return readExistingOffersWithoutFirstCheckedAt(supabase, offers);
      }
      throw error;
    }
    for (const row of data || []) byId.set(offerKey(row), row);
  }
  return byId;
}

async function readExistingOffersWithoutFirstCheckedAt(supabase, offers) {
  const stationIds = uniqueText(offers.map((offer) => offer.station_id)).filter(Boolean);
  const byId = new Map();
  for (const chunk of chunks(stationIds, 100)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("api_transit_offers")
      .select("id,station_id,standard_model,group_name,status,created_at")
      .in("station_id", chunk);
    if (error) throw error;
    for (const row of data || []) byId.set(offerKey(row), row);
  }
  return byId;
}

function mergeOfferForRefresh(offer, existing, shouldActivate) {
  const row = { ...offer };
  delete row.auto_publish;
  return {
    ...row,
    id: existing?.id || offer.id,
    status: shouldActivate ? "active" : existing?.status || offer.status,
    availability_first_checked_at: existing?.availability_first_checked_at || offer.availability_first_checked_at,
    created_at: existing?.created_at || offer.created_at,
  };
}

function shouldAutoPublishSource(source) {
  return source.autoPublish === true || source.auto_publish === true;
}

function offerKey(offer) {
  return [offer.station_id, offer.standard_model, offer.group_name].map((part) => String(part || "")).join("|");
}

async function readExistingStations(supabase, stationIds) {
  return readExistingStationsWithColumns(supabase, stationIds, [
    "id",
    "source_type",
    "commercial_relation",
    "station_system",
    "operator_type",
    "invoice_support",
    "summary",
    "payment_methods",
    "minimum_top_up",
    "balance_expiry",
    "support_channels",
    "refund_policy",
    "data_status",
    "monitor_url",
    "commercial_offers",
    "verification_events",
    "availability_first_checked_at",
    "published",
    "admin_note",
    "created_at",
  ]);
}

async function readExistingStationsWithColumns(supabase, stationIds, columns) {
  const ids = uniqueText(stationIds).filter(Boolean);
  const byId = new Map();
  for (const chunk of chunks(ids, 300)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("api_transit_stations")
      .select(columns.join(","))
      .in("id", chunk);
    if (error) {
      const missingColumn = missingExistingStationColumn(error, columns);
      if (missingColumn) {
        return readExistingStationsWithColumns(
          supabase,
          stationIds,
          withoutColumns(columns, ...compatibleExistingStationColumnsToRemove(missingColumn)),
        );
      }
      throw error;
    }
    for (const row of data || []) byId.set(row.id, row);
  }
  return byId;
}

function mergeStationForRefresh(station, existing, options) {
  const { auto_publish: autoPublish, ...row } = station;
  const shouldPublish = options.publish || autoPublish;
  if (!existing) {
    return {
      ...row,
      published: Boolean(shouldPublish),
      data_status: shouldPublish ? "verified" : station.data_status,
      admin_note: row.admin_note,
    };
  }

  return {
    ...row,
    source_type: existing.source_type || station.source_type,
    commercial_relation: existing.commercial_relation || station.commercial_relation,
    station_system: existing.station_system || station.station_system,
    operator_type: existing.operator_type || station.operator_type,
    invoice_support: existing.invoice_support || station.invoice_support,
    summary: existing.summary || station.summary,
    payment_methods: Array.isArray(existing.payment_methods) ? existing.payment_methods : station.payment_methods,
    minimum_top_up: existing.minimum_top_up ?? station.minimum_top_up,
    balance_expiry: existing.balance_expiry ?? station.balance_expiry,
    support_channels: Array.isArray(existing.support_channels) ? existing.support_channels : station.support_channels,
    refund_policy: existing.refund_policy ?? station.refund_policy,
    data_status: shouldPublish ? "verified" : existing.data_status || station.data_status,
    monitor_url: existing.monitor_url ?? station.monitor_url,
    commercial_offers: existing.commercial_offers ?? station.commercial_offers,
    verification_events: existing.verification_events ?? station.verification_events,
    availability_first_checked_at: existing.availability_first_checked_at || station.availability_first_checked_at,
    published: shouldPublish ? true : Boolean(existing.published),
    admin_note: shouldPublish && row.collection_status === "success" ? row.admin_note : existing.admin_note || station.admin_note,
    created_at: existing.created_at || station.created_at,
  };
}

async function upsertRows(supabase, table, rows, options = {}) {
  for (const chunk of chunks(rows, 300)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).upsert(chunk, options);
    if (
      error &&
      table === "api_transit_stations" &&
      (
        isMissingColumnError(error, "availability_first_checked_at") ||
        isMissingColumnError(error, "station_system") ||
        isMissingColumnError(error, "operator_type") ||
        isMissingColumnError(error, "invoice_support")
      )
    ) {
      const compatibleChunk = removeFieldsFromRows(chunk, compatibleStationUpsertFieldsToRemove(error));
      const { error: fallbackError } = await supabase.from(table).upsert(compatibleChunk, options);
      if (!fallbackError) continue;
      fallbackError.table = table;
      throw fallbackError;
    }
    if (error && table === "api_transit_stations" && isAvailabilitySourceColumnError(error)) {
      const compatibleChunk = removeAvailabilitySourceFields(chunk);
      const { error: fallbackError } = await supabase.from(table).upsert(compatibleChunk, options);
      if (!fallbackError) continue;
      fallbackError.table = table;
      throw fallbackError;
    }
    if (error && table === "api_transit_availability_samples" && isSampleSourceColumnError(error)) {
      const compatibleChunk = removeSampleSourceFields(chunk);
      const { error: fallbackError } = await supabase.from(table).upsert(compatibleChunk, options);
      if (!fallbackError) continue;
      fallbackError.table = table;
      throw fallbackError;
    }
    if (error) {
      error.table = table;
      throw error;
    }
  }
}

function removeFieldsFromRows(rows, fieldNames) {
  return rows.map((row) => {
    const next = { ...row };
    for (const fieldName of fieldNames) delete next[fieldName];
    return next;
  });
}

function withoutColumns(columns, ...excluded) {
  return columns.filter((column) => !excluded.includes(column));
}

function missingExistingStationColumn(error, columns) {
  return columns.find((column) => isMissingColumnError(error, column)) || null;
}

function compatibleExistingStationColumnsToRemove(column) {
  if (column === "operator_type" || column === "invoice_support") return ["operator_type", "invoice_support"];
  return [column];
}

function compatibleStationUpsertFieldsToRemove() {
  return [
    "availability_first_checked_at",
    "station_system",
    "operator_type",
    "invoice_support",
  ];
}

function removeAvailabilitySourceFields(rows) {
  return removeFieldsFromRows(rows, [
    "availability_source_type",
    "availability_source_label",
    "availability_source_url",
    "sourceType",
    "sourceLabel",
    "sourceUrl",
  ]);
}

function removeSampleSourceFields(rows) {
  return removeFieldsFromRows(rows, ["source_type", "source_label", "source_url"]);
}

function loadSources() {
  return JSON.parse(readFileSync(configPath, "utf8"));
}

async function loadCollectionSources(options) {
  const sources = loadSources();
  if (!shouldRestrictToPublishedStations(options)) return sources;

  const publishedStationIds = await readPublishedApiTransitStationIds();
  return filterSourcesByPublishedStationIds(sources, publishedStationIds);
}

function selectSources(sources, options) {
  const ids = optionList(options.source || options.sources);
  const selected = ids.length ? sources.filter((source) => ids.includes(source.id)) : sources;
  if (!selected.length) throw new Error("No API transit sources matched.");
  return selected;
}

function shouldRestrictToPublishedStations(options) {
  const ids = optionList(options.source || options.sources);
  return Boolean((options.post || options.db) && !options.dryRun && !options.publish && !ids.length);
}

function filterSourcesByPublishedStationIds(sources, publishedStationIds) {
  return sources.filter((source) => publishedStationIds.has(source.id));
}

async function readPublishedApiTransitStationIds() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for published API transit source selection.");
  }

  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("id")
    .eq("published", true)
    .is("removed_at", null);
  if (error) {
    if (isMissingRemovedAtColumnError(error)) return readPublishedApiTransitStationIdsWithoutRemovedFilter(supabase);
    throw error;
  }

  return new Set((data || []).map((row) => String(row.id || "")).filter(Boolean));
}

async function readPublishedApiTransitStationIdsWithoutRemovedFilter(supabase) {
  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("id")
    .eq("published", true);
  if (error) throw error;
  return new Set((data || []).map((row) => String(row.id || "")).filter(Boolean));
}

function isMissingRemovedAtColumnError(error) {
  return isMissingColumnError(error, "removed_at");
}

function isMissingColumnError(error, columnName) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details || "");
  return (code === "42703" || code === "PGRST204") && message.includes(columnName);
}

function isAvailabilitySourceColumnError(error) {
  return (
    isMissingColumnError(error, "availability_source_type") ||
    isMissingColumnError(error, "availability_source_label") ||
    isMissingColumnError(error, "availability_source_url")
  );
}

function isSampleSourceColumnError(error) {
  return (
    isMissingColumnError(error, "source_type") ||
    isMissingColumnError(error, "source_label") ||
    isMissingColumnError(error, "source_url")
  );
}

function compactSnapshot(payload) {
  const text = JSON.stringify(payload);
  if (text.length <= 100000) return payload;
  return {
    truncated: true,
    keys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    bytes: text.length,
  };
}

function getSupabaseClient() {
  const env = readEnvFile(path.join(repoRoot, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function readEnvFile(filePath) {
  const output = {};
  if (!existsSync(filePath)) return output;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    output[match[1]] = unquote(match[2].trim());
  }
  return output;
}

function unquote(value) {
  const quote = value[0];
  if ((quote === `"` || quote === `'`) && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }
  return value;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;
    const rawKey = item.slice(2);
    const [key, inlineValue] = rawKey.split("=", 2);
    const next = values[index + 1];

    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function normalizeOptions(options) {
  return {
    ...options,
    dryRun: truthyOption(options.dryRun ?? options["dry-run"]),
    post: truthyOption(options.post),
    db: truthyOption(options.db),
    publish: truthyOption(options.publish),
  };
}

function envValue(name, options = {}) {
  if (!name) return "";
  const env = readEnvFile(envPath);
  return options.env?.[name] || process.env[name] || env[name] || "";
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function optionList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(optionList);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueText(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function rechargeRatioFromBilling(billing) {
  const multiplier = numberValue(billing?.balance_recharge_multiplier);
  if (multiplier === null || multiplier <= 0) return null;
  return `1:${round(multiplier, 6)}`;
}

function skippedSource(message, reason) {
  const error = new Error(message);
  error.code = SOURCE_SKIPPED;
  error.reason = reason;
  return error;
}

function round(value, digits) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function nullableSortValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function stableId(...parts) {
  const input = parts.filter((part) => part !== null && part !== undefined).join("|");
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 33) ^ input.charCodeAt(index);
  return `id-${(hash >>> 0).toString(36)}`;
}

function printSummary(result) {
  console.log(
    [
      "API transit collect plan.",
      `sources=${result.counts.sources}`,
      `stations=${result.counts.stations}`,
      `offers=${result.counts.offers}`,
      `runs=${result.counts.runs}`,
      result.database ? `database=${result.database.skipped ? "dry-run" : "posted"}` : "database=not-requested",
      result.publish ? "publish=true" : "publish=false",
    ].join(" "),
  );
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function errorMessage(error) {
  if (error?.name === "AbortError") return "请求超时。";
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") return JSON.stringify(error, null, 2);
  return String(error);
}

export const __test = {
  collectSuccessfulRefreshStationIds,
  collectRefreshedOfferKeys,
  filterSourcesByPublishedStationIds,
  findStaleRefreshedOfferIds,
  mergeStationForRefresh,
  applyZivvStatusAvailability,
  mergeOfferForRefresh,
  parseApinodePublicSiteInfoPayload,
  parseZivvModelHubPayload,
  shouldRestrictToPublishedStations,
};
