import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { reconcileDetectorJob } from "@/lib/detector-job-reconciliation";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(_request: Request, context: RouteContext<"/api/api-transit/detector/status/[jobId]">) {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse("登录后才能查看检测任务状态。");

  const { jobId } = await context.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase 尚未配置。" }, { status: 500, headers: noStoreCacheHeaders() });
  }

  const { data, error } = await supabase
    .from("transit_detector_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (error || !data) {
    return Response.json({ ok: false, message: "没有找到这条检测任务。" }, { status: 404, headers: noStoreCacheHeaders() });
  }

  const result = await reconcileDetectorJob(data);
  if (result.retryable) {
    return Response.json({
      ok: false,
      retryable: true,
      code: "detector_status_unavailable",
      status: result.status,
      message: result.message || "检测服务暂时不可达。",
      local_job_id: jobId,
    }, { status: 503, headers: { ...noStoreCacheHeaders(), "Retry-After": "5" } });
  }

  if (result.status === "error" || result.status === "timed_out") {
    return Response.json({
      ok: false,
      code: result.status === "timed_out" ? "job_timed_out" : "detector_failed",
      status: "error",
      error: result.message || (result.status === "timed_out" ? "检测任务等待超时。" : "检测任务失败。"),
      local_job_id: jobId,
    }, { headers: noStoreCacheHeaders() });
  }

  return Response.json({
    ok: true,
    job_id: result.detectorJobId || undefined,
    local_job_id: jobId,
    status: result.status,
    result_url: result.resultUrl || undefined,
    json_url: result.jsonUrl || undefined,
    image_url: result.imageUrl || undefined,
    report_url: `/api-transit/detector/reports/${encodeURIComponent(jobId)}`,
  }, { headers: noStoreCacheHeaders() });
}
