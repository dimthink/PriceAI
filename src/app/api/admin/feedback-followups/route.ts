import { z } from "zod";
import { createAdminFeedbackFollowup } from "@/lib/admin-users";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { requireAdminRequest } from "@/lib/env";

const schema = z.object({
  feedbackId: z.string().trim().min(1, "缺少反馈 ID。").max(200),
  message: z.string().trim().min(2, "补充说明至少需要 2 个字。").max(1000, "补充说明不能超过 1000 字。"),
});

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = schema.parse(await request.json());
    const followup = await createAdminFeedbackFollowup(payload);
    return Response.json({ ok: true, followup }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    logApiError("admin feedback followup", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "发送补充说明失败。") },
      { status: error instanceof z.ZodError ? 400 : 500, headers: noStoreCacheHeaders() },
    );
  }
}
