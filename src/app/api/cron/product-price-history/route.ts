import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { authorizeCronRequest, cronMethodNotAllowed } from "@/lib/cron-auth";
import { pruneProductPriceHistory, recordProductPriceSamples } from "@/lib/price-history-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function GET() {
  return cronMethodNotAllowed("执行标准商品价格历史维护");
}

export async function POST(request: Request) {
  const authError = authorizeCronRequest(request, "执行标准商品价格历史维护");
  if (authError) return authError;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action !== "sample" && action !== "prune") {
    return Response.json({ ok: false, message: "action 仅支持 sample 或 prune。" }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const batchSize = boundedBatchSize(url.searchParams.get("batch"));
  if (action === "prune" && batchSize === null) {
    return Response.json({ ok: false, message: "batch 必须是 100 到 20000 之间的整数。" }, { status: 400 });
  }

  try {
    const dryRun = url.searchParams.get("apply") !== "1";
    const result = action === "sample"
      ? await recordProductPriceSamples(startedAt)
      : await pruneProductPriceHistory({ batchSize: batchSize || 5000, dryRun });
    return Response.json({
      ok: true,
      action,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...(action === "prune" ? { dryRun, batchSize } : {}),
      result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logApiError(`cron product price history ${action}`, error);
    return Response.json({
      ok: false,
      action,
      startedAt,
      finishedAt: new Date().toISOString(),
      message: safeApiErrorMessage(error, "标准商品价格历史维护失败。"),
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

function boundedBatchSize(value: string | null): number | null {
  if (!value) return 5000;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 20000 ? parsed : null;
}
