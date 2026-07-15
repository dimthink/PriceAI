import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { getSupabaseServerClient } from "@/lib/supabase";
import { updateUserDetectorJob } from "@/lib/account";

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

  const statusUrl = typeof data.status_url === "string" ? data.status_url : "";
  if (!statusUrl) {
    return Response.json({ ok: false, message: "检测任务缺少状态地址。" }, { status: 502, headers: noStoreCacheHeaders() });
  }

  const response = await fetch(statusUrl.startsWith("http") ? statusUrl : statusUrl, { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as DetectorStatusResponse;
  if (!response.ok) {
    return Response.json({ ok: false, message: payload.detail || payload.error || "读取检测状态失败。" }, { status: response.status, headers: noStoreCacheHeaders() });
  }

  const nextStatus = payload.status === "done" ? "done" : payload.status === "error" ? "error" : payload.status === "queued" ? "queued" : "running";
  await updateUserDetectorJob({
    id: jobId,
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
