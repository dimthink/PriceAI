#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ENV_PATH = ".env.local";
const DEFAULT_KIND = "shopApi";
const DEFAULT_FAMILY = "ldxp";
const DEFAULT_SHARD_COUNT = 3;
const DEFAULT_HOURS = 24;
const PAGE_SIZE = 1000;
const SOURCE_CHUNK_SIZE = 80;

const FAMILY_HOSTS = {
  "liandong-shop": ["pay.ldxp.cn", "ldxp.cn"],
  ldxp: ["pay.ldxp.cn", "ldxp.cn"],
  "pay.ldxp.cn": ["pay.ldxp.cn", "ldxp.cn"],
  "ldxp.cn": ["pay.ldxp.cn", "ldxp.cn"],
  "yunmao-consignment": ["catfk.com"],
  yunmao: ["catfk.com"],
  catfk: ["catfk.com"],
  "catfk.com": ["catfk.com"],
};
const SHARD_FAMILY_ALIASES = {
  "liandong-shop": "ldxp",
  ldxp: "ldxp",
  "pay.ldxp.cn": "ldxp",
  "ldxp.cn": "ldxp",
  "yunmao-consignment": "yunmao",
  yunmao: "yunmao",
  catfk: "yunmao",
  "catfk.com": "yunmao",
};
const ALL_SHOPAPI_FAMILIES = new Set(["all", "*", "shopapi", "shop-api"]);

const args = parseArgs(process.argv.slice(2));
const kind = String(args.kind || DEFAULT_KIND);
const family = String(args.family || DEFAULT_FAMILY);
const familyKey = shardAssignmentFamily(family);
const shardCount = boundedInt(args.shardCount || args["shard-count"], 1, 32, DEFAULT_SHARD_COUNT);
const hours = boundedInt(args.hours, 1, 24 * 14, DEFAULT_HOURS);
const write = truthy(args.write);
const envPath = String(args.env || DEFAULT_ENV_PATH);
const assignedAt = new Date().toISOString();
const assignmentVersion = String(args.version || `balanced-${compactTimestamp(assignedAt)}`);

if (!familyKey) {
  console.error("Explicit shard assignment requires a concrete family, for example --family ldxp.");
  process.exit(1);
}

