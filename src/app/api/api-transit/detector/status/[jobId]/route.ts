import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { getSupabaseServerClient } from "@/lib/supabase";
import { updateUserDetectorJob } from "@/lib/account";
import { fetchDetectorJson, normalizeDetectorServiceUrl, resolveDetectorStatusUrl } from "@/lib/detector-request";
import { getRuntimeEnv } from "@/lib/runtime-env";

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

  const storedStatus = String(data.status || "queued");
  if (storedStatus === "done") {
    return Response.json({
      ok: true,
      status: "done",
      job_id: data.detector_job_id || undefined,
      local_job_id: jobId,
      report_url: `/api-transit/detector/reports/${encodeURIComponent(jobId)}`,
    }, { headers: noStoreCacheHeaders() });
  }
  if (storedStatus === "error" || storedStatus === "timed_out") {
    return Response.json({
      ok: false,
      code: storedStatus === "timed_out" ? "job_timed_out" : "detector_failed",
      status: "error",
      error: String(data.error_message || (storedStatus === "timed_out" ? "检测任务等待超时。" : "检测任务失败。")),
      local_job_id: jobId,
    }, { headers: noStoreCacheHeaders() });
  }

  const leaseExpiresAt = typeof data.lease_expires_at === "string" ? Date.parse(data.lease_expires_at) : Number.NaN;
  if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now()) {
    await updateUserDetectorJob({
      id: jobId,
      userId: user.id,
      status: "timed_out",
      errorMessage: "检测任务超过等待时间，已自动释放名额。",
    });
    return Response.json({
      ok: false,
      code: "job_timed_out",
      status: "error",
      error: "检测任务等待超时，名额已自动释放。",
      local_job_id: jobId,
    }, { headers: noStoreCacheHeaders() });
  }

  const storedStatusUrl = typeof data.status_url === "string" ? data.status_url : "";
  if (!storedStatusUrl) {
    return Response.json({
      ok: true,
      status: "queued",
      message: "任务已创建，正在等待检测服务返回状态地址。",
      local_job_id: jobId,
    }, { status: 202, headers: { ...noStoreCacheHeaders(), "Retry-After": "2" } });
  }

  let statusUrl: string;
  let response: Response;
  let payload: DetectorStatusResponse;
  try {
    const detectorServiceUrl = normalizeDetectorServiceUrl(getRuntimeEnv("NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL"));
    statusUrl = resolveDetectorStatusUrl(detectorServiceUrl, storedStatusUrl);
    ({ response, data: payload } = await fetchDetectorJson<DetectorStatusResponse>(statusUrl, {
      cache: "no-store",
    }, { timeoutMs: 12_000, maxBytes: 512 * 1024 }));
  } catch (fetchError) {
    return Response.json({
      ok: false,
      retryable: true,
      code: "detector_status_unavailable",
      status: storedStatus === "queued" ? "queued" : "running",
      message: fetchError instanceof Error ? fetchError.message : "检测服务暂时不可达。",
      local_job_id: jobId,
    }, { status: 503, headers: { ...noStoreCacheHeaders(), "Retry-After": "5" } });
  }
  if (!response.ok) {
    return Response.json({ ok: false, message: payload.detail || payload.error || "读取检测状态失败。" }, { status: response.status, headers: noStoreCacheHeaders() });
  }

  const nextStatus = payload.status === "done" ? "done" : payload.status === "error" ? "error" : payload.status === "queued" ? "queued" : "running";
  await updateUserDetectorJob({
    id: jobId,
    userId: user.id,
    status: nextStatus,
    detectorJobId: payload.job_id || String(data.detector_job_id || ""),
    statusUrl,
    resultUrl: payload.result_url || String(data.result_url || "") || null,
    jsonUrl: payload.json_url || String(data.json_url || "") || null,
    imageUrl: payload.image_url || String(data.image_url || "") || null,
    errorMessage: payload.error || null,
  });

  return Response.json(
    {
      ok: true,
      ...payload,
      local_job_id: jobId,
      report_url: `/api-transit/detector/reports/${encodeURIComponent(jobId)}`,
    },
    { headers: noStoreCacheHeaders() },
  );
}

type DetectorStatusResponse = {
  job_id?: string;
  status?: "queued" | "running" | "done" | "error";
  result_url?: string;
  image_url?: string;
  json_url?: string;
  error?: string;
  detail?: string;
};
