#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  acquireCollectionLock,
  closeShopApiProxyReusePool,
  collectTargetWithRetries,
  createShopApiProxyReusePool,
  loadTargets,
  postCrawlLog,
  releaseCollectionLock,
  stableHashInt,
  stableOfferInputId,
} from "./collect-prices.mjs";

export const HOT_OFFER_SLICES = Object.freeze([
  { id: "plus-default", productId: "chatgpt-plus", tag: null },
  { id: "plus-unverified", productId: "chatgpt-plus", tag: "account_unverified" },
  { id: "plus-verified", productId: "chatgpt-plus", tag: "account_verified" },
  { id: "team-default", productId: "chatgpt-team-business", tag: null },
  { id: "team-bug", productId: "chatgpt-team-business", tag: "team_bug" },
]);

const DEFAULT_SLICE_LIMIT = 20;
const DEFAULT_HARD_LIMIT = 120;
const DEFAULT_MAX_DURATION_MS = 270_000;
const DEFAULT_RECENT_REUSE_MS = 90_000;
const DEFAULT_REQUEST_DELAY_MS = 1_500;
const DEFAULT_PRICE_TOLERANCE = 0.05;

export async function runHotOfferVerification(options = {}) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const mode = normalizeMode(options.mode);
  const endpoint = String(options.endpoint || process.env.CRON_PUBLIC_BASE_URL || "https://priceai.cc").replace(/\/$/, "");
  const nodeCount = integerInRange(options.nodeCount ?? process.env.PRICEAI_HOT_VERIFY_NODE_COUNT, 1, 16, 2);
  const nodeIndex = integerInRange(options.nodeIndex ?? process.env.PRICEAI_HOT_VERIFY_NODE_INDEX, 0, nodeCount - 1, 0);
  const nodeId = String(options.nodeId || process.env.PRICEAI_COLLECTOR_NODE_ID || `hot-node-${nodeIndex}`).trim();
  const sliceLimit = integerInRange(options.sliceLimit, 1, 50, DEFAULT_SLICE_LIMIT);
  const hardLimit = integerInRange(options.hardLimit, 1, 500, DEFAULT_HARD_LIMIT);
  const maxDurationMs = integerInRange(options.maxDurationMs, 30_000, 15 * 60_000, DEFAULT_MAX_DURATION_MS);
  const recentReuseMs = integerInRange(options.recentReuseMs, 0, 10 * 60_000, DEFAULT_RECENT_REUSE_MS);
  const requestDelayMs = integerInRange(options.requestDelayMs, 0, 30_000, DEFAULT_REQUEST_DELAY_MS);
  const takeoverAfterMs = integerInRange(
    options.takeoverAfterMs,
    0,
    60 * 60_000,
    mode === "write" ? 10 * 60_000 : 0,
  );
  const lockOwner = `${nodeId}:hot:${startedAt.replace(/\D/g, "").slice(0, 14)}`;
  const proxyPool = createShopApiProxyReusePool({
    shopApiProxyReuseLimit: options.proxyReuseLimit ?? 0,
    shopApiProxyReuseTtlMs: options.proxyReuseTtlMs ?? 240_000,
  });
  const collectorOptions = {
    endpoint,
    password: options.password,
    lockSeconds: Math.ceil(maxDurationMs / 1000) + 30,
    shopApiProxyMode: "on-exit",
    shopApiProxyParallelism: 1,
    shopApiProxyReusePool: proxyPool,
    shopApiProxyLogger: console,
    collectorNodeId: nodeId,
    collectorNodeName: options.nodeName || process.env.PRICEAI_COLLECTOR_NODE_NAME || nodeId,
    collectorNodeType: "vps",
    collectorNodeRuntime: "systemd-hot-verifier",
    collectorNodeRegion: options.nodeRegion || process.env.PRICEAI_COLLECTOR_NODE_REGION || "cn",
    pageDelayMs: requestDelayMs,
  };

  try {
    const sliceResults = await fetchHotOfferSlices({ endpoint, sliceLimit, fetchImpl: options.fetchImpl || fetch });
    const candidates = mergeHotOfferCandidates(sliceResults, { hardLimit });
    const primaryAssigned = candidates.filter((candidate) => hotOfferShardIndex(candidate, nodeCount) === nodeIndex);
    const takeoverAssigned = takeoverAfterMs > 0
      ? candidates.filter((candidate) =>
          hotOfferShardIndex(candidate, nodeCount) !== nodeIndex && candidateAgeMs(candidate) > takeoverAfterMs)
      : [];
    const assigned = mergeCandidateLists(primaryAssigned, takeoverAssigned);
    const targetBySourceId = new Map((await loadTargets()).map((target) => [target.sourceId, target]));
    const groups = groupCandidatesBySource(assigned);
    const summary = {
      mode,
      nodeId,
      nodeIndex,
      nodeCount,
      sliceCount: sliceResults.length,
      candidateCount: candidates.length,
      assignedCount: assigned.length,
      takeoverCount: takeoverAssigned.length,
      sourceCount: groups.length,
      reusedCount: 0,
      verifiedCount: 0,
      changedCount: 0,
      writtenCount: 0,
      skippedCount: 0,
      failedCount: 0,
      proxyCount: 0,
      deadlineReached: false,
      startedAt,
      finishedAt: null,
    };

    console.log(JSON.stringify({ event: "hot-verification-plan", ...summary }));

    for (const group of groups) {
      if (Date.now() - startedAtMs >= maxDurationMs) {
        summary.deadlineReached = true;
        break;
      }

      const target = targetBySourceId.get(group.sourceId);
      if (!target || !["shopApi", "kami", "dujiao"].includes(target.kind)) {
        summary.skippedCount += group.candidates.length;
        console.log(JSON.stringify({
          event: "hot-verification-skip",
          sourceId: group.sourceId,
          reason: target ? `unsupported-collector:${target.kind}` : "source-not-found",
          candidateCount: group.candidates.length,
        }));
        continue;
      }

      const pending = group.candidates.filter((candidate) => {
        if (!isRecentCandidate(candidate, recentReuseMs)) return true;
        summary.reusedCount += 1;
        console.log(JSON.stringify({
          event: "hot-verification-reuse",
          offerId: candidate.id,
          sourceId: group.sourceId,
          verifiedAt: candidate.verifiedAt || candidate.lastSeenAt || null,
        }));
        return false;
      });
      if (!pending.length) continue;

      const lock = await acquireCollectionLock(target, lockOwner, collectorOptions);
      if (!lock.acquired) {
        summary.skippedCount += pending.length;
        console.log(JSON.stringify({
          event: "hot-verification-skip",
          sourceId: group.sourceId,
          reason: "source-lock-busy",
          message: lock.message || null,
          candidateCount: pending.length,
        }));
        continue;
      }

      const sourceStartedAt = new Date().toISOString();
      const verifiedOffers = [];
      const changedOfferIds = [];
      let sourceRequestRoute = "direct";
      try {
        let collected;
        try {
          collected = await collectTargetWithRetries(target, {
            ...collectorOptions,
            ...(target.kind === "shopApi"
              ? { shopApiListMode: "all_goods", shopApiPriceSampleSize: 0 }
              : {}),
          }, console);
        } catch (error) {
          summary.failedCount += pending.length;
          console.error(JSON.stringify({
            event: "hot-verification-source-error",
            sourceId: group.sourceId,
            collectorKind: target.kind,
            message: errorMessage(error),
          }));
          continue;
        }

        sourceRequestRoute = collected.details?.shopApiRequestRoute || "direct";
        if (sourceRequestRoute === "proxy") {
          summary.proxyCount += 1;
        }
        const structuredOffersById = new Map(
          selectHotVerifiedOffers(pending, collected.offers)
            .map(({ candidate, offer }) => [candidate.id, offer]),
        );
        const incompleteCollection = collected.details?.fullSnapshot === false;

        for (let index = 0; index < pending.length; index += 1) {
          if (Date.now() - startedAtMs >= maxDurationMs) {
            summary.deadlineReached = true;
            break;
          }

          const candidate = pending[index];
          try {
            const structuredOffer = structuredOffersById.get(candidate.id) || null;
            const result = structuredOffer
              ? { status: "verified", route: sourceRequestRoute, message: "结构化来源候选核验成功。", offer: structuredOffer }
              : {
                  status: "inconclusive",
                  route: sourceRequestRoute,
                  message: incompleteCollection
                    ? `结构化来源列表不完整，本次未匹配候选，暂不改变公开状态：${collected.details?.partialReason || "partial"}`
                    : "结构化来源本次未返回该候选，暂不改变公开状态。",
                  offer: null,
                };
            if (result.status !== "verified" || !result.offer) {
              summary.skippedCount += 1;
              console.log(JSON.stringify({
                event: "hot-verification-inconclusive",
                offerId: candidate.id,
                sourceId: group.sourceId,
                route: result.route,
                message: result.message,
              }));
            } else {
              const diff = hotOfferDiff(candidate, result.offer);
              summary.verifiedCount += 1;
              if (Object.keys(diff).length) {
                summary.changedCount += 1;
                changedOfferIds.push(candidate.id);
              }
              verifiedOffers.push(result.offer);
              console.log(JSON.stringify({
                event: "hot-verification-result",
                offerId: candidate.id,
                sourceId: group.sourceId,
                route: result.route,
                mode,
                diff,
                message: result.message,
              }));
            }
          } catch (error) {
            summary.failedCount += 1;
            console.error(JSON.stringify({
              event: "hot-verification-error",
              offerId: candidate.id,
              sourceId: group.sourceId,
              message: errorMessage(error),
            }));
          }
        }

        if (mode === "write" && verifiedOffers.length) {
          const collectedAt = new Date().toISOString();
          const posted = await postCrawlLog(
            target,
            verifiedOffers,
            "success",
            `热门报价单链接核验完成：确认 ${verifiedOffers.length} 条，变化 ${changedOfferIds.length} 条。`,
            collectorOptions,
            {
              collectionStartedAt: sourceStartedAt,
              collectedAt,
              fullSnapshot: false,
              hotVerification: true,
              hotVerificationMode: mode,
              candidateCount: pending.length,
              changedOfferIds,
              shopApiRequestRoute: sourceRequestRoute,
            },
          );
          summary.writtenCount += Number(posted.writtenCount || 0) + Number(posted.refreshedCount || 0);
        }
      } finally {
        await releaseCollectionLock(target, lockOwner, console);
      }
    }

    summary.finishedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: "hot-verification-summary", ...summary }));
    return summary;
  } finally {
    await closeShopApiProxyReusePool(proxyPool);
  }
}

