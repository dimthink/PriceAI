import { deleteSource, setSourceOffersHidden, updateSourceState, upsertSource } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { normalizeCollectorKind } from "@/lib/collector-registry";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";
import type { CollectorKind } from "@/lib/types";
import { z } from "zod";

const collectorKindSchema = z.custom<CollectorKind>((value) => normalizeCollectorKind(value) === value);

const createSchema = z.object({
  name: z.string().min(1),
  entryUrl: z.string().url(),
  baseUrl: z.string().url().nullable().optional(),
  collectionMethod: z.enum(["public_json", "browser", "http", "manual"]).default("manual"),
  collectorKind: collectorKindSchema.nullable().optional(),
  enabled: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  collectionMethod: z.enum(["public_json", "browser", "http", "manual"]).optional(),
  collectorKind: collectorKindSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  offersHidden: z.boolean().optional(),
  offersHiddenMode: z.enum(["manual", "temporary"]).optional(),
  reason: z.string().max(500).nullable().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
  deleteOffers: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = createSchema.parse(await request.json());
    const source = await upsertSource(payload);
    clearPublicDataCache();
    const snapshotRefreshQueued = await markPublicApiSnapshotsDirty("admin source create", {
      sourceIds: [source.id],
    });

    return Response.json({ ok: true, source, snapshotRefreshQueued });
  } catch (error) {
    logApiError("admin source create", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "保存来源失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = patchSchema.parse(await request.json());
    if (typeof payload.offersHidden === "boolean") {
      const result = await setSourceOffersHidden({
        sourceId: payload.id,
        hidden: payload.offersHidden,
        reason: payload.reason,
        mode: payload.offersHiddenMode,
      });
      clearPublicDataCache();
      const snapshotRefreshQueued = result.updatedOfferCount > 0
        ? await markPublicApiSnapshotsDirty("admin source offers hidden", { sourceIds: [payload.id] })
        : false;

      return Response.json({ ok: true, ...result, snapshotRefreshQueued });
    }

    const source = await updateSourceState({
      id: payload.id,
      enabled: payload.enabled,
      collectionMethod: payload.collectionMethod,
      collectorKind: payload.collectorKind,
      notes: payload.notes,
    });
    clearPublicDataCache();
    const snapshotRefreshQueued = await markPublicApiSnapshotsDirty("admin source update", {
      sourceIds: [source.id],
    });

    return Response.json({ ok: true, source, snapshotRefreshQueued });
  } catch (error) {
    logApiError("admin source update", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "更新来源失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = deleteSchema.parse(await request.json());
    const result = await deleteSource(payload);
    clearPublicDataCache();
    const snapshotRefreshQueued = result.deletedOfferCount > 0 || !payload.deleteOffers
      ? await markPublicApiSnapshotsDirty("admin source delete", {
          sourceIds: [payload.id],
          full: payload.deleteOffers && result.deletedOfferCount > 0,
        })
      : false;

    return Response.json({ ok: true, ...result, snapshotRefreshQueued });
  } catch (error) {
    logApiError("admin source delete", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "删除来源失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
