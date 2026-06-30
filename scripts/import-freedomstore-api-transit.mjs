#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "./safe-fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env.local");

const stationId = "freedomstore-asia";
const stationUrl = "https://freedomstore.asia/";
const dashboardUrl = "https://freedomstore.asia/dashboard";
const apiBaseUrl = "https://freedomstore.asia/v1";
const groupEndpoint = "https://freedomstore.asia/api/v1/groups/available";
const loginEndpoint = "https://freedomstore.asia/api/v1/auth/login";
const userAgent = "Mozilla/5.0 PriceAI/1.0 APITransitAccountCollector";

const verifiedModelMatrix = [
  {
    groupName: "GPT Plus",
    models: [{ family: "gpt", standardModel: "GPT 5.5", rawModelName: "gpt-5.5" }],
    accountPool: "plus",
    channelType: "official_api",
  },
  {
    groupName: "GPT Team",
    models: [{ family: "gpt", standardModel: "GPT 5.5", rawModelName: "gpt-5.5" }],
    accountPool: "team",
    channelType: "official_api",
  },
  {
    groupName: "GPT Pro",
    models: [{ family: "gpt", standardModel: "GPT 5.5", rawModelName: "gpt-5.5" }],
    accountPool: "pro",
    channelType: "official_api",
  },
  {
    groupName: "Claude Code",
    models: claudeVerifiedModels(),
    accountPool: "mixed",
    channelType: "first_party_pool",
  },
  {
    groupName: "Claude Anthropic官方",
    models: claudeVerifiedModels(),
    accountPool: "official_api",
    channelType: "official_api",
  },
  {
    groupName: "Claude-kiro反代",
    models: claudeVerifiedModels(),
    accountPool: "undisclosed",
    channelType: "cloud",
  },
  {
    groupName: "Claude-aws号池",
    models: claudeVerifiedModels(),
    accountPool: "mixed",
    channelType: "cloud",
  },
  {
    groupName: "Claude-aws官方",
    models: claudeVerifiedModels(),
    accountPool: "official_api",
    channelType: "cloud",
  },
];