export async function fetchHotOfferSlices({ endpoint, sliceLimit = DEFAULT_SLICE_LIMIT, fetchImpl = fetch }) {
  return Promise.all(HOT_OFFER_SLICES.map(async (slice) => {
    const url = new URL(`/api/products/${encodeURIComponent(slice.productId)}/offers`, endpoint);
    url.searchParams.set("limit", String(sliceLimit));
    url.searchParams.set("offset", "0");
    if (slice.tag) url.searchParams.set("tags", slice.tag);
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "PriceAI-Hot-Offer-Verifier/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${slice.id} candidates returned HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.offers)) throw new Error(`${slice.id} candidates returned an invalid payload`);
    return { ...slice, offers: body.offers };
  }));
}

export function mergeHotOfferCandidates(sliceResults, { hardLimit = DEFAULT_HARD_LIMIT } = {}) {
  const byId = new Map();
  for (const slice of sliceResults) {
    for (let rank = 0; rank < (slice.offers || []).length; rank += 1) {
      const offer = slice.offers[rank];
      const id = String(offer?.id || "").trim();
      if (!id) continue;
      const existing = byId.get(id);
      if (existing) {
        existing.hotSlices.push({ id: slice.id, rank: rank + 1 });
        continue;
      }
      byId.set(id, {
        ...offer,
        hotProductId: slice.productId,
        hotSlices: [{ id: slice.id, rank: rank + 1 }],
      });
    }
  }
  return [...byId.values()].slice(0, Math.max(1, hardLimit));
}

