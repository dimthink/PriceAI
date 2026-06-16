import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { FEEDBACK_EVIDENCE_MAX_IMAGES, uploadFeedbackEvidenceImage } from "@/lib/feedback-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_UPLOADS = 30;
const uploadCounters = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request) || "anonymous";
    checkUploadRateLimit(clientIp);

    const formData = await request.formData();
    if (formData.get("website")) {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "缺少图片文件。" }, { status: 400 });
    }

    const evidence = await uploadFeedbackEvidenceImage(file);
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

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

function checkUploadRateLimit(key: string): void {
  const now = Date.now();
  const current = uploadCounters.get(key);

  if (!current || current.resetAt <= now) {
    uploadCounters.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    pruneUploadCounters(now);
    return;
  }

  if (current.count >= RATE_LIMIT_MAX_UPLOADS) {
    throw new Error("图片上传过于频繁，请稍后再试。");
  }

  current.count += 1;
}

function pruneUploadCounters(now: number): void {
  if (uploadCounters.size <= 1000) return;
  for (const [key, value] of uploadCounters) {
    if (value.resetAt <= now) uploadCounters.delete(key);
  }
}

function getErrorStatus(error: unknown): number {
  if (!(error instanceof Error)) return 500;
  if (/缺少|无效|不支持|超过|过于频繁/.test(error.message)) return 400;
  if (/尚未配置|暂不可用/.test(error.message)) return 503;
  return 500;
}
