import "server-only";

import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { FeedbackFollowup, OfferFeedback, TransitDetectorJob, TransitDetectorJobStatus } from "@/lib/types";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

export async function listUserOfferFeedback(userId: string): Promise<OfferFeedback[]> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("offer_feedback")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapAccountOfferFeedbackRow);
}

export async function getUserOfferFeedback(userId: string, feedbackId: string): Promise<OfferFeedback | null> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("offer_feedback")
    .select("*")
    .eq("id", feedbackId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAccountOfferFeedbackRow(data) : null;
}

export async function listUserFeedbackFollowups(userId: string, feedbackId: string): Promise<FeedbackFollowup[]> {
  const supabase = getRequiredSupabase();
  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("offer_feedback")
    .select("id")
    .eq("id", feedbackId)
    .eq("user_id", userId)
    .limit(1);
  if (feedbackError) throw feedbackError;
  if (!feedbackRows?.length) throw new Error("没有找到这条反馈，或你无权查看。");

  const { data, error } = await supabase
    .from("feedback_followups")
    .select("*")
    .eq("feedback_id", feedbackId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data || []).map(mapFeedbackFollowupRow);
}

export async function createUserFeedbackFollowup(input: {
  userId: string;
  feedbackId: string;
  message: string;
  evidenceUrls?: string[];
}): Promise<FeedbackFollowup> {
  const supabase = getRequiredSupabase();
  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("offer_feedback")
    .select("id")
    .eq("id", input.feedbackId)
    .eq("user_id", input.userId)
    .limit(1);
  if (feedbackError) throw feedbackError;
  if (!feedbackRows?.length) throw new Error("没有找到这条反馈，或你无权补充。");

  const id = stableId("feedback-followup", input.feedbackId, input.userId, Date.now().toString());
  const { data, error } = await supabase
    .from("feedback_followups")
    .insert({
      id,
      feedback_id: input.feedbackId,
      user_id: input.userId,
      role: "user",
      message: input.message.trim(),
      evidence_urls: input.evidenceUrls || [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapFeedbackFollowupRow(data);
}

export async function withdrawUserOfferFeedback(input: {
  userId: string;
  feedbackId: string;
  reason?: string | null;
}): Promise<OfferFeedback> {
  const supabase = getRequiredSupabase();
  const { data: feedbackRow, error: feedbackError } = await supabase
    .from("offer_feedback")
    .select("*")
    .eq("id", input.feedbackId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (feedbackError) throw feedbackError;
  if (!feedbackRow) throw new Error("没有找到这条反馈，或你无权撤销。");

  const feedback = mapAccountOfferFeedbackRow(feedbackRow);
  if (feedback.publicStatus === "withdrawn") return feedback;

  const now = new Date().toISOString();
  const withdrawReason = input.reason?.trim() || "已与商家协商一致或不再需要继续公开展示。";
  const { data: updatedRow, error: updateError } = await supabase
    .from("offer_feedback")
    .update({
      status: "ignored",
      public_status: "withdrawn",
      withdrawn_at: now,
      withdraw_reason: withdrawReason,
      reviewer_note: "用户已撤销反馈。",
      reviewed_at: now,
    })
    .eq("id", input.feedbackId)
    .eq("user_id", input.userId)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedRow) throw new Error("没有找到这条反馈，或你无权撤销。");

  const followupId = stableId("feedback-withdraw", input.feedbackId, input.userId, now);
  const { error: followupError } = await supabase.from("feedback_followups").insert({
    id: followupId,
    feedback_id: input.feedbackId,
    user_id: input.userId,
    role: "user",
    message: `用户撤销反馈：${withdrawReason}`,
    evidence_urls: [],
  });
  if (followupError) {
    console.warn("Feedback withdrawal followup insert failed:", followupError.message);
  }

  return mapAccountOfferFeedbackRow(updatedRow);
}

export async function listUserDetectorJobs(userId: string): Promise<TransitDetectorJob[]> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("transit_detector_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapDetectorJobRow);
}

export async function countRecentUserDetectorJobs(userId: string, sinceIso: string): Promise<number> {
  const supabase = getRequiredSupabase();
  const { count, error } = await supabase
    .from("transit_detector_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("submitted_at", sinceIso);
  if (error) throw error;
  return count || 0;
}

export async function countActiveUserDetectorJobs(userId: string): Promise<number> {
  const supabase = getRequiredSupabase();
  const { count, error } = await supabase
    .from("transit_detector_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);
  if (error) throw error;
  return count || 0;
}

export async function createUserDetectorJob(input: {
  id: string;
  userId: string;
  userEmail?: string | null;
  protocol: string;
  baseUrl: string;
  targetModel: string;
  intensity: string;
  includeLongContext: boolean;
  upstreamType?: string | null;
}): Promise<void> {
  const supabase = getRequiredSupabase();
  const { error } = await supabase.from("transit_detector_jobs").insert({
    id: input.id,
    user_id: input.userId,
    user_email: input.userEmail || null,
    protocol: input.protocol,
    base_url: input.baseUrl,
    target_model: input.targetModel,
    intensity: input.intensity,
    include_long_context: input.includeLongContext,
    upstream_type: input.upstreamType || null,
    status: "queued",
  });
  if (error) throw error;
}

export async function updateUserDetectorJob(input: {
  id: string;
  status: TransitDetectorJobStatus;
  detectorJobId?: string | null;
  statusUrl?: string | null;
  resultUrl?: string | null;
  jsonUrl?: string | null;
  imageUrl?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = getRequiredSupabase();
  const patch: Record<string, unknown> = {
    status: input.status,
    detector_job_id: input.detectorJobId ?? null,
    status_url: input.statusUrl ?? null,
    result_url: input.resultUrl ?? null,
    json_url: input.jsonUrl ?? null,
    image_url: input.imageUrl ?? null,
    error_message: input.errorMessage ?? null,
  };
  if (input.status === "done" || input.status === "error") {
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("transit_detector_jobs").update(patch).eq("id", input.id);
  if (error) throw error;
}

export const feedbackFollowupSchema = z.object({
  message: z.string().trim().min(2, "补充说明至少需要 2 个字。").max(1000, "补充说明不能超过 1000 字。"),
  evidenceUrls: z.array(z.string().max(2048)).max(10).optional(),
});

export const feedbackWithdrawSchema = z.object({
  reason: z.string().trim().max(500, "撤销说明不能超过 500 字。").nullable().optional(),
});

function getRequiredSupabase(): SupabaseClient {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");
  return supabase;
}

export function mapAccountOfferFeedbackRow(row: Record<string, unknown>): OfferFeedback {
  return {
    id: String(row.id),
    feedbackScope: row.feedback_scope === "merchant" ? "merchant" : "offer",
    productId: row.product_id ? String(row.product_id) : null,
    productSlug: row.product_slug ? String(row.product_slug) : null,
    productName: row.product_name ? String(row.product_name) : null,
    offerId: row.offer_id ? String(row.offer_id) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    sourceTitle: row.source_title ? String(row.source_title) : null,
    offerUrl: row.offer_url ? String(row.offer_url) : null,
    offerPrice: row.offer_price === null || row.offer_price === undefined ? null : Number(row.offer_price),
    offerCurrency: row.offer_currency ? String(row.offer_currency) : null,
    offerStatus: row.offer_status ? String(row.offer_status) as OfferFeedback["offerStatus"] : null,
    offerCapturedAt: row.offer_captured_at ? String(row.offer_captured_at) : null,
    offerSourceUpdatedAt: row.offer_source_updated_at ? String(row.offer_source_updated_at) : null,
    offerLastSeenAt: row.offer_last_seen_at ? String(row.offer_last_seen_at) : null,
    reason: String(row.reason || "other") as OfferFeedback["reason"],
    userExpectedAction: String(row.user_expected_action || "recheck") as OfferFeedback["userExpectedAction"],
    suggestedAction: String(row.suggested_action || "todo") as OfferFeedback["suggestedAction"],
    evidenceText: row.evidence_text ? String(row.evidence_text) : null,
    evidenceUrls: parseJsonStringArray(row.evidence_urls),
    aiReviewResult: row.ai_review_result && typeof row.ai_review_result === "object" ? row.ai_review_result as Record<string, unknown> : null,
    riskPrecheck: null,
    verificationStatus: String(row.verification_status || "not_needed") as OfferFeedback["verificationStatus"],
    verificationResult: row.verification_result ? String(row.verification_result) as OfferFeedback["verificationResult"] : null,
    verifiedAt: row.verification_checked_at ? String(row.verification_checked_at) : null,
    verificationMessage: row.verification_message ? String(row.verification_message) : null,
    createdCollectionJobId: row.created_collection_job_id ? String(row.created_collection_job_id) : null,
    notes: row.notes ? String(row.notes) : null,
    contact: row.contact ? String(row.contact) : null,
    status: String(row.status || "pending") as OfferFeedback["status"],
    publicStatus: normalizeFeedbackPublicStatus(row.public_status),
    withdrawnAt: row.withdrawn_at ? String(row.withdrawn_at) : null,
    withdrawReason: row.withdraw_reason ? String(row.withdraw_reason) : null,
    reviewerNote: row.reviewer_note ? String(row.reviewer_note) : null,
    submitterIp: row.submitter_ip ? String(row.submitter_ip) : null,
    userId: row.user_id ? String(row.user_id) : null,
    userEmail: row.user_email ? String(row.user_email) : null,
    userDisplayName: row.user_display_name ? String(row.user_display_name) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

function normalizeFeedbackPublicStatus(value: unknown): OfferFeedback["publicStatus"] {
  if (value === "pending_review" || value === "public" || value === "withdrawn" || value === "not_public") {
    return value;
  }
  return "not_public";
}

export function mapFeedbackFollowupRow(row: Record<string, unknown>): FeedbackFollowup {
  return {
    id: String(row.id),
    feedbackId: String(row.feedback_id),
    userId: row.user_id ? String(row.user_id) : null,
    role: row.role === "admin" ? "admin" : "user",
    message: String(row.message || ""),
    evidenceUrls: parseJsonStringArray(row.evidence_urls),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDetectorJobRow(row: Record<string, unknown>): TransitDetectorJob {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userEmail: row.user_email ? String(row.user_email) : null,
    protocol: String(row.protocol || ""),
    baseUrl: row.base_url ? String(row.base_url) : null,
    targetModel: String(row.target_model || ""),
    intensity: String(row.intensity || "standard"),
    includeLongContext: Boolean(row.include_long_context),
    upstreamType: row.upstream_type ? String(row.upstream_type) : null,
    status: String(row.status || "queued") as TransitDetectorJobStatus,
    detectorJobId: row.detector_job_id ? String(row.detector_job_id) : null,
    statusUrl: row.status_url ? String(row.status_url) : null,
    resultUrl: row.result_url ? String(row.result_url) : null,
    jsonUrl: row.json_url ? String(row.json_url) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    submittedAt: String(row.submitted_at || new Date().toISOString()),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function stableId(...parts: string[]): string {
  return parts.join(":").replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 180);
}
