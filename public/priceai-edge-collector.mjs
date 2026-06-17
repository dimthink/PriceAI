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
const DEFAULT_POST_BATCH_SIZE = 100;
const DEFAULT_FULL_SNAPSHOT_OFFER_LIMIT = 200;
const MAX_DISCOVERED_TOKENS = 3;
const MAX_CATEGORY_PAGES = 10;

const args = parseArgs(process.argv.slice(2));
const explicitMaxCycles = args.maxCycles || args["max-cycles"] || process.env.PRICEAI_AGENT_MAX_CYCLES;
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
  shardCount: integerInRange(args.shardCount || args["shard-count"] || process.env.PRICEAI_AGENT_SHARD_COUNT, 1, 32, 1),
  shardIndex: integerInRange(args.shardIndex || args["shard-index"] || process.env.PRICEAI_AGENT_SHARD_INDEX, 0, 31, 0),
  pageDelayMs: integerInRange(args.pageDelayMs || args["page-delay-ms"] || process.env.PRICEAI_AGENT_PAGE_DELAY_MS, 0, 5000, DEFAULT_PAGE_DELAY_MS),
  intervalSeconds: integerInRange(args.interval || args["interval-seconds"] || process.env.PRICEAI_AGENT_INTERVAL_SECONDS, 30, 3600, DEFAULT_INTERVAL_SECONDS),
  round: truthy(args.round) || truthy(process.env.PRICEAI_AGENT_ROUND),
  maxRoundTasks: integerInRange(args.maxRoundTasks || args["max-round-tasks"] || process.env.PRICEAI_AGENT_MAX_ROUND_TASKS, 1, 1000, DEFAULT_MAX_ROUND_TASKS),
  windControlCooldownSeconds: integerInRange(args.windControlCooldownSeconds || args["wind-control-cooldown-seconds"] || process.env.PRICEAI_AGENT_WIND_CONTROL_COOLDOWN_SECONDS, 30, 3600, DEFAULT_WIND_CONTROL_COOLDOWN_SECONDS),
  windControlThreshold: integerInRange(args.windControlThreshold || args["wind-control-threshold"] || process.env.PRICEAI_AGENT_WIND_CONTROL_THRESHOLD, 1, 20, DEFAULT_WIND_CONTROL_THRESHOLD),
  postBatchSize: integerInRange(args.postBatchSize || args["post-batch-size"] || process.env.PRICEAI_AGENT_POST_BATCH_SIZE, 10, 500, DEFAULT_POST_BATCH_SIZE),
  fullSnapshotOfferLimit: integerInRange(args.fullSnapshotOfferLimit || args["full-snapshot-offer-limit"] || process.env.PRICEAI_AGENT_FULL_SNAPSHOT_OFFER_LIMIT, 0, 2000, DEFAULT_FULL_SNAPSHOT_OFFER_LIMIT),
  loop: truthy(args.loop) || truthy(process.env.PRICEAI_AGENT_LOOP),
  maxCycles: explicitMaxCycles ? integerInRange(explicitMaxCycles, 1, 1000000, 1) : null,
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

if (config.shardIndex >= config.shardCount) {
  console.error(`Invalid shard config: shardIndex=${config.shardIndex} must be smaller than shardCount=${config.shardCount}.`);
  process.exit(1);
}

await main();

async function main() {
  let cycle = 0;

  do {
    cycle += 1;
    const startedAt = new Date().toISOString();
    console.log(`[priceai-edge] cycle ${cycle} start ${startedAt}`);
    await postCollectorHeartbeat("running", {
      startedAt,
      message: `Edge collector cycle ${cycle} started.`,
      details: { cycle },
    }).catch((error) => {
      console.error(`[priceai-edge] heartbeat start failed: ${errorMessage(error)}`);
    });

    await runCycle(startedAt)
      .then(async (summary) => {
        const status = edgeHeartbeatStatus(summary);
        await postCollectorHeartbeat(status, {
          startedAt: summary.startedAt,
          finishedAt: summary.finishedAt,
          successCount: summary.success,
          failureCount: summary.failed,
          skippedCount: 0,
          offerCount: summary.offers,
          message: `Edge collector processed ${summary.processed} source(s): ${summary.success} success, ${summary.failed} failed.`,
          details: {
            cycle,
            processed: summary.processed,
            uploadFailed: summary.uploadFailed,
            maxRoundTasks: config.maxRoundTasks,
          },
        }).catch((error) => {
          console.error(`[priceai-edge] heartbeat finish failed: ${errorMessage(error)}`);
        });
      })
      .catch(async (error) => {
        console.error(`[priceai-edge] cycle ${cycle} failed: ${errorMessage(error)}`);
        await postCollectorHeartbeat("failed", {
          startedAt,
          finishedAt: new Date().toISOString(),
          failureCount: 1,
          message: errorMessage(error),
          details: { cycle, phase: "cycle" },
        }).catch((heartbeatError) => {
          console.error(`[priceai-edge] heartbeat failure failed: ${errorMessage(heartbeatError)}`);
        });
        if (!config.loop) process.exitCode = 1;
      });

    if (!config.loop || (config.maxCycles !== null && cycle >= config.maxCycles)) break;
    console.log(`[priceai-edge] sleeping ${config.intervalSeconds}s`);
    await delay(config.intervalSeconds * 1000);
  } while (true);
}

