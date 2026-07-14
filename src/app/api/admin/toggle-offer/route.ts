import { setRawOfferHidden } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearPublicOfferDataCacheForProducts, listRawOffersByIds, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";
import { prewarmPublicPaths, revalidatePublicOfferPathsForProducts } from "@/lib/public-revalidation";
import { after } from "next/server";
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
    const affectedOffers = result.updatedOfferCount > 0 ? await listRawOffersByIds([payload.id]) : [];
    const affectedProductIds = Array.from(new Set(affectedOffers.map((offer) => offer.canonicalProductId).filter(isNonEmptyString)));
    const affectedSourceIds = Array.from(new Set(affectedOffers.map((offer) => offer.sourceId).filter(isNonEmptyString)));
    if (result.updatedOfferCount > 0) {
      clearPublicOfferDataCacheForProducts(affectedProductIds);
    }
    const snapshotRefreshQueued = result.updatedOfferCount > 0
      ? await markPublicApiSnapshotsDirty("admin toggle offer", {
          productIds: affectedProductIds,
          offerIds: [payload.id],
          sourceIds: affectedSourceIds,
          global: false,
          preferProductScope: affectedProductIds.length > 0,
        })
      : false;
    const revalidatedPaths = result.updatedOfferCount > 0 ? revalidatePublicOfferPathsForProducts(affectedProductIds) : [];

    if (result.updatedOfferCount > 0) {
      after(async () => {
        await prewarmPublicPaths(request, publicOfferTogglePrewarmPaths(affectedProductIds));
      });
    }

    return Response.json({ ok: true, ...result, snapshotRefreshQueued, revalidatedPaths });
  } catch (error) {
    logApiError("admin toggle offer", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "更新失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

function publicOfferTogglePrewarmPaths(productIds: string[]): string[] {
  const paths = new Set<string>([
    "/",
    "/api/explorer",
    "/api/offers?limit=30",
  ]);

  for (const productId of productIds) {
    paths.add(`/products/${encodeURIComponent(productId)}`);
    paths.add(`/api/products/${encodeURIComponent(productId)}/offers?limit=30`);
  }

  return [...paths];
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}
