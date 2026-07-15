import { z } from "zod";
import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { accountApiErrorResponse } from "@/lib/account-api-errors";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { createUserFeedbackFollowup, feedbackFollowupSchema, listUserOfferFeedback } from "@/lib/account";
import { isSameOriginMutation, sameOriginRequiredResponse } from "@/lib/request-origin";

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
    return accountApiErrorResponse(error, "读取反馈失败。");
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
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
    return accountApiErrorResponse(error, "补充反馈失败。");
  }
}
