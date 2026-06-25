import { z } from "zod";
import { approveSubmission, getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { normalizeCollectorKind } from "@/lib/collector-registry";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";
import { revalidatePublicOfferPaths } from "@/lib/public-revalidation";
import type { CollectorKind } from "@/lib/types";

const collectorKindSchema = z.custom<CollectorKind>((value) => normalizeCollectorKind(value) === value);

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(200).optional().nullable(),
  sourceUrl: z.string().url().max(2048).optional().nullable(),
  collectionMethod: z.enum(["public_json", "browser", "http", "manual"]).optional(),
  collectorKind: collectorKindSchema.nullable().optional(),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = schema.parse(await request.json());
    const result = await approveSubmission(payload.id, {
      name: payload.name ?? null,
      sourceUrl: payload.sourceUrl ?? null,
      collectionMethod: payload.collectionMethod,
      collectorKind: payload.collectorKind,
    });
    clearPublicDataCache();
    revalidatePublicOfferPaths();
    const snapshotRefreshQueued = await markPublicApiSnapshotsDirty("admin submission approve", {
      sourceIds: [result.source.id],
    });
    return Response.json({ ok: true, ...result, snapshotRefreshQueued });
  } catch (error) {
    logApiError("admin submission approve", error);
    const rawMessage = error instanceof Error ? error.message : "审核失败。";
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "审核失败。") },
      { status: error instanceof z.ZodError ? 400 : errorStatus(rawMessage) },
    );
  }
}

function errorStatus(message: string): number {
  if (message.includes("未授权")) return 401;
  if (message.includes("已被处理")) return 409;
  if (message.includes("不存在")) return 404;
  return 500;
}
