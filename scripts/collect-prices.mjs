#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "./safe-fetch.mjs";
import collectorRegistry from "../config/collectors.json" with { type: "json" };

const env = readEnvFile(".env.local");

const PRICE_VALUE_PATTERN = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const CURRENCY_PRICE_RE = new RegExp(String.raw`[¥￥]\s*${PRICE_VALUE_PATTERN}`);
const SUFFIX_PRICE_RE = new RegExp(String.raw`${PRICE_VALUE_PATTERN}\s*(?:CNY|RMB|元)`, "i");
const DEFAULT_COOLDOWN_MINUTES = 25;
const DEFAULT_LOCK_SECONDS = 10 * 60;
const DEFAULT_LIANDONG_SHOP_BULK_LIMIT = 20;
const DEFAULT_LIANDONG_SHOP_BULK_DELAY_MS = 15_000;
const DEFAULT_LIANDONG_SHOP_BREAKER_MINUTES = 30;
const DEFAULT_LIANDONG_SHOP_HTTP_403_COOLDOWN_MINUTES = 5;
const DEFAULT_LIANDONG_SHOP_HTTP_403_THRESHOLD = 3;
const DEFAULT_PAGE_DELAY_MS = 300;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_POST_BATCH_SIZE = 25;
const MIN_POST_BATCH_SIZE = 10;
const MAX_POST_BATCH_SIZE = 500;
const DEFAULT_FLUSH_SOURCE_COUNT = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 120_000;
const DEFAULT_SPOOL_REPLAY_LIMIT = 40;
const DEFAULT_FULL_SNAPSHOT_OFFER_LIMIT = 200;
const SHOP_API_FULL_SNAPSHOT_OFFER_LIMIT = 500;
const STRUCTURED_FULL_SNAPSHOT_OFFER_LIMIT = 600;
const STRUCTURED_FULL_SNAPSHOT_COLLECTORS = new Set(["kami", "shopApi"]);
const EMPTY_FULL_SNAPSHOT_COLLECTORS = new Set(["kami"]);
const AUTO_DETECT_COLLECTOR_KINDS = [
  "dujiao",
  "kami",
  "publicProductsApi",
  "shopUserProductsApi",
  "mooncakeCatalog",
  "ikunloveApi",
  "unicornHtml",
  "opensoraHtml",
  "makerichHtml",
  "beibeiHtml",
  "blackcatWholesale",
  "genericHtml",
];
const BUILTIN_SOURCES = [
  { id: "ai666-gmail-wholesale", name: "T佬的gmail批发渠道", entry_url: "https://ai666.dnxb.cc/", collection_method: "http", collector_kind: "kami" },
  { id: "aisou-pro", name: "Aisou智充", entry_url: "https://aisou.pro/", collection_method: "http", collector_kind: "kami" },
  { id: "caowo-store", name: "GPT专卖-cw", entry_url: "https://caowo.store/", collection_method: "http", collector_kind: "kami" },
  { id: "fk-gptkt-pro", name: "fk.gptkt.pro", entry_url: "https://fk.gptkt.pro/", collection_method: "http", collector_kind: "kami" },
  { id: "auto-subscribe", name: "Auto Subscribe", entry_url: "https://shop.auto-subscribe.com/", collection_method: "http", collector_kind: "dujiao" },
  { id: "opensora-aifk", name: "AUTO FK", entry_url: "https://aifk.opensora.de/", collection_method: "http", collector_kind: "opensoraHtml" },
  { id: "makerich-club", name: "AI创富俱乐部", entry_url: "https://makerich.club/", collection_method: "http", collector_kind: "makerichHtml" },
  { id: "ldxp-jinyao", name: "LDXP 金钥", entry_url: "https://pay.ldxp.cn/shop/jinyao", collection_method: "http", collector_kind: "shopApi" },
  { id: "ldxp-pixelshop", name: "LDXP Pixelshop", entry_url: "https://pay.ldxp.cn/shop/pixelshop", collection_method: "http", collector_kind: "shopApi" },
  { id: "qxvx-pay", name: "QXVX Pay", entry_url: "https://pay.qxvx.cn/", collection_method: "http", collector_kind: "shopApi" },
];

export async function runPriceCollection(options = {}) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const targets = await loadTargets();
  const selectedTargets = selectTargets(targets, options);
  if (!selectedTargets.length) {
    selectedTargets.push(...selectBuiltinTargets(options));
  }
  const logger = options.silent ? null : console;
  const lockOwner = collectionLockOwner(options);
  const familyState = options.collectionFamilyState || createCollectionFamilyState(options);
  const writeQueue = options.post ? createCrawlLogWriteQueue(options, logger) : null;

  if (!selectedTargets.length) {
    throw new Error("No matching supported sources. Use --list to inspect available collectors.");
  }

  const groups = targetGroupsForCollection(selectedTargets);
  const concurrency = concurrencyFor(options);
  let summary;
  try {
    if (writeQueue) {
      await writeQueue.replaySpool("startup").catch((error) => {
        logger?.error(`Failed to replay crawl log spool: ${errorMessage(error)}`);
      });
    }

    if (options.post) {
      await postCollectorHeartbeat("running", options, {
        startedAt,
        message: `Price collector started for ${selectedTargets.length} source(s).`,
        details: {
          targetCount: selectedTargets.length,
          groupCount: groups.length,
          concurrency,
        },
      }).catch((error) => {
        logger?.error(`Failed to post collector heartbeat: ${errorMessage(error)}`);
      });
    }

    summary = (await runWithConcurrency(
      groups,
      concurrency,
      async (group) => {
        const results = [];
        for (const target of group.targets) {
          const result = await collectOneTarget(target, options, logger, lockOwner, familyState, writeQueue);
          results.push(result);

          const familyPause = collectionFamilyRunPauseReason(target, familyState);
          if (familyPause) {
            logger?.log(`Paused ${familyPause.label}: ${familyPause.message}`);
            break;
          }
        }
        return results;
      },
    )).flat();
  } catch (error) {
    if (options.post) {
      await postCollectorHeartbeat("failed", options, {
        startedAt,
        finishedAt: new Date().toISOString(),
        failureCount: 1,
        message: errorMessage(error),
        details: {
          phase: "collection",
          targetCount: selectedTargets.length,
          groupCount: groups.length,
        },
      }).catch((heartbeatError) => {
        logger?.error(`Failed to post collector failure heartbeat: ${errorMessage(heartbeatError)}`);
      });
    }
    throw error;
  } finally {
    if (writeQueue) {
      try {
        await writeQueue.flush("final", { persistOnFailure: true });
      } catch (error) {
        if (options.post) {
          await postCollectorHeartbeat("failed", options, {
            startedAt,
            finishedAt: new Date().toISOString(),
            failureCount: 1,
            message: errorMessage(error),
            details: {
              phase: "crawl-log-final-flush",
              targetCount: selectedTargets.length,
              groupCount: groups.length,
            },
          }).catch((heartbeatError) => {
            logger?.error(`Failed to post collector failure heartbeat: ${errorMessage(heartbeatError)}`);
          });
        }
        throw error;
      }
    }
  }

  try {
    if (writeQueue) writeQueue.throwIfFailed();
  } catch (error) {
    if (options.post) {
      await postCollectorHeartbeat("failed", options, {
        startedAt,
        finishedAt: new Date().toISOString(),
        failureCount: 1,
        message: errorMessage(error),
        details: {
          phase: "crawl-log-flush",
          targetCount: selectedTargets.length,
          groupCount: groups.length,
        },
      }).catch((heartbeatError) => {
        logger?.error(`Failed to post collector failure heartbeat: ${errorMessage(heartbeatError)}`);
      });
    }
    throw error;
  }

  const finishedAt = new Date().toISOString();
  const performance = buildCollectionPerformanceReport({
    summary,
    targets: selectedTargets,
    groups,
    concurrency,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
  });

  const result = {
    summary,
    performance,
    targetCount: selectedTargets.length,
    successCount: summary.filter((item) => item.status === "success").length,
    failureCount: summary.filter((item) => item.status !== "success" && item.status !== "skipped").length,
    skippedCount: summary.filter((item) => item.status === "skipped").length,
    offerCount: summary.reduce((sum, item) => sum + item.offers, 0),
    startedAt,
    finishedAt,
  };

  if (options.post) {
    await postCollectorHeartbeat(collectorHeartbeatStatusForResult(result), options, {
      startedAt,
      finishedAt,
      successCount: result.successCount,
      failureCount: result.failureCount,
      skippedCount: result.skippedCount,
      offerCount: result.offerCount,
      message: `Price collector finished: ${result.successCount} success, ${result.failureCount} failed, ${result.skippedCount} skipped.`,
      details: {
        targetCount: result.targetCount,
        durationMs: performance.durationMs,
        byKind: performance.byKind,
        byStatus: performance.byStatus,
      },
    }).catch((error) => {
      logger?.error(`Failed to post collector heartbeat: ${errorMessage(error)}`);
    });
  }

  return result;
}