const env = readEnvFile(envPath);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL || "", env.SUPABASE_SERVICE_ROLE_KEY || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envPath}.`);
  process.exit(1);
}

const hostCandidates = familyHosts(family);
const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const sources = (await fetchSources())
  .filter((source) => source.collection_method !== "public_json")
  .filter((source) => sourceMatchesFamily(source, hostCandidates));

if (!sources.length) {
  console.error(`No enabled ${kind} sources found for family ${family}.`);
  process.exit(1);
}

const sourceIds = sources.map((source) => String(source.id));
const [offerCounts, runStats] = await Promise.all([
  fetchVisibleOfferCounts(sourceIds),
  fetchRunStats(sourceIds, since),
]);
const weightedSources = sources.map((source) => {
  const sourceId = String(source.id);
  const stats = runStats.get(sourceId) || emptyRunStats();
  const offerCount = offerCounts.get(sourceId) || 0;
  const weightSignals = buildWeightSignals(stats, offerCount);

  return {
    source,
    sourceId,
    sourceName: String(source.name || source.id || ""),
    weight: weightSignals.weight,
    weightSignals,
  };
});
const assignments = assignBalancedShards(weightedSources, shardCount, {
  kind,
  family: familyKey,
  assignmentVersion,
  assignedAt,
});

printPlan(assignments, { kind, family, familyKey, shardCount, hours, since, write });

if (write) {
  await writeAssignments(assignments);
  console.log(`\nWrote ${assignments.length} source shard assignment(s).`);
} else {
  console.log("\nDry run only. Re-run with --write to upsert assignments.");
}

async function fetchSources() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sources")
      .select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,last_checked_at,last_success_at")
      .eq("enabled", true)
      .eq("collector_kind", kind)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchVisibleOfferCounts(sourceIds) {
  const counts = new Map();
  for (const chunk of chunks(sourceIds, SOURCE_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("raw_offers")
        .select("source_id")
        .in("source_id", chunk)
        .eq("hidden", false)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      for (const row of data || []) {
        const sourceId = String(row.source_id || "");
        if (!sourceId) continue;
        counts.set(sourceId, (counts.get(sourceId) || 0) + 1);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  return counts;
}

async function fetchRunStats(sourceIds, sinceIso) {
  const statsBySource = new Map();
  for (const chunk of chunks(sourceIds, SOURCE_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("crawl_runs")
        .select("source_id,status,started_at,finished_at,success_count,failure_count,details")
        .in("source_id", chunk)
        .gte("started_at", sinceIso)
        .order("started_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      for (const row of data || []) {
        const sourceId = String(row.source_id || "");
        if (!sourceId) continue;
        const entry = statsBySource.get(sourceId) || emptyRunStats();
        const durationMs = crawlRunDurationMs(row);
        if (Number.isFinite(durationMs)) entry.durationsMs.push(durationMs);
        entry.runs += 1;
        if (row.status === "success") entry.success += 1;
        else entry.failed += 1;
        entry.maxOffers = Math.max(entry.maxOffers, Number(row.success_count || 0));
        statsBySource.set(sourceId, entry);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  return statsBySource;
}

function assignBalancedShards(rows, count, meta) {
  const targetCounts = targetShardCounts(rows.length, count);
  const shards = Array.from({ length: count }, (_, shardIndex) => ({
    shardIndex,
    targetCount: targetCounts[shardIndex],
    count: 0,
    totalWeight: 0,
  }));
  const sorted = [...rows].sort(compareWeightedSources);

  return sorted.map((row) => {
    const shard = [...shards]
      .filter((candidate) => candidate.count < candidate.targetCount)
      .sort((left, right) => {
        const byWeight = left.totalWeight - right.totalWeight;
        if (Math.abs(byWeight) > 0.0001) return byWeight;
        const byCount = left.count - right.count;
        if (byCount) return byCount;
        return left.shardIndex - right.shardIndex;
      })[0] || shards[0];

    shard.count += 1;
    shard.totalWeight += row.weight;

    return {
      source_id: row.sourceId,
      collector_kind: meta.kind,
      family: meta.family,
      shard_count: count,
      shard_index: shard.shardIndex,
      weight: row.weight,
      weight_signals: row.weightSignals,
      assignment_version: meta.assignmentVersion,
      active: true,
      assigned_at: meta.assignedAt,
      sourceName: row.sourceName,
    };
  }).sort((left, right) => left.shard_index - right.shard_index || left.source_id.localeCompare(right.source_id));
}

async function writeAssignments(assignments) {
  for (const chunk of chunks(assignments.map(dbAssignmentRow), 100)) {
    const { error } = await supabase
      .from("source_shard_assignments")
      .upsert(chunk, { onConflict: "source_id,collector_kind,family,shard_count" });
    if (error) throw error;
  }

  const { data: existing, error } = await supabase
    .from("source_shard_assignments")
    .select("source_id")
    .eq("collector_kind", kind)
    .eq("family", familyKey)
    .eq("shard_count", shardCount)
    .eq("active", true);
  if (error) throw error;

  const activeSourceIds = new Set(assignments.map((assignment) => assignment.source_id));
  const staleSourceIds = (existing || [])
    .map((row) => String(row.source_id || ""))
    .filter((sourceId) => sourceId && !activeSourceIds.has(sourceId));

  for (const chunk of chunks(staleSourceIds, 100)) {
    const { error: updateError } = await supabase
      .from("source_shard_assignments")
      .update({
        active: false,
        assignment_version: `${assignmentVersion}:inactive`,
        assigned_at: assignedAt,
      })
      .eq("collector_kind", kind)
      .eq("family", familyKey)
      .eq("shard_count", shardCount)
      .in("source_id", chunk);
    if (updateError) throw updateError;
  }
}

function buildWeightSignals(stats, offerCount) {
  const p75DurationMs = percentile(stats.durationsMs, 0.75);
  const avgDurationMs = average(stats.durationsMs);
  const durationUnits = Math.min(6, p75DurationMs / 30_000);
  const offerUnits = Math.min(6, Math.sqrt(offerCount) / 4);
  const recentOfferUnits = Math.min(4, stats.maxOffers / 80);
  const failureUnits = stats.runs ? Math.min(2, stats.failed / stats.runs) : 0;
  const weight = roundWeight(1 + durationUnits + offerUnits + recentOfferUnits + failureUnits);

  return {
    weight,
    offerCount,
    recentRunCount: stats.runs,
    recentSuccessCount: stats.success,
    recentFailedCount: stats.failed,
    maxOffersInRun: stats.maxOffers,
    avgDurationMs: Math.round(avgDurationMs),
    p75DurationMs: Math.round(p75DurationMs),
  };
}

function printPlan(assignments, meta) {
  console.log(`Source shard plan: kind=${meta.kind} family=${meta.family} assignmentFamily=${meta.familyKey} shards=${meta.shardCount}`);
  console.log(`Recent run window: ${meta.hours}h since ${meta.since}`);
  console.log(meta.write ? "Mode: write" : "Mode: dry-run");
  console.log("\nShard summary");
  console.table(Array.from({ length: meta.shardCount }, (_, shardIndex) => {
    const rows = assignments.filter((assignment) => assignment.shard_index === shardIndex);
    const topSources = [...rows]
      .sort((left, right) => Number(right.weight) - Number(left.weight))
      .slice(0, 5)
      .map((assignment) => `${assignment.sourceName.slice(0, 18)}(${Number(assignment.weight).toFixed(2)})`)
      .join(", ");

    return {
      shard: shardIndex,
      sources: rows.length,
      weight: Number(rows.reduce((sum, row) => sum + Number(row.weight || 0), 0).toFixed(3)),
      topSources,
    };
  }));
}

function dbAssignmentRow(row) {
  return {
    source_id: row.source_id,
    collector_kind: row.collector_kind,
    family: row.family,
    shard_count: row.shard_count,
    shard_index: row.shard_index,
    weight: row.weight,
    weight_signals: row.weight_signals,
    assignment_version: row.assignment_version,
    active: row.active,
    assigned_at: row.assigned_at,
  };
}

function compareWeightedSources(left, right) {
  const byWeight = right.weight - left.weight;
  if (Math.abs(byWeight) > 0.0001) return byWeight;
  const byOffers = Number(right.weightSignals.offerCount || 0) - Number(left.weightSignals.offerCount || 0);
  if (byOffers) return byOffers;
  const byDuration = Number(right.weightSignals.p75DurationMs || 0) - Number(left.weightSignals.p75DurationMs || 0);
  if (byDuration) return byDuration;
  return left.sourceId.localeCompare(right.sourceId);
}

function targetShardCounts(total, count) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function emptyRunStats() {
  return { runs: 0, success: 0, failed: 0, maxOffers: 0, durationsMs: [] };
}

function crawlRunDurationMs(row) {
  const started = row.started_at ? new Date(row.started_at).getTime() : NaN;
  const finished = row.finished_at ? new Date(row.finished_at).getTime() : NaN;
  if (Number.isFinite(started) && Number.isFinite(finished)) return Math.max(0, finished - started);

  const attempts = Array.isArray(row.details?.attempts) ? row.details.attempts : [];
  const attemptMs = attempts.reduce((sum, attempt) => sum + Number(attempt?.ms || 0), 0);
  return attemptMs || NaN;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function familyHosts(value) {
  const normalized = value.trim().toLowerCase();
  if (ALL_SHOPAPI_FAMILIES.has(normalized)) return null;
  if (FAMILY_HOSTS[normalized]) return FAMILY_HOSTS[normalized];

  return normalized
    .split(",")
    .map((item) => normalizeHostname(item))
    .filter(Boolean);
}

function shardAssignmentFamily(value) {
  const normalized = value.trim().toLowerCase();
  if (ALL_SHOPAPI_FAMILIES.has(normalized)) return null;
  if (SHARD_FAMILY_ALIASES[normalized]) return SHARD_FAMILY_ALIASES[normalized];
  return normalizeHostname(normalized);
}

function sourceMatchesFamily(source, hostCandidates) {
  if (!hostCandidates) return true;
  const sourceUrl = String(source.entry_url || source.base_url || "");
  const baseUrl = String(source.base_url || deriveBaseUrl(sourceUrl) || "");
  return hostCandidates.includes(normalizeHostname(baseUrl || sourceUrl));
}

function deriveBaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function normalizeHostname(value) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const keyValue = arg.slice(2);
    const [rawKey, inlineValue] = keyValue.split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      output[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      output[key] = argv[index + 1];
      index += 1;
    } else {
      output[key] = "1";
    }
  }
  return output;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const output = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
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

function boundedInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function roundWeight(value) {
  return Math.round(value * 1000) / 1000;
}

function compactTimestamp(iso) {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}
