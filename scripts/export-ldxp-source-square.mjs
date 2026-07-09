#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const env = readEnvFile(path.join(repoRoot, ".env.local"));

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const merchantToken =
  args.merchantToken ||
  args["merchant-token"] ||
  process.env.LDXP_MERCHANT_TOKEN ||
  env.LDXP_MERCHANT_TOKEN;

if (!merchantToken) {
  console.error("Missing LDXP_MERCHANT_TOKEN or --merchant-token.");
  console.error("This script only lists source-square shop links; it does not collect products or write sources.");
  process.exit(1);
}

const baseUrl = String(args.baseUrl || args["base-url"] || "https://pay.ldxp.cn").replace(/\/$/, "");
const tagsId = integerOption(args.tagsId || args["tags-id"], 0, 0, 10_000);
const pageSize = integerOption(args.pageSize || args["page-size"], 20, 1, 100);
const limitPages = integerOption(args.limitPages || args["limit-pages"], 0, 0, 10_000);
const delayMs = integerOption(args.delayMs || args["delay-ms"], 500, 0, 60_000);
const includeSupabase = !truthy(args.noSupabase || args["no-supabase"]);
const now = new Date();
const dateSlug = now.toISOString().slice(0, 10);
const outPath = path.resolve(
  repoRoot,
  args.out || `docs/planning/archive/pending/data-collection/${dateSlug}_ldxp-source-square-links.md`,
);
const jsonOutPath = path.resolve(
  repoRoot,
  args.jsonOut || args["json-out"] || outPath.replace(/\.md$/i, ".json"),
);
const defaultExistingPath = path.join(
  repoRoot,
  "docs/planning/archive/done/data-collection/2026-06-06_ldxp-sqlite-channel-candidates.json",
);
const existingPaths = optionList(args.existing || args["existing-list"]);
if (!existingPaths.length && existsSync(defaultExistingPath)) {
  existingPaths.push(defaultExistingPath);
}

const rows = await fetchSourceSquareRows({
  baseUrl,
  merchantToken,
  tagsId,
  pageSize,
  limitPages,
  delayMs,
});
const existing = await loadExistingLists({ includeSupabase, existingPaths });
const compared = compareRows(rows, existing);
const report = buildReport({ baseUrl, tagsId, pageSize, limitPages, delayMs, rows: compared, existing, existingPaths });

mkdirSync(path.dirname(outPath), { recursive: true });
mkdirSync(path.dirname(jsonOutPath), { recursive: true });
writeFileSync(outPath, renderMarkdown(report), "utf8");
writeFileSync(jsonOutPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
console.log(`Wrote ${path.relative(repoRoot, jsonOutPath)}`);
console.log(JSON.stringify(report.summary, null, 2));

async function fetchSourceSquareRows(config) {
  const first = await postMerchantApi(config, "/merchantApi/GoodsPool/list", {
    current: 1,
    pageSize: config.pageSize,
    tags_id: config.tagsId,
  });
  const total = Number(first.data?.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / config.pageSize));
  const finalPage = config.limitPages ? Math.min(pageCount, config.limitPages) : pageCount;
  const rows = normalizeSourceSquareList(first.data?.list, 1, config.baseUrl);

  for (let page = 2; page <= finalPage; page += 1) {
    if (config.delayMs) await delay(config.delayMs);
    const payload = await postMerchantApi(config, "/merchantApi/GoodsPool/list", {
      current: page,
      pageSize: config.pageSize,
      tags_id: config.tagsId,
    });
    rows.push(...normalizeSourceSquareList(payload.data?.list, page, config.baseUrl));
  }

  return dedupeBy(rows, (row) => row.shopToken || row.sourceUrl).map((row, index) => ({
    ...row,
    index: index + 1,
  }));
}

