import assert from "node:assert/strict";

import {
  assignShopCollectionSchedulerShard,
  blockShopApiDirectExitForTarget,
  calculateShopApiBuyerAdjustment,
  createShopApiProxyReusePool,
  extractProxyLeaseFromPayload,
  isDailyProbeFailure,
  isShopApiDirectExitBlockedForTarget,
  isShopApiExitErrorMessage,
  isShopApiProxyTransportErrorMessage,
  shopApiFeeModelFromChannelRate,
  shopApiProxyParallelismFor,
  shopApiStoredFeePolicy,
} from "./collect-prices.mjs";

assert.deepEqual(shopApiFeeModelFromChannelRate(3), { kind: "fixed_3pct", rate: 0.03 });
assert.deepEqual(shopApiFeeModelFromChannelRate(2.5), { kind: "observed_rate", rate: 0.025 });
assert.deepEqual(shopApiFeeModelFromChannelRate(0), { kind: "no_fee", rate: 0 });

assert.equal(calculateShopApiBuyerAdjustment(100, 100), 0);
assert.equal(calculateShopApiBuyerAdjustment(102.8, 100), 2.8);
assert.equal(calculateShopApiBuyerAdjustment(99, 100), 0);

assert.equal(isDailyProbeFailure("HTTP 404 from source", 3), true);
assert.equal(isDailyProbeFailure("采集结果为空", 4), true);
assert.equal(isDailyProbeFailure("HTTP 404 from source", 2), false);
assert.equal(isDailyProbeFailure("403 challenge", 5), false);
assert.equal(isShopApiExitErrorMessage("HTTP 520 from upstream"), true);
assert.equal(isShopApiExitErrorMessage("HTTP 403 from upstream"), true);
assert.equal(isShopApiProxyTransportErrorMessage("fetch failed: ECONNRESET: socket closed"), true);
assert.equal(isShopApiProxyTransportErrorMessage("fetch failed: UND_ERR_CONNECT_TIMEOUT"), true);
assert.equal(isShopApiProxyTransportErrorMessage("fetch failed"), false);
assert.equal(isShopApiProxyTransportErrorMessage("Shop info unavailable for token shop"), false);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 9), 1);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 30), 1);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 31), 2);
assert.equal(shopApiProxyParallelismFor({ shopApiProxyParallelism: "auto" }, 90), 2);

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

console.log("collector rules: ok");
