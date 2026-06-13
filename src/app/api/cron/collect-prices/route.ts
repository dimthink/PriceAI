import { loadTargets, runPriceCollection } from "../../../../../scripts/collect-prices.mjs";
import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminOrCronPassword } from "@/lib/env";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return runCronCollection(request);
}

export async function POST(request: Request) {
  return runCronCollection(request);
}

async function runCronCollection(request: Request) {
  const authError = authorizeCronRequest(request);
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
      password: getRuntimeEnv("ADMIN_PASSWORD"),
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

function authorizeCronRequest(request: Request) {
  if (!getRuntimeEnv("CRON_SECRET") && process.env.NODE_ENV === "production") {
    return Response.json(
      { ok: false, message: "CRON_SECRET 未配置，已拒绝执行定时采集。" },
      { status: 500 },
    );
  }

  try {
    requireAdminOrCronPassword(getAdminPasswordFromRequest(request));
    return null;
  } catch {
    return Response.json({ ok: false, message: "无权执行定时采集。" }, { status: 401 });
  }
}
