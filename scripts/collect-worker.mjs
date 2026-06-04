#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runPriceCollection } from "./collect-prices.mjs";

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
  process.env.ADMIN_PASSWORD ||
  env.ADMIN_PASSWORD ||
  "ai-price-hub-local";
const maxJobs = clampInteger(args.maxJobs || args["max-jobs"] || 1, 1, 20);
const lockSeconds = clampInteger(args.lockSeconds || args["lock-seconds"] || 1800, 60, 7200);

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
  const sourceId = job.source_id ? String(job.source_id) : null;
  const jobLabel = sourceId || "all";
  console.log(`Running collection job ${job.id} (${job.job_type}:${jobLabel})`);

  try {
    const result = await runPriceCollection({
      all: job.job_type === "all",
      source: sourceId || undefined,
      post: true,
      endpoint,
      password,
      silent: Boolean(args.silent),
      force: true,
      "collector-node-id": workerId,
      "collector-node-name": args["worker-name"] || env.PRICEAI_COLLECTOR_NODE_NAME || "国内 VPS Worker",
      "collector-node-type": args["worker-type"] || env.PRICEAI_COLLECTOR_NODE_TYPE || "vps",
      "collector-node-runtime": args["worker-runtime"] || env.PRICEAI_COLLECTOR_NODE_RUNTIME || "worker",
      "collector-node-region": args["worker-region"] || env.PRICEAI_COLLECTOR_NODE_REGION || null,
    });
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
  const summary = Array.isArray(result?.summary) ? result.summary : [];
  if (job.job_type === "source") {
    return summary[0]?.status === "success" ? "success" : "failed";
  }
  return Number(result?.successCount || 0) > 0 ? "success" : "failed";
}

function firstFailureMessage(result) {
  const summary = Array.isArray(result?.summary) ? result.summary : [];
  const failed = summary.find((item) => item.status !== "success" && item.status !== "skipped");
  return failed?.message || "采集任务未成功完成。";
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
