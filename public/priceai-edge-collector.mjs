#!/usr/bin/env node

import os from "node:os";

const VERSION = "0.1.0";
const DEFAULT_ENDPOINT = "https://priceai.cc";
const DEFAULT_KIND = "shopApi";
const DEFAULT_FAMILY = "shopApi";
const DEFAULT_LIMIT = 3;
const DEFAULT_PAGE_DELAY_MS = 300;
const DEFAULT_INTERVAL_SECONDS = 300;
const DEFAULT_MAX_ROUND_TASKS = 200;
const DEFAULT_WIND_CONTROL_COOLDOWN_SECONDS = 300;
const DEFAULT_WIND_CONTROL_THRESHOLD = 3;

const args = parseArgs(process.argv.slice(2));
const config = {
  endpoint: stripTrailingSlash(
    args.endpoint ||
      process.env.PRICEAI_ENDPOINT ||
      process.env.CRON_PUBLIC_BASE_URL ||
      DEFAULT_ENDPOINT,
  ),
  token:
    args.token ||
    process.env.PRICEAI_AGENT_TOKEN ||
    process.env.PRICEAI_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.CRON_SECRET,
  kind: args.kind || process.env.PRICEAI_AGENT_KIND || DEFAULT_KIND,
  family: args.family || process.env.PRICEAI_AGENT_FAMILY || DEFAULT_FAMILY,
  limit: integerInRange(args.limit || process.env.PRICEAI_AGENT_LIMIT, 1, 20, DEFAULT_LIMIT),
  pageDelayMs: integerInRange(args.pageDelayMs || args["page-delay-ms"] || process.env.PRICEAI_AGENT_PAGE_DELAY_MS, 0, 5000, DEFAULT_PAGE_DELAY_MS),
  intervalSeconds: integerInRange(args.interval || args["interval-seconds"] || process.env.PRICEAI_AGENT_INTERVAL_SECONDS, 30, 3600, DEFAULT_INTERVAL_SECONDS),
  round: truthy(args.round) || truthy(process.env.PRICEAI_AGENT_ROUND),
  maxRoundTasks: integerInRange(args.maxRoundTasks || args["max-round-tasks"] || process.env.PRICEAI_AGENT_MAX_ROUND_TASKS, 1, 1000, DEFAULT_MAX_ROUND_TASKS),
  windControlCooldownSeconds: integerInRange(args.windControlCooldownSeconds || args["wind-control-cooldown-seconds"] || process.env.PRICEAI_AGENT_WIND_CONTROL_COOLDOWN_SECONDS, 30, 3600, DEFAULT_WIND_CONTROL_COOLDOWN_SECONDS),
  windControlThreshold: integerInRange(args.windControlThreshold || args["wind-control-threshold"] || process.env.PRICEAI_AGENT_WIND_CONTROL_THRESHOLD, 1, 20, DEFAULT_WIND_CONTROL_THRESHOLD),
  loop: truthy(args.loop) || truthy(process.env.PRICEAI_AGENT_LOOP),
  maxCycles: integerInRange(args.maxCycles || args["max-cycles"] || process.env.PRICEAI_AGENT_MAX_CYCLES, 1, 1000000, 1),
  dryRun: truthy(args.dryRun) || truthy(args["dry-run"]) || truthy(process.env.PRICEAI_AGENT_DRY_RUN),
};

if (!config.token) {
  console.error("Missing PRICEAI_AGENT_TOKEN. Pass it as env or --token.");
  process.exit(1);
}

if (config.kind !== "shopApi") {
  console.error("This lightweight collector currently supports shopApi only.");
  process.exit(1);
}

await main();

async function main() {
  let cycle = 0;

  do {
    cycle += 1;
    const startedAt = new Date().toISOString();
    console.log(`[priceai-edge] cycle ${cycle} start ${startedAt}`);
    await runCycle().catch((error) => {
      console.error(`[priceai-edge] cycle ${cycle} failed: ${errorMessage(error)}`);
      if (!config.loop) process.exitCode = 1;
    });

    if (!config.loop || cycle >= config.maxCycles) break;
    console.log(`[priceai-edge] sleeping ${config.intervalSeconds}s`);
    await delay(config.intervalSeconds * 1000);
  } while (true);
}

