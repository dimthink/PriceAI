import {
  createFeedbackRecollectionJob,
  getAdminPasswordFromRequest,
  listOfferFeedback,
  runOfferFeedbackRiskPrecheck,
  updateOfferFeedbackStatus,
  updateOfferFeedbackRiskPrecheckVisibility,
  updateOfferFeedbackVerification,
} from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearPublicDataCache, listRawOffersByIds, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";
import { z } from "zod";

const statusSchema = z.enum(["pending", "resolved", "ignored"]);
const verificationStatusSchema = z.enum([
  "not_needed",
  "pending",
  "running",
  "auto_fixed",
  "recollection_created",
  "manual_review",
  "failed",
]);
const verificationResultSchema = z.enum([
  "offer_changed",
  "item_removed",
  "out_of_stock",
  "still_available",
  "recollection_created",
  "inconclusive",
  "blocked",
]);

const patchSchema = z.object({
  action: z.enum(["status", "verification", "recollect", "risk_precheck", "risk_visibility"]).optional(),
  id: z.string().min(1),
  status: statusSchema.optional(),
  reviewerNote: z.string().max(500).nullable().optional(),
  verificationStatus: verificationStatusSchema.optional(),
  verificationResult: verificationResultSchema.nullable().optional(),
  verificationMessage: z.string().max(500).nullable().optional(),
  riskVisibilityMode: z.enum(["hide_public", "expand_source"]).optional(),
});

export async function GET(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const { searchParams } = new URL(request.url);
    const status = statusSchema.catch("pending").parse(searchParams.get("status") || "pending");
    const feedback = await listOfferFeedback(status);
    const offers = await listRawOffersByIds(
      feedback
        .map((item) => item.offerId)
        .filter((id): id is string => Boolean(id)),
    );
    return Response.json({ ok: true, feedback, offers });
  } catch (error) {
    logApiError("admin feedback list", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载反馈失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = patchSchema.parse(await request.json());
    const action = payload.action || "status";
    if (action === "recollect") {
      const result = await createFeedbackRecollectionJob({ feedbackId: payload.id });
      clearPublicDataCache();
      return Response.json({ ok: true, feedback: result.feedback, jobId: result.jobId });
    }

    if (action === "risk_precheck") {
      const feedback = await runOfferFeedbackRiskPrecheck(payload.id);
      clearPublicDataCache();
      const snapshotRefreshQueued = await markPublicApiSnapshotsDirty(
        "admin feedback risk precheck",
        feedbackSnapshotScope(feedback),
      );
      return Response.json({ ok: true, feedback, snapshotRefreshQueued });
    }

    if (action === "risk_visibility") {
      if (!payload.riskVisibilityMode) {
        return Response.json({ ok: false, message: "缺少前台提醒操作。" }, { status: 400 });
      }
      const feedback = await updateOfferFeedbackRiskPrecheckVisibility({
        id: payload.id,
        mode: payload.riskVisibilityMode,
        reviewerNote: payload.reviewerNote || null,
      });
      clearPublicDataCache();
      const snapshotRefreshQueued = await markPublicApiSnapshotsDirty(
        "admin feedback risk visibility",
        feedbackSnapshotScope(feedback),
      );
      return Response.json({ ok: true, feedback, snapshotRefreshQueued });
    }

    if (action === "verification") {
      if (!payload.verificationStatus) {
        return Response.json({ ok: false, message: "缺少核验状态。" }, { status: 400 });
      }
      const feedback = await updateOfferFeedbackVerification({
        id: payload.id,
        verificationStatus: payload.verificationStatus,
        verificationResult: payload.verificationResult || null,
        verificationMessage: payload.verificationMessage || null,
        reviewerNote: payload.reviewerNote || null,
      });
      clearPublicDataCache();
      return Response.json({ ok: true, feedback });
    }

    if (!payload.status) {
      return Response.json({ ok: false, message: "缺少反馈处理状态。" }, { status: 400 });
    }

    const feedback = await updateOfferFeedbackStatus({
      id: payload.id,
      status: payload.status,
      reviewerNote: payload.reviewerNote || null,
    });
    clearPublicDataCache();
    const snapshotRefreshQueued = payload.status === "ignored"
      ? await markPublicApiSnapshotsDirty("admin feedback ignored", feedbackSnapshotScope(feedback))
      : false;
    return Response.json({ ok: true, feedback, snapshotRefreshQueued });
  } catch (error) {
    logApiError("admin feedback update", error);
    return Response.json(
      { ok: false, message: safeAdminFeedbackErrorMessage(error) },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

function safeAdminFeedbackErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
  if (
    message.includes("反馈核验字段尚未迁移") ||
    code === "42703" ||
    code === "PGRST204" ||
    /verification_(status|result|message|checked_at)|created_collection_job_id/.test(message)
  ) {
    return "反馈核验字段尚未迁移，请先应用 Supabase migration 后再重试。";
  }

  return safeApiErrorMessage(error, "处理反馈失败。");
}

function feedbackSnapshotScope(feedback: {
  productId?: string | null;
  productSlug?: string | null;
  offerId?: string | null;
  sourceId?: string | null;
}) {
  return {
    productIds: [feedback.productId, feedback.productSlug],
    offerIds: [feedback.offerId],
    sourceIds: [feedback.sourceId],
  };
}
