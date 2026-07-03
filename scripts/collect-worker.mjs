#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { collectApiModels } from "./collect-api-models.mjs";
import { collectApiTransitPrices } from "./collect-api-transit.mjs";
import { collectOfficialPrices, refreshOfficialPriceFxRates } from "./collect-official-prices.mjs";
import { createCollectionFamilyState, runPriceCollection } from "./collect-prices.mjs";
import { pruneOperationalLogs } from "./operational-log-retention.mjs";

const env = readEnvFile(".env.local");
const args = parseArgs(process.argv.slice(2));
const workerId =
  args.worker ||
  args["worker-id"] ||
  process.env.PRICEAI_COLLECTOR_NODE_ID ||
  env.PRICEAI_COLLECTOR_NODE_ID ||
  "unknown-worker";
const endpoint =
  args.endpoint ||
  process.env.CRON_PUBLIC_BASE_URL ||
  env.CRON_PUBLIC_BASE_URL ||
  "https://priceai.cc";
const password =
  args.password ||
  process.env.CRON_SECRET ||
  env.CRON_SECRET ||
  null;
const maxJobs = clampInteger(args.maxJobs || args["max-jobs"] || 1, 1, 20);
const lockSeconds = clampInteger(args.lockSeconds || args["lock-seconds"] || 1800, 60, 7200);
const channelCollectionFamilyState = createCollectionFamilyState({
  ...args,
  familyProtection: true,
});

if (args["local-job"]) {
  try {
    const result = await runLocalJob(String(args["local-job"]));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
  process.exit(0);
}

const supabase = getSupabaseClient();
if (!supabase) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，无法领取采集任务。");
  process.exit(1);
}

let processed = 0;

for (let index = 0; index < maxJobs; index += 1) {
  const job = await claimJob();
  if (!job) {
    if (processed === 0) console.log("No pending collection jobs.");
    break;
  }

  processed++;
  await runJob(job);
}

