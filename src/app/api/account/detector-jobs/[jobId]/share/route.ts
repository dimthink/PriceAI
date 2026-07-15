import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { accountApiErrorResponse, accountConflict, accountNotFound } from "@/lib/account-api-errors";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import {
  createDetectorReportShareToken,
  detectorReportSharePath,
  hashDetectorReportShareToken,
} from "@/lib/detector-report-share";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isSameOriginMutation, sameOriginRequiredResponse } from "@/lib/request-origin";

type ShareRouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: ShareRouteContext) {
  const access = await resolveOwnedCompletedJob(context);
  if (access.response) return access.response;

  const { count, error } = await access.supabase
    .from("transit_detector_report_shares")
    .select("id", { count: "exact", head: true })
    .eq("job_id", access.jobId)
    .eq("user_id", access.userId)
    .eq("status", "active");
  if (error) return shareErrorResponse();
  return Response.json({ ok: true, active: Boolean(count) }, { headers: noStoreCacheHeaders() });
}

export async function POST(request: Request, context: ShareRouteContext) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const access = await resolveOwnedCompletedJob(context);
  if (access.response) return access.response;

  const now = new Date().toISOString();
  const { error: revokeError } = await access.supabase
    .from("transit_detector_report_shares")
    .update({ status: "revoked", revoked_at: now })
    .eq("job_id", access.jobId)
    .eq("user_id", access.userId)
    .eq("status", "active");
  if (revokeError) return shareErrorResponse();

  const token = createDetectorReportShareToken();
  const { error } = await access.supabase.from("transit_detector_report_shares").insert({
    job_id: access.jobId,
    user_id: access.userId,
    token_hash: hashDetectorReportShareToken(token),
    status: "active",
  });
  if (error) return shareErrorResponse();

  return Response.json({
    ok: true,
    active: true,
    sharePath: detectorReportSharePath(token),
  }, { headers: noStoreCacheHeaders() });
}

export async function DELETE(request: Request, context: ShareRouteContext) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const access = await resolveOwnedCompletedJob(context);
  if (access.response) return access.response;

  const { error } = await access.supabase
    .from("transit_detector_report_shares")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("job_id", access.jobId)
    .eq("user_id", access.userId)
    .eq("status", "active");
  if (error) return shareErrorResponse();
  return Response.json({ ok: true, active: false }, { headers: noStoreCacheHeaders() });
}

async function resolveOwnedCompletedJob(context: ShareRouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return { response: authRequiredResponse(), supabase: null as never, jobId: "", userId: "" };
  }
  const { jobId } = await context.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { response: shareErrorResponse(), supabase: null as never, jobId, userId: user.id };
  }
  const { data, error } = await supabase
    .from("transit_detector_jobs")
    .select("id,status")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return {
      response: shareErrorResponse(),
      supabase: null as never,
      jobId,
      userId: user.id,
    };
  }
  if (!data) {
    return {
      response: accountApiErrorResponse(accountNotFound("没有找到这份报告。"), "没有找到这份报告。"),
      supabase: null as never,
      jobId,
      userId: user.id,
    };
  }
  if (data.status !== "done") {
    return {
      response: accountApiErrorResponse(accountConflict("检测完成后才能创建分享链接。"), "检测完成后才能创建分享链接。"),
      supabase: null as never,
      jobId,
      userId: user.id,
    };
  }
  return { response: null, supabase, jobId, userId: user.id };
}

function shareErrorResponse() {
  return accountApiErrorResponse(null, "报告分享服务暂时不可用，请稍后再试。");
}