export function hotOfferShardIndex(candidate, nodeCount) {
  const sourceKey = candidate?.sourceId || candidate?.id || "unknown";
  return stableHashInt(sourceKey) % Math.max(1, nodeCount);
}

export function groupCandidatesBySource(candidates) {
  const bySource = new Map();
  for (const candidate of candidates) {
    const sourceId = String(candidate?.sourceId || "").trim();
    if (!sourceId) continue;
    const current = bySource.get(sourceId) || { sourceId, candidates: [] };
    current.candidates.push(candidate);
    bySource.set(sourceId, current);
  }
  return [...bySource.values()];
}

export function hotOfferDiff(current, verified) {
  const diff = {};
  if (!priceWithinRelativeTolerance(current?.price, verified?.price, DEFAULT_PRICE_TOLERANCE)) {
    diff.price = { from: numberOrNull(current?.price), to: numberOrNull(verified?.price) };
  }
  if (!sameNumber(current?.stockCount, verified?.stockCount)) diff.stockCount = { from: numberOrNull(current?.stockCount), to: numberOrNull(verified?.stockCount) };
  if (String(current?.status || "unknown") !== String(verified?.status || "unknown")) {
    diff.status = { from: current?.status || "unknown", to: verified?.status || "unknown" };
  }
  if (String(current?.effectiveStatus || "") !== String(verified?.effectiveStatus || "")) {
    diff.effectiveStatus = { from: current?.effectiveStatus || null, to: verified?.effectiveStatus || null };
  }
  return diff;
}

