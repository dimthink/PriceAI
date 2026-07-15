import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { accountApiErrorResponse } from "@/lib/account-api-errors";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { feedbackWithdrawSchema, withdrawUserOfferFeedback } from "@/lib/account";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { isSameOriginMutation, sameOriginRequiredResponse } from "@/lib/request-origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feedbackId: string }> },
) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const { feedbackId } = await params;
    const payload = feedbackWithdrawSchema.parse(await request.json().catch(() => ({})));
    const feedback = await withdrawUserOfferFeedback({
      userId: user.id,
      feedbackId,
      reason: payload.reason || null,
    });
    clearPublicDataCache();
    await markPublicApiSnapshotsDirty("user feedback withdrawal", {
      productIds: compactStrings([feedback.productId, feedback.productSlug]),
      offerIds: compactStrings([feedback.offerId]),
      sourceIds: compactStrings([feedback.sourceId]),
    });

    return Response.json({ ok: true, feedback }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return accountApiErrorResponse(error, "撤销反馈失败。");
  }
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
