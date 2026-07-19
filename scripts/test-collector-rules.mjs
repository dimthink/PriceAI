import assert from "node:assert/strict";

import {
  applySourceBuyerFeePolicy,
  assignShopCollectionSchedulerShard,
  blackcatWholesaleActionIdFromChunk,
  blockShopApiDirectExitForTarget,
  calculateShopApiBuyerAdjustment,
  createShopApiProxyReusePool,
  extractProxyLeaseFromPayload,
  isDailyProbeFailure,
  isWeeklyProbeFailure,
  isShopApiDirectExitBlockedForTarget,
  isShopApiExitErrorMessage,
  isShopApiProxyTransportErrorMessage,
  isLdxpFailoverErrorMessage,
  normalizeLdxpRuntimeSettings,
  normalizeShopApiItemOfferUrl,
  rewriteLdxpUrlHost,
  resolveShopApiFeeModel,
  alternateLdxpHost,
  selectTargets,
  shopApiFullSnapshotEvidenceReliable,
  shopApiSnapshotReportedGoodsCount,
  shopApiFeeModelFromChannelRate,
  shopApiProductLevelFeeModel,
  shopApiProxyParallelismFor,
  shopApiStoredFeePolicy,
  selectShopApiPreferredChannel,
} from "./collect-prices.mjs";

assert.deepEqual(shopApiFeeModelFromChannelRate(3), { kind: "fixed_3pct", rate: 0.03 });
assert.deepEqual(shopApiFeeModelFromChannelRate(2.5), { kind: "observed_rate", rate: 0.025 });
assert.deepEqual(shopApiFeeModelFromChannelRate(0), { kind: "no_fee", rate: 0 });

assert.deepEqual(
  applySourceBuyerFeePolicy(
    { buyerFeeRate: 0.04, buyerFeeStrategy: "manual_verified" },
    { price: 117.9 },
  ),
  { price: 122.62, listedPrice: 117.9, feeAmount: 4.72, priceBasis: "modeled" },
);
assert.deepEqual(
  applySourceBuyerFeePolicy(
    { buyerFeeRate: 0.04, buyerFeeStrategy: "manual_verified" },
    { price: 103, listedPrice: 100, feeAmount: 3, priceBasis: "settled" },
  ),
  { price: 103, listedPrice: 100, feeAmount: 3, priceBasis: "settled" },
);

const preferredAlipayChannel = selectShopApiPreferredChannel([
  { id: 9, name: "USDT", rate: 0, status: 1, custom_status: 1 },
  { id: 2, code: "AlipayPc", name: "支付宝电脑收款", rate: 3, status: 1, custom_status: 1 },
  { id: 3, name: "微信", rate: 5, status: 1, custom_status: 1 },
]);
assert.equal(preferredAlipayChannel.id, 2);

assert.deepEqual(
  resolveShopApiFeeModel({
    productLevel: false,
    storedFeePolicy: null,
    productFeePolicy: { status: "confirmed", model: { kind: "fixed_3pct", rate: 0.03 } },
    sampleResults: [
      { listedPrice: 100, effectivePrice: { listedPrice: 100, feeAmount: 4, priceBasis: "settled" } },
    ],
    channelRate: 3,
  }),
  { kind: "observed_rate", rate: 0.04 },
);

assert.equal(calculateShopApiBuyerAdjustment(100, 100), 0);
assert.equal(calculateShopApiBuyerAdjustment(102.8, 100), 2.8);
assert.equal(calculateShopApiBuyerAdjustment(99, 100), 0);

