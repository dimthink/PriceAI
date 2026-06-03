import { deleteSource, getAdminPasswordFromRequest, setSourceOffersHidden, updateSourceState, upsertSource } from "@/lib/admin";
import { requireAdminPassword } from "@/lib/env";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  entryUrl: z.string().url(),
  baseUrl: z.string().url().nullable().optional(),
  collectionMethod: z.enum(["public_json", "browser", "http", "manual"]).default("manual"),
  collectorKind: z.enum(["auto", "kami", "dujiao", "shopApi", "xiaoheiwan", "opensoraHtml", "makerichHtml", "beibeiHtml", "browser", "unsupported"]).nullable().optional(),
  enabled: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  collectionMethod: z.enum(["public_json", "browser", "http", "manual"]).optional(),
  collectorKind: z.enum(["auto", "kami", "dujiao", "shopApi", "xiaoheiwan", "opensoraHtml", "makerichHtml", "beibeiHtml", "browser", "unsupported"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  offersHidden: z.boolean().optional(),
  reason: z.string().max(500).nullable().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
  deleteOffers: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = createSchema.parse(await request.json());
    const source = await upsertSource(payload);

    return Response.json({ ok: true, source });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "保存来源失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = patchSchema.parse(await request.json());
    if (typeof payload.offersHidden === "boolean") {
      const result = await setSourceOffersHidden({
        sourceId: payload.id,
        hidden: payload.offersHidden,
        reason: payload.reason,
      });

      return Response.json({ ok: true, ...result });
    }

    const source = await updateSourceState({
      id: payload.id,
      enabled: payload.enabled,
      collectionMethod: payload.collectionMethod,
      collectorKind: payload.collectorKind,
      notes: payload.notes,
    });

    return Response.json({ ok: true, source });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "更新来源失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = deleteSchema.parse(await request.json());
    const result = await deleteSource(payload);

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "删除来源失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
