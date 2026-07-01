import { loadTargets, runPriceCollection } from "../../../../../scripts/collect-prices.mjs";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { authorizeCronRequest, cronMethodNotAllowed } from "@/lib/cron-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET() {
  return cronMethodNotAllowed("执行定时采集");
}

export async function POST(request: Request) {
  return runCronCollection(request);
}

async function runCronCollection(request: Request) {
  const authError = authorizeCronRequest(request, "执行定时采集");
  if (authError) return authError;

  const startedAt = new Date().toISOString();
  const url = new URL(request.url);
  const source = url.searchParams.get("source") || url.searchParams.get("sourceId") || undefined;
  const endpoint = getRuntimeEnv("CRON_PUBLIC_BASE_URL") || url.origin;

  try {
    if (url.searchParams.get("list") === "1") {
      const targets = await loadTargets();

      return Response.json({
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        targetCount: targets.length,
        supportedCount: targets.filter((target) => target.kind).length,
        targets: targets.map((target) => ({
          sourceId: target.sourceId,
          sourceName: target.sourceName,
          sourceUrl: target.sourceUrl,
          kind: target.kind,
        })),
      });
    }

    const result = await runPriceCollection({
      all: !source,
      source,
      post: true,
      endpoint,
      password: getRuntimeEnv("CRON_SECRET"),
      silent: true,
    });

    return Response.json({
      ...result,
      ok: true,
      startedAt: result.startedAt || startedAt,
    });
  } catch (error) {
    logApiError("cron collect prices", error);
    return Response.json(
      {
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: safeApiErrorMessage(error, "定时采集失败。"),
      },
      { status: 500 },
    );
  }
}
