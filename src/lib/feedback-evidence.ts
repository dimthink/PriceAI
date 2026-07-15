import "server-only";

import crypto from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSupabaseServerClient } from "@/lib/supabase";

export const FEEDBACK_EVIDENCE_BUCKET_HOST = "feedback-evidence";
export const FEEDBACK_EVIDENCE_URL_PREFIX = `r2://${FEEDBACK_EVIDENCE_BUCKET_HOST}/`;
export const FEEDBACK_EVIDENCE_MAX_IMAGES = 5;
export const FEEDBACK_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;
export const FEEDBACK_EVIDENCE_DRAFT_TTL_HOURS = 24;

const FEEDBACK_EVIDENCE_BINDING = "FEEDBACK_EVIDENCE_BUCKET";
const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type FeedbackEvidenceBucket = {
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string;
        contentDisposition?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<unknown>;
  get: (key: string) => Promise<FeedbackEvidenceObject | null>;
  delete: (key: string) => Promise<unknown>;
};

type FeedbackEvidenceObject = {
  body: ReadableStream;
  size?: number;
  httpMetadata?: {
    contentType?: string;
  };
};

type FeedbackEvidenceEnv = CloudflareEnv & {
  FEEDBACK_EVIDENCE_BUCKET?: FeedbackEvidenceBucket;
};

export type FeedbackEvidenceUploadResult = {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

export type FeedbackEvidenceReadResult = {
  body: ReadableStream;
  contentType: string;
  size?: number;
};

export async function consumeFeedbackEvidenceUploadQuota(input: {
  userId: string;
  windowSeconds?: number;
  maxUploads?: number;
}): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
  assertUuid(input.userId, "登录用户");
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("上传限流服务尚未配置。");
  const keyHash = crypto
    .createHmac("sha256", secret)
    .update(`feedback-evidence-upload:${input.userId}`)
    .digest("hex");
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase.rpc("consume_feedback_evidence_upload_quota", {
    p_key_hash: keyHash,
    p_window_seconds: input.windowSeconds || 3600,
    p_max_uploads: input.maxUploads || 30,
  });
  if (error) throw error;
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    allowed: row.allowed === true,
    count: Number(row.count || 0),
    retryAfterSeconds: Math.max(0, Number(row.retryAfterSeconds || 0)),
  };
}

export async function uploadFeedbackEvidenceImage(
  file: File,
  owner: { userId: string; draftId: string },
): Promise<FeedbackEvidenceUploadResult> {
  validateFeedbackEvidenceImage(file);
  assertUuid(owner.userId, "登录用户");
  assertUuid(owner.draftId, "反馈草稿");

  const bucket = await getFeedbackEvidenceBucket();
  const key = buildFeedbackEvidenceKey(file.type, owner);
  const body = await file.arrayBuffer();
  const expiresAt = new Date(Date.now() + FEEDBACK_EVIDENCE_DRAFT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const reference = feedbackEvidenceReferenceForKey(key);

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: file.type,
      contentDisposition: `inline; filename="${safeFilename(file.name || "evidence")}"`,
    },
    customMetadata: {
      originalName: safeFilename(file.name || "evidence"),
      uploadedAt: new Date().toISOString(),
      userId: owner.userId,
      draftId: owner.draftId,
      expiresAt,
    },
  });

  try {
    const supabase = getRequiredSupabase();
    const { error } = await supabase.from("feedback_evidence_objects").insert({
      user_id: owner.userId,
      draft_id: owner.draftId,
      object_key: key,
      reference,
      original_name: safeFilename(file.name || "evidence"),
      mime_type: file.type,
      size_bytes: file.size,
      expires_at: expiresAt,
    });
    if (error) throw error;
  } catch (error) {
    await bucket.delete(key).catch(() => null);
    throw error;
  }

  return {
    url: reference,
    key,
    name: file.name || "evidence",
    mimeType: file.type,
    size: file.size,
  };
}

export async function assertFeedbackEvidenceOwnership(references: string[], userId: string): Promise<void> {
  const managedReferences = uniqueManagedDraftReferences(references);
  if (!managedReferences.length) return;

  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("feedback_evidence_objects")
    .select("reference,user_id,status,expires_at")
    .in("reference", managedReferences);
  if (error) throw error;

  const now = Date.now();
  const valid = new Set((data || []).filter((row) =>
    row.user_id === userId &&
    row.status === "draft" &&
    typeof row.expires_at === "string" &&
    Date.parse(row.expires_at) > now
  ).map((row) => String(row.reference)));

  if (managedReferences.some((reference) => !valid.has(reference))) {
    throw new Error("图片证据已过期、已使用或不属于当前账号，请重新上传。");
  }
}

export async function bindFeedbackEvidenceReferences(input: {
  references: string[];
  userId: string;
  feedbackId: string;
}): Promise<void> {
  const managedReferences = uniqueManagedDraftReferences(input.references);
  if (!managedReferences.length) return;

  const supabase = getRequiredSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("feedback_evidence_objects")
    .update({
      status: "bound",
      feedback_id: input.feedbackId,
      bound_at: now,
      expires_at: null,
    })
    .eq("user_id", input.userId)
    .eq("status", "draft")
    .in("reference", managedReferences)
    .select("reference");
  if (error) throw error;
  if ((data || []).length !== managedReferences.length) {
    throw new Error("部分图片证据没有成功绑定到反馈记录。");
  }
}