async function claimJob() {
  const { data, error } = await supabase.rpc("claim_collection_job", {
    p_worker: workerId,
    p_lock_seconds: lockSeconds,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

async function runJob(job) {
  const startedAt = new Date().toISOString();
  const sourceId = jobSourceId(job);
  const jobLabel = jobLabelForLog(job, sourceId);
  console.log(`Running collection job ${job.id} (${job.job_type}:${jobLabel})`);

  try {
    const result = await runCollectionJobByType(job, sourceId);
    const status = jobStatusForResult(job, result);
    await updateJob(job.id, {
      status,
      finished_at: new Date().toISOString(),
      locked_by: null,
      locked_until: null,
      last_error: status === "failed" ? firstFailureMessage(result) : null,
      result: {
        ...result,
        startedAt,
        endpoint,
        worker: workerId,
      },
    });
    if (job.requested_by === "feedback") {
      await updateFeedbackForCompletedJob(job, status, result);
    }
    console.log(`Collection job ${job.id} ${status}.`);
  } catch (error) {
    const message = errorMessage(error);
    await updateJob(job.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      locked_by: null,
      locked_until: null,
      last_error: message,
      result: {
        startedAt,
        endpoint,
        worker: workerId,
        error: message,
      },
    });
    console.error(`Collection job ${job.id} failed: ${message}`);
  }

  await pruneOperationalLogs(supabase, env);
}

async function updateFeedbackForCompletedJob(job, status, result) {
  const feedbackId = job?.result?.feedbackId;
  if (!feedbackId) return;

  const finishedAt = new Date().toISOString();
  const successful = status === "success";
  const message = successful
    ? `来源「${job.source_name || job.source_id || "未知来源"}」已完成重采；请按最新报价状态复核该反馈。`
    : `来源「${job.source_name || job.source_id || "未知来源"}」重采未成功：${firstFailureMessage(result)}`;

  const { error } = await supabase
    .from("offer_feedback")
    .update({
      verification_status: successful ? "manual_review" : "failed",
      verification_result: successful ? "inconclusive" : "blocked",
      verification_message: message,
      verification_checked_at: finishedAt,
      ai_review_result: {
        ...(job.result || {}),
        verificationStatus: successful ? "manual_review" : "failed",
        verificationResult: successful ? "inconclusive" : "blocked",
        verificationMessage: message,
        verifiedAt: finishedAt,
        completedCollectionJobId: job.id,
      },
    })
    .eq("id", feedbackId);

  if (error) {
    console.warn(`Feedback ${feedbackId} update after collection job failed: ${error.message || String(error)}`);
  }
}

async function runCollectionJobByType(job, sourceId) {
  if (job.job_type === "official_prices") return runOfficialPriceJob(job);
  if (job.job_type === "api_models") return runApiModelJob();
  if (job.job_type === "api_transit_public_pricing") return runApiTransitPublicPricingJob(sourceId);
  return runChannelPriceJob(sourceId, job);
}

async function runLocalJob(jobType) {
  if (jobType !== "api_models") {
    throw new Error("本地验证目前只支持 --local-job api_models，避免误触发卡网或官方价写库任务。");
  }

  return runApiModelJob();
}

async function runChannelPriceJob(sourceId, job = null) {
  if (!password) {
    throw new Error("渠道采集写回需要 --password 或 CRON_SECRET。");
  }

  const jobResult = job && typeof job.result === "object" ? job.result : {};
  return runPriceCollection({
    all: !sourceId,
    source: sourceId || undefined,
    post: true,
    endpoint,
    password,
    silent: Boolean(args.silent),
    force: true,
    "no-cooldown": truthyOption(jobResult.noCooldown) || truthyOption(jobResult["no-cooldown"]),
    concurrency: args.concurrency || args["concurrency"],
    "post-batch-size": args["post-batch-size"] || args.postBatchSize,
    "flush-source-count": args["flush-source-count"] || args.flushSourceCount,
    "flush-interval-ms": args["flush-interval-ms"] || args.flushIntervalMs,
    "page-delay-ms": args["page-delay-ms"] || args.pageDelayMs,
    retries: args.retries || args.retry,
    "collector-node-id": workerId,
    "collector-node-name": args["worker-name"] || env.PRICEAI_COLLECTOR_NODE_NAME || "国内 VPS Worker",
    "collector-node-type": args["worker-type"] || env.PRICEAI_COLLECTOR_NODE_TYPE || "vps",
    "collector-node-runtime": args["worker-runtime"] || env.PRICEAI_COLLECTOR_NODE_RUNTIME || "worker",
    "collector-node-region": args["worker-region"] || env.PRICEAI_COLLECTOR_NODE_REGION || null,
    collectionFamilyState: channelCollectionFamilyState,
  });
}

async function runOfficialPriceJob(job) {
  const app = args["official-app"] || env.PRICEAI_OFFICIAL_PRICE_APP || undefined;
  const regions = args["official-regions"] || env.PRICEAI_OFFICIAL_PRICE_REGIONS || undefined;
  const officialMode =
    jobMode(args["official-mode"]) ||
    jobMode(jobResultMode(job)) ||
    jobMode(env.PRICEAI_OFFICIAL_PRICE_MODE) ||
    "weekly_full";

  if (officialMode === "fx_only") {
    return refreshOfficialPriceFxRates({
      regions,
      post: true,
      mode: "worker",
    });
  }

  return collectOfficialPrices({
    all: !app,
    app,
    regions,
    post: true,
    mode: "worker",
    timeoutMs: args["official-timeout-ms"] || env.PRICEAI_OFFICIAL_PRICE_TIMEOUT_MS,
  });
}

async function runApiModelJob() {
  const provider = args["api-provider"] || env.PRICEAI_API_MODEL_PROVIDER || undefined;
  const result = await collectApiModels({
    all: !provider,
    provider,
    dryRun: true,
    noFetch: truthyOption(args["api-no-fetch"] || env.PRICEAI_API_MODEL_NO_FETCH),
    timeoutMs: args["api-timeout-ms"] || env.PRICEAI_API_MODEL_TIMEOUT_MS,
  });

  result.database = Boolean(args["local-job"]) || truthyOption(args["dry-run"] || args.dryRun || args["skip-db"])
    ? {
        status: "skipped",
        rows: 0,
        message: "本地 dry-run 未写入 api_collection_runs。",
      }
    : await postApiModelCollectionRuns(result);
  return result;
}

async function runApiTransitPublicPricingJob(sourceId) {
  return collectApiTransitPrices({
    all: !sourceId,
    source: sourceId || undefined,
    post: true,
    timeoutMs: args["api-transit-timeout-ms"] || env.PRICEAI_API_TRANSIT_TIMEOUT_MS,
  });
}

async function postApiModelCollectionRuns(result) {
  const providerSnapshots = Array.isArray(result?.providers) ? result.providers : [];
  if (!providerSnapshots.length) {
    return {
      status: "skipped",
      rows: 0,
      message: "API 模型采集结果中没有 provider 快照。",
    };
  }

  const now = new Date().toISOString();
  const rows = providerSnapshots.map((snapshot) => {
    const provider = snapshot.provider || {};
    const providerId = provider.id ? String(provider.id) : null;
    const status = apiCollectionRunStatus(snapshot.status);
    return {
      id: stableWorkerId("api-collection-run", providerId || "all", result.generatedAt || now),
      provider_id: providerId,
      collector_kind: provider.collectorKind ? String(provider.collectorKind) : null,
      status,
      model_count: Number(snapshot.modelCount || 0),
      offer_count: Number(snapshot.offerCount || 0),
      error_message: status === "failed" ? firstProbeError(snapshot) : null,
      raw_snapshot_url: null,
      started_at: result.generatedAt || now,
      finished_at: now,
      logs: {
        run: result.run || null,
        provider: provider,
        probes: Array.isArray(snapshot.probes) ? snapshot.probes.slice(0, 20) : [],
      },
    };
  });

  const { error } = await supabase.from("api_collection_runs").upsert(rows, { onConflict: "id" });
  if (error) {
    return {
      status: "failed",
      rows: 0,
      message: error.message || String(error),
    };
  }

  return {
    status: "posted",
    rows: rows.length,
    message: "API 模型采集日志已写入 api_collection_runs。",
  };
}

async function updateJob(id, patch) {
  const { error } = await supabase
    .from("collection_jobs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

function jobStatusForResult(job, result) {
  if (job.job_type === "official_prices") {
    return result?.run?.status === "failed" ? "failed" : "success";
  }

  if (job.job_type === "api_models") {
    return result?.run?.status === "failed" || result?.database?.status === "failed" ? "failed" : "success";
  }

  if (job.job_type === "api_transit_public_pricing") {
    return Number(result?.counts?.offers || 0) > 0 ? "success" : "failed";
  }

  const summary = Array.isArray(result?.summary) ? result.summary : [];
  if (job.job_type === "source") {
    return summary[0]?.status === "success" ? "success" : "failed";
  }
  return Number(result?.successCount || 0) > 0 ? "success" : "failed";
}

function firstFailureMessage(result) {
  if (result?.source === "api_transit_public_pricing") {
    const failedRun = Array.isArray(result.runs) ? result.runs.find((run) => run?.status === "failed") : null;
    return failedRun?.error_message || "API 中转公开倍率刷新未成功完成。";
  }

  if (result?.source?.kind === "static_api_model_dataset_with_source_probe") {
    return result?.database?.status === "failed"
      ? result.database.message || "API 模型采集日志写入失败。"
      : result?.run?.firstError || result?.database?.message || "API 模型采集任务未成功完成。";
  }

  if (result?.run) {
    const failures = Array.isArray(result.failures) ? result.failures : [];
    return failures[0]?.failureReason || "官方地区价采集任务未成功完成。";
  }

  const summary = Array.isArray(result?.summary) ? result.summary : [];
  const failed = summary.find((item) => item.status !== "success" && item.status !== "skipped");
  return failed?.message || "采集任务未成功完成。";
}

function jobLabelForLog(job, sourceId) {
  if (job.job_type === "official_prices") return "official-prices";
  if (job.job_type === "api_models") return args["api-provider"] || env.PRICEAI_API_MODEL_PROVIDER || "api-models";
  if (job.job_type === "api_transit_public_pricing") return sourceId || "api-transit-public-pricing";
  return sourceId || "all";
}

function jobSourceId(job) {
  if (job.job_type === "api_transit_public_pricing") {
    const result = job && typeof job.result === "object" ? job.result : null;
    return result?.stationId || result?.station_id || null;
  }

  return job.source_id ? String(job.source_id) : null;
}

function apiCollectionRunStatus(value) {
  if (value === "failed") return "failed";
  if (value === "partial_success") return "partial";
  return "success";
}

function jobResultMode(job) {
  const result = job && typeof job.result === "object" ? job.result : null;
  return result?.officialMode || result?.official_mode || null;
}

function jobMode(value) {
  if (value === "fx_only" || value === "fx-only") return "fx_only";
  if (value === "weekly_full" || value === "weekly-full" || value === "full") return "weekly_full";
  return null;
}

function firstProbeError(snapshot) {
  const probes = Array.isArray(snapshot?.probes) ? snapshot.probes : [];
  const failed = probes.find((probe) => probe?.status === "failed");
  return failed?.errorMessage ? String(failed.errorMessage) : "API 模型来源探测失败。";
}

function stableWorkerId(...parts) {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 24);
}

function getSupabaseClient() {
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

function clampInteger(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}

function readEnvFile(path) {
  const output = {};
  if (!existsSync(path)) return output;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
