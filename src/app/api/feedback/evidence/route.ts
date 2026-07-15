import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import {
  consumeFeedbackEvidenceUploadQuota,
  deleteFeedbackEvidenceDraft,
  FEEDBACK_EVIDENCE_MAX_IMAGES,
  uploadFeedbackEvidenceImage,
} from "@/lib/feedback-evidence";
import {
  getPublicRequestErrorStatus,
  PUBLIC_FORM_BODY_MAX_BYTES,
  readFormDataWithLimit,
} from "@/lib/public-request";
import { isSameOriginMutation, sameOriginRequiredResponse } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_LIMIT_MAX_UPLOADS = 30;

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { ok: false, code: "auth_required", message: "登录后才能上传图片证据；低风险文字纠错仍可匿名提交。" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const quota = await consumeFeedbackEvidenceUploadQuota({
      userId: user.id,
      maxUploads: RATE_LIMIT_MAX_UPLOADS,
    });
    if (!quota.allowed) {
      return Response.json(
        { ok: false, code: "rate_limited", message: "图片上传过于频繁，请稍后再试。" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Retry-After": String(Math.max(1, quota.retryAfterSeconds)),
          },
        },
      );
    }

    const formData = await readFormDataWithLimit(request, PUBLIC_FORM_BODY_MAX_BYTES);
    if (formData.get("website")) {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "缺少图片文件。" }, { status: 400 });
    }

    const draftId = String(formData.get("draftId") || "").trim();

    const evidence = await uploadFeedbackEvidenceImage(file, { userId: user.id, draftId });
    return Response.json(
      {
        ok: true,
        evidence,
        limits: {
          maxImages: FEEDBACK_EVIDENCE_MAX_IMAGES,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    logApiError("feedback evidence upload", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "图片上传失败，请稍后再试。") },
      {
        status: getErrorStatus(error),
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { ok: false, code: "auth_required", message: "登录后才能删除图片证据草稿。" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const body = await request.json().catch(() => null) as { reference?: unknown } | null;
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!reference) {
      return Response.json({ ok: false, message: "缺少图片证据引用。" }, { status: 400 });
    }
    await deleteFeedbackEvidenceDraft(reference, user.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    logApiError("feedback evidence delete", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "图片证据删除失败，请稍后再试。") },
      { status: getErrorStatus(error), headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

function getErrorStatus(error: unknown): number {
  const publicRequestStatus = getPublicRequestErrorStatus(error);
  if (publicRequestStatus) return publicRequestStatus;
  if (!(error instanceof Error)) return 500;
  if (/登录/.test(error.message)) return 401;
  if (/缺少|无效|不支持|超过|过于频繁/.test(error.message)) return 400;
  if (/尚未配置|暂不可用/.test(error.message)) return 503;
  return 500;
}
