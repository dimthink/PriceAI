import { z } from "zod";
import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { createUserFeedbackFollowup, feedbackFollowupSchema, listUserOfferFeedback } from "@/lib/account";

const postSchema = feedbackFollowupSchema.extend({
  feedbackId: z.string().trim().min(1).max(200),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const feedback = await listUserOfferFeedback(user.id);
    return Response.json({ ok: true, feedback }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "读取反馈失败。" },
      { status: 500, headers: noStoreCacheHeaders() },
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const payload = postSchema.parse(await request.json());
    const followup = await createUserFeedbackFollowup({
      userId: user.id,
      feedbackId: payload.feedbackId,
      message: payload.message,
      evidenceUrls: payload.evidenceUrls || [],
    });
    return Response.json({ ok: true, followup }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "补充内容格式不正确。" : error instanceof Error ? error.message : "补充反馈失败。";
    return Response.json({ ok: false, message }, { status: 400, headers: noStoreCacheHeaders() });
  }
}