assert.equal(isDailyProbeFailure("店铺接口正常，完整商品快照为空（goods_count=0）。", 3), true);
assert.equal(isDailyProbeFailure("店铺正常但没有商品", 4), true);
assert.equal(isDailyProbeFailure("HTTP 404 from source", 3), false);
assert.equal(isDailyProbeFailure("采集结果为空", 4), false);
assert.equal(isDailyProbeFailure("店铺接口正常，完整商品快照为空（goods_count=0）。", 2), false);
assert.equal(isWeeklyProbeFailure("HTTP 404 from source", 3), true);
assert.equal(isWeeklyProbeFailure("采集结果为空", 4), true);
assert.equal(isWeeklyProbeFailure("fetch failed", 3), true);
assert.equal(isWeeklyProbeFailure("HTTP 403 challenge", 3), true);
assert.equal(isWeeklyProbeFailure("HTTP 468", 3), true);
assert.equal(isWeeklyProbeFailure("HTTP 502", 3), true);
assert.equal(isWeeklyProbeFailure("HTTP 522", 3), true);
assert.equal(isWeeklyProbeFailure("商家已被关闭交易", 3), true);
assert.equal(isWeeklyProbeFailure("域名跳转至运营商警告页", 3), true);
assert.equal(isWeeklyProbeFailure("No shop token found", 3), true);
assert.equal(isWeeklyProbeFailure("未知采集器错误", 3), true);
assert.equal(isWeeklyProbeFailure("HTTP 404 from source", 2), false);
assert.equal(isWeeklyProbeFailure("店铺接口正常，完整商品快照为空（goods_count=0）。", 3), false);
assert.equal(
  blackcatWholesaleActionIdFromChunk(
    'createServerReference)("00fc36c4f4551a0ad0887d0946a6c93bc94960dfaf",callServer,void 0,findSourceMapURL,"fetchWholesaleProductsAction")',
  ),
  "00fc36c4f4551a0ad0887d0946a6c93bc94960dfaf",
);
assert.equal(blackcatWholesaleActionIdFromChunk("unrelated chunk"), null);
assert.equal(isShopApiExitErrorMessage("HTTP 520 from upstream"), true);
assert.equal(isShopApiExitErrorMessage("HTTP 403 from upstream"), true);
assert.equal(isShopApiProxyTransportErrorMessage("fetch failed: ECONNRESET: socket closed"), true);
assert.equal(isShopApiProxyTransportErrorMessage("fetch failed: UND_ERR_CONNECT_TIMEOUT"), true);
assert.equal(isShopApiProxyTransportErrorMessage("fetch failed"), false);
assert.equal(isShopApiProxyTransportErrorMessage("Shop info unavailable for token shop"), false);
assert.deepEqual(normalizeLdxpRuntimeSettings(null), {
  mode: "auto",
  activeHost: "www.ldxp.cn",
  lastSwitchedAt: null,
  lastSwitchReason: null,
});
assert.equal(normalizeLdxpRuntimeSettings({ mode: "pay", activeHost: "www.ldxp.cn" }).activeHost, "pay.ldxp.cn");
assert.equal(alternateLdxpHost("www.ldxp.cn"), "pay.ldxp.cn");
assert.equal(alternateLdxpHost("pay.ldxp.cn"), "www.ldxp.cn");
assert.equal(
  rewriteLdxpUrlHost("https://pay.ldxp.cn/item/abc123?channel=9#buy", "www.ldxp.cn"),
  "https://www.ldxp.cn/item/abc123?channel=9#buy",
);
assert.equal(normalizeShopApiItemOfferUrl("https://www.ldxp.cn/item/abc123"), "https://pay.ldxp.cn/item/abc123");
assert.equal(isLdxpFailoverErrorMessage("returned HTTP 520"), true);
assert.equal(isLdxpFailoverErrorMessage("fetch failed: UND_ERR_CONNECT_TIMEOUT"), true);
assert.equal(isLdxpFailoverErrorMessage("returned HTTP 403 (denied by http_ratelimit)"), false);
assert.equal(isLdxpFailoverErrorMessage("returned HTTP 429"), false);
assert.equal(shopApiSnapshotReportedGoodsCount(78, 79), 78);
assert.equal(shopApiSnapshotReportedGoodsCount(null, 79), 79);
assert.equal(
  shopApiFullSnapshotEvidenceReliable(Array(80), {
    reportedGoodsCount: 100,
    fetchedItemCount: 80,
    rawSeenOfferCount: 80,
    publishedItemCount: 80,
  }),
  true,
);
assert.equal(
  shopApiFullSnapshotEvidenceReliable(Array(79), {
    reportedGoodsCount: 100,
    fetchedItemCount: 79,
    rawSeenOfferCount: 79,
    publishedItemCount: 79,
  }),
  false,
);
assert.equal(
  shopApiFullSnapshotEvidenceReliable(Array(80), {
    reportedGoodsCount: 100,
    fetchedItemCount: 80,
    rawSeenOfferCount: 81,
    publishedItemCount: 80,
  }),
  false,
);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 9), 1);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 30), 1);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 31), 2);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 90), 2);

