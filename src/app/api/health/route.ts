import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { CrawlRun } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase";
import { withCloudflarePublicCache } from "@/lib/cloudflare-edge-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_SUPABASE_TIMEOUT_MS = 2_500;
const HEALTH_EDGE_TTL_SECONDS = 15;
const HEALTH_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Cloudflare-CDN-Cache-Control": `public, s-maxage=${HEALTH_EDGE_TTL_SECONDS}, stale-while-revalidate=30`,
};

type HealthStatus = "ok" | "degraded" | "not_configured";
type HealthCheck = {
  ok: boolean;
  name: string;
  message: string | null;
};

export async function GET(request: Request) {
  return withCloudflarePublicCache(request, {
    namespace: "health-v1",
    ttlSeconds: HEALTH_EDGE_TTL_SECONDS,
    cacheKeySearchParams: new URLSearchParams(),
    load: loadHealthResponse,
  });
}

async function loadHealthResponse() {
  const generatedAt = new Date().toISOString();
  const supabaseConfigured = isSupabaseConfigured();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured" satisfies HealthStatus,
        generatedAt,
        supabaseConfigured,
        supabaseReachable: false,
        latestSuccessfulCrawlAt: null,
        latestCrawlAt: null,
        latestCrawlStatus: null,
        message: "Supabase 尚未配置。",
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  let checks: HealthCheck[] = [];

  try {
    const [sourcesConnectivity, sourcesSchema, publicApiSnapshots, latestCrawl, latestSuccessfulCrawl] = await Promise.all([
      runHeadCheck("sources_connectivity", () =>
        supabase
          .from("sources")
          .select("id")
          .limit(1)
          .abortSignal(AbortSignal.timeout(HEALTH_SUPABASE_TIMEOUT_MS)),
      ),
      runHeadCheck("sources_schema", () =>
        supabase
          .from("sources")
          .select("id,shop_created_at")
          .limit(1)
          .abortSignal(AbortSignal.timeout(HEALTH_SUPABASE_TIMEOUT_MS)),
      ),
      runHeadCheck("public_api_snapshots", () =>
        supabase
          .from("public_api_snapshots")
          .select("kind,cache_key,generated_at")
          .limit(1)
          .abortSignal(AbortSignal.timeout(HEALTH_SUPABASE_TIMEOUT_MS)),
      ),
      readLatestCrawlRun(supabase, "latest_crawl"),
      readLatestCrawlRun(supabase, "latest_successful_crawl", ["success", "partial"]),
    ]);
    checks = [
      sourcesConnectivity,
      sourcesSchema,
      publicApiSnapshots,
      latestCrawl.check,
      latestSuccessfulCrawl.check,
    ];

    const failed = [sourcesConnectivity, sourcesSchema, publicApiSnapshots].find((check) => !check.ok);
    if (failed) throw new Error(failed.message || `${failed.name} 健康检查失败。`);

    return NextResponse.json({
      ok: true,
      status: "ok" satisfies HealthStatus,
      generatedAt,
      supabaseConfigured,
      supabaseReachable: true,
      checks,
      latestSuccessfulCrawlAt: latestSuccessfulCrawl.run ? crawlRunObservedAt(latestSuccessfulCrawl.run) : null,
      latestCrawlAt: latestCrawl.run ? crawlRunObservedAt(latestCrawl.run) : null,
      latestCrawlStatus: latestCrawl.run?.status || null,
      message: null,
    }, { headers: HEALTH_CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "degraded" satisfies HealthStatus,
        generatedAt,
        supabaseConfigured,
        supabaseReachable: isSupabaseReachable(checks),
        checks,
        latestSuccessfulCrawlAt: null,
        latestCrawlAt: null,
        latestCrawlStatus: null,
        message: error instanceof Error ? error.message : "健康检查失败。",
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

function isSupabaseReachable(checks: HealthCheck[]): boolean {
  return checks.some((check) => check.name === "sources_connectivity" && check.ok);
}

async function runHeadCheck(
  name: string,
  query: () => PromiseLike<{ error: HealthCheckError | null }>,
): Promise<HealthCheck> {
  try {
    const { error } = await query();
    return {
      ok: !error,
      name,
      message: error ? formatHealthCheckError(name, error) : null,
    };
  } catch (error) {
    return {
      ok: false,
      name,
      message: error instanceof Error ? error.message : `${name} 健康检查失败。`,
    };
  }
}

type HealthCheckError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;
type CrawlRunRow = Pick<CrawlRun, "status" | "startedAt" | "finishedAt">;

async function readLatestCrawlRun(
  supabase: SupabaseClient,
  name: string,
  statuses?: Array<CrawlRun["status"]>,
): Promise<{ check: HealthCheck; run: CrawlRunRow | null }> {
  try {
    let query = supabase
      .from("crawl_runs")
      .select("status,started_at,finished_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_SUPABASE_TIMEOUT_MS));
    if (statuses?.length) query = query.in("status", statuses);
    const { data, error } = await query;

    return {
      check: {
        ok: !error,
        name,
        message: error ? formatHealthCheckError(name, error) : null,
      },
      run: error || !data?.[0]
        ? null
        : {
            status: String(data[0].status || "failed") as CrawlRun["status"],
            startedAt: String(data[0].started_at || new Date().toISOString()),
            finishedAt: data[0].finished_at ? String(data[0].finished_at) : null,
          },
    };
  } catch (error) {
    return {
      check: {
        ok: false,
        name,
        message: error instanceof Error ? error.message : `${name} 健康检查失败。`,
      },
      run: null,
    };
  }
}

function crawlRunObservedAt(run: CrawlRunRow): string {
  return run.finishedAt || run.startedAt;
}

function formatHealthCheckError(name: string, error: HealthCheckError): string {
  const parts = [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return parts.length ? parts.join(" ") : `${name} 健康检查失败。`;
}
