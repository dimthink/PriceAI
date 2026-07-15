import "server-only";

import {
  mapAccountOfferFeedbackRow,
  mapDetectorJobRow,
  mapFeedbackFollowupRow,
} from "@/lib/account";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AdminUserDetail,
  AdminUserListResult,
  AdminUserMetrics,
  AdminUserSummary,
  FeedbackFollowup,
  OfferFeedback,
  PublicUserProfile,
  TransitDetectorJob,
} from "@/lib/types";

type ProfileRow = Record<string, unknown>;
type FeedbackMetricRow = {
  user_id?: string | null;
  status?: string | null;
  public_status?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
};
type DetectorMetricRow = {
  user_id?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
};

const ADMIN_USERS_LIMIT_DEFAULT = 80;
const ADMIN_USERS_LIMIT_MAX = 150;
const ADMIN_METRICS_SCAN_LIMIT = 10_000;

export async function listAdminUsers(input: {
  query?: string | null;
  limit?: number | null;
} = {}): Promise<AdminUserListResult> {
  const supabase = getRequiredSupabase();
  const queryText = cleanQuery(input.query);
  const limit = clampLimit(input.limit);

  let profilesQuery = supabase
    .from("public_user_profiles")
    .select("*", { count: "exact" })
    .order("last_sign_in_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const search = toSearchPattern(queryText);
  if (search) {
    const filters = [
      `email.ilike.${search}`,
      `display_name.ilike.${search}`,
    ];
    if (isUuid(queryText)) filters.push(`id.eq.${queryText}`);
    profilesQuery = profilesQuery.or(filters.join(","));
  }

  const [{ data, error, count }, metrics] = await Promise.all([
    profilesQuery,
    loadAdminUserMetrics(),
  ]);
  if (error) throw error;

  const profiles = (data || []).map(mapPublicUserProfileRow);
  const summaries = await attachAdminUserActivity(profiles);

  return {
    users: summaries,
    metrics,
    total: count || profiles.length,
    query: queryText,
  };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const supabase = getRequiredSupabase();
  const cleanUserId = userId.trim();
  if (!isUuid(cleanUserId)) throw new Error("用户 ID 格式不正确。");

  const { data: profileRow, error: profileError } = await supabase
    .from("public_user_profiles")
    .select("*")
    .eq("id", cleanUserId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) throw new Error("没有找到这个登录用户。");

  const [feedbackResult, detectorResult] = await Promise.all([
    supabase
      .from("offer_feedback")
      .select("*")
      .eq("user_id", cleanUserId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("transit_detector_jobs")
      .select("*")
      .eq("user_id", cleanUserId)
      .order("submitted_at", { ascending: false })
      .limit(100),
  ]);

  if (feedbackResult.error) throw feedbackResult.error;
  if (detectorResult.error) throw detectorResult.error;

  const feedback = (feedbackResult.data || []).map(mapAccountOfferFeedbackRow);
  const detectorJobs = (detectorResult.data || []).map(mapDetectorJobRow);
  const followups = await listAdminFeedbackFollowups(feedback.map((item) => item.id));
  const profile = mapPublicUserProfileRow(profileRow);
  const summary = summarizeAdminUser(profile, feedback, detectorJobs);

  return {
    profile,
    summary,
    feedback,
    detectorJobs,
    followups,
  };
}

export async function createAdminFeedbackFollowup(input: {
  feedbackId: string;
  message: string;
}): Promise<FeedbackFollowup> {
  const supabase = getRequiredSupabase();
  const feedbackId = input.feedbackId.trim();
  const message = input.message.trim();
  if (!feedbackId) throw new Error("缺少反馈 ID。");
  if (message.length < 2) throw new Error("补充说明至少需要 2 个字。");
  if (message.length > 1000) throw new Error("补充说明不能超过 1000 字。");

  const { data: feedbackRow, error: feedbackError } = await supabase
    .from("offer_feedback")
    .select("id,user_id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (feedbackError) throw feedbackError;
  if (!feedbackRow) throw new Error("反馈记录不存在。");

  const userId = typeof feedbackRow.user_id === "string" ? feedbackRow.user_id : "";
  if (!userId) throw new Error("这条反馈没有绑定登录用户，不能发起账户沟通。");

  const id = stableId("feedback-admin-followup", feedbackId, userId, Date.now().toString(), randomId());
  const { data, error } = await supabase
    .from("feedback_followups")
    .insert({
      id,
      feedback_id: feedbackId,
      user_id: userId,
      role: "admin",
      message,
      evidence_urls: [],
    })
    .select("*")
    .single();
  if (error) throw error;

  return mapFeedbackFollowupRow(data);
}

async function attachAdminUserActivity(profiles: PublicUserProfile[]): Promise<AdminUserSummary[]> {
  if (!profiles.length) return [];

  const supabase = getRequiredSupabase();
  const userIds = profiles.map((profile) => profile.id);
  const [feedbackResult, detectorResult] = await Promise.all([
    supabase
      .from("offer_feedback")
      .select("user_id,status,public_status,created_at,reviewed_at")
      .in("user_id", userIds)
      .limit(ADMIN_METRICS_SCAN_LIMIT),
    supabase
      .from("transit_detector_jobs")
      .select("user_id,status,submitted_at,completed_at,updated_at")
      .in("user_id", userIds)
      .limit(ADMIN_METRICS_SCAN_LIMIT),
  ]);

  if (feedbackResult.error) throw feedbackResult.error;
  if (detectorResult.error) throw detectorResult.error;

  const feedbackByUser = groupByUserId<FeedbackMetricRow>(feedbackResult.data || []);
  const detectorByUser = groupByUserId<DetectorMetricRow>(detectorResult.data || []);

  return profiles.map((profile) =>
    summarizeAdminUserFromRows(
      profile,
      feedbackByUser.get(profile.id) || [],
      detectorByUser.get(profile.id) || [],
    ),
  );
}

async function loadAdminUserMetrics(): Promise<AdminUserMetrics> {
  const supabase = getRequiredSupabase();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalResult,
    newUsersResult,
    feedbackResult,
    detectorResult,
    activeDetectorResult,
  ] = await Promise.all([
    supabase.from("public_user_profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("public_user_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    supabase
      .from("offer_feedback")
      .select("user_id,status")
      .not("user_id", "is", null)
      .limit(ADMIN_METRICS_SCAN_LIMIT),
    supabase
      .from("transit_detector_jobs")
      .select("user_id,status")
      .limit(ADMIN_METRICS_SCAN_LIMIT),
    supabase
      .from("transit_detector_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "running"]),
  ]);

  if (totalResult.error) throw totalResult.error;
  if (newUsersResult.error) throw newUsersResult.error;
  if (feedbackResult.error) throw feedbackResult.error;
  if (detectorResult.error) throw detectorResult.error;
  if (activeDetectorResult.error) throw activeDetectorResult.error;

  const feedbackUsers = new Set<string>();
  const openFeedbackUsers = new Set<string>();
  for (const row of feedbackResult.data || []) {
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    if (!userId) continue;
    feedbackUsers.add(userId);
    if (row.status === "pending") openFeedbackUsers.add(userId);
  }

  const detectorUsers = new Set<string>();
  for (const row of detectorResult.data || []) {
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    if (userId) detectorUsers.add(userId);
  }

  return {
    totalUsers: totalResult.count || 0,
    newUsers24h: newUsersResult.count || 0,
    feedbackUsers: feedbackUsers.size,
    detectorUsers: detectorUsers.size,
    openFeedbackUsers: openFeedbackUsers.size,
    activeDetectorJobs: activeDetectorResult.count || 0,
  };
}

async function listAdminFeedbackFollowups(feedbackIds: string[]): Promise<FeedbackFollowup[]> {
  if (!feedbackIds.length) return [];

  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("feedback_followups")
    .select("*")
    .in("feedback_id", feedbackIds)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data || []).map(mapFeedbackFollowupRow);
}

function summarizeAdminUser(
  profile: PublicUserProfile,
  feedback: OfferFeedback[],
  detectorJobs: TransitDetectorJob[],
): AdminUserSummary {
  return {
    ...profile,
    feedbackCount: feedback.length,
    openFeedbackCount: feedback.filter((item) => item.status === "pending").length,
    withdrawnFeedbackCount: feedback.filter((item) => item.publicStatus === "withdrawn").length,
    detectorJobCount: detectorJobs.length,
    completedDetectorJobCount: detectorJobs.filter((item) => item.status === "done").length,
    failedDetectorJobCount: detectorJobs.filter((item) => item.status === "error").length,
    lastActivityAt: maxIsoDate([
      profile.lastSignInAt,
      profile.updatedAt,
      ...feedback.flatMap((item) => [item.createdAt, item.reviewedAt]),
      ...detectorJobs.flatMap((item) => [item.submittedAt, item.completedAt, item.updatedAt]),
    ]),
  };
}

function summarizeAdminUserFromRows(
  profile: PublicUserProfile,
  feedbackRows: FeedbackMetricRow[],
  detectorRows: DetectorMetricRow[],
): AdminUserSummary {
  return {
    ...profile,
    feedbackCount: feedbackRows.length,
    openFeedbackCount: feedbackRows.filter((item) => item.status === "pending").length,
    withdrawnFeedbackCount: feedbackRows.filter((item) => item.public_status === "withdrawn").length,
    detectorJobCount: detectorRows.length,
    completedDetectorJobCount: detectorRows.filter((item) => item.status === "done").length,
    failedDetectorJobCount: detectorRows.filter((item) => item.status === "error").length,
    lastActivityAt: maxIsoDate([
      profile.lastSignInAt,
      profile.updatedAt,
      ...feedbackRows.flatMap((item) => [item.created_at, item.reviewed_at]),
      ...detectorRows.flatMap((item) => [item.submitted_at, item.completed_at, item.updated_at]),
    ]),
  };
}

function mapPublicUserProfileRow(row: ProfileRow): PublicUserProfile {
  return {
    id: String(row.id),
    email: stringValue(row.email),
    displayName: stringValue(row.display_name),
    avatarUrl: stringValue(row.avatar_url),
    provider: stringValue(row.provider) || "google",
    lastSignInAt: stringValue(row.last_sign_in_at),
    createdAt: stringValue(row.created_at) || new Date(0).toISOString(),
    updatedAt: stringValue(row.updated_at) || stringValue(row.created_at) || new Date(0).toISOString(),
  };
}

function groupByUserId<T extends { user_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const items = grouped.get(row.user_id) || [];
    items.push(row);
    grouped.set(row.user_id, items);
  }
  return grouped;
}

function getRequiredSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");
  return supabase;
}

function cleanQuery(value: string | null | undefined): string {
  return (value || "").trim().slice(0, 160);
}

function toSearchPattern(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  return `%${normalized.replace(/[%,()]/g, " ").replace(/\s+/g, "%")}%`;
}

function clampLimit(value: number | null | undefined): number {
  if (!Number.isFinite(value || NaN)) return ADMIN_USERS_LIMIT_DEFAULT;
  return Math.min(ADMIN_USERS_LIMIT_MAX, Math.max(10, Math.trunc(value || ADMIN_USERS_LIMIT_DEFAULT)));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  let maxTime = 0;
  let maxValue: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time <= maxTime) continue;
    maxTime = time;
    maxValue = value;
  }
  return maxValue;
}

function randomId(): string {
  return crypto.randomUUID();
}

function stableId(...parts: string[]): string {
  return parts.join(":").replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 180);
}