const mixedYunmaoFeeModel = shopApiProductLevelFeeModel(0, [
  { listedPrice: 100, effectivePrice: { listedPrice: 100, feeAmount: 0, priceBasis: "settled" } },
  { listedPrice: 10, effectivePrice: { listedPrice: 10, feeAmount: 0.18, priceBasis: "settled" } },
  { listedPrice: 1, effectivePrice: { listedPrice: 1, feeAmount: 0, priceBasis: "settled" } },
]);
assert.deepEqual(mixedYunmaoFeeModel, { kind: "observed_rate", rate: 0.018 });
assert.deepEqual(
  shopApiProductLevelFeeModel(0, [
    { listedPrice: 100, effectivePrice: { listedPrice: 100, feeAmount: 0, priceBasis: "settled" } },
  ]),
  { kind: "no_fee", rate: 0 },
);

const proxyLease = extractProxyLeaseFromPayload(
  JSON.stringify({ data: [{ ip: "203.0.113.10:54103", expireTimeMillis: Date.now() + 600_000 }] }),
);
assert.equal(proxyLease.proxyUrl, "http://203.0.113.10:54103");
assert.ok(proxyLease.expiresAt > Date.now());

const proxyReusePool = createShopApiProxyReusePool({ shopApiProxyReuseLimit: 0 });
const proxyStateOptions = { shopApiProxyReusePool: proxyReusePool };
const liandongTarget = { sourceId: "ldxp-shop", baseUrl: "https://pay.ldxp.cn" };
assert.equal(isShopApiDirectExitBlockedForTarget(liandongTarget, proxyStateOptions), false);
blockShopApiDirectExitForTarget(liandongTarget, proxyStateOptions);
assert.equal(isShopApiDirectExitBlockedForTarget(liandongTarget, proxyStateOptions), true);
assert.equal(
  isShopApiDirectExitBlockedForTarget({ sourceId: "yunmao", baseUrl: "https://catfk.com" }, proxyStateOptions),
  false,
);

const future = new Date(Date.now() + 60_000).toISOString();
assert.equal(shopApiStoredFeePolicy([{ shop_token: "shop", rate: 0, sample_selection: "high_price_probe", expires_at: future }], "shop"), null);
assert.deepEqual(
  shopApiStoredFeePolicy([{ shop_token: "shop", rate: 0, sample_selection: "manual_verified", observed_at: future, expires_at: future }], "shop")?.model,
  { kind: "no_fee", rate: 0 },
);
assert.deepEqual(
  shopApiStoredFeePolicy(
    [{ shopToken: "shop", rate: 0.04, sampleSelection: "high_price_probe", observedAt: future, expiresAt: future }],
    "shop",
    { allowHighPriceProbe: true },
  )?.model,
  { kind: "observed_rate", rate: 0.04 },
);

const assignment = new Map([["source-a", 1]]);
assert.equal(
  assignShopCollectionSchedulerShard(
    { sourceId: "source-a", sourceName: "A" },
    { count: 2, index: 1 },
    assignment,
  ).schedulerShardIndex,
  1,
);

const shardZero = assignShopCollectionSchedulerShard(
  { sourceId: "source-a", sourceName: "A" },
  { count: 2, index: 0 },
  assignment,
);
assert.equal(shardZero.shardMatches, false);

const excludedSources = selectTargets(
  [
    { sourceId: "source-a", sourceName: "A", sourceUrl: "https://a.example", kind: "kami" },
    { sourceId: "source-b", sourceName: "B", sourceUrl: "https://b.example", kind: "kami" },
  ],
  { all: true, excludeSource: "source-a" },
);
assert.deepEqual(excludedSources.map((target) => target.sourceId), ["source-b"]);

console.log("collector rules: ok");
