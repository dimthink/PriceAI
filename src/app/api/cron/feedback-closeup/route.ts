import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { authorizeCronRequest, cronMethodNotAllowed } from "@/lib/cron-auth";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import {
  closePendingTransientOfferFeedback,
  runPendingTransientFeedbackEscalations,
} from "@/lib/feedback-auto-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function GET() {
  return cronMethodNotAllowed("收口报价反馈");
}

export async function POST(request: Request) {
  const authError = authorizeCronRequest(request, "收口报价反馈");
  if (authError) return authError;

  const startedAt = new Date().toISOString();
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 300, 1, 1000);

  try {
    const closeup = await closePendingTransientOfferFeedback({ limit });
    const escalation = await runPendingTransientFeedbackEscalations({ limit });
    const snapshotScope = mergeSnapshotScopes(closeup.snapshotScope, escalation.snapshotScope);
    const snapshotRefreshQueued = snapshotScope
      ? await markPublicApiSnapshotsDirty("cron feedback closeup", snapshotScope)
      : false;

    if (snapshotScope) clearPublicDataCache();

    return Response.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      limit,
      closeup,
      escalation,
      snapshotRefreshQueued,
    });
  } catch (error) {
    logApiError("cron feedback closeup", error);
    return Response.json(
      {
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: safeApiErrorMessage(error, "报价反馈收口失败。"),
      },
      { status: 500 },
    );
  }
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function mergeSnapshotScopes(
  left: {
    productIds: string[];
    offerIds: string[];
    sourceIds: string[];
  } | null,
  right: {
    productIds: string[];
    offerIds: string[];
    sourceIds: string[];
  } | null,
) {
  if (!left && !right) return null;
  return {
    productIds: compactStrings([...(left?.productIds || []), ...(right?.productIds || [])]),
    offerIds: compactStrings([...(left?.offerIds || []), ...(right?.offerIds || [])]),
    sourceIds: compactStrings([...(left?.sourceIds || []), ...(right?.sourceIds || [])]),
  };
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