async function runCycle() {
  let success = 0;
  let failed = 0;
  let offers = 0;
  let processed = 0;
  let consecutiveWindControl = 0;
  const processedSourceIds = new Set();
  const staleBefore = config.round ? new Date().toISOString() : null;

  do {
    const tasks = await fetchTasks({ staleBefore, excludeSourceIds: Array.from(processedSourceIds) });
    if (!tasks.length) {
      console.log(processed ? "[priceai-edge] no more tasks in this round" : "[priceai-edge] no tasks");
      break;
    }

    for (const task of tasks) {
      const target = normalizeTask(task);
      if (processedSourceIds.has(target.sourceId)) continue;
      processedSourceIds.add(target.sourceId);
      processed += 1;
      console.log(`\n==> ${target.sourceName} [${target.kind}]`);
      const startedAt = Date.now();

      try {
        const collectedOffers = dedupeOffers(await collectShopApi(target));
        const status = collectedOffers.length ? "success" : "failed";
        const message = collectedOffers.length
          ? `Edge collector found ${collectedOffers.length} offers.`
          : "Edge collector found no offers.";

        await postCrawlRun(target, status, message, collectedOffers, {
          durationMs: Date.now() - startedAt,
        });

        if (status === "success") {
          success += 1;
          offers += collectedOffers.length;
          consecutiveWindControl = 0;
          printOfferPreview(collectedOffers);
        } else {
          failed += 1;
          consecutiveWindControl = 0;
          console.log(message);
        }
      } catch (error) {
        failed += 1;
        const message = errorMessage(error);
        const windControl = isWindControlError(error);
        if (windControl) consecutiveWindControl += 1;
        else consecutiveWindControl = 0;

        console.error(`Failed: ${message}`);
        await postCrawlRun(target, "failed", message, [], {
          durationMs: Date.now() - startedAt,
          windControl,
        }).catch((postError) => {
          console.error(`Failed to upload failure log: ${errorMessage(postError)}`);
        });

        if (consecutiveWindControl >= config.windControlThreshold) {
          console.log(
            `[priceai-edge] ${consecutiveWindControl} consecutive wind-control failures; cooling down ${config.windControlCooldownSeconds}s before continuing this round`,
          );
          await delay(config.windControlCooldownSeconds * 1000);
          consecutiveWindControl = 0;
        }
      }

      if (config.round && processed >= config.maxRoundTasks) {
        console.log(`[priceai-edge] reached max round tasks (${config.maxRoundTasks})`);
        break;
      }
    }

    if (!config.round || processed >= config.maxRoundTasks) break;
  } while (true);

  console.log(`\n[priceai-edge] done: processed=${processed} success=${success} failed=${failed} offers=${offers}`);
}

async function fetchTasks(options = {}) {
  const url = new URL(`${config.endpoint}/api/admin/collector-agent/tasks`);
  url.searchParams.set("kind", config.kind);
  url.searchParams.set("family", config.family);
  url.searchParams.set("limit", String(config.limit));
  if (options.staleBefore) url.searchParams.set("staleBefore", options.staleBefore);
  if (options.excludeSourceIds?.length) {
    url.searchParams.set("excludeSourceIds", options.excludeSourceIds.join(","));
  }

  const body = await fetchJson(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!body.ok) throw new Error(body.message || "Task request failed.");
  return Array.isArray(body.tasks) ? body.tasks : [];
}

