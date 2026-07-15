import { processDueAccountDeletions } from "@/lib/account-deletion";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { authorizeCronRequest, cronMethodNotAllowed } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function GET() {
  return cronMethodNotAllowed("处理到期账号删除申请");
}

export async function POST(request: Request) {
  const authError = authorizeCronRequest(request, "处理到期账号删除申请");
  if (authError) return authError;
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 5, 1, 25);
  const startedAt = new Date().toISOString();

  try {
    const result = await processDueAccountDeletions({
      worker: `account-deletions:${crypto.randomUUID()}`,
      limit,
    });
    return Response.json({
      ok: result.failures.length === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      limit,
      ...result,
    }, {
      status: result.failures.length > 0 ? 207 : 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    logApiError("cron account deletions", error);
    return Response.json({
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      message: safeApiErrorMessage(error, "账号删除处理失败。"),
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}
