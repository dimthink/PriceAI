import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminOrCronPassword } from "@/lib/env";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { stableId } from "@/lib/utils";

export type OfficialPriceJobMode = "weekly_full" | "fx_only";

export async function enqueueOfficialPriceCollectionJob(
  request: Request,
  officialMode: OfficialPriceJobMode,
) {
  const authError = authorizeCronRequest(request);
  if (authError) return authError;

  const startedAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json(
      { ok: false, startedAt, message: "Supabase 尚未配置，无法创建官方地区价采集任务。" },
      { status: 500 },
    );
  }

  try {
    const existingJob = await findExistingOfficialPriceJob(officialMode);
    if (existingJob) {
      return Response.json({
        ok: true,
        mode: officialMode,
        skipped: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        job: existingJob,
        message: "已有待处理的官方地区价采集任务，已跳过重复入队。",
      });
    }

    const row = {
      id: stableId("collection-job", "official_prices", officialMode, startedAt),
      job_type: "official_prices",
      source_id: null,
      source_name: officialMode === "fx_only" ? "官方地区价汇率刷新" : "官方地区价周全量",
      status: "pending",
      priority: officialMode === "fx_only" ? 15 : 25,
      attempts: 0,
      max_attempts: 2,
      requested_by: "cron",
      result: { officialMode },
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
      mode: officialMode,
      startedAt,
      finishedAt: new Date().toISOString(),
      job: data || row,
    });
  } catch (error) {
    logApiError("official price job enqueue", error);
    return Response.json(
      {
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: safeApiErrorMessage(error, "创建官方地区价采集任务失败。"),
      },
      { status: 500 },
    );
  }
}

export function officialModeFromRequest(request: Request): OfficialPriceJobMode {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || searchParams.get("officialMode");
  return mode === "weekly_full" ? "weekly_full" : "fx_only";
}

function authorizeCronRequest(request: Request) {
  if (!getRuntimeEnv("CRON_SECRET") && process.env.NODE_ENV === "production") {
    return Response.json(
      { ok: false, message: "CRON_SECRET 未配置，已拒绝创建官方地区价采集任务。" },
      { status: 500 },
    );
  }

  try {
    requireAdminOrCronPassword(getAdminPasswordFromRequest(request));
    return null;
  } catch {
    return Response.json({ ok: false, message: "无权创建官方地区价采集任务。" }, { status: 401 });
  }
}

async function findExistingOfficialPriceJob(officialMode: OfficialPriceJobMode): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("collection_jobs")
    .select("*")
    .eq("job_type", "official_prices")
    .in("status", ["pending", "running"])
    .contains("result", { officialMode })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as Record<string, unknown> | null;
}
