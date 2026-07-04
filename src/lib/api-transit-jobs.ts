import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { getSupabaseServerClient } from "@/lib/supabase";
import { stableId } from "@/lib/utils";

export type ApiTransitJobType = "api_transit_public_pricing";

const STALE_API_TRANSIT_JOB_MS = 3 * 60 * 60 * 1000;

export async function enqueueApiTransitCollectionJob(
  request: Request,
  jobType: ApiTransitJobType,
) {
  const authError = authorizeCronRequest(request, "创建 API 中转采集任务");
  if (authError) return authError;

  const startedAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json(
      { ok: false, startedAt, message: "Supabase 尚未配置，无法创建 API 中转采集任务。" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const stationId = normalizeStationId(
    url.searchParams.get("station") ||
      url.searchParams.get("stationId") ||
      url.searchParams.get("source") ||
      url.searchParams.get("sourceId"),
  );

  try {
    const { existingJob, cancelledJobs } = await resolveExistingApiTransitJob(jobType, stationId, startedAt);
    if (existingJob) {
      return Response.json({
        ok: true,
        jobType,
        stationId,
        skipped: true,
        cancelledStaleJobCount: cancelledJobs.length,
        startedAt,
        finishedAt: new Date().toISOString(),
        job: existingJob,
        message: "已有待处理的 API 中转采集任务，已跳过重复入队。",
      });
    }

    const row = {
      id: stableId("collection-job", jobType, stationId || "all", startedAt),
      job_type: jobType,
      source_id: null,
      source_name: apiTransitJobName(jobType, stationId),
      status: "pending",
      priority: 30,
      attempts: 0,
      max_attempts: 2,
      requested_by: "cron",
      result: {
        jobType,
        stationId,
      },
      created_at: startedAt,
      updated_at: startedAt,
    };

    const { data, error } = await supabase
      .from("collection_jobs")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({
      ok: true,
      jobType,
      stationId,
      startedAt,
      finishedAt: new Date().toISOString(),
      cancelledStaleJobCount: cancelledJobs.length,
      job: data || row,
    });
  } catch (error) {
    logApiError("api transit job enqueue", error);
    return Response.json(
      {
        ok: false,
        jobType,
        stationId,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: safeApiErrorMessage(error, "创建 API 中转采集任务失败。"),
      },
      { status: 500 },
    );
  }
}

export function apiTransitJobTypeFromRequest(): ApiTransitJobType {
  return "api_transit_public_pricing";
}

function apiTransitJobName(jobType: ApiTransitJobType, stationId: string | null): string {
  const scope = stationId ? `：${stationId}` : "";
  return `API 中转公开倍率与监测刷新${scope}`;
}

async function resolveExistingApiTransitJob(
  jobType: ApiTransitJobType,
  stationId: string | null,
  nowIso: string,
): Promise<{ existingJob: Record<string, unknown> | null; cancelledJobs: string[] }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { existingJob: null, cancelledJobs: [] };

  const { data, error } = await supabase
    .from("collection_jobs")
    .select("*")
    .eq("job_type", jobType)
    .in("status", ["pending", "running"])
    .contains("result", { stationId })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  const jobs = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const staleJobs = jobs.filter((job) => isStaleApiTransitJob(job, nowIso));
  const cancelledJobs = staleJobs.map((job) => String(job.id)).filter(Boolean);

  if (cancelledJobs.length) {
    const cancelledAt = new Date().toISOString();
    const { error: cancelError } = await supabase
      .from("collection_jobs")
      .update({
        status: "cancelled",
        locked_by: null,
        locked_until: null,
        finished_at: cancelledAt,
        last_error: "API 中转采集任务超过 3 小时未被执行，已由下一次入队自动取消。",
        updated_at: cancelledAt,
      })
      .in("id", cancelledJobs);

    if (cancelError) throw cancelError;
  }

  const cancelledSet = new Set(cancelledJobs);
  return {
    existingJob: jobs.find((job) => !cancelledSet.has(String(job.id))) || null,
    cancelledJobs,
  };
}

function isStaleApiTransitJob(job: Record<string, unknown>, nowIso: string): boolean {
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) return false;

  if (job.status === "running") {
    const lockedUntilMs = timestampMs(job.locked_until);
    if (lockedUntilMs != null) return lockedUntilMs < nowMs;
  }

  const referenceMs = timestampMs(job.started_at) ?? timestampMs(job.created_at) ?? timestampMs(job.updated_at);
  return referenceMs != null && nowMs - referenceMs > STALE_API_TRANSIT_JOB_MS;
}

function normalizeStationId(value: string | null): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function timestampMs(value: unknown): number | null {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}
