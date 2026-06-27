import {
  getAdminPasswordFromRequest,
  rawOfferInputId,
  recordSourceCollectionResult,
  upsertRawOffers,
  upsertSource,
} from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { classifyOffer } from "@/lib/catalog";
import { normalizeCollectorKind } from "@/lib/collector-registry";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminOrCronPassword } from "@/lib/env";
import { pruneOperationalLogs } from "@/lib/operational-logs";
import { getSupabaseServerClient } from "@/lib/supabase";
import { stableId } from "@/lib/utils";
import { z } from "zod";

const offerSchema = z.object({
  sourceId: z.string().min(1).optional(),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceStoreName: z.string().optional(),
  sourceShopCreatedAt: z.string().datetime().nullable().optional(),
  sourceTitle: z.string().min(1),
  price: z.number().nonnegative().nullable().optional(),
  listedPrice: z.number().nonnegative().nullable().optional(),
  feeAmount: z.number().nonnegative().nullable().optional(),
  priceBasis: z.enum(["settled", "listed", "listed_fallback"]).nullable().optional(),
  currency: z.string().optional(),
  status: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]).optional(),
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  stockCount: z.number().int().nullable().optional(),
});

const crawlLogPayloadSchema = z.object({
  sourceId: z.string().min(1).optional(),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceEntryUrl: z.string().url().optional(),
  sourceShopCreatedAt: z.string().datetime().nullable().optional(),
  mode: z.enum(["browser", "http", "manual"]).default("browser"),
  status: z.enum(["success", "partial", "failed", "skipped"]).default("success"),
  message: z.string().optional(),
  offers: z.array(offerSchema).default([]),
  details: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  runs: z.array(crawlLogPayloadSchema).min(1).max(50),
  batch: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    requireAdminOrCronPassword(getAdminPasswordFromRequest(request));

    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置，无法保存采集结果。");

    const rawBody = await request.json();
    const isBatch = rawBody && typeof rawBody === "object" && Array.isArray(rawBody.runs);
    const runs = isBatch ? batchSchema.parse(rawBody).runs : [crawlLogPayloadSchema.parse(rawBody)];
    const results = [];
    let shouldClearCache = false;
    let snapshotRefreshQueued = false;
    const affectedProductIds = new Set<string>();
    const affectedOfferIds = new Set<string>();
    const affectedSourceIds = new Set<string>();

    for (const run of runs) {
      const result = await saveCrawlLogRun(supabase, run);
      results.push(result);
      shouldClearCache = shouldClearCache || result.shouldClearCache;
      for (const id of result.affectedProductIds) affectedProductIds.add(id);
      for (const id of result.affectedOfferIds) affectedOfferIds.add(id);
      for (const id of result.affectedSourceIds) affectedSourceIds.add(id);
    }

    await pruneOperationalLogs(supabase);

    if (shouldClearCache) {
      clearPublicDataCache();
      snapshotRefreshQueued = await markPublicApiSnapshotsDirty("admin crawl log", {
        productIds: [...affectedProductIds],
        offerIds: [...affectedOfferIds],
        sourceIds: [...affectedSourceIds],
        global: false,
        fullOnProductScopeLimitOnly: true,
        preferProductScope: true,
      });
    }

    const totals = aggregateResults(results);
    return Response.json({
      ok: true,
      successCount: totals.successCount,
      writtenCount: totals.writtenCount,
      unchangedCount: totals.unchangedCount,
      refreshedCount: totals.refreshedCount,
      snapshotRefreshQueued,
      runCount: results.length,
      results: isBatch ? results.map(compactResult) : undefined,
    });
  } catch (error) {
    logApiError("admin crawl log", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "记录采集结果失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

async function saveCrawlLogRun(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  payload: z.infer<typeof crawlLogPayloadSchema>,
) {
  const receivedAt = new Date().toISOString();
  const collectedAt = dateFromDetails(payload.details, "collectedAt") || receivedAt;
  const startedAt = dateFromDetails(payload.details, "collectionStartedAt") || receivedAt;
  const source = await upsertSource({
    id: payload.sourceId,
    name: payload.sourceName,
    entryUrl: payload.sourceEntryUrl || payload.sourceUrl,
    collectionMethod: payload.mode,
    collectorKind: collectorKindFromDetails(payload.details),
    shopCreatedAt: payload.sourceShopCreatedAt || shopCreatedAtFromDetails(payload.details),
    notes: "由采集日志自动维护。",
  });
  const offers = payload.offers.map((offer) => ({
    ...offer,
    sourceId: offer.sourceId || payload.sourceId || source.id,
    sourceShopCreatedAt: offer.sourceShopCreatedAt || payload.sourceShopCreatedAt || shopCreatedAtFromDetails(payload.details),
  }));
  const upsertResult = await upsertRawOffers(offers, { collectionMethod: payload.mode, checkedAt: collectedAt });
  const successCount = upsertResult.receivedCount;
  const savedAt = new Date().toISOString();
  const seenOfferIds = seenOfferIdsFromDetails(payload.details) || offers.map(rawOfferInputId);
  const fullSnapshot = fullSnapshotFromDetails(payload.details, payload.status);
  const changedByPayload = upsertResult.writtenCount > 0 || upsertResult.refreshedCount > 0;
  const affectedOfferIds = changedByPayload ? offers.map(rawOfferInputId) : [];
  const affectedProductIds = changedByPayload ? offers.map(productIdFromCrawlOffer) : [];

  const sourceCollectionResult = await recordSourceCollectionResult({
    sourceId: source.id,
    status: payload.status,
    checkedAt: collectedAt,
    message: payload.message || null,
    seenOfferIds,
    fullSnapshot,
  });

  const { error } = await supabase.from("crawl_runs").insert({
    id: stableId(payload.sourceName, payload.sourceUrl, startedAt, crawlLogRunIdSuffix(payload.details, payload.status)),
    source_id: source.id,
    source_name: payload.sourceName,
    mode: payload.mode,
    status: payload.status,
    started_at: startedAt,
    finished_at: collectedAt,
    success_count: successCount,
    failure_count: Math.max(0, payload.offers.length - successCount),
    message: payload.message || `采集到 ${successCount} 条报价，写入 ${upsertResult.writtenCount} 条，刷新 ${upsertResult.refreshedCount} 条。`,
    details: {
      ...(payload.details || {}),
      receivedAt,
      savedAt,
      collectedAt,
      writeStats: {
        receivedCount: upsertResult.receivedCount,
        writtenCount: upsertResult.writtenCount,
        unchangedCount: upsertResult.unchangedCount,
        refreshedCount: upsertResult.refreshedCount,
      },
    },
  });

  if (error) throw error;

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: payload.status,
    successCount,
    writtenCount: upsertResult.writtenCount,
    unchangedCount: upsertResult.unchangedCount,
    refreshedCount: upsertResult.refreshedCount,
    affectedProductIds,
    affectedOfferIds,
    affectedSourceIds: sourceCollectionResult.changedOfferCount > 0 ? [source.id] : [],
    shouldClearCache:
      upsertResult.writtenCount > 0 ||
      upsertResult.refreshedCount > 0 ||
      sourceCollectionResult.changedOfferCount > 0,
  };
}

function aggregateResults(results: Array<{ successCount: number; writtenCount: number; unchangedCount: number; refreshedCount: number }>) {
  return results.reduce(
    (totals, result) => ({
      successCount: totals.successCount + result.successCount,
      writtenCount: totals.writtenCount + result.writtenCount,
      unchangedCount: totals.unchangedCount + result.unchangedCount,
      refreshedCount: totals.refreshedCount + (result.refreshedCount || 0),
    }),
    { successCount: 0, writtenCount: 0, unchangedCount: 0, refreshedCount: 0 },
  );
}

function compactResult(result: {
  sourceId: string;
  sourceName: string;
  status: string;
  successCount: number;
  writtenCount: number;
  unchangedCount: number;
  refreshedCount?: number;
}) {
  return {
    sourceId: result.sourceId,
    sourceName: result.sourceName,
    status: result.status,
    successCount: result.successCount,
    writtenCount: result.writtenCount,
    unchangedCount: result.unchangedCount,
    refreshedCount: result.refreshedCount || 0,
  };
}

function productIdFromCrawlOffer(offer: z.infer<typeof offerSchema>): string {
  return classifyOffer(offer.sourceTitle, {
    tags: offer.tags || [],
    price: offer.price ?? null,
  }).id;
}

function collectorKindFromDetails(details: Record<string, unknown> | undefined) {
  return normalizeCollectorKind(details?.collector);
}

function fullSnapshotFromDetails(details: Record<string, unknown> | undefined, status: string): boolean {
  if (typeof details?.fullSnapshot === "boolean") return status === "success" && details.fullSnapshot;
  return status === "success";
}

function seenOfferIdsFromDetails(details: Record<string, unknown> | undefined): string[] | null {
  const value = details?.seenOfferIds;
  if (!Array.isArray(value)) return null;
  return value.map((item) => String(item)).filter(Boolean);
}

function crawlLogRunIdSuffix(details: Record<string, unknown> | undefined, status: string): string | null {
  const batchIndex = positiveIntegerFromDetails(details, "batchIndex");
  const batchCount = positiveIntegerFromDetails(details, "batchCount");
  if (batchIndex && batchCount) return `batch:${batchIndex}/${batchCount}`;
  if (batchIndex) return `batch:${batchIndex}`;
  if (status === "partial") return "partial";
  return null;
}

function positiveIntegerFromDetails(details: Record<string, unknown> | undefined, key: string): number | null {
  const value = details?.[key];
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

function dateFromDetails(details: Record<string, unknown> | undefined, key: string): string | null {
  const value = details?.[key];
  if (typeof value !== "string") return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function shopCreatedAtFromDetails(details: Record<string, unknown> | undefined): string | null {
  return dateFromDetails(details, "shopCreatedAt") || dateFromDetails(details, "sourceShopCreatedAt");
}
