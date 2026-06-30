#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env.local");
const defaultFormId = "102El45H2ZB7Di_ErU10-cdS-yJvJjMtV36_jUvRZfYE";
const defaultFormPath = "/tmp/priceai-api-transit-form.json";
const defaultResponsesPath = "/tmp/priceai-api-transit-responses.json";
const defaultFetchedDir = "/tmp";

const questionIds = {
  role: "6bfbf5cf",
  name: "15166552",
  contact: "5f6586bc",
  website: "61909aab",
  system: "350ffb7a",
  apiBase: "37693b04",
  pricing: "3bffc1e9",
  monitor: "0efd27fb",
  models: "1aaccab9",
  customerTypes: "43a66e67",
  channelDisclosure: "5adc109a",
  channelTypes: "3fc3ae5d",
  monitoringAuthorization: "65c205c6",
  updateMode: "16664bd8",
  cooperation: "4900f7a9",
  merchantOffer: "24983954",
  materials: "7dd204ce",
  notes: "0c73c848",
};

const stationIdsByName = new Map([
  ["FranklyBuilds中转站", "franklybuilds-api"],
  ["APINode", "apinode-ltd"],
]);

const apinodeRatesUrl = "https://omniwiki-1408222167.cos.ap-guangzhou.myqcloud.com/dev/QQ20260616-160233.png";
const apinodeMonitorUrl = "https://omniwiki-1408222167.cos.ap-guangzhou.myqcloud.com/dev/QQ20260616-160317.png";

