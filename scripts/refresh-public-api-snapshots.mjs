#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "https://priceai.cc";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_DIRTY_ALERT_MS = 15 * 60 * 1000;
const DEFAULT_LAST_REFRESH_ALERT_MS = 20 * 60 * 1000;

const env = loadEnvFiles([".env.local", ".env"]);
const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(
  options.baseUrl ||
    envValue("PRICEAI_BASE_URL") ||
    envValue("PRICEAI_PUBLIC_BASE_URL") ||
    envValue("COLLECT_PRICES_URL") ||
    DEFAULT_BASE_URL,
);
const cronSecret = envValue("CRON_SECRET");

if (!cronSecret) {
  await notifyAlert({
    title: "PriceAI 公开快照刷新缺少 CRON_SECRET",
    message: "服务器刷新脚本无法调用受保护刷新端点。",
    severity: "critical",
  });
  console.error("Missing CRON_SECRET.");
  process.exit(1);
}

const refreshUrl = new URL("/api/admin/public-api-snapshots", baseUrl);
if (options.force) refreshUrl.searchParams.set("force", "1");

try {
  const payload = await postRefresh(refreshUrl);
  const issues = collectHealthIssues(payload);

  const summary = {
    refreshed: payload.refreshed,
    skipped: payload.skipped,
    reason: payload.reason,
    retryAfter: payload.retryAfter || null,
    mode: payload.result?.mode || null,
    explorer: payload.result?.explorer ?? null,
    offers: payload.result?.offers ?? null,
    merchants: payload.result?.merchants ?? null,
    productIds: payload.result?.productIds?.length || 0,
    productOffers: payload.result?.productOffers?.length || 0,
    dirty: payload.state?.dirty ?? null,
    dirtyAt: payload.state?.dirtyAt || null,
    lastRefreshCompletedAt: payload.state?.lastRefreshCompletedAt || null,
  };

  console.log(JSON.stringify(summary));

  if (issues.length) {
    await notifyAlert({
      title: "PriceAI 公开快照刷新存在积压",
      message: issues.join("；"),
      severity: "warning",
      details: summary,
    });
    if (options.strict) process.exit(2);
  }
} catch (error) {
  await notifyAlert({
    title: "PriceAI 公开快照刷新失败",
    message: errorMessage(error),
    severity: "critical",
    details: {
      baseUrl,
      force: options.force,
    },
  });
  console.error(errorMessage(error));
  process.exit(1);
}

async function postRefresh(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
    },
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || text || `HTTP ${response.status}`);
  }

  return payload || {};
}

function collectHealthIssues(payload) {
  const state = payload.state || {};
  const issues = [];
  const now = Date.now();
  const dirtyAt = timestampMs(state.dirtyAt);
  const lastRefreshCompletedAt = timestampMs(state.lastRefreshCompletedAt);

  if (state.dirty === true && dirtyAt > 0 && now - dirtyAt > options.dirtyAlertMs) {
    issues.push(`dirty 已积压 ${formatDuration(now - dirtyAt)}`);
  }

  if (state.dirty === true && lastRefreshCompletedAt > 0 && now - lastRefreshCompletedAt > options.lastRefreshAlertMs) {
    issues.push(`距离上次完成刷新已 ${formatDuration(now - lastRefreshCompletedAt)}`);
  }

  if (payload.refreshed === true && payload.result) {
    const expectedGlobal = payload.result.mode === "full" || payload.result.explorer !== undefined;
    if (expectedGlobal && (payload.result.explorer === false || payload.result.offers === false)) {
      issues.push("全局快照写入未完全成功");
    }
  }

  return issues;
}

async function notifyAlert({ title, message, severity, details = {} }) {
  const webhookUrl = envValue("PRICEAI_ALERT_WEBHOOK_URL") || envValue("ALERT_WEBHOOK_URL");
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: "PriceAI",
        event: "public-api-snapshot-refresh",
        title,
        message,
        severity,
        timestamp: new Date().toISOString(),
        details,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("Alert webhook failed:", errorMessage(error));
  }
}

function normalizeBaseUrl(raw) {
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname
    .replace(/\/api\/cron\/(?:collect-prices|api-transit-probe)\/?$/, "")
    .replace(/\/api\/admin\/public-api-snapshots\/?$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function parseArgs(args) {
  const parsed = {
    baseUrl: "",
    dirtyAlertMs: Number(envValue("PRICEAI_PUBLIC_SNAPSHOT_DIRTY_ALERT_MS") || DEFAULT_DIRTY_ALERT_MS),
    force: false,
    lastRefreshAlertMs: Number(envValue("PRICEAI_PUBLIC_SNAPSHOT_LAST_REFRESH_ALERT_MS") || DEFAULT_LAST_REFRESH_ALERT_MS),
    strict: false,
    timeoutMs: Number(envValue("PRICEAI_PUBLIC_SNAPSHOT_REFRESH_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS),
  };

  for (const arg of args) {
    if (arg === "--force") parsed.force = true;
    else if (arg === "--strict") parsed.strict = true;
    else if (arg.startsWith("--base-url=")) parsed.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--dirty-alert-minutes=")) {
      parsed.dirtyAlertMs = boundedMinutes(arg.slice("--dirty-alert-minutes=".length), DEFAULT_DIRTY_ALERT_MS);
    } else if (arg.startsWith("--last-refresh-alert-minutes=")) {
      parsed.lastRefreshAlertMs = boundedMinutes(arg.slice("--last-refresh-alert-minutes=".length), DEFAULT_LAST_REFRESH_ALERT_MS);
    } else if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = boundedNumber(arg.slice("--timeout-ms=".length), 5_000, 180_000, DEFAULT_TIMEOUT_MS);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  parsed.dirtyAlertMs = boundedNumber(parsed.dirtyAlertMs, 60_000, 24 * 60 * 60 * 1000, DEFAULT_DIRTY_ALERT_MS);
  parsed.lastRefreshAlertMs = boundedNumber(parsed.lastRefreshAlertMs, 60_000, 24 * 60 * 60 * 1000, DEFAULT_LAST_REFRESH_ALERT_MS);
  parsed.timeoutMs = boundedNumber(parsed.timeoutMs, 5_000, 180_000, DEFAULT_TIMEOUT_MS);
  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/refresh-public-api-snapshots.mjs
  node scripts/refresh-public-api-snapshots.mjs --force

Environment:
  CRON_SECRET                               Required endpoint secret
  PRICEAI_BASE_URL                         Optional, defaults to https://priceai.cc
  PRICEAI_ALERT_WEBHOOK_URL                Optional alert webhook
  PRICEAI_PUBLIC_SNAPSHOT_DIRTY_ALERT_MS   Optional dirty backlog alert threshold
`);
}

function boundedMinutes(value, fallbackMs) {
  return boundedNumber(Number(value) * 60 * 1000, 60_000, 24 * 60 * 60 * 1000, fallbackMs);
}

function boundedNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function timestampMs(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${(minutes / 60).toFixed(1)} 小时`;
}

function envValue(name) {
  const processValue = process.env[name];
  if (typeof processValue === "string" && processValue.length > 0) return processValue;
  const fileValue = env[name];
  return typeof fileValue === "string" && fileValue.length > 0 ? fileValue : "";
}

function loadEnvFiles(files) {
  const values = {};
  for (const file of files) {
    if (!existsSync(file)) continue;
    Object.assign(values, parseEnvFile(readFileSync(file, "utf8")));
  }
  return values;
}

function parseEnvFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}