async function collectShopApi(target) {
  const tokens = await discoverShopTokens(target);
  const offers = [];

  if (!tokens.length) {
    throw new Error("No shop token found. Need /shop/<token> URL or existing /item/<goods_key> URL.");
  }

  for (const token of tokens) {
    const shopInfo = await postJson(
      `${target.baseUrl}/shopApi/Shop/info`,
      { token, category_key: "" },
      `${target.baseUrl}/shop/${token}`,
    );
    if (shopInfo.code !== 1 || !shopInfo.data) continue;

    const storeName = cleanText(shopInfo.data.nickname || target.sourceStoreName || target.sourceName);
    const sourceUrl = shopInfo.data.link || `${target.baseUrl}/shop/${token}`;
    const categoriesPayload = await postJson(
      `${target.baseUrl}/shopApi/Shop/categoryList`,
      { token, goods_type: "card", category_key: "" },
      sourceUrl,
    );
    const categories = Array.isArray(categoriesPayload.data) ? categoriesPayload.data : [];
    const selectedCategories = categories.filter((category) => Number(category.goods_count || 0) > 0 && Number(category.id) !== 0);
    const categoryIds = selectedCategories.length
      ? selectedCategories.map((category) => Number(category.id))
      : categories.some((category) => Number(category.id) === 0)
        ? [0]
        : [];

    for (const categoryId of categoryIds) {
      for (let page = 1; page <= 10; page += 1) {
        await delay(config.pageDelayMs);
        const listPayload = await postJson(
          `${target.baseUrl}/shopApi/Shop/goodsList`,
          {
            token,
            keywords: "",
            category_id: categoryId,
            goods_type: "card",
            current: page,
            pageSize: 100,
          },
          sourceUrl,
        );
        const items = Array.isArray(listPayload.data?.list) ? listPayload.data.list : [];
        if (!items.length) break;

        for (const item of items) {
          const title = cleanText(item.name);
          const price = numberOrNull(item.price ?? item.real_price);
          if (!title || price === null || isNonComparableTitle(title)) continue;

          const stockCount = numberOrNull(item.extend?.stock_count);
          const status = Number(item.status ?? 1) !== 1 ? "out_of_stock" : statusFromStock(stockCount);
          const categoryName = cleanText(item.category?.name || "");
          offers.push(
            makeOffer(
              {
                ...target,
                sourceUrl,
                sourceStoreName: storeName,
              },
              {
                title,
                price,
                status,
                stockCount,
                url: item.link || `${target.baseUrl}/item/${item.goods_key}`,
                tags: compact([
                  categoryName,
                  item.goods_type === "card" ? "卡密" : null,
                  item.extend?.send_order === 0 ? "自动发货" : null,
                ]),
              },
            ),
          );
        }
      }
    }
  }

  return offers;
}

async function discoverShopTokens(target) {
  const tokens = new Set();
  const entryToken = shopTokenFromUrl(target.sourceUrl);
  if (entryToken) tokens.add(entryToken);

  for (const itemUrl of target.rawOfferUrls.slice(0, 20)) {
    if (normalizeHostname(itemUrl) !== normalizeHostname(target.baseUrl)) continue;
    const goodsKey = goodsKeyFromUrl(itemUrl);
    if (!goodsKey) continue;

    const payload = await postJson(
      `${target.baseUrl}/shopApi/Shop/goodsInfo`,
      { goods_key: goodsKey, trade_no: "" },
      itemUrl,
    ).catch(() => null);

    const token = payload?.data?.user?.token;
    if (token) tokens.add(String(token));
    if (tokens.size >= 3) break;
  }

  return Array.from(tokens);
}

async function postCrawlRun(target, status, message, offers, extraDetails = {}) {
  if (config.dryRun) {
    console.log(`[dry-run] would upload ${status}: ${target.sourceId}, offers=${offers.length}, message=${message}`);
    return;
  }

  const payload = {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    mode: "http",
    status,
    message,
    offers,
    details: {
      collector: target.kind,
      collectorNode: collectorNodeDetails(),
      edgeRunner: {
        version: VERSION,
        family: config.family,
      },
      fullSnapshot: status === "success",
      ...extraDetails,
    },
  };

  const body = await fetchJson(`${config.endpoint}/api/admin/crawl-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!body.ok) throw new Error(body.message || "Upload failed.");

  console.log(
    `Uploaded ${status}: successCount=${Number(body.successCount || 0)} written=${Number(body.writtenCount || 0)} refreshed=${Number(body.refreshedCount || 0)}`,
  );
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} returned non-JSON response: ${text.slice(0, 180)}`);
  }
  if (!response.ok) throw new Error(body?.message || `${url} returned HTTP ${response.status}`);
  return body;
}