async function postMerchantApi(config, pathname, body) {
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
      "content-type": "application/json;charset=UTF-8",
      "merchant-token": config.merchantToken,
      origin: config.baseUrl,
      referer: `${config.baseUrl}/merchant/my_parent/source_square`,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`LDXP HTTP ${response.status}: ${text.slice(0, 160)}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`LDXP returned non-JSON content: ${text.slice(0, 160)}`);
  }

  if (json.code === 401) {
    throw new Error(`LDXP login required: ${json.msg || "请先登录"}`);
  }
  if (json.code !== 1) {
    throw new Error(`LDXP API error: ${json.msg || json.message || `code ${json.code}`}`);
  }
  return json;
}

function normalizeSourceSquareList(value, page, baseUrl) {
  const list = Array.isArray(value) ? value : [];
  return list.flatMap((item, offset) => {
    const user = item && typeof item === "object" ? item.user || {} : {};
    const link = cleanText(user.link || "");
    const shopToken = shopTokenFromUrl(link) || cleanText(user.token || user.shop_key || user.agent_key || "");
    if (!shopToken) return [];

    const sourceUrl = normalizeShopUrl(link, baseUrl, shopToken);
    const name = cleanText(user.nickname || item.nickname || item.name || `链动小铺 / ${shopToken}`);
    const title = cleanText(item.title || item.description || user.description || "");
    const goodsCount = numberOrNull(item.goods_count ?? item.goodsCount);
    const tags = Array.isArray(item.tags_list)
      ? item.tags_list.map((tag) => cleanText(tag?.name)).filter(Boolean)
      : [];

    return [{
      page,
      pageOffset: offset + 1,
      sourceId: `ldxp-${slugify(shopToken)}`,
      sourceName: name,
      sourceUrl,
      shopToken,
      agentKey: cleanText(user.agent_key || ""),
      description: title,
      goodsCount,
      avatarUrl: cleanText(user.avatar || ""),
      isTop: Number(item.is_top || 0) === 1,
      tags,
    }];
  });
}

async function loadExistingLists({ includeSupabase, existingPaths }) {
  const entries = [];
  if (includeSupabase) {
    entries.push(...await loadSupabaseSources());
  }

  for (const inputPath of existingPaths) {
    const absolutePath = path.resolve(repoRoot, inputPath);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, "utf8");
    for (const url of collectShopUrls(content)) {
      entries.push({
        source: path.relative(repoRoot, absolutePath),
        id: null,
        name: null,
        url,
        token: shopTokenFromUrl(url),
      });
    }
  }

  return dedupeBy(entries, (entry) => `${entry.source}:${entry.id || ""}:${normalizeUrl(entry.url)}`);
}

async function loadSupabaseSources() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("sources")
    .select("id,name,entry_url,base_url,collector_kind,enabled")
    .order("id", { ascending: true });
  if (error) throw error;

  return (data || []).flatMap((source) => {
    const sourceUrl = source.entry_url || source.base_url || "";
    const token = shopTokenFromUrl(sourceUrl);
    if (!token && normalizeHostname(sourceUrl) !== "pay.ldxp.cn") return [];
    return [{
      source: "supabase:sources",
      id: String(source.id || ""),
      name: String(source.name || ""),
      url: sourceUrl,
      token,
      collectorKind: source.collector_kind ? String(source.collector_kind) : null,
      enabled: Boolean(source.enabled),
    }];
  });
}

function compareRows(rows, existing) {
  const existingByToken = groupBy(existing.filter((entry) => entry.token), (entry) => entry.token);
  const existingByUrl = groupBy(existing, (entry) => normalizeUrl(entry.url));
  const existingById = groupBy(existing.filter((entry) => entry.id), (entry) => String(entry.id).toLowerCase());

  return rows.map((row) => {
    const matches = [
      ...(existingByToken.get(row.shopToken) || []),
      ...(existingByUrl.get(normalizeUrl(row.sourceUrl)) || []),
      ...(existingById.get(row.sourceId.toLowerCase()) || []),
    ];
    const uniqueMatches = dedupeBy(matches, (match) => `${match.source}:${match.id || ""}:${normalizeUrl(match.url)}`);
    const inSupabase = uniqueMatches.some((match) => match.source === "supabase:sources");
    const inExistingFiles = uniqueMatches.some((match) => match.source !== "supabase:sources");

    return {
      ...row,
      compareStatus: inSupabase ? "existing_source" : inExistingFiles ? "seen_in_existing_list" : "new_candidate",
      existingMatches: uniqueMatches,
    };
  });
}

function buildReport({ baseUrl, tagsId, pageSize, limitPages, delayMs, rows, existing, existingPaths }) {
  const byStatus = countBy(rows, (row) => row.compareStatus);
  return {
    summary: {
      generatedAt: new Date().toISOString(),
      baseUrl,
      tagsId,
      pageSize,
      limitPages: limitPages || null,
      delayMs,
      sourceSquareCount: rows.length,
      existingSourceCount: byStatus.existing_source || 0,
      seenInExistingListCount: byStatus.seen_in_existing_list || 0,
      newCandidateCount: byStatus.new_candidate || 0,
      existingComparisonRows: existing.length,
      existingPaths,
    },
    rows,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# LDXP 货源广场源头店铺链接对比");
  lines.push("");
  lines.push(`生成时间：${report.summary.generatedAt}`);
  lines.push("");
  lines.push("## 摘要");
  lines.push("");
  lines.push(`- 货源广场店铺：${report.summary.sourceSquareCount}`);
  lines.push(`- 已在 PriceAI sources：${report.summary.existingSourceCount}`);
  lines.push(`- 已在历史 LDXP 列表：${report.summary.seenInExistingListCount}`);
  lines.push(`- 新候选：${report.summary.newCandidateCount}`);
  lines.push(`- 对比来源行数：${report.summary.existingComparisonRows}`);
  lines.push("");
  lines.push("## 明细");
  lines.push("");
  lines.push("| 状态 | 店铺 | 源头店铺链接 | 对接码 | 商品数 | 匹配到的已有记录 |");
  lines.push("|---|---|---:|---:|---:|---|");
  for (const row of report.rows) {
    const matches = row.existingMatches
      .slice(0, 3)
      .map((match) => cleanMarkdown(`${match.source}${match.id ? ` / ${match.id}` : ""}${match.name ? ` / ${match.name}` : ""}`))
      .join("<br>");
    lines.push(
      `| ${statusLabel(row.compareStatus)} | ${cleanMarkdown(row.sourceName)} | ${row.sourceUrl} | ${cleanMarkdown(row.agentKey)} | ${row.goodsCount ?? ""} | ${matches || "-"} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function collectShopUrls(content) {
  const urls = new Set();
  for (const match of content.matchAll(/https:\/\/pay\.ldxp\.cn\/shop\/[^\s"'|)\\\]}<>]+/g)) {
    urls.add(match[0].replace(/[，。,.;；]+$/, ""));
  }
  return [...urls];
}

function statusLabel(value) {
  if (value === "existing_source") return "已入库";
  if (value === "seen_in_existing_list") return "历史列表见过";
  return "新候选";
}

function cleanMarkdown(value) {
  return cleanText(value).replaceAll("|", "\\|");
}

function shopTokenFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/shop\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function normalizeShopUrl(link, baseUrl, shopToken) {
  try {
    const url = new URL(link);
    const token = shopTokenFromUrl(url.href);
    if (token && normalizeHostname(url.href) === normalizeHostname(baseUrl)) {
      url.hash = "";
      url.search = "";
      return `${url.protocol}//${url.hostname}${url.pathname.replace(/\/$/, "")}`;
    }
  } catch {
    // Fall back to the known shop-token route below.
  }
  return `${baseUrl}/shop/${encodeURIComponent(shopToken)}`;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return cleanText(value).replace(/\/$/, "");
  }
}

function normalizeHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value || "").replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase();
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dedupeBy(items, keyForItem) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyForItem(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function groupBy(items, keyForItem) {
  const map = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    if (!key) continue;
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function countBy(items, keyForItem) {
  const output = {};
  for (const item of items) {
    const key = keyForItem(item);
    output[key] = (output[key] || 0) + 1;
  }
  return output;
}

function optionList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function integerOption(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function printHelp() {
  console.log(`Usage:
  LDXP_MERCHANT_TOKEN=... npm run export:ldxp-source-square

Options:
  --merchant-token <token>       Merchant-Token from an authorized LDXP merchant account
  --page-size <n>                API page size, default 20
  --limit-pages <n>              Only export the first n pages
  --delay-ms <n>                 Delay between source-square pages, default 500
  --existing <path[,path]>       Extra existing-list files to compare
  --no-supabase                  Skip Supabase sources comparison
  --out <path>                   Markdown output path
  --json-out <path>              JSON output path
`);
}