async function collectOneTarget(target, options, logger, lockOwner, familyState, writeQueue = null) {
  const startedAt = Date.now();
  const collectionStartedAt = new Date(startedAt).toISOString();
  const skipped = (message) => ({
    sourceId: target.sourceId,
    source: target.sourceName,
    kind: target.kind,
    status: "skipped",
    offers: 0,
    attempts: 0,
    ms: Date.now() - startedAt,
    message,
  });

  const cooldown = cooldownSkipReason(target, options);
  if (cooldown) {
    logger?.log(`\n==> ${target.sourceName} [${target.kind}]`);
    logger?.log(`Skipped: ${cooldown.message}`);
    return skipped(cooldown.message);
  }

  const familySkip = collectionFamilySkipReason(target, familyState);
  if (familySkip) {
    logger?.log(`\n==> ${target.sourceName} [${target.kind}]`);
    logger?.log(`Skipped: ${familySkip.message}`);
    await postSkippedCrawlLog(target, familySkip, options, logger);
    return skipped(familySkip.message);
  }

  const lock = await acquireCollectionLock(target, lockOwner, options);
  if (!lock.acquired) {
    logger?.log(`\n==> ${target.sourceName} [${target.kind}]`);
    logger?.log(`Skipped: ${lock.message}`);
    return skipped(lock.message);
  }

  await waitForCollectionFamily(target, familyState, logger);
  markCollectionFamilyStarted(target, familyState);

  logger?.log(`\n==> ${target.sourceName} [${target.kind}]`);

  try {
    const collection = await collectTargetWithRetries(target, options, logger);
    const collectedAt = new Date().toISOString();
    const offers = collection.offers;
    const emptyFullSnapshot = !offers.length && isEmptyResultFullSnapshotTarget(target);
    const status = offers.length || emptyFullSnapshot ? "success" : "failed";
    const message = offers.length
      ? `HTTP collector found ${offers.length} offers after ${collection.attempts.length} attempt(s).`
      : emptyFullSnapshot
        ? `HTTP collector found no offers after ${collection.attempts.length} attempt(s); treating as a complete empty snapshot.`
        : `HTTP collector found no offers after ${collection.attempts.length} attempt(s).`;

    if (logger) printOfferPreview(offers);

    if (options.post) {
      const posted = await postCrawlLogBatched(target, offers, status, message, options, {
        collectionStartedAt,
        collectedAt,
        attempts: collection.attempts,
        maxAttempts: collection.maxAttempts,
        ...(collection.details || {}),
      }, writeQueue);
      if (posted.queued) {
        logger?.log(`Queued ${posted.successCount} offers for batched write.`);
      } else {
        logger?.log(
          `Posted ${posted.successCount} offers` +
            (posted.writtenCount !== undefined
              ? `, wrote ${posted.writtenCount}, refreshed ${posted.refreshedCount || 0}, unchanged ${posted.unchangedCount || 0}.`
              : "."),
        );
      }
    }

    recordCollectionFamilyResult(target, familyState, { status, message, attempts: collection.attempts });
    return {
      sourceId: target.sourceId,
      source: target.sourceName,
      kind: target.kind,
      status,
      offers: offers.length,
      attempts: collection.attempts.length,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    const collectedAt = new Date().toISOString();
    const message = errorMessage(error);
    const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
    logger?.error(`Failed: ${message}`);
    recordCollectionFamilyResult(target, familyState, { status: "failed", message, attempts, logger });

    if (options.post) {
      await postCrawlLog(target, [], "failed", message, options, {
        collectionStartedAt,
        collectedAt,
        attempts,
        maxAttempts: maxAttemptsFor(options),
      }).catch((postError) => {
        logger?.error(`Failed to post failure log: ${errorMessage(postError)}`);
      });
    }

    return {
      sourceId: target.sourceId,
      source: target.sourceName,
      kind: target.kind,
      status: "failed",
      offers: 0,
      attempts: attempts.length || maxAttemptsFor(options),
      ms: Date.now() - startedAt,
      message,
    };
  } finally {
    await releaseCollectionLock(target, lockOwner, logger);
  }
}

export async function probeSource(options = {}) {
  const sourceUrl = options.sourceUrl || options.entryUrl || options.url;
  if (!sourceUrl) throw new Error("Missing sourceUrl.");

  const sourceName = options.sourceName || options.name || sourceNameFromUrl(sourceUrl);
  const source = {
    id: options.sourceId || options.id || sourceIdFrom(sourceName, sourceUrl),
    name: sourceName,
    base_url: options.baseUrl || deriveBaseUrl(sourceUrl),
    entry_url: sourceUrl,
    collection_method: "http",
    collector_kind: options.collectorKind || options.kind || null,
  };
  const target = buildTarget(source, Array.isArray(options.rawOffers) ? options.rawOffers : []);
  const startedAt = Date.now();
  const limit = Math.max(1, Math.min(Number(options.limit || 12), 50));

  if (!target.kind) {
    const detected = shouldAutoDetectCollector(options)
      ? await detectCollectorByProbe(target, options)
      : null;
    if (detected?.offers?.length) {
      return probeSuccessResponse(detected.target, detected.offers, startedAt, limit, {
        attempts: detected.attempts,
        message: `自动试探成功，识别到 ${detected.target.kind} 采集器，采集到 ${detected.offers.length} 条报价。`,
      });
    }

    return {
      sourceId: target.sourceId,
      sourceName: target.sourceName,
      sourceUrl: target.sourceUrl,
      baseUrl: target.baseUrl,
      kind: null,
      status: "unsupported",
      offerCount: 0,
      offers: [],
      attempts: detected?.attempts || [],
      ms: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      message: detected?.attempts?.length
        ? "已尝试现有 HTTP 采集器，但没有识别到可比价商品；若渠道真实，请加入采集器待办，补解析脚本后重新试采集。"
        : "当前链接暂未识别到自动采集器。若渠道真实，请加入采集器待办，补解析脚本后重新试采集。",
    };
  }

  try {
    const offers = dedupeOffers(await collectTarget(target, options));
    if (offers.length || !shouldFallbackDetectCollector(options, target.kind)) {
      return probeSuccessResponse(target, offers, startedAt, limit);
    }

    const detected = await detectCollectorByProbe(target, options, [target.kind]);
    if (detected?.offers?.length) {
      return probeSuccessResponse(detected.target, detected.offers, startedAt, limit, {
        attempts: detected.attempts,
        message: `原解析器 ${target.kind} 返回空结果，已自动试出 ${detected.target.kind} 采集器，采集到 ${detected.offers.length} 条报价。`,
      });
    }

    return probeSuccessResponse(target, offers, startedAt, limit, { attempts: detected?.attempts || [] });
  } catch (error) {
    if (shouldFallbackDetectCollector(options, target.kind)) {
      const detected = await detectCollectorByProbe(target, options, [target.kind]);
      if (detected?.offers?.length) {
        return probeSuccessResponse(detected.target, detected.offers, startedAt, limit, {
          attempts: detected.attempts,
          message: `原解析器 ${target.kind} 失败，已自动试出 ${detected.target.kind} 采集器，采集到 ${detected.offers.length} 条报价。`,
        });
      }
    }

    return {
      sourceId: target.sourceId,
      sourceName: target.sourceName,
      sourceUrl: target.sourceUrl,
      baseUrl: target.baseUrl,
      kind: target.kind,
      status: "failed",
      offerCount: 0,
      offers: [],
      ms: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      message: errorMessage(error),
    };
  }
}

async function detectCollectorByProbe(target, options = {}, skipKinds = []) {
  const attempts = [];
  const skip = new Set(skipKinds.filter(Boolean));
  const candidates = collectorProbeCandidates(target).filter((kind) => !skip.has(kind));

  for (const kind of candidates) {
    const probeTarget = { ...target, kind, configuredKind: target.configuredKind || "auto" };
    const startedAt = Date.now();
    try {
      const offers = dedupeOffers(await collectTarget(probeTarget, { ...options, pageDelayMs: options.pageDelayMs ?? 0 }));
      attempts.push({
        kind,
        status: offers.length ? "success" : "empty",
        offerCount: offers.length,
        ms: Date.now() - startedAt,
      });
      if (offers.length) return { target: probeTarget, offers, attempts };
    } catch (error) {
      attempts.push({
        kind,
        status: "failed",
        offerCount: 0,
        ms: Date.now() - startedAt,
        message: errorMessage(error).slice(0, 240),
      });
    }
  }

  return { attempts };
}

function collectorProbeCandidates(target) {
  const candidates = [];
  const add = (kind) => {
    if (!candidates.includes(kind)) candidates.push(kind);
  };

  const url = safeUrl(target.sourceUrl);
  const text = `${target.sourceId} ${target.sourceName} ${target.sourceUrl}`.toLowerCase();
  if (shopTokenFromUrl(target.sourceUrl) || target.rawOffers.some((offer) => goodsKeyFromUrl(offer.url))) add("shopApi");
  if (text.includes("dujiao") || text.includes("独角")) add("dujiao");
  if (text.includes("kami") || text.includes("发卡")) add("kami");
  if (url?.pathname.match(/\/(?:product|products|goods|item)\//i)) add("genericHtml");

  for (const kind of AUTO_DETECT_COLLECTOR_KINDS) add(kind);
  return candidates;
}

function shouldAutoDetectCollector(options = {}) {
  return options.autoDetect !== false && options["auto-detect"] !== "false";
}

function shouldFallbackDetectCollector(options = {}, currentKind = null) {
  if (!shouldAutoDetectCollector(options)) return false;
  if (!currentKind || currentKind === "browser" || currentKind === "unsupported") return true;
  return options.fallbackDetect === true || options["fallback-detect"] === true;
}

function probeSuccessResponse(target, offers, startedAt, limit, extra = {}) {
  return {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    baseUrl: target.baseUrl,
    kind: target.kind,
    status: offers.length ? "success" : "empty",
    offerCount: offers.length,
    offers: offers.slice(0, limit),
    attempts: extra.attempts || [],
    ms: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
    message: extra.message || (offers.length
      ? `试采集成功，识别到 ${offers.length} 条报价。`
      : "已连接到采集器，但没有识别到可比价商品。"),
  };
}

export { loadTargets, selectTargets };

if (isCli()) {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const targets = await loadTargets();
    printTargetList(hasTargetFilters(args) ? selectTargets(targets, { ...args, all: true }) : targets);
    process.exit(0);
  }

  runPriceCollection({
    ...args,
    all: Boolean(args.all),
    post: Boolean(args.post),
  })
    .then((result) => {
      console.log("\nSummary");
      console.table(result.summary);
      printCollectionPerformance(result.performance);
    })
    .catch((error) => {
      console.error(errorMessage(error));
      process.exit(1);
    });
}

async function collectTarget(target, options = {}) {
  if (target.kind === "kami") return collectKamiLike(target, options);
  if (target.kind === "dujiao") return collectDujiaoNext(target);
  if (target.kind === "shopApi") return collectShopApi(target, options);
  if (target.kind === "xiaoheiwan") return collectXiaoheiwan(target);
  if (target.kind === "opensoraHtml") return collectOpensoraHtml(target);
  if (target.kind === "makerichHtml") return collectMakerichHtml(target);
  if (target.kind === "beibeiHtml") return collectBeibeiHtml(target);
  if (target.kind === "ikunloveApi") return collectIkunloveApi(target);
  if (target.kind === "getgptApi") return collectGetgptApi(target);
  if (target.kind === "publicProductsApi") return collectPublicProductsApi(target);
  if (target.kind === "shopUserProductsApi") return collectShopUserProductsApi(target, options);
  if (target.kind === "unicornHtml") return collectUnicornHtml(target, options);
  if (target.kind === "mooncakeCatalog") return collectMooncakeCatalog(target);
  if (target.kind === "blackcatWholesale") return collectBlackcatWholesale(target);
  if (target.kind === "genericHtml") return collectGenericHtml(target);

  throw new Error(`Unsupported collector kind: ${target.kind}`);
}

async function collectTargetWithRetries(target, options = {}, logger = null) {
  const maxAttempts = maxAttemptsFor(options);
  const attempts = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      const collected = await collectTarget(target, options);
      const collectionDetails = collected?.collectionDetails || null;
      const offers = dedupeOffers(collected);
      const message = offers.length ? `采集到 ${offers.length} 条报价。` : "采集结果为空。";
      attempts.push({
        attempt,
        status: offers.length ? "success" : "empty",
        offers: offers.length,
        ms: Date.now() - startedAt,
        message,
      });

      if (offers.length || isEmptyResultFullSnapshotTarget(target)) {
        return { offers, attempts, maxAttempts, details: collectionDetails };
      }

      lastError = new Error(message);
    } catch (error) {
      const message = errorMessage(error);
      attempts.push({
        attempt,
        status: "failed",
        offers: 0,
        ms: Date.now() - startedAt,
        message,
      });
      lastError = error;
    }

    if (attempt < maxAttempts) {
      if (shouldStopRetryingTarget(target, lastError)) break;

      const waitMs = retryDelayMs(attempt);
      logger?.log(`Retrying ${target.sourceName} in ${waitMs}ms (${attempt + 1}/${maxAttempts})...`);
      await delay(waitMs);
    }
  }

  const error = new Error(lastError ? errorMessage(lastError) : "采集失败。");
  error.attempts = attempts;
  throw error;
}

async function collectKamiLike(target, options = {}) {
  const offers = [];
  const base = target.baseUrl;

  for (let page = 1; page <= 10; page += 1) {
    await waitBetweenPages(options);
    const payload = await fetchJson(`${base}/user/api/index/commodity?limit=100&page=${page}`);
    const items = Array.isArray(payload.data) ? payload.data : [];
    if (!items.length) break;

    for (const item of items) {
      const title = cleanText(item.name);
      const price = numberOrNull(item.user_price ?? item.price);
      if (!title || price === null || isNonComparableTitle(title)) continue;

      const stockCount = numberOrNull(item.stock);
      const hidden = Number(item.hide || 0) !== 0;
      const disabled = Number(item.status ?? 1) !== 1 || hidden;
      const status = disabled ? "out_of_stock" : statusFromStock(stockCount);
      const categoryName = cleanText(item.category?.name || "");

      offers.push(
        makeOffer(target, {
          title,
          price,
          status,
          stockCount,
          url: kamiCommodityUrl(target, item.id),
          tags: compact([
            categoryName,
            item.delivery_way === 0 ? "自动发货" : null,
            hidden ? "隐藏商品" : null,
          ]),
        }),
      );
    }

    if (items.length < 100) break;
  }

  return offers;
}

async function collectDujiaoNext(target) {
  const payload = await fetchJson(`${target.baseUrl}/api/v1/public/products`);
  const products = Array.isArray(payload.data) ? payload.data : [];
  const offers = [];

  for (const product of products) {
    const productTitle = localized(product.title) || cleanText(product.slug);
    const skus = Array.isArray(product.skus) && product.skus.length ? product.skus : [null];

    skus.forEach((sku, index) => {
      const skuTitle = localized(sku?.title || sku?.name || sku?.label || sku?.spec);
      const title = cleanText(
        skuTitle && skuTitle !== productTitle
          ? `${productTitle} / ${skuTitle}`
          : skus.length > 1 && sku
            ? `${productTitle} / 规格${index + 1}`
            : productTitle,
      );
      const price = numberOrNull(sku?.price_amount ?? product.price_amount);
      if (!title || price === null || isNonComparableTitle(title)) return;

      const stockCount = numberOrNull(
        sku?.auto_stock_available ??
          sku?.manual_stock_available ??
          product.auto_stock_available ??
          product.manual_stock_available,
      );
      const isSoldOut = Boolean(sku?.is_sold_out ?? product.is_sold_out);
      const stockStatus = String(sku?.stock_status || product.stock_status || "");
      const status = isSoldOut || stockStatus === "out_of_stock" ? "out_of_stock" : statusFromStock(stockCount);
      const categoryName = localized(product.category?.name);

      offers.push(
        makeOffer(target, {
          title,
          price,
          status,
          stockCount,
          url: `${target.baseUrl}/products/${encodeURIComponent(String(product.slug || product.id))}`,
          tags: compact([
            categoryName,
            product.fulfillment_type === "auto" ? "自动发货" : null,
            product.fulfillment_type === "manual" ? "人工处理" : null,
          ]),
        }),
      );
    });
  }

  return offers;
}

