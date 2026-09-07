import assert from "node:assert/strict";

import {
  inspectPublicSnapshotRefreshFailures,
  mergePendingPublicSnapshotProductIds,
} from "../src/lib/public-snapshot-refresh";

const healthyFullRefresh = inspectPublicSnapshotRefreshFailures({
  explorer: true,
  offers: true,
  merchants: true,
  productIds: ["chatgpt-plus", "claude-pro"],
  productOffers: [
    { key: "chatgpt-plus", ok: true },
    { key: "claude-pro", ok: true },
  ],
}, true);
assert.deepEqual(healthyFullRefresh, {
  failedGlobalKinds: [],
  failedProductIds: [],
  ok: true,
});

const failedFullRefresh = inspectPublicSnapshotRefreshFailures({
  explorer: false,
  offers: true,
  merchants: undefined,
  productIds: ["chatgpt-plus", "claude-pro"],
  productOffers: [
    { key: "chatgpt-plus", ok: false },
    { key: "claude-pro", ok: true },
  ],
}, true);
assert.deepEqual(failedFullRefresh, {
  failedGlobalKinds: ["explorer", "merchants"],
  failedProductIds: ["chatgpt-plus"],
  ok: false,
});

const failedIncrementalRefresh = inspectPublicSnapshotRefreshFailures({
  productIds: ["gemini-pro"],
  productOffers: [{ key: "gemini-pro", ok: false }],
}, false);
assert.deepEqual(failedIncrementalRefresh, {
  failedGlobalKinds: [],
  failedProductIds: ["gemini-pro"],
  ok: false,
});

assert.deepEqual(mergePendingPublicSnapshotProductIds({
  fullRefreshAttempted: false,
  previousAffectedProductIds: [],
  previousFullRefreshRequired: false,
  processedProductIds: [],
  remainingProductIds: ["source-derived-product"],
}), ["source-derived-product"], "source/offer-derived product failures must remain actionable");

assert.deepEqual(mergePendingPublicSnapshotProductIds({
  fullRefreshAttempted: false,
  previousAffectedProductIds: ["done", "still-pending"],
  previousFullRefreshRequired: false,
  processedProductIds: ["done"],
  remainingProductIds: ["failed", "still-pending"],
}), ["still-pending", "failed"], "processed products should clear while remaining failures stay queued");

assert.deepEqual(mergePendingPublicSnapshotProductIds({
  fullRefreshAttempted: true,
  previousAffectedProductIds: ["old-scope"],
  previousFullRefreshRequired: true,
  processedProductIds: ["first-batch"],
  remainingProductIds: ["second-batch", "third-batch"],
}), ["second-batch", "third-batch"], "a failed global snapshot must not restart a successfully expanded product queue");

console.log("public snapshot refresh failure tests passed");
