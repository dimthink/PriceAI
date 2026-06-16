#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const SAMPLE_LIMIT = numberArg("--limit", 20);
const PAGE_SIZE = 1000;
const UPDATE_CONCURRENCY = 10;
const HIDE_REASON = "管理员手动下架：同一源站商品重复采集，已保留最新可信报价。";

loadEnv(".env.local");

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const rows = await listVisibleOfferRows();
const candidates = duplicateCandidates(rows);
const groups = candidates.groups;
const duplicateRows = candidates.duplicates;
const now = new Date().toISOString();

const report = {
  mode: APPLY ? "apply" : "dry-run",
  scannedVisibleRows: rows.length,
  duplicateGroups: groups.length,
  duplicateRows: duplicateRows.length,
  byProduct: summarizeByProduct(groups),
  samples: groups.slice(0, SAMPLE_LIMIT).map(toGroupSample),
};

console.log(JSON.stringify(report, null, 2));

if (!APPLY || !duplicateRows.length) process.exit(0);

const results = await mapWithConcurrency(duplicateRows, UPDATE_CONCURRENCY, async ({ duplicate, keeper }) => {
  const { count, error } = await supabase
    .from("raw_offers")
    .update({
      hidden: true,
      effective_status: "unavailable",
      freshness_status: "fresh",
      last_failed_at: now,
      failure_reason: HIDE_REASON,
      updated_at: now,
    }, { count: "exact" })
    .eq("id", duplicate.id)
    .eq("hidden", false);
  if (error) throw error;

  const { count: feedbackCount, error: feedbackError } = await supabase
    .from("offer_feedback")
    .update({
      offer_id: keeper.id,
      source_id: keeper.source_id,
      source_name: keeper.source_name,
      source_title: keeper.source_title,
      offer_url: keeper.url,
      offer_price: keeper.price,
      offer_currency: keeper.currency,
      offer_status: keeper.status,
      offer_captured_at: keeper.captured_at,
      offer_source_updated_at: keeper.source_updated_at,
      offer_last_seen_at: keeper.last_seen_at,
    }, { count: "exact" })
    .eq("offer_id", duplicate.id);
  if (feedbackError) throw feedbackError;

  return {
    hidden: count || 0,
    feedbackMoved: feedbackCount || 0,
  };
});

console.log(JSON.stringify({
  hiddenRows: results.reduce((sum, item) => sum + item.hidden, 0),
  feedbackMoved: results.reduce((sum, item) => sum + item.feedbackMoved, 0),
}, null, 2));

async function listVisibleOfferRows() {
  const rows = [];
  const select = [
    "id",
    "source_id",
    "source_name",
    "source_store_name",
    "source_title",
    "price",
    "currency",
    "status",
    "url",
    "tags",
    "hidden",
    "canonical_product_id",
    "category_slug",
    "captured_at",
    "source_updated_at",
    "last_seen_at",
    "verified_at",
    "expires_at",
    "source_priority",
    "confidence",
    "effective_status",
    "freshness_status",
  ].join(",");

  let lastId = "";

  for (;;) {
    let query = supabase
      .from("raw_offers")
      .select(select)
      .eq("hidden", false)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (lastId) query = query.gt("id", lastId);

    const { data, error } = await query;

    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;

    lastId = String(batch[batch.length - 1].id || "");
    if (!lastId) break;
  }

  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function duplicateCandidates(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = offerDedupeKey(row);
    const items = grouped.get(key) || [];
    items.push(row);
    grouped.set(key, items);
  }

  const groups = [];
  const duplicates = [];
  for (const [key, items] of grouped) {
    if (items.length < 2) continue;
    const sorted = items.slice().sort(compareOfferKeepPriority);
    const keeper = sorted[0];
    const duplicateItems = sorted.slice(1);
    groups.push({ key, keeper, duplicates: duplicateItems, rows: sorted });
    for (const duplicate of duplicateItems) duplicates.push({ keeper, duplicate });
  }

  groups.sort((a, b) => b.rows.length - a.rows.length || String(a.key).localeCompare(String(b.key)));
  return { groups, duplicates };
}