if (isCli()) {
  const options = normalizeOptions(parseArgs(process.argv.slice(2)));

  try {
    const result = await importApiTransitFormResponses(options);
    printSummary(result);
    if (options.dryRun || options.verbose) {
      console.log(JSON.stringify(redactResult(result), null, 2));
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function importApiTransitFormResponses(options = {}) {
  options = normalizeOptions(options);
  const { form, responses } = await loadFormPayloads(options);
  const rows = buildRows({ form, responses, includeEvidence: options.includeEvidence });

  const result = {
    dryRun: Boolean(options.dryRun),
    post: Boolean(options.post || options.db),
    source: "google_forms_api_transit_intake",
    formId: form.formId || options.formId || defaultFormId,
    formTitle: form.info?.title || null,
    generatedAt: new Date().toISOString(),
    counts: {
      responses: responses.responses?.length || 0,
      submissions: rows.submissions.length,
      manualStations: rows.stations.length,
      manualOffers: rows.offers.length,
      manualRuns: rows.runs.length,
    },
    submissions: rows.submissions,
    stations: rows.stations,
    offers: rows.offers,
    runs: rows.runs,
    importNotes: rows.importNotes,
  };

  if (options.post || options.db) {
    result.database = await postRows(rows, options);
  }

  return result;
}

async function loadFormPayloads(options) {
  if (options.fetch) {
    return fetchFormPayloads(options);
  }

  const formPath = path.resolve(options.form || defaultFormPath);
  const responsesPath = path.resolve(options.responses || defaultResponsesPath);
  if (!existsSync(formPath) || !existsSync(responsesPath)) {
    return fetchFormPayloads(options);
  }

  return {
    form: JSON.parse(readFileSync(formPath, "utf8")),
    responses: JSON.parse(readFileSync(responsesPath, "utf8")),
  };
}

async function fetchFormPayloads(options) {
  const formId = options.formId || defaultFormId;
  const token = await getGoogleAccessToken();
  const headers = { authorization: `Bearer ${token}` };
  const [formResponse, responsesResponse] = await Promise.all([
    fetch(`https://forms.googleapis.com/v1/forms/${formId}`, { headers }),
    fetch(`https://forms.googleapis.com/v1/forms/${formId}/responses`, { headers }),
  ]);

  if (!formResponse.ok) throw new Error(`Google Forms form fetch failed: HTTP ${formResponse.status}`);
  if (!responsesResponse.ok) throw new Error(`Google Forms responses fetch failed: HTTP ${responsesResponse.status}`);

  const form = await formResponse.json();
  const responses = await responsesResponse.json();
  if (options.writeFetched !== false) {
    const dir = path.resolve(options.fetchedDir || defaultFetchedDir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "priceai-api-transit-form.json"), `${JSON.stringify(form, null, 2)}\n`, "utf8");
    await writeFile(path.join(dir, "priceai-api-transit-responses.json"), `${JSON.stringify(responses, null, 2)}\n`, "utf8");
  }

  return { form, responses };
}

async function getGoogleAccessToken() {
  const { stdout } = await execFile("gcloud", ["auth", "application-default", "print-access-token"], {
    maxBuffer: 1024 * 1024,
  });
  const token = stdout.trim();
  if (!token) throw new Error("gcloud did not return a Google access token.");
  return token;
}

function buildRows({ form, responses, includeEvidence }) {
  const submissions = [];
  const importNotes = [];
  const responseRows = Array.isArray(responses.responses) ? responses.responses : [];
  const titleByQuestionId = getTitleByQuestionId(form);

  let apinodeResponse = null;
  for (const response of responseRows) {
    const parsed = parseResponse(response);
    const name = firstText(parsed.name);
    const submittedUrl = cleanUrl(firstText(parsed.website));
    if (!name || !submittedUrl) {
      importNotes.push({
        responseId: response.responseId,
        level: "warning",
        message: "缺少站点名称或官网 URL，未导入。",
      });
      continue;
    }

    const pricingText = firstText(parsed.pricing);
    const monitorText = firstText(parsed.monitor);
    const materialsText = firstText(parsed.materials);
    const stationId = stationIdsByName.get(name) || null;
    const probeStatus = inferProbeStatus({ name, pricingText, monitorText, materialsText, parsed });
    const adminNote = buildSubmissionAdminNote({ name, probeStatus, pricingText, materialsText });

    submissions.push({
      id: stableId("api-transit-google-form-submission", response.responseId),
      submission_type: "merchant",
      submitted_url: submittedUrl,
      submitted_name: name,
      api_base_url: cleanUrl(firstText(parsed.apiBase)),
      pricing_url: cleanUrl(pricingText),
      contact: cleanText(firstText(parsed.contact)),
      notes: buildSubmissionNotes(parsed),
      submitted_models: listAnswer(parsed.models).slice(0, 30),
      submitted_meta: {
        source: "google_form",
        form_id: form.formId || defaultFormId,
        response_id: response.responseId,
        created_at: response.createTime || null,
        submitted_at: response.lastSubmittedTime || null,
        system_type: firstText(parsed.system),
        role: firstText(parsed.role),
        pricing_text: cleanText(pricingText),
        monitor_text: cleanText(monitorText),
        customer_types: listAnswer(parsed.customerTypes),
        channel_disclosure: firstText(parsed.channelDisclosure),
        channel_types_raw: listAnswer(parsed.channelTypes),
        channel_types_normalized: normalizeChannelTypes(listAnswer(parsed.channelTypes)),
        monitoring_authorization: listAnswer(parsed.monitoringAuthorization),
        update_mode: firstText(parsed.updateMode),
        cooperation: listAnswer(parsed.cooperation),
        merchant_offer: cleanText(firstText(parsed.merchantOffer)),
        materials_text: cleanText(materialsText),
        material_urls: extractUrls(materialsText),
        question_titles: titleByQuestionId,
      },
      parse_status: "parsed",
      probe_status: probeStatus,
      review_status: "pending",
      station_id: stationId,
      admin_note: adminNote,
      submitter_ip: null,
    });

    if (name === "APINode") apinodeResponse = { response, parsed };
  }

  const evidenceRows = includeEvidence && apinodeResponse ? buildApinodeEvidenceRows(apinodeResponse) : emptyRows();
  return {
    submissions,
    ...evidenceRows,
    importNotes,
  };
}

function getTitleByQuestionId(form) {
  const output = {};
  for (const item of form.items || []) {
    const questionId = item.questionItem?.question?.questionId;
    if (questionId && item.title) output[questionId] = item.title;
  }
  return output;
}

function parseResponse(response) {
  const answers = response.answers || {};
  const output = {};
  for (const [key, questionId] of Object.entries(questionIds)) {
    output[key] = answers[questionId]?.textAnswers?.answers?.map((answer) => answer.value).filter(Boolean) || [];
  }
  return output;
}

function inferProbeStatus({ name, pricingText, monitorText, materialsText, parsed }) {
  const values = [pricingText, monitorText, materialsText].join("\n");
  if (name === "FranklyBuilds中转站") return "public_pricing_found";
  if (name === "APINode" && extractUrls(values).length) return "public_pricing_found";
  if (cleanUrl(pricingText) || cleanUrl(monitorText)) return "public_pricing_found";
  const auth = listAnswer(parsed.monitoringAuthorization).join("\n");
  if (/测试账号|测试 Key|专用测试|预算|深度认证|付费检测/.test(auth)) return "needs_login";
  return "pending";
}

function buildSubmissionAdminNote({ name, probeStatus, pricingText, materialsText }) {
  if (name === "FranklyBuilds中转站") return "公开 New API 价格接口可读取，已接入自动采集源；报价待人工审核后发布。";
  if (name === "APINode") return "站长提供倍率和监控截图，已按公开截图证据录入待审报价；真实 API 监测仍需测试账号或 Key。";
  if (probeStatus === "public_pricing_found") return "已发现公开资料入口，待采集器适配或人工核验。";
  const publicText = [pricingText, materialsText].filter(Boolean).join("\n");
  if (publicText) return "站长提供了非结构化说明，待人工清洗。";
  return "未提供公开价格或监测入口，需要联系站长补测试账号、测试 Key 或机器可读价格页。";
}

function buildSubmissionNotes(parsed) {
  const notes = [];
  const offer = cleanText(firstText(parsed.merchantOffer));
  const extra = cleanText(firstText(parsed.notes));
  if (offer) notes.push(`专属优惠：${offer}`);
  if (extra) notes.push(`补充说明：${extra}`);
  return notes.length ? notes.join("\n") : null;
}

function buildApinodeEvidenceRows({ response, parsed }) {
  const collectedAt = new Date().toISOString();
  const stationId = "apinode-ltd";
  const rawChannelTypes = listAnswer(parsed.channelTypes);
  const channelTypes = normalizeChannelTypes(rawChannelTypes);
  const station = {
    id: stationId,
    slug: stationId,
    name: "APINode",
    website_url: "https://apinode.ltd/",
    api_base_url: "https://apinode.ltd/v1",
    pricing_url: apinodeRatesUrl,
    status: "active",
    source_type: "merchant_submitted",
    commercial_relation: "none",
    summary:
      "APINode 由站长通过 PriceAI 表单提交，当前公开资料包含 Sub2API 分组倍率截图和监控截图；PriceAI 尚未接入测试 Key 做真实调用检测。",
    channel_types: channelTypes.length ? channelTypes : ["cloud", "first_party_pool"],
    account_pools: ["plus", "team", "pro", "undisclosed"],
    payment_methods: [],
    minimum_top_up: null,
    balance_expiry: null,
    support_channels: ["TG", "QQ"],
    refund_policy: null,
    risk_labels: ["insufficient_samples", "pending_feedback"],
    usage_advice: "try_small",
    data_status: "pending_review",
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_first_checked_at: null,
    availability_last_checked_at: null,
    availability_note: "站长截图包含 30 日监控样本；尚未接入 PriceAI 自测，暂不写入近 7 日可用率。",
    feedback_pending_count: 0,
    feedback_verified_risk_count: 0,
    feedback_merchant_responded_count: 0,
    feedback_main_themes: [],
    feedback_public_notes: "注册账户输入 PriceAI 首次充值后可额外获得 5.88 通用额度。",
    collector_kind: "sub2api_public_screenshot",
    pricing_endpoint_url: null,
    collection_status: "manual_review",
    collection_error: null,
    last_collected_at: collectedAt,
    last_updated_at: collectedAt,
    published: false,
    admin_note: "根据站长在 Google Form 提交的公开截图半自动录入；待人工审核与真实 API Key 监测。",
  };

  const offers = [
    buildManualOffer({
      stationId,
      family: "gpt",
      standardModel: "GPT 5.5",
      rawModelName: "gpt-5.5",
      groupName: "Plus-经济通道",
      multiplier: 0.3,
      accountPool: "plus",
      channelType: "first_party_pool",
      collectedAt,
      monitor: {
        label: "Plus/Team渠道监控",
        provider: "OpenAI",
        model: "gpt-5.5",
        availability30d: 0.9982,
        sampleCount: 60,
        latencyMs: 2094,
        endpointPingMs: 387,
      },
    }),
    buildManualOffer({
      stationId,
      family: "gpt",
      standardModel: "GPT 5.5",
      rawModelName: "gpt-5.5",
      groupName: "Team/Plus-标准通道",
      multiplier: 0.5,
      accountPool: "mixed",
      channelType: "first_party_pool",
      collectedAt,
      monitor: {
        label: "Plus/Team渠道监控",
        provider: "OpenAI",
        model: "gpt-5.5",
        availability30d: 0.9982,
        sampleCount: 60,
        latencyMs: 2094,
        endpointPingMs: 387,
      },
    }),
    buildManualOffer({
      stationId,
      family: "gpt",
      standardModel: "GPT 5.5",
      rawModelName: "gpt-5.5",
      groupName: "Team/Plus/Pro-稳定通道",
      multiplier: 0.65,
      accountPool: "mixed",
      channelType: "first_party_pool",
      collectedAt,
      monitor: {
        label: "Plus/Team渠道监控",
        provider: "OpenAI",
        model: "gpt-5.5",
        availability30d: 0.9982,
        sampleCount: 60,
        latencyMs: 2094,
        endpointPingMs: 387,
      },
    }),
    buildManualOffer({
      stationId,
      family: "claude",
      standardModel: "Claude Opus 4.8",
      rawModelName: "claude-opus-4-8",
      groupName: "Claude Kiro分组",
      multiplier: 0.75,
      accountPool: "undisclosed",
      channelType: "cloud",
      collectedAt,
      monitor: {
        label: "Claude Kiro渠道监控",
        provider: "Anthropic",
        model: "claude-opus-4-8",
        availability30d: 0.9783,
        sampleCount: 60,
        latencyMs: 1947,
        endpointPingMs: 38,
      },
    }),
  ];

  const run = {
    id: stableId("api-transit-run", stationId, "google-form-evidence", response.responseId),
    station_id: stationId,
    run_type: "manual_review",
    status: "partial",
    model_count: 2,
    offer_count: offers.length,
    error_message: "站长公开截图已解析；缺少机器可读价格接口和 PriceAI 自测 Key。",
    source_url: apinodeRatesUrl,
    started_at: collectedAt,
    finished_at: collectedAt,
    raw_snapshot: {
      rates_image_url: apinodeRatesUrl,
      monitor_image_url: apinodeMonitorUrl,
      parsed_offers: offers.map((offer) => ({
        standard_model: offer.standard_model,
        group_name: offer.group_name,
        multiplier: offer.model_multiplier,
      })),
    },
    logs: {
      collectorKind: "sub2api_public_screenshot",
      responseId: response.responseId,
      monitor30d: [
        {
          label: "Plus/Team渠道监控",
          provider: "OpenAI",
          model: "gpt-5.5",
          availability: 0.9982,
          samples: 60,
          latencyMs: 2094,
          endpointPingMs: 387,
        },
        {
          label: "Claude Kiro渠道监控",
          provider: "Anthropic",
          model: "claude-opus-4-8",
          availability: 0.9783,
          samples: 60,
          latencyMs: 1947,
          endpointPingMs: 38,
        },
      ],
    },
  };

  return { stations: [station], offers, runs: [run] };
}

function buildManualOffer({ stationId, family, standardModel, rawModelName, groupName, multiplier, accountPool, channelType, collectedAt, monitor }) {
  return {
    id: stableId("api-transit-offer", stationId, standardModel, groupName),
    station_id: stationId,
    family,
    standard_model: standardModel,
    raw_model_name: rawModelName,
    group_name: groupName,
    recharge_ratio: "1:1",
    model_multiplier: multiplier,
    input_price: multiplier,
    output_price: multiplier,
    cache_read_price: multiplier,
    cache_write_price: multiplier,
    currency: "CNY",
    account_pool: accountPool,
    channel_type: channelType,
    price_source: "站长公开截图（Google Form Q17）",
    source_url: apinodeRatesUrl,
    availability_seven_day_rate: null,
    availability_seven_day_samples: 0,
    availability_first_checked_at: null,
    availability_last_checked_at: null,
    availability_note: `站长监控截图显示 30 日样本：${monitor.label} ${formatPercent(monitor.availability30d)} / ${monitor.sampleCount} 条；尚未接入 PriceAI 自测。`,
    availability_source_type: "merchant_reported",
    availability_source_label: "商家提交",
    availability_source_url: apinodeMonitorUrl,
    last_verified_at: collectedAt,
    status: "needs_review",
    raw_payload: {
      source: "google_form_public_screenshot",
      rates_image_url: apinodeRatesUrl,
      monitor_image_url: apinodeMonitorUrl,
      monitor_30d: monitor,
    },
  };
}

async function postRows(rows, options) {
  const plan = {
    dryRun: Boolean(options.dryRun),
    submissions: rows.submissions.length,
    manualStations: rows.stations.length,
    manualOffers: rows.offers.length,
    manualRuns: rows.runs.length,
  };

  if (options.dryRun) {
    return {
      ...plan,
      skipped: true,
      message: "--dry-run --post 只验证将要写入的表单响应，不连接 Supabase。",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");

  await upsertRows(supabase, "api_transit_stations", rows.stations, { onConflict: "id" });
  await upsertRows(supabase, "api_transit_offers", rows.offers, { onConflict: "id" });
  await upsertRows(supabase, "api_transit_detection_runs", rows.runs, { onConflict: "id" });

  const submissions = await removeMissingStationLinks(supabase, rows.submissions, rows.stations.map((station) => station.id));
  await upsertRows(supabase, "api_transit_submissions", submissions, { onConflict: "id" });

  return {
    ...plan,
    skipped: false,
    message: "Google Form 入驻响应已写入 API 中转后台待审队列。",
  };
}

async function removeMissingStationLinks(supabase, submissions, insertedStationIds) {
  const stationIds = uniqueText([
    ...insertedStationIds,
    ...submissions.map((submission) => submission.station_id).filter(Boolean),
  ]);
  if (!stationIds.length) return submissions;

  const { data, error } = await supabase.from("api_transit_stations").select("id").in("id", stationIds);
  if (error) throw error;
  const existing = new Set((data || []).map((row) => row.id));
  return submissions.map((submission) => ({
    ...submission,
    station_id: submission.station_id && existing.has(submission.station_id) ? submission.station_id : null,
  }));
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

function cleanUrl(value) {
  const text = cleanText(value);
  if (!text) return null;
  const firstUrl = extractUrls(text)[0] || text;
  try {
    const url = new URL(firstUrl.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrls(value) {
  const text = String(value || "");
  const matches = text.match(/https?:\/\/[^\s，。)）]+/g) || [];
  return matches.map((item) => item.trim().replace(/[，。,.)）]+$/, ""));
}

function normalizeChannelTypes(values) {
  const output = new Set();
  for (const value of values) {
    if (/官方 API/.test(value)) output.add("official_api");
    if (/云厂商|AWS|Bedrock|Vertex|Azure/i.test(value)) output.add("cloud");
    if (/一手自建号池|自有订阅/.test(value)) output.add("first_party_pool");
    if (/一手批发/.test(value)) output.add("first_party_wholesale");
    if (/二级分销|其他中转站/.test(value)) output.add("reseller");
    if (/混合渠道/.test(value)) output.add("mixed");
    if (/未披露|暂不方便/.test(value)) output.add("undisclosed");
  }
  return Array.from(output);
}

function emptyRows() {
  return { stations: [], offers: [], runs: [] };
}

function firstText(values) {
  if (Array.isArray(values)) return values[0] || "";
  return String(values || "");
}

function listAnswer(values) {
  return Array.isArray(values) ? values.map(cleanText).filter(Boolean) : [];
}

function cleanText(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function uniqueText(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "未知";
  return `${(value * 100).toFixed(2)}%`;
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
  if ((quote === `"` || quote === `'`) && value[value.length - 1] === quote) return value.slice(1, -1);
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
    formId: options.formId || options["form-id"],
    fetchedDir: options.fetchedDir || options["fetched-dir"],
    dryRun: truthyOption(options.dryRun ?? options["dry-run"]),
    fetch: truthyOption(options.fetch),
    post: truthyOption(options.post),
    db: truthyOption(options.db),
    verbose: truthyOption(options.verbose),
    includeEvidence: !truthyOption(options["no-evidence"]),
    writeFetched: !truthyOption(options["no-write-fetched"]),
  };
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function redactResult(result) {
  return {
    ...result,
    submissions: result.submissions.map((submission) => ({
      ...submission,
      contact: submission.contact ? "[redacted]" : null,
    })),
  };
}

function printSummary(result) {
  console.log(
    [
      "API transit form import plan.",
      `responses=${result.counts.responses}`,
      `submissions=${result.counts.submissions}`,
      `manualStations=${result.counts.manualStations}`,
      `manualOffers=${result.counts.manualOffers}`,
      `manualRuns=${result.counts.manualRuns}`,
      result.database ? `database=${result.database.skipped ? "dry-run" : "posted"}` : "database=not-requested",
    ].join(" "),
  );
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") return JSON.stringify(error, null, 2);
  return String(error);
}