async function collectShopApi(target, options = {}) {
  const base = target.baseUrl;
  const tokens = await discoverShopTokens(target, options);
  const offers = [];
  const rawSeenOfferIds = new Set();
  const partialReasons = [];
  let fetchedItemCount = 0;
  let publishedItemCount = 0;
  let reportedGoodsCount = 0;
  let hasReportedGoodsCount = false;

  if (!tokens.length) {
    throw new Error("No shop token found. Need at least one /shop/<token> or /item/<goods_key> URL.");
  }

  for (const token of tokens) {
    const shopInfo = await postJson(`${base}/shopApi/Shop/info`, { token, category_key: "" }, `${base}/shop/${token}`);
    if (shopInfo.code !== 1 || !shopInfo.data) {
      partialReasons.push(`Shop info unavailable for token ${token}.`);
      continue;
    }

    const shopAvailability = shopApiShopAvailability(shopInfo.data);
    const storeName = cleanText(shopInfo.data.nickname || target.sourceStoreName || target.sourceName);
    const sourceUrl = shopInfo.data.link || `${base}/shop/${token}`;
    const shopCreatedAt = timestampFromShopApiValue(shopInfo.data.create_time);
    const defaultChannelId = await getShopApiDefaultChannelId(base, token, sourceUrl, options);
    const categoriesPayload = await postJson(
      `${base}/shopApi/Shop/categoryList`,
      { token, goods_type: "card", category_key: "" },
      sourceUrl,
    );
    if (categoriesPayload.code !== 1 || !Array.isArray(categoriesPayload.data)) {
      partialReasons.push(`Category list unavailable for token ${token}.`);
    }
    const categories = Array.isArray(categoriesPayload.data) ? categoriesPayload.data : [];
    const selectedCategories = categories.filter((category) => Number(category.goods_count || 0) > 0 && Number(category.id) !== 0);
    const categoryIds = selectedCategories.length
      ? selectedCategories.map((category) => Number(category.id))
      : categories.some((category) => Number(category.id) === 0)
        ? [0]
        : [];

    for (const categoryId of categoryIds) {
      const expectedItemCount = reportedGoodsCountForCategory(categories, selectedCategories, categoryId);
      let categoryFetchedItemCount = 0;
      if (expectedItemCount !== null) {
        reportedGoodsCount += expectedItemCount;
        hasReportedGoodsCount = true;
      }

      for (let page = 1; page <= 10; page += 1) {
        await waitBetweenPages(options);
        const listPayload = await postJson(
          `${base}/shopApi/Shop/goodsList`,
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
        if (listPayload.code !== 1 || !Array.isArray(listPayload.data?.list)) {
          partialReasons.push(`Goods list unavailable for category ${categoryId} page ${page}.`);
          break;
        }

        const items = listPayload.data.list;
        if (!items.length) break;
        fetchedItemCount += items.length;
        categoryFetchedItemCount += items.length;
        if (page === 10 && items.length >= 100) {
          partialReasons.push(`Category ${categoryId} reached page cap 10.`);
        }

        for (const item of items) {
          const itemUrl = item.link || (item.goods_key ? `${base}/item/${item.goods_key}` : "");
          const rawSeenOfferId = stableShopApiOfferIdFromUrl(itemUrl);
          if (rawSeenOfferId) rawSeenOfferIds.add(rawSeenOfferId);

          const title = cleanText(item.name);
          const listedPrice = numberOrNull(item.price ?? item.real_price);
          if (!title || listedPrice === null || isNonComparableTitle(title)) continue;

          const stockCount = numberOrNull(item.extend?.stock_count);
          const minOrderQuantity = shopApiMinOrderQuantity(item.extend?.limit_count);
          const bulkPricingTiers = shopApiBulkPricingTiers(item.multipleoffers);
          const status = Number(item.status ?? 1) !== 1 ? "out_of_stock" : statusFromStock(stockCount);
          const categoryName = cleanText(item.category?.name || "");
          const effectivePrice = await resolveShopApiEffectivePrice({
            base,
            goodsKey: item.goods_key,
            listedPrice,
            channelId: defaultChannelId,
            referer: item.link || sourceUrl,
            options,
          });

          offers.push(
            makeOffer(
              {
                ...target,
                sourceUrl,
                sourceEntryUrl: sourceUrl,
                sourceStoreName: storeName,
                sourceShopCreatedAt: shopCreatedAt,
              },
              {
                title,
                price: effectivePrice.price,
                listedPrice: effectivePrice.listedPrice,
                feeAmount: effectivePrice.feeAmount,
                priceBasis: effectivePrice.priceBasis,
                status,
                effectiveStatus: shopAvailability.closed ? "unavailable" : "available",
                failureReason: shopAvailability.closed ? shopAvailability.reason : null,
                stockCount,
                minOrderQuantity,
                bulkPricingTiers,
                url: itemUrl,
                tags: compact([
                  categoryName,
                  item.goods_type === "card" ? "卡密" : null,
                  item.extend?.send_order === 0 ? "自动发货" : null,
                ]),
              },
            ),
          );
          publishedItemCount += 1;
        }

        if (items.length < 100) break;
      }

      if (expectedItemCount !== null && categoryFetchedItemCount !== expectedItemCount) {
        partialReasons.push(
          `Category ${categoryId} reported ${expectedItemCount} goods but fetched ${categoryFetchedItemCount}.`,
        );
      }
    }
  }

  offers.collectionDetails = {
    fullSnapshot: partialReasons.length === 0,
    seenOfferIds: Array.from(rawSeenOfferIds),
    rawSeenOfferCount: rawSeenOfferIds.size,
    fetchedItemCount,
    publishedItemCount,
    reportedGoodsCount: hasReportedGoodsCount ? reportedGoodsCount : null,
    partialReason: partialReasons.join(" "),
  };

  return offers;
}

function reportedGoodsCountForCategory(categories, selectedCategories, categoryId) {
  const category =
    selectedCategories.find((item) => Number(item.id) === Number(categoryId)) ||
    categories.find((item) => Number(item.id) === Number(categoryId));
  const value = Number(category?.goods_count);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

async function getShopApiDefaultChannelId(base, token, referer, options = {}) {
  await waitBetweenPages(options);
  const payload = await postJson(
    `${base}/shopApi/Shop/getUserChannel`,
    { token },
    referer,
  ).catch(() => null);

  const channels = Array.isArray(payload?.data) ? payload.data : [];
  const defaultChannel =
    channels.find((channel) => Number(channel.status ?? 1) === 1 && Number(channel.custom_status ?? 1) === 1) ||
    channels[0];
  const channelId = numberOrNull(defaultChannel?.id);
  return channelId === null ? 0 : channelId;
}

async function resolveShopApiEffectivePrice({ base, goodsKey, listedPrice, channelId, referer, options = {} }) {
  if (!goodsKey) {
    return {
      price: listedPrice,
      listedPrice,
      feeAmount: null,
      priceBasis: "listed_fallback",
    };
  }

  await waitBetweenPages(options);
  const payload = await postJson(
    `${base}/shopApi/Shop/getGoodsPrice`,
    {
      goods_key: goodsKey,
      quantity: 1,
      coupon_code: "",
      channel_id: channelId ?? 0,
    },
    referer,
  ).catch(() => null);

  const totalAmount = numberOrNull(payload?.data?.total_amount);
  if (payload?.code === 1 && totalAmount !== null) {
    const originalAmount = numberOrNull(payload.data.original_amount) ?? listedPrice;
    return {
      price: totalAmount,
      listedPrice: originalAmount,
      feeAmount: numberOrNull(payload.data.fee),
      priceBasis: "settled",
    };
  }

  return {
    price: listedPrice,
    listedPrice,
    feeAmount: null,
    priceBasis: "listed_fallback",
  };
}

function shopApiMinOrderQuantity(value) {
  const quantity = numberOrNull(value);
  return Number.isInteger(quantity) && quantity > 1 ? quantity : null;
}

function shopApiBulkPricingTiers(multipleOffers) {
  if (!multipleOffers || Number(multipleOffers.available ?? 0) !== 1 || !Array.isArray(multipleOffers.rules)) {
    return [];
  }

  const discountType = numberOrNull(multipleOffers.discount_type);
  return multipleOffers.rules
    .map((rule) => {
      const minQuantity = numberOrNull(rule?.condition);
      const value = numberOrNull(rule?.value);
      if (!Number.isInteger(minQuantity) || minQuantity < 1 || value === null) return null;

      return {
        minQuantity,
        value,
        ...(discountType === null ? {} : { discountType }),
      };
    })
    .filter(Boolean);
}

async function collectXiaoheiwan(target) {
  const products = await fetchJson(`${target.baseUrl}/api/products`);
  const items = Array.isArray(products) ? products : [];

  return items
    .map((item) => {
      const title = cleanText(item.name);
      const price = numberOrNull(item.price ?? item.original_price);
      if (!title || price === null || isNonComparableTitle(title)) return null;

      const stockCount = numberOrNull(item.stock ?? item.stock_count ?? item.count);
      const status = String(item.status || "").toLowerCase() === "active" ? statusFromStock(stockCount) : "out_of_stock";

      return makeOffer(target, {
        title,
        price,
        status,
        stockCount,
        url: `${target.baseUrl}/purchase`,
        tags: compact([item.sku, "官方接口"]),
      });
    })
    .filter(Boolean);
}

async function collectOpensoraHtml(target) {
  const html = await fetchText(target.sourceUrl);
  const pattern =
    new RegExp(String.raw`<img[^>]+alt=["']([^"']+)["'][\s\S]*?<strong>\s*${PRICE_VALUE_PATTERN}\s*<\/strong>[\s\S]*?库存[:：]\s*(\d+)[\s\S]*?<a[^>]+href=["']([^"']*\/buy\/\d+[^"']*)["']`, "gi");
  const offers = [];
  let match;

  while ((match = pattern.exec(html))) {
    const body = html.slice(match.index, pattern.lastIndex);
    const heading = body.match(/<h6 class="card-title[^"]*">\s*([\s\S]*?)<\/h6>/i)?.[1];
    const title = cleanText(heading || match[1]);
    const price = numberOrNull(match[2]);
    const stockCount = numberOrNull(match[3]);
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const near = html.slice(Math.max(0, match.index - 600), pattern.lastIndex + 200);

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: statusFromStock(stockCount),
        stockCount,
        url: absolutize(match[4], target.baseUrl),
        tags: compact([
          near.includes("人工处理") ? "人工处理" : null,
          near.includes("自动发货") ? "自动发货" : null,
        ]),
      }),
    );
  }

  return offers;
}

async function collectMakerichHtml(target) {
  const html = await fetchText(target.sourceUrl);
  const blocks = [...html.matchAll(/<a[^>]+href=["']([^"']*(?:\/item\?id=\d+|\/item\/[^"']+))["'][\s\S]*?<\/a>/gi)];
  const offers = [];

  for (const block of blocks) {
    const body = stripHtml(block[0]);
    const priceMatch = body.match(CURRENCY_PRICE_RE);
    const stockMatch = body.match(/库存[:：]\s*(\d+)/);
    if (!priceMatch) continue;

    const price = numberOrNull(priceMatch[1]);
    const stockCount = stockMatch ? numberOrNull(stockMatch[1]) : null;
    const title = cleanText(
      body
        .replace(CURRENCY_PRICE_RE, "")
        .replace(/库存[:：]\s*\d+/, "")
        .replace(/销量[:：]\s*\d+/g, ""),
    );
    if (!title || price === null || isNonComparableTitle(title)) continue;

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: statusFromStock(stockCount),
        stockCount,
        url: absolutize(block[1], target.baseUrl),
        tags: [],
      }),
    );
  }

  return offers;
}

async function collectBeibeiHtml(target) {
  const html = await fetchText(target.sourceUrl);
  const blocks = [...html.matchAll(/<article class="atelier-catalog-card[\s\S]*?<\/article>/gi)];
  const offers = [];

  for (const block of blocks) {
    const body = block[0];
    const title = cleanText(body.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1]);
    const price = numberOrNull(body.match(CURRENCY_PRICE_RE)?.[1]);
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const stockMatch = body.match(/库存\s*(\d+)/);
    const soldOut = /sold-out|售罄|已售罄|action-disabled/i.test(body);
    const stockCount = soldOut ? 0 : numberOrNull(stockMatch?.[1]);
    const checkoutUrl = body.match(/href=["']([^"']*\/checkout\/[^"']+)["']/i)?.[1];
    const detailUrl = body.match(/href=["']([^"']*\/products\/[^"']+)["']/i)?.[1];
    const tags = [...body.matchAll(/<span class="atelier-pill[^"]*">([\s\S]*?)<\/span>/gi)].map((match) =>
      cleanText(match[1]),
    );

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: soldOut ? "out_of_stock" : statusFromStock(stockCount),
        stockCount,
        url: absolutize(checkoutUrl || detailUrl || target.sourceUrl, target.baseUrl),
        tags,
      }),
    );
  }

  return offers;
}

async function collectIkunloveApi(target) {
  const payload = await fetchJson(`${target.baseUrl}/api/shop/products`);
  const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
  const offers = [];

  for (const product of products) {
    const title = cleanText(product.title);
    const price = numberOrNull(product.priceCents) === null ? null : numberOrNull(product.priceCents) / 100;
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const stockCount = numberOrNull(product.stockCount);
    const hidden = product.isDeleted === true || product.isActive === false;
    const status = hidden ? "out_of_stock" : statusFromStock(stockCount);
    const detailUrl = product.purchaseGuideUrl || product.consolePath || product.tutorialPath || target.sourceUrl;

    offers.push(
      makeOffer(target, {
        title,
        price,
        status,
        stockCount,
        url: absolutize(detailUrl, target.baseUrl),
        tags: compact([
          product.category,
          product.badge,
          product.isActive === false ? "已下架" : null,
          product.isDeleted === true ? "已删除" : null,
        ]),
      }),
    );
  }

  return offers;
}

async function collectGetgptApi(target) {
  const payload = await fetchJson("https://gpt.how2cs.cn/api/order/prices");
  const products = [
    {
      title: "ChatGPT Plus 充值",
      price: payload.gptplus_amount ?? payload.amount,
      originalPrice: payload.gptplus_original_amount ?? payload.original_amount,
      path: "/plus-price",
    },
    {
      title: "ChatGPT Pro 充值",
      price: payload.gptpro_amount,
      originalPrice: payload.gptpro_original_amount,
      path: "/gptpro",
    },
    {
      title: "ChatGPT Pro Lite 充值",
      price: payload.gptprolite_amount,
      originalPrice: payload.gptprolite_original_amount,
      path: "/gptpro",
    },
    {
      title: "ChatGPT Team / Business 充值",
      price: payload.team_amount,
      originalPrice: payload.team_original_amount,
      path: "/price",
    },
    {
      title: "Claude 充值",
      price: payload.claude_amount,
      originalPrice: payload.claude_original_amount,
      path: "/",
    },
  ];

  return products
    .map((product) => {
      const price = numberOrNull(product.price);
      if (price === null) return null;

      return makeOffer(target, {
        title: product.title,
        price,
        status: "in_stock",
        stockCount: null,
        url: absolutize(product.path, target.baseUrl),
        tags: compact([product.originalPrice ? `原价 ${product.originalPrice}` : null, "官方接口"]),
      });
    })
    .filter(Boolean);
}

async function collectPublicProductsApi(target) {
  const payload = await fetchJson(`${target.baseUrl}/api/products`);
  const products = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.products)
      ? payload.products
      : Array.isArray(payload.data?.products)
        ? payload.data.products
        : [];

  return products
    .map((product) => {
      const title = cleanText(
        product.display_name || product.displayName || product.name || product.productName || product.title,
      );
      const price = numberOrNull(product.price_cny ?? product.priceCny ?? product.price ?? product.amount);
      if (!title || price === null || isNonComparableTitle(title)) return null;

      const stockCount = numberOrNull(product.stock ?? product.stock_count ?? product.stockCount);
      const hidden = product.is_hidden === true || product.hidden === true || product.isVisible === false;
      const disabled = hidden || Number(product.status ?? 1) === 0;
      const tags = compact([
        product.project_title || product.projectTitle || product.project,
        product.group_name || product.groupName,
        product.delivery_label || product.deliveryLabel,
        product.product_type || product.productType,
        ...(Array.isArray(product.tags)
          ? product.tags.map((tag) => typeof tag === "string" ? tag : tag?.text || tag?.name)
          : []),
      ]);

      return makeOffer(target, {
        title,
        price,
        status: disabled ? "out_of_stock" : statusFromStock(stockCount),
        stockCount,
        url: publicProductUrl(target, product),
        tags,
      });
    })
    .filter(Boolean);
}

async function collectShopUserProductsApi(target, options = {}) {
  const offers = [];

  for (let page = 1; page <= 10; page += 1) {
    await waitBetweenPages(options);
    const payload = await fetchJson(`${target.baseUrl}/shop/user/products?page=${page}&size=100&productName=`);
    const records = Array.isArray(payload.data?.records) ? payload.data.records : [];
    if (!records.length) break;

    for (const product of records) {
      const title = cleanText(product.productName || product.name || product.title);
      const price = numberOrNull(product.price ?? product.salePrice);
      if (!title || price === null || isNonComparableTitle(title)) continue;

      const stockCount = numberOrNull(product.stock);
      const hidden = Number(product.isVisible ?? 1) !== 1 || Number(product.status ?? 1) !== 1;

      offers.push(
        makeOffer(target, {
          title,
          price,
          status: hidden ? "out_of_stock" : statusFromStock(stockCount),
          stockCount,
          url: `${target.baseUrl}/product/${encodeURIComponent(String(product.id))}`,
          tags: compact([product.category, product.cardType, product.isHot ? "热门" : null]),
        }),
      );
    }

    if (records.length < 100) break;
  }

  return offers;
}