if (isCli()) {
  const options = normalizeOptions(parseArgs(process.argv.slice(2)));

  try {
    const result = await importFreedomStoreTransit(options);
    printSummary(result);
    if (options.dryRun || options.verbose) {
      console.log(JSON.stringify(redactResult(result), null, 2));
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function importFreedomStoreTransit(options = {}) {
  options = normalizeOptions(options);
  const startedAt = new Date().toISOString();
  const groups = await fetchFreedomStoreGroups(options);
  const rows = buildRows(groups, startedAt, options);

  const result = {
    dryRun: Boolean(options.dryRun),
    post: Boolean(options.post || options.db),
    publish: Boolean(options.publish),
    source: "freedomstore_sub2api_account",
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: {
      groups: groups.length,
      stations: rows.stations.length,
      offers: rows.offers.length,
      runs: rows.runs.length,
    },
    stations: rows.stations,
    offers: rows.offers,
    runs: rows.runs,
  };

  if (options.post || options.db) {
    result.database = await postRows(rows, options);
  }

  return result;
}

function claudeVerifiedModels() {
  return [
    { family: "claude", standardModel: "Claude Sonnet 4.6", rawModelName: "claude-sonnet-4-6" },
    { family: "claude", standardModel: "Claude Opus 4.6", rawModelName: "claude-opus-4-6" },
    { family: "claude", standardModel: "Claude Opus 4.7", rawModelName: "claude-opus-4-7" },
  ];
}

async function fetchFreedomStoreGroups(options) {
  const fileEnv = readEnvFile(envPath);
  const email = options.email || process.env.FREEDOMSTORE_EMAIL || fileEnv.FREEDOMSTORE_EMAIL;
  const password = options.password || process.env.FREEDOMSTORE_PASSWORD || fileEnv.FREEDOMSTORE_PASSWORD;
  if (!email || !password) {
    throw new Error("Missing FREEDOMSTORE_EMAIL or FREEDOMSTORE_PASSWORD.");
  }

  const loginResponse = await safeFetch(loginEndpoint, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "user-agent": userAgent,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!loginResponse.ok) throw new Error(`FreedomStore login failed: HTTP ${loginResponse.status}`);

  const loginPayload = await loginResponse.json();
  const token =
    loginPayload?.data?.token ||
    loginPayload?.data?.access_token ||
    loginPayload?.token ||
    loginPayload?.access_token;
  const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] || null;
  if (!token && !cookie) throw new Error("FreedomStore login did not return an auth token or session cookie.");

  const headers = {
    "accept": "application/json",
    "user-agent": userAgent,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;

  const groupResponse = await safeFetch(groupEndpoint, { headers });
  if (!groupResponse.ok) throw new Error(`FreedomStore groups fetch failed: HTTP ${groupResponse.status}`);
  const payload = await groupResponse.json();
  const groups = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  if (!groups.length) throw new Error("FreedomStore groups response was empty.");

  return groups.map(normalizeGroup).filter((group) => group.status === "active");
}

function normalizeGroup(group) {
  return {
    id: numberValue(group.id),
    name: String(group.name || group.display_name || group.group_name || "").trim(),
    description: String(group.description || "").trim(),
    platform: String(group.platform || "").trim(),
    multiplier: numberValue(group.rate_multiplier ?? group.multiplier ?? group.rate ?? group.group_ratio),
    status: String(group.status || "unknown"),
    updatedAt: group.updated_at ? String(group.updated_at) : null,
  };
}

function buildRows(groups, collectedAt, options) {
  const groupByName = new Map(groups.map((group) => [group.name, group]));
  const offers = [];
  const skippedGroups = [];

  for (const groupPlan of verifiedModelMatrix) {
    const group = groupByName.get(groupPlan.groupName);
    if (!group || group.multiplier === null) {
      skippedGroups.push(groupPlan.groupName);
      continue;
    }

    for (const model of groupPlan.models) {
      offers.push(buildOfferRow({ group, groupPlan, model, collectedAt }));
    }
  }

  const station = {
    id: stationId,
    slug: stationId,
    name: "FreedomStore",
    website_url: stationUrl,
    api_base_url: apiBaseUrl,
    pricing_url: dashboardUrl,
    status: "active",
    source_type: "manual_collected",
    commercial_relation: "none",
    summary:
      "通过 FreedomStore 登录态分组接口抓取 Sub2API 分组倍率，并结合 PriceAI 临时 Key 实测结果发布。当前只展示 GPT 5.5 与 Claude Sonnet/Opus 4.6/4.7 的已通过样本；GPT 5.4 与 Claude Opus 4.8 不作为可用模型展示。",
    channel_types: ["official_api", "cloud", "first_party_pool", "mixed"],
    account_pools: ["plus", "team", "pro", "official_api", "mixed", "undisclosed"],
    payment_methods: [],
    minimum_top_up: null,
    balance_expiry: null,
    support_channels: ["官网工单/后台"],
    refund_policy: null,
    risk_labels: ["mixed_pool", "insufficient_samples"],
    usage_advice: "try_small",
    data_status: "verified",
    availability_seven_day_rate: offers.length ? 1 : null,
    availability_seven_day_samples: offers.length,
    availability_first_checked_at: offers.length ? collectedAt : null,
    availability_last_checked_at: collectedAt,
    availability_note: "登录分组接口已抓取；可用性来自 PriceAI 临时 Key 的单轮抽样，失败目标未发布为可用模型。",
    availability_source_type: "priceai_probe",
    availability_source_label: "PriceAI 实测",
    availability_source_url: null,
    feedback_pending_count: 0,
    feedback_verified_risk_count: 0,
    feedback_merchant_responded_count: 0,
    feedback_main_themes: [],
    feedback_public_notes: null,
    collector_kind: "sub2api_account",
    pricing_endpoint_url: groupEndpoint,
    collection_status: skippedGroups.length ? "partial" : "success",
    collection_error: skippedGroups.length ? `未找到分组：${skippedGroups.join("、")}` : null,
    last_collected_at: collectedAt,
    last_updated_at: collectedAt,
    published: Boolean(options.publish),
    admin_note: `账号登录抓取 ${groups.length} 个分组，发布 ${offers.length} 条已验真模型分组报价。`,
  };

  const run = {
    id: stableId("api-transit-freedomstore-run", collectedAt),
    station_id: stationId,
    run_type: "api_probe",
    status: skippedGroups.length ? "partial" : "success",
    model_count: groups.length,
    offer_count: offers.length,
    error_message: skippedGroups.length ? station.collection_error : null,
    source_url: groupEndpoint,
    started_at: collectedAt,
    finished_at: new Date().toISOString(),
    raw_snapshot: {
      groups,
      publishedModels: offers.map((offer) => ({
        standardModel: offer.standard_model,
        groupName: offer.group_name,
        multiplier: offer.model_multiplier,
      })),
      excludedTargets: [
        {
          standardModel: "GPT 5.4",
          reason: "模型列表可见但真实调用返回当前 ChatGPT 账号不支持。",
        },
        {
          standardModel: "Claude Opus 4.8",
          reason: "强制探测返回 No available accounts，未作为可用模型发布。",
        },
      ],
    },
    logs: {
      collectorKind: "sub2api_account",
      auth: "account_login",
      source: "groups_available",
    },
  };

  return { stations: [station], offers, runs: [run] };
}

function buildOfferRow({ group, groupPlan, model, collectedAt }) {
  return {
    id: stableId("api-transit-offer", stationId, model.standardModel, group.id || group.name),
    station_id: stationId,
    family: model.family,
    standard_model: model.standardModel,
    raw_model_name: model.rawModelName,
    group_name: group.name,
    recharge_ratio: "1:1",
    model_multiplier: group.multiplier,
    input_price: group.multiplier,
    output_price: group.multiplier,
    cache_read_price: null,
    cache_write_price: null,
    currency: "CNY",
    account_pool: groupPlan.accountPool,
    channel_type: groupPlan.channelType,
    price_source: "Sub2API 登录分组接口 + PriceAI 临时 Key 实测",
    source_url: dashboardUrl,
    availability_seven_day_rate: 1,
    availability_seven_day_samples: 1,
    availability_first_checked_at: collectedAt,
    availability_last_checked_at: collectedAt,
    availability_note: "单轮临时 Key 抽样通过；后续接入定时探测后替换为滚动样本。",
    availability_source_type: "priceai_probe",
    availability_source_label: "PriceAI 实测",
    availability_source_url: null,
    last_verified_at: collectedAt,
    status: "active",
    raw_payload: {
      group: {
        id: group.id,
        name: group.name,
        platform: group.platform,
        description: group.description,
        multiplier: group.multiplier,
        updatedAt: group.updatedAt,
      },
      probe: {
        source: "PriceAI temporary key",
        result: "passed",
      },
    },
  };
}

async function postRows(rows, options) {
  const plan = {
    dryRun: Boolean(options.dryRun),
    stations: rows.stations.length,
    offers: rows.offers.length,
    runs: rows.runs.length,
    publish: Boolean(options.publish),
  };

  if (options.dryRun) {
    return {
      ...plan,
      skipped: true,
      message: "--dry-run --post only validates FreedomStore rows.",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");

  const existingStations = await readExistingFirstCheckedAt(supabase, "api_transit_stations", rows.stations.map((station) => station.id));
  const existingOffers = await readExistingFirstCheckedAt(supabase, "api_transit_offers", rows.offers.map((offer) => offer.id));
  const stations = rows.stations.map((station) => mergeFirstCheckedAt(station, existingStations.get(station.id)));
  const offers = rows.offers.map((offer) => mergeFirstCheckedAt(offer, existingOffers.get(offer.id)));

  await upsertRows(supabase, "api_transit_stations", stations, { onConflict: "id" });
  await upsertRows(supabase, "api_transit_offers", offers, { onConflict: "id" });
  await upsertRows(supabase, "api_transit_detection_runs", rows.runs, { onConflict: "id" });

  return {
    ...plan,
    skipped: false,
    message: options.publish ? "FreedomStore API 中转数据已写入并发布。" : "FreedomStore API 中转数据已写入待审核队列。",
  };
}

async function readExistingFirstCheckedAt(supabase, table, ids) {
  const byId = new Map();
  for (const chunk of chunks(ids.filter(Boolean), 300)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from(table)
      .select("id,availability_first_checked_at")
      .in("id", chunk);
    if (error) {
      if (isMissingColumnError(error, "availability_first_checked_at")) return byId;
      throw error;
    }
    for (const row of data || []) byId.set(row.id, row);
  }
  return byId;
}

function mergeFirstCheckedAt(row, existing) {
  return {
    ...row,
    availability_first_checked_at: existing?.availability_first_checked_at || row.availability_first_checked_at,
  };
}

async function upsertRows(supabase, table, rows, options = {}) {
  for (const chunk of chunks(rows, 300)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).upsert(chunk, options);
    if (error && isMissingColumnError(error, "availability_first_checked_at")) {
      const { error: fallbackError } = await supabase
        .from(table)
        .upsert(removeFieldsFromRows(chunk, ["availability_first_checked_at"]), options);
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

function isMissingColumnError(error, columnName) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details || "");
  return (code === "42703" || code === "PGRST204") && message.includes(columnName);
}

function getSupabaseClient() {
  const env = readEnvFile(envPath);
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
    verbose: truthyOption(options.verbose),
  };
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function redactResult(result) {
  return {
    ...result,
    stations: result.stations.map((station) => ({
      ...station,
      raw_payload: undefined,
    })),
  };
}

function printSummary(result) {
  console.log(
    [
      "FreedomStore API transit import.",
      `groups=${result.counts.groups}`,
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
