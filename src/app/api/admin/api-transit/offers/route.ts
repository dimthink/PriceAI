import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TRANSIT_MODEL_FAMILY_ORDER } from "@/data/api-transit/types";
import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { updateApiTransitOffer, updateApiTransitOffers } from "@/lib/api-transit-admin";
import { clearAdminDataCache } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";

const patchSchema = z.union([
  z.object({
    ids: z.array(z.string().min(1)).min(1).max(800),
    status: z.enum(["active", "needs_review", "inactive"]),
  }),
  z.object({
    id: z.string().min(1),
    family: z.enum(TRANSIT_MODEL_FAMILY_ORDER).optional(),
    standardModel: z.string().trim().min(1).max(120).optional(),
    rawModelName: z.string().trim().min(1).max(200).optional(),
    groupName: z.string().trim().min(1).max(160).optional(),
    rechargeRatio: z.string().trim().max(80).nullable().optional(),
    modelMultiplier: z.number().nonnegative().nullable().optional(),
    inputPrice: z.number().nonnegative().nullable().optional(),
    outputPrice: z.number().nonnegative().nullable().optional(),
    cacheReadPrice: z.number().nonnegative().nullable().optional(),
    cacheWritePrice: z.number().nonnegative().nullable().optional(),
    imageOutputPrice: z.number().nonnegative().nullable().optional(),
    currency: z.string().trim().min(1).max(12).optional(),
    accountPool: z.string().trim().min(1).max(120).optional(),
    channelType: z.string().trim().min(1).max(120).optional(),
    priceSource: z.string().trim().min(1).max(160).optional(),
    sourceUrl: z.string().url().max(2048).nullable().optional(),
    status: z.enum(["active", "needs_review", "inactive"]).optional(),
  }),
]);

export async function PATCH(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = patchSchema.parse(await request.json());

    if ("ids" in payload) {
      const result = await updateApiTransitOffers(payload);
      clearApiTransitAdminCaches();
      return Response.json({ ok: true, ...result });
    }

    const offer = await updateApiTransitOffer(payload);
    clearApiTransitAdminCaches();
    return Response.json({ ok: true, offer });
  } catch (error) {
    logApiError("admin api transit offers update", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "更新 API 中转报价失败。") },
      { status: error instanceof z.ZodError ? 400 : errorStatus(error) },
    );
  }
}

function clearApiTransitAdminCaches(): void {
  clearAdminDataCache();
  revalidatePath("/admin");
  revalidatePath("/admin/api-transit");
  revalidatePath("/api-transit");
  revalidatePath("/api-transit/models");
  revalidatePath("/api-transit/[slug]", "page");
  revalidatePath("/sitemap.xml");
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  return message.includes("未授权") ? 401 : 500;
}
