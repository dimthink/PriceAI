import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { getUserOfferFeedback, listUserFeedbackFollowups } from "@/lib/account";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ feedbackId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const { feedbackId } = await params;
    const feedback = await getUserOfferFeedback(user.id, feedbackId);
    if (!feedback) {
      return Response.json(
        { ok: false, message: "没有找到这条反馈，或你无权查看。" },
        { status: 404, headers: noStoreCacheHeaders() },
      );
    }
    const followups = await listUserFeedbackFollowups(user.id, feedbackId);
    return Response.json({ ok: true, feedback, followups }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "读取反馈失败。" },
      { status: 500, headers: noStoreCacheHeaders() },
    );
  }
}
