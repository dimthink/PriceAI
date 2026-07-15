import "server-only";

import { ACCOUNT_DETECTOR_JOB_FIELDS, ACCOUNT_FEEDBACK_FIELDS } from "@/lib/account";
import { getSupabaseServerClient } from "@/lib/supabase";

const DELETION_REQUEST_FIELDS = "id,status,requested_at,scheduled_for,cancelled_at,completed_at,resolution_note";

export type AccountDeletionRequest = {
  id: string;
  status: "pending" | "processing" | "cancelled" | "completed" | "rejected";
  requestedAt: string;
  scheduledFor: string;
  cancelledAt: string | null;
  completedAt: string | null;
  resolutionNote: string | null;
};

export async function getActiveAccountDeletionRequest(userId: string): Promise<AccountDeletionRequest | null> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select(DELETION_REQUEST_FIELDS)
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDeletionRequest(data) : null;
}

export async function createAccountDeletionRequest(user: { id: string; email: string | null }): Promise<AccountDeletionRequest> {
  const existing = await getActiveAccountDeletionRequest(user.id);
  if (existing) return existing;

  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .insert({ user_id: user.id, user_email: user.email, status: "pending" })
    .select(DELETION_REQUEST_FIELDS)
    .single();
  if (error) {
    const concurrent = await getActiveAccountDeletionRequest(user.id).catch(() => null);
    if (concurrent) return concurrent;
    throw error;
  }
  return mapDeletionRequest(data);
}

export async function cancelAccountDeletionRequest(userId: string): Promise<void> {
  const supabase = getRequiredSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function buildAccountDataExport(user: {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const supabase = getRequiredSupabase();
  const [profile, feedback, followups, detectorJobs, reportShares, evidenceObjects, deletionRequests] = await Promise.all([
    supabase.from("public_user_profiles")
      .select("id,email,display_name,avatar_url,provider,last_sign_in_at,created_at,updated_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("offer_feedback")
      .select(ACCOUNT_FEEDBACK_FIELDS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("feedback_followups")
      .select("id,feedback_id,role,message,evidence_urls,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("transit_detector_jobs")
      .select(ACCOUNT_DETECTOR_JOB_FIELDS)
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1000),
    supabase.from("transit_detector_report_shares")
      .select("id,job_id,status,expires_at,created_at,revoked_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("feedback_evidence_objects")
      .select("id,draft_id,feedback_id,status,original_name,mime_type,size_bytes,expires_at,bound_at,deleted_at,created_at,updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("account_deletion_requests")
      .select(DELETION_REQUEST_FIELDS)
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(100),
  ]);

  const results = [profile, feedback, followups, detectorJobs, reportShares, evidenceObjects, deletionRequests];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return {
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    account: user,
    profile: profile.data,
    feedback: feedback.data || [],
    feedbackFollowups: followups.data || [],
    detectorJobs: detectorJobs.data || [],
    detectorReportShares: reportShares.data || [],
    feedbackEvidenceObjects: evidenceObjects.data || [],
    deletionRequests: deletionRequests.data || [],
    notes: [
      "导出不包含 OAuth token、Session Cookie、管理员字段、报告分享 token 明文或第三方检测服务中的原始报告文件。",
      "单类记录超过 1000 条时需要联系 PriceAI 获取分批导出。",
    ],
  };
}

function mapDeletionRequest(row: Record<string, unknown>): AccountDeletionRequest {
  return {
    id: String(row.id),
    status: String(row.status) as AccountDeletionRequest["status"],
    requestedAt: String(row.requested_at),
    scheduledFor: String(row.scheduled_for),
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
  };
}

function getRequiredSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");
  return supabase;
}
