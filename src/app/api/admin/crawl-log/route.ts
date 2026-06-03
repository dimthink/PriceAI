import {
  getAdminPasswordFromRequest,
  rawOfferInputId,
  recordSourceCollectionResult,
  upsertRawOffers,
  upsertSource,
} from "@/lib/admin";
import { clearPublicDataCache } from "@/lib/data";
import { requireAdminOrCronPassword } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { stableId } from "@/lib/utils";
import { z } from "zod";

const offerSchema = z.object({
  sourceId: z.string().min(1).optional(),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceStoreName: z.string().optional(),
  sourceTitle: z.string().min(1),
  price: z.number().nonnegative().nullable().optional(),
  currency: z.string().optional(),
  status: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]).optional(),
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  stockCount: z.number().int().nullable().optional(),
});

const schema = z.object({
  sourceId: z.string().min(1).optional(),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  mode: z.enum(["browser", "http", "manual"]).default("browser"),
  status: z.enum(["success", "partial", "failed"]).default("success"),
  message: z.string().optional(),
  offers: z.array(offerSchema).default([]),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    requireAdminOrCronPassword(getAdminPasswordFromRequest(request));

    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置，无法保存采集结果。");

    const payload = schema.parse(await request.json());
    const startedAt = new Date().toISOString();
    const source = await upsertSource({
      id: payload.sourceId,
      name: payload.sourceName,
      entryUrl: payload.sourceUrl,
      collectionMethod: payload.mode,
      collectorKind: collectorKindFromDetails(payload.details),
      notes: "由采集日志自动维护。",
    });
    const offers = payload.offers.map((offer) => ({
      ...offer,
      sourceId: offer.sourceId || payload.sourceId || source.id,
    }));
    const successCount = await upsertRawOffers(offers, { collectionMethod: payload.mode });
    const finishedAt = new Date().toISOString();
    const seenOfferIds = seenOfferIdsFromDetails(payload.details) || offers.map(rawOfferInputId);
    const fullSnapshot = fullSnapshotFromDetails(payload.details, payload.status);

    await recordSourceCollectionResult({
      sourceId: source.id,
      status: payload.status,
      checkedAt: finishedAt,
      message: payload.message || null,
      seenOfferIds,
      fullSnapshot,
    });

    const { error } = await supabase.from("crawl_runs").insert({
      id: stableId(payload.sourceName, payload.sourceUrl, startedAt),
      source_id: source.id,
      source_name: payload.sourceName,
      mode: payload.mode,
      status: payload.status,
      started_at: startedAt,
      finished_at: finishedAt,
      success_count: successCount,
      failure_count: Math.max(0, payload.offers.length - successCount),
      message: payload.message || `采集到 ${successCount} 条报价。`,
      details: payload.details || {},
    });

    if (error) throw error;
    clearPublicDataCache();

    return Response.json({ ok: true, successCount });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "记录采集结果失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

function collectorKindFromDetails(details: Record<string, unknown> | undefined) {
  const value = details?.collector;
  if (
    value === "auto" ||
    value === "kami" ||
    value === "dujiao" ||
    value === "shopApi" ||
    value === "xiaoheiwan" ||
    value === "opensoraHtml" ||
    value === "makerichHtml" ||
    value === "beibeiHtml" ||
    value === "ikunloveApi" ||
    value === "getgptApi" ||
    value === "genericHtml" ||
    value === "browser" ||
    value === "unsupported"
  ) {
    return value;
  }
  return null;
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
