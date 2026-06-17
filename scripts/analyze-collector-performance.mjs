#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readEnvFile(".env.local");
const args = parseArgs(process.argv.slice(2));
const hours = boundedNumber(args.hours || args.h || 24, 1, 24 * 14, 24);
const limit = boundedNumber(args.limit || 1000, 50, 10000, 1000);
const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const supabase = getSupabaseClient();
if (!supabase) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const { data: crawlRuns, error: crawlError } = await supabase
  .from("crawl_runs")
  .select("id,source_id,source_name,mode,status,started_at,finished_at,success_count,failure_count,message,details")
  .gte("started_at", since)
  .order("started_at", { ascending: false })
  .limit(limit);

if (crawlError) {
  console.error(crawlError.message || String(crawlError));
  process.exit(1);
}

const { data: jobs, error: jobsError } = await supabase
  .from("collection_jobs")
  .select("id,job_type,source_id,status,created_at,started_at,finished_at,last_error,result")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(200);

if (jobsError) {
  console.error(jobsError.message || String(jobsError));
  process.exit(1);
}

const report = buildReport(crawlRuns || [], jobs || [], { hours, since });
printReport(report);

function buildReport(crawlRuns, jobs, meta) {
  const rows = crawlRuns.map(crawlRunToRow);
  const rowsWithDuration = rows.filter((row) => Number.isFinite(row.ms));
  const byCollector = aggregate(rows, (row) => row.collector);
  const byNode = aggregate(rows, (row) => row.nodeId);
  const byStatus = aggregate(rows, (row) => row.status);
  const slowest = [...rowsWithDuration]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 20);
  const failures = rows
    .filter((row) => row.status !== "success")
    .slice(0, 20);
  const failureRows = rows.filter((row) => row.status !== "success");
  const failureGroups = aggregateFailures(failureRows);
  const problemSources = aggregateProblemSources(failureRows).slice(0, 20);
  const jobPerformance = jobs
    .filter((job) => job.result?.performance)
    .map((job) => ({
      id: job.id,
      type: job.job_type,
      status: job.status,
      sourceId: job.source_id || "all",
      finishedAt: job.finished_at,
      durationMs: Number(job.result.performance.durationMs || 0),
      targets: Number(job.result.performance.targetCount || 0),
      concurrency: Number(job.result.performance.concurrency || 0),
      offers: Number(job.result.performance.offers || 0),
    }))
    .slice(0, 20);

  return {
    meta,
    summary: {
      crawlRuns: rows.length,
      success: rows.filter((row) => row.status === "success").length,
      failed: rows.filter((row) => row.status !== "success").length,
      offers: rows.reduce((sum, row) => sum + row.offers, 0),
      written: rows.reduce((sum, row) => sum + row.written, 0),
      unchanged: rows.reduce((sum, row) => sum + row.unchanged, 0),
      avgMs: average(rowsWithDuration.map((row) => row.ms)),
      p95Ms: percentile(rowsWithDuration.map((row) => row.ms), 0.95),
      maxMs: Math.max(0, ...rowsWithDuration.map((row) => row.ms)),
    },
    byCollector,
    byNode,
    byStatus,
    slowest,
    failures,
    failureGroups,
    problemSources,
    jobPerformance,
  };
}

function crawlRunToRow(row) {
  const details = row.details || {};
  const attempts = Array.isArray(details.attempts) ? details.attempts : [];
  const writeStats = details.writeStats || {};
  const started = row.started_at ? new Date(row.started_at).getTime() : NaN;
  const finished = row.finished_at ? new Date(row.finished_at).getTime() : NaN;
  const durationMs = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : null;
  const attemptMs = attempts.reduce((sum, attempt) => sum + Number(attempt.ms || 0), 0);

  return {
    id: row.id,
    sourceId: row.source_id || "",
    source: row.source_name || "",
    collector: String(details.collector || row.mode || "unknown"),
    nodeId: String(details.collectorNode?.id || "unknown-node"),
    status: row.status || "unknown",
    offers: Number(row.success_count || 0),
    written: Number(writeStats.writtenCount || 0),
    unchanged: Number(writeStats.unchangedCount || 0),
    attempts: attempts.length,
    ms: durationMs ?? attemptMs,
    attemptMs,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    message: row.message || "",
  };
}

