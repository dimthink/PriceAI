import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { authorizeCronRequest, cronMethodNotAllowed } from "@/lib/cron-auth";
import { reconcileActiveDetectorJobs } from "@/lib/detector-job-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function GET() {
  return cronMethodNotAllowed("对账检测任务");
}

export async function POST(request: Request) {
  const authError = authorizeCronRequest(request, "对账检测任务");
  if (authError) return authError;

  const startedAt = new Date().toISOString();
  const limit = boundedInteger(new URL(request.url).searchParams.get("limit"), 100, 1, 200);
  try {
    const result = await reconcileActiveDetectorJobs({ limit });
    return Response.json({
      ok: result.retryable === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      limit,
      ...result,
    }, {
      status: result.retryable > 0 ? 207 : 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    logApiError("cron detector jobs", error);
    return Response.json({
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      message: safeApiErrorMessage(error, "检测任务对账失败。"),
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}