export function selectHotVerifiedOffers(candidates, collectedOffers) {
  const collectedById = new Map(
    (collectedOffers || []).map((offer) => [stableOfferInputId(offer), offer]),
  );

  return (candidates || []).flatMap((candidate) => {
    const collected = collectedById.get(candidate?.id);
    return collected
      ? [{ candidate, offer: normalizeHotVerifiedOffer(candidate, collected) }]
      : [];
  });
}

export function normalizeHotVerifiedOffer(current, verified, { priceTolerance = DEFAULT_PRICE_TOLERANCE } = {}) {
  const normalized = { ...verified };
  if (priceWithinRelativeTolerance(current?.price, verified?.price, priceTolerance)) {
    for (const field of ["price", "listedPrice", "feeAmount", "priceBasis"]) {
      if (Object.hasOwn(current || {}, field)) normalized[field] = current[field];
    }
  }

  const verifiedStock = numberOrNull(verified?.stockCount);
  const explicitlyUnavailable =
    String(verified?.status || "") === "out_of_stock" ||
    String(verified?.effectiveStatus || "") === "unavailable";

  if (verifiedStock === null && !explicitlyUnavailable) {
    for (const field of ["stockCount", "status", "effectiveStatus", "failureReason"]) {
      if (Object.hasOwn(current || {}, field)) normalized[field] = current[field];
    }
  } else if (verifiedStock === 0) {
    normalized.status = "out_of_stock";
    normalized.effectiveStatus = "unavailable";
    normalized.failureReason ||= "热门报价核验：源站全店列表明确库存为 0";
  }

  return normalized;
}

function priceWithinRelativeTolerance(current, verified, tolerance) {
  const currentPrice = numberOrNull(current);
  const verifiedPrice = numberOrNull(verified);
  if (currentPrice === null && verifiedPrice === null) return true;
  if (currentPrice === null || verifiedPrice === null) return false;
  if (currentPrice === 0) return verifiedPrice === 0;
  return Math.abs(verifiedPrice - currentPrice) / Math.abs(currentPrice) <= tolerance + Number.EPSILON;
}

function isRecentCandidate(candidate, recentReuseMs) {
  if (recentReuseMs <= 0) return false;
  const timestamp = Date.parse(candidate?.verifiedAt || candidate?.lastSeenAt || "");
  return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp <= recentReuseMs;
}

function candidateAgeMs(candidate) {
  const timestamp = Date.parse(candidate?.verifiedAt || candidate?.lastSeenAt || "");
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : Number.POSITIVE_INFINITY;
}

function mergeCandidateLists(...lists) {
  const byId = new Map();
  for (const candidate of lists.flat()) {
    if (candidate?.id && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return [...byId.values()];
}

function normalizeMode(value) {
  return String(value || process.env.PRICEAI_HOT_VERIFY_MODE || "shadow").toLowerCase() === "write" ? "write" : "shadow";
}

function integerInRange(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameNumber(left, right) {
  const leftNumber = numberOrNull(left);
  const rightNumber = numberOrNull(right);
  if (leftNumber === null || rightNumber === null) return leftNumber === rightNumber;
  return Math.abs(leftNumber - rightNumber) < 0.005;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) output[key] = inlineValue;
    else if (values[index + 1] && !values[index + 1].startsWith("--")) output[key] = values[++index];
    else output[key] = true;
  }
  return output;
}

function isCli() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCli()) {
  runHotOfferVerification(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