function aggregate(rows, keyForRow) {
  const map = new Map();

  for (const row of rows) {
    const key = String(keyForRow(row) || "unknown");
    const entry = map.get(key) || {
      key,
      runs: 0,
      success: 0,
      failed: 0,
      offers: 0,
      written: 0,
      unchanged: 0,
      totalMs: 0,
      maxMs: 0,
    };

    entry.runs += 1;
    if (row.status === "success") entry.success += 1;
    else entry.failed += 1;
    entry.offers += row.offers;
    entry.written += row.written;
    entry.unchanged += row.unchanged;
    entry.totalMs += Number(row.ms || 0);
    entry.maxMs = Math.max(entry.maxMs, Number(row.ms || 0));
    map.set(key, entry);
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      avgMs: entry.runs ? Math.round(entry.totalMs / entry.runs) : 0,
      successRate: entry.runs ? Number((entry.success / entry.runs).toFixed(3)) : 0,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function printReport(report) {
  console.log(`Collector performance: last ${report.meta.hours}h since ${report.meta.since}`);
  console.log("\nSummary");
  console.table([report.summary]);

  console.log("\nBy collector");
  console.table(report.byCollector.slice(0, 20));

  console.log("\nBy node");
  console.table(report.byNode.slice(0, 20));

  console.log("\nBy status");
  console.table(report.byStatus);

  console.log("\nSlowest runs");
  console.table(report.slowest.map(compactRunRow));

  if (report.failures.length) {
    console.log("\nFailure groups");
    console.table(report.failureGroups);

    console.log("\nProblem sources");
    console.table(report.problemSources);

    console.log("\nRecent failures");
    console.table(report.failures.map(compactRunRow));
  }

  if (report.jobPerformance.length) {
    console.log("\nCollection job performance");
    console.table(report.jobPerformance);
  }
}

function compactRunRow(row) {
  return {
    sourceId: row.sourceId,
    source: row.source.slice(0, 42),
    collector: row.collector,
    nodeId: row.nodeId,
    status: row.status,
    offers: row.offers,
    written: row.written,
    attempts: row.attempts,
    ms: row.ms,
    startedAt: row.startedAt,
    message: row.message.slice(0, 80),
  };
}

function aggregateFailures(rows) {
  const map = new Map();

  for (const row of rows) {
    const category = classifyFailure(row);
    const key = `${row.collector}:${category.key}`;
    const entry = map.get(key) || {
      collector: row.collector,
      category: category.key,
      label: category.label,
      count: 0,
      sources: new Set(),
      latestAt: "",
      action: category.action,
    };

    entry.count += 1;
    if (row.sourceId) entry.sources.add(row.sourceId);
    if (!entry.latestAt || String(row.startedAt || "") > entry.latestAt) entry.latestAt = row.startedAt || "";
    map.set(key, entry);
  }

  return [...map.values()]
    .map((entry) => ({
      collector: entry.collector,
      category: entry.category,
      label: entry.label,
      count: entry.count,
      sourceCount: entry.sources.size,
      latestAt: entry.latestAt,
      action: entry.action,
    }))
    .sort((a, b) => b.count - a.count);
}

function aggregateProblemSources(rows) {
  const map = new Map();

  for (const row of rows) {
    const key = row.sourceId || row.source || "unknown";
    const category = classifyFailure(row);
    const entry = map.get(key) || {
      sourceId: row.sourceId,
      source: row.source,
      collector: row.collector,
      count: 0,
      categories: new Map(),
      latestAt: "",
      latestMessage: "",
    };

    entry.count += 1;
    entry.categories.set(category.key, (entry.categories.get(category.key) || 0) + 1);
    if (!entry.latestAt || String(row.startedAt || "") > entry.latestAt) {
      entry.latestAt = row.startedAt || "";
      entry.latestMessage = row.message || "";
    }
    map.set(key, entry);
  }

  return [...map.values()]
    .map((entry) => ({
      sourceId: entry.sourceId,
      source: entry.source.slice(0, 42),
      collector: entry.collector,
      failures: entry.count,
      categories: [...entry.categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => `${key}:${count}`)
        .join(", "),
      latestAt: entry.latestAt,
      latestMessage: entry.latestMessage.slice(0, 80),
    }))
    .sort((a, b) => b.failures - a.failures);
}

function classifyFailure(row) {
  const text = `${row.status || ""} ${row.message || ""}`.toLowerCase();

  if (text.includes("分批写入")) {
    return {
      key: "partial-batch",
      label: "分批写入产生的 partial",
      action: "检查分页/分批上限，通常不是解析器失败；优先确认是否所有批次都写入。",
    };
  }

  if (text.includes("记录采集结果失败") || text.includes("upload failed after") || text.includes("crawl-log upload failed")) {
    return {
      key: "writeback",
      label: "采集结果写回失败",
      action: "不要判定源站异常；检查 crawl-log 写入耗时、批量大小、后台接口和节点到后台网络。",
    };
  }

  if (text.includes("no shop token")) {
    return {
      key: "missing-shop-token",
      label: "缺少店铺 token",
      action: "补正确店铺入口，或从商品链接反查 /shop/<token> 后再采集。",
    };
  }

  if (text.includes("风控") || text.includes("验证") || text.includes("challenge") || text.includes("captcha") || text.includes("waf")) {
    return {
      key: "waf-or-challenge",
      label: "验证页或风控页",
      action: "不要判缺货；降低频率、换合适节点，或进入待开发采集器/本机浏览器兜底。",
    };
  }

  if (text.includes("采集结果为空") || text.includes("empty")) {
    return {
      key: "empty-result",
      label: "采集结果为空",
      action: "检查入口是否下架、页面结构是否变化，必要时重新试探采集器。",
    };
  }

  if (text.includes("fetch failed") || text.includes("timeout") || text.includes("econnreset") || text.includes("etimedout")) {
    return {
      key: "network",
      label: "网络或节点失败",
      action: "复查采集节点连通性；国内风控站点优先放到国内节点。",
    };
  }

  if (text.includes("unsupported collector")) {
    return {
      key: "unsupported-collector",
      label: "未支持的采集器类型",
      action: "修正来源 collector_kind，或新增对应解析器。",
    };
  }

  if (/http\s*(4\d\d|5\d\d)|\b(4\d\d|5\d\d)\b/.test(text)) {
    return {
      key: "http-error",
      label: "HTTP 错误",
      action: "按状态码判断是入口失效、限流还是源站故障；连续失败后降频或停采。",
    };
  }

  return {
    key: "unknown",
    label: "未分类失败",
    action: "查看最近失败 message，补充分类规则或新增采集器修复。",
  };
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function boundedNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      output[key] = true;
    } else {
      output[key] = next;
      index += 1;
    }
  }
  return output;
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