function compareOfferKeepPriority(a, b) {
  const availabilityDelta = Number(isPublicAvailable(b)) - Number(isPublicAvailable(a));
  if (availabilityDelta !== 0) return availabilityDelta;

  const priorityDelta = Number(b.source_priority || 0) - Number(a.source_priority || 0);
  if (priorityDelta !== 0) return priorityDelta;

  const confidenceDelta = Number(b.confidence || 0) - Number(a.confidence || 0);
  if (confidenceDelta !== 0) return confidenceDelta;

  const timeDelta = timestampMs(b) - timestampMs(a);
  if (timeDelta !== 0) return timeDelta;

  return String(a.id).localeCompare(String(b.id));
}

function isPublicAvailable(row) {
  if (row.status === "out_of_stock") return false;
  if (row.price === null || row.price === undefined || !Number.isFinite(Number(row.price))) return false;
  if (!row.url) return false;
  if (["unavailable", "stale", "failed"].includes(String(row.effective_status || ""))) return false;
  if (["expired", "failed"].includes(String(row.freshness_status || ""))) return false;
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return false;
  }
  return true;
}

function timestampMs(row) {
  for (const key of ["verified_at", "last_seen_at", "captured_at", "source_updated_at"]) {
    const timestamp = new Date(row[key] || "").getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function offerDedupeKey(row) {
  return [
    row.canonical_product_id || "",
    normalizeOfferUrlForDedupe(row.url),
    normalizeDedupeText(row.source_title),
    normalizeDedupePrice(row.price),
  ].join("|");
}

function normalizeOfferUrlForDedupe(value) {
  const shopItemUrl = normalizeShopApiItemOfferUrl(value);
  if (shopItemUrl) return shopItemUrl;

  try {
    const parsed = new URL(value);
    parsed.hostname = normalizeHostname(parsed.hostname);
    if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "");
  }
}

function normalizeShopApiItemOfferUrl(value) {
  try {
    const parsed = new URL(value);
    const host = normalizeHostname(parsed.hostname);
    if (!["catfk.com", "ldxp.cn", "pay.ldxp.cn", "pay.qxvx.cn"].includes(host)) return null;

    const pathGoodsKey = parsed.pathname.match(/^\/item\/([^/?#]+)/i)?.[1] || null;
    const goodsKey = pathGoodsKey || parsed.searchParams.get("commodity") || parsed.searchParams.get("id");
    if (!goodsKey) return null;

    return `https://${host}/item/${encodeURIComponent(decodeURIComponent(goodsKey))}`;
  } catch {
    return null;
  }
}

function normalizeDedupeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function normalizeDedupePrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

function normalizeHostname(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "");
}

function summarizeByProduct(groups) {
  const summary = new Map();
  for (const group of groups) {
    const productId = group.keeper.canonical_product_id || "(none)";
    const current = summary.get(productId) || { productId, groups: 0, duplicateRows: 0 };
    current.groups += 1;
    current.duplicateRows += group.duplicates.length;
    summary.set(productId, current);
  }
  return Array.from(summary.values())
    .sort((a, b) => b.duplicateRows - a.duplicateRows)
    .slice(0, 30);
}

function toGroupSample(group) {
  return {
    productId: group.keeper.canonical_product_id,
    duplicateCount: group.duplicates.length,
    keeper: toRowSample(group.keeper),
    duplicates: group.duplicates.slice(0, 8).map(toRowSample),
  };
}

function toRowSample(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    store: row.source_store_name || row.source_name,
    title: row.source_title,
    price: row.price,
    url: row.url,
    verifiedAt: row.verified_at,
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    process.env[match[1]] = unquote(match[2].trim());
  }
}

function unquote(value) {
  const quote = value[0];
  return (quote === `"` || quote === `'`) && value[value.length - 1] === quote
    ? value.slice(1, -1)
    : value;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function numberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number.parseInt(process.argv[index + 1] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