async function collectUnicornHtml(target, options = {}) {
  const html = await fetchText(target.sourceUrl);
  const blocks = [...html.matchAll(/<div class="card position-relative">[\s\S]*?(?=<div class="col">|<!-- goods end -->|<\/section>|<\/body>)/gi)];
  const cardOffers = [];

  for (const block of blocks) {
    const body = block[0];
    const title = cleanText(body.match(/<h6[^>]*class=["'][^"']*card-title[^"']*["'][^>]*>([\s\S]*?)<\/h6>/i)?.[1]);
    const price = numberOrNull(body.match(/<strong>\s*([^<]+?)\s*<\/strong>/i)?.[1]);
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const stockCount = numberOrNull(body.match(/库存[:：]\s*(\d+)/)?.[1]);
    const soldOut = /缺货|售罄|已售罄|disabled|btn-secondary/i.test(body) || stockCount === 0;
    const href = body.match(/<a[^>]+href=["']([^"']*(?:\/buy\/\d+|\/product\/\d+)[^"']*)["']/i)?.[1];
    const url = absolutize(href || target.sourceUrl, target.baseUrl);

    cardOffers.push({
      title,
      price,
      status: soldOut ? "out_of_stock" : statusFromStock(stockCount),
      stockCount: soldOut ? 0 : stockCount,
      url,
      tags: compact([
        /自动发货/.test(body) ? "自动发货" : null,
        /人工处理/.test(body) ? "人工处理" : null,
        "页面解析",
      ]),
    });
  }

  const uniqueCardOffers = [...new Map(cardOffers.map((offer) => [offer.url, offer])).values()];
  const expandedOffers = (await runWithConcurrency(
    uniqueCardOffers,
    unicornDetailConcurrencyFor(options),
    async (cardOffer) => {
      const skus = await fetchUnicornSkus(cardOffer.url).catch(() => []);
      if (!skus.length) {
        return [makeOffer(target, cardOffer)];
      }

      return skus.map((sku) =>
        makeOffer(target, {
          ...cardOffer,
          title: cleanText(`${cardOffer.title} / ${sku.name}`),
          price: sku.price,
          tags: compact([...cardOffer.tags, "规格价"]),
        }),
      );
    },
  )).flat();

  return dedupeOffers(expandedOffers);
}

async function fetchUnicornSkus(url) {
  if (!/\/buy\/\d+/i.test(url)) return [];

  const html = await fetchText(url);
  const skus = [];
  const pattern = /onclick=["']selectSku\((['"])((?:\\.|(?!\1).)*?)\1\s*,\s*(['"])([\d.,]+)\3/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const name = cleanText(decodeHtmlEntities(match[2].replace(/\\(['"\\])/g, "$1")));
    const price = numberOrNull(match[4]);
    if (!name || price === null) continue;
    skus.push({ name, price });
  }

  return skus;
}

function unicornDetailConcurrencyFor(options = {}) {
  const value = Number(options.unicornDetailConcurrency || options["unicorn-detail-concurrency"] || 4);
  if (!Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(Math.trunc(value), 8));
}

async function collectMooncakeCatalog(target) {
  const js = await fetchText(`${target.baseUrl}/mooncake-official-media/catalog.js`);
  const jsonText = js.match(/window\.MOONCAKE_CATALOG\s*=\s*([\s\S]*?);\s*(?:window\.|$)/)?.[1];
  if (!jsonText) throw new Error("Mooncake catalog data not found.");

  let categories;
  try {
    categories = JSON.parse(jsonText);
  } catch {
    throw new Error("Mooncake catalog JSON parse failed.");
  }

  const offers = [];
  for (const category of Array.isArray(categories) ? categories : []) {
    const categoryName = cleanText(category.name);
    for (const item of Array.isArray(category.items) ? category.items : []) {
      const title = cleanText(item.name);
      const price = numberOrNull(item.price);
      if (!title || price === null || isNonComparableTitle(title)) continue;
      const stockCount = numberOrNull(item.stock);

      offers.push(
        makeOffer(target, {
          title,
          price,
          status: statusFromStock(stockCount),
          stockCount,
          url: `${target.baseUrl}/#item-${encodeURIComponent(String(item.id))}`,
          tags: compact([categoryName, item.delivery_way === 0 ? "自动发货" : null]),
        }),
      );
    }
  }

  return offers;
}

async function collectBlackcatWholesale(target) {
  const products = await fetchBlackcatWholesaleProducts(target);
  const tab = blackcatSelectedTab(target);
  const offers = [];

  for (const product of products) {
    if (product?.is_archived === true) continue;
    if (product?.active === false || product?.is_active === false) continue;
    if (product?.is_wholesale_active === false) continue;

    const category = cleanText(product.category);
    if (tab && category.toLowerCase() !== tab.toLowerCase()) continue;

    const title = cleanText(product.wholesale_name || product.name || product.title);
    const price = blackcatPrice(product);
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const rawStockCount = numberOrNull(product.stock_count ?? product.stockCount ?? product.stock);
    const stockCount = typeof rawStockCount === "number" && rawStockCount >= 0 ? rawStockCount : null;
    const status = rawStockCount === 0 ? "out_of_stock" : statusFromStock(stockCount);

    offers.push(
      makeOffer(target, {
        title,
        price,
        status,
        stockCount,
        url: blackcatProductUrl(target, product),
        tags: compact([
          category,
          product.badge,
          product.delivery_type === "static" ? "自动发货" : null,
          product.delivery_category,
          "BlackCat",
        ]),
      }),
    );
  }

  return dedupeOffers(offers).slice(0, 200);
}

async function fetchBlackcatWholesaleProducts(target) {
  const actionId = "00a331b1067730509e93f1d2510d15a4c140650760";
  const response = await safeFetch(target.sourceUrl, {
    method: "POST",
    headers: {
      ...defaultHeaders(target.sourceUrl),
      accept: "text/x-component",
      "content-type": "text/plain;charset=UTF-8",
      "next-action": actionId,
      origin: target.baseUrl,
      referer: target.sourceUrl,
    },
    body: "[]",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${target.sourceUrl} returned HTTP ${response.status}`);

  const payload = parseNextActionData(await response.text());
  if (payload?.success === false) {
    throw new Error(cleanText(payload.error || payload.message) || "BlackCat product action failed.");
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error("BlackCat product action did not return a product list.");
  }

  return payload.data;
}

function parseNextActionData(text) {
  for (const line of String(text || "").split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;

    const rawPayload = line.slice(separatorIndex + 1).trim();
    if (!rawPayload.startsWith("{")) continue;

    try {
      const payload = JSON.parse(rawPayload);
      if (payload && typeof payload === "object" && ("data" in payload || "success" in payload)) return payload;
    } catch {
      // Ignore non-data React transport chunks.
    }
  }

  throw new Error("Next action response did not include JSON data.");
}

function blackcatSelectedTab(target) {
  const parsed = safeUrl(target.sourceUrl);
  const tab = cleanText(parsed?.searchParams.get("tab") || "");
  return tab && !/^all$/i.test(tab) ? tab : "";
}

function blackcatPrice(product) {
  const tierPrice = blackcatBulkTierPrice(product.bulk_tiers_wholesale);
  return tierPrice ?? numberOrNull(product.wholesale_price ?? product.price);
}

function blackcatBulkTierPrice(value) {
  let tiers = value;
  if (typeof tiers === "string") {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = null;
    }
  }

  if (!Array.isArray(tiers)) return null;
  const prices = tiers
    .map((tier) => numberOrNull(tier?.unitPrice ?? tier?.unit_price ?? tier?.price))
    .filter((price) => price !== null);
  return prices.length ? Math.min(...prices) : null;
}

function blackcatProductUrl(target, product) {
  const parsed = safeUrl(target.sourceUrl) || safeUrl(`${target.baseUrl}/blackcat`);
  if (!parsed) return target.sourceUrl;

  const category = cleanText(product.category);
  if (category && !parsed.searchParams.get("tab")) parsed.searchParams.set("tab", category);
  if (product.id) parsed.hash = `product-${encodeURIComponent(String(product.id))}`;
  return parsed.toString();
}

function decodeKnownEncryptedHtml(html) {
  const text = String(html || "");
  if (!/CryptoJS|AES\.decrypt/i.test(text)) return null;

  const key = text.match(/var\s+_0x[a-f0-9]+\s*=\s*\[\s*["']([A-Za-z0-9]{16,32})["']/i)?.[1];
  const ciphertext = text.match(/["']VvdIy["']\s*:\s*["']([^"']+)["']/)?.[1];
  if (!key || !ciphertext) return null;

  const keyBuffer = Buffer.from(key, "utf8");
  if (![16, 24, 32].includes(keyBuffer.length)) return null;

  try {
    const decipher = crypto.createDecipheriv(`aes-${keyBuffer.length * 8}-cbc`, keyBuffer, keyBuffer.subarray(0, 16));
    const decoded = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return /<html|<body|class=["'][^"']*(?:shop-item|product)/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function collectGenericHtml(target) {
  const rawHtml = await fetchText(target.sourceUrl);
  const html = decodeKnownEncryptedHtml(rawHtml) || rawHtml;
  const cardOffers = collectGenericHtmlProductCards(target, html);
  if (cardOffers.length >= 2) return dedupeOffers(cardOffers).slice(0, 200);

  const pageTitle = cleanPageTitle(html);
  const text = stripHtml(html)
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const matches = [...text.matchAll(new RegExp(String.raw`[¥￥]\s*${PRICE_VALUE_PATTERN}`, "g"))];
  const offers = [];
  let previousPriceEnd = 0;
  const singleProductPage = isLikelySingleProductPage(target.sourceUrl, matches.length);

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const price = numberOrNull(match[0]);
    if (price === null) continue;

    const segment = text.slice(previousPriceEnd, match.index);
    const nextPriceIndex = matches[index + 1]?.index ?? Math.min(text.length, match.index + 260);
    const after = text.slice(match.index + match[0].length, nextPriceIndex);
    previousPriceEnd = match.index + match[0].length;

    const title = singleProductPage
      ? pageTitle || titleFromGenericSegment(segment, price)
      : titleFromGenericSegment(segment, price);
    if (!title || isNonComparableTitle(title)) continue;
    if (/合计|支付|订单|充值金额|余额|声明|举证|预览/.test(title)) continue;

    const context = `${segment} ${after}`;
    const stockCount = stockFromGenericContext(context);
    const soldOut = /缺货|已售罄|售罄|无货/.test(context) || stockCount === 0;

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: soldOut ? "out_of_stock" : statusFromStock(stockCount),
        stockCount: soldOut ? 0 : stockCount,
        url: `${target.sourceUrl.replace(/#.*$/, "")}#offer-${offers.length + 1}`,
        tags: compact([
          /自动发货/.test(context) ? "自动发货" : null,
          /人工/.test(context) ? "人工处理" : null,
          "页面解析",
        ]),
      }),
    );
    if (singleProductPage) break;
  }

  return dedupeOffers(offers).slice(0, 200);
}

function collectGenericHtmlProductCards(target, html) {
  const offers = [];
  const cards = extractGenericProductCards(html);

  for (const card of cards) {
    const price = priceFromGenericProductCard(card);
    if (price === null) continue;

    const title = titleFromGenericProductCard(card);
    if (!title || isNonComparableTitle(title)) continue;

    const context = stripHtml(card);
    const stockCount = stockFromGenericContext(context);
    const soldOut = /缺货|已售罄|售罄|无货/.test(context) || stockCount === 0;
    const detailUrl = genericProductCardUrl(card, target);

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: soldOut ? "out_of_stock" : statusFromStock(stockCount),
        stockCount: soldOut ? 0 : stockCount,
        url: detailUrl,
        tags: compact([
          ...genericProductCardTags(card),
          /自动发货/.test(context) ? "自动发货" : null,
          /人工/.test(context) ? "人工处理" : null,
          "商品卡片解析",
        ]),
      }),
    );
  }

  return offers;
}

function extractGenericProductCards(html) {
  const source = String(html || "");
  const patterns = [
    /<article\b[\s\S]*?<\/article>/gi,
    /<a\b(?=[^>]*class=["'][^"']*(?:df-product-card|shop-item)[^"']*["'])[\s\S]*?<\/a>/gi,
  ];
  const cards = [];
  const seen = new Set();

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const card = match[0];
      if (seen.has(card)) continue;
      seen.add(card);
      cards.push(card);
    }
  }

  return cards;
}

function priceFromGenericProductCard(card) {
  const priceBlock = genericClassText(card, [
    "df-product-price",
    "shop-item-price",
    "product-price",
    "price",
    "amount",
    "money",
  ]);
  const candidates = [priceBlock, stripHtml(card)];

  for (const candidate of candidates) {
    const text = String(candidate || "");
    const currencyMatch = text.match(CURRENCY_PRICE_RE);
    if (currencyMatch) return numberOrNull(currencyMatch[0]);

    const suffixMatch = text.match(SUFFIX_PRICE_RE);
    if (suffixMatch) return numberOrNull(suffixMatch[0]);
  }

  return null;
}

function titleFromGenericProductCard(card) {
  const namedTitle = genericClassText(card, [
    "df-product-name",
    "shop-item-name",
    "product-title",
    "product-name",
    "title",
  ]);
  const titleAttr = cleanText(card.match(/\btitle=["']([^"']+)["']/i)?.[1]);
  const heading = cleanText(card.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1]);
  const imageAlt = cleanText(card.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1]);
  const highlight = cleanText(
    card.match(/<p[^>]+class=["'][^"']*(?:highlight|subtitle|summary|description)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1],
  );
  const description = genericProductCardParagraphs(card).find((paragraph) => paragraph !== highlight) || "";

  return compact([namedTitle || titleAttr || heading || imageAlt, highlight, description]).join(" ").slice(0, 180);
}

function genericClassText(card, classNames) {
  const classPattern = classNames.map(escapeRegExp).join("|");
  const match = String(card || "").match(
    new RegExp(String.raw`<[^>]+class=["'][^"']*(?:${classPattern})[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>`, "i"),
  );
  return cleanText(match?.[1]);
}

function genericProductCardParagraphs(card) {
  return [...card.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/gi)]
    .filter((match) => !/class=["'][^"']*(?:highlight|subtitle|summary|price|stock|badge)[^"']*["']/i.test(match[1] || ""))
    .map((match) => cleanText(match[2]))
    .filter(Boolean);
}

function genericProductCardTags(card) {
  const tagBlock = card.match(/<div[^>]+class=["'][^"']*(?:tags|category|badge)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  return [...tagBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
    .slice(0, 4);
}

function genericProductCardUrl(card, target) {
  const hrefs = [...card.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const preferred =
    hrefs.find((href) => /\/products?\//i.test(href)) ||
    hrefs.find((href) => /\/(?:checkout|buy|item|goods)\//i.test(href)) ||
    hrefs.find(Boolean);

  return absolutize(preferred || `${target.sourceUrl.replace(/#.*$/, "")}#offer-${Math.max(1, hrefs.length)}`, target.baseUrl);
}

function titleFromGenericSegment(value, price = null) {
  let text = cleanText(value)
    .replace(/(?:库存|销量|已售)\s*\d+/g, " ")
    .replace(/\d+\s*件现货/g, " ")
    .replace(/\b(?:价格|售价|自动发货|人工处理)\b\s*$/g, " ")
    .replace(/价格\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let matchedDetailTitle = false;
  const detailMatch = text.match(/(.{4,220}?)(?:\s*(?:自动发货|人工处理))?\s*库存[:：]\s*\d+\s*(?:价格[:：]?)?$/);
  if (detailMatch) {
    const candidate = detailMatch[1]
      .split(/(?:购买商品|查询订单|补货通知|友情提醒|QQ[:：]|TG|-->|在线客服)/)
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (candidate && candidate.length >= 4) {
      text = candidate;
      matchedDetailTitle = true;
    }
  }

  const markers = [
    "立即下单 查看详情",
    "查看并购买",
    "shopping_bag",
    "自动发货",
    "人工处理",
    "全部商品",
    "商品列表",
  ];
  let markerIndex = -1;
  let markerLength = 0;
  for (const marker of markers) {
    const index = text.lastIndexOf(marker);
    const nextChar = index >= 0 ? text.slice(index + marker.length, index + marker.length + 1) : "";
    if ((marker === "自动发货" || marker === "人工处理") && /[】\]]/.test(nextChar)) continue;
    if ((marker === "自动发货" || marker === "人工处理") && !text.slice(index + marker.length).trim()) continue;
    if (index >= markerIndex) {
      markerIndex = index;
      markerLength = marker.length;
    }
  }
  if (markerIndex >= 0) text = text.slice(markerIndex + markerLength);

  text = text
    .split(/\s+/)
    .filter((token) => token && numberOrNull(token) !== price)
    .join(" ");

  text = text
    .replace(/^(?:热门|推荐|设计向|全部|进入分类)\s+/g, "")
    .replace(/^(?:AP|C|G|X|IN|TE)\s+/g, "")
    .replace(/^(ChatGPT|GPT|Claude|Grok|Gemini|OpenAI)\s+\1/gi, "$1")
    .replace(/(?:充值到自己账号|成品号|卡密发货|推荐|热销|价格)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!matchedDetailTitle) {
    const productNameMatch = text.match(
      /((?:ChatGPT|GPT|Claude|Grok|Gemini|OpenAI|Google|Gmail|Outlook|Telegram|Pixel|Apple ID|GV|API)[^，。,；;]{0,80})/i,
    );
    if (productNameMatch) text = productNameMatch[1].trim();
  }

  if (text.length > 96) {
    const parts = text.split(/\s{2,}|[。；;，,]/).map((part) => part.trim()).filter(Boolean);
    text = parts.at(-1) || text.slice(-96);
  }

  return text.slice(0, 140).trim();
}

function stockFromGenericContext(value) {
  const text = cleanText(value);
  const stockMatch = text.match(/库存\s*[:：]?\s*(\d+)/) || text.match(/(\d+)\s*件现货/);
  return stockMatch ? numberOrNull(stockMatch[1]) : null;
}

function cleanPageTitle(html) {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (!title) return "";
  return title
    .split(/\s*(?:购买\s*\||\|\s*购买|-\s*购买|_\s*购买)\s*/)[0]
    .replace(/\s*\|\s*(?:office\s*365|发卡|小店|商城|商店).*$/i, "")
    .replace(/\s+-\s*(?:office\s*365|发卡|小店|商城|商店).*$/i, "")
    .trim()
    .slice(0, 140);
}

function isLikelySingleProductPage(url, priceCount) {
  const parsed = safeUrl(url);
  if (!parsed) return priceCount <= 2;
  return priceCount <= 2 && /\/(?:product|products|goods|item)\//i.test(parsed.pathname);
}

async function discoverShopTokens(target, options = {}) {
  const tokens = new Set();
  const entryToken = shopTokenFromUrl(target.sourceUrl);
  if (entryToken) tokens.add(entryToken);

  const itemUrls = target.rawOffers
    .map((offer) => offer.url)
    .filter(Boolean)
    .filter((url) => normalizeHostname(url) === normalizeHostname(target.baseUrl))
    .slice(0, 20);

  for (const itemUrl of itemUrls) {
    await waitBetweenPages(options);
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

async function loadTargets() {
  let sources = BUILTIN_SOURCES;
  let rawOffers = [];

  const supabase = getSupabaseClient();
  if (supabase) {
    const [sourcesResult, offersResult] = await Promise.all([
      supabase.from("sources").select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,notes,last_success_at,last_checked_at").eq("enabled", true),
      supabase.from("raw_offers").select("source_id,source_name,source_store_name,source_title,url").limit(5000),
    ]);

    if (sourcesResult.error) throw sourcesResult.error;
    if (offersResult.error) throw offersResult.error;

    sources = sourcesResult.data || [];
    rawOffers = offersResult.data || [];
  }

  const rawBySource = new Map();
  for (const offer of rawOffers) {
    const sourceId = offer.source_id;
    if (!sourceId) continue;
    const items = rawBySource.get(sourceId) || [];
    items.push({
      sourceId,
      sourceName: offer.source_name,
      sourceStoreName: offer.source_store_name,
      sourceTitle: offer.source_title,
      url: offer.url,
    });
    rawBySource.set(sourceId, items);
  }

  return sources
    .filter((source) => source.collection_method !== "public_json")
    .map((source) => buildTarget(source, rawBySource.get(source.id) || []));
}

function buildTarget(source, rawOffers) {
  const sourceUrl = source.entry_url || source.base_url;
  const baseUrl = source.base_url || deriveBaseUrl(sourceUrl);
  const host = normalizeHostname(baseUrl || sourceUrl);
  const text = `${source.id} ${source.name} ${sourceUrl}`.toLowerCase();
  const configuredKind = normalizeCollectorKind(source.collector_kind);
  const inferredKind = inferCollectorKind(host, text);
  const kind =
    configuredKind && configuredKind !== "auto" && configuredKind !== "browser" && configuredKind !== "unsupported"
      ? configuredKind
      : inferredKind || configuredKind;
  const runnableKind = kind === "browser" || kind === "unsupported" ? null : kind;

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl,
    sourceStoreName: source.name,
    baseUrl,
    kind: runnableKind,
    configuredKind: configuredKind || null,
    lastSuccessAt: source.last_success_at || null,
    lastCheckedAt: source.last_checked_at || null,
    rawOffers,
  };
}

function kamiCommodityUrl(target, id) {
  const base = target.baseUrl;
  return `${base}/item/${encodeURIComponent(String(id))}`;
}

function makeOffer(target, input) {
  return {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    sourceStoreName: target.sourceStoreName || target.sourceName,
    sourceShopCreatedAt: target.sourceShopCreatedAt || null,
    sourceTitle: input.title,
    price: input.price,
    listedPrice: input.listedPrice ?? null,
    feeAmount: input.feeAmount ?? null,
    priceBasis: input.priceBasis ?? null,
    currency: "CNY",
    status: input.status || "unknown",
    effectiveStatus: input.effectiveStatus || null,
    freshnessStatus: input.freshnessStatus || null,
    failureReason: input.failureReason || null,
    url: input.url,
    tags: input.tags || [],
    stockCount: input.stockCount,
    minOrderQuantity: input.minOrderQuantity ?? null,
    bulkPricingTiers: input.bulkPricingTiers || [],
  };
}

function shopApiShopAvailability(data) {
  const customStatus = numberOrNull(data?.custom_status);
  if (customStatus === 0) {
    const message = cleanText(data?.custom_status_msg || data?.status_msg || data?.message || "");
    return {
      closed: true,
      reason: `店铺已打烊${message ? `：${message}` : ""}`,
    };
  }

  return { closed: false, reason: null };
}

function crawlLogPayloadFor(target, offers, status, message, options = {}, details = {}) {
  return {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    sourceEntryUrl: target.sourceEntryUrl,
    sourceShopCreatedAt: target.sourceShopCreatedAt || offers.find((offer) => offer.sourceShopCreatedAt)?.sourceShopCreatedAt || undefined,
    mode: "http",
    status,
    message,
    offers,
    details: {
      collectorNode: collectorNodeDetails(options),
      collector: target.kind,
      ...details,
    },
  };
}

function crawlLogPayloadsFor(target, offers, status, message, options = {}, details = {}) {
  const fullSnapshot = details.fullSnapshot !== false && shouldIncludeFullSnapshot(target, offers, status, options, details);
  const seenOfferIds = fullSnapshot ? seenOfferIdsForSnapshot(offers, details) : undefined;

  if (status !== "success" || offers.length <= postBatchSizeFor(options)) {
    return [
      crawlLogPayloadFor(target, offers, status, message, options, {
        ...details,
        fullSnapshot,
        seenOfferIds,
        deferredFullSnapshot: status === "success" && !fullSnapshot,
      }),
    ];
  }

  const batches = chunks(offers, postBatchSizeFor(options));

  return batches.map((batch, index) => {
    const isLast = index === batches.length - 1;
    return crawlLogPayloadFor(
      target,
      batch,
      "success",
      `${message} 分批写入 ${index + 1}/${batches.length}。`,
      options,
      {
        ...details,
        batchIndex: index + 1,
        batchCount: batches.length,
        batchStage: isLast ? "final" : "intermediate",
        originalOfferCount: offers.length,
        fullSnapshot: isLast && fullSnapshot,
        seenOfferIds: isLast && fullSnapshot ? seenOfferIds : undefined,
        deferredFullSnapshot: isLast && !fullSnapshot,
      },
    );
  });
}

function crawlLogPostConfig(options = {}) {
  const endpoint =
    options.endpoint ||
    process.env.CRON_PUBLIC_BASE_URL ||
    env.CRON_PUBLIC_BASE_URL ||
    "http://localhost:3000";
  const password =
    options.password ||
    process.env.CRON_SECRET ||
    env.CRON_SECRET;
  if (!password) {
    throw new Error("写回采集结果需要 --password 或 CRON_SECRET。");
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    password,
  };
}

function cronWriteHeaders(config) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.password}`,
  };
}

async function postCollectorHeartbeat(status, options = {}, input = {}) {
  const config = crawlLogPostConfig(options);
  const payload = {
    node: collectorNodeDetails(options),
    scope: collectorHeartbeatScopeForOptions(options),
    status,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    successCount: Number(input.successCount || 0),
    failureCount: Number(input.failureCount || 0),
    skippedCount: Number(input.skippedCount || 0),
    offerCount: Number(input.offerCount || 0),
    message: input.message || null,
    details: compactObject({
      ...(input.details || {}),
      options: compactObject({
        all: Boolean(options.all),
        kind: options.kind || options.kinds || options["collector-kind"] || options["collector-kinds"] || null,
        excludeKind: options.excludeKind || options["exclude-kind"] || options.excludeKinds || options["exclude-kinds"] || null,
        excludeFamily: options.excludeFamily || options["exclude-family"] || options.excludeFamilies || options["exclude-families"] || null,
      }),
    }),
  };
  const response = await fetch(`${config.endpoint}/api/admin/collector-heartbeat`, {
    method: "POST",
    headers: cronWriteHeaders(config),
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || `Heartbeat failed with HTTP ${response.status}`);
  }
  return body;
}

function collectorHeartbeatScopeForOptions(options = {}) {
  const selected = options.source || options.id || options.name;
  if (selected) return `source:${String(selected)}`;

  const kinds = optionList(options.kind || options.kinds || options["collector-kind"] || options["collector-kinds"]);
  if (kinds.length) return `kind:${kinds.join(",")}`;

  const excludedKinds = optionList(options.excludeKind || options["exclude-kind"] || options.excludeKinds || options["exclude-kinds"]);
  const excludedFamilies = optionList(options.excludeFamily || options["exclude-family"] || options.excludeFamilies || options["exclude-families"]);
  const excluded = [
    excludedKinds.length ? `exclude-kind:${excludedKinds.join(",")}` : null,
    excludedFamilies.length ? `exclude-family:${excludedFamilies.join(",")}` : null,
  ].filter(Boolean);

  if (excluded.length) return excluded.join(";");
  return options.all ? "all" : "filtered";
}

function collectorHeartbeatStatusForResult(result = {}) {
  if (Number(result.failureCount || 0) > 0 && Number(result.successCount || 0) > 0) return "partial";
  if (Number(result.failureCount || 0) > 0) return "failed";
  if (Number(result.targetCount || 0) === 0) return "idle";
  return "success";
}

async function postCrawlLogPayload(payload, options = {}) {
  const config = crawlLogPostConfig(options);
  const response = await fetch(`${config.endpoint}/api/admin/crawl-log`, {
    method: "POST",
    headers: cronWriteHeaders(config),
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || `Post failed with HTTP ${response.status}`);
  }

  return body;
}

async function postCrawlLogPayloadBatch(runs, options = {}, batchDetails = {}) {
  if (runs.length === 1) return postCrawlLogPayload(runs[0], options);

  const config = crawlLogPostConfig(options);
  const response = await fetch(`${config.endpoint}/api/admin/crawl-log`, {
    method: "POST",
    headers: cronWriteHeaders(config),
    body: JSON.stringify({
      runs,
      batch: {
        sourceCount: runs.length,
        ...batchDetails,
      },
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || `Post failed with HTTP ${response.status}`);
  }

  return body;
}

async function postCrawlLog(target, offers, status, message, options = {}, details = {}) {
  return postCrawlLogPayload(crawlLogPayloadFor(target, offers, status, message, options, details), options);
}

async function postCrawlLogBatched(target, offers, status, message, options = {}, details = {}, writeQueue = null) {
  const runs = crawlLogPayloadsFor(target, offers, status, message, options, details);

  const canQueue = runs.every((run) => run.status === "success" || run.status === "partial");
  if (writeQueue && canQueue) {
    writeQueue.enqueue(runs, { sourceId: target.sourceId, sourceName: target.sourceName });
    return { ok: true, queued: true, successCount: offers.length };
  }

  let successCount = 0;
  let writtenCount = 0;
  let unchangedCount = 0;
  let refreshedCount = 0;

  for (const run of runs) {
    const posted = await postCrawlLogPayload(run, options);
    successCount += Number(posted.successCount || 0);
    writtenCount += Number(posted.writtenCount || 0);
    unchangedCount += Number(posted.unchangedCount || 0);
    refreshedCount += Number(posted.refreshedCount || 0);
  }

  return { ok: true, successCount, writtenCount, unchangedCount, refreshedCount };
}

async function postSkippedCrawlLog(target, skip, options = {}, logger = null) {
  if (!options.post) return;

  await postCrawlLogBatched(target, [], "skipped", skip.message, options, {
    collectedAt: new Date().toISOString(),
    skip: {
      reason: skip.reason || "family_protection",
      family: skip.family || null,
      familyLabel: skip.familyLabel || null,
      limit: skip.limit ?? null,
      startedCount: skip.startedCount ?? null,
    },
  }, null).catch((error) => {
    logger?.error(`Failed to post skipped log: ${errorMessage(error)}`);
  });
}

function createCrawlLogWriteQueue(options = {}, logger = null) {
  const flushSourceCount = flushSourceCountFor(options);
  const flushIntervalMs = flushIntervalMsFor(options);
  const maxRunsPerRequest = postRunBatchSizeFor(options);
  const maxOffersPerRequest = postRequestOfferLimitFor(options);
  const spool = createCrawlLogSpool(options, logger);
  let pendingRuns = [];
  let pendingSourceCount = 0;
  let firstQueuedAt = 0;
  let timer = null;
  let flushChain = Promise.resolve();
  let lastError = null;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const scheduleTimer = () => {
    if (timer || flushIntervalMs <= 0 || !pendingRuns.length) return;
    timer = setTimeout(() => {
      void flush("interval").catch((error) => {
        lastError = error;
        logger?.error(`Failed to flush crawl log queue: ${errorMessage(error)}`);
      });
    }, flushIntervalMs);
    timer.unref?.();
  };

  const flushNow = async (reason = "manual", flushOptions = {}) => {
    clearTimer();
    if (!pendingRuns.length) return { ok: true, runCount: 0, successCount: 0, writtenCount: 0, unchangedCount: 0, refreshedCount: 0 };

    const runs = pendingRuns;
    const sourceCount = pendingSourceCount;
    const queuedAt = firstQueuedAt;
    pendingRuns = [];
    pendingSourceCount = 0;
    firstQueuedAt = 0;

    let successCount = 0;
    let writtenCount = 0;
    let unchangedCount = 0;
    let refreshedCount = 0;
    let requestCount = 0;

    try {
      for (const batch of crawlLogRequestBatches(runs, maxRunsPerRequest, maxOffersPerRequest)) {
        const posted = await postCrawlLogPayloadBatch(batch, options, {
          reason,
          sourceCount,
          runCount: runs.length,
          flushSourceCount,
          flushIntervalMs,
        });
        requestCount++;
        successCount += Number(posted.successCount || 0);
        writtenCount += Number(posted.writtenCount || 0);
        unchangedCount += Number(posted.unchangedCount || 0);
        refreshedCount += Number(posted.refreshedCount || 0);
      }
    } catch (error) {
      if (flushOptions.persistOnFailure) {
        spool.write(runs, {
          reason,
          sourceCount,
          queuedAt: queuedAt || Date.now(),
          error: errorMessage(error),
        });
      } else {
        pendingRuns = [...runs, ...pendingRuns];
        pendingSourceCount += sourceCount;
        firstQueuedAt = firstQueuedAt || queuedAt || Date.now();
        scheduleTimer();
      }
      throw error;
    }

    logger?.log(
      `Flushed ${runs.length} crawl log run(s) from ${sourceCount} source(s) via ${requestCount} request(s).`,
    );

    return { ok: true, runCount: runs.length, successCount, writtenCount, unchangedCount, refreshedCount };
  };

  const flush = (reason = "manual", flushOptions = {}) => {
    const operation = flushChain.then(() => flushNow(reason, flushOptions));
    flushChain = operation.catch(() => {});
    return operation;
  };

  return {
    enqueue(runs, source = {}) {
      const items = Array.isArray(runs) ? runs.filter(Boolean) : [];
      if (!items.length) return;

      pendingRuns.push(...items);
      pendingSourceCount++;
      if (!firstQueuedAt) firstQueuedAt = Date.now();
      scheduleTimer();

      const isCountReady = pendingSourceCount >= flushSourceCount;
      const isIntervalReady = flushIntervalMs > 0 && Date.now() - firstQueuedAt >= flushIntervalMs;
      if (isCountReady || isIntervalReady) {
        void flush(isCountReady ? "source-count" : "interval").catch((error) => {
          lastError = error;
          logger?.error(
            `Failed to flush crawl log queue after ${source.sourceName || source.sourceId || "source"}: ${errorMessage(error)}`,
          );
        });
      }
    },
    flush,
    replaySpool(reason = "startup") {
      const operation = flushChain.then(() =>
        spool.replay(async (runs, meta) => {
          for (const batch of crawlLogRequestBatches(runs, maxRunsPerRequest, maxOffersPerRequest)) {
            await postCrawlLogPayloadBatch(batch, options, {
              reason: `${reason}-spool`,
              sourceCount: meta.sourceCount || 0,
              runCount: runs.length,
              spooledAt: meta.createdAt || null,
              spoolReason: meta.reason || null,
            });
          }
        }),
      );
      flushChain = operation.catch(() => {});
      return operation;
    },
    throwIfFailed() {
      if (lastError) throw lastError;
    },
  };
}

function createCrawlLogSpool(options = {}, logger = null) {
  const directory = crawlLogSpoolDirectory(options);
  const replayLimit = spoolReplayLimitFor(options);

  const ensureDirectory = () => {
    mkdirSync(directory, { recursive: true });
  };

  return {
    write(runs, meta = {}) {
      const items = Array.isArray(runs) ? runs.filter(Boolean) : [];
      if (!items.length) return null;

      ensureDirectory();
      const createdAt = new Date().toISOString();
      const id = crypto
        .createHash("sha1")
        .update(`${createdAt}:${JSON.stringify(items).slice(0, 5000)}`)
        .digest("hex")
        .slice(0, 16);
      const file = join(directory, `${createdAt.replace(/[:.]/g, "-")}-${id}.json`);
      const tempFile = `${file}.tmp`;
      writeFileSync(tempFile, JSON.stringify({
        createdAt,
        ...meta,
        runs: items,
      }));
      renameSync(tempFile, file);
      logger?.error(`Saved ${items.length} crawl log run(s) for retry: ${file}`);
      return file;
    },
    async replay(post) {
      if (!existsSync(directory)) return { ok: true, fileCount: 0, runCount: 0 };

      const files = readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .slice(0, replayLimit);
      let runCount = 0;

      for (const file of files) {
        const path = join(directory, file);
        const raw = JSON.parse(readFileSync(path, "utf8"));
        const runs = Array.isArray(raw.runs) ? raw.runs : [];
        if (!runs.length) {
          rmSync(path, { force: true });
          continue;
        }

        await post(runs, raw);
        runCount += runs.length;
        rmSync(path, { force: true });
      }

      if (files.length) {
        logger?.log(`Replayed ${runCount} spooled crawl log run(s) from ${files.length} file(s).`);
      }
      return { ok: true, fileCount: files.length, runCount };
    },
  };
}

function crawlLogRequestBatches(runs, maxRunsPerRequest, maxOffersPerRequest) {
  const batches = [];
  let current = [];
  let currentOffers = 0;

  for (const run of runs) {
    const offerCount = Array.isArray(run.offers) ? run.offers.length : 0;
    const wouldExceedRunLimit = current.length >= maxRunsPerRequest;
    const wouldExceedOfferLimit = current.length > 0 && currentOffers + offerCount > maxOffersPerRequest;

    if (wouldExceedRunLimit || wouldExceedOfferLimit) {
      batches.push(current);
      current = [];
      currentOffers = 0;
    }

    current.push(run);
    currentOffers += offerCount;
  }

  if (current.length) batches.push(current);
  return batches;
}

function postBatchSizeFor(options = {}) {
  const value = Number(
    options.postBatchSize ||
      options["post-batch-size"] ||
      process.env.PRICEAI_COLLECT_POST_BATCH_SIZE ||
      env.PRICEAI_COLLECT_POST_BATCH_SIZE ||
      DEFAULT_POST_BATCH_SIZE,
  );
  if (!Number.isFinite(value)) return DEFAULT_POST_BATCH_SIZE;
  return Math.max(MIN_POST_BATCH_SIZE, Math.min(Math.trunc(value), MAX_POST_BATCH_SIZE));
}

function postRunBatchSizeFor(options = {}) {
  const value = Number(
    options.postRunBatchSize ||
      options["post-run-batch-size"] ||
      process.env.PRICEAI_COLLECT_POST_RUN_BATCH_SIZE ||
      env.PRICEAI_COLLECT_POST_RUN_BATCH_SIZE ||
      10,
  );
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(Math.trunc(value), 50));
}

function postRequestOfferLimitFor(options = {}) {
  const fallback = postBatchSizeFor(options);
  const value = Number(
    options.postRequestOfferLimit ||
      options["post-request-offer-limit"] ||
      process.env.PRICEAI_COLLECT_POST_REQUEST_OFFER_LIMIT ||
      env.PRICEAI_COLLECT_POST_REQUEST_OFFER_LIMIT ||
      fallback,
  );
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value), 1000));
}

function fullSnapshotOfferLimitFor(target, options = {}) {
  let defaultLimit = DEFAULT_FULL_SNAPSHOT_OFFER_LIMIT;
  if (target?.kind === "shopApi") {
    defaultLimit = SHOP_API_FULL_SNAPSHOT_OFFER_LIMIT;
  } else if (STRUCTURED_FULL_SNAPSHOT_COLLECTORS.has(target?.kind)) {
    defaultLimit = STRUCTURED_FULL_SNAPSHOT_OFFER_LIMIT;
  }

  const value = Number(
    options.fullSnapshotOfferLimit ||
      options["full-snapshot-offer-limit"] ||
      process.env.PRICEAI_COLLECT_FULL_SNAPSHOT_OFFER_LIMIT ||
      env.PRICEAI_COLLECT_FULL_SNAPSHOT_OFFER_LIMIT ||
      defaultLimit,
  );
  if (!Number.isFinite(value)) return defaultLimit;
  return Math.max(0, Math.min(Math.trunc(value), 2000));
}

function shouldIncludeFullSnapshot(target, offers, status, options = {}, details = {}) {
  if (status !== "success") return false;

  if (target?.kind === "shopApi") {
    if (!shopApiFullSnapshotEvidenceReliable(offers, details)) return false;
    return fullSnapshotEvidenceItemCount(offers, details) <= fullSnapshotOfferLimitFor(target, options);
  }

  return offers.length <= fullSnapshotOfferLimitFor(target, options);
}

function shopApiFullSnapshotEvidenceReliable(offers, details = {}) {
  const fetchedItemCount = nonNegativeInteger(details.fetchedItemCount);
  const rawSeenOfferCount = nonNegativeInteger(details.rawSeenOfferCount);
  const publishedItemCount = nonNegativeInteger(details.publishedItemCount);
  const reportedGoodsCount = nonNegativeInteger(details.reportedGoodsCount);

  if (
    fetchedItemCount === null ||
    rawSeenOfferCount === null ||
    publishedItemCount === null ||
    reportedGoodsCount === null
  ) {
    return false;
  }

  return (
    reportedGoodsCount === fetchedItemCount &&
    fetchedItemCount >= rawSeenOfferCount &&
    rawSeenOfferCount >= publishedItemCount &&
    publishedItemCount >= offers.length
  );
}

function fullSnapshotEvidenceItemCount(offers, details = {}) {
  return Math.max(
    offers.length,
    nonNegativeInteger(details.fetchedItemCount) || 0,
    nonNegativeInteger(details.rawSeenOfferCount) || 0,
    nonNegativeInteger(details.publishedItemCount) || 0,
    nonNegativeInteger(details.reportedGoodsCount) || 0,
  );
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function isEmptyResultFullSnapshotTarget(target) {
  return EMPTY_FULL_SNAPSHOT_COLLECTORS.has(target.kind);
}

function flushSourceCountFor(options = {}) {
  const value = Number(
    options.flushSourceCount ||
      options["flush-source-count"] ||
      process.env.PRICEAI_COLLECT_FLUSH_SOURCE_COUNT ||
      env.PRICEAI_COLLECT_FLUSH_SOURCE_COUNT ||
      DEFAULT_FLUSH_SOURCE_COUNT,
  );
  if (!Number.isFinite(value)) return DEFAULT_FLUSH_SOURCE_COUNT;
  return Math.max(1, Math.min(Math.trunc(value), 50));
}

function flushIntervalMsFor(options = {}) {
  const value = Number(
    options.flushIntervalMs ||
      options["flush-interval-ms"] ||
      process.env.PRICEAI_COLLECT_FLUSH_INTERVAL_MS ||
      env.PRICEAI_COLLECT_FLUSH_INTERVAL_MS ||
      DEFAULT_FLUSH_INTERVAL_MS,
  );
  if (!Number.isFinite(value)) return DEFAULT_FLUSH_INTERVAL_MS;
  return Math.max(5_000, Math.min(Math.trunc(value), 10 * 60_000));
}

function crawlLogSpoolDirectory(options = {}) {
  const value =
    options.crawlLogSpoolDir ||
    options["crawl-log-spool-dir"] ||
    process.env.PRICEAI_CRAWL_LOG_SPOOL_DIR ||
    env.PRICEAI_CRAWL_LOG_SPOOL_DIR;
  return value ? String(value) : join(tmpdir(), "priceai-crawl-log-spool");
}

function spoolReplayLimitFor(options = {}) {
  const value = Number(
    options.spoolReplayLimit ||
      options["spool-replay-limit"] ||
      process.env.PRICEAI_CRAWL_LOG_SPOOL_REPLAY_LIMIT ||
      env.PRICEAI_CRAWL_LOG_SPOOL_REPLAY_LIMIT ||
      DEFAULT_SPOOL_REPLAY_LIMIT,
  );
  if (!Number.isFinite(value)) return DEFAULT_SPOOL_REPLAY_LIMIT;
  return Math.max(0, Math.min(Math.trunc(value), 500));
}

function collectorNodeDetails(options = {}) {
  const id =
    options.collectorNodeId ||
    options["collector-node-id"] ||
    process.env.PRICEAI_COLLECTOR_NODE_ID ||
    env.PRICEAI_COLLECTOR_NODE_ID ||
    defaultCollectorNodeId();
  const name =
    options.collectorNodeName ||
    options["collector-node-name"] ||
    process.env.PRICEAI_COLLECTOR_NODE_NAME ||
    env.PRICEAI_COLLECTOR_NODE_NAME ||
    defaultCollectorNodeName(id);
  const type =
    options.collectorNodeType ||
    options["collector-node-type"] ||
    process.env.PRICEAI_COLLECTOR_NODE_TYPE ||
    env.PRICEAI_COLLECTOR_NODE_TYPE ||
    defaultCollectorNodeType();
  const runtime =
    options.collectorNodeRuntime ||
    options["collector-node-runtime"] ||
    process.env.PRICEAI_COLLECTOR_NODE_RUNTIME ||
    env.PRICEAI_COLLECTOR_NODE_RUNTIME ||
    defaultCollectorNodeRuntime();
  const region =
    options.collectorNodeRegion ||
    options["collector-node-region"] ||
    process.env.PRICEAI_COLLECTOR_NODE_REGION ||
    env.PRICEAI_COLLECTOR_NODE_REGION ||
    process.env.VERCEL_REGION ||
    null;

  return compactObject({
    id,
    name,
    type,
    runtime,
    region,
  });
}

function defaultCollectorNodeId() {
  if (process.env.GITHUB_ACTIONS === "true") return "github-actions";
  if (process.env.VERCEL) return "vercel-cron";
  return "unknown-node";
}

function defaultCollectorNodeName(id) {
  if (id === "github-actions") return "GitHub Actions";
  if (id === "vercel-cron") return "Vercel Cron";
  return "未知节点";
}

function defaultCollectorNodeType() {
  if (process.env.GITHUB_ACTIONS === "true") return "ci";
  if (process.env.VERCEL) return "vercel";
  return "unknown";
}

function defaultCollectorNodeRuntime() {
  if (process.env.GITHUB_ACTIONS === "true") return "github-actions";
  if (process.env.VERCEL) return "vercel-cron";
  return "manual";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""),
  );
}

function offerIdsForSnapshot(offers) {
  return offers.map((offer) => stableOfferInputId(offer));
}

function seenOfferIdsForSnapshot(offers, details = {}) {
  if (Array.isArray(details.seenOfferIds)) {
    const ids = details.seenOfferIds.map((value) => String(value || "").trim()).filter(Boolean);
    if (ids.length) return ids;
  }

  return offerIdsForSnapshot(offers);
}

function stableShopApiOfferIdFromUrl(value) {
  const shopItemUrl = normalizeShopApiItemOfferUrl(value);
  return shopItemUrl ? stableId("shop-api-offer", shopItemUrl) : null;
}

function stableOfferInputId(offer) {
  const shopItemUrl = normalizeShopApiItemOfferUrl(offer.url);
  if (shopItemUrl) return stableId("shop-api-offer", shopItemUrl);

  return stableId(offer.sourceName, offer.sourceStoreName, offer.sourceTitle, offer.url);
}

function stableId(...parts) {
  const input = parts.filter((part) => part !== null && part !== undefined).join("|");
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return `id-${(hash >>> 0).toString(36)}`;
}

function selectTargets(targets, options) {
  const selected = options.source || options.id || options.name;
  const runnable = (target) => target.kind;
  const applyExclusions = (items) => items
    .filter((target) => matchesTargetKinds(target, options))
    .filter((target) => !shouldExcludeTarget(target, options));
  if (!selected && !options.all) return applyExclusions(targets.filter(runnable));
  if (options.all) return applyExclusions(targets.filter(runnable));

  const query = String(selected).toLowerCase();
  const exact = applyExclusions(targets.filter((target) => runnable(target) && String(target.sourceId).toLowerCase() === query));
  if (exact.length) return exact;

  return applyExclusions(
    targets.filter((target) =>
      runnable(target) &&
      [target.sourceId, target.sourceName, target.sourceUrl, target.kind, target.configuredKind]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    ),
  );
}

function selectBuiltinTargets(options = {}) {
  const selected = options.source || options.id || options.name;
  if (!selected || options.all) return [];

  const query = String(selected).toLowerCase();
  return BUILTIN_SOURCES
    .map((source) => buildTarget(source, []))
    .map((target) => ({ ...target, builtinFallback: true }))
    .filter((target) => target.kind)
    .filter((target) => matchesTargetKinds(target, options))
    .filter((target) => !shouldExcludeTarget(target, options))
    .filter((target) =>
      [target.sourceId, target.sourceName, target.sourceUrl, target.kind, target.configuredKind]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
}

function targetGroupsForCollection(targets) {
  const groups = new Map();
  for (const target of targets) {
    const key = normalizeHostname(target.baseUrl || target.sourceUrl) || target.sourceId;
    const existing = groups.get(key);
    if (existing) {
      existing.targets.push(target);
    } else {
      groups.set(key, { key, targets: [target] });
    }
  }
  for (const group of groups.values()) {
    sortTargetsForCollectionGroup(group.targets);
  }
  return [...groups.values()];
}

function sortTargetsForCollectionGroup(targets) {
  if (targets.length <= 1) return targets;
  if (!targets.some((target) => collectionFamilyForTarget(target))) return targets;

  return targets.sort((a, b) => {
    const familyA = collectionFamilyForTarget(a);
    const familyB = collectionFamilyForTarget(b);
    if (familyA && !familyB) return -1;
    if (!familyA && familyB) return 1;
    if (familyA?.key !== familyB?.key) return String(familyA?.key || "").localeCompare(String(familyB?.key || ""));

    return compareTargetFreshness(a, b);
  });
}

function compareTargetFreshness(a, b) {
  const checkedA = targetCheckedAtMs(a);
  const checkedB = targetCheckedAtMs(b);
  if (!Number.isFinite(checkedA) && !Number.isFinite(checkedB)) {
    return String(a.sourceName || a.sourceId).localeCompare(String(b.sourceName || b.sourceId));
  }
  if (!Number.isFinite(checkedA)) return -1;
  if (!Number.isFinite(checkedB)) return 1;
  if (checkedA !== checkedB) return checkedA - checkedB;
  return String(a.sourceName || a.sourceId).localeCompare(String(b.sourceName || b.sourceId));
}

function targetCheckedAtMs(target) {
  const value = target.lastCheckedAt || target.lastSuccessAt;
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildCollectionPerformanceReport({
  summary,
  targets,
  groups,
  concurrency,
  startedAt,
  finishedAt,
  durationMs,
}) {
  const byKind = aggregateCollectionBy(summary, (item) => item.kind || "unknown");
  const byStatus = aggregateCollectionBy(summary, (item) => item.status || "unknown");
  const slowestTargets = [...summary]
    .sort((a, b) => Number(b.ms || 0) - Number(a.ms || 0))
    .slice(0, 10)
    .map((item) => ({
      sourceId: item.sourceId,
      source: item.source,
      kind: item.kind,
      status: item.status,
      offers: item.offers,
      attempts: item.attempts,
      ms: item.ms,
      message: item.message || null,
    }));
  const multiTargetGroups = groups
    .filter((group) => group.targets.length > 1)
    .map((group) => ({
      key: group.key,
      targetCount: group.targets.length,
      sourceIds: group.targets.map((target) => target.sourceId),
    }))
    .sort((a, b) => b.targetCount - a.targetCount);

  return {
    startedAt,
    finishedAt,
    durationMs,
    concurrency,
    targetCount: targets.length,
    groupCount: groups.length,
    multiTargetGroupCount: multiTargetGroups.length,
    offers: summary.reduce((sum, item) => sum + Number(item.offers || 0), 0),
    byStatus,
    byKind,
    slowestTargets,
    multiTargetGroups: multiTargetGroups.slice(0, 10),
  };
}

function aggregateCollectionBy(items, keyForItem) {
  const map = new Map();

  for (const item of items) {
    const key = String(keyForItem(item) || "unknown");
    const existing = map.get(key) || {
      key,
      targets: 0,
      offers: 0,
      attempts: 0,
      totalMs: 0,
      maxMs: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    existing.targets += 1;
    existing.offers += Number(item.offers || 0);
    existing.attempts += Number(item.attempts || 0);
    existing.totalMs += Number(item.ms || 0);
    existing.maxMs = Math.max(existing.maxMs, Number(item.ms || 0));
    if (item.status === "success") existing.success += 1;
    else if (item.status === "skipped") existing.skipped += 1;
    else existing.failed += 1;
    map.set(key, existing);
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      avgMs: entry.targets ? Math.round(entry.totalMs / entry.targets) : 0,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function printCollectionPerformance(performance) {
  if (!performance) return;

  console.log("\nPerformance");
  console.table([
    {
      targets: performance.targetCount,
      groups: performance.groupCount,
      concurrency: performance.concurrency,
      durationMs: performance.durationMs,
      offers: performance.offers,
      multiTargetGroups: performance.multiTargetGroupCount,
    },
  ]);

  if (performance.byKind?.length) {
    console.log("\nBy collector kind");
    console.table(performance.byKind);
  }

  if (performance.slowestTargets?.length) {
    console.log("\nSlowest targets");
    console.table(performance.slowestTargets);
  }
}

function hasTargetFilters(options = {}) {
  return Boolean(
    options.source ||
      options.id ||
      options.name ||
      options.kind ||
      options.kinds ||
      options["collector-kind"] ||
      options["collector-kinds"] ||
      options.excludeKind ||
      options["exclude-kind"] ||
      options.excludeKinds ||
      options["exclude-kinds"] ||
      options.excludeFamily ||
      options["exclude-family"] ||
      options.excludeFamilies ||
      options["exclude-families"],
  );
}

function shouldExcludeTarget(target, options = {}) {
  const kinds = optionList(options.excludeKind || options["exclude-kind"] || options.excludeKinds || options["exclude-kinds"]);
  if (
    kinds.includes(String(target.kind || "").toLowerCase()) ||
    kinds.includes(String(target.configuredKind || "").toLowerCase())
  ) {
    return true;
  }

  const families = optionList(options.excludeFamily || options["exclude-family"] || options.excludeFamilies || options["exclude-families"]);
  if (families.includes("liandong-shop") && isLiandongShopTarget(target)) return true;
  return false;
}

function matchesTargetKinds(target, options = {}) {
  const kinds = optionList(options.kind || options.kinds || options["collector-kind"] || options["collector-kinds"]);
  if (!kinds.length) return true;

  return kinds.includes(String(target.kind || "").toLowerCase()) ||
    kinds.includes(String(target.configuredKind || "").toLowerCase());
}

function isLiandongShopTarget(target) {
  return Boolean(collectionFamilyForTarget(target));
}

function optionList(value) {
  if (Array.isArray(value)) return value.flatMap(optionList);
  if (value === true || value === false || value === null || value === undefined) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function cooldownSkipReason(target, options = {}) {
  if (!shouldUseCollectionCooldown(options)) return null;

  const lastSuccessMs = target.lastSuccessAt ? new Date(target.lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(lastSuccessMs)) return null;

  const cooldownMinutes = cooldownMinutesFor(options);
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const ageMs = Date.now() - lastSuccessMs;
  if (ageMs < 0 || ageMs >= cooldownMs) return null;

  const remainingMinutes = Math.max(1, Math.ceil((cooldownMs - ageMs) / 60_000));
  return {
    message: `最近 ${cooldownMinutes} 分钟内已成功采集，跳过本轮；约 ${remainingMinutes} 分钟后可再次自动采集。`,
  };
}

function shouldUseCollectionCooldown(options = {}) {
  if (truthyFlag(options.force) || truthyFlag(options["no-cooldown"])) return false;
  if (options.source || options.id || options.name) return false;
  return truthyFlag(options.all) || !options.source;
}

function cooldownMinutesFor(options = {}) {
  const raw =
    options.cooldownMinutes ||
    options["cooldown-minutes"] ||
    process.env.PRICEAI_COLLECTOR_COOLDOWN_MINUTES ||
    env.PRICEAI_COLLECTOR_COOLDOWN_MINUTES ||
    DEFAULT_COOLDOWN_MINUTES;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_COOLDOWN_MINUTES;
  return Math.max(1, Math.min(Math.trunc(value), 24 * 60));
}

export function createCollectionFamilyState(options = {}) {
  return {
    enabled: shouldUseCollectionFamilyProtection(options),
    records: new Map(),
    limit: liandongShopBulkLimitFor(options),
    delayMs: liandongShopBulkDelayMsFor(options),
    breakerMs: liandongShopBreakerMsFor(options),
    http403CooldownMs: liandongShopHttp403CooldownMsFor(options),
    http403Threshold: liandongShopHttp403ThresholdFor(options),
  };
}

function shouldUseCollectionFamilyProtection(options = {}) {
  if (truthyFlag(options["no-family-protection"]) || truthyFlag(options.noFamilyProtection)) return false;
  if (truthyFlag(options["family-protection"]) || truthyFlag(options.familyProtection)) return true;
  if (options.source || options.id || options.name) return false;
  return truthyFlag(options.all) || !options.source;
}

function collectionFamilySkipReason(target, state) {
  const family = state.enabled ? collectionFamilyForTarget(target) : null;
  if (!family) return null;

  const record = collectionFamilyRecord(state, family);
  const now = Date.now();
  if (record.breakerUntil && record.breakerUntil > now) {
    return {
      message: `${family.label} 已触发风控熔断；约 ${Math.ceil((record.breakerUntil - now) / 60_000)} 分钟后再试。`,
    };
  }

  if (record.http403CooldownUntil && record.http403CooldownUntil > now) {
    return {
      message: `${family.label} 近期频繁 HTTP 403，进入短冷却；约 ${Math.ceil((record.http403CooldownUntil - now) / 60_000)} 分钟后再试。`,
    };
  }

  if (state.limit > 0 && record.startedCount >= state.limit) {
    return {
      message: `${family.label} 本轮已达到 ${state.limit} 个店铺上限，剩余店铺留到下一轮低频采集。`,
    };
  }

  return null;
}

async function waitForCollectionFamily(target, state, logger) {
  const family = state.enabled ? collectionFamilyForTarget(target) : null;
  if (!family || state.delayMs <= 0) return;

  const record = collectionFamilyRecord(state, family);
  const elapsedMs = record.lastStartedAt ? Date.now() - record.lastStartedAt : state.delayMs;
  const waitMs = state.delayMs - elapsedMs;
  if (waitMs <= 0) return;

  logger?.log(`Waiting ${Math.ceil(waitMs / 1000)}s before next ${family.label} request...`);
  await delay(waitMs);
}

function markCollectionFamilyStarted(target, state) {
  const family = state.enabled ? collectionFamilyForTarget(target) : null;
  if (!family) return;

  const record = collectionFamilyRecord(state, family);
  record.startedCount++;
  record.lastStartedAt = Date.now();
}

function recordCollectionFamilyResult(target, state, result = {}) {
  const family = state.enabled ? collectionFamilyForTarget(target) : null;
  if (!family) return;

  const record = collectionFamilyRecord(state, family);
  record.lastStatus = result.status || null;
  record.lastMessage = result.message || null;

  if (result.status === "success") {
    record.consecutiveHttp403Count = 0;
  }

  const http403Count = http403CountForResult(result);
  if (http403Count > 0) {
    record.consecutiveHttp403Count += http403Count;
    if (record.consecutiveHttp403Count >= state.http403Threshold) {
      record.http403CooldownUntil = Date.now() + state.http403CooldownMs;
      record.consecutiveHttp403Count = 0;
      result.logger?.log(
        `${family.label} returned frequent HTTP 403; cooling this family for ${Math.ceil(state.http403CooldownMs / 60_000)} minutes.`,
      );
    }
    return;
  }

  if (!isChallengeMessage(result.message)) return;

  record.breakerUntil = Date.now() + state.breakerMs;
  result.logger?.log(
    `${family.label} returned a verification/challenge page; pausing this family for ${Math.ceil(state.breakerMs / 60_000)} minutes.`,
  );
}

function collectionFamilyRunPauseReason(target, state) {
  const family = state.enabled ? collectionFamilyForTarget(target) : null;
  if (!family) return null;

  const record = collectionFamilyRecord(state, family);
  const now = Date.now();
  if (record.breakerUntil && record.breakerUntil > now) {
    return {
      label: family.label,
      message: `已触发风控熔断，本轮停止继续请求；约 ${Math.ceil((record.breakerUntil - now) / 60_000)} 分钟后再试。`,
    };
  }

  if (record.http403CooldownUntil && record.http403CooldownUntil > now) {
    return {
      label: family.label,
      message: `连续多个店铺返回 HTTP 403，本轮停止继续请求；约 ${Math.ceil((record.http403CooldownUntil - now) / 60_000)} 分钟后再试。`,
    };
  }

  return null;
}

function collectionFamilyRecord(state, family) {
  const existing = state.records.get(family.key);
  if (existing) return existing;

  const record = {
    startedCount: 0,
    lastStartedAt: 0,
    breakerUntil: 0,
    http403CooldownUntil: 0,
    consecutiveHttp403Count: 0,
    lastStatus: null,
    lastMessage: null,
  };
  state.records.set(family.key, record);
  return record;
}

function collectionFamilyForTarget(target) {
  if (target.kind !== "shopApi") return null;

  const host = normalizeHostname(target.baseUrl || target.sourceUrl);
  if (!["pay.ldxp.cn", "ldxp.cn", "pay.qxvx.cn", "catfk.com"].includes(host)) return null;

  return {
    key: `shopApi:${host}`,
    label: `${host} shopApi`,
  };
}

function liandongShopBulkLimitFor(options = {}) {
  const raw =
    options.liandongShopLimit ||
    options["liandong-shop-limit"] ||
    process.env.PRICEAI_LIANDONG_SHOP_BULK_LIMIT ||
    env.PRICEAI_LIANDONG_SHOP_BULK_LIMIT ||
    DEFAULT_LIANDONG_SHOP_BULK_LIMIT;
  return integerInRange(raw, 0, 500, DEFAULT_LIANDONG_SHOP_BULK_LIMIT);
}

function liandongShopBulkDelayMsFor(options = {}) {
  const raw =
    options.liandongShopDelayMs ||
    options["liandong-shop-delay-ms"] ||
    process.env.PRICEAI_LIANDONG_SHOP_BULK_DELAY_MS ||
    env.PRICEAI_LIANDONG_SHOP_BULK_DELAY_MS ||
    DEFAULT_LIANDONG_SHOP_BULK_DELAY_MS;
  return integerInRange(raw, 0, 10 * 60 * 1000, DEFAULT_LIANDONG_SHOP_BULK_DELAY_MS);
}

function liandongShopBreakerMsFor(options = {}) {
  const raw =
    options.liandongShopBreakerMinutes ||
    options["liandong-shop-breaker-minutes"] ||
    process.env.PRICEAI_LIANDONG_SHOP_BREAKER_MINUTES ||
    env.PRICEAI_LIANDONG_SHOP_BREAKER_MINUTES ||
    DEFAULT_LIANDONG_SHOP_BREAKER_MINUTES;
  return integerInRange(raw, 1, 24 * 60, DEFAULT_LIANDONG_SHOP_BREAKER_MINUTES) * 60 * 1000;
}

function liandongShopHttp403CooldownMsFor(options = {}) {
  const raw =
    options.liandongShopHttp403CooldownMinutes ||
    options["liandong-shop-403-cooldown-minutes"] ||
    process.env.PRICEAI_LIANDONG_SHOP_403_COOLDOWN_MINUTES ||
    env.PRICEAI_LIANDONG_SHOP_403_COOLDOWN_MINUTES ||
    DEFAULT_LIANDONG_SHOP_HTTP_403_COOLDOWN_MINUTES;
  return integerInRange(raw, 1, 60, DEFAULT_LIANDONG_SHOP_HTTP_403_COOLDOWN_MINUTES) * 60 * 1000;
}

function liandongShopHttp403ThresholdFor(options = {}) {
  const raw =
    options.liandongShopHttp403Threshold ||
    options["liandong-shop-403-threshold"] ||
    process.env.PRICEAI_LIANDONG_SHOP_403_THRESHOLD ||
    env.PRICEAI_LIANDONG_SHOP_403_THRESHOLD ||
    DEFAULT_LIANDONG_SHOP_HTTP_403_THRESHOLD;
  return integerInRange(raw, 1, 10, DEFAULT_LIANDONG_SHOP_HTTP_403_THRESHOLD);
}

function http403CountForResult(result = {}) {
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  if (attempts.some((attempt) => isHttp403Message(attempt?.message))) return 1;
  return isHttp403Message(result.message) ? 1 : 0;
}

function isHttp403Message(message) {
  return /HTTP\s*403|returned HTTP 403|denied by ip_access_rule|ip_access_rule/i.test(String(message || ""));
}

function shouldStopRetryingTarget(target, error) {
  if (!collectionFamilyForTarget(target)) return false;
  return isHttp403Message(errorMessage(error));
}

function isChallengeMessage(message) {
  return /验证|风控|challenge|captcha|本机浏览器采集|verification/i.test(String(message || ""));
}

function integerInRange(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.trunc(number), max));
}

function truthyFlag(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function collectionLockOwner(options = {}) {
  const node = collectorNodeDetails(options);
  return `${node.id || "unknown-node"}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

async function acquireCollectionLock(target, owner, options = {}) {
  if (truthyFlag(options["no-lock"])) return { acquired: true };
  if (target.builtinFallback) return { acquired: true };

  const supabase = getSupabaseClient();
  if (!supabase) return { acquired: true };

  const { data, error } = await supabase.rpc("acquire_source_collection_lock", {
    p_source_id: target.sourceId,
    p_owner: owner,
    p_lock_seconds: lockSecondsFor(options),
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.acquired) return { acquired: true };

  const lockOwner = row?.lock_owner ? String(row.lock_owner) : "其他节点";
  const lockUntil = row?.lock_until ? String(row.lock_until) : null;
  return {
    acquired: false,
    message: lockUntil
      ? `已有采集节点 ${lockOwner} 正在处理，锁定到 ${lockUntil}。`
      : `已有采集节点 ${lockOwner} 正在处理。`,
  };
}

async function releaseCollectionLock(target, owner, logger) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.rpc("release_source_collection_lock", {
    p_source_id: target.sourceId,
    p_owner: owner,
  });
  if (error) logger?.error(`Failed to release lock: ${errorMessage(error)}`);
}

function lockSecondsFor(options = {}) {
  const value = Number(options.lockSeconds || options["lock-seconds"] || DEFAULT_LOCK_SECONDS);
  if (!Number.isFinite(value)) return DEFAULT_LOCK_SECONDS;
  return Math.max(60, Math.min(Math.trunc(value), 3600));
}

function inferCollectorKind(host, text = "") {
  for (const entry of collectorRegistry.kinds) {
    if (collectorHostsForKind(entry.kind).has(host)) return entry.kind;
  }
  if (text.includes("burstpro")) return "dujiao";
  return null;
}

function normalizeCollectorKind(value) {
  const text = String(value || "").trim();
  return collectorKindValues().includes(text)
    ? text
    : null;
}

function collectorHostsForKind(kind) {
  return new Set(
    (collectorRegistry.kinds.find((entry) => entry.kind === kind)?.hosts || [])
      .map((host) => normalizeHostname(host)),
  );
}

function collectorKindValues() {
  return [
    "auto",
    ...collectorRegistry.kinds.map((entry) => entry.kind),
    "browser",
    "unsupported",
  ];
}

function publicProductUrl(target, product) {
  const id = product.id || product.slug || product.key;
  if (!id) return target.sourceUrl;
  if (normalizeHostname(target.baseUrl) === "catcard.uk") return `${target.baseUrl}/#product-${encodeURIComponent(String(id))}`;
  return `${target.baseUrl}/#${encodeURIComponent(String(id))}`;
}

function maxAttemptsFor(options = {}) {
  const value = Number(options.retries || options.retry || 3);
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(Math.trunc(value), 5));
}

function concurrencyFor(options = {}) {
  const value = Number(
    options.concurrency ||
      options["concurrency"] ||
      process.env.PRICEAI_COLLECT_CONCURRENCY ||
      env.PRICEAI_COLLECT_CONCURRENCY ||
      DEFAULT_CONCURRENCY,
  );
  if (!Number.isFinite(value)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(Math.trunc(value), 8));
}

function retryDelayMs(attempt) {
  return Math.min(1_000 * 2 ** (attempt - 1), 5_000);
}

function pageDelayMsFor(options = {}) {
  const value = Number(
    options.pageDelayMs ||
      options["page-delay-ms"] ||
      process.env.PRICEAI_COLLECT_PAGE_DELAY_MS ||
      env.PRICEAI_COLLECT_PAGE_DELAY_MS ||
      DEFAULT_PAGE_DELAY_MS,
  );
  if (!Number.isFinite(value)) return DEFAULT_PAGE_DELAY_MS;
  return Math.max(0, Math.min(Math.trunc(value), 5_000));
}

async function waitBetweenPages(options = {}) {
  const delayMs = pageDelayMsFor(options);
  if (delayMs > 0) await delay(delayMs);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printTargetList(targets) {
  console.table(
    targets.map((target) => ({
      id: target.sourceId,
      name: target.sourceName,
      kind: target.kind || "unsupported",
      configured: target.configuredKind || "auto",
      url: target.sourceUrl,
      seedItems: target.rawOffers.length,
    })),
  );
}

function printOfferPreview(offers) {
  console.table(
    offers.slice(0, 8).map((offer) => ({
      title: offer.sourceTitle.slice(0, 42),
      price: offer.price,
      status: offer.status,
      stock: offer.stockCount,
      minOrder: offer.minOrderQuantity,
      bulkTiers: offer.bulkPricingTiers?.length || 0,
      store: offer.sourceStoreName,
    })),
  );
  if (offers.length > 8) console.log(`... ${offers.length - 8} more`);
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. collect-prices requires the service role key for Supabase reads and writes.");
  }
  if (!url && key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. collect-prices cannot use SUPABASE_SERVICE_ROLE_KEY without the Supabase URL.");
  }
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function fetchJson(url) {
  const response = await safeFetch(url, {
    headers: defaultHeaders(url),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return parseJsonResponse(response, url);
}

async function fetchText(url) {
  const response = await safeFetch(url, {
    headers: defaultHeaders(url),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function postJson(url, body, referer) {
  const response = await safeFetch(url, {
    method: "POST",
    headers: {
      ...defaultHeaders(referer || url),
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      visitorid: `probe${Math.random().toString(36).slice(2, 10)}`,
      referer: referer || url,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return parseJsonResponse(response, url);
}

async function parseJsonResponse(response, url) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (/<html|<script|captcha|verify|challenge|验证|风控|安全/i.test(text)) {
      throw new Error(`${url} 返回验证或风控页面，需要改用本机浏览器采集。`);
    }
    throw new Error(`${url} 返回了非 JSON 内容，暂时无法自动采集。`);
  }
}

function defaultHeaders(url) {
  return {
    accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
    referer: deriveBaseUrl(url) || url,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };
}

function statusFromStock(stockCount) {
  if (typeof stockCount === "number") {
    if (stockCount <= 0) return "out_of_stock";
    if (stockCount <= 3) return "low_stock";
    return "in_stock";
  }

  return "in_stock";
}

function localized(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "object") {
    return cleanText(value["zh-CN"] || value["zh-TW"] || value["en-US"] || Object.values(value).find(Boolean) || "");
  }

  return cleanText(String(value));
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(quot|amp|lt|gt|apos|#039);/gi, (match) => decodeHtmlEntities(match))
    .replace(/&nbsp;/g, " ")
    .replace(/&#x?[a-f0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/gi, `"`)
    .replace(/&#039;/g, `'`)
    .replace(/&apos;/gi, `'`)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
  return cleanText(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  );
}

function isNonComparableTitle(title) {
  return ["Logo", "打赏", "测试", "公告", "请查看上方店铺", "其他（直接联系客服"].some((keyword) =>
    title.includes(keyword),
  );
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numericText = String(value).replace(/[^\d.-]/g, "");
  if (!numericText || numericText === "-" || numericText === "." || numericText === "-.") return null;
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampFromShopApiValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const milliseconds = parsed > 10_000_000_000 ? parsed : parsed * 1000;
  const date = new Date(milliseconds);
  const now = Date.now();
  if (!Number.isFinite(date.getTime()) || date.getTime() > now + 86_400_000) return null;
  return date.toISOString();
}

function compact(values) {
  return values
    .map((value) => cleanText(value || ""))
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeOffers(offers) {
  const map = new Map();
  for (const offer of offers) {
    map.set(stableOfferInputId(offer), offer);
  }
  return Array.from(map.values());
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

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function absolutize(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function deriveBaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function normalizeHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value || "").replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase();
  }
}

function sourceNameFromUrl(value) {
  try {
    const url = new URL(value);
    const token = shopTokenFromUrl(value);
    if (url.hostname === "ai666.dnxb.cc") return "T佬的gmail批发渠道";
    if (token && url.hostname === "pay.ldxp.cn") return `LDXP / ${token}`;
    if (token && url.hostname === "pay.qxvx.cn") return `QXVX / ${token}`;
    if (token && url.hostname === "catfk.com") return `云猫寄售 / ${token}`;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Submitted Source";
  }
}

function sourceIdFrom(name, value) {
  const text = `${name || ""}-${normalizeHostname(value) || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return text || `source-${Date.now()}`;
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

function goodsKeyFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/item\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
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

function isCli() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}