async function postJson(url, body, referer) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...defaultHeaders(referer || url),
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      visitorid: `edge${Math.random().toString(36).slice(2, 10)}`,
      referer: referer || url,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  if (!response.ok) {
    const wafReason = response.headers.get("x-tengine-error");
    throw new Error(`${url} returned HTTP ${response.status}${wafReason ? ` (${wafReason})` : ""}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    if (/<html|<script|captcha|verify|challenge|验证|风控|安全/i.test(text)) {
      throw new Error(`${url} returned verification/challenge page.`);
    }
    throw new Error(`${url} returned non-JSON response.`);
  }
}

function normalizeTask(task) {
  const sourceUrl = String(task.sourceUrl || "");
  const baseUrl = String(task.baseUrl || deriveBaseUrl(sourceUrl));
  return {
    sourceId: String(task.sourceId || ""),
    sourceName: String(task.sourceName || task.sourceId || sourceUrl),
    sourceUrl,
    sourceStoreName: String(task.sourceName || task.sourceId || sourceUrl),
    baseUrl,
    kind: String(task.collectorKind || DEFAULT_KIND),
    rawOfferUrls: Array.isArray(task.rawOfferUrls) ? task.rawOfferUrls.map(String) : [],
  };
}

function makeOffer(target, input) {
  return {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    sourceStoreName: target.sourceStoreName || target.sourceName,
    sourceTitle: input.title,
    price: input.price,
    currency: "CNY",
    status: input.status || "unknown",
    url: absolutize(input.url || target.sourceUrl, target.baseUrl),
    tags: input.tags || [],
    stockCount: input.stockCount ?? null,
  };
}

function collectorNodeDetails() {
  const id = process.env.PRICEAI_COLLECTOR_NODE_ID || `edge-${os.hostname()}`;
  return compactObject({
    id,
    name: process.env.PRICEAI_COLLECTOR_NODE_NAME || id,
    type: process.env.PRICEAI_COLLECTOR_NODE_TYPE || "vps",
    runtime: process.env.PRICEAI_COLLECTOR_NODE_RUNTIME || "edge-runner",
    region: process.env.PRICEAI_COLLECTOR_NODE_REGION || null,
  });
}

function defaultHeaders(url) {
  return {
    accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
    referer: deriveBaseUrl(url) || url,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };
}

function shopTokenFromUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname.match(/\/shop\/([^/?#]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

function goodsKeyFromUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname.match(/\/item\/([^/?#]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

function isNonComparableTitle(title) {
  return /公告|售后|规则|须知|教程|交流群|通知|免责声明|补差价|测试商品/.test(String(title || ""));
}

function statusFromStock(stockCount) {
  if (typeof stockCount === "number") {
    if (stockCount <= 0) return "out_of_stock";
    if (stockCount <= 3) return "low_stock";
    return "in_stock";
  }
  return "in_stock";
}

function dedupeOffers(offers) {
  const seen = new Set();
  const output = [];
  for (const offer of offers) {
    const key = `${offer.sourceName}|${offer.sourceStoreName}|${offer.sourceTitle}|${offer.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(offer);
  }
  return output;
}

function printOfferPreview(offers) {
  console.table(
    offers.slice(0, 8).map((offer) => ({
      title: offer.sourceTitle.slice(0, 42),
      price: offer.price,
      status: offer.status,
      stock: offer.stockCount,
      store: offer.sourceStoreName,
    })),
  );
  if (offers.length > 8) console.log(`... ${offers.length - 8} more`);
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

function authHeaders() {
  return { "x-admin-password": config.token };
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && value !== "");
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""),
  );
}

function deriveBaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function absolutize(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function normalizeHostname(value) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function integerInRange(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.trunc(number), max));
}

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function isWindControlError(error) {
  return /HTTP 403|denied by ip_access_rule|verification\/challenge|captcha|challenge|验证|风控|安全/i.test(
    errorMessage(error),
  );
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