export async function cleanupExpiredFeedbackEvidenceDrafts(limit = 100): Promise<{
  candidates: number;
  deleted: number;
  failed: number;
}> {
  const supabase = getRequiredSupabase();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 500));
  const { data, error } = await supabase
    .from("feedback_evidence_objects")
    .select("id,object_key")
    .eq("status", "draft")
    .lte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(boundedLimit);
  if (error) throw error;

  const rows = data || [];
  if (!rows.length) return { candidates: 0, deleted: 0, failed: 0 };
  const bucket = await getFeedbackEvidenceBucket();
  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await bucket.delete(String(row.object_key));
      const { error: updateError } = await supabase
        .from("feedback_evidence_objects")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "draft");
      if (updateError) throw updateError;
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return { candidates: rows.length, deleted, failed };
}

export async function deleteUserFeedbackEvidence(userId: string): Promise<{
  candidates: number;
  deleted: number;
  failed: number;
  remaining: number;
}> {
  assertUuid(userId, "登录用户");
  const supabase = getRequiredSupabase();
  const bucket = await getFeedbackEvidenceBucket();
  const batchSize = 250;
  const maxBatchesPerRun = 20;
  let candidates = 0;
  let deleted = 0;
  let failed = 0;

  for (let batch = 0; batch < maxBatchesPerRun; batch += 1) {
    const { data, error } = await supabase
      .from("feedback_evidence_objects")
      .select("id,object_key,status")
      .eq("user_id", userId)
      .neq("status", "deleted")
      .order("created_at", { ascending: true })
      .limit(batchSize);
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) break;
    candidates += rows.length;

    for (const row of rows) {
      try {
        await bucket.delete(String(row.object_key));
        const { error: updateError } = await supabase
          .from("feedback_evidence_objects")
          .update({ status: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", userId);
        if (updateError) throw updateError;
        deleted += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0 || rows.length < batchSize) break;
  }

  const { count, error: remainingError } = await supabase
    .from("feedback_evidence_objects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "deleted");
  if (remainingError) throw remainingError;

  return { candidates, deleted, failed, remaining: count || 0 };
}

export async function deleteFeedbackEvidenceDraft(reference: string, userId: string): Promise<boolean> {
  assertUuid(userId, "登录用户");
  const key = parseFeedbackEvidenceKey(reference);
  if (!key?.startsWith("feedback-drafts/")) throw new Error("图片证据引用无效。");

  const supabase = getRequiredSupabase();
  const { data, error } = await supabase
    .from("feedback_evidence_objects")
    .select("id,object_key,status")
    .eq("reference", reference)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "deleted") return true;
  if (data.status !== "draft") throw new Error("已绑定反馈的图片不能从草稿中删除。");

  const bucket = await getFeedbackEvidenceBucket();
  await bucket.delete(String(data.object_key));
  const { error: updateError } = await supabase
    .from("feedback_evidence_objects")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("user_id", userId)
    .eq("status", "draft");
  if (updateError) throw updateError;
  return true;
}

export async function readFeedbackEvidenceImage(reference: string): Promise<FeedbackEvidenceReadResult | null> {
  const key = parseFeedbackEvidenceKey(reference);
  if (!key) return null;

  const bucket = await getFeedbackEvidenceBucket();
  const object = await bucket.get(key);
  if (!object) return null;

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType || mimeTypeFromKey(key),
    size: object.size,
  };
}

export function isFeedbackEvidenceReference(value: string): boolean {
  return Boolean(parseFeedbackEvidenceKey(value));
}

export function feedbackEvidenceReferenceForKey(key: string): string {
  return `${FEEDBACK_EVIDENCE_URL_PREFIX}${key}`;
}

function validateFeedbackEvidenceImage(file: File): void {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error("不支持这种图片格式，请上传 PNG、JPG 或 WebP。");
  }

  if (file.size <= 0) {
    throw new Error("图片文件无效，请重新选择。");
  }

  if (file.size > FEEDBACK_EVIDENCE_MAX_BYTES) {
    throw new Error("图片文件不能超过 4MB。");
  }
}

function parseFeedbackEvidenceKey(reference: string): string | null {
  if (!reference.startsWith(FEEDBACK_EVIDENCE_URL_PREFIX)) return null;

  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== "r2:" || parsed.hostname !== FEEDBACK_EVIDENCE_BUCKET_HOST) return null;

    const key = parsed.pathname.replace(/^\/+/, "");
    const legacyKey = /^feedback\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key);
    const draftKey = /^feedback-drafts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key);
    if (!legacyKey && !draftKey) return null;

    return key;
  } catch {
    return null;
  }
}

async function getFeedbackEvidenceBucket(): Promise<FeedbackEvidenceBucket> {
  try {
    const context = await getCloudflareContext({ async: true });
    const bucket = (context.env as FeedbackEvidenceEnv)[FEEDBACK_EVIDENCE_BINDING];
    if (!bucket) throw new Error("图片上传暂不可用：R2 存储尚未配置。");
    return bucket;
  } catch (error) {
    if (error instanceof Error && error.message.includes("R2 存储尚未配置")) throw error;
    throw new Error("图片上传暂不可用：R2 存储尚未配置。");
  }
}

function buildFeedbackEvidenceKey(mimeType: string, owner: { userId: string; draftId: string }): string {
  const extension = allowedImageTypes.get(mimeType) || "bin";
  return `feedback-drafts/${owner.userId}/${owner.draftId}/${crypto.randomUUID()}.${extension}`;
}

function mimeTypeFromKey(key: string): string {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 120) || "evidence";
}

function uniqueManagedDraftReferences(references: string[]): string[] {
  return Array.from(new Set(references.filter((reference) => {
    const key = parseFeedbackEvidenceKey(reference);
    return Boolean(key?.startsWith("feedback-drafts/"));
  })));
}

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label}标识格式不正确。`);
  }
}

function getRequiredSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，暂时无法保存图片证据。");
  return supabase;
}
