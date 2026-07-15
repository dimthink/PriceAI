import "server-only";

import crypto from "node:crypto";
import { deleteUserFeedbackEvidence } from "@/lib/feedback-evidence";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";

type ClaimedDeletionRequest = {
  id: string;
  userId: string;
  attemptCount: number;
};

export type AccountDeletionProcessResult = {
  claimed: number;
  completed: number;
  retried: number;
  evidenceDeleted: number;
  failures: Array<{ requestId: string; message: string }>;
};

export async function processDueAccountDeletions(input: {
  worker: string;
  limit?: number;
}): Promise<AccountDeletionProcessResult> {
  const limit = Math.max(1, Math.min(Math.floor(input.limit || 5), 25));
  const result: AccountDeletionProcessResult = {
    claimed: 0,
    completed: 0,
    retried: 0,
    evidenceDeleted: 0,
    failures: [],
  };

  for (let index = 0; index < limit; index += 1) {
    const request = await claimNextDeletionRequest(input.worker);
    if (!request) break;
    result.claimed += 1;

    try {
      const evidence = await deleteUserFeedbackEvidence(request.userId);
      result.evidenceDeleted += evidence.deleted;
      if (evidence.failed > 0 || evidence.remaining > 0) {
        throw new Error(`${evidence.failed} 个反馈证据对象删除失败，仍有 ${evidence.remaining} 个对象等待后续批次处理。`);
      }

      const supabase = getRequiredSupabase();
      const { data: purgeData, error: purgeError } = await supabase.rpc("purge_account_data", {
        p_request_id: request.id,
        p_user_id: request.userId,
      });
      if (purgeError) throw purgeError;

      const { error: authError } = await supabase.auth.admin.deleteUser(request.userId, false);
      if (authError && !isMissingAuthUserError(authError.message)) throw authError;

      const subjectHash = hashDeletedSubject(request.userId);
      const { data: completed, error: completeError } = await supabase.rpc("complete_account_deletion_request", {
        p_request_id: request.id,
        p_user_id: request.userId,
        p_subject_hash: subjectHash,
        p_resolution_note: buildResolutionNote(purgeData, evidence.deleted),
      });
      if (completeError) throw completeError;
      if (completed !== true) throw new Error("账号删除申请没有成功标记为已完成。");
      result.completed += 1;
    } catch (error) {
      const message = safeDeletionError(error);
      result.failures.push({ requestId: request.id, message });
      const retried = await retryDeletionRequest(request, message).catch(() => false);
      if (retried) result.retried += 1;
    }
  }

  return result;
}

async function claimNextDeletionRequest(worker: string): Promise<ClaimedDeletionRequest | null> {
  const supabase = getRequiredSupabase();
  const { data, error } = await supabase.rpc("claim_due_account_deletion_request", {
    p_worker: worker,
    p_lease_seconds: 900,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = stringValue(record.id);
  const userId = stringValue(record.user_id);
  if (!id || !userId) return null;
  return {
    id,
    userId,
    attemptCount: integerValue(record.attempt_count),
  };
}

async function retryDeletionRequest(request: ClaimedDeletionRequest, message: string): Promise<boolean> {
  const supabase = getRequiredSupabase();
  const retrySeconds = Math.min(24 * 60 * 60, Math.max(15 * 60, 15 * 60 * 2 ** Math.min(request.attemptCount, 6)));
  const { data, error } = await supabase.rpc("retry_account_deletion_request", {
    p_request_id: request.id,
    p_user_id: request.userId,
    p_error: message,
    p_retry_seconds: retrySeconds,
  });
  if (error) throw error;
  return data === true;
}

function hashDeletedSubject(userId: string): string {
  const secret = getRuntimeEnv("ACCOUNT_DELETION_HASH_SECRET") || getRuntimeEnv("ADMIN_SESSION_SECRET");
  if (!secret) throw new Error("ACCOUNT_DELETION_HASH_SECRET 尚未配置。");
  return crypto.createHmac("sha256", secret).update(userId).digest("base64url");
}

function buildResolutionNote(purgeData: unknown, evidenceDeleted: number): string {
  const purge = purgeData && typeof purgeData === "object" ? purgeData as Record<string, unknown> : {};
  return [
    "账号 Auth 与账户资料已删除。",
    `反馈匿名化 ${integerValue(purge.feedbackAnonymized)} 条。`,
    `反馈补充删除 ${integerValue(purge.followupsDeleted)} 条。`,
    `证据元数据删除 ${integerValue(purge.evidenceMetadataDeleted)} 条。`,
    `检测任务删除 ${integerValue(purge.detectorJobsDeleted)} 条。`,
    `R2 证据删除 ${evidenceDeleted} 个。`,
  ].join(" ");
}

function isMissingAuthUserError(message: string): boolean {
  return /user not found|not found|does not exist/i.test(message);
}

function safeDeletionError(error: unknown): string {
  if (!(error instanceof Error)) return "账号删除处理失败。";
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 800) || "账号删除处理失败。";
}

function getRequiredSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法处理账号删除申请。");
  return supabase;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}
