export type PublicSnapshotRefreshOutcome = {
  explorer?: boolean;
  offers?: boolean;
  merchants?: boolean;
  productOffers: Array<{ key: string; ok: boolean }>;
  productIds: string[];
};

export type PublicSnapshotRefreshFailures = {
  failedGlobalKinds: Array<"explorer" | "offers" | "merchants">;
  failedProductIds: string[];
  ok: boolean;
};

export function inspectPublicSnapshotRefreshFailures(
  result: PublicSnapshotRefreshOutcome,
  refreshGlobal: boolean,
): PublicSnapshotRefreshFailures {
  const failedGlobalKinds = refreshGlobal
    ? (["explorer", "offers", "merchants"] as const).filter((kind) => result[kind] !== true)
    : [];
  const failedProductIds = result.productIds.filter((_, index) => result.productOffers[index]?.ok !== true);

  return {
    failedGlobalKinds,
    failedProductIds,
    ok: failedGlobalKinds.length === 0 && failedProductIds.length === 0,
  };
}

export function mergePendingPublicSnapshotProductIds({
  fullRefreshAttempted,
  previousAffectedProductIds,
  previousFullRefreshRequired,
  processedProductIds,
  remainingProductIds,
}: {
  fullRefreshAttempted: boolean;
  previousAffectedProductIds: string[];
  previousFullRefreshRequired: boolean;
  processedProductIds: string[];
  remainingProductIds: string[];
}): string[] {
  const processed = new Set(processedProductIds);
  const pendingPreviousIds = fullRefreshAttempted
    ? []
    : previousFullRefreshRequired
      ? previousAffectedProductIds
      : previousAffectedProductIds.filter((id) => !processed.has(id));

  return Array.from(new Set([...pendingPreviousIds, ...remainingProductIds]));
}