async function runCycle(startedAt = new Date().toISOString()) {
  let success = 0;
  let failed = 0;
  let offers = 0;
  let processed = 0;
  let uploadFailed = 0;
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

      let collection;
      let collectedOffers;
      let status;
      let message;
      try {
        collection = await collectShopApi(target);
        collectedOffers = dedupeOffers(collection.offers);
        status = collectedOffers.length ? "success" : "failed";
        message = collectedOffers.length
          ? `Edge collector found ${collectedOffers.length} offers.`
          : "Edge collector found no offers.";
      } catch (error) {
        failed += 1;
        const failureMessage = errorMessage(error);
        const windControl = isWindControlError(error);
        if (windControl) consecutiveWindControl += 1;
        else consecutiveWindControl = 0;

        console.error(`Failed: ${failureMessage}`);
        await postCrawlRun(target, "failed", failureMessage, [], {
          durationMs: Date.now() - startedAt,
          windControl,
          failurePhase: "collect",
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
        continue;
      }

      try {
        await postCrawlRun(target, status, message, collectedOffers, {
          durationMs: Date.now() - startedAt,
          fullSnapshot: status === "success" && collection.fullSnapshot,
          partialReason: collection.partialReason || null,
          failurePhase: status === "success" ? null : "collect",
        });
      } catch (error) {
        failed += 1;
        uploadFailed += 1;
        consecutiveWindControl = 0;
        console.error(
          `Upload failed after ${status} collection for ${target.sourceName}; source health was not overwritten: ${errorMessage(error)}`,
        );
        continue;
      }

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

      if (config.round && processed >= config.maxRoundTasks) {
        console.log(`[priceai-edge] reached max round tasks (${config.maxRoundTasks})`);
        break;
      }
    }

    if (!config.round || processed >= config.maxRoundTasks) break;
  } while (true);

  const finishedAt = new Date().toISOString();
  console.log(`\n[priceai-edge] done: processed=${processed} success=${success} failed=${failed} uploadFailed=${uploadFailed} offers=${offers}`);
  return { processed, success, failed, uploadFailed, offers, startedAt, finishedAt };
}

