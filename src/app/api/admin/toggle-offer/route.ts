import { setRawOfferHidden } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
  mode: z.enum(["manual", "temporary"]).optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);

    const payload = schema.parse(await request.json());
    const result = await setRawOfferHidden(payload);
    clearPublicDataCache();
    const snapshotRefreshQueued = result.updatedOfferCount > 0
      ? await markPublicApiSnapshotsDirty("admin toggle offer", { offerIds: [payload.id] })
      : false;

    return Response.json({ ok: true, ...result, snapshotRefreshQueued });
  } catch (error) {
    logApiError("admin toggle offer", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "更新失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