async function fetchTasks(options = {}) {
  const url = new URL(`${config.endpoint}/api/admin/collector-agent/tasks`);
  url.searchParams.set("kind", config.kind);
  url.searchParams.set("family", config.family);
  url.searchParams.set("limit", String(config.limit));
  if (config.shardCount > 1) {
    url.searchParams.set("shardCount", String(config.shardCount));
    url.searchParams.set("shardIndex", String(config.shardIndex));
  }
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
  const discovery = await discoverShopTokens(target);
  const tokens = discovery.tokens;
  const offers = [];
  const partialReasons = [];

  if (!tokens.length) {
    throw new Error("No shop token found. Need /shop/<token> URL or existing /item/<goods_key> URL.");
  }
  if (discovery.capped) {
    partialReasons.push(`Token discovery reached ${MAX_DISCOVERED_TOKENS} tokens; snapshot may be incomplete.`);
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
      for (let page = 1; page <= MAX_CATEGORY_PAGES; page += 1) {
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
        if (page === MAX_CATEGORY_PAGES && items.length >= 100) {
          partialReasons.push(`Category ${categoryId} reached page cap ${MAX_CATEGORY_PAGES}.`);
        }

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

  return {
    offers,
    fullSnapshot: partialReasons.length === 0,
    partialReason: partialReasons.join(" "),
  };
}

async function discoverShopTokens(target) {
  const tokens = new Set();
  let capped = false;
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
    if (tokens.size >= MAX_DISCOVERED_TOKENS) {
      capped = true;
      break;
    }
  }

  return {
    tokens: Array.from(tokens),
    capped,
  };
}

async function postCrawlRun(target, status, message, offers, extraDetails = {}) {
  if (config.dryRun) {
    console.log(`[dry-run] would upload ${status}: ${target.sourceId}, offers=${offers.length}, message=${message}`);
    return;
  }

  const payloads = crawlRunPayloads(target, status, message, offers, extraDetails);
  const totals = { successCount: 0, writtenCount: 0, refreshedCount: 0, unchangedCount: 0, runCount: 0 };

  for (const payload of payloads) {
    const body = await uploadCrawlRunPayload(payload);
    totals.successCount += Number(body.successCount || 0);
    totals.writtenCount += Number(body.writtenCount || 0);
    totals.refreshedCount += Number(body.refreshedCount || 0);
    totals.unchangedCount += Number(body.unchangedCount || 0);
    totals.runCount += 1;
  }

  console.log(
    `Uploaded ${status}: runCount=${totals.runCount} successCount=${totals.successCount} written=${totals.writtenCount} refreshed=${totals.refreshedCount}`,
  );
  return totals;
}

function crawlRunPayloads(target, status, message, offers, extraDetails = {}) {
  const fullSnapshot = shouldIncludeFullSnapshot(status, offers, extraDetails);

  if (status !== "success" || offers.length <= config.postBatchSize) {
    return [
      crawlRunPayload(target, status, message, offers, compactObject({
        ...extraDetails,
        fullSnapshot,
        seenOfferIds: fullSnapshot ? offerIdsForSnapshot(offers) : null,
        deferredFullSnapshot: status === "success" && !fullSnapshot,
      })),
    ];
  }

  const batches = chunks(offers, config.postBatchSize);
  const seenOfferIds = fullSnapshot ? offerIdsForSnapshot(offers) : null;

  return batches.map((batch, index) => {
    const batchIndex = index + 1;
    const isLast = batchIndex === batches.length;
    return crawlRunPayload(
      target,
      isLast ? "success" : "partial",
      `${message} 分批写入 ${batchIndex}/${batches.length}。`,
      batch,
      compactObject({
        ...extraDetails,
        fullSnapshot: isLast && fullSnapshot,
        seenOfferIds: isLast && fullSnapshot ? seenOfferIds : null,
        deferredFullSnapshot: isLast && !fullSnapshot,
        batchIndex,
        batchCount: batches.length,
        originalOfferCount: offers.length,
      }),
    );
  });
}

function shouldIncludeFullSnapshot(status, offers, extraDetails = {}) {
  return status === "success" && Boolean(extraDetails.fullSnapshot) && offers.length <= config.fullSnapshotOfferLimit;
}

function crawlRunPayload(target, status, message, offers, extraDetails = {}) {
  return {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    mode: "http",
    status,
    message,
    offers,
    details: compactObject({
      collector: target.kind,
      collectorNode: collectorNodeDetails(),
      edgeRunner: {
        version: VERSION,
        family: config.family,
        shardCount: config.shardCount,
        shardIndex: config.shardIndex,
        postBatchSize: config.postBatchSize,
      },
      fullSnapshot: false,
      ...extraDetails,
    }),
  };
}

async function uploadCrawlRunPayload(payload) {
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
  return body;
}

async function postCollectorHeartbeat(status, input = {}) {
  if (config.dryRun) return;

  const payload = {
    node: collectorNodeDetails(),
    scope: `kind:${config.kind};family:${config.family};shard:${config.shardIndex}/${config.shardCount}`,
    status,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    successCount: Number(input.successCount || 0),
    failureCount: Number(input.failureCount || 0),
    skippedCount: Number(input.skippedCount || 0),
    offerCount: Number(input.offerCount || 0),
    message: input.message || null,
    details: compactObject({
      version: VERSION,
      family: config.family,
      kind: config.kind,
      limit: config.limit,
      shardCount: config.shardCount,
      shardIndex: config.shardIndex,
      round: config.round,
      loop: config.loop,
      ...(input.details || {}),
    }),
  };

  const body = await fetchJson(`${config.endpoint}/api/admin/collector-heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!body.ok) throw new Error(body.message || "Heartbeat upload failed.");
}

function edgeHeartbeatStatus(summary) {
  if (!summary.processed) return "idle";
  if (summary.failed > 0 && summary.success > 0) return "partial";
  if (summary.failed > 0) return "failed";
  return "success";
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
  let response;
  try {
    response = await fetch(url, {
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
  } catch (error) {
    throw new Error(`${url} fetch failed: ${errorMessage(error)}`);
  }

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
    const key = stableOfferInputId(offer);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(offer);
  }
  return output;
}

function offerIdsForSnapshot(offers) {
  return offers.map((offer) => stableOfferInputId(offer));
}

function stableOfferInputId(offer) {
  const shopItemUrl = normalizeShopApiItemOfferUrl(offer.url);
  if (shopItemUrl) return stableId("shop-api-offer", shopItemUrl);

  return stableId(offer.sourceName, offer.sourceStoreName, offer.sourceTitle, offer.url);
}

function normalizeShopApiItemOfferUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
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

function stableId(...parts) {
  const input = parts.filter((part) => part !== null && part !== undefined).join("|");
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return `id-${(hash >>> 0).toString(36)}`;
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

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
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
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause;
    const code = typeof causeRecord.code === "string" ? causeRecord.code : "";
    const message = typeof causeRecord.message === "string" ? causeRecord.message : "";
    if (code || message) return [error.message, code, message].filter(Boolean).join(": ");
  }
  return error.message;
}
